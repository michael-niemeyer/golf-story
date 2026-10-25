/* View 6 -- Wind, altitude and curve in 3-D.
 * Hand-written perspective camera (orbit by dragging, zoom with the wheel or buttons).
 * Exact values are read from the two orthographic insets (top, side) and the readout,
 * never from the perspective view, because perspective distorts length. */
(function () {
  "use strict";
  const { P } = G, C = Charts.css;
  const root = G.$("#v6-panel");
  const top = G.h("div", { class: "grid2" }); root.appendChild(top);
  const left = G.h("div"), right = G.h("div"); top.append(left, right);
  const E = G.state.env;
  const sTail = G.slider(left, { id: "v6-tail", label: "Head / tail wind", min: -25, max: 25, step: 1, value: E.tailMph,
    fmt: (v) => (v === 0 ? "calm" : (v > 0 ? "tail " : "head ") + G.fs(Math.abs(v) * P.C.MPH, 0)), oninput: (v) => G.update({ env: { tailMph: v } }, { keepClub: true }) });
  const sCross = G.slider(left, { id: "v6-cross", label: "Cross wind", min: -25, max: 25, step: 1, value: E.crossMph,
    fmt: (v) => (v === 0 ? "calm" : (v > 0 ? "L→R " : "R→L ") + G.fs(Math.abs(v) * P.C.MPH, 0)), oninput: (v) => G.update({ env: { crossMph: v } }, { keepClub: true }) });
  const sAlt = G.slider(left, { id: "v6-alt", label: "Altitude", min: 0, max: 8000, step: 20, value: E.altFt,
    fmt: (v) => G.u.alt(v).toFixed(0) + " " + G.u.aUnit(), oninput: (v) => G.update({ env: { altFt: v } }, { keepClub: true }) });
  const sAx = G.slider(left, { id: "v6-alpha", label: "Spin-axis tilt α", min: -30, max: 30, step: 0.5, value: G.state.shot.alpha,
    fmt: (v) => (v > 0 ? "+" : "") + v.toFixed(1) + "° " + (v > 0 ? "(fade)" : v < 0 ? "(draw)" : ""), oninput: (v) => G.update({ shot: { alpha: v } }) });
  const b1 = G.h("div", { class: "ctl" }); left.appendChild(b1);
  const scen = { A: null, B: null };
  const save = (k) => { const r = G.current(); if (!r.ok) return; scen[k] = { r, label: describe() }; draw(); };
  G.button(b1, "Save as A", () => save("A"));
  G.button(b1, "Save as B", () => save("B"));
  G.button(b1, "Clear A/B", () => { scen.A = scen.B = null; draw(); });
  G.button(b1, "Preset: Denver + 10 mph headwind", () => G.update({ env: { altFt: 5280, tailMph: -10, crossMph: 0 } }, { keepClub: true }));
  G.button(b1, "Reset environment", () => G.update({ env: { tailMph: 0, crossMph: 0, altFt: 0 }, shot: { alpha: 0 } }, { keepClub: true }));
  const b2 = G.h("div", { class: "ctl" }); left.appendChild(b2);
  let tball = 0;
  const player = G.playControl(b2, (dt) => { const T = G.current().time; if (tball >= T) tball = 0; tball = Math.min(T, tball + dt); draw(); if (tball >= T) return false; });
  G.button(b2, "Step +0.5 s", () => { player.stop(); tball = Math.min(G.current().time, tball + 0.5); draw(); });
  const camSeg = G.seg(b2, [["angled", "Angled"], ["behind", "Behind golfer"], ["side", "Side"], ["top", "Top"]], "angled", (v) => setCam(v), "Camera");
  G.button(b2, "Reset view", () => { setCam("angled"); camSeg.set("angled"); });
  const ro = G.h("div", { class: "readout" }); left.appendChild(ro);

  const box = G.h("div", { class: "canvas-box" }); right.appendChild(box);
  const cv = G.h("canvas", { "aria-label": "Three-dimensional view of the trajectory; drag to orbit" }); box.appendChild(cv);
  const ins = G.h("div", { class: "row2" }); right.appendChild(ins);
  const bt = G.h("div", { class: "canvas-box" }), bs = G.h("div", { class: "canvas-box" }); ins.append(bt, bs);
  const cvt = G.h("canvas", { "aria-label": "Top view: lateral versus downrange" }); bt.appendChild(cvt);
  const cvs = G.h("canvas", { "aria-label": "Side view: height versus downrange" }); bs.appendChild(cvs);
  const tipT = Charts.Tip(bt);
  const pT = new Charts.Plot(cvt, { height: 190, pad: { l: 46, r: 10, t: 10, b: 38 } });
  const pS = new Charts.Plot(cvs, { height: 190, pad: { l: 46, r: 10, t: 10, b: 38 } });

  /* ---------------- camera ---------------- */
  const cam = { yaw: -0.55, pitch: 0.38, dist: 1.0 };
  function setCam(v) {
    if (v === "angled") Object.assign(cam, { yaw: -0.55, pitch: 0.38, dist: 1.0 });
    if (v === "behind") Object.assign(cam, { yaw: 0, pitch: 0.32, dist: 1.0 });
    if (v === "side") Object.assign(cam, { yaw: -Math.PI / 2, pitch: 0.12, dist: 1.0 });
    if (v === "top") Object.assign(cam, { yaw: 0, pitch: 1.45, dist: 1.05 });
    draw();
  }
  let W = 600, H = 360, ctx = cv.getContext("2d");
  function resize() {
    const dpr = window.devicePixelRatio || 1; W = cv.clientWidth || 600; H = Math.max(280, Math.min(420, W * 0.6));
    cv.style.height = H + "px"; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function projector(span, center) {
    // world: x downrange, l lateral (+right), z up  (metres)
    const R = span * 0.95 * cam.dist;
    const ex = center[0] - R * Math.cos(cam.pitch) * Math.cos(cam.yaw);
    const el = center[1] - R * Math.cos(cam.pitch) * Math.sin(cam.yaw);
    const ez = center[2] + R * Math.sin(cam.pitch);
    // camera basis
    let fx = center[0] - ex, fl = center[1] - el, fz = center[2] - ez; const fn = Math.hypot(fx, fl, fz); fx /= fn; fl /= fn; fz /= fn;
    // (x, lateral-right, up) is a left-handed frame, so screen-right is (-fl, fx, 0) and screen-up = f x right
    let rx = -fl, rl = fx, rz = 0; const rn = Math.hypot(rx, rl) || 1; rx /= rn; rl /= rn;
    const ux = fl * rz - fz * rl, ul = fz * rx - fx * rz, uz = fx * rl - fl * rx;
    const f = (H * 0.5) / Math.tan((40 * Math.PI) / 180 / 2);
    return (x, l, z) => {
      const dx = x - ex, dl = l - el, dz = z - ez;
      const cz = dx * fx + dl * fl + dz * fz; if (cz < 0.5) return null;
      return [W / 2 + (f * (dx * rx + dl * rl + dz * rz)) / cz, H / 2 - (f * (dx * ux + dl * ul + dz * uz)) / cz];
    };
  }
  function poly(pr, pts, color, w, dash, alpha = 1) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.globalAlpha = alpha; if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); let on = false;
    pts.forEach((p) => { const q = pr(p[0], p[1], p[2]); if (!q) { on = false; return; } on ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); on = true; });
    ctx.stroke(); ctx.restore();
  }
  const pts3 = (r) => r.traj.map((p) => [p.x, -p.y, p.z]);

  function describe() {
    const e = G.state.env, s = G.state.shot;
    return `${G.state.loaded ? G.state.loaded.tour + " " + G.state.loaded.club : s.mph + " mph"}, ${e.altFt} ft, wind ${e.tailMph}/${e.crossMph} mph, α ${s.alpha}°`;
  }
  function draw() {
    const r = G.current(); if (!r.ok) return;
    resize();
    const all = [r, scen.A && scen.A.r, scen.B && scen.B.r].filter(Boolean);
    const span = Math.max(...all.map((q) => q.carry), 60);
    const center = [span * 0.5, 0, 0];
    const pr = projector(span, center);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C("--sunk"); ctx.fillRect(0, 0, W, H);
    // ground grid every 25 yd, labels every 50 yd
    const yd = P.C.YD, maxX = Math.ceil(span / yd / 50) * 50 + 25, lat = 60;
    for (let gx = 0; gx <= maxX; gx += 25) poly(pr, [[gx * yd, -lat * yd, 0], [gx * yd, lat * yd, 0]], C("--line"), gx % 50 ? 0.6 : 1.1);
    for (let gl = -lat; gl <= lat; gl += 20) poly(pr, [[0, gl * yd, 0], [maxX * yd, gl * yd, 0]], C("--line"), 0.6);
    poly(pr, [[0, 0, 0], [maxX * yd, 0, 0]], C("--muted"), 1.2, [6, 5]);
    ctx.fillStyle = C("--muted"); ctx.font = "11px " + C("--font-data"); ctx.textAlign = "center";
    for (let gx = 50; gx <= maxX; gx += 50) {
      const q = pr(gx * yd, -lat * yd - 4, 0); if (q) ctx.fillText(G.u.golf() ? gx + " yd" : Math.round(gx * yd) + " m", q[0], q[1]);
    }
    // wind arrow at the tee
    const e = G.state.env;
    if (e.tailMph || e.crossMph) {
      const x0 = span * 0.12, l0 = -40 * yd, k = 2.2;                 // 2.2 m of arrow per mph, drawn on the ground at the left edge
      const a = pr(x0, l0, 0), b = pr(x0 + e.tailMph * k, l0 + e.crossMph * k, 0);
      if (a && b) { const pl = { arrow: Charts.Plot.prototype.arrow, ctx }; pl.arrow(a[0], a[1], b[0], b[1], C("--ink"), 2.4);
        ctx.fillStyle = C("--ink"); ctx.fillText(`wind ${Math.hypot(e.tailMph, e.crossMph).toFixed(0)} mph`, a[0], a[1] + 16); }
    }
    const traces = [[scen.A && scen.A.r, "--pin1", "A"], [scen.B && scen.B.r, "--pin2", "B"], [r, "--model", ""]];
    traces.forEach(([q, col, lab]) => {
      if (!q) return;
      const p3 = pts3(q);
      poly(pr, p3.map((p) => [p[0], p[1], 0]), C(col), 1, null, 0.35);                       // ground shadow
      for (let i = 0; i < p3.length; i += 25) poly(pr, [p3[i], [p3[i][0], p3[i][1], 0]], C(col), 0.6, null, 0.25);  // drop lines
      poly(pr, p3, C(col), lab ? 2 : 3, lab ? [6, 4] : null);
      const end = pr(q.carry, q.lateral, 0);
      if (end) { ctx.fillStyle = C(col); ctx.beginPath(); ctx.arc(end[0], end[1], 4, 0, 7); ctx.fill(); if (lab) ctx.fillText(lab, end[0], end[1] - 8); }
    });
    const bpos = G.at(r.traj, tball), bq = bpos && pr(bpos.x, -bpos.y, bpos.z);
    if (bq) { ctx.fillStyle = C("--surface"); ctx.strokeStyle = C("--ink"); ctx.beginPath(); ctx.arc(bq[0], bq[1], 5, 0, 7); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = C("--muted"); ctx.textAlign = "left"; ctx.font = "11.5px " + C("--font-body");
    ctx.fillText("Drag to orbit, scroll to zoom. Perspective distorts length: read values from the insets and readout.", 10, H - 10);
    drawInsets(traces);
    const d = (q) => (q ? G.fd(r.carry - q.r.carry, 1) : "–");
    ro.innerHTML = `
      <div><small>Air density ρ</small><b>${r.rho.toFixed(3)} kg/m³</b></div>
      <div><small>Carry</small><b>${G.fd(r.carry)}</b></div>
      <div><small>Lateral (+ right)</small><b>${G.fd(r.lateral)}</b></div>
      <div><small>Apex</small><b>${G.fd(r.apex)}</b></div>
      <div><small>Δ carry vs A</small><b>${d(scen.A)}</b></div>
      <div><small>Δ carry vs B</small><b>${d(scen.B)}</b></div>
      ${scen.A ? `<div style="grid-column:1/-1"><small>A</small>${scen.A.label}</div>` : ""}
      ${scen.B ? `<div style="grid-column:1/-1"><small>B</small>${scen.B.label}</div>` : ""}`;
    sTail.set(e.tailMph); sCross.set(e.crossMph); sAlt.set(e.altFt); sAx.set(G.state.shot.alpha);
  }
  function drawInsets(traces) {
    const u = G.u.dist, U = G.u.dUnit(), live = traces.filter((t) => t[0]);
    const xmax = Math.max(...live.map((t) => u(t[0].carry))) * 1.05;
    const lmax = Math.max(10, ...live.map((t) => Math.max(...t[0].traj.map((p) => Math.abs(u(p.y)))))) * 1.3;
    const zmax = Math.max(...live.map((t) => u(t[0].apex))) * 1.2;
    pT.resize(); pT.clear().domain(0, xmax, -lmax, lmax).axes(`Top view: downrange (${U})`, `Lateral (${U}, + right)`);
    pT.line([[0, 0], [xmax * 2, 0]], C("--muted"), 1, [4, 4]);
    pS.resize(); pS.clear().domain(0, xmax, 0, zmax).axes(`Side view: downrange (${U})`, `Height (${U})`);
    live.forEach(([q, col, lab]) => {
      pT.line(q.traj.map((p) => [u(p.x), -u(p.y)]), C(col), lab ? 1.6 : 2.4, lab ? [5, 3] : null);
      pS.line(q.traj.map((p) => [u(p.x), u(p.z)]), C(col), lab ? 1.6 : 2.4, lab ? [5, 3] : null);
    });
  }
  // orbit + zoom
  let drag = null;
  cv.addEventListener("pointerdown", (e) => { drag = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => {
    if (!drag) return;
    cam.yaw -= (e.clientX - drag[0]) * 0.008; cam.pitch = Math.max(0.03, Math.min(1.5, cam.pitch + (e.clientY - drag[1]) * 0.006));
    drag = [e.clientX, e.clientY]; draw();
  });
  cv.addEventListener("pointerup", () => (drag = null));
  cv.addEventListener("wheel", (e) => { e.preventDefault(); cam.dist = Math.max(0.35, Math.min(2.5, cam.dist * (e.deltaY > 0 ? 1.08 : 0.93))); draw(); }, { passive: false });
  cvt.addEventListener("mousemove", (ev) => {
    const r = G.current(), b = cvt.getBoundingClientRect(), px = ev.clientX - b.left;
    const x = pT.invX(px); const s = r.traj.find((p) => G.u.dist(p.x) >= x); if (!s) return tipT.hide();
    tipT.show(`x = ${G.fd(s.x)}<br>lateral = ${G.fd(-s.y)}<br>z = ${G.fd(s.z)}`, px, ev.clientY - b.top);
  });
  cvt.addEventListener("mouseleave", () => tipT.hide());

  draw();
  ["shot", "units", "redraw", "resize"].forEach((e) => G.on(e, draw));
})();
