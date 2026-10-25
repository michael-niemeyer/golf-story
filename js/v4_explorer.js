/* View 4 -- Launch explorer.  Sliders write the shared current shot; up to three shots can be pinned.
 * Orange ground markers = TrackMan 2023 measured average carry for each club of the chosen tour. */
(function () {
  "use strict";
  const { P, D } = G, C = Charts.css;
  const root = G.$("#v4-panel");
  const top = G.h("div", { class: "grid2" }); root.appendChild(top);
  const left = G.h("div"), right = G.h("div"); top.append(left, right);

  const pick = G.h("label", { class: "ctl" });
  pick.innerHTML = `<span style="color:var(--muted);font-size:13px">Load measured club</span>`;
  const sel = G.h("select", { id: "v4-club", "aria-label": "Load a club's TrackMan averages" });
  sel.innerHTML = `<option value="">Custom shot</option>` + ["PGA", "LPGA"].map((t) =>
    `<optgroup label="${t} Tour 2023">` + D.trackman.filter((r) => r.tour === t).map((r) =>
      `<option value="${t}|${r.club}" ${r.complete ? "" : "disabled"}>${t} ${r.club}${r.complete ? "" : " (no data in table)"}</option>`).join("") + "</optgroup>").join("");
  pick.appendChild(sel); left.appendChild(pick);
  sel.addEventListener("change", () => { if (sel.value) { const [t, c] = sel.value.split("|"); G.loadClub(t, c); } });

  const S = G.state.shot;
  const sv = G.slider(left, { id: "v4-v0", label: "Ball speed v₀", min: 40, max: 190, step: 1, value: S.mph,
    fmt: (v) => G.fs(v * P.C.MPH, G.u.golf() ? 0 : 1), oninput: (v) => G.update({ shot: { mph: v } }) });
  const st = G.slider(left, { id: "v4-theta", label: "Launch angle θ₀", min: 0, max: 45, step: 0.1, value: S.theta,
    fmt: (v) => v.toFixed(1) + "°", oninput: (v) => G.update({ shot: { theta: v } }) });
  const sw = G.slider(left, { id: "v4-rpm", label: "Spin ω₀", min: 0, max: 10000, step: 1, value: S.rpm,
    fmt: (v) => G.fw(v), oninput: (v) => G.update({ shot: { rpm: v } }) });
  const sa = G.slider(left, { id: "v4-alpha", label: "Spin-axis tilt α", min: -30, max: 30, step: 0.5, value: S.alpha,
    fmt: (v) => (v > 0 ? "+" : "") + v.toFixed(1) + "°", oninput: (v) => G.update({ shot: { alpha: v } }) });
  const tourRow = G.h("div", { class: "ctl" }); left.appendChild(tourRow);
  tourRow.appendChild(G.h("span", { style: "font-size:13px;color:var(--muted)" }, "Measured markers"));
  let tour = "PGA";
  G.seg(tourRow, [["PGA", "PGA"], ["LPGA", "LPGA"]], tour, (v) => { tour = v; draw(); }, "Tour markers");
  const btns = G.h("div", { class: "ctl" }); left.appendChild(btns);
  const pins = [];
  G.button(btns, "Pin this shot", () => {
    const r = G.current(); if (!r.ok) return;
    if (pins.length === 3) pins.shift();
    pins.push({ traj: r.traj.map((p) => ({ x: p.x, z: p.z, y: p.y })), carry: r.carry,
      label: (G.state.loaded ? `${G.state.loaded.tour} ${G.state.loaded.club}` : `${S.mph.toFixed(0)} mph, ${S.theta.toFixed(1)}°, ${S.rpm} rpm`) });
    draw();
  });
  G.button(btns, "Clear pins", () => { pins.length = 0; draw(); });
  G.button(btns, "Reset shot", () => { G.loadClub("PGA", "Driver"); });
  const badge = G.h("div"); left.appendChild(badge);

  const box = G.h("div", { class: "canvas-box" }); right.appendChild(box);
  const cv = G.h("canvas", { "aria-label": "Trajectory of the current shot with pinned shots" }); box.appendChild(cv);
  const tip = Charts.Tip(box);
  const ro = G.h("div", { class: "readout" }); right.appendChild(ro);
  const plot = new Charts.Plot(cv, { height: (w) => Math.max(260, Math.min(380, w * 0.5)), pad: { l: 50, r: 14, t: 16, b: 42 } });
  const pinColors = ["--pin1", "--pin2", "--pin3"];

  function syncControls() {
    sv.set(S.mph); st.set(S.theta); sw.set(S.rpm); sa.set(S.alpha);
    sel.value = G.state.loaded ? `${G.state.loaded.tour}|${G.state.loaded.club}` : "";
  }
  function draw() {
    const r = G.current(), u = G.u.dist, U = G.u.dUnit();
    const meas = D.trackman.filter((m) => m.tour === tour && m.complete);
    const xmax = Math.max(u(r.carry || 0), ...pins.map((p) => u(p.carry)), ...meas.map((m) => u(m.carry_yd * P.C.YD))) * 1.07;
    const zmax = Math.max(u(r.apex || 0), ...pins.map((p) => Math.max(...p.traj.map((q) => u(q.z)))), u(30)) * 1.2;
    plot.resize();
    plot.clear().domain(0, xmax, 0, zmax).axes(`Carry distance (${U})`, `Height (${U}), stretched`);
    meas.forEach((m, i) => {
      const x = u(m.carry_yd * P.C.YD);
      plot.dot(x, 0, 4.5, C("--measured"));
      plot.text(m.club.replace("-iron", "i").replace("-wood", "w").replace("Hybrid", "Hy").replace("Driver", "Dr"),
        x, 0, C("--measured"), "center", "bottom", "10.5px " + C("--font-body"), 0, i % 2 ? -18 : -7);
    });
    pins.forEach((p, i) => {
      plot.line(p.traj.map((q) => [u(q.x), u(q.z)]), C(pinColors[i]), 1.8, [5, 4]);
      plot.text(`Pin ${i + 1}: ${p.label}`, plot.x1, zmax * (0.96 - i * 0.07), C(pinColors[i]), "right", "middle", "11.5px " + C("--font-body"), -6);
    });
    if (r.ok) {
      plot.line(r.traj.map((p) => [u(p.x), u(p.z)]), C("--model"), 2.8);
      const ap = r.traj.reduce((a, b) => (b.z > a.z ? b : a));
      plot.line([[u(ap.x), 0], [u(ap.x), u(ap.z)]], C("--muted"), 1, [2, 3]);
      plot.dot(u(r.carry), 0, 5, C("--model"), C("--surface"));
    }
    const row = G.loadedRow();
    const err = row && row.complete ? r.carry / P.C.YD - row.carry_yd : null;
    ro.innerHTML = r.ok ? `
      <div><small>Carry</small><b>${G.fd(r.carry)}</b></div>
      <div><small>Apex</small><b>${G.fd(r.apex)}</b></div>
      <div><small>Flight time</small><b>${r.time.toFixed(2)} s</b></div>
      <div><small>Landing angle</small><b>${r.landAngle.toFixed(1)}°</b></div>
      <div><small>Lateral (+ right)</small><b>${G.fd(r.lateral)}</b></div>
      ${row ? `<div><small>Measured carry (${row.tour} ${row.club})</small><b>${G.fd(row.carry_yd * P.C.YD, 0)}</b></div>
      <div><small>Model − measured</small><b>${err >= 0 ? "+" : ""}${G.fd(err * P.C.YD)}</b></div>` : ""}` :
      `<div><small>Result</small><b>No landing within 20 s (${r.flag})</b></div>`;
    badge.innerHTML = r.ok ? G.fracBadge(r.fracOutside) : "";
    syncControls();
  }
  cv.addEventListener("mousemove", (ev) => {
    const r = G.current(), b = cv.getBoundingClientRect(), px = ev.clientX - b.left, py = ev.clientY - b.top, u = G.u.dist;
    let best = null;
    r.traj.forEach((p) => { const d = Math.hypot(plot.X(u(p.x)) - px, plot.Y(u(p.z)) - py); if (d < 20 && (!best || d < best.d)) best = { d, p }; });
    if (!best) return tip.hide();
    const p = best.p;
    tip.show(`x = ${G.fd(p.x)}, z = ${G.fd(p.z)}<br>t = ${p.t.toFixed(2)} s<br>u = ${G.fs(p.u)}<br>S = ${p.S.toFixed(3)}`, px, py);
  });
  cv.addEventListener("mouseleave", () => tip.hide());

  draw();
  ["shot", "units", "redraw", "resize"].forEach((e) => G.on(e, draw));
  G.on("units", () => [sv, sw].forEach((s) => s.refresh()));
})();
