# SAGE-FJD — Fraudulent Job Detection

A web interface for **SAGE-FJD** (*Section-Aware Group-Isolated Evidence Fusion for
Fraudulent Job Detection*) — the best model in this project — serving the frozen
research ensemble live, with no retraining and no threshold changes.

---

## Why this model

SAGE-FJD was selected over every classical baseline. On the matched leakage-safe
validation split it wins on all three pre-registered primary metrics:

| Metric | Best leakage-safe baseline | SAGE-FJD | Δ |
|---|---|---|---|
| **F1** | 0.8326 | **0.8458** | +0.0132 |
| **PR-AUC** | 0.8391 | **0.8594** | +0.0203 |
| **MCC** | 0.8384 | **0.8478** | +0.0094 |

It is not a single estimator. Four independent branches score the posting, each is
Platt-calibrated, and a CatBoost meta-model fuses them together with a
reliability-weighted consensus:

| Branch | Representation | Classifier | Reliability weight |
|---|---|---|---|
| Lexical | Word (80k) + character (150k) TF-IDF over section-tagged text | LinearSVC | 0.352 |
| Structural | 56 metadata signals (missingness, length, punctuation, salary, risk language) | CatBoost d7 | 0.273 |
| Semantic | Windowed MiniLM embeddings, mean/max pooled per section + cross-section cosines (3,850 features) | LogisticRegression | 0.229 |
| Campaign | 46 template-novelty and group-safe fraud-risk features | CatBoost d5 | 0.145 |

```
fused = 0.7 · catboost_meta(36 agreement features) + 0.3 · Σ(calibrated_i × weight_i)
verdict = fused ≥ 0.7386570124651071
```

---

## Honest performance

Every number is from the **single** one-time evaluation on the untouched test split
(2,680 postings, 128 fraudulent).

| | Locked validation | Untouched test |
|---|---|---|
| Accuracy | 0.9869 | 0.9709 |
| Precision | 0.9796 | 0.9310 |
| **Recall** | 0.7442 | **0.4219** |
| F1 | 0.8458 | 0.5806 |
| PR-AUC | 0.8594 | 0.6489 |
| MCC | 0.8478 | 0.6160 |

Confusion on test: **TN 2,548 · FP 4 · FN 74 · TP 54**

**Read this before using it.** The threshold was chosen to maximise validation F1
subject to precision ≥ 0.90. That buys high precision at the cost of recall: a flag
is right ~93% of the time, but the model misses ~58% of real fraud. A "no fraud
signal" result is *weak evidence of legitimacy*, not a clean bill of health. The site
says this in the UI, on purpose. Recall also drops sharply from validation to test,
which is the honest signature of campaign-isolated splitting — near-duplicate fraud
campaigns never straddle the split, so nothing can be solved by memorisation.

---

## Reproduction guarantee

The serving code in [`backend/sage/`](backend/sage/) is a re-implementation of the frozen
training pipeline. It is verified against the saved Run-5 predictions for all 2,680
test rows — every branch score, every calibrated probability, and the fused output:

```bash
cd backend
python verify_reproduction.py \
  --dataset   /path/to/fake_job_postings.csv \
  --reference /path/to/sage_fjd_one_time_test_predictions.csv
```

Result: **100.0000% label agreement**, max absolute difference `2e-16` on the
TF-IDF/CatBoost branches and `7.8e-07` on the semantic branch (float32 GPU-vs-CPU
drift in the sentence encoder — numerically identical in practice).

---

## Running it

```bash
pip install -r requirements.txt

# Windows
./run.ps1
# macOS / Linux
./run.sh
```

Then open <http://127.0.0.1:8000>.

The first launch downloads `sentence-transformers/all-MiniLM-L6-v2` (~90 MB) from the
Hugging Face hub; everything after that is local. Model load takes ~7 s, and a single
posting scores in **0.1–0.4 s** on CPU.

### API

| Route | Method | Purpose |
|---|---|---|
| `/api/meta` | GET | Threshold, branch metadata, reliability weights, validation + test metrics |
| `/api/samples` | GET | Five real cases from the untouched test split |
| `/api/charts` | GET | ROC, PR, threshold sweep, distribution, calibration and gap data |
| `/api/analyze` | POST | Score a posting; returns per-branch evidence and the fused verdict |

```bash
curl -X POST http://127.0.0.1:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"title":"Data Entry — Work From Home","description":"Earn $400 daily, no experience required."}'
```

All 16 EMSCAD input fields are accepted; anything omitted is treated as missing, which
is itself a signal the structural branch uses.

---

## The charts

Six figures on the Performance section, all computed from the one-time test
evaluation and served from `backend/chart_data.json`:

| Figure | What it is for |
|---|---|
| Precision–recall curves | The honest comparison at 4.78% prevalence. Fusion (AP 0.649) leads every branch — this is the metric the model was selected on. |
| ROC curves | Shown for completeness, and to make a point: the Structural branch alone scores a *higher* ROC-AUC (0.920) than the fusion (0.889). ROC flatters everything at this class balance. |
| Threshold sweep | Precision, recall and F1 at every cut-off, with the locked line marked. Shows the recall given up to hold precision ≥ 0.90. |
| Score distribution | Where genuine and fraudulent postings land. The fraud mass left of the lock is the 74 false negatives. |
| Calibration curve | Whether the number is trustworthy as a probability, not just as a ranking. |
| Validation → test dumbbell | Every metric on both splits. Recall falls 0.32; accuracy barely moves. |

All figures are **strictly monochrome**. Series identity is carried by three
redundant channels — lightness step, dash pattern, and a labelled legend — so
nothing depends on colour. They stay readable when printed in black and white,
and for colourblind readers, by construction rather than by luck. A collapsible
table view under the charts exposes the underlying numbers.

---

## Deploying

### Frontend (Vercel, Netlify, GitHub Pages)

The frontend runs as a **static site**. `frontend/data/` holds a snapshot of the
read-only endpoints, so every metric, sample case and chart renders with no
backend at all; live scoring simply switches itself off and says so.

On Vercel, import the repo and accept the defaults — `vercel.json` sets the output
directory to `frontend`. No framework preset, no build step.

To point the deployed frontend at a running backend, add one line before the
scripts in `frontend/index.html`:

```html
<script>window.SAGE_API_BASE = "https://your-backend.example.com";</script>
```

The page then uses the live API and re-enables the analyser. CORS is already open
on the backend for `GET` and `POST`.

### Backend (not Vercel)

The scoring service **cannot** run on Vercel or similar serverless platforms:

| | This app | Vercel limit |
|---|---|---|
| Dependencies on disk | 1,246 MB | 250 MB |
| RAM at runtime | 625 MB | 1,024 MB |
| Cold model load | 8.0 s | 10 s (Hobby) |

`torch` alone is 520 MB and CatBoost another 345 MB, so the bundle exceeds the cap
several times over regardless of plan or preset. It needs a container host with
~1 GB RAM — Hugging Face Spaces (Docker), Google Cloud Run, Railway or Fly.io all
work. Warm inference is 0.14 s once loaded.

---

## Layout

```
Website/
├── backend/
│   ├── app.py                    FastAPI service
│   ├── chart_data.json           pre-computed curves from the test evaluation
│   ├── verify_reproduction.py    exactness check against the frozen run
│   ├── samples.json              five real test-split cases
│   ├── artifacts/                the 15 frozen model files (13 MB)
│   └── sage/
│       ├── engine.py             loads the ensemble, runs the locked scoring path
│       ├── text_utils.py         cleaning shared with the training source
│       ├── metadata_branch.py    the 56 structural features
│       ├── semantic_branch.py    windowing, pooling, cross-section cosines
│       ├── campaign_branch.py    the 46 template-risk features
│       └── fusion.py             calibration, 36 fusion features, blend
└── frontend/
    ├── index.html
    └── assets/{style.css, app.js, charts.js}
```

The artifacts are frozen. `post_test_tuning_allowed` is `false` in the deployment
freeze — retraining or moving the threshold invalidates the reported test result.

---

*Research prototype. Screening aid only — not a hiring or legal decision system.*
