"""SAGE-FJD inference engine.

Section-Aware Group-Isolated Evidence Fusion for Fraudulent Job Detection.
Loads the frozen four-branch ensemble and reproduces the locked scoring path
exactly as it was evaluated on the untouched test split.
"""
import json
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import scipy.sparse as sp
from catboost import CatBoostClassifier

from .campaign_branch import build_campaign_features
from .fusion import BRANCH_NAMES, apply_calibrator, build_fusion_features
from .metadata_branch import build_metadata
from .semantic_branch import SemanticBranch
from .text_utils import clean_text_series

warnings.filterwarnings("ignore", category=UserWarning)

INPUT_COLUMNS = [
    "title", "location", "department", "salary_range", "company_profile",
    "description", "requirements", "benefits", "telecommuting",
    "has_company_logo", "has_questions", "employment_type",
    "required_experience", "required_education", "industry", "function",
]


class SageFJD:
    """The frozen SAGE-FJD ensemble, ready for inference."""

    def __init__(self, artifact_directory, device="cpu"):
        directory = Path(artifact_directory)
        self.directory = directory

        self.lexical = joblib.load(directory / "sage_fjd_final_lexical_bundle.joblib")

        self.metadata_model = CatBoostClassifier()
        self.metadata_model.load_model(str(directory / "sage_fjd_final_metadata_model.cbm"))
        self.metadata_columns = list(self.metadata_model.feature_names_)

        self.semantic = SemanticBranch(
            joblib.load(directory / "sage_fjd_final_semantic_model.joblib"), device=device
        )

        self.campaign_model = CatBoostClassifier()
        self.campaign_model.load_model(str(directory / "sage_fjd_final_campaign_model.cbm"))
        self.campaign_columns = list(self.campaign_model.feature_names_)
        self.campaign_reference = joblib.load(
            directory / "sage_fjd_final_campaign_reference.joblib"
        )

        self.fusion_bundle = joblib.load(directory / "sage_fjd_final_fusion_bundle.joblib")
        self.meta_model = CatBoostClassifier()
        self.meta_model.load_model(str(directory / "sage_fjd_final_fusion_meta_model.cbm"))

        self.reliability_weights = np.asarray(
            self.fusion_bundle["reliability_weights"], dtype=np.float64
        )
        self.meta_weight = float(self.fusion_bundle["meta_model_weight"])
        self.reliability_weight = float(self.fusion_bundle["reliability_score_weight"])
        self.fusion_feature_names = list(self.fusion_bundle["fusion_feature_names"])

        with open(directory / "sage_fjd_locked_test_threshold.json") as handle:
            self.threshold_record = json.load(handle)
        self.threshold = float(self.threshold_record["locked_test_threshold"])

    # -- individual branches -------------------------------------------------

    def _lexical_scores(self, frame):
        combined = pd.Series("", index=frame.index, dtype="object")
        for field in self.lexical["text_columns"]:
            combined = combined + " __" + field + "__ " + clean_text_series(frame[field])
        documents = combined.str.strip().to_numpy()

        matrix = sp.hstack(
            [
                self.lexical["word_vectorizer"].transform(documents),
                self.lexical["character_vectorizer"].transform(documents),
            ],
            format="csr",
        )
        return self.lexical["classifier"].decision_function(matrix)

    # -- public API ----------------------------------------------------------

    @staticmethod
    def prepare(records):
        """Coerce one dict or a list of dicts into the expected input frame."""
        if isinstance(records, dict):
            records = [records]
        frame = pd.DataFrame(records)
        for column in INPUT_COLUMNS:
            if column not in frame.columns:
                frame[column] = np.nan
        return frame[INPUT_COLUMNS].reset_index(drop=True)

    def predict(self, records, batch_size=64):
        """Score postings and return per-branch evidence plus the fused verdict."""
        frame = self.prepare(records)

        lexical_raw = self._lexical_scores(frame)

        metadata_frame = build_metadata(frame)[self.metadata_columns]
        metadata_raw = self.metadata_model.predict_proba(metadata_frame)[:, 1]

        semantic_features, normalized_means = self.semantic.encode(frame, batch_size=batch_size)
        semantic_raw = self.semantic.predict(semantic_features)

        campaign_frame = build_campaign_features(
            frame, normalized_means, self.campaign_reference
        )[self.campaign_columns]
        campaign_raw = self.campaign_model.predict_proba(campaign_frame)[:, 1]

        raw_scores = {
            "Lexical": lexical_raw,
            "Metadata": metadata_raw,
            "Semantic": semantic_raw,
            "Campaign": campaign_raw,
        }

        calibrated = np.column_stack([
            apply_calibrator(
                self.fusion_bundle["calibrators"][name], name, raw_scores[name]
            )
            for name in BRANCH_NAMES
        ])

        fusion_features = build_fusion_features(calibrated, self.reliability_weights)
        fusion_features = fusion_features[self.fusion_feature_names]

        meta_probability = self.meta_model.predict_proba(fusion_features)[:, 1]
        reliability_probability = calibrated @ self.reliability_weights

        fused = (
            self.meta_weight * meta_probability
            + self.reliability_weight * reliability_probability
        )

        return {
            "raw": raw_scores,
            "calibrated": calibrated,
            "reliability_weighted_probability": reliability_probability,
            "fusion_meta_probability": meta_probability,
            "probability": fused,
            "prediction": (fused >= self.threshold).astype(int),
            "threshold": self.threshold,
        }
