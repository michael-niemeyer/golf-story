"""
model.py -- Python/NumPy twin of js/physics.js (SCIENTIFIC SIMULATION).

Vectorised: integrates N shots at once with RK4 (dt = 1 ms), so the
View-5 launch-window grid (tens of thousands of shots) runs in seconds.
Same equations, constants, frame and landing rule as the JavaScript model;
prep/crosscheck.js verifies the two agree (check N3).

Frame: x downrange, y LEFT, z up (right-handed). Lateral (display) = -y.
"""
import numpy as np

C = dict(m=0.04593, D=0.04267, g=9.81, mu=1.81e-5, rho0=1.225,
         T0=288.15, L=0.0065, M=0.0289644, R=8.31446,
         MPH=0.44704, YD=0.9144, FT=0.3048,
         Cd1=0.24, Cd2=0.18, Cd3=0.06, Cl1=0.54, R1=2e-5, A1=90000.0, A2=200000.0,
         ReMin=70000.0, ReMax=210000.0, SMin=0.08, SMax=0.20)
C["r"] = C["D"] / 2
C["A"] = np.pi * C["r"] ** 2


def rho_at(h):
    expo = C["g"] * C["M"] / (C["R"] * C["L"]) - 1
    return C["rho0"] * (1 - C["L"] * np.asarray(h, float) / C["T0"]) ** expo


def _bcast(n, v):
    return np.broadcast_to(np.asarray(v, float), (n,)).copy()


def simulate(v0, theta, rpm, alpha=0.0, wx=0.0, wy=0.0, alt=0.0,
             Cd1=C["Cd1"], Cd2=C["Cd2"], Cd3=C["Cd3"], Cl1=C["Cl1"], R1=C["R1"],
             mode="full", dimples=True, dt=1e-3, t_max=20.0, record=False):
    """All inputs SI (v0 m/s, angles deg, rpm, wind m/s, alt m); arrays broadcast.
    mode: 'full' | 'drag' | 'vacuum'.  Returns dict of arrays (and traj if record)."""
    n = max(np.size(a) for a in (v0, theta, rpm, alpha, wx, wy, alt, Cd1, Cl1))
    v0, theta, rpm, alpha, wx, wy, alt, Cd1, Cl1 = (_bcast(n, a) for a in
                                                   (v0, theta, rpm, alpha, wx, wy, alt, Cd1, Cl1))
    rho = rho_at(alt)
    a = np.radians(alpha)
    ax_hat = np.stack([np.zeros(n), -np.cos(a), -np.sin(a)], 1)
    wind = np.stack([wx, -wy, np.zeros(n)], 1)          # display-right -> internal -y
    th = np.radians(theta)
    st = np.zeros((n, 7))
    st[:, 3] = v0 * np.cos(th)
    st[:, 5] = v0 * np.sin(th)
    st[:, 6] = rpm * 2 * np.pi / 60
    r, m, A, g = C["r"], C["m"], C["A"], C["g"]

    def deriv(s):
        u_vec = s[:, 3:6] - wind
        u = np.linalg.norm(u_vec, axis=1)
        u = np.where(u == 0, 1e-12, u)
        w = s[:, 6]
        S = r * w / u
        Re = rho * u * C["D"] / C["mu"]
        if mode == "vacuum":
            CD = np.zeros(n); CL = np.zeros(n)
        else:
            CD = (Cd1 + Cd2 * S + Cd3 * np.sin(np.pi * (Re - C["A1"]) / C["A2"])) if dimples \
                else np.full(n, 0.5)
            CL = np.zeros(n) if mode == "drag" else Cl1 * np.maximum(S, 0) ** 0.4
        q = 0.5 * rho * A
        acc = -(q * CD * u)[:, None] * u_vec / m
        acc[:, 2] -= g
        cr = np.cross(ax_hat, u_vec / u[:, None])
        nrm = np.linalg.norm(cr, axis=1)
        ok = (CL != 0) & (w > 0) & (nrm > 1e-12)
        FL = np.where(ok, q * CL * u * u, 0.0)
        acc += np.where(ok[:, None], FL[:, None] * cr / np.where(nrm == 0, 1, nrm)[:, None], 0) / m
        dw = np.zeros(n) if mode == "vacuum" else -R1 * u * w / r
        d = np.concatenate([s[:, 3:6], acc, dw[:, None]], 1)
        return d, S, Re, CD, CL, q * CD * u * u, FL

    active = np.ones(n, bool)
    land = np.full((n, 7), np.nan)
    t_land = np.full(n, np.nan)
    apex = np.zeros(n)
    outside = np.zeros(n)
    steps = np.zeros(n)
    t = 0.0
    k = 0
    traj = [] if record else None
    d1, S, Re, CD, CL, FD, FL = deriv(st)
    if record:
        traj.append((t, st.copy(), S, Re, CD, CL, FD, FL))
    while active.any() and t < t_max:
        k2 = deriv(st + dt / 2 * d1)[0]
        k3 = deriv(st + dt / 2 * k2)[0]
        k4 = deriv(st + dt * k3)[0]
        nx = st + dt / 6 * (d1 + 2 * k2 + 2 * k3 + k4)
        t += dt
        k += 1
        hit = active & (nx[:, 2] < 0) & (st[:, 2] >= 0)
        if hit.any():
            f = st[hit, 2] / (st[hit, 2] - nx[hit, 2])
            land[hit] = st[hit] + f[:, None] * (nx[hit] - st[hit])
            t_land[hit] = t - dt + f * dt
            active &= ~hit
        st = np.where(active[:, None], nx, st)
        steps += active
        d1, S, Re, CD, CL, FD, FL = deriv(st)
        if mode != "vacuum":
            out = (S < C["SMin"]) | (S > C["SMax"]) | (Re < C["ReMin"]) | (Re > C["ReMax"])
            outside += active & out
        apex = np.where(active, np.maximum(apex, st[:, 2]), apex)
        if record and k % 10 == 0:
            traj.append((t, st.copy(), S, Re, CD, CL, FD, FL))
    vh = np.hypot(land[:, 3], land[:, 4])
    res = dict(ok=~np.isnan(t_land), carry=land[:, 0], lateral=-land[:, 1], apex=apex,
               time=t_land, land_angle=np.degrees(np.arctan2(-land[:, 5], vh)),
               frac_outside=(np.zeros(n) if mode == "vacuum" else outside / np.maximum(steps + 1, 1)),
               rho=rho)
    if record:
        res["traj"] = traj
    return res


def vacuum(v0, theta):
    th = np.radians(theta)
    return dict(range=v0 ** 2 * np.sin(2 * th) / C["g"],
                apex=v0 ** 2 * np.sin(th) ** 2 / (2 * C["g"]),
                time=2 * v0 * np.sin(th) / C["g"])
