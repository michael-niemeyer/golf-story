"""
checks.py -- numerical and boundary-case verification (Section 4 of the report).
Writes data/checks.json, read by the Methods section of the web page.

Usage: python3 prep/checks.py   (after prepare.py; needs node for check N3)
"""
import json, subprocess, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "prep"))
import model as M  # noqa: E402

C, YD, MPH = M.C, 0.9144, 0.44704
out = []


def record(cid, kind, name, expected, observed, passed):
    out.append(dict(id=cid, kind=kind, name=name, expected=expected, observed=observed, passed=bool(passed)))
    print(f"[{'PASS' if passed else 'FAIL'}] {cid} {name}: {observed}")


# ---------------- N1 analytic vacuum check + energy conservation
errs = []
for v0, th in [(30, 45), (76.4, 10.4), (50, 60), (20, 15)]:
    r = M.simulate(v0, th, 3000, mode="vacuum", record=True)
    a = M.vacuum(v0, th)
    errs += [abs(r["carry"][0] / a["range"] - 1), abs(r["apex"][0] / a["apex"] - 1), abs(r["time"][0] / a["time"] - 1)]
    E = [0.5 * M.C["m"] * np.sum(st[0, 3:6] ** 2) + M.C["m"] * C["g"] * st[0, 2] for (_, st, *_r) in r["traj"]]
    errs.append(abs(max(E) - min(E)) / E[0])
record("N1", "numerical", "Vacuum mode matches R = v0^2 sin2θ/g, H, T and conserves energy",
       "max relative error < 0.1%", f"max relative error = {100 * max(errs):.5f}%", max(errs) < 1e-3)

# ---------------- N2 time-step convergence
d = []
for v, th, w in [(171, 10.4, 2545), (123, 16.1, 7124)]:
    a = M.simulate(v * MPH, th, w, dt=1e-3)["carry"][0]
    b = M.simulate(v * MPH, th, w, dt=5e-4)["carry"][0]
    d.append(abs(a - b) / YD)
record("N2", "numerical", "Halving Δt (1 ms → 0.5 ms) changes carry by < 0.1 yd",
       "< 0.1 yd", f"max change = {max(d):.5f} yd", max(d) < 0.1)

# ---------------- N3 JavaScript vs Python on 100 random shots
rng = np.random.default_rng(5745)
n = 100
cases = dict(v0=rng.uniform(40, 190, n) * MPH, theta=rng.uniform(2, 40, n), rpm=rng.uniform(500, 9500, n),
             alpha=rng.uniform(-25, 25, n), wx=rng.uniform(-10, 10, n), wy=rng.uniform(-10, 10, n),
             alt=rng.uniform(0, 2400, n))
py = M.simulate(**cases)
inp = [{k: float(v[i]) for k, v in cases.items()} for i in range(n)]
(ROOT / "prep" / "xcheck_in.json").write_text(json.dumps(inp))
subprocess.run(["node", str(ROOT / "prep" / "crosscheck.js"), str(ROOT / "prep" / "xcheck_in.json"),
                str(ROOT / "prep" / "xcheck_out.json")], check=True)
js = json.loads((ROOT / "prep" / "xcheck_out.json").read_text())
diff = max(abs(js[i]["carry"] - py["carry"][i]) / YD for i in range(n))
dlat = max(abs(js[i]["lateral"] - py["lateral"][i]) / YD for i in range(n))
record("N3", "numerical", "Browser (JavaScript) and Python models agree on 100 random shots",
       "carry difference < 0.01 yd", f"max |Δcarry| = {diff:.2e} yd, max |Δlateral| = {dlat:.2e} yd", diff < 0.01)

# ---------------- N4 calibration target
val = json.loads((ROOT / "data" / "validation.json").read_text())
cal = val["calibration"]
record("N4", "numerical", "Calibrated PGA driver carry within ±5% of 282 yd (Cd1, Cl1 inside paper's ranges)",
       "|error| ≤ 5% (14.1 yd)", f"{cal['carry_yd']:.1f} yd, error {cal['err_yd']:+.1f} yd ({cal['err_pct']:+.2f}%), "
       f"Cd1 = {cal['Cd1']}, Cl1 = {cal['Cl1']}", cal["within_5pct"])

# ---------------- N5 worked example at t = 0 (PGA driver, wind-tunnel constants), by hand vs model
v0, w0 = 171 * MPH, 2545 * 2 * np.pi / 60
S0 = C["r"] * w0 / v0
Re0 = C["rho0"] * v0 * C["D"] / C["mu"]
CD0 = C["Cd1"] + C["Cd2"] * S0 + C["Cd3"] * np.sin(np.pi * (Re0 - C["A1"]) / C["A2"])
CL0 = C["Cl1"] * S0 ** 0.4
q = 0.5 * C["rho0"] * C["A"] * v0 ** 2
FD0, FL0 = q * CD0, q * CL0
r = M.simulate(v0, 10.4, 2545, record=True)
_, st, S, Re, CD, CL, FD, FL = r["traj"][0]
hand = dict(S0=S0, Re0=Re0, CD0=CD0, CL0=CL0, FD0_N=FD0, FL0_N=FL0, weight_N=C["m"] * C["g"])
model0 = dict(S0=S[0], Re0=Re[0], CD0=CD[0], CL0=CL[0], FD0_N=FD[0], FL0_N=FL[0])
ok = all(abs(hand[k] - model0[k]) <= 1e-9 * max(1, abs(hand[k])) for k in model0)
record("N5", "numerical", "Worked example at launch, PGA driver: hand calculation = model state at t = 0",
       "identical to 1e-9", ", ".join(f"{k} = {hand[k]:.4g}" for k in hand), ok)
worked = dict(hand=hand, model=model0)

# ---------------- B1 vertical launch in vacuum
r = M.simulate(30.0, 90.0, 0, mode="vacuum")
T = 2 * 30.0 / C["g"]
record("B1", "boundary", "θ0 = 90° in vacuum returns to x = 0 after T = 2v0/g",
       f"x = 0, T = {T:.4f} s", f"x = {r['carry'][0]:.2e} m, T = {r['time'][0]:.4f} s",
       abs(r["carry"][0]) < 1e-6 and abs(r["time"][0] - T) < 1e-3)

# ---------------- B2 zero spin: no lift, tilt has no effect
r = M.simulate(171 * MPH, 12, 0, alpha=20, record=True)
maxFL = max(float(FLk[0]) for (*_a, FLk) in r["traj"])
record("B2", "boundary", "ω0 = 0: lift is exactly zero and a 20° tilted axis gives no curve",
       "F_L = 0, lateral = 0", f"max F_L = {maxFL:.1e} N, lateral = {r['lateral'][0]:.1e} m",
       maxFL == 0 and abs(r["lateral"][0]) < 1e-9)

# ---------------- B3 flat launch
a = M.simulate(171 * MPH, 0, 0)
b = M.simulate(171 * MPH, 0, 6000)
record("B3", "boundary", "θ0 = 0°: no spin lands almost at once (no error); strong backspin makes the ball climb",
       "small finite carry; apex > 0 with spin", f"no spin: carry {a['carry'][0] / YD:.2f} yd in {a['time'][0]:.3f} s; "
       f"6000 rpm: apex {b['apex'][0] / YD:.1f} yd, carry {b['carry'][0] / YD:.0f} yd",
       bool(a["ok"][0]) and a["carry"][0] / YD < 5 and b["apex"][0] > 1)

# ---------------- B4 sea level density
rho = float(M.rho_at(0.0))
record("B4", "boundary", "h = 0: air density is exactly 1.225 kg/m³", "1.225", f"{rho:.6f}", rho == 1.225)

# ---------------- B5 validity edges flagged, extremes do not crash
it = M.simulate(123 * MPH, 16.1, 7124)
ext = M.simulate(40 * MPH, 45, 10000)
record("B5", "boundary", "Model-validity edges: PGA 7-iron is flagged as extrapolated; 40 mph + 10,000 rpm does not crash",
       "7-iron > 50% outside; extreme run finite", f"7-iron {100 * it['frac_outside'][0]:.0f}% of flight outside fit; "
       f"extreme run ok = {bool(ext['ok'][0])}, carry {ext['carry'][0] / YD:.1f} yd, {100 * ext['frac_outside'][0]:.0f}% outside",
       it["frac_outside"][0] > 0.5 and np.isfinite(ext["carry"][0]))

# ---------------- B6 missing data not imputed
n_val = sum(1 for v in val["validation"] if v["coef_set"] == "raw")
record("B6", "boundary", "Missing LPGA 3-iron row is excluded, not imputed",
       "23 validated rows of 24; LPGA 3-iron absent",
       f"{n_val} rows validated; missing = {val['missing']}",
       n_val == 23 and val["missing"] == [{"tour": "LPGA", "club": "3-iron"}])

(ROOT / "data" / "checks.json").write_text(json.dumps(dict(checks=out, worked_example=worked), indent=1))
print(f"{sum(c['passed'] for c in out)}/{len(out)} checks passed -> data/checks.json")
