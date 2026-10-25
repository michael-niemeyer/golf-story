"""screenshots.py -- capture labeled screenshots of every view (and key interaction states)
for the report and slides.  Requires: pip install playwright && playwright install chromium

Usage: python3 prep/screenshots.py [outdir]   (default report/figures)
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "report" / "figures"
OUT.mkdir(parents=True, exist_ok=True)


def panel(pg, sel, name):
    pg.locator(sel).screenshot(path=str(OUT / name))
    print("saved", name)


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2, color_scheme="light")
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto((ROOT / "index.html").as_uri())
    pg.wait_for_timeout(1000)
    pg.add_style_tag(content=".bar{position:static!important}")

    def set_range(sel, v):
        pg.eval_on_selector(sel, "(el, v) => { el.value = v; el.dispatchEvent(new Event('input')); }", v)
        pg.wait_for_timeout(250)

    # View 1 default, then at 45 degrees with the balls mid-flight
    pg.click("#v1-panel button:has-text('Step')"); pg.click("#v1-panel button:has-text('Step')")
    pg.click("#v1-panel button:has-text('Step')"); pg.click("#v1-panel button:has-text('Step')")
    panel(pg, "#v1-panel", "v1.png")
    set_range("#v1-theta", 45)
    for _ in range(12):
        pg.click("#v1-panel button:has-text('Step')")
    panel(pg, "#v1-panel", "v1_45.png")
    pg.click("#v1-panel button:has-text('Reset')")

    panel(pg, "#v2-panel", "v2.png")
    panel(pg, "#v3-panel", "v3.png")

    # View 4 with three pinned clubs
    for club in ["PGA|Driver", "PGA|7-iron", "PGA|PW"]:
        pg.select_option("#v4-club", club); pg.wait_for_timeout(300)
        pg.click("#v4-panel button:has-text('Pin this shot')")
    pg.select_option("#v4-club", "PGA|Driver"); pg.wait_for_timeout(300)
    panel(pg, "#v4-panel", "v4.png")

    panel(pg, "#v5-panel", "v5.png")

    # View 6: scenario A = sea level calm; current = Denver + 10 mph headwind + 8 deg tilt
    pg.click("#v6-panel button:has-text('Save as A')")
    pg.click("#v6-panel button:has-text('Preset: Denver')"); pg.wait_for_timeout(300)
    set_range("#v6-alpha", 8)
    pg.wait_for_timeout(300)
    for _ in range(6):
        pg.click("#v6-panel button:has-text('Step')")
    panel(pg, "#v6-panel", "v6.png")
    pg.click("#v6-panel button:has-text('Reset environment')"); pg.wait_for_timeout(300)

    panel(pg, "#v7-panel .row2", "v7.png")          # charts only; the per-club table is reproduced in the report
    panel(pg, "#methods", "methods.png")
    # dark theme sample of View 5
    pg.emulate_media(color_scheme="dark"); pg.wait_for_timeout(400)
    panel(pg, "#v5-panel", "v5_dark.png")
    pg.emulate_media(color_scheme="light")
    pg.set_viewport_size({"width": 1440, "height": 820})
    pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(300)
    pg.screenshot(path=str(OUT / "hero.png"))
    print("page errors:", errors or "none")
    b.close()
