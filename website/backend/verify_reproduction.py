"""Verify that this serving engine reproduces the frozen SAGE-FJD test run exactly.

Re-scores all 2,680 untouched-test postings through the same code path the website
uses and compares every intermediate against the saved Run-5 predictions.

Usage:
    python verify_reproduction.py --dataset PATH/fake_job_postings.csv \
                                  --reference PATH/sage_fjd_one_time_test_predictions.csv
"""
import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from sage import SageFJD

COLUMNS = [
    ("lexical_raw_score", lambda o: o["raw"]["Lexical"]),
    ("metadata_raw_score", lambda o: o["raw"]["Metadata"]),
    ("semantic_raw_score", lambda o: o["raw"]["Semantic"]),
    ("campaign_raw_score", lambda o: o["raw"]["Campaign"]),
    ("lexical_calibrated", lambda o: o["calibrated"][:, 0]),
    ("metadata_calibrated", lambda o: o["calibrated"][:, 1]),
    ("semantic_calibrated", lambda o: o["calibrated"][:, 2]),
    ("campaign_calibrated", lambda o: o["calibrated"][:, 3]),
    ("reliability_weighted_probability", lambda o: o["reliability_weighted_probability"]),
    ("fusion_meta_probability", lambda o: o["fusion_meta_probability"]),
    ("sage_fjd_fusion_probability", lambda o: o["probability"]),
]

# Float32 GPU/CPU drift in the sentence encoder makes bit-exactness impossible;
# anything under this is numerically identical for every practical purpose.
TOLERANCE = 1e-5


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--reference", required=True, type=Path)
    parser.add_argument("--artifacts", default=Path(__file__).parent / "artifacts", type=Path)
    args = parser.parse_args()

    dataset = pd.read_csv(args.dataset)
    reference = pd.read_csv(args.reference)
    test = dataset.set_index("job_id").loc[reference["job_id"]].reset_index()

    print(f"Scoring {len(test)} untouched-test postings through the serving engine...")
    model = SageFJD(args.artifacts, device="cpu")
    out = model.predict(test.to_dict("records"), batch_size=128)

    print(f"\n{'COLUMN':<38} {'MAX ABS DIFF':>14}   STATUS")
    failures = 0
    for name, getter in COLUMNS:
        diff = np.abs(np.asarray(getter(out)) - reference[name].to_numpy()).max()
        ok = diff < TOLERANCE
        failures += (not ok)
        print(f"{name:<38} {diff:>14.3e}   {'ok' if ok else 'MISMATCH'}")

    agreement = (out["prediction"] == reference["sage_fjd_prediction"].to_numpy()).mean()
    print(f"\nLabel agreement with the frozen run: {agreement * 100:.4f}%")

    if failures or agreement < 1.0:
        print("\nFAILED — the serving engine diverges from the frozen run.")
        return 1
    print("PASSED — the serving engine reproduces the frozen run.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
