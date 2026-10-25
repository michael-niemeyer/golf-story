/* ===================================================================
 *  physics.js  --  Golf-ball flight model (SCIENTIFIC SIMULATION)
 *  Point-mass, 3-D, RK4.  Aerodynamics from Smits & Smith (1994).
 *  Runs in the browser (window.GolfPhysics) and in Node (module.exports)
 *  so the same code is cross-checked against the Python twin.
 *
 *  Internal frame (right-handed):  x = downrange, y = LEFT, z = up.
 *  Display convention:  lateral = -y  (positive = right of target).
 * =================================================================== */
(function (root) {
  "use strict";

  const C = {
    m: 0.04593,           // kg   (Rules: max mass 45.93 g)
    D: 0.04267,           // m    (Rules: min diameter 42.67 mm)
    g: 9.81,              // m/s^2
    mu: 1.81e-5,          // Pa*s dynamic viscosity of air (15 C)
    rho0: 1.225,          // kg/m^3 sea-level standard density
    T0: 288.15, L: 0.0065, M: 0.0289644, R: 8.31446,  // US Std Atmosphere 1976
    MPH: 0.44704, YD: 0.9144, FT: 0.3048,
    // Smits & Smith (1994) wind-tunnel constants
    Cd1: 0.24, Cd2: 0.18, Cd3: 0.06, Cl1: 0.54, R1: 2e-5, A1: 90000, A2: 200000,
    // Fitted validity range stated by Smits & Smith
    ReMin: 70000, ReMax: 210000, SMin: 0.08, SMax: 0.20,
  };
  C.r = C.D / 2;
  C.A = Math.PI * C.r * C.r;

  /** Air density at altitude h (m), troposphere model. */
  function rhoAt(h) {
    const expo = (C.g * C.M) / (C.R * C.L) - 1;
    return C.rho0 * Math.pow(1 - (C.L * h) / C.T0, expo);
  }

  /** Default parameter set.  mode: 'full' | 'drag' (no lift) | 'vacuum' */
  function defaults() {
    return {
      v0: 171 * C.MPH, theta: 10.4, rpm: 2545, alpha: 0,   // launch
      wx: 0, wy: 0, alt: 0,                                // environment (wx + = tailwind, wy + = blowing to the RIGHT)
      Cd1: C.Cd1, Cd2: C.Cd2, Cd3: C.Cd3, Cl1: C.Cl1, R1: C.R1,
      mode: "full", dimples: true,                         // dimples:false -> smooth-sphere Cd = 0.5 (illustrative)
      dt: 0.001, tMax: 20, record: true,
    };
  }

  function coefficients(S, Re, p) {
    if (p.mode === "vacuum") return { CD: 0, CL: 0 };
    let CD = p.dimples
      ? p.Cd1 + p.Cd2 * S + p.Cd3 * Math.sin((Math.PI * (Re - C.A1)) / C.A2)
      : 0.5;
    const CL = p.mode === "drag" ? 0 : p.Cl1 * Math.pow(Math.max(S, 0), 0.4);
    return { CD, CL };
  }

  /**
   * State y = [x, y, z, vx, vy, vz, omega].  Returns derivative and diagnostics.
   */
  function deriv(st, p, env) {
    const vx = st[3], vy = st[4], vz = st[5], w = st[6];
    const ux = vx - env.wxI, uy = vy - env.wyI, uz = vz;     // velocity relative to air
    const u = Math.hypot(ux, uy, uz) || 1e-12;
    const S = (C.r * w) / u;
    const Re = (env.rho * u * C.D) / C.mu;
    const { CD, CL } = coefficients(S, Re, p);
    const q = 0.5 * env.rho * C.A;                            // N per (m/s)^2
    // drag: -q CD u * u_vec
    let ax = (-q * CD * u * ux) / C.m;
    let ay = (-q * CD * u * uy) / C.m;
    let az = (-q * CD * u * uz) / C.m - C.g;
    // lift: q CL u^2 * (w_hat x u_hat)/|.|
    let FL = 0, lx = 0, ly = 0, lz = 0;
    if (CL !== 0 && w > 0) {
      const wxh = env.axis[0], wyh = env.axis[1], wzh = env.axis[2];
      const hx = ux / u, hy = uy / u, hz = uz / u;
      let cx = wyh * hz - wzh * hy, cy = wzh * hx - wxh * hz, cz = wxh * hy - wyh * hx;
      const n = Math.hypot(cx, cy, cz);
      if (n > 1e-12) {
        FL = q * CL * u * u;
        lx = (FL * cx) / n; ly = (FL * cy) / n; lz = (FL * cz) / n;
        ax += lx / C.m; ay += ly / C.m; az += lz / C.m;
      }
    }
    // spin decay (Smits & Smith): (dw/dt) r^2/u^2 = -R1 S  ->  dw/dt = -R1 u w / r
    const dw = p.mode === "vacuum" ? 0 : (-p.R1 * u * w) / C.r;
    return {
      d: [vx, vy, vz, ax, ay, az, dw],
      diag: { u, S, Re, CD, CL, FD: q * CD * u * u, FL, lx, ly, lz },
    };
  }

  function makeEnv(p) {
    const a = (p.alpha * Math.PI) / 180;
    return {
      rho: rhoAt(p.alt),
      wxI: p.wx, wyI: -p.wy,                                  // display-right -> internal -y
      axis: [0, -Math.cos(a), -Math.sin(a)],                  // +alpha tilts lift to the right (fade)
    };
  }

  /** Integrate one shot.  Returns summary + optional trajectory samples. */
  function simulate(userP) {
    const p = Object.assign(defaults(), userP || {});
    const env = makeEnv(p);
    const th = (p.theta * Math.PI) / 180;
    let st = [0, 0, 0, p.v0 * Math.cos(th), 0, p.v0 * Math.sin(th), (p.rpm * 2 * Math.PI) / 60];
    const dt = p.dt;
    let t = 0, apex = 0, outside = 0, steps = 0;
    const traj = [];
    const push = (s, tt, dg) => traj.push({
      t: tt, x: s[0], y: s[1], z: s[2], vx: s[3], vy: s[4], vz: s[5], w: s[6],
      u: dg.u, S: dg.S, Re: dg.Re, CD: dg.CD, CL: dg.CL, FD: dg.FD, FL: dg.FL,
      lx: dg.lx, ly: dg.ly, lz: dg.lz,
    });
    let k1 = deriv(st, p, env);
    if (p.record) push(st, t, k1.diag);
    const add = (a, b, h) => a.map((v, i) => v + h * b[i]);
    let landed = null, flag = "ok";
    while (t < p.tMax) {
      const d1 = k1.d;
      const d2 = deriv(add(st, d1, dt / 2), p, env).d;
      const d3 = deriv(add(st, d2, dt / 2), p, env).d;
      const d4 = deriv(add(st, d3, dt), p, env).d;
      const nx = st.map((v, i) => v + (dt / 6) * (d1[i] + 2 * d2[i] + 2 * d3[i] + d4[i]));
      t += dt; steps++;
      if (!nx.every(Number.isFinite)) { flag = "non-finite"; break; }
      if (nx[2] < 0 && st[2] >= 0) {
        const f = st[2] / (st[2] - nx[2]);                    // linear interpolation to z = 0
        landed = st.map((v, i) => v + f * (nx[i] - v));
        landed.t = t - dt + f * dt;
        break;
      }
      st = nx;
      k1 = deriv(st, p, env);
      const dg = k1.diag;
      if (p.mode !== "vacuum" &&
          (dg.S < C.SMin || dg.S > C.SMax || dg.Re < C.ReMin || dg.Re > C.ReMax)) outside++;
      if (st[2] > apex) apex = st[2];
      if (p.record && steps % 10 === 0) push(st, t, dg);
    }
    if (!landed) {
      return { ok: false, flag: flag === "ok" ? "no-landing" : flag, traj, params: p };
    }
    if (p.record) push(landed, landed.t, deriv(landed, p, env).diag);
    const vh = Math.hypot(landed[3], landed[4]);
    return {
      ok: true, flag: "ok", params: p, traj,
      carry: landed[0],                                       // m downrange
      lateral: -landed[1],                                    // m, + = right
      apex, time: landed.t,
      landAngle: (Math.atan2(-landed[5], vh) * 180) / Math.PI,
      landSpeed: Math.hypot(landed[3], landed[4], landed[5]),
      fracOutside: p.mode === "vacuum" ? 0 : outside / Math.max(steps, 1),
      rho: env.rho,
    };
  }

  /** Closed-form vacuum projectile (for View 1 and check N1). */
  function vacuum(v0, thetaDeg) {
    const th = (thetaDeg * Math.PI) / 180;
    return {
      range: (v0 * v0 * Math.sin(2 * th)) / C.g,
      apex: (v0 * v0 * Math.sin(th) ** 2) / (2 * C.g),
      time: (2 * v0 * Math.sin(th)) / C.g,
    };
  }

  const api = { C, rhoAt, defaults, coefficients, simulate, vacuum };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GolfPhysics = api;
})(typeof window !== "undefined" ? window : globalThis);
