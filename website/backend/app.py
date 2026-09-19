"""SAGE-FJD evidence terminal — FastAPI service around the frozen ensemble."""
import json
import random
import threading
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from sage import SageFJD
from sage.engine import INPUT_COLUMNS

BASE = Path(__file__).resolve().parent
ARTIFACTS = BASE / "artifacts"
FRONTEND = BASE.parent / "frontend"
SAMPLES = BASE / "samples.json"
CHART_DATA = BASE / "chart_data.json"

app = FastAPI(title="SAGE-FJD Evidence Terminal", version="1.0")

# Allows a separately hosted frontend (e.g. Vercel) to reach this service.
# Read-only scoring endpoint, no credentials or cookies involved.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

_model = None
_lock = threading.Lock()


def get_model():
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                _model = SageFJD(ARTIFACTS, device="cpu")
    return _model


BRANCH_META = {
    "Lexical": {
        "key": "lexical",
        "label": "Lexical",
        "role": "Word and character TF-IDF over section-tagged text, scored by a linear SVM.",
        "detail": "80,000 word n-grams + 150,000 character n-grams",
    },
    "Metadata": {
        "key": "metadata",
        "label": "Structural",
        "role": "56 structural signals — missingness, length, punctuation, salary and risk language.",
        "detail": "CatBoost, depth 7, 233 iterations",
    },
    "Semantic": {
        "key": "semantic",
        "label": "Semantic",
        "role": "Windowed MiniLM embeddings pooled per section, plus cross-section coherence.",
        "detail": "3,850 features from 5 sections",
    },
    "Campaign": {
        "key": "campaign",
        "label": "Campaign",
        "role": "Template novelty and group-safe fraud risk against known posting campaigns.",
        "detail": "46 features, CatBoost, depth 5",
    },
}


class Posting(BaseModel):
    title: str = ""
    location: str = ""
    department: str = ""
    salary_range: str = ""
    company_profile: str = ""
    description: str = ""
    requirements: str = ""
    benefits: str = ""
    telecommuting: int = 0
    has_company_logo: int = 0
    has_questions: int = 0
    employment_type: str = ""
    required_experience: str = ""
    required_education: str = ""
    industry: str = ""
    function: str = Field(default="")


@app.get("/api/meta")
def meta():
    with open(ARTIFACTS / "SAGE_FJD_Best_Model_Summary.json") as handle:
        summary = json.load(handle)
    model = get_model()
    weights = model.reliability_weights.tolist()
    return {
        "experiment": "SAGE-FJD",
        "full_name": "Section-Aware Group-Isolated Evidence Fusion for Fraudulent Job Detection",
        "threshold": model.threshold,
        "threshold_policy": model.threshold_record["threshold_policy"],
        "test_metrics": summary["untouched_test_metrics"],
        "validation_metrics": model.threshold_record["selected_validation_metrics"],
        "meta_weight": model.meta_weight,
        "reliability_weight": model.reliability_weight,
        "branches": [
            dict(BRANCH_META[name], weight=weights[index])
            for index, name in enumerate(["Lexical", "Metadata", "Semantic", "Campaign"])
        ],
    }


@app.get("/api/samples")
def samples():
    with open(SAMPLES) as handle:
        return json.load(handle)


@app.get("/api/charts")
def charts():
    """Pre-computed curves from the one-time untouched-test evaluation."""
    with open(CHART_DATA) as handle:
        return json.load(handle)


@app.post("/api/analyze")
def analyze(posting: Posting):
    payload = posting.model_dump()
    if not any(str(payload.get(f, "")).strip() for f in
               ["title", "description", "requirements", "company_profile", "benefits"]):
        raise HTTPException(400, "Provide at least a title or description to analyse.")

    model = get_model()
    out = model.predict([payload])

    branches = []
    for index, name in enumerate(["Lexical", "Metadata", "Semantic", "Campaign"]):
        calibrated = float(out["calibrated"][0, index])
        branches.append({
            **BRANCH_META[name],
            "raw": float(np.asarray(out["raw"][name])[0]),
            "calibrated": calibrated,
            "weight": float(model.reliability_weights[index]),
            "contribution": calibrated * float(model.reliability_weights[index]),
        })

    probability = float(out["probability"][0])
    threshold = model.threshold
    return {
        "probability": probability,
        "threshold": threshold,
        "prediction": int(out["prediction"][0]),
        "verdict": "FRAUDULENT" if out["prediction"][0] == 1 else "NO FRAUD SIGNAL",
        "margin": probability - threshold,
        "meta_probability": float(out["fusion_meta_probability"][0]),
        "reliability_probability": float(out["reliability_weighted_probability"][0]),
        "branches": branches,
    }


if FRONTEND.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND / "assets"), name="assets")

    @app.get("/")
    def index():
        return FileResponse(FRONTEND / "index.html")
