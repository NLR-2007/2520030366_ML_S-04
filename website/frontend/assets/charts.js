/* SAGE-FJD — evidence charts.
   Strictly monochrome, as the rest of the page is. Series identity is carried
   by THREE redundant channels — lightness step, dash pattern, and a direct
   label/legend — so nothing depends on colour. That makes it colourblind-safe
   and print-safe by construction, which is how journals draw these. */
(() => {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";

  const C = {
    ink: "#111111", ink2: "#3d3d3b", ink3: "#6b6b67",
    muted: "#8c8c87", line3: "#a8a8a2",
    grid: "#ececea", axis: "#cfcfca",
    paper: "#ffffff", paper3: "#f4f4f2",
  };
  /* lightness step + dash pattern per series */
  const SERIES = {
    Fusion:     { color: "#111111", dash: "",            width: 2.6 },
    Lexical:    { color: "#3d3d3b", dash: "7 3",         width: 1.7 },
    Structural: { color: "#6b6b67", dash: "2 3",         width: 1.7 },
    Semantic:   { color: "#8c8c87", dash: "10 3 2 3",    width: 1.7 },
    Campaign:   { color: "#b4b4ae", dash: "",            width: 1.7 },
  };
  const BRANCH_COLOR = Object.fromEntries(
    Object.entries(SERIES).map(([k, v]) => [k, v.color]));
  const ORDER = ["Fusion", "Lexical", "Structural", "Semantic", "Campaign"];

  const el = (tag, attrs = {}, parent = null) => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  };

  /* ── figure scaffold ─────────────────────────────────── */
  function figure(mount, { title, subtitle, note, height = 300 }) {
    const fig = document.createElement("figure");
    fig.className = "chart";
    fig.innerHTML = `
      <figcaption>
        <h3>${title}</h3>
        ${subtitle ? `<p>${subtitle}</p>` : ""}
      </figcaption>
      <div class="chart-body"></div>
      <div class="chart-legend"></div>
      ${note ? `<p class="chart-note">${note}</p>` : ""}`;
    mount.appendChild(fig);

    const body = fig.querySelector(".chart-body");
    const W = 720, H = height, M = { t: 14, r: 18, b: 40, l: 52 };
    const svg = el("svg", {
      viewBox: `0 0 ${W} ${H}`, class: "chart-svg",
      preserveAspectRatio: "xMidYMid meet", role: "img",
    }, body);

    return {
      fig, svg, W, H, M,
      iw: W - M.l - M.r,
      ih: H - M.t - M.b,
      legend: fig.querySelector(".chart-legend"),
    };
  }

  function swatch(color, dash, width = 2, shape = "line") {
    if (shape === "hollow" || shape === "filled") {
      const fill = shape === "filled" ? color : "#ffffff";
      const stroke = shape === "filled" ? "#ffffff" : "#6b6b67";
      return `<svg class="lg-swatch" viewBox="0 0 22 12" aria-hidden="true">
        <circle cx="11" cy="6" r="4.5" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/></svg>`;
    }
    if (shape === "block") {
      return `<svg class="lg-swatch" viewBox="0 0 22 12" aria-hidden="true">
        <rect x="4" y="2" width="14" height="8" rx="1.5" fill="${color}"/></svg>`;
    }
    return `<svg class="lg-swatch" viewBox="0 0 22 8" aria-hidden="true">
      <line x1="1" y1="4" x2="21" y2="4" stroke="${color}" stroke-width="${width}"
        ${dash ? `stroke-dasharray="${dash}"` : ""} stroke-linecap="round"/></svg>`;
  }
  function legendItems(box, items) {
    box.innerHTML = items.map(([label, color, extra, dash, width, shape]) =>
      `<span class="lg">${swatch(color, dash || "", width || 2, shape || "line")}${label}${
        extra ? `<b>${extra}</b>` : ""}</span>`).join("");
  }

  /* ── axes ────────────────────────────────────────────── */
  function axes(ctx, opts) {
    const { svg, M, iw, ih } = ctx;
    const { xTicks, yTicks, xLabel, yLabel, xFmt = String, yFmt = String } = opts;
    const g = el("g", { transform: `translate(${M.l},${M.t})` }, svg);

    yTicks.forEach((t) => {
      const y = ih - t.p * ih;
      el("line", { x1: 0, y1: y, x2: iw, y2: y, stroke: C.grid, "stroke-width": 1 }, g);
      const tx = el("text", {
        x: -10, y: y + 4, "text-anchor": "end", class: "ax-tick",
      }, g);
      tx.textContent = yFmt(t.v);
    });
    xTicks.forEach((t) => {
      const x = t.p * iw;
      el("line", { x1: x, y1: 0, x2: x, y2: ih, stroke: C.grid, "stroke-width": 1 }, g);
      const tx = el("text", { x, y: ih + 20, "text-anchor": "middle", class: "ax-tick" }, g);
      tx.textContent = xFmt(t.v);
    });

    el("line", { x1: 0, y1: ih, x2: iw, y2: ih, stroke: C.axis, "stroke-width": 1 }, g);
    el("line", { x1: 0, y1: 0, x2: 0, y2: ih, stroke: C.axis, "stroke-width": 1 }, g);

    if (xLabel) {
      const t = el("text", { x: iw / 2, y: ih + 36, "text-anchor": "middle", class: "ax-label" }, g);
      t.textContent = xLabel;
    }
    if (yLabel) {
      const t = el("text", {
        transform: `translate(${-38},${ih / 2}) rotate(-90)`,
        "text-anchor": "middle", class: "ax-label",
      }, g);
      t.textContent = yLabel;
    }
    return g;
  }

  const linTicks = (n = 5) =>
    Array.from({ length: n }, (_, i) => ({ v: i / (n - 1), p: i / (n - 1) }));

  /* ── shared hover tooltip ────────────────────────────── */
  let tip;
  function tooltip() {
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "chart-tip";
      tip.hidden = true;
      document.body.appendChild(tip);
    }
    return tip;
  }
  function showTip(event, html) {
    const t = tooltip();
    t.innerHTML = html;
    t.hidden = false;
    const pad = 14;
    let x = event.clientX + pad, y = event.clientY + pad;
    const r = t.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = event.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = event.clientY - r.height - pad;
    t.style.left = `${x}px`;
    t.style.top = `${y}px`;
  }
  const hideTip = () => { if (tip) tip.hidden = true; };

  /* ── curve charts (ROC / PR) ─────────────────────────── */
  function curveChart(mount, data, kind) {
    const isRoc = kind === "roc";
    const ctx = figure(mount, {
      title: isRoc ? "ROC curves — fusion vs each branch"
                   : "Precision–recall curves — fusion vs each branch",
      subtitle: isRoc
        ? "Untouched test split, n = 2,680. The diagonal is chance."
        : "Untouched test split. The dashed floor is the 4.78% fraud prevalence — the score a coin-flip classifier would get.",
      note: isRoc
        ? "ROC flatters every model at this class balance: with 2,552 genuine postings, even a weak detector keeps a low false-positive rate. Note the Structural branch alone scores a <b>higher ROC-AUC than the fusion</b>. That is why ROC-AUC was not the selection metric."
        : "This is the honest view at 4.78% prevalence, and the one the model was selected on. The fusion (<b>0.649</b>) leads every individual branch — the ensemble earns its complexity here, not on ROC.",
      height: 340,
    });
    const g = axes(ctx, {
      xTicks: linTicks(), yTicks: linTicks(),
      xLabel: isRoc ? "False positive rate" : "Recall",
      yLabel: isRoc ? "True positive rate" : "Precision",
      xFmt: (v) => v.toFixed(2), yFmt: (v) => v.toFixed(2),
    });
    const { iw, ih } = ctx;
    const X = (v) => v * iw, Y = (v) => ih - v * ih;

    if (isRoc) {
      el("line", { x1: 0, y1: ih, x2: iw, y2: 0, stroke: C.axis,
        "stroke-width": 1.5, "stroke-dasharray": "3 5" }, g);
    } else {
      const y = Y(data.prevalence);
      el("line", { x1: 0, y1: y, x2: iw, y2: y, stroke: C.axis,
        "stroke-width": 1.5, "stroke-dasharray": "3 5" }, g);
    }

    const src = isRoc ? data.roc : data.pr;
    // draw branches first so the bone fusion line sits on top
    [...ORDER].reverse().forEach((name) => {
      const s = src[name];
      if (!s) return;
      const d = s.points.map((p, i) =>
        `${i ? "L" : "M"}${X(p[0]).toFixed(2)},${Y(p[1]).toFixed(2)}`).join("");
      const spec = SERIES[name];
      const attrs = {
        d, fill: "none", stroke: spec.color, "stroke-width": spec.width,
        "stroke-linejoin": "round", "stroke-linecap": "round", class: "curve",
      };
      if (spec.dash) attrs["stroke-dasharray"] = spec.dash;
      el("path", attrs, g);
    });

    legendItems(ctx.legend, ORDER.filter((n) => src[n]).map((n) =>
      [n, SERIES[n].color, (isRoc ? "AUC " : "AP ") + src[n].auc.toFixed(3),
       SERIES[n].dash, SERIES[n].width]));

    // hover: nearest x across all series
    const hit = el("rect", { x: 0, y: 0, width: iw, height: ih, fill: "transparent",
      style: "cursor:crosshair" }, g);
    const rule = el("line", { x1: 0, y1: 0, x2: 0, y2: ih, stroke: C.ink3,
      "stroke-width": 1, "stroke-dasharray": "2 3", opacity: 0 }, g);

    hit.addEventListener("mousemove", (ev) => {
      const box = ctx.svg.getBoundingClientRect();
      const scale = ctx.W / box.width;
      const px = (ev.clientX - box.left) * scale - ctx.M.l;
      const xv = Math.max(0, Math.min(1, px / iw));
      rule.setAttribute("x1", px); rule.setAttribute("x2", px);
      rule.setAttribute("opacity", 1);

      const rows = ORDER.filter((n) => src[n]).map((n) => {
        const pts = src[n].points;
        let best = pts[0], bd = Infinity;
        for (const p of pts) {
          const d = Math.abs(p[0] - xv);
          if (d < bd) { bd = d; best = p; }
        }
        return `<tr><td><i style="background:${BRANCH_COLOR[n]}"></i>${n}</td>
                <td>${best[1].toFixed(3)}</td></tr>`;
      }).join("");
      showTip(ev, `<div class="tip-head">${isRoc ? "FPR" : "Recall"} ≈ ${xv.toFixed(2)}</div>
        <table><thead><tr><th></th><th>${isRoc ? "TPR" : "Precision"}</th></tr></thead>
        <tbody>${rows}</tbody></table>`);
    });
    hit.addEventListener("mouseleave", () => { rule.setAttribute("opacity", 0); hideTip(); });
  }

  /* ── threshold sweep ─────────────────────────────────── */
  function sweepChart(mount, data) {
    const ctx = figure(mount, {
      title: "Why the threshold sits at 0.7387",
      subtitle: "Precision, recall and F1 across every possible cut-off, measured on the untouched test split.",
      note: "The locked line was chosen on <b>validation</b> under a precision ≥ 0.90 rule, then frozen. Plotted against test data it sits right of the F1 peak — the cost of that guardrail is visible as the recall the model gives up to keep false alarms near zero.",
      height: 330,
    });
    const g = axes(ctx, {
      xTicks: linTicks(), yTicks: linTicks(),
      xLabel: "Decision threshold", yLabel: "Score",
      xFmt: (v) => v.toFixed(2), yFmt: (v) => v.toFixed(2),
    });
    const { iw, ih } = ctx;
    const X = (v) => v * iw, Y = (v) => ih - v * ih;
    const S = data.sweep;

    const lines = [
      ["Precision", 1, "#6b6b67", "7 3"],
      ["Recall",    2, "#8c8c87", "2 3"],
      ["F1",        3, "#111111", ""],
    ];
    lines.forEach(([, idx, color, dash]) => {
      const d = S.map((r, i) => `${i ? "L" : "M"}${X(r[0]).toFixed(2)},${Y(r[idx]).toFixed(2)}`).join("");
      const a = { d, fill: "none", stroke: color, "stroke-width": idx === 3 ? 2.4 : 1.8,
        "stroke-linejoin": "round", class: "curve" };
      if (dash) a["stroke-dasharray"] = dash;
      el("path", a, g);
    });

    // the locked threshold
    const lx = X(data.threshold);
    el("line", { x1: lx, y1: 0, x2: lx, y2: ih, stroke: C.ink,
      "stroke-width": 1.5, "stroke-dasharray": "4 4" }, g);
    const lab = el("text", { x: lx - 7, y: 13, "text-anchor": "end", class: "ax-mark" }, g);
    lab.textContent = `locked ${data.threshold.toFixed(4)}`;

    // the best-F1 point on test, for contrast
    let best = S[0];
    for (const r of S) if (r[3] > best[3]) best = r;
    el("circle", { cx: X(best[0]), cy: Y(best[3]), r: 4.5, fill: C.ink,
      stroke: C.paper, "stroke-width": 2 }, g);
    const bl = el("text", { x: X(best[0]) - 8, y: Y(best[3]) - 9, "text-anchor": "end", class: "ax-mark" }, g);
    bl.textContent = `best test F1 ${best[3].toFixed(3)}`;

    legendItems(ctx.legend, [["Precision", "#6b6b67", "", "7 3"],
      ["Recall", "#8c8c87", "", "2 3"], ["F1", "#111111", "", "", 2.4]]);

    const hit = el("rect", { x: 0, y: 0, width: iw, height: ih, fill: "transparent",
      style: "cursor:crosshair" }, g);
    const rule = el("line", { x1: 0, y1: 0, x2: 0, y2: ih, stroke: C.ink3,
      "stroke-width": 1, "stroke-dasharray": "2 3", opacity: 0 }, g);
    hit.addEventListener("mousemove", (ev) => {
      const box = ctx.svg.getBoundingClientRect();
      const scale = ctx.W / box.width;
      const px = (ev.clientX - box.left) * scale - ctx.M.l;
      const xv = Math.max(0, Math.min(1, px / iw));
      let r = S[0], bd = Infinity;
      for (const row of S) { const d = Math.abs(row[0] - xv); if (d < bd) { bd = d; r = row; } }
      rule.setAttribute("x1", X(r[0])); rule.setAttribute("x2", X(r[0]));
      rule.setAttribute("opacity", 1);
      showTip(ev, `<div class="tip-head">threshold ${r[0].toFixed(3)}</div>
        <table><tbody>
        <tr><td>Precision</td><td>${r[1].toFixed(3)}</td></tr>
        <tr><td>Recall</td><td>${r[2].toFixed(3)}</td></tr>
        <tr><td>F1</td><td>${r[3].toFixed(3)}</td></tr>
        </tbody></table>`);
    });
    hit.addEventListener("mouseleave", () => { rule.setAttribute("opacity", 0); hideTip(); });
  }

  /* ── score distribution ──────────────────────────────── */
  function distChart(mount, data) {
    const ctx = figure(mount, {
      title: "Where the two classes land",
      subtitle: "Fused probability for genuine vs fraudulent postings. Both axes are log-scaled — the scores pile up near zero.",
      note: "The genuine mass collapses into the leftmost bin — that is the specificity of 0.998. The problem is the fraud bars sitting left of the lock: those <b>74 postings are the false negatives</b>, and they are spread across the whole low range rather than bunched just under the line.",
      height: 300,
    });
    const { edges, genuine, fraud } = data.dist;
    const n = genuine.length;
    const maxC = Math.max(...genuine, ...fraud);
    const logMax = Math.log10(maxC + 1);

    const yTicks = [0, 1, 2, 3].filter((e) => e <= logMax + 0.2)
      .map((e) => ({ v: Math.pow(10, e), p: Math.log10(Math.pow(10, e) + 1) / logMax }));

    // x is bin index; label with the probability edges
    const xTicks = [0, 0.25, 0.5, 0.75, 1].map((p) => ({
      v: edges[Math.round(p * (n - 1))], p,
    }));

    const g = axes(ctx, {
      xTicks, yTicks,
      xLabel: "Fused fraud probability (log-spaced bins)",
      yLabel: "Postings",
      xFmt: (v) => (v === 0 ? "0" : v < 0.01 ? v.toExponential(0) : v.toFixed(2)),
      yFmt: (v) => (v >= 1000 ? `${v / 1000}k` : String(v)),
    });
    const { iw, ih } = ctx;
    const bw = iw / n;
    const H = (c) => (c <= 0 ? 0 : (Math.log10(c + 1) / logMax) * ih);

    const lockIdx = edges.findIndex((e) => e >= data.threshold);
    const lockX = (lockIdx < 0 ? n : lockIdx) * bw;

    for (let i = 0; i < n; i++) {
      const x = i * bw;
      [[genuine[i], "#c9c9c4", -1], [fraud[i], "#111111", 1]].forEach(([c, color, side]) => {
        if (!c) return;
        const h = H(c);
        const w = bw / 2 - 1; // 2px surface gap between the paired fills
        el("rect", {
          x: side < 0 ? x + 0.5 : x + bw / 2 + 0.5, y: ih - h,
          width: Math.max(w, 0.8), height: h, fill: color, rx: 1.5, opacity: 0.92,
        }, g);
      });
      const hit = el("rect", { x, y: 0, width: bw, height: ih, fill: "transparent" }, g);
      hit.addEventListener("mousemove", (ev) => showTip(ev,
        `<div class="tip-head">p ${edges[i].toExponential(1)} – ${(edges[i + 1] ?? 1).toExponential(1)}</div>
         <table><tbody>
         <tr><td>Genuine</td><td>${genuine[i]}</td></tr>
         <tr><td>Fraudulent</td><td>${fraud[i]}</td></tr>
         </tbody></table>`));
      hit.addEventListener("mouseleave", hideTip);
    }

    el("line", { x1: lockX, y1: 0, x2: lockX, y2: ih, stroke: C.ink,
      "stroke-width": 1.5, "stroke-dasharray": "4 4" }, g);
    const t = el("text", { x: lockX - 7, y: 12, "text-anchor": "end", class: "ax-mark" }, g);
    t.textContent = "locked threshold";

    legendItems(ctx.legend, [
      ["Genuine (2,552)", "#c9c9c4", "", "", 0, "block"],
      ["Fraudulent (128)", "#111111", "", "", 0, "block"]]);
  }

  /* ── calibration ─────────────────────────────────────── */
  function calibrationChart(mount, data) {
    const ctx = figure(mount, {
      title: "Is the probability believable?",
      subtitle: "Predicted probability against the fraud rate actually observed, in equal-count bins.",
      note: "Points on the diagonal mean the number is trustworthy as a probability, not just as a ranking. Bins sit slightly <b>below</b> the line at the top — the model is a little over-confident where it matters most, which is the conservative direction for a screening tool but worth knowing before anyone reads a score as a literal risk.",
      height: 300,
    });
    const bins = data.calibration;
    const maxV = Math.max(...bins.map((b) => Math.max(b.predicted, b.observed)), 0.05);
    const lim = Math.min(1, Math.ceil(maxV * 10) / 10 + 0.05);

    const ticks = Array.from({ length: 5 }, (_, i) => {
      const v = (lim * i) / 4;
      return { v, p: i / 4 };
    });
    const g = axes(ctx, {
      xTicks: ticks, yTicks: ticks,
      xLabel: "Mean predicted probability", yLabel: "Observed fraud rate",
      xFmt: (v) => v.toFixed(2), yFmt: (v) => v.toFixed(2),
    });
    const { iw, ih } = ctx;
    const X = (v) => (v / lim) * iw, Y = (v) => ih - (v / lim) * ih;

    el("line", { x1: 0, y1: ih, x2: iw, y2: 0, stroke: C.axis,
      "stroke-width": 1.5, "stroke-dasharray": "3 5" }, g);

    const d = bins.map((b, i) => `${i ? "L" : "M"}${X(b.predicted).toFixed(2)},${Y(b.observed).toFixed(2)}`).join("");
    el("path", { d, fill: "none", stroke: C.ink, "stroke-width": 2,
      "stroke-linejoin": "round" }, g);

    bins.forEach((b) => {
      el("circle", { cx: X(b.predicted), cy: Y(b.observed), r: 5,
        fill: C.ink, stroke: C.paper, "stroke-width": 2 }, g);
      const hit = el("circle", { cx: X(b.predicted), cy: Y(b.observed), r: 14, fill: "transparent" }, g);
      hit.addEventListener("mousemove", (ev) => showTip(ev,
        `<div class="tip-head">${b.count} postings</div>
         <table><tbody>
         <tr><td>Predicted</td><td>${b.predicted.toFixed(4)}</td></tr>
         <tr><td>Observed</td><td>${b.observed.toFixed(4)}</td></tr>
         </tbody></table>`));
      hit.addEventListener("mouseleave", hideTip);
    });

    legendItems(ctx.legend, [["Observed vs predicted", C.ink, "", "", 0, "filled"],
      ["Perfect calibration", C.axis, "", "3 5", 1.6]]);
  }

  /* ── validation → test gap (dumbbell) ────────────────── */
  function gapChart(mount, data) {
    const rows = data.gap;
    const ctx = figure(mount, {
      title: "What the untouched test split cost",
      subtitle: "Every metric, locked validation versus the one-time test evaluation.",
      note: "Accuracy and specificity barely move; <b>recall falls by 0.32</b>. That shape is the signature of campaign-isolated splitting — the test set contains fraud campaigns the model has genuinely never seen, and it catches far fewer of them. A model that scored the same on both would be the suspicious one.",
      height: 40 + rows.length * 30,
    });
    const { svg, M } = ctx;
    const iw = ctx.iw, ih = 10 + rows.length * 30;
    const g = el("g", { transform: `translate(${M.l + 46},${M.t})` }, svg);
    const W = iw - 46;
    const X = (v) => v * W;

    [0, 0.25, 0.5, 0.75, 1].forEach((v) => {
      el("line", { x1: X(v), y1: 0, x2: X(v), y2: ih, stroke: C.grid, "stroke-width": 1 }, g);
      const t = el("text", { x: X(v), y: ih + 18, "text-anchor": "middle", class: "ax-tick" }, g);
      t.textContent = v.toFixed(2);
    });

    rows.forEach((r, i) => {
      const y = 18 + i * 30;
      const lab = el("text", { x: -12, y: y + 4, "text-anchor": "end", class: "ax-tick" }, g);
      lab.textContent = r.metric;

      el("line", { x1: X(r.test), y1: y, x2: X(r.validation), y2: y,
        stroke: C.axis, "stroke-width": 2, "stroke-linecap": "round" }, g);
      el("circle", { cx: X(r.validation), cy: y, r: 5, fill: C.paper,
        stroke: C.ink3, "stroke-width": 1.8 }, g);
      el("circle", { cx: X(r.test), cy: y, r: 5, fill: C.ink,
        stroke: C.paper, "stroke-width": 1.8 }, g);

      const hit = el("rect", { x: -60, y: y - 13, width: W + 60, height: 26, fill: "transparent" }, g);
      hit.addEventListener("mousemove", (ev) => showTip(ev,
        `<div class="tip-head">${r.metric}</div>
         <table><tbody>
         <tr><td>Validation</td><td>${r.validation.toFixed(4)}</td></tr>
         <tr><td>Test</td><td>${r.test.toFixed(4)}</td></tr>
         <tr><td>Change</td><td>${(r.test - r.validation >= 0 ? "+" : "−")}${Math.abs(r.test - r.validation).toFixed(4)}</td></tr>
         </tbody></table>`));
      hit.addEventListener("mouseleave", hideTip);
    });

    legendItems(ctx.legend, [["Locked validation", C.paper, "", "", 0, "hollow"],
      ["Untouched test", C.ink, "", "", 0, "filled"]]);
  }

  /* ── table view (accessibility: never color-alone) ───── */
  function tableView(mount, data) {
    const wrap = document.createElement("details");
    wrap.className = "chart-table";
    const rows = ORDER.map((n) => `<tr><th>${n}</th>
      <td>${data.roc[n].auc.toFixed(4)}</td><td>${data.pr[n].auc.toFixed(4)}</td></tr>`).join("");
    const gaps = data.gap.map((r) => `<tr><th>${r.metric}</th>
      <td>${r.validation.toFixed(4)}</td><td>${r.test.toFixed(4)}</td>
      <td>${(r.test - r.validation >= 0 ? "+" : "−")}${Math.abs(r.test - r.validation).toFixed(4)}</td></tr>`).join("");
    wrap.innerHTML = `<summary>Read the underlying numbers as a table</summary>
      <div class="ct-scroll">
        <table><caption>Discrimination by branch — untouched test</caption>
          <thead><tr><th>Series</th><th>ROC-AUC</th><th>PR-AUC (AP)</th></tr></thead>
          <tbody>${rows}</tbody></table>
        <table><caption>Validation vs untouched test</caption>
          <thead><tr><th>Metric</th><th>Validation</th><th>Test</th><th>Change</th></tr></thead>
          <tbody>${gaps}</tbody></table>
      </div>`;
    mount.appendChild(wrap);
  }

  /* ── boot ────────────────────────────────────────────── */
  async function boot() {
    const mount = document.getElementById("charts");
    if (!mount) return;
    let data;
    try {
      data = window.__sageGetJSON
        ? await window.__sageGetJSON("charts")
        : await (await fetch("data/charts.json")).json();
    } catch (_) {
      mount.innerHTML = `<p class="chart-error">Chart data could not be loaded.</p>`;
      return;
    }
    curveChart(mount, data, "pr");
    curveChart(mount, data, "roc");
    sweepChart(mount, data);
    distChart(mount, data);
    calibrationChart(mount, data);
    gapChart(mount, data);
    tableView(mount, data);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else boot();
})();
