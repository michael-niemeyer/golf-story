"""
grid.py -- precompute the View-5 launch-window maps.

For every distinct measured ball speed in the TrackMan table, simulate a
61 x 61 grid of launch angle (0-30 deg, 0.5 deg steps) x spin
(1000-10000 rpm, 150 rpm steps) for both coefficient sets.
Output: data/grid.json (carry in tenths of a yard, % of flight outside
the Smits & Smith fitted range).

Usage: python3 prep/grid.py      (after prepare.py; ~5-10 min)
"""
import json, sys, time
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "prep"))
import model as M  # noqa: E402

THETA = np.round(np.arange(0, 30.01, 0.5), 2)
RPM = np.arange(1000, 10001, 150)


def main():
    tm = json.loads((ROOT / "data" / "trackman.json").read_text())
    cs = json.loads((ROOT / "data" / "validation.json").read_text())["coef_sets"]
    speeds = sorted({int(r["ball_mph"]) if float(r["ball_mph"]).is_integer() else r["ball_mph"] for r in tm if r["complete"]})
    T, W = np.meshgrid(THETA, RPM, indexing="ij")          # [theta, rpm]
    out = dict(theta=THETA.tolist(), rpm=RPM.tolist(), speeds_mph=speeds,
               clubs={str(s): [f'{r["tour"]} {r["club"]}' for r in tm
                               if r["complete"] and r["ball_mph"] == s] for s in speeds},
               sets={})
    for name, c in cs.items():
        out["sets"][name] = {}
        for s in speeds:
            t0 = time.time()
            res = M.simulate(s * M.C["MPH"], T.ravel(), W.ravel(), Cd1=c["Cd1"], Cl1=c["Cl1"])
            carry = np.where(res["ok"], res["carry"] / M.C["YD"], 0)
            out["sets"][name][str(s)] = dict(
                carry10=np.round(carry * 10).astype(int).tolist(),
                outside=np.round(res["frac_outside"] * 100).astype(int).tolist())
            i = int(np.argmax(carry))
            print(f"{name:10s} {s:5.0f} mph  max {carry[i]:6.1f} yd at "
                  f"{T.ravel()[i]:4.1f} deg, {W.ravel()[i]:5.0f} rpm  ({time.time()-t0:4.1f}s)", flush=True)
    (ROOT / "data" / "grid.json").write_text(json.dumps(out, separators=(",", ":")))
    print("wrote data/grid.json")


if __name__ == "__main__":
    main()
