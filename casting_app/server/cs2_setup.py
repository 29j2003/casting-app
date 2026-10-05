"""Finding CS2's cfg folder and writing the Game State Integration cfg file."""

import os
import re
import string
import sys
import time
from pathlib import Path

IS_WINDOWS = sys.platform == "win32"
CFG_FILE_NAME = "gamestate_integration_castoverlay.cfg"
CS2_CFG_PART = Path("steamapps", "common", "Counter-Strike Global Offensive", "game", "csgo", "cfg")
SEARCH_SECONDS = 4
SEARCH_DEPTH = 3
SKIPPED_FOLDERS = re.compile(r"^(\$|System Volume Information$|Windows$|WinSxS$|ProgramData$|AppData$|node_modules$|\.)", re.I)
LIBRARY_PATH = re.compile(r'"path"\s+"([^"]+)"')

CFG_TEMPLATE = """"Casting App"
{
  "uri"        "%(uri)s"
  "timeout"    "1.0"
  "buffer"     "0.1"
  "throttle"   "0.25"
  "heartbeat"  "10.0"
  "auth" { "token" "%(token)s" }
  "data"
  {
    "provider" "1"  "map" "1"  "round" "1"  "phase_countdowns" "1"  "bomb" "1"
    "player_id" "1"  "player_state" "1"  "player_match_stats" "1"  "player_weapons" "1"
    "allplayers_id" "1"  "allplayers_state" "1"  "allplayers_match_stats" "1"  "allplayers_weapons" "1"
  }
}
"""


def cfg_text(uri: str, token: str) -> str:
    """Content of the GSI cfg file that makes CS2 post to `uri` with `token`."""
    return CFG_TEMPLATE % {"uri": uri, "token": token}


def is_cs2_cfg_folder(path: str | Path) -> bool:
    """True if `path` ends with game/csgo/cfg (the only folder the app writes into)."""
    parts = [p.lower() for p in Path(str(path).rstrip("\\/")).parts]
    return parts[-3:] == ["game", "csgo", "cfg"]


def drive_roots() -> list[str]:
    """Windows: existing drives C:\\ … Z:\\ ; elsewhere the file system root."""
    if not IS_WINDOWS:
        return ["/"]
    return [f"{letter}:\\" for letter in string.ascii_uppercase[2:] if os.path.exists(f"{letter}:\\")]


def _library_folders(steam_dir: Path) -> list[Path]:
    """Further Steam libraries listed in a Steam installation's libraryfolders.vdf."""
    try:
        text = (steam_dir / "steamapps" / "libraryfolders.vdf").read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    return [Path(match.replace("\\\\", "\\")) for match in LIBRARY_PATH.findall(text)]


def find_known_cfg_folder() -> Path | None:
    """Quick check of the usual Steam locations and their libraries."""
    if IS_WINDOWS:
        steam_dirs = [Path(p, "Steam") for p in (os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles"),
                                                  "C:\\Program Files (x86)", "C:\\Program Files") if p]
    else:
        steam_dirs = [Path.home() / ".steam" / "steam", Path.home() / ".local" / "share" / "Steam"]
    libraries = list(steam_dirs)
    for steam_dir in steam_dirs:
        libraries += _library_folders(steam_dir)
    for library in libraries:
        cfg = library / CS2_CFG_PART
        if cfg.is_dir():
            return cfg
    return None


def search_cfg_folders() -> list[str]:
    """Breadth-first search of Steam folders and all drives (3 levels deep, at most 4 seconds)."""
    found: set[str] = set()
    started = time.monotonic()

    def check(base: Path) -> None:
        cfg = base / CS2_CFG_PART
        if cfg.is_dir():
            found.add(str(cfg))

    start_points = [Path(p, "Steam") for p in (os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles")) if p]
    start_points += [Path(root) for root in drive_roots()]
    if not IS_WINDOWS:
        start_points.insert(0, Path.home())
    level = [(path, 0) for path in start_points]
    while level and time.monotonic() - started < SEARCH_SECONDS:
        next_level = []
        for folder, depth in level:
            if time.monotonic() - started > SEARCH_SECONDS:
                break
            check(folder)
            for library in _library_folders(folder):
                check(library)
            if depth >= SEARCH_DEPTH:
                continue
            try:
                for entry in os.scandir(folder):
                    if entry.is_dir(follow_symlinks=False) and not SKIPPED_FOLDERS.match(entry.name):
                        next_level.append((Path(entry.path), depth + 1))
            except OSError:
                pass
        level = next_level[:6000]
    return sorted(found)


def list_subfolders(raw_path: str) -> dict:
    """Subfolder names for the folder browser on the setup page (names only, no contents)."""
    if not raw_path:
        return {"pfad": "", "eltern": None, "ordner": drive_roots()}
    path = Path(raw_path).resolve()
    try:
        names = sorted((e.name for e in os.scandir(path) if e.is_dir() and not re.match(r"^(\$|System Volume Information$|\.)", e.name, re.I)),
                       key=str.casefold)[:800]
    except OSError:
        return {"pfad": str(path), "fehler": "Ordner nicht gefunden oder kein Zugriff", "ordner": []}
    parent = "" if path.parent == path else str(path.parent)
    return {"pfad": str(path), "eltern": parent, "ordner": names, "cs2": is_cs2_cfg_folder(path)}
