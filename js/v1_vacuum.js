/* View 1 -- "Your textbook is wrong": vacuum projectile vs. the model with air.
 * Inputs: launch angle (slider).  Ball speed and spin fixed at the 2023 PGA Tour driver
 * averages (171 mph, 2545 rpm).  Measured marker = TrackMan PGA driver carry (282 yd at 10.4 deg). */
(function () {
  "use strict";
  const { P, D } = G, C = Charts.css;
  const V0 = 171 * P.C.MPH, RPM = 2545;
  const root = G.$("#v1-panel");
  const ctl = G.h("div"); root.appendChild(ctl);
  const box = G.h("div", { class: "canvas-box" }); root.appendChild(box);
  const cv = G.h("canvas", { "aria-label": "Height versus distance for a vacuum ball and a modelled ball" }); box.appendChild(cv);
  const tip = Charts.Tip(box);
  const ro = G.h("div", { class: "readout" }); root.appendChild(ro);
  const plot = new Charts.Plot(cv, { height: (w) => Math.max(240, Math.min(360, w * 0.45)), pad: { l: 56, r: 18, t: 14, b: 42 } });

  let theta = 10.4, t = 0, aspect = "stretch", vac, mod;
  const meas = D.trackman.find((r) => r.tour === "PGA" && r.club === "Driver");

  const sl = G.slider(ctl, { id: "v1-theta", label: "Launch angle θ₀", min: 0, max: 45, step: 0.1, value: theta,
    fmt: (v) => v.toFixed(1) + "°", oninput: (v) => { theta = v; t = 0; compute(); draw(); } });
  const row = G.h("div", { class: "ctl" }); ctl.appendChild(row);
  const player = G.playControl(row, (dt) => {
    const T = Math.max(vac.time, mod.time);
    if (t >= T) t = 0;               // replay from the start
    t += dt;
    if (t >= T) { t = T; draw(); return false; }
    draw();
  });
  G.button(row, "Step +0.25 s", () => { player.stop(); t = Math.min(t + 0.25, Math.max(vac.time, mod.time)); draw(); });
  G.button(row, "Reset", () => { player.stop(); theta = 10.4; sl.set(theta); t = 0; compute(); draw(); });
  G.seg(row, [["stretch", "Stretched height"], ["equal", "True shape 1:1"]], aspect, (v) => { aspect = v; draw(); }, "Aspect");

  function compute() {
    const c = G.coefParams();
    vac = P.vacuum(V0, theta);
    mod = P.simulate({ v0: V0, theta, rpm: RPM, Cd1: c.Cd1, Cl1: c.Cl1 });
    vac.pts = [];
    for (let i = 0; i <= 120; i++) {
      const tt = (vac.time * i) / 120, th = (theta * Math.PI) / 180;
      vac.pts.push([V0 * Math.cos(th) * tt, V0 * Math.sin(th) * tt - 0.5 * P.C.g * tt * tt]);
    }
  }
  function ballAt(which) {
    const th = (theta * Math.PI) / 180;
    if (which === "vac") {
      const tt = Math.min(t, vac.time);
      return [V0 * Math.cos(th) * tt, Math.max(0, V0 * Math.sin(th) * tt - 0.5 * P.C.g * tt * tt)];
    }
    const s = G.at(mod.traj, Math.min(t, mod.time)); return [s.x, s.z];
  }
  function draw() {
    const u = G.u.dist, U = G.u.dUnit();
    plot.o.equal = aspect === "equal"; plot.resize();
    const xmax = u(Math.max(vac.range, mod.carry, meas.carry_yd * P.C.YD)) * 1.06;
    const ymax = u(Math.max(vac.apex, mod.apex)) * 1.15 || 1;
    plot.clear().domain(0, xmax, 0, ymax).axes(`Distance downrange (${U})`, `Height (${U})`);
    plot.line(vac.pts.map((p) => [u(p[0]), u(p[1])]), C("--vacuum"), 2, [6, 5]);
    plot.line(mod.traj.map((p) => [u(p.x), u(p.z)]), C("--model"), 2.6);
    const mx = G.u.dist(meas.carry_yd * P.C.YD);
    plot.dot(mx, 0, 6, C("--measured"));
    plot.text(`Measured average, ${meas.launch_deg}° launch`, mx, 0, C("--measured"), "right", "bottom", null, 4, -26);
    const bv = ballAt("vac"), bm = ballAt("mod");
    plot.dot(u(bv[0]), u(bv[1]), 5, C("--surface"), C("--vacuum"));
    plot.dot(u(bm[0]), u(bm[1]), 5, C("--model"), C("--surface"));
    plot.text("vacuum (no air)", u(vac.pts[60][0]), u(vac.pts[60][1]), C("--vacuum"), "center", "bottom", null, 0, -6);
    const top = mod.traj.reduce((a, b) => (b.z > a.z ? b : a));
    plot.text("model with air", u(top.x), u(top.z), C("--model"), "center", "bottom", null, 0, -8);
    const d = (m) => G.fd(m, 0);
    ro.innerHTML = `
      <div><small>Vacuum carry</small><b>${d(vac.range)}</b></div>
      <div><small>Model carry</small><b>${d(mod.carry)}</b></div>
      <div><small>Measured (TrackMan, ${meas.launch_deg}°)</small><b>${d(meas.carry_yd * P.C.YD)}</b></div>
      <div><small>Vacuum apex / model apex</small><b>${G.u.dist(vac.apex).toFixed(0)} / ${G.u.dist(mod.apex).toFixed(0)} ${U}</b></div>
      <div><small>Clock</small><b>${t.toFixed(2)} s</b></div>`;
  }
  // hover: nearest sample on either curve
  cv.addEventListener("mousemove", (ev) => {
    const r = cv.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top, u = G.u.dist;
    let best = null;
    const test = (x, z, tt, name) => {
      const dd = Math.hypot(plot.X(u(x)) - px, plot.Y(u(z)) - py);
      if (dd < 18 && (!best || dd < best.dd)) best = { dd, x, z, tt, name };
    };
    vac.pts.forEach((p, i) => test(p[0], p[1], (vac.time * i) / 120, "Vacuum"));
    mod.traj.forEach((p) => test(p.x, p.z, p.t, "Model"));
    if (!best) return tip.hide();
    tip.show(`${best.name}<br>x = ${G.fd(best.x)}<br>z = ${G.fd(best.z)}<br>t = ${best.tt.toFixed(2)} s`, px, py);
  });
  cv.addEventListener("mouseleave", () => tip.hide());

  compute(); draw();
  G.on("shot", () => { compute(); draw(); });       // coefficient set may change
  G.on("units", draw); G.on("redraw", draw); G.on("resize", draw);
})();
