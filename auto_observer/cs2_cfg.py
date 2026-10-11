"""Finding CS2's cfg folder and writing the Game State Integration file of the Auto-Observer.

The file has its own name, so it lives next to the casting app's file: CS2 posts to both.
It asks for everything a spectator gets, including all positions and grenades.
"""

import os
import re
import sys
from pathlib import Path

CFG_FILE_NAME = "gamestate_integration_autoobserver.cfg"
CS2_CFG_PART = Path("steamapps", "common", "Counter-Strike Global Offensive", "game", "csgo", "cfg")
LIBRARY_PATH = re.compile(r'"path"\s+"([^"]+)"')

CFG_TEMPLATE = """"Auto-Observer"
{
  "uri"        "%(uri)s"
  "timeout"    "1.0"
  "buffer"     "0.0"
  "throttle"   "0.1"
  "heartbeat"  "5.0"
  "auth" { "token" "%(token)s" }
  "data"
  {
    "provider" "1"  "map" "1"  "round" "1"  "phase_countdowns" "1"  "bomb" "1"  "allgrenades" "1"
    "player_id" "1"  "player_state" "1"  "player_match_stats" "1"  "player_weapons" "1"  "player_position" "1"
    "allplayers_id" "1"  "allplayers_state" "1"  "allplayers_match_stats" "1"  "allplayers_weapons" "1"
    "allplayers_position" "1"
  }
}
"""


def cfg_text(uri: str, token: str) -> str:
    return CFG_TEMPLATE % {"uri": uri, "token": token}


def is_cs2_cfg_folder(path: str | Path) -> bool:
    """True if `path` ends with game/csgo/cfg (the only kind of folder the app writes into)."""
    parts = [p.lower() for p in Path(str(path).rstrip("\\/")).parts]
    return parts[-3:] == ["game", "csgo", "cfg"]


def _library_folders(steam_dir: Path) -> list[Path]:
    try:
        text = (steam_dir / "steamapps" / "libraryfolders.vdf").read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    return [Path(match.replace("\\\\", "\\")) for match in LIBRARY_PATH.findall(text)]


def find_cfg_folders() -> list[str]:
    """CS2 cfg folders in the usual Steam locations and all Steam libraries listed there."""
    if sys.platform == "win32":
        steam_dirs = [Path(p, "Steam") for p in (os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles"),
                                                  "C:\\Program Files (x86)", "C:\\Program Files") if p]
        steam_dirs += [Path(f"{letter}:\\", name) for letter in "CDEFGH" for name in ("Steam", "SteamLibrary")]
    else:
        steam_dirs = [Path.home() / ".steam" / "steam", Path.home() / ".local" / "share" / "Steam",
                      Path.home() / "Library" / "Application Support" / "Steam"]
    libraries = list(steam_dirs)
    for steam_dir in steam_dirs:
        libraries += _library_folders(steam_dir)
    found = []
    for library in libraries:
        cfg = library / CS2_CFG_PART
        try:
            if cfg.is_dir() and str(cfg) not in found:
                found.append(str(cfg))
        except OSError:
            pass
    return found


def write_cfg(folder: str, uri: str, token: str) -> str:
    """Write the GSI file into `folder` (must be a CS2 cfg folder); returns the file path. Raises ValueError/OSError."""
    raw = folder.strip()
    if raw.replace("/", "\\").startswith("\\\\"):
        raise ValueError("Netzwerkpfade werden nicht unterstützt")
    path = Path(raw)
    if not is_cs2_cfg_folder(path) or not path.is_dir():
        raise ValueError("Das ist kein CS2-cfg-Ordner (…\\game\\csgo\\cfg)")
    target = path / CFG_FILE_NAME
    target.write_text(cfg_text(uri, token), encoding="utf-8")
    return str(target)


def cfg_installed(folder: str, token: str) -> bool:
    """True if the GSI file in `folder` exists and carries the current token."""
    if not folder:
        return False
    try:
        return f'"token" "{token}"' in (Path(folder) / CFG_FILE_NAME).read_text(encoding="utf-8")
    except OSError:
        return False
