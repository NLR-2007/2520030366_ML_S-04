"""Campaign branch: template-novelty and fraud-risk features against the frozen reference."""
import numpy as np
import pandas as pd

from .text_utils import normalize_template

SECTION_FIELDS = ["title", "company_profile", "description", "requirements", "benefits"]


def build_campaign_features(frame, normalized_means, reference):
    """Rebuild the 46 campaign features using the frozen training reference."""
    frame = frame.reset_index(drop=True)
    row_count = len(frame)
    base_fraud_rate = float(reference["base_fraud_rate"])

    feature_values = {}
    risk_columns = []
    support_columns = []

    for section in SECTION_FIELDS:
        section_reference = reference["sections"][section]
        row_support_map = section_reference["row_support"]
        group_support_map = section_reference["group_support"]
        risk_map = section_reference["smoothed_fraud_risk"]

        templates = frame[section].map(normalize_template).to_numpy()

        row_support = np.asarray(
            [row_support_map.get(t, 0.0) for t in templates], dtype=np.float32
        )
        group_support = np.asarray(
            [group_support_map.get(t, 0.0) for t in templates], dtype=np.float32
        )
        smoothed_risk = np.asarray(
            [risk_map.get(t, base_fraud_rate) for t in templates], dtype=np.float32
        )

        seen_template = (group_support > 0).astype(np.float32)
        risk_difference = (smoothed_risk - base_fraud_rate).astype(np.float32)

        feature_values[f"{section}_template_seen"] = seen_template
        feature_values[f"{section}_row_support_log"] = np.log1p(row_support).astype(np.float32)
        feature_values[f"{section}_group_support_log"] = np.log1p(group_support).astype(np.float32)
        feature_values[f"{section}_smoothed_fraud_risk"] = smoothed_risk
        feature_values[f"{section}_risk_minus_base"] = risk_difference

        risk_columns.append(risk_difference)
        support_columns.append(np.log1p(group_support).astype(np.float32))

        target_embeddings = normalized_means[section]
        fraud_similarity = (target_embeddings @ section_reference["fraud_centroid"]).astype(np.float32)
        genuine_similarity = (target_embeddings @ section_reference["genuine_centroid"]).astype(np.float32)

        feature_values[f"{section}_fraud_similarity"] = fraud_similarity
        feature_values[f"{section}_genuine_similarity"] = genuine_similarity
        feature_values[f"{section}_similarity_difference"] = (
            fraud_similarity - genuine_similarity
        ).astype(np.float32)

    risk_matrix = np.column_stack(risk_columns)
    support_matrix = np.column_stack(support_columns)

    feature_values["reference_base_fraud_rate"] = np.full(
        row_count, base_fraud_rate, dtype=np.float32
    )
    feature_values["template_risk_mean"] = risk_matrix.mean(axis=1).astype(np.float32)
    feature_values["template_risk_max"] = risk_matrix.max(axis=1).astype(np.float32)
    feature_values["template_risk_std"] = risk_matrix.std(axis=1).astype(np.float32)
    feature_values["template_support_mean"] = support_matrix.mean(axis=1).astype(np.float32)
    feature_values["template_support_max"] = support_matrix.max(axis=1).astype(np.float32)

    return pd.DataFrame(feature_values).replace([np.inf, -np.inf], 0).fillna(0)
