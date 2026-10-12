"""Turn HLTV kill heatmaps (saved map stats pages) into kill-density grids for the Auto-Observer's map knowledge.

    python tools/import_hltv_heatmaps.py <saved page>.html [...]     → adds "heat" to auto_observer/map_data/<map>.json

HLTV draws its heatmap as a picture (heatmap.js colours over the radar), the kill positions are not in the page.
The picture is turned back into numbers: colour → intensity (blue 0.25, green 0.55, yellow 0.85, red 1), and
picture pixel → world position with the map's radar values (pos_x, pos_y, scale of Valve's overview, the same as in
open HUD projects such as drweissbrot/cs-hud). HLTV shows the full width of the radar and trims top and bottom about
evenly – checked against kill positions from pro demos on Mirage, Inferno, Dust2, Anubis and Cache (scale within 3 %,
kills land on hot pixels 2–4× as often as random points). Fitted values from that check are used where known.

Maps whose two levels HLTV draws one above the other are limited to the level that could be checked (Nuke upper).
Train and Vertigo are left out (not in the active map pool). Needs Pillow and NumPy (only for this tool, not for the
app).
"""

import base64
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MAP_DATA = ROOT / "auto_observer" / "map_data"
CELL = 96                                     # same grid as map_knowledge.py
RADAR = {   # Valve overview: pos_x, pos_y, scale
    "de_mirage": (-3230, 1713, 5.0), "de_inferno": (-2087, 3870, 4.9), "de_dust2": (-2476, 3239, 4.4),
    "de_nuke": (-3453, 2887, 7.0), "de_anubis": (-2796, 3328, 5.22), "de_cache": (-2000, 3250, 5.5),
    "de_ancient": (-2953, 2164, 5.0), "de_overpass": (-4831, 1781, 5.2),
}
# picture transform fitted to demo kills (scale, x offset, y offset in picture pixels at width 638)
FITTED = {"de_mirage": (0.12386, 400.99, 112.96), "de_inferno": (0.1266, 265.0, 458.0),
          "de_dust2": (0.1413, 350.0, 445.0), "de_anubis": (0.1194, 336.0, 388.0), "de_cache": (0.1103, 224.0, 262.0),
          "de_nuke": (0.0890, 308.5, 417.0)}
LEVELS = {"de_nuke": -495}                    # only positions at or above this height (the checked level)


def intensity(png: bytes) -> np.ndarray:
    """Heat 0..1 per pixel from heatmap.js colours (hue) and transparency."""
    import io
    image = np.asarray(Image.open(io.BytesIO(png)).convert("RGBA")).astype(float) / 255
    r, g, b, a = image[..., 0], image[..., 1], image[..., 2], image[..., 3]
    high, low = image[..., :3].max(axis=2), image[..., :3].min(axis=2)
    spread = np.where(high - low == 0, 1, high - low)
    hue = np.where(high == r, ((g - b) / spread) % 6, np.where(high == g, (b - r) / spread + 2, (r - g) / spread + 4)) * 60
    value = np.interp(-np.clip(hue, 0, 240), [-240, -120, -60, 0], [0.25, 0.55, 0.85, 1.0])
    return value * a


def read_page(path: Path) -> tuple[str, np.ndarray] | None:
    text = path.read_text(encoding="utf-8", errors="replace")
    found = re.search(r"/stats/maps/map/\d+/(\w+)", text)
    canvas = re.search(r"<canvas class=heatmap-canvas width=(\d+) height=(\d+)[^>]*"
                       r"background:url\(data:image/png;base64,([A-Za-z0-9+/=]+)\)", text)
    if not (found and canvas):
        return None
    return "de_" + found.group(1).lower(), intensity(base64.b64decode(canvas.group(3)))


def transform(map_name: str, heat: np.ndarray) -> tuple[float, float, float]:
    if map_name in FITTED:
        return FITTED[map_name]
    pos_x, pos_y, scale = RADAR[map_name]
    height, width = heat.shape
    s = width / 1024 / scale
    trimmed = (1024 - height * 1024 / width) / 2 * width / 1024     # HLTV trims top and bottom about evenly
    return s, -pos_x * s, pos_y * s - trimmed


def heat_grid(map_name: str, heat: np.ndarray) -> dict[str, float]:
    """World grid cell (x, y) → mean heat of the picture pixels it covers."""
    s, bx, by = transform(map_name, heat)
    height, width = heat.shape
    ys, xs = np.nonzero(heat > 0.02)
    cells: dict[str, list[float]] = {}
    for px, py in zip(xs, ys):
        x = (px - bx) / s
        y = (by - py) / s
        key = f"{int(x // CELL)}_{int(y // CELL)}"
        cells.setdefault(key, []).append(heat[py, px])
    values = {key: float(np.mean(v)) for key, v in cells.items()}
    top = np.percentile(list(values.values()), 98) if values else 1.0     # strongest spots = 1
    return {key: round(min(1.0, value / top), 3) for key, value in values.items() if value / top >= 0.05}


def main(paths: list[str]) -> int:
    for raw in paths:
        page = read_page(Path(raw))
        if not page:
            print(f"{raw}: keine Heatmap gefunden")
            continue
        map_name, heat = page
        if map_name not in RADAR:
            print(f"{map_name}: übersprungen (zwei Ebenen übereinander, nicht prüfbar)")
            continue
        target = MAP_DATA / f"{map_name}.json"
        data = json.loads(target.read_text(encoding="utf-8")) if target.is_file() else {"map": map_name, "version": 1}
        data["heat"] = heat_grid(map_name, heat)
        data["heat_cell"] = CELL
        if map_name in LEVELS:
            data["heat_min_z"] = LEVELS[map_name]
        MAP_DATA.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(data, separators=(",", ":"), sort_keys=True), encoding="utf-8")
        print(f"{map_name}: {len(data['heat'])} Felder mit Kill-Dichte")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
