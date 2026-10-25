/* View 5 -- The optimal launch window: carry over launch angle x spin at one ball speed.
 * Data: precomputed grid (prep/grid.py), 61 x 61 runs per measured TrackMan ball speed,
 * sea level, no wind, coefficient set chosen in the top bar. */
(function () {
  "use strict";
  const { P, D } = G, C = Charts.css, GR = D.grid;
  const nT = GR.theta.length, nW = GR.rpm.length;
  const root = G.$("#v5-panel");
  const ctl = G.h("div"); root.appendChild(ctl);
  let si = nearestSpeed(G.state.shot.mph), hatch = true, tourF = "both";
  const sp = G.slider(ctl, { id: "v5-speed", label: "Ball speed", min: 0, max: GR.speeds_mph.length - 1, step: 1, value: si,
    fmt: (i) => `${G.fs(GR.speeds_mph[i] * P.C.MPH, 0)}`, oninput: (i) => { si = i; animateOpt(); draw(); } });
  const row = G.h("div", { class: "ctl" }); ctl.appendChild(row);
  G.seg(row, [["both", "Both tours"], ["PGA", "PGA"], ["LPGA", "LPGA"]], tourF, (v) => { tourF = v; draw(); }, "Tour filter");
  G.seg(row, [[true, "Show extrapolated zone"], [false, "Hide"]], true, (v) => { hatch = v; draw(); }, "Extrapolation hatching");
  G.button(row, "Match current shot", () => { si = nearestSpeed(G.state.shot.mph); sp.set(si); animateOpt(); draw(); });
  G.button(row, "Reset", () => { si = nearestSpeed(171); sp.set(si); tourF = "both"; draw(); });
  const clubsAt = G.h("p", { class: "notice" }); ctl.appendChild(clubsAt);

  const box = G.h("div", { class: "canvas-box" }); root.appendChild(box);
  const cv = G.h("canvas", { "aria-label": "Heat map of carry over launch angle and spin" }); box.appendChild(cv);
  const tip = Charts.Tip(box);
  const ro = G.h("div", { class: "readout" }); root.appendChild(ro);
  const msg = G.h("p", { class: "notice" }); root.appendChild(msg);
  const plot = new Charts.Plot(cv, { height: (w) => Math.max(300, Math.min(440, w * 0.5)), pad: { l: 62, r: 96, t: 12, b: 42 } });

  function nearestSpeed(mph) {
    let b = 0; GR.speeds_mph.forEach((s, i) => { if (Math.abs(s - mph) < Math.abs(GR.speeds_mph[b] - mph)) b = i; }); return b;
  }
  const cell = (i, j) => i * nW + j;
  function layer() { return GR.sets[G.state.coef][String(GR.speeds_mph[si])]; }
  function optimum(L) { let b = 0; L.carry10.forEach((v, k) => { if (v > L.carry10[b]) b = k; }); return { i: Math.floor(b / nW), j: b % nW, carry: L.carry10[b] / 10 }; }
  let optShown = null, anim = 0, loadedMsg = "";
  function animateOpt() {
    const target = optimum(layer());
    const from = optShown ? { ...optShown } : { th: GR.theta[target.i], w: GR.rpm[target.j] };
    const to = { th: GR.theta[target.i], w: GR.rpm[target.j] };
    const t0 = performance.now(); cancelAnimationFrame(anim);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const step = (ts) => {
      const f = reduce ? 1 : Math.min(1, (ts - t0) / 600), e = 1 - Math.pow(1 - f, 3);
      optShown = { th: from.th + e * (to.th - from.th), w: from.w + e * (to.w - from.w) };
      draw(true); if (f < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  function draw(fast) {
    const L = layer(), opt = optimum(L), dark = Charts.isDark();
    if (!optShown) optShown = { th: GR.theta[opt.i], w: GR.rpm[opt.j] };
    const vals = L.carry10.map((v) => v / 10), hi = Math.max(...vals);
    const SPAN = 60, lo = Math.max(Math.min(...vals), hi - SPAN);      // color scale covers the top 60 yd; lower values clamp to the lightest color
    plot.resize();
    const dth = GR.theta[1] - GR.theta[0], dw = GR.rpm[1] - GR.rpm[0];
    plot.clear().domain(GR.theta[0] - dth / 2, GR.theta[nT - 1] + dth / 2, GR.rpm[0] - dw / 2, GR.rpm[nW - 1] + dw / 2);
    const g = plot.ctx;
    for (let i = 0; i < nT; i++) for (let j = 0; j < nW; j++) {
      const x0 = plot.X(GR.theta[i] - dth / 2), x1 = plot.X(GR.theta[i] + dth / 2);
      const y0 = plot.Y(GR.rpm[j] + dw / 2), y1 = plot.Y(GR.rpm[j] - dw / 2);
      g.fillStyle = Charts.seqColor((vals[cell(i, j)] - lo) / (hi - lo || 1), dark);
      g.fillRect(x0, y0, x1 - x0 + 0.6, y1 - y0 + 0.6);
    }
    if (hatch) {
      plot.clip(() => {
        g.strokeStyle = dark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.16)"; g.lineWidth = 1;
        for (let i = 0; i < nT; i++) for (let j = 0; j < nW; j++) {
          if (L.outside[cell(i, j)] < 50) continue;
          const x0 = plot.X(GR.theta[i] - dth / 2), y0 = plot.Y(GR.rpm[j] + dw / 2);
          const w = plot.X(GR.theta[i] + dth / 2) - x0, h = plot.Y(GR.rpm[j] - dw / 2) - y0;
          if ((i + j) % 3) continue;
          g.beginPath(); g.moveTo(x0, y0 + h); g.lineTo(x0 + w * 2, y0 - h); g.stroke();
        }
      });
    }
    // contours every 10 yd (or 10 m)
    const z = GR.theta.map((_, i) => GR.rpm.map((_, j) => G.u.dist(vals[cell(i, j)] * P.C.YD)));
    const step10 = 10, lo2 = Math.ceil(G.u.dist(Math.min(...vals) * P.C.YD) / step10) * step10;
    g.save(); g.strokeStyle = dark ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.75)"; g.lineWidth = 1;
    for (let lev = lo2; lev < G.u.dist(hi * P.C.YD); lev += step10) {
      Charts.contour(z, lev).forEach(([a, b]) => {
        g.beginPath();
        g.moveTo(plot.X(GR.theta[0] + a[0] * dth), plot.Y(GR.rpm[0] + a[1] * dw));
        g.lineTo(plot.X(GR.theta[0] + b[0] * dth), plot.Y(GR.rpm[0] + b[1] * dw)); g.stroke();
      });
    }
    g.restore();
    plot.axes("Launch angle θ₀ (deg)", G.u.golf() ? "Spin ω₀ (rpm)" : "Spin ω₀ (rad/s)", { noGrid: true, fmtY: (v) => (G.u.golf() ? v.toFixed(0) : ((v * 2 * Math.PI) / 60).toFixed(0)) });
    // legend
    const lx = plot.W - 80, ly0 = plot.o.pad.t + 10, lh = plot.ph - 40;
    for (let k = 0; k < 60; k++) { g.fillStyle = Charts.seqColor(1 - k / 59, dark); g.fillRect(lx, ly0 + (k * lh) / 60, 14, lh / 60 + 1); }
    g.fillStyle = C("--ink"); g.font = "11px " + C("--font-data"); g.textAlign = "left";
    g.fillText(G.u.dist(hi * P.C.YD).toFixed(0), lx + 18, ly0 + 6); g.fillText("≤ " + G.u.dist(lo * P.C.YD).toFixed(0), lx + 18, ly0 + lh);
    g.fillText(`carry (${G.u.dUnit()})`, lx - 6, ly0 + lh + 18);
    // club markers at this speed
    const sp0 = GR.speeds_mph[si];
    const clubs = D.trackman.filter((r) => r.complete && r.ball_mph === sp0 && (tourF === "both" || r.tour === tourF));
    clubs.forEach((r) => {
      plot.dot(r.launch_deg, r.spin_rpm, 6, C("--measured"), C("--surface"), r.tour === "LPGA" ? "diamond" : "circle");
      plot.haloText(`${r.tour} ${r.club} (measured avg)`, r.launch_deg, r.spin_rpm, "#fff", "rgba(0,0,0,0.75)", "left", "bottom", null, 6, -8);
    });
    // optimum
    plot.dot(optShown.th, optShown.w, 8, null, "#fff"); plot.dot(optShown.th, optShown.w, 6.5, null, "#000");
    plot.dot(optShown.th, optShown.w, 2.5, "#fff");
    plot.haloText("max carry", optShown.th, optShown.w, "#fff", "rgba(0,0,0,0.75)", "left", "top", null, 9, 8);
    // current shot
    const s = G.state.shot;
    if (Math.abs(s.mph - sp0) < 0.5 && s.theta <= 30 && s.rpm >= 1000) plot.dot(s.theta, s.rpm, 5, C("--model"), C("--surface"));
    clubsAt.innerHTML = `Measured clubs at ${sp0} mph: <b>${GR.clubs[String(sp0)].join(", ")}</b>. Grid: sea level, no wind, ${G.state.coef} coefficients.`;
    ro.innerHTML = `
      <div><small>Max carry on this map</small><b>${G.fd(opt.carry * P.C.YD, 0)}</b></div>
      <div><small>at launch angle</small><b>${GR.theta[opt.i].toFixed(1)}°</b></div>
      <div><small>at spin</small><b>${G.fw(GR.rpm[opt.j])}</b></div>
      ${clubs.map((r) => `<div><small>${r.tour} ${r.club} on map / measured</small><b>${G.u.dist(L.carry10[cell(Math.round(r.launch_deg / dth), Math.round((r.spin_rpm - GR.rpm[0]) / dw))] / 10 * P.C.YD).toFixed(0)} / ${G.u.dist(r.carry_yd * P.C.YD).toFixed(0)} ${G.u.dUnit()}</b></div>`).join("")}`;
    msg.innerHTML = loadedMsg + `Hatched cells spend more than half the flight outside the range Smits &amp; Smith fitted (S 0.08–0.20, Re 70k–210k); treat them as extrapolation. Click any cell to load it into View 4.${Math.abs(s.mph - sp0) >= 0.5 ? ` The current shot is at ${s.mph.toFixed(0)} mph, so it is not marked here.` : ""}`;
    void fast;
  }

  const hit = (ev) => {
    const b = cv.getBoundingClientRect(), px = ev.clientX - b.left, py = ev.clientY - b.top;
    const th = plot.invX(px), w = plot.invY(py);
    const i = Math.round((th - GR.theta[0]) / (GR.theta[1] - GR.theta[0])), j = Math.round((w - GR.rpm[0]) / (GR.rpm[1] - GR.rpm[0]));
    if (i < 0 || j < 0 || i >= nT || j >= nW) return null;
    return { i, j, px, py };
  };
  cv.addEventListener("mousemove", (ev) => {
    const h = hit(ev); if (!h) return tip.hide();
    const L = layer(), k = cell(h.i, h.j);
    tip.show(`θ₀ = ${GR.theta[h.i].toFixed(1)}°, ω₀ = ${GR.rpm[h.j]} rpm<br>carry = ${G.fd(L.carry10[k] / 10 * P.C.YD)}<br>outside fitted range: ${L.outside[k]}% of flight`, h.px, h.py);
  });
  cv.addEventListener("mouseleave", () => tip.hide());
  cv.addEventListener("click", (ev) => {
    const h = hit(ev); if (!h) return;
    G.update({ shot: { mph: GR.speeds_mph[si], theta: GR.theta[h.i], rpm: GR.rpm[h.j], alpha: 0 } });
    loadedMsg = `<b>Loaded θ₀ = ${GR.theta[h.i].toFixed(1)}°, ω₀ = ${GR.rpm[h.j]} rpm at ${GR.speeds_mph[si]} mph into View 4.</b> <a href="#view4">Go to View 4</a><br>`;
  });

  draw();
  G.on("shot", () => draw()); ["units", "redraw", "resize"].forEach((e) => G.on(e, () => draw()));
})();
