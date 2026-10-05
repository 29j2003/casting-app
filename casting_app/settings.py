"""App settings that belong to the app itself (not to a cast): stored in einstellungen.json in the data folder.

    check_for_updates  – look for a newer version on GitHub when the app starts (default: on)
    language           – "de" or "en": language of the control page and of the overlay defaults (default: "de")

The control page reads and changes them through /api/app-einstellungen.
"""

import json
import threading
from pathlib import Path

DEFAULTS = {"check_for_updates": True, "language": "de"}
LANGUAGES = ("de", "en")


class AppSettings:
    """Small JSON-backed settings store; unknown keys and invalid values are ignored."""

    def __init__(self, data_dir: Path):
        self._file = data_dir / "einstellungen.json"
        self._lock = threading.Lock()
        self._values = dict(DEFAULTS)
        try:
            self.update(json.loads(self._file.read_text(encoding="utf-8")), save=False)
        except (OSError, ValueError):
            pass

    def get(self, name: str):
        with self._lock:
            return self._values[name]

    def as_dict(self) -> dict:
        with self._lock:
            return dict(self._values)

    def update(self, changes: dict, save: bool = True) -> dict:
        """Apply valid changes and save; returns all settings."""
        with self._lock:
            if isinstance(changes.get("check_for_updates"), bool):
                self._values["check_for_updates"] = changes["check_for_updates"]
            if changes.get("language") in LANGUAGES:
                self._values["language"] = changes["language"]
            if save:
                try:
                    self._file.write_text(json.dumps(self._values), encoding="utf-8")
                except OSError:
                    pass
            return dict(self._values)
