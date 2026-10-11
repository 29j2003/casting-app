"""Settings of the Auto-Observer, kept in settings.json in its own data folder.

Data folder: %APPDATA%\\Auto-Observer (Windows), ~/Library/Application Support/Auto-Observer (macOS),
~/.config/auto-observer (Linux); AUTO_OBSERVER_DATA overrides it (tests).
Every change from the control page goes through `Settings.apply()`, which only accepts known keys with
values of the right type and range.
"""

import json
import os
import secrets
import sys
import threading
from pathlib import Path

from .launcher import clean_extra

WEIGHT_MIN, WEIGHT_MAX = 0.0, 2.0
MAX_WEIGHTS = 2000                       # stored players/teams (old ones are dropped beyond this)

DEFAULTS = {
    "enabled": False,                    # auto-observer on/off
    "xray": True,                        # spec_show_xray
    "camera_mode": "auto",               # auto | netcon | keys
    "netcon_host": "127.0.0.1",
    "netcon_port": 54545,
    "spec_command": "name",              # name | accountid
    "pause_on_manual": True,             # someone switches by hand (page or CS2) → automatic pauses
    "return_timer": True,                # … and comes back after return_seconds
    "return_seconds": 20,
    "data_mix": 0.5,                     # 0 = only the sliders, 1 = the match form counts fully
    "player_weights": {},                # steamid → {"weight": float, "name": str}
    "team_weights": {},                  # team key → {"weight": float, "name": str}
    "cfg_folder": "",                    # CS2's cfg folder (found by the app, can be changed)
    "steam_exe": "",                     # Steam program; empty = find it
    "launch_extra": "",                  # more CS2 launch options, e.g. "-novid -console"
}

CHOICES = {"camera_mode": ("auto", "netcon", "keys"), "spec_command": ("name", "accountid")}


def data_folder() -> Path:
    override = os.environ.get("AUTO_OBSERVER_DATA")
    if override:
        return Path(override)
    if sys.platform == "win32":
        return Path(os.environ.get("APPDATA") or Path.home() / "AppData" / "Roaming") / "Auto-Observer"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "Auto-Observer"
    return Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config") / "auto-observer"


def _weight(value) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if value != value:                    # NaN
        return None
    return round(max(WEIGHT_MIN, min(WEIGHT_MAX, float(value))), 2)


class Settings:
    """Thread-safe settings with atomic saving."""

    def __init__(self, folder: Path | None = None):
        self.folder = folder or data_folder()
        self.file = self.folder / "settings.json"
        self._lock = threading.RLock()
        self.values = json.loads(json.dumps(DEFAULTS))
        self.token = ""
        self._load()

    def __getitem__(self, key):
        with self._lock:
            return self.values[key]

    def _load(self) -> None:
        try:
            stored = json.loads(self.file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            stored = {}
        if isinstance(stored, dict):
            self.token = stored.get("token") if isinstance(stored.get("token"), str) and len(stored["token"]) >= 16 else ""
            self.apply({k: v for k, v in stored.items() if k in DEFAULTS}, save=False)
        if not self.token:
            self.token = secrets.token_hex(16)
            self.save()

    def save(self) -> None:
        with self._lock:
            data = dict(self.values, token=self.token)
            text = json.dumps(data, indent=2, ensure_ascii=False)
        try:
            self.folder.mkdir(parents=True, exist_ok=True)
            temporary = self.file.with_suffix(".tmp")
            temporary.write_text(text, encoding="utf-8")
            os.replace(temporary, self.file)
        except OSError:
            pass                           # still works for this session

    def apply(self, changes: dict, save: bool = True) -> list[str]:
        """Take over valid changes; returns the keys that changed."""
        changed = []
        with self._lock:
            for key, value in changes.items():
                if key not in DEFAULTS:
                    continue
                new = self._check(key, value)
                if new is None:
                    continue
                if key in ("player_weights", "team_weights"):
                    merged = dict(self.values[key])
                    merged.update(new)
                    if len(merged) > MAX_WEIGHTS:
                        merged = dict(list(merged.items())[-MAX_WEIGHTS:])
                    new = merged
                if self.values[key] != new:
                    self.values[key] = new
                    changed.append(key)
        if changed and save:
            self.save()
        return changed

    def _check(self, key: str, value):
        """The value if it fits the setting, else None."""
        default = DEFAULTS[key]
        if key in CHOICES:
            return value if value in CHOICES[key] else None
        if isinstance(default, bool):
            return value if isinstance(value, bool) else None
        if key == "netcon_port":
            return value if isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 65535 else None
        if key == "return_seconds":
            return value if isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 600 else None
        if key == "data_mix":
            weight = _weight(value)
            return None if weight is None else min(1.0, weight)
        if key == "netcon_host":
            text = value.strip() if isinstance(value, str) else ""
            return text if text and len(text) <= 253 and all(ch.isalnum() or ch in ".-:" for ch in text) else None
        if key in ("cfg_folder", "steam_exe"):
            return value.strip()[:1000] if isinstance(value, str) else None
        if key == "launch_extra":
            return clean_extra(value) if isinstance(value, str) else None
        if key in ("player_weights", "team_weights"):
            if not isinstance(value, dict):
                return None
            result = {}
            for item_key, item in value.items():
                if not isinstance(item_key, str) or not 0 < len(item_key) <= 200 or not isinstance(item, dict):
                    continue
                weight = _weight(item.get("weight"))
                if weight is not None:
                    result[item_key] = {"weight": weight, "name": str(item.get("name") or "")[:40]}
            return result or None
        return None

    # --- weights ---

    def player_weight(self, steamid: str) -> float:
        with self._lock:
            return self.values["player_weights"].get(steamid, {}).get("weight", 1.0)

    def team_weight(self, key: str) -> float:
        with self._lock:
            return self.values["team_weights"].get(key, {}).get("weight", 1.0)
