/* main.js -- top bar (shot summary, coefficient set, units, theme, reset), evidence summary,
 * and the Methods section, all generated from the same data files the views use. */
(function () {
  "use strict";
  const { P, D } = G;

  /* ---------------- top bar ---------------- */
  const chip = G.$("#shotchip");
  function updChip() {
    const s = G.state.shot, e = G.state.env, l = G.state.loaded;
    chip.textContent = `${l ? l.tour + " " + l.club + " · " : "Custom · "}${G.fs(s.mph * P.C.MPH, 0)} · ${s.theta.toFixed(1)}° · ${G.fw(s.rpm)}` +
      (s.alpha ? ` · tilt ${s.alpha > 0 ? "+" : ""}${s.alpha}°` : "") +
      (e.tailMph || e.crossMph ? ` · wind ${e.tailMph}/${e.crossMph} mph` : "") + (e.altFt ? ` · ${e.altFt} ft` : "");
  }
  const coefsel = G.$("#coefsel");
  coefsel.addEventListener("change", () => { G.update({ coef: coefsel.value }, { keepClub: true }); G.emit("coef", coefsel.value); });
  const useg = G.seg(G.$("#unitseg"), [["golf", "yd · mph"], ["si", "m · m/s"]], "golf", (v) => { G.state.units = v; G.emit("units"); updChip(); }, "Units");
  const root = document.documentElement;
  G.seg(G.$("#themeseg"), [["", "Auto"], ["light", "Light"], ["dark", "Dark"]], "", (v) => {
    if (v) root.setAttribute("data-theme", v); else root.removeAttribute("data-theme");
  }, "Theme");
  G.$("#resetall").addEventListener("click", () => {
    const d = G.DEFAULT();
    G.state.units = d.units; useg.set("golf"); coefsel.value = "raw";
    G.update({ shot: d.shot, env: d.env, coef: "raw" }, { club: d.loaded });
    G.stopClocks(); G.setTime(d.tf); G.emit("coef", "raw"); G.emit("units");
  });
  G.on("shot", updChip); updChip();

  /* nav highlight */
  const links = [...document.querySelectorAll(".nav a")];
  const obs = new IntersectionObserver((ents) => ents.forEach((e) => {
    if (e.isIntersecting) links.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id));
  }), { rootMargin: "-40% 0px -55% 0px" });
  document.querySelectorAll("section.view").forEach((s) => obs.observe(s));

  /* ---------------- evidence summary (computed, not typed) ---------------- */
  const V = D.validation, raw = V.coef_sets.raw;
  const drv = D.trackman.find((r) => r.tour === "PGA" && r.club === "Driver");
  const base = { v0: drv.ball_mph * P.C.MPH, theta: drv.launch_deg, rpm: drv.spin_rpm, Cd1: raw.Cd1, Cl1: raw.Cl1, record: false };
  const sim = (o) => P.simulate(Object.assign({}, base, o));
  const yd = (m) => (m / P.C.YD).toFixed(0);
  const still = sim({}), head = sim({ wx: -10 * P.C.MPH }), tail = sim({ wx: 10 * P.C.MPH }), denver = sim({ alt: 5280 * P.C.FT });
  const vac = P.vacuum(base.v0, base.theta);
  const vRow = (set, tour, club) => V.validation.find((r) => r.coef_set === set && r.tour === tour && r.club === club);
  const mae = (set, tour) => V.mae.find((r) => r.coef_set === set && r.tour === tour);
  const heldOut = (set) => {
    const rs = V.validation.filter((r) => r.coef_set === set && !(r.tour === "PGA" && r.club === "Driver"));
    return rs.reduce((a, r) => a + Math.abs(r.carry_err_yd), 0) / rs.length;
  };
  const irons = (set) => {
    const rs = V.validation.filter((r) => r.coef_set === set && /iron|PW/.test(r.club));
    return rs.reduce((a, r) => a + (r.model_land_deg - r.measured_land_deg), 0) / rs.length;
  };
  const GR = D.grid, L = GR.sets.raw["171"];
  let best = 0; L.carry10.forEach((v, k) => { if (v > L.carry10[best]) best = k; });
  const bi = Math.floor(best / GR.rpm.length), bj = best % GR.rpm.length;
  G.$("#insights").innerHTML = `
    <li><b>Air is not just a brake.</b> At the PGA driver's measured launch (${drv.launch_deg}°, ${drv.spin_rpm} rpm) a vacuum ball carries ${yd(vac.range)} yd, the model ${yd(still.carry)} yd, and the tour average is ${drv.carry_yd} yd. Lift from backspin more than repays drag at low launch angles.</li>
    <li><b>The wind-tunnel constants under-predict the tour driver</b> by ${Math.abs(vRow("raw", "PGA", "Driver").carry_err_yd).toFixed(0)} yd. Calibrating C<sub>d1</sub> and C<sub>l1</sub> within the paper's own ranges closes that to ${vRow("calibrated", "PGA", "Driver").carry_err_yd.toFixed(1)} yd.</li>
    <li><b>Calibrating to one club over-fits.</b> Mean absolute carry error on the 22 held-out clubs rises from ${heldOut("raw").toFixed(1)} yd (wind-tunnel constants) to ${heldOut("calibrated").toFixed(1)} yd (calibrated). The single driver target is not a good guide for irons.</li>
    <li><b>Irons land too shallow in the model</b> (mean landing-angle error ${irons("raw").toFixed(1)}° with wind-tunnel constants). These shots spend nearly all their flight at spin ratios far above the fitted range, which is where the drag fit is least trustworthy.</li>
    <li><b>There is an interior optimum.</b> At 171 mph the map's best carry is ${(L.carry10[best] / 10).toFixed(0)} yd at ${GR.theta[bi]}° and ${GR.rpm[bj]} rpm; the tour average launches ${(GR.theta[bi] - drv.launch_deg).toFixed(1)}° lower with ${Math.abs(drv.spin_rpm - GR.rpm[bj])} rpm ${drv.spin_rpm > GR.rpm[bj] ? "more" : "less"} spin, giving up roughly ${((L.carry10[best] / 10) - still.carry / P.C.YD).toFixed(0)} yd of carry (tour players also value roll and control, which this model ignores).</li>
    <li><b>Headwind hurts more than tailwind helps.</b> For the PGA driver, a 10 mph headwind costs ${yd(still.carry - head.carry)} yd but a 10 mph tailwind adds only ${yd(tail.carry - still.carry)} yd, because drag grows with the square of air speed.</li>
    <li><b>Thin air carries farther.</b> The same drive at 5,280 ft (air density ${denver.rho.toFixed(3)} kg/m³) carries ${yd(denver.carry - still.carry)} yd more than at sea level.</li>`;

  /* ---------------- Methods ---------------- */
  const CK = D.checks;
  const tm = D.trackman;
  const sample = [tm[0], tm[8], tm[11], tm[12], tm[16]];
  const f = (v, dp = 2) => (v === null || v === undefined ? "<i>null</i>" : typeof v === "number" ? (+v.toFixed(dp)).toString() : v);
  G.$("#methods-body").innerHTML = `
  <div class="grid2"><div>
    <h3>Data</h3>
    <p><span class="tag meas">Measured</span> TrackMan's published 2023 PGA Tour and LPGA Tour averages (12 clubs each), hand-transcribed into <code>data/trackman_2023_raw.csv</code>: ${tm.length} rows, ${tm.filter((r) => r.complete).length} complete. The LPGA table has no 3-iron, so that row is kept with empty fields and <code>complete = 0</code>; it is never imputed. TrackMan's own metre columns were used as a transcription check: every yard value converts to within rounding (largest gap 0.89 m, limit 0.96 m).</p>
    <p><span class="tag model">Model</span> a labeled scientific simulation, not data. Point-mass ball (m = 45.93 g, D = 42.67 mm), RK4 with Δt = 1 ms, landing found by linear interpolation to z = 0.</p>
    <h3>Equations</h3>
    <pre>m dv/dt = −mg ẑ − ½ρA C_D u u⃗ + ½ρA C_L u² (ω̂ × û)/|ω̂ × û|
u⃗ = v − w (velocity relative to the wind)
S = rω/u          Re = ρuD/μ
C_D = 0.24 + 0.18 S + 0.06 sin(π(Re − 90 000)/200 000)
C_L = 0.54 S^0.4
dω/dt = −R₁ u ω / r,   R₁ = 0.00002
ρ(h) = 1.225 (1 − 0.0065 h / 288.15)^(gM/RL − 1)</pre>
    <p class="notice">Constants from Smits &amp; Smith (1994), pp. 346–347. Calibrated set: C<sub>d1</sub> = ${V.coef_sets.calibrated.Cd1}, C<sub>l1</sub> = ${V.coef_sets.calibrated.Cl1}.</p>
  </div><div>
    <h3>Variables</h3>
    <div class="tablebox"><table><thead><tr><th>Symbol</th><th>Quantity</th><th>Units</th><th>Role</th></tr></thead><tbody>
      <tr><td>v₀</td><td>ball speed at launch</td><td>mph / m/s</td><td>input (40–190 mph)</td></tr>
      <tr><td>θ₀</td><td>vertical launch angle</td><td>deg</td><td>input (0–45)</td></tr>
      <tr><td>ω₀</td><td>initial backspin</td><td>rpm / rad/s</td><td>input (0–10,000 rpm)</td></tr>
      <tr><td>α</td><td>spin-axis tilt</td><td>deg</td><td>input (−30 to +30, + = fade)</td></tr>
      <tr><td>w<sub>x</sub>, w<sub>y</sub></td><td>tail and cross wind</td><td>mph / m/s</td><td>input (±25 mph)</td></tr>
      <tr><td>h → ρ</td><td>altitude → air density</td><td>ft / m → kg/m³</td><td>input (0–8,000 ft)</td></tr>
      <tr><td>S, Re</td><td>spin ratio, Reynolds number</td><td>dimensionless</td><td>computed each step</td></tr>
      <tr><td>C<sub>D</sub>, C<sub>L</sub></td><td>drag, lift coefficients</td><td>dimensionless</td><td>computed each step</td></tr>
      <tr><td>X<sub>c</sub>, z<sub>max</sub>, T, θ<sub>land</sub></td><td>carry, apex, flight time, landing angle</td><td>yd / m, s, deg</td><td>outputs</td></tr>
    </tbody></table></div>
  </div></div>

  <h3>Sample records (<code>trackman_avg</code>)</h3>
  <div class="tablebox"><table><thead><tr><th>tour</th><th>club</th><th class="n">ball_mph</th><th class="n">launch_deg</th><th class="n">spin_rpm</th><th class="n">apex_yd</th><th class="n">land_deg</th><th class="n">carry_yd</th><th class="n">v0_ms</th><th class="n">S0</th><th class="n">Re0</th><th class="n">complete</th></tr></thead><tbody>
  ${sample.map((r) => `<tr><td>${r.tour}</td><td>${r.club}</td><td class="n">${f(r.ball_mph, 0)}</td><td class="n">${f(r.launch_deg, 1)}</td><td class="n">${f(r.spin_rpm, 0)}</td><td class="n">${f(r.apex_yd, 0)}</td><td class="n">${f(r.land_deg, 0)}</td><td class="n">${f(r.carry_yd, 0)}</td><td class="n">${f(r.v0_ms, 2)}</td><td class="n">${f(r.S0, 4)}</td><td class="n">${r.Re0 ? Math.round(r.Re0).toLocaleString() : "<i>null</i>"}</td><td class="n">${r.complete}</td></tr>`).join("")}
  </tbody></table></div>

  <h3>Workflow</h3>
  <ol class="notice-list">
    <li><code>prep/prepare.py</code> cleans the CSV (pandas), converts units, flags completeness, and loads SQLite <code>golf.db</code>: ${V.table_sizes.trackman_avg} reference rows, ${V.table_sizes.runs} simulation runs, ${V.table_sizes.trajectory.toLocaleString()} trajectory samples.</li>
    <li>It calibrates C<sub>d1</sub> and C<sub>l1</sub> on a ${V.calibration.search.n}-point grid inside the paper's trajectory-fit ranges.</li>
    <li>It runs every complete club under vacuum, drag-only and full models for both coefficient sets, then applies <code>prep/queries.sql</code> (views <code>run_summary</code> and <code>validation</code>, plus the MAE query) and exports JSON.</li>
    <li><code>prep/grid.py</code> precomputes ${GR.speeds_mph.length} speeds × 2 coefficient sets × 3,721 shots for View 5.</li>
    <li><code>prep/checks.py</code> runs the checks below; <code>prep/bundle.py</code> packs all JSON into <code>data/bundle.js</code> so the page opens without a server.</li>
  </ol>
  <pre>-- validation view (queries.sql)
SELECT m.tour, m.club, s.coef_set, m.carry_yd AS measured_carry_yd,
       ROUND(s.carry_m / 0.9144, 2) AS model_carry_yd,
       ROUND(s.carry_m / 0.9144 - m.carry_yd, 2) AS carry_err_yd, ...
FROM trackman_avg m JOIN run_summary s ON s.tour = m.tour AND s.club = m.club AND s.mode = 'full'
WHERE m.complete = 1;</pre>

  <h3>Verification (${CK.checks.filter((c) => c.passed).length} of ${CK.checks.length} pass)</h3>
  <div class="tablebox"><table><thead><tr><th>ID</th><th>Check</th><th>Expected</th><th>Observed</th><th>Result</th></tr></thead><tbody>
  ${CK.checks.map((c) => `<tr><td>${c.id}</td><td>${c.name}</td><td>${c.expected}</td><td class="mono" style="font-size:12px">${c.observed}</td><td>${c.passed ? '<span class="flag ok">pass</span>' : '<span class="flag warn">fail</span>'}</td></tr>`).join("")}
  </tbody></table></div>

  <h3>Launch</h3>
  <p>Open <code>index.html</code> in any modern browser (no server, no internet, no libraries needed). To rebuild everything from the raw CSV: <code>python3 prep/prepare.py && python3 prep/grid.py && python3 prep/checks.py && python3 prep/bundle.py</code> (Python 3.10+, numpy, pandas; Node for check N3).</p>`;
})();
