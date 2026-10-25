-- queries.sql : summaries used by the story (run by prepare.py against golf.db)

-- 1) Per-run summary (Views 4-7). Landing values are interpolated to z = 0 in the
--    integrator and stored in run_landing; the trajectory table holds 10-ms samples.
DROP VIEW IF EXISTS run_summary;
CREATE VIEW run_summary AS
SELECT r.run_id, r.tour, r.club, r.coef_set, r.mode,
       MAX(t.z_m)           AS apex_m,
       l.t_land_s           AS flight_s,
       l.carry_m            AS carry_m,
       l.land_deg           AS land_deg,
       l.frac_outside       AS frac_outside
FROM runs r
JOIN trajectory   t ON t.run_id = r.run_id
JOIN run_landing  l ON l.run_id = r.run_id
GROUP BY r.run_id;

-- 2) Validation join (View 7): per-club error in measured units.
--    Errors are kept per club; no averaging of percentages across clubs.
DROP VIEW IF EXISTS validation;
CREATE VIEW validation AS
SELECT m.tour, m.club, m.club_order, s.coef_set,
       m.carry_yd                         AS measured_carry_yd,
       ROUND(s.carry_m / 0.9144, 2)       AS model_carry_yd,
       ROUND(s.carry_m / 0.9144 - m.carry_yd, 2) AS carry_err_yd,
       m.apex_yd                          AS measured_apex_yd,
       ROUND(s.apex_m / 0.9144, 2)        AS model_apex_yd,
       m.land_deg                         AS measured_land_deg,
       ROUND(s.land_deg, 2)               AS model_land_deg,
       ROUND(s.frac_outside, 3)           AS frac_outside
FROM trackman_avg m
JOIN run_summary s ON s.tour = m.tour AND s.club = m.club AND s.mode = 'full'
WHERE m.complete = 1;

-- 3) Summary statistic: mean absolute carry error (yards) by tour and coefficient set.
--    MAE is computed from raw yard differences, never from percentages.
SELECT tour, coef_set, COUNT(*) AS n_clubs,
       ROUND(AVG(ABS(carry_err_yd)), 2) AS mae_carry_yd,
       ROUND(AVG(ABS(model_apex_yd - measured_apex_yd)), 2) AS mae_apex_yd,
       ROUND(AVG(ABS(model_land_deg - measured_land_deg)), 2) AS mae_land_deg
FROM validation
GROUP BY tour, coef_set
ORDER BY coef_set, tour;
