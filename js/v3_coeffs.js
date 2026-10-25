/* View 3 -- Where lift and drag come from: C_D and C_L versus spin ratio S.
 * Curves = Smits & Smith (1994) model; marker = the current shot at the shared time cursor.
 * "Dimples off" swaps in a smooth-sphere C_D of 0.5 (subcritical value cited by Smits & Smith). */
(function () {
  "use strict";
  const { P } = G, C = Charts.css;
  const root = G.$("#v3-panel");
  const ctl = G.h("div", { class: "ctl" }); root.appendChild(ctl);
  G.timeClock(ctl);
  G.button(ctl, "Reset", () => { G.stopClocks(); dimples = true; dseg.set(true); G.setTime(0.12); draw(); });
  let dimples = true;
  const dseg = G.seg(ctl, [[true, "Dimpled ball"], [false, "Smooth sphere (illustrative)"]], true, (v) => { dimples = v; draw(); }, "Ball surface");

  const row = G.h("div", { class: "row2" }); root.appendChild(row);
  const b1 = G.h("div", { class: "canvas-box" }); row.appendChild(b1);
  const cv = G.h("canvas", { "aria-label": "Drag and lift coefficients versus spin ratio" }); b1.appendChild(cv);
  const tip = Charts.Tip(b1);
  const b2 = G.h("div", { class: "canvas-box" }); row.appendChild(b2);
  const cvm = G.h("canvas", { "aria-label": "Qualitative Magnus-effect schematic" }); b2.appendChild(cvm);
  const ro = G.h("div", { class: "readout" }); root.appendChild(ro);
  const plot = new Charts.Plot(cv, { height: 300, pad: { l: 50, r: 96, t: 14, b: 42 } });
  const sch = new Charts.Plot(cvm, { height: 300, pad: { l: 0, r: 0, t: 0, b: 0 } });
  let smoothCarry = null, smoothKey = "";

  const cd = (S, Re) => P.coefficients(S, Re, Object.assign(P.defaults(), G.params(), { mode: "full", dimples })).CD;
  const cl = (S) => P.coefficients(S, 1e5, Object.assign(P.defaults(), G.params(), { mode: "full", dimples: true })).CL;

  function draw() {
    const r = G.current(); if (!r.ok) return;
    const s = G.at(r.traj, G.state.tf * r.time);
    const Smax = Math.max(0.35, ...r.traj.map((p) => p.S)) * 1.08;
    plot.resize();
    plot.clear().domain(0, Smax, 0, Math.max(0.6, cl(Smax) * 1.1)).axes("Spin ratio S = rω / u", "Coefficient (dimensionless)");
    // fitted validity band
    plot.clip((g) => { g.fillStyle = C("--sunk"); g.fillRect(plot.X(P.C.SMin), plot.o.pad.t, plot.X(P.C.SMax) - plot.X(P.C.SMin), plot.ph); });
    plot.text("fitted range", (P.C.SMin + P.C.SMax) / 2, plot.y1, C("--muted"), "center", "top", "11px " + C("--font-body"), 0, 4);
    const xs = Array.from({ length: 121 }, (_, i) => (Smax * i) / 120);
    [70000, 140000, 210000].forEach((Re) => plot.line(xs.map((S) => [S, cd(S, Re)]), C("--drag"), 1, [3, 3], 0.55));
    plot.line(xs.map((S) => [S, cd(S, s.Re)]), C("--drag"), 2.4);
    plot.line(xs.map((S) => [S, cl(S)]), C("--lift"), 2.4);
    plot.text("C_L (lift)", Smax, cl(Smax), C("--lift"), "left", "bottom", "600 11.5px " + C("--font-body"), 6, -3);
    plot.text(`C_D, Re ${Math.round(s.Re / 1000)}k`, Smax, cd(Smax, s.Re), C("--drag"), "left", "top", "600 11.5px " + C("--font-body"), 6, 3);
    plot.text("dashed: Re 70k / 140k / 210k", Smax, 0.03, C("--muted"), "right", "bottom", "11px " + C("--font-body"));
    // the current shot's path through coefficient space
    plot.line(r.traj.map((p) => [p.S, p.CL]), C("--model"), 1.4, null, 0.6);
    plot.dot(s.S, s.CL, 6, C("--model"), C("--surface"));
    plot.dot(s.S, cd(s.S, s.Re), 6, C("--model"), C("--surface"));
    plot.text("current shot", s.S, s.CL, C("--model"), "left", "top", "600 12px " + C("--font-body"), 8, 6);
    drawSchematic(s);
    // carry with dimples vs smooth (computed on demand)
    const key = JSON.stringify(G.params());
    if (key !== smoothKey) { smoothCarry = P.simulate(Object.assign(G.params(), { dimples: false, record: false })).carry; smoothKey = key; }
    ro.innerHTML = `
      <div><small>S at t</small><b>${s.S.toFixed(3)}</b></div>
      <div><small>Re at t</small><b>${Math.round(s.Re).toLocaleString()}</b></div>
      <div><small>C_D at t</small><b>${cd(s.S, s.Re).toFixed(3)}</b></div>
      <div><small>C_L at t</small><b>${s.CL.toFixed(3)}</b></div>
      <div><small>Carry, dimpled</small><b>${G.fd(r.carry, 0)}</b></div>
      <div><small>Carry, smooth C_D 0.5</small><b>${G.fd(smoothCarry, 0)}</b></div>`;
  }

  // Qualitative schematic: backspin carries the airflow over the top and throws the wake down,
  // so the air pushes the ball up.  Not a flow simulation.
  let phase = 0;
  function drawSchematic(s) {
    sch.resize();
    const g = sch.ctx, W = sch.W, H = sch.H, cx = W * 0.45, cy = H * 0.5, R = Math.min(W, H) * 0.16;
    g.clearRect(0, 0, W, H);
    g.fillStyle = C("--sunk"); g.fillRect(0, 0, W, H);
    g.strokeStyle = C("--muted"); g.lineWidth = 1.3;
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      const y0 = cy + k * R * 0.55;
      const defl = (-R * 0.9) * (1 / (1 + Math.abs(k) * 0.6)) * (dimples ? 1 : 0.6);
      g.beginPath(); g.moveTo(8, y0);
      for (let x = 8; x <= W - 8; x += 4) {
        const dx = (x - cx) / (R * 1.6);
        const bump = Math.exp(-dx * dx) * (k > 0 ? 1 : -1) * R * 0.5 / Math.abs(k);
        const wake = x > cx ? (1 - Math.exp(-(((x - cx) / (R * 2)) ** 2))) * -defl : 0;
        g.lineTo(x, y0 - bump + wake);
      }
      g.stroke();
    }
    g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.fillStyle = C("--surface"); g.fill();
    g.strokeStyle = C("--ink"); g.lineWidth = 1.5; g.stroke();
    if (dimples) { g.fillStyle = C("--line"); for (let a = 0; a < 18; a++) { const aa = a * 0.35 + phase, rr = R * (a % 3 === 0 ? 0.35 : 0.7); g.beginPath(); g.arc(cx + rr * Math.cos(aa), cy + rr * Math.sin(aa), 2.2, 0, 7); g.fill(); } }
    g.strokeStyle = C("--model"); g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, R * 1.25, -Math.PI * 0.95, -Math.PI * 0.35); g.stroke();
    const ax = cx + R * 1.25 * Math.cos(-Math.PI * 0.35), ay = cy + R * 1.25 * Math.sin(-Math.PI * 0.35);
    sch.arrow(ax - 6, ay - 7, ax + 1, ay + 1, C("--model"), 2);
    sch.arrow(cx, cy - R - 6, cx, cy - R - 6 - 50 * Math.min(1.2, s.FL / (P.C.m * P.C.g)), C("--lift"), 2.6);
    sch.arrow(W - 60, 22, W - 110, 22, C("--muted"), 1.4);
    g.font = "12px " + C("--font-body"); g.fillStyle = C("--ink"); g.textAlign = "left";
    g.fillText("air (relative)", W - 108, 40);
    g.fillStyle = C("--lift"); g.fillText("lift", cx + 8, cy - R - 40);
    g.fillStyle = C("--model"); g.fillText("backspin", cx - R * 1.6, cy - R * 1.3);
    g.fillStyle = C("--muted"); g.font = "italic 11.5px " + C("--font-body");
    g.fillText("Qualitative sketch, not a flow simulation.", 10, H - 40);
    g.fillText("Backspin deflects the wake downward, so the", 10, H - 25);
    g.fillText("air pushes the ball upward (Magnus effect).", 10, H - 10);
  }
  G.on("time", () => { phase -= 0.15; });

  cv.addEventListener("mousemove", (ev) => {
    const b = cv.getBoundingClientRect(), px = ev.clientX - b.left, py = ev.clientY - b.top;
    const S = plot.invX(px); if (S < 0 || S > plot.x1) return tip.hide();
    const Re = G.at(G.current().traj, G.state.tf * G.current().time).Re;
    tip.show(`S = ${S.toFixed(3)}<br>C_L = ${cl(S).toFixed(3)}<br>C_D = ${cd(S, Re).toFixed(3)} (Re ${Math.round(Re / 1000)}k)`, px, py);
  });
  cv.addEventListener("mouseleave", () => tip.hide());

  draw();
  ["shot", "time", "units", "redraw", "resize"].forEach((e) => G.on(e, draw));
})();
