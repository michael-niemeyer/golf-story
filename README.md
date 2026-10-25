# Dimples, Drag, and Backspin

An explorable story about why a golf ball flies the way it does.
Michael Niemeyer Jr., CPS*5745 Dynamic Scientific Storytelling, Midterm Project, Kean University, October 2026.

## Launch

Double-click `index.html`. It runs in any modern browser with no server, no internet and no installation.

To publish on obi2, copy this whole folder to `~/public_html/golf/` and open
`https://obi2.kean.edu/~niemeymi/golf/`.

## What is inside

| Path | Contents |
|---|---|
| `index.html`, `css/style.css` | The page |
| `js/physics.js` | The flight model (RK4, Smits & Smith 1994 aerodynamics, US Standard Atmosphere). Runs in the browser and in Node. |
| `js/charts.js` | Small Canvas plotting helper (scales, ticks, tooltips, contours, color ramp) |
| `js/core.js` | Shared state (current shot, environment, coefficient set, units), events, controls |
| `js/v1_vacuum.js` … `js/v7_validation.js` | One file per view |
| `js/main.js` | Top bar, computed insights, Methods section |
| `data/trackman_2023_raw.csv` | Hand-transcribed TrackMan 2023 PGA and LPGA Tour averages (source data) |
| `data/*.json`, `data/bundle.js` | Prepared outputs; `bundle.js` packs them so the page opens from disk |
| `prep/` | Data-to-visual pipeline (Python, SQL, Node cross-check) |
| `report/` | LaTeX report for Overleaf; numbers and tables are generated |

## Rebuild from the raw data

Requires Python 3.10+ with `numpy` and `pandas`, and Node.js (for check N3).

```
python3 prep/prepare.py        # clean CSV -> SQLite golf.db -> calibration -> validation -> JSON
python3 prep/grid.py           # View 5 launch-window maps (about 15 minutes)
python3 prep/checks.py         # numerical and boundary checks -> data/checks.json
python3 prep/bundle.py         # pack JSON into data/bundle.js
python3 prep/report_numbers.py # numbers and tables for the LaTeX report
```

## Sources

- TrackMan, "Introducing updated Tour averages" (2023 PGA Tour and LPGA Tour tables).
- A. J. Smits and D. R. Smith, "A new aerodynamic model of a golf ball in flight," *Science and Golf II*, E & FN Spon, 1994, pp. 340–347.
- U.S. Standard Atmosphere, 1976.
