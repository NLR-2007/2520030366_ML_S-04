"""Reliability-aware fusion layer: Platt calibration, 36 fusion features, blended output."""
import numpy as np
import pandas as pd

BRANCH_NAMES = ["Lexical", "Metadata", "Semantic", "Campaign"]


def calibration_input(branch_name, scores):
    scores = np.asarray(scores, dtype=np.float64)
    if branch_name == "Lexical":
        return scores.reshape(-1, 1)
    clipped = np.clip(scores, 1e-6, 1 - 1e-6)
    return np.log(clipped / (1 - clipped)).reshape(-1, 1)


def apply_calibrator(calibrator, branch_name, scores):
    return calibrator.predict_proba(calibration_input(branch_name, scores))[:, 1]


def build_fusion_features(calibrated_scores, reliability_weights):
    """Rebuild the 36 dynamic fusion features."""
    calibrated_scores = np.asarray(calibrated_scores, dtype=np.float64)
    reliability_weights = np.asarray(reliability_weights, dtype=np.float64)

    clipped = np.clip(calibrated_scores, 1e-6, 1 - 1e-6)
    logits = np.log(clipped / (1 - clipped))
    confidence = np.abs(calibrated_scores - 0.5) * 2

    feature_values = {}
    for index, branch_name in enumerate(BRANCH_NAMES):
        name = branch_name.lower()
        feature_values[f"{name}_calibrated"] = calibrated_scores[:, index]
        feature_values[f"{name}_logit"] = logits[:, index]
        feature_values[f"{name}_confidence"] = confidence[:, index]
        feature_values[f"{name}_weighted_contribution"] = (
            calibrated_scores[:, index] * reliability_weights[index]
        )

    score_minimum = calibrated_scores.min(axis=1)
    score_maximum = calibrated_scores.max(axis=1)

    feature_values["view_score_mean"] = calibrated_scores.mean(axis=1)
    feature_values["view_score_standard_deviation"] = calibrated_scores.std(axis=1)
    feature_values["view_score_minimum"] = score_minimum
    feature_values["view_score_maximum"] = score_maximum
    feature_values["view_score_range"] = score_maximum - score_minimum
    feature_values["reliability_weighted_score"] = calibrated_scores @ reliability_weights
    feature_values["reliability_weighted_confidence"] = confidence @ reliability_weights
    feature_values["fraud_vote_count"] = (calibrated_scores >= 0.5).sum(axis=1)

    for first in range(len(BRANCH_NAMES)):
        for second in range(first + 1, len(BRANCH_NAMES)):
            first_name = BRANCH_NAMES[first].lower()
            second_name = BRANCH_NAMES[second].lower()
            feature_values[f"{first_name}_{second_name}_absolute_difference"] = np.abs(
                calibrated_scores[:, first] - calibrated_scores[:, second]
            )
            feature_values[f"{first_name}_{second_name}_interaction"] = (
                calibrated_scores[:, first] * calibrated_scores[:, second]
            )

    return pd.DataFrame(feature_values)
