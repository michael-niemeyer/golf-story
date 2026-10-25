"""
prepare.py -- data-to-visual workflow for "Dimples, Drag, and Backspin".

  raw CSV (hand-transcribed TrackMan 2023 Tour averages)
    -> clean + unit conversion + completeness flag        (pandas)
    -> SQLite golf.db: trackman_avg, runs, run_landing, trajectory
    -> calibration of Cd1, Cl1 inside Smits & Smith's trajectory-fit ranges
    -> validation runs (raw + calibrated) for every complete row
    -> SQL views run_summary / validation + MAE query  (queries.sql)
    -> JSON exports consumed by the web page (data/*.json)

Usage:  python3 prep/prepare.py          (from the project root)
        python3 prep/grid.py             (View-5 grid, slower; run after this)
"""
import json, sqlite3, sys
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "prep"))
import model as M  # noqa: E402

DATA = ROOT / "data"
MPH, YD = 0.44704, 0.9144
REQUIRED = ["ball_mph", "launch_deg", "spin_rpm", "carry_yd"]


# ---------------------------------------------------------------- 1. clean
def load_clean():
    raw = pd.read_csv(DATA / "trackman_2023_raw.csv")
    df = raw.copy()
    df["complete"] = df[REQUIRED].notna().all(axis=1).astype(int)
    # missing data: rows are NOT imputed; they are kept with complete = 0
    df["v0_ms"] = df["ball_mph"] * MPH
    df["carry_m_calc"] = df["carry_yd"] * YD
    df["omega0_rads"] = df["spin_rpm"] * 2 * np.pi / 60
    df["S0"] = M.C["r"] * df["omega0_rads"] / df["v0_ms"]
    df["Re0"] = M.C["rho0"] * df["v0_ms"] * M.C["D"] / M.C["mu"]
    # sanity: TrackMan's own metre column vs our conversion. Both columns are rounded
    # independently, so they may differ by at most 0.5 yd * 0.9144 + 0.5 m = 0.957 m.
    diff = (df["carry_m_calc"] - df["carry_m"]).abs()
    assert (diff[df.complete == 1] <= 0.5 * YD + 0.5).all(), "yd/m mismatch in source table"
    print("max yd->m rounding gap (m):", round(diff.max(), 3))
    return df


# ---------------------------------------------------------------- 2. calibrate
def calibrate(df):
    """Fit Cd1, Cl1 to the PGA driver carry, only inside the ranges Smits & Smith
    report from 7 measured driver trajectories: Cd1 = 0.21 +/- 0.01, Cl1 = 0.51 +/- 0.02."""
    d = df[(df.tour == "PGA") & (df.club == "Driver")].iloc[0]
    cd = np.round(np.arange(0.20, 0.2201, 0.0025), 4)
    cl = np.round(np.arange(0.49, 0.5301, 0.0025), 4)
    CD, CL = np.meshgrid(cd, cl, indexing="ij")
    res = M.simulate(d.v0_ms, d.launch_deg, d.spin_rpm, Cd1=CD.ravel(), Cl1=CL.ravel())
    err = res["carry"] / YD - d.carry_yd
    i = int(np.argmin(np.abs(err)))
    best = dict(Cd1=float(CD.ravel()[i]), Cl1=float(CL.ravel()[i]),
                carry_yd=float(res["carry"][i] / YD), target_yd=float(d.carry_yd),
                err_yd=float(err[i]), err_pct=float(100 * err[i] / d.carry_yd),
                within_5pct=bool(abs(err[i]) <= 0.05 * d.carry_yd),
                search=dict(Cd1=[float(cd[0]), float(cd[-1])], Cl1=[float(cl[0]), float(cl[-1])],
                            step=0.0025, n=int(CD.size)),
                surface=dict(Cd1=cd.tolist(), Cl1=cl.tolist(),
                             carry_yd=np.round(res["carry"] / YD, 2).reshape(CD.shape).tolist()))
    return best


# ---------------------------------------------------------------- 3. runs -> SQLite
def build_db(df, coef_sets):
    db = sqlite3.connect(ROOT / "prep" / "golf.db")
    cols = ["tour", "club", "club_order", "club_mph", "ball_mph", "launch_deg", "spin_rpm",
            "apex_yd", "land_deg", "carry_yd", "source_year", "complete",
            "v0_ms", "omega0_rads", "S0", "Re0"]
    df[cols].to_sql("trackman_avg", db, if_exists="replace", index=False)
    runs, land, traj = [], [], []
    run_id = 0
    ok = df[df.complete == 1]
    for name, cs in coef_sets.items():
        for mode in ["full", "drag", "vacuum"]:
            res = M.simulate(ok.v0_ms.values, ok.launch_deg.values, ok.spin_rpm.values,
                             Cd1=cs["Cd1"], Cl1=cs["Cl1"], mode=mode, record=True)
            for j, (_, row) in enumerate(ok.iterrows()):
                run_id += 1
                runs.append(dict(run_id=run_id, tour=row.tour, club=row.club, coef_set=name, mode=mode,
                                 v0_ms=row.v0_ms, theta0_deg=row.launch_deg, rpm0=row.spin_rpm,
                                 alpha_deg=0, wx_ms=0, wy_ms=0, alt_m=0, rho=float(res["rho"][j]),
                                 Cd1=cs["Cd1"], Cl1=cs["Cl1"], R1=M.C["R1"]))
                land.append(dict(run_id=run_id, carry_m=float(res["carry"][j]),
                                 t_land_s=float(res["time"][j]), land_deg=float(res["land_angle"][j]),
                                 lateral_m=float(res["lateral"][j]),
                                 frac_outside=float(res["frac_outside"][j])))
                for (t, st, S, Re, CD, CL, FD, FL) in res["traj"]:
                    if np.isnan(res["time"][j]) or t > res["time"][j]:
                        continue
                    traj.append((run_id, round(t, 3), st[j, 0], st[j, 1], st[j, 2], st[j, 3], st[j, 4],
                                 st[j, 5], st[j, 6], S[j], Re[j], CD[j], CL[j], FD[j], FL[j]))
    pd.DataFrame(runs).to_sql("runs", db, if_exists="replace", index=False)
    pd.DataFrame(land).to_sql("run_landing", db, if_exists="replace", index=False)
    pd.DataFrame(traj, columns=["run_id", "t_s", "x_m", "y_m", "z_m", "vx", "vy", "vz", "omega_rads",
                                "S", "Re", "CD", "CL", "FD_N", "FL_N"]).to_sql(
        "trajectory", db, if_exists="replace", index=False)
    sql = (ROOT / "prep" / "queries.sql").read_text()
    ddl, final = sql.split("-- 3)")
    db.executescript(ddl)
    final = "-- 3)" + final
    mae = pd.read_sql(final, db)
    val = pd.read_sql("SELECT * FROM validation ORDER BY coef_set, tour, club_order", db)
    var = pd.read_sql("""SELECT r.tour, r.club, r.coef_set, r.mode, ROUND(l.carry_m/0.9144,2) AS carry_yd
                         FROM runs r JOIN run_landing l USING(run_id)""", db)
    counts = dict(trackman_avg=len(df), runs=len(runs), trajectory=len(traj))
    db.commit(); db.close()
    return mae, val, var, counts


def main():
    df = load_clean()
    print("rows:", len(df), "complete:", int(df.complete.sum()),
          "missing:", df.loc[df.complete == 0, ["tour", "club"]].values.tolist())
    cal = calibrate(df)
    print("calibration:", {k: v for k, v in cal.items() if k != "surface"})
    coef_sets = {"raw": dict(Cd1=M.C["Cd1"], Cl1=M.C["Cl1"]),
                 "calibrated": dict(Cd1=cal["Cd1"], Cl1=cal["Cl1"])}
    mae, val, var, counts = build_db(df, coef_sets)
    print(mae.to_string(index=False))
    print("table sizes:", counts)

    # ------------------------------------------------------------ JSON exports
    recs = json.loads(df.replace({np.nan: None}).to_json(orient="records"))
    (DATA / "trackman.json").write_text(json.dumps(recs, indent=1))
    variants = {}
    for r in var.itertuples():
        variants.setdefault(f"{r.coef_set}|{r.tour}|{r.club}", {})[r.mode] = r.carry_yd
    out = dict(coef_sets=coef_sets, calibration=cal,
               validation=json.loads(val.to_json(orient="records")),
               mae=json.loads(mae.to_json(orient="records")),
               variants=variants,
               missing=df.loc[df.complete == 0, ["tour", "club"]].to_dict(orient="records"),
               table_sizes=counts)
    (DATA / "validation.json").write_text(json.dumps(out, indent=1))
    print("wrote data/trackman.json, data/validation.json")


if __name__ == "__main__":
    main()
