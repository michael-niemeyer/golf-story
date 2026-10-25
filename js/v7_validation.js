/* View 7 -- Model vs. measurement.  Scatter of model against TrackMan averages (equal,
 * zero-anchored axes, y = x reference), per-force contribution bars for the current shot,
 * per-club error table.  Data: data/validation.json produced by prep/prepare.py + queries.sql. */
(function () {
  "use strict";
  const { P, D } = G, C = Charts.css, V = D.validation;
  const root = G.$("#v7-panel");
  const ctl = G.h("div", { class: "ctl" }); root.appendChild(ctl);
  let metric = "carry", tourF = "both", set = G.state.coef;
  G.seg(ctl, [["carry", "Carry"], ["apex", "Apex"], ["land", "Landing angle"]], metric, (v) => { metric = v; draw(); }, "Metric");
  G.seg(ctl, [["both", "Both tours"], ["PGA", "PGA"], ["LPGA", "LPGA"]], tourF, (v) => { tourF = v; draw(); }, "Tour");
  const setSeg = G.seg(ctl, [["raw", "Wind-tunnel constants"], ["calibrated", "Calibrated to PGA driver"]], set, (v) => { set = v; draw(); }, "Coefficients");
  G.button(ctl, "Reset", () => { metric = "carry"; tourF = "both"; set = "raw"; setSeg.set("raw"); draw(); });

  const row = G.h("div", { class: "row2" }); root.appendChild(row);
  const b1 = G.h("div", { class: "canvas-box" }), b2 = G.h("div", { class: "canvas-box" }); row.append(b1, b2);
  const cv = G.h("canvas", { "aria-label": "Model versus measured scatter" }); b1.appendChild(cv);
  const cvb = G.h("canvas", { "aria-label": "Carry under vacuum, drag-only and full models" }); b2.appendChild(cvb);
  const tip = Charts.Tip(b1);
  const plot = new Charts.Plot(cv, { height: (w) => Math.min(460, w - 8), equal: true, pad: { l: 52, r: 14, t: 14, b: 44 } });
  const bars = new Charts.Plot(cvb, { height: 250, pad: { l: 118, r: 60, t: 30, b: 40 } });
  const legend = G.h("p", { class: "notice" }); b1.appendChild(legend);
  const barNote = G.h("p", { class: "notice" }); b2.appendChild(barNote);
  const tableBox = G.h("div", { class: "tablebox" }); root.appendChild(tableBox);

  const M = {
    carry: { m: "measured_carry_yd", p: "model_carry_yd", unit: "dist", label: "carry" },
    apex: { m: "measured_apex_yd", p: "model_apex_yd", unit: "dist", label: "apex height" },
    land: { m: "measured_land_deg", p: "model_land_deg", unit: "deg", label: "landing angle" },
  };
  const conv = (v, k) => (M[k].unit === "dist" ? G.u.dist(v * P.C.YD) : v);
  const unit = (k) => (M[k].unit === "dist" ? G.u.dUnit() : "deg");
  const rows = () => V.validation.filter((r) => r.coef_set === set && (tourF === "both" || r.tour === tourF));
  let pts = [];

  function draw() {
    const m = M[metric], rs = rows();
    const max = Math.max(...V.validation.filter((r) => r.coef_set === set).map((r) => Math.max(conv(r[m.m], metric), conv(r[m.p], metric)))) * 1.08;
    plot.resize();
    plot.clear().domain(0, max, 0, max).axes(`Measured ${m.label} (${unit(metric)}), TrackMan 2023`, `Model ${m.label} (${unit(metric)})`);
    plot.line([[0, 0], [max, max]], C("--muted"), 1.2, [5, 4]);
    plot.text("y = x (perfect agreement)", max * 0.2, max * 0.2, C("--muted"), "left", "top", "11px " + C("--font-body"), 8, 4);
    pts = rs.map((r) => {
      const x = conv(r[m.m], metric), y = conv(r[m.p], metric), extrap = r.frac_outside >= 0.5;
      plot.dot(x, y, 5.5, extrap ? null : C("--measured"), C("--measured"), r.tour === "LPGA" ? "diamond" : "circle");
      return { r, x, y };
    });
    const short = (c) => c.replace("-iron", "i").replace("-wood", "w").replace("Driver", "Dr").replace("Hybrid", "Hy");
    // label a few anchor clubs only; hover gives every point's values
    pts.filter((p) => /Driver|7-iron|PW/.test(p.r.club)).forEach((p) =>
      plot.text(`${p.r.tour} ${short(p.r.club)}`, p.x, p.y, C("--ink"), p.r.tour === "PGA" ? "left" : "right", "middle", "10.5px " + C("--font-body"), p.r.tour === "PGA" ? 8 : -8));
    legend.innerHTML = `● PGA &nbsp; ◆ LPGA &nbsp; filled = mostly inside the fitted range, hollow = more than half the flight extrapolated. Missing: <b>${V.missing.map((x) => x.tour + " " + x.club).join(", ")}</b> (no row in the published table, not imputed). Hover a point for values; click to load it into View 4.`;
    drawBars(); drawTable();
  }
  function drawBars() {
    const r = G.current(), modes = ["vacuum", "drag", "full"], names = { vacuum: "Vacuum", drag: "+ drag only", full: "+ drag + lift (full)" };
    const vals = {}, base = G.params();
    modes.forEach((md) => (vals[md] = md === "full" ? r.carry : (md === "vacuum" ? P.vacuum(base.v0, base.theta).range : P.simulate(Object.assign({}, base, { mode: md, record: false })).carry)));
    const row = G.loadedRow();
    const mx = Math.max(...Object.values(vals), row ? row.carry_yd * P.C.YD : 0) * 1.1;
    bars.resize();
    bars.clear().domain(0, G.u.dist(mx), 0, 3).axes(`Carry (${G.u.dUnit()}), current shot`, "", { yticks: [] });
    modes.forEach((md, i) => {
      const y0 = bars.Y(2.75 - i), y1 = bars.Y(2.25 - i), x1 = bars.X(G.u.dist(vals[md]));
      bars.ctx.fillStyle = C(md === "vacuum" ? "--vacuum" : md === "drag" ? "--drag" : "--model");
      bars.ctx.fillRect(bars.X(0), y0, x1 - bars.X(0), y1 - y0);
      bars.text(names[md], 0, 2.5 - i, C("--ink"), "right", "middle", null, -8);
      bars.text(G.u.dist(vals[md]).toFixed(0), G.u.dist(vals[md]), 2.5 - i, C("--ink"), "left", "middle", "11px " + C("--font-data"), 4);
    });
    if (row) {
      const x = bars.X(G.u.dist(row.carry_yd * P.C.YD));
      bars.ctx.strokeStyle = C("--measured"); bars.ctx.lineWidth = 2; bars.ctx.setLineDash([4, 3]);
      bars.ctx.beginPath(); bars.ctx.moveTo(x, bars.o.pad.t - 6); bars.ctx.lineTo(x, bars.o.pad.t + bars.ph); bars.ctx.stroke(); bars.ctx.setLineDash([]);
      bars.ctx.fillStyle = C("--measured"); bars.ctx.font = "11px " + C("--font-body"); bars.ctx.textAlign = x > bars.W - 90 ? "right" : "center";
      bars.ctx.fillText(`measured ${row.tour} ${row.club}`, x, bars.o.pad.t - 12);
    }
    barNote.innerHTML = `Bars start at zero. Drag alone costs <b>${G.fd(vals.vacuum - vals.drag, 0)}</b>; lift then gives back <b>${G.fd(vals.full - vals.drag, 0)}</b> for this shot (${G.state.coef} coefficients, current environment).`;
  }
  function drawTable() {
    const mae = V.mae.filter((r) => r.coef_set === set);
    const rs = rows();
    const cal = V.calibration;
    tableBox.innerHTML = `
      <h3>Per-club error (${set === "raw" ? "wind-tunnel constants" : "calibrated constants"})</h3>
      <p class="notice">Errors are model minus measured, in the measured units. The summary is the mean absolute error of raw differences; percentages are never averaged.
      Calibration searched C<sub>d1</sub> ∈ [${cal.search.Cd1.join(", ")}] and C<sub>l1</sub> ∈ [${cal.search.Cl1.join(", ")}] (Smits &amp; Smith's trajectory-fit ranges) and chose
      C<sub>d1</sub> = ${cal.Cd1.toFixed(4)}, C<sub>l1</sub> = ${cal.Cl1.toFixed(4)}, giving ${cal.carry_yd.toFixed(1)} yd for the PGA driver (target ${cal.target_yd} yd, ${cal.err_pct.toFixed(1)}%). That optimum sits on the edge of the allowed box.</p>
      <table><thead><tr><th>Tour</th><th>Club</th><th class="n">Carry meas.</th><th class="n">Carry model</th><th class="n">Error (yd)</th><th class="n">Apex meas./model (yd)</th><th class="n">Land meas./model (°)</th><th class="n">Flight outside fit</th></tr></thead>
      <tbody>${rs.map((r) => `<tr><td>${r.tour}</td><td>${r.club}</td><td class="n">${r.measured_carry_yd}</td><td class="n">${r.model_carry_yd.toFixed(1)}</td>
      <td class="n">${r.carry_err_yd > 0 ? "+" : ""}${r.carry_err_yd.toFixed(1)}</td><td class="n">${r.measured_apex_yd} / ${r.model_apex_yd.toFixed(1)}</td>
      <td class="n">${r.measured_land_deg} / ${r.model_land_deg.toFixed(1)}</td><td class="n">${Math.round(r.frac_outside * 100)}%</td></tr>`).join("")}</tbody></table>
      <table style="margin-top:10px"><thead><tr><th>Tour</th><th class="n">Clubs</th><th class="n">MAE carry (yd)</th><th class="n">MAE apex (yd)</th><th class="n">MAE landing angle (°)</th></tr></thead>
      <tbody>${mae.map((r) => `<tr><td>${r.tour}</td><td class="n">${r.n_clubs}</td><td class="n">${r.mae_carry_yd.toFixed(2)}</td><td class="n">${r.mae_apex_yd.toFixed(2)}</td><td class="n">${r.mae_land_deg.toFixed(2)}</td></tr>`).join("")}</tbody></table>`;
  }
  const near = (ev) => {
    const b = cv.getBoundingClientRect(), px = ev.clientX - b.left, py = ev.clientY - b.top;
    let best = null; pts.forEach((p) => { const d = Math.hypot(plot.X(p.x) - px, plot.Y(p.y) - py); if (d < 14 && (!best || d < best.d)) best = { d, p }; });
    return best && Object.assign(best, { px, py });
  };
  cv.addEventListener("mousemove", (ev) => {
    const b = near(ev); if (!b) return tip.hide();
    const r = b.p.r, k = M[metric];
    tip.show(`${r.tour} ${r.club}<br>measured ${conv(r[k.m], metric).toFixed(1)} ${unit(metric)}<br>model ${conv(r[k.p], metric).toFixed(1)} ${unit(metric)}<br>error ${(conv(r[k.p], metric) - conv(r[k.m], metric)).toFixed(1)} ${unit(metric)}<br>${Math.round(r.frac_outside * 100)}% of flight outside fit`, b.px, b.py);
  });
  cv.addEventListener("mouseleave", () => tip.hide());
  cv.addEventListener("click", (ev) => { const b = near(ev); if (b) G.loadClub(b.p.r.tour, b.p.r.club); });

  draw();
  G.on("shot", () => { drawBars(); });
  ["units", "redraw", "resize"].forEach((e) => G.on(e, draw));
  G.on("coef", (v) => { set = v; setSeg.set(v); draw(); });
})();
