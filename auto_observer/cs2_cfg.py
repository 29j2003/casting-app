"""Finding Steam and CS2 and writing the Game State Integration file of the Auto-Observer.

The GSI file has its own name, so it lives next to the casting app's file: CS2 posts to both.
It asks for everything a spectator gets, including all positions and grenades.
Steam is found in the registry (Windows) or the usual places; CS2 in every Steam library listed there.
"""

import os
import re
import shutil
import sys
from pathlib import Path

CFG_FILE_NAME = "gamestate_integration_autoobserver.cfg"
CS2_GAME_PART = Path("steamapps", "common", "Counter-Strike Global Offensive", "game")
CS2_CFG_PART = CS2_GAME_PART / "csgo" / "cfg"
CS2_EXE = {"win32": Path("bin", "win64", "cs2.exe"), "linux": Path("bin", "linuxsteamrt64", "cs2")}
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


def _registry_steam() -> Path | None:
    """Steam's folder as Steam itself wrote it into the registry (Windows)."""
    if sys.platform != "win32":
        return None
    import winreg
    for root, key, name in ((winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam", "SteamPath"),
                            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath")):
        try:
            with winreg.OpenKey(root, key) as handle:
                value, _ = winreg.QueryValueEx(handle, name)
        except OSError:
            continue
        if isinstance(value, str) and value:
            return Path(value)
    return None


def steam_folders() -> list[Path]:
    """Possible Steam installation folders, the registry's first."""
    folders = []
    registry = _registry_steam()
    if registry:
        folders.append(registry)
    if sys.platform == "win32":
        folders += [Path(p, "Steam") for p in (os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles"),
                                                "C:\\Program Files (x86)", "C:\\Program Files") if p]
        folders += [Path(f"{letter}:\\", name) for letter in "CDEFGH" for name in ("Steam", "SteamLibrary")]
    else:
        folders += [Path.home() / ".steam" / "steam", Path.home() / ".local" / "share" / "Steam",
                    Path.home() / "Library" / "Application Support" / "Steam"]
    return folders


def find_steam_exe() -> str:
    """Path of the Steam program ("" if not found)."""
    if sys.platform == "win32":
        for folder in steam_folders():
            exe = folder / "steam.exe"
            if exe.is_file():
                return str(exe)
        return ""
    if sys.platform == "darwin":
        app = Path("/Applications/Steam.app/Contents/MacOS/steam_osx")
        return str(app) if app.is_file() else ""
    return shutil.which("steam") or ""


def cs2_exe(cfg_folder: str) -> str:
    """CS2's program next to a cfg folder ("" if not there)."""
    relative = CS2_EXE.get(sys.platform)
    if not cfg_folder or relative is None:
        return ""
    exe = Path(cfg_folder).parent.parent / relative
    return str(exe) if exe.is_file() else ""


def find_cfg_folders() -> list[str]:
    """CS2 cfg folders in the Steam folders and all Steam libraries listed there; real installs (with cs2.exe) first."""
    steam_dirs = steam_folders()
    libraries = list(steam_dirs)
    for steam_dir in steam_dirs:
        libraries += _library_folders(steam_dir)
    found, seen = [], set()
    for library in libraries:
        cfg = library / CS2_CFG_PART
        key = os.path.normcase(os.path.normpath(str(cfg)))     # registry paths use "/" and lower case
        try:
            if key not in seen and cfg.is_dir():
                seen.add(key)
                found.append(os.path.normpath(str(cfg)))
        except OSError:
            pass
    found.sort(key=lambda folder: not cs2_exe(folder))
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
