"""bundle.py -- pack data/*.json into data/bundle.js (window.GOLF_DATA) so index.html
opens straight from disk (file://) without a web server."""
import json
from pathlib import Path

D = Path(__file__).resolve().parents[1] / "data"
bundle = {k: json.loads((D / f"{k}.json").read_text()) for k in ["trackman", "validation", "grid", "checks"]}
bundle["validation"]["calibration"].pop("surface", None)      # not needed in the browser
(D / "bundle.js").write_text("window.GOLF_DATA = " + json.dumps(bundle, separators=(",", ":")) + ";\n")
print("wrote data/bundle.js", round((D / "bundle.js").stat().st_size / 1e6, 2), "MB")
