"""Section-aware semantic branch: windowed MiniLM embeddings + logistic regression."""
import numpy as np
from sentence_transformers import SentenceTransformer

from .text_utils import clean_semantic_text


class SemanticBranch:
    """Reproduces the frozen Step-5 semantic view."""

    def __init__(self, bundle, device="cpu"):
        self.bundle = bundle
        self.sections = bundle["section_fields"]
        self.max_windows = bundle["maximum_section_windows"]
        self.window_tokens = bundle["window_tokens"]
        self.window_stride = bundle["window_stride"]
        self.dimension = bundle["embedding_dimension"]
        self.classifier = bundle["classifier"]
        self.model = SentenceTransformer(bundle["embedding_model"], device=device)
        self.model.max_seq_length = 256
        self.tokenizer = self.model.tokenizer

    def _token_windows(self, text, section_name):
        if not text:
            return [f"[EMPTY {section_name.upper()}]"]

        token_ids = self.tokenizer(
            text, add_special_tokens=False, truncation=False
        )["input_ids"]

        if len(token_ids) <= self.window_tokens:
            return [text]

        window_starts = list(range(0, len(token_ids), self.window_stride))
        final_start = max(0, len(token_ids) - self.window_tokens)
        if final_start not in window_starts:
            window_starts.append(final_start)
        window_starts = sorted(set(window_starts))

        maximum_windows = self.max_windows[section_name]
        if len(window_starts) > maximum_windows:
            selected = np.linspace(
                0, len(window_starts) - 1, maximum_windows
            ).round().astype(int)
            window_starts = [window_starts[position] for position in selected]

        windows = []
        for start in window_starts:
            decoded = self.tokenizer.decode(
                token_ids[start:start + self.window_tokens],
                skip_special_tokens=True,
                clean_up_tokenization_spaces=True,
            ).strip()
            if decoded:
                windows.append(decoded)

        return windows or [f"[EMPTY {section_name.upper()}]"]

    def encode(self, frame, batch_size=64):
        """Return (semantic_features, normalized_section_means)."""
        frame = frame.reset_index(drop=True)
        row_count = len(frame)

        pooled_sections = []
        normalized_means = {}

        for section in self.sections:
            values = frame[section].map(clean_semantic_text).tolist()

            all_windows = []
            window_owners = []
            for position, text in enumerate(values):
                windows = self._token_windows(text, section)
                all_windows.extend(windows)
                window_owners.extend([position] * len(windows))
            window_owners = np.asarray(window_owners, dtype=np.int32)

            embeddings = self.model.encode(
                all_windows,
                batch_size=batch_size,
                show_progress_bar=False,
                convert_to_numpy=True,
                normalize_embeddings=True,
            ).astype(np.float32)

            mean_pool = np.zeros((row_count, self.dimension), dtype=np.float32)
            np.add.at(mean_pool, window_owners, embeddings)
            counts = np.bincount(window_owners, minlength=row_count).astype(np.float32)
            mean_pool /= counts[:, None]

            max_pool = np.full((row_count, self.dimension), -np.inf, dtype=np.float32)
            np.maximum.at(max_pool, window_owners, embeddings)
            max_pool[~np.isfinite(max_pool)] = 0.0

            norms = np.linalg.norm(mean_pool, axis=1, keepdims=True)
            normalized_means[section] = (
                mean_pool / np.clip(norms, 1e-8, None)
            ).astype(np.float32)

            pooled_sections.append(
                np.concatenate([mean_pool, max_pool], axis=1).astype(np.float32)
            )

        similarities = []
        for first in range(len(self.sections)):
            for second in range(first + 1, len(self.sections)):
                similarities.append(
                    np.sum(
                        normalized_means[self.sections[first]]
                        * normalized_means[self.sections[second]],
                        axis=1,
                        keepdims=True,
                    ).astype(np.float32)
                )

        features = np.concatenate(pooled_sections + similarities, axis=1).astype(np.float32)
        return features, normalized_means

    def predict(self, features):
        return self.classifier.predict_proba(features)[:, 1]
