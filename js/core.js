/* core.js -- shared "current shot" state, units, events and small UI helpers.
 * Every view reads the same state, so changing the shot anywhere updates all views. */
(function () {
  "use strict";
  const P = window.GolfPhysics;
  const D = window.GOLF_DATA;
  const G = (window.G = { P, D });

  const DEFAULT = () => ({
    shot: { mph: 171, theta: 10.4, rpm: 2545, alpha: 0 },
    env: { tailMph: 0, crossMph: 0, altFt: 0 },
    coef: "raw", units: "golf",
    loaded: { tour: "PGA", club: "Driver" },
    tf: 0.12,                              // shared time cursor for Views 2-3 (fraction of flight)
  });
  G.state = DEFAULT();
  G.DEFAULT = DEFAULT;

  /* ---------------- events ---------------- */
  const subs = {};
  G.on = (e, fn) => (subs[e] = subs[e] || []).push(fn);
  G.emit = (e, arg) => (subs[e] || []).forEach((fn) => fn(arg));

  /* ---------------- model plumbing ---------------- */
  G.coefParams = (set) => D.validation.coef_sets[set || G.state.coef];
  G.params = (over = {}) => {
    const s = G.state.shot, e = G.state.env, c = G.coefParams();
    return Object.assign({
      v0: s.mph * P.C.MPH, theta: s.theta, rpm: s.rpm, alpha: s.alpha,
      wx: e.tailMph * P.C.MPH, wy: e.crossMph * P.C.MPH, alt: e.altFt * P.C.FT,
      Cd1: c.Cd1, Cl1: c.Cl1,
    }, over);
  };
  let cache = null, cacheKey = "";
  G.current = () => {
    const key = JSON.stringify([G.state.shot, G.state.env, G.state.coef]);
    if (key !== cacheKey) { cache = P.simulate(G.params()); cacheKey = key; }
    return cache;
  };
  /** Interpolate a recorded trajectory at time t (s). */
  G.at = (traj, t) => {
    if (!traj.length) return null;
    if (t <= traj[0].t) return traj[0];
    const last = traj[traj.length - 1];
    if (t >= last.t) return last;
    let lo = 0, hi = traj.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (traj[m].t <= t) lo = m; else hi = m; }
    const a = traj[lo], b = traj[hi], f = (t - a.t) / (b.t - a.t), o = {};
    for (const k in a) o[k] = a[k] + f * (b[k] - a[k]);
    return o;
  };

  let pending = false;
  G.update = (partial = {}, opts = {}) => {
    if (partial.shot) Object.assign(G.state.shot, partial.shot);
    if (partial.env) Object.assign(G.state.env, partial.env);
    if (partial.coef) G.state.coef = partial.coef;
    if (partial.shot && !opts.keepClub) G.state.loaded = null;
    if (opts.club) G.state.loaded = opts.club;
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; G.emit("shot"); });
  };
  G.loadClub = (tour, club) => {
    const r = D.trackman.find((d) => d.tour === tour && d.club === club && d.complete);
    if (!r) return false;
    G.update({ shot: { mph: r.ball_mph, theta: r.launch_deg, rpm: r.spin_rpm, alpha: 0 } }, { club: { tour, club } });
    return true;
  };
  G.loadedRow = () => G.state.loaded &&
    D.trackman.find((d) => d.tour === G.state.loaded.tour && d.club === G.state.loaded.club);

  /* ---------------- units ---------------- */
  G.u = {
    golf: () => G.state.units === "golf",
    dist: (m) => (G.u.golf() ? m / P.C.YD : m),
    dUnit: () => (G.u.golf() ? "yd" : "m"),
    speed: (ms) => (G.u.golf() ? ms / P.C.MPH : ms),
    sUnit: () => (G.u.golf() ? "mph" : "m/s"),
    alt: (ft) => (G.u.golf() ? ft : ft * P.C.FT),
    aUnit: () => (G.u.golf() ? "ft" : "m"),
    spin: (rpm) => (G.u.golf() ? rpm : (rpm * 2 * Math.PI) / 60),
    wUnit: () => (G.u.golf() ? "rpm" : "rad/s"),
  };
  G.fd = (m, dp = 1) => G.u.dist(m).toFixed(dp) + " " + G.u.dUnit();
  G.fs = (ms, dp = 1) => G.u.speed(ms).toFixed(dp) + " " + G.u.sUnit();
  G.fw = (rpm) => (G.u.golf() ? Math.round(rpm) + " rpm" : ((rpm * 2 * Math.PI) / 60).toFixed(1) + " rad/s");

  /* ---------------- DOM helpers ---------------- */
  G.$ = (sel, root = document) => root.querySelector(sel);
  G.h = (tag, attrs = {}, html = "") => {
    const el = document.createElement(tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (html) el.innerHTML = html;
    return el;
  };
  /** Labeled range slider.  fmt(v) gives the displayed value (unit-aware). */
  G.slider = (parent, o) => {
    const row = G.h("label", { class: "slider", for: o.id });
    row.innerHTML = `<span>${o.label}</span><input type="range" id="${o.id}" min="${o.min}" max="${o.max}" step="${o.step}" value="${o.value}"><output></output>`;
    parent.appendChild(row);
    const inp = row.querySelector("input"), out = row.querySelector("output");
    const show = () => (out.textContent = o.fmt(+inp.value));
    inp.addEventListener("input", () => { show(); o.oninput(+inp.value); });
    show();
    return { input: inp, set(v) { inp.value = v; show(); }, refresh: show };
  };
  G.button = (parent, label, fn, cls = "") => {
    const b = G.h("button", { type: "button", class: cls }, label);
    b.addEventListener("click", fn); parent.appendChild(b); return b;
  };
  /** Segmented toggle.  options: [[value,label],...] */
  G.seg = (parent, options, value, onchange, aria) => {
    const wrap = G.h("div", { class: "seg", role: "group", "aria-label": aria || "" });
    const btns = options.map(([v, l]) => {
      const b = G.h("button", { type: "button", "aria-pressed": String(v === value) }, l);
      b.addEventListener("click", () => { set(v); onchange(v); });
      wrap.appendChild(b); return [v, b];
    });
    function set(v) { btns.forEach(([bv, b]) => b.setAttribute("aria-pressed", String(bv === v))); }
    parent.appendChild(wrap);
    return { set };
  };
  /** Animation clock: calls tick(dtSeconds); respects reduced motion by stepping coarser. */
  G.player = (tick, onstate) => {
    let raf = 0, last = 0, playing = false;
    const loop = (ts) => {
      if (!playing) return;
      const dt = last ? Math.min((ts - last) / 1000, 0.1) : 0; last = ts;
      if (tick(dt) === false) { stop(); return; }
      raf = requestAnimationFrame(loop);
    };
    function play() { if (playing) return; playing = true; last = 0; raf = requestAnimationFrame(loop); onstate && onstate(true); }
    function stop() { playing = false; cancelAnimationFrame(raf); onstate && onstate(false); }
    return { play, stop, toggle: () => (playing ? stop() : play()), get playing() { return playing; } };
  };
  /** Play/pause button wired to an animation clock. Returns the player. */
  G.playControl = (parent, tick) => {
    let b = null;
    const p = G.player(tick, (on) => { if (b) b.textContent = on ? "❚❚ Pause" : "▶ Play"; });
    b = G.button(parent, "▶ Play", () => p.toggle());
    return p;
  };
  G.fracBadge = (f) => {
    const pct = Math.round(f * 100);
    if (pct === 0) return `<span class="flag ok">Inside the model's fitted range for the whole flight</span>`;
    if (pct < 25) return `<span class="flag ok">Mostly inside the fitted range (${pct}% of flight outside S 0.08–0.20, Re 70k–210k)</span>`;
    return `<span class="flag warn">Extrapolated: ${pct}% of flight outside the fitted range (S 0.08–0.20, Re 70k–210k)</span>`;
  };

  /* redraw on resize / theme change */
  let rz = 0;
  window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => G.emit("resize"), 120); });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => G.emit("redraw"));
  new MutationObserver(() => G.emit("redraw")).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
})();
