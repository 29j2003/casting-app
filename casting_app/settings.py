"""App settings that belong to the app itself (not to a cast): stored in settings.json in the data folder.

    check_for_updates    – look for a newer version on GitHub when the app starts (default: on)
    app_language         – "de" or "en": control page, dialogs and tray menu (default: "de");
                           the overlay language is part of the cast state (overlayLanguage), so OBS gets it
    offer_password_vault – without a system keyring: offer a password-protected storage at start (default: on)

The control page reads and changes them through /api/app-settings. Listeners added to
`listeners` are called with the changed values (e.g. the tray follows the app language).
"""

import json
import threading
from pathlib import Path
from typing import Callable

from .files import read_json_object, write_atomic

DEFAULTS = {"check_for_updates": True, "app_language": "de", "offer_password_vault": True}
LANGUAGES = ("de", "en")


class AppSettings:
    """Small JSON-backed settings store; unknown keys and invalid values are ignored."""

    def __init__(self, data_dir: Path):
        """Load settings.json from `data_dir`; missing or broken files give the defaults."""
        self._file = data_dir / "settings.json"
        self._lock = threading.Lock()
        self._values = dict(DEFAULTS)
        self.listeners: list[Callable[[dict], None]] = []
        self.update(read_json_object(self._file) or {}, save=False)

    def get(self, name: str):
        """Current value of one setting (see DEFAULTS for the names)."""
        with self._lock:
            return self._values[name]

    def as_dict(self) -> dict:
        """Copy of all settings (sent to the control page by /api/app-settings)."""
        with self._lock:
            return dict(self._values)

    def update(self, changes: dict, save: bool = True) -> dict:
        """Apply valid changes and save; returns all settings."""
        changes = dict(changes)
        if "language" in changes and "app_language" not in changes:      # name in 2.1
            changes["app_language"] = changes.pop("language")
        with self._lock:
            before = dict(self._values)
            for flag in ("check_for_updates", "offer_password_vault"):
                if isinstance(changes.get(flag), bool):
                    self._values[flag] = changes[flag]
            if changes.get("app_language") in LANGUAGES:
                self._values["app_language"] = changes["app_language"]
            if save:
                try:
                    write_atomic(self._file, json.dumps(self._values))
                except OSError:
                    pass
            current = dict(self._values)
        changed = {key: value for key, value in current.items() if before.get(key) != value}
        if changed and save:
            for listener in list(self.listeners):
                listener(changed)
        return current
