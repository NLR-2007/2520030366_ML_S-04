/* SAGE-FJD — Evidence Terminal */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const TEXT_FIELDS = [
    "title", "location", "salary_range", "company_profile", "description",
    "requirements", "benefits", "employment_type", "industry",
    "required_experience", "function",
  ];
  const FLAGS = ["has_company_logo", "has_questions", "telecommuting"];

  /* Where the scoring service lives.
     Same-origin when served by the FastAPI app; set window.SAGE_API_BASE to a
     remote backend when the frontend is hosted on its own (e.g. Vercel). */
  const API_BASE = (window.SAGE_API_BASE || "").replace(/\/$/, "");
  let LIVE = false;   // is a scoring backend actually reachable?

  /* Read-only data: prefer the live API, fall back to the bundled snapshot so
     the page is fully readable as a static site. */
  async function getJSON(name) {
    try {
      const r = await fetch(`${API_BASE}/api/${name}`, { cache: "no-store" });
      if (r.ok) { LIVE = true; return await r.json(); }
    } catch (_) { /* fall through to the static snapshot */ }
    const r2 = await fetch(`data/${name}.json`, { cache: "no-store" });
    if (!r2.ok) throw new Error(`Could not load ${name}`);
    return await r2.json();
  }
  window.__sageGetJSON = getJSON;

  let META = null;

  /* ── status ─────────────────────────────────────────── */
  function status(state, text) {
    $("statusLed").dataset.state = state;
    $("statusText").textContent = text;
  }

  /* ── boot ───────────────────────────────────────────── */
  async function boot() {
    try {
      META = await getJSON("meta");
      paintMeta(META);
    } catch (err) {
      status("error", "data unavailable");
      showError("Could not load the model summary.");
      return;
    }
    try {
      paintSamples(await getJSON("samples"));
    } catch (_) { /* samples are optional */ }

    if (LIVE) {
      status("ready", "ensemble ready");
    } else {
      status("idle", "read-only");
      $("runBtn").disabled = true;
      $("formHint").innerHTML =
        "Live scoring is off in this static build \u2014 the four-model ensemble " +
        "needs a Python backend. Every figure below is real, from the one-time test run. " +
        "<a href=\"https://github.com/NLR-2007/Fraud-Job-Detection\">Run it locally</a> to score your own postings.";
    }
  }

  /* ── meta / dossier painting ────────────────────────── */
  function paintMeta(meta) {
    const t = meta.threshold;
    $("heroThreshold").textContent = t.toFixed(4);
    $("gThreshold").textContent = t.toFixed(4);
    $("gaugeThresholdMark").style.left = (t * 100) + "%";

    const test = meta.test_metrics;
    $("heroPrec").innerHTML = (test.Precision * 100).toFixed(1) + "<i>%</i>";
    $("heroRec").innerHTML = (test.Recall * 100).toFixed(1) + "<i>%</i>";
    $("heroMcc").textContent = test.MCC.toFixed(3);

    paintMetricWall(meta);
    paintArchitecture(meta);
  }

  const METRIC_ORDER = [
    ["Accuracy", "Accuracy", false],
    ["Precision", "Precision", false],
    ["Recall", "Recall", true],
    ["F1", "F1 score", true],
    ["Specificity", "Specificity", false],
    ["Balanced_Accuracy", "Balanced acc.", false],
    ["ROC_AUC", "ROC-AUC", false],
    ["PR_AUC", "PR-AUC", true],
    ["MCC", "MCC", false],
  ];

  function paintMetricWall(meta) {
    const wall = $("metricWall");
    const test = meta.test_metrics;
    const val = meta.validation_metrics;

    wall.innerHTML = METRIC_ORDER.map(([key, label, weak], i) => {
      const v = test[key];
      const d = v - val[key];
      const sign = d >= 0 ? "+" : "−";
      const isWeak = weak && v < 0.7;
      return `<div class="metric${isWeak ? " is-weak" : ""}">
        <span class="metric-name">${label}</span>
        <span class="metric-value${isWeak ? " weak" : ""}">${v.toFixed(3)}</span>
        <span class="metric-val-track"><i data-w="${(v * 100).toFixed(1)}"></i></span>
        <span class="metric-delta">${sign}${Math.abs(d).toFixed(3)} vs validation</span>
      </div>`;
    }).join("");

    requestAnimationFrame(() => {
      wall.querySelectorAll(".metric-val-track i").forEach((bar) => {
        bar.style.width = bar.dataset.w + "%";
      });
    });
  }

  function paintArchitecture(meta) {
    const rows = meta.branches.map((b) => {
      const pct = (b.weight * 100).toFixed(1);
      return `<div class="arch-row">
        <span class="arch-name mono">${b.label}</span>
        <span class="arch-track"><i style="width:${pct}%"></i></span>
        <span class="arch-pct mono">${pct}%</span>
        <span class="arch-detail">${b.detail}</span>
      </div>`;
    }).join("");

    $("arch").innerHTML = `
      <div class="arch-head">
        <h3>Reliability weights</h3>
        <p>Each branch earns its share of the consensus from squared PR-AUC skill above prevalence,
           measured across the five group-isolated folds &mdash; the weights are derived, not hand-set.
           Lexical is the strongest single branch; campaign is the weakest, but it detects
           template reuse that none of the others can see.</p>
      </div>
      <div class="arch-rows">${rows}</div>
      <div class="arch-formula mono">
        fused = <b>${meta.meta_weight}</b> &middot; catboost_meta(36 agreement features)
        &nbsp;+&nbsp; <b>${meta.reliability_weight}</b> &middot; &Sigma;(calibrated<sub>i</sub> &times; weight<sub>i</sub>)
      </div>`;
  }

  /* ── samples ────────────────────────────────────────── */
  function paintSamples(samples) {
    const box = $("samples");
    samples.forEach((s) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.truth = s.truth;
      chip.innerHTML = `<span class="dot"></span>${s.label}`;
      chip.title = s.note;
      chip.addEventListener("click", () => {
        fill(s.posting);
        $("formHint").textContent = s.note;
        $("form").scrollIntoView({ behavior: "smooth", block: "start" });
      });
      box.appendChild(chip);
    });
  }

  function fill(posting) {
    TEXT_FIELDS.forEach((f) => {
      const el = $("f-" + f);
      if (el) el.value = posting[f] ?? "";
    });
    FLAGS.forEach((f) => {
      const el = $("f-" + f);
      if (el) el.checked = Number(posting[f]) === 1;
    });
  }

  function collect() {
    const payload = {};
    TEXT_FIELDS.forEach((f) => {
      const el = $("f-" + f);
      payload[f] = el ? el.value.trim() : "";
    });
    FLAGS.forEach((f) => {
      const el = $("f-" + f);
      payload[f] = el && el.checked ? 1 : 0;
    });
    return payload;
  }

  /* ── rendering a result ─────────────────────────────── */
  function showError(message) {
    const box = $("errorBox");
    box.textContent = message;
    box.hidden = false;
  }

  function render(result) {
    $("errorBox").hidden = true;
    $("verdictEmpty").hidden = true;
    $("verdictLive").hidden = false;

    const p = result.probability;
    const fraud = result.prediction === 1;

    /* gauge */
    const track = $("gaugeFill").parentElement;
    track.classList.toggle("is-fraud", fraud);
    $("gaugeFill").style.width = (p * 100).toFixed(2) + "%";
    $("gaugeNeedle").style.left = (p * 100).toFixed(2) + "%";
    $("gaugeValue").textContent = p.toFixed(4);
    /* keep the readout inside the track at both extremes */
    $("gaugeValue").style.transform =
      p > 0.9 ? "translateX(-100%)" : (p < 0.08 ? "translateX(0)" : "translateX(-50%)");

    /* stamp */
    const stamp = $("verdictStamp");
    stamp.className = "verdict-stamp " + (fraud ? "fraud" : "clear");
    stamp.style.animation = "none";
    void stamp.offsetWidth;
    stamp.style.animation = "";
    $("verdictWord").textContent = fraud ? "Fraudulent" : "No fraud signal";

    const margin = result.margin;
    const dist = Math.abs(margin).toFixed(4);
    $("verdictSub").textContent = fraud
      ? `${dist} above the locked threshold`
      : `${dist} below the locked threshold`;

    $("verdictExplain").innerHTML = fraud
      ? `The fused evidence clears the frozen boundary of <b>${result.threshold.toFixed(4)}</b>.
         At this operating point roughly <b>93%</b> of flags are genuine fraud &mdash; treat this as a
         strong prompt for manual review.`
      : `The fused evidence stays under the frozen boundary of <b>${result.threshold.toFixed(4)}</b>.
         Note that this model only catches <b>42%</b> of real fraud, so a clear result is
         <em>weak evidence of legitimacy</em> rather than a clean bill of health.`;

    /* witnesses */
    const list = $("witnessList");
    list.innerHTML = result.branches.map((b, i) => {
      const pct = (b.calibrated * 100).toFixed(1);
      const hot = b.calibrated >= 0.5 ? " hot" : "";
      return `<li class="witness${hot}" style="animation-delay:${0.07 * i + 0.1}s">
        <div class="witness-top">
          <span class="witness-name">${b.label}</span>
          <span class="witness-score">${b.calibrated.toFixed(4)}</span>
        </div>
        <div class="witness-bar"><i data-w="${pct}"></i></div>
        <div class="witness-foot">
          <span class="witness-role">${b.role}</span>
          <span class="witness-weight">w ${b.weight.toFixed(3)}</span>
        </div>
      </li>`;
    }).join("");

    requestAnimationFrame(() => {
      list.querySelectorAll(".witness-bar i").forEach((bar, i) => {
        setTimeout(() => { bar.style.width = bar.dataset.w + "%"; }, 120 + i * 70);
      });
    });

    /* breakdown */
    $("fbReliability").textContent = result.reliability_probability.toFixed(4);
    $("fbMeta").textContent = result.meta_probability.toFixed(4);
    $("fbTotal").textContent = p.toFixed(4);

    $("output").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /* ── submit ─────────────────────────────────────────── */
  async function submit(event) {
    event.preventDefault();
    const payload = collect();

    const hasText = ["title", "description", "requirements", "company_profile", "benefits"]
      .some((f) => payload[f]);
    if (!hasText) {
      showError("Add at least a job title or a description before convening the witnesses.");
      return;
    }

    const btn = $("runBtn");
    btn.disabled = true;
    btn.classList.add("loading");
    btn.querySelector(".btn-label").textContent = "Analysing";
    status("busy", "scoring");
    $("errorBox").hidden = true;

    try {
      const response = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.detail || `Request failed (${response.status})`);
      }
      render(await response.json());
      status("ready", "verdict returned");
    } catch (err) {
      showError(err.message || "Scoring failed.");
      status("error", "scoring failed");
    } finally {
      btn.disabled = false;
      btn.classList.remove("loading");
      btn.querySelector(".btn-label").textContent = "Analyse posting";
    }
  }

  function clear() {
    TEXT_FIELDS.forEach((f) => { const el = $("f-" + f); if (el) el.value = ""; });
    FLAGS.forEach((f) => { const el = $("f-" + f); if (el) el.checked = false; });
    $("verdictLive").hidden = true;
    $("verdictEmpty").hidden = false;
    $("errorBox").hidden = true;
    if (LIVE) {
      $("formHint").textContent = "Four models run locally \u00b7 the first call warms the encoder";
    }
  }

  /* ── reveal on scroll ───────────────────────────────── */
  function observeReveals() {
    const targets = document.querySelectorAll(".pipeline li, .cm, .sb, .caveat");
    targets.forEach((el) => { el.style.opacity = "0"; el.style.transform = "translateY(18px)"; });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.style.transition = `opacity .6s ${i * 0.05}s cubic-bezier(.2,.8,.2,1), transform .6s ${i * 0.05}s cubic-bezier(.2,.8,.2,1)`;
        el.style.opacity = "1";
        el.style.transform = "none";
        io.unobserve(el);
      });
    }, { threshold: 0.15 });
    targets.forEach((el) => io.observe(el));
  }

  /* ── init ───────────────────────────────────────────── */
  $("form").addEventListener("submit", submit);
  $("clearBtn").addEventListener("click", clear);
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) observeReveals();
  boot();
})();
