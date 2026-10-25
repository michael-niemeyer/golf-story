/* View 2 -- The three forces.  Free-body vectors on the path + force-vs-time chart.
 * Data: recorded trajectory of the CURRENT SHOT (shared state).  Time cursor is shared with View 3. */
(function () {
  "use strict";
  const { P } = G, C = Charts.css;

  /* shared time clock for Views 2 & 3: advances G.state.tf in real time */
  const clocks = [];
  G.timeClock = (parent) => {
    const p = G.playControl(parent, (dt) => {
      const T = G.current().time;
      if (G.state.tf >= 1) G.state.tf = 0;
      G.state.tf = Math.min(1, G.state.tf + dt / T);
      G.emit("time");
      if (G.state.tf >= 1) return false;
    });
    clocks.push(p);
    return p;
  };
  G.stopClocks = () => clocks.forEach((c) => c.stop());
  G.setTime = (f) => { G.state.tf = Math.max(0, Math.min(1, f)); G.emit("time"); };

  const root = G.$("#v2-panel");
  const ctl = G.h("div", { class: "ctl" }); root.appendChild(ctl);
  G.timeClock(ctl);
  G.button(ctl, "Step +0.25 s", () => { G.stopClocks(); G.setTime(G.state.tf + 0.25 / G.current().time); });
  G.button(ctl, "Reset", () => { G.stopClocks(); G.setTime(0.12); });
  const tslider = G.slider(root, { id: "v2-time", label: "Time in flight", min: 0, max: 1, step: 0.001, value: G.state.tf,
    fmt: (f) => (f * G.current().time).toFixed(2) + " s", oninput: (f) => { G.stopClocks(); G.setTime(f); } });

  const b1 = G.h("div", { class: "canvas-box" }), b2 = G.h("div", { class: "canvas-box" });
  root.append(b1, b2);
  const cv1 = G.h("canvas", { "aria-label": "Free-body diagram along the flight path" }); b1.appendChild(cv1);
  const cv2 = G.h("canvas", { "aria-label": "Force magnitude versus time" }); b2.appendChild(cv2);
  const tip = Charts.Tip(b2);
  const ro = G.h("div", { class: "readout" }); root.appendChild(ro);
  const note = G.h("p", { class: "notice" }); root.appendChild(note);
  // True-shape (1:1) path so force and velocity directions are drawn at their real angles.
  const pathHeight = (w) => {
    const r = G.current(); if (!r.ok) return 220;
    return Math.max(190, Math.min(380, ((w - 62) * (r.apex * 1.8)) / (r.carry * 1.05) + 52));
  };
  const pPath = new Charts.Plot(cv1, { height: pathHeight, equal: true, pad: { l: 50, r: 12, t: 12, b: 40 } });
  const pF = new Charts.Plot(cv2, { height: 230, pad: { l: 50, r: 12, t: 12, b: 40 } });

  function draw() {
    const r = G.current(); if (!r.ok) return;
    const tr = r.traj, T = r.time, t = G.state.tf * T, s = G.at(tr, t), u = G.u.dist, U = G.u.dUnit();
    const mg = P.C.m * P.C.g;
    tslider.set(G.state.tf);
    // ---- path + vectors
    pPath.resize();
    pPath.clear().domain(0, u(r.carry) * 1.05, 0, u(r.apex) * 1.8).axes(`Downrange (${U}), true shape 1:1`, `Height (${U})`);
    pPath.line(tr.map((p) => [u(p.x), u(p.z)]), C("--model"), 2, null, 0.45);
    const fmax = Math.max(mg, ...tr.map((p) => Math.max(p.FD, p.FL)));
    const k = 110 / fmax;                                    // px per newton (shared by all three arrows)
    const bx = pPath.X(u(s.x)), by = pPath.Y(u(s.z));
    const sp = Math.hypot(s.vx, s.vz) || 1;
    const ux = s.vx - G.params().wx, uz = s.vz, us = Math.hypot(ux, uz) || 1;
    pPath.arrow(bx, by, bx, by + mg * k, C("--weight"));
    pPath.arrow(bx, by, bx - (s.FD * k * ux) / us, by + (s.FD * k * uz) / us, C("--drag"));
    pPath.arrow(bx, by, bx + s.lx * k, by - s.lz * k, C("--lift"));
    pPath.arrow(bx, by, bx + (30 * s.vx) / sp, by - (30 * s.vz) / sp, C("--muted"), 1.2);
    pPath.dot(u(s.x), u(s.z), 5, C("--ink"));
    const g = pPath.ctx; g.font = "12px " + C("--font-body");
    [["weight mg", C("--weight")], ["drag F_D", C("--drag")], ["lift F_L", C("--lift")], ["velocity (direction only)", C("--muted")]]
      .forEach(([l, c], i) => { g.fillStyle = c; g.fillText(l, pPath.o.pad.l + 8, pPath.o.pad.t + 14 + i * 15); });
    g.fillStyle = C("--muted"); g.textAlign = "right";
    g.fillText(`arrow scale: 1 N = ${k.toFixed(0)} px`, pPath.W - 14, pPath.o.pad.t + 14);
    // ---- force vs time
    pF.resize();
    pF.clear().domain(0, T, 0, fmax * 1.1).axes("Time (s)", "Force (N)");
    pF.line([[0, mg], [T, mg]], C("--weight"), 2);
    pF.line(tr.map((p) => [p.t, p.FD]), C("--drag"), 2.2);
    pF.line(tr.map((p) => [p.t, p.FL]), C("--lift"), 2.2);
    pF.line([[t, 0], [t, fmax * 1.1]], C("--ink"), 1, [4, 4]);
    pF.text("weight", T, mg, C("--weight"), "right", "bottom", null, -4, -3);
    ro.innerHTML = `
      <div><small>t</small><b>${t.toFixed(2)} s</b></div>
      <div><small>Air speed u</small><b>${G.fs(s.u)}</b></div>
      <div><small>Spin</small><b>${G.fw((s.w * 60) / (2 * Math.PI))}</b></div>
      <div><small>Weight mg</small><b>${mg.toFixed(3)} N</b></div>
      <div><small>Drag F_D</small><b>${s.FD.toFixed(3)} N</b></div>
      <div><small>Lift F_L</small><b>${s.FL.toFixed(3)} N</b></div>`;
    const ratio = s.FL / mg;
    note.innerHTML = ratio > 1
      ? `<b>Lift exceeds weight</b> (${ratio.toFixed(2)} × mg): the ball is still being pushed upward, which is why a drive climbs on a straight-ish line instead of a parabola.`
      : `Lift is now <b>${ratio.toFixed(2)} × mg</b>. Speed has fallen, so drag and lift have both shrunk (they scale with u²) and gravity wins.`;
  }
  cv2.addEventListener("mousemove", (ev) => {
    const r = G.current(), b = cv2.getBoundingClientRect(), px = ev.clientX - b.left;
    const t = pF.invX(px); if (t < 0 || t > r.time) return tip.hide();
    const s = G.at(r.traj, t);
    tip.show(`t = ${t.toFixed(2)} s<br>F_D = ${s.FD.toFixed(3)} N<br>F_L = ${s.FL.toFixed(3)} N<br>mg = ${(P.C.m * P.C.g).toFixed(3)} N`, px, ev.clientY - b.top);
  });
  cv2.addEventListener("mouseleave", () => tip.hide());
  cv2.addEventListener("click", (ev) => { const b = cv2.getBoundingClientRect(); G.stopClocks(); G.setTime(pF.invX(ev.clientX - b.left) / G.current().time); });

  draw();
  ["shot", "time", "units", "redraw", "resize"].forEach((e) => G.on(e, draw));
})();
