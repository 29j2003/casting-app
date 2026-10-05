"""Takes over data written by version 2.1 and older, which used German names.

Until 2.1 the data folder, the app state and the browser storage used German names
("zustand.json", "texte.titel", …). On the first start of a newer version this module
renames the files in the data folder and converts their contents once:

    zustand.json        -> state.json      (contents converted)
    gsi.json            -> gsi.json        (contents converted)
    einstellungen.json  -> settings.json
    fenster.json        -> window.json
    geheimnisse.tresor  -> secrets.vault
    bilder/             -> images/
    app-fenster/        -> app-window/     (browser storage of the app window; the control page
                                            converts its own storage with web/legacy.js)

The table of old and new names lives in web/legacy.js between /*BEGIN*/ and /*END*/;
the control page uses the same table for its browser storage and imported files.
"""

import json
import re
from functools import lru_cache
from pathlib import Path

from .paths import WEB_DIR

TABLE_FILE = WEB_DIR / "legacy.js"
TABLE = re.compile(r"/\*BEGIN\*/(.*)/\*END\*/", re.S)
FORBIDDEN_KEYS = {"__proto__", "constructor", "prototype"}
OLD_MEDIA_FOLDER = "medien/"

# old name -> new name inside the data folder
RENAMED_FILES = {
    "einstellungen.json": "settings.json",
    "fenster.json": "window.json",
    "geheimnisse.tresor": "secrets.vault",
    "bilder": "images",
    "app-fenster": "app-window",
}
# files whose contents are converted while they are renamed
CONVERTED_FILES = {"zustand.json": "state.json", "gsi.json": "gsi.json"}


@lru_cache(maxsize=1)
def _table() -> dict:
    """{"keys": {old: new}, "values": {old: new}, "media": {old path: new path}} from web/legacy.js."""
    match = TABLE.search(TABLE_FILE.read_text(encoding="utf-8"))
    if not match:
        raise ValueError("legacy.js has no name table")
    return json.loads(match.group(1))


def migrate_text(text: str) -> str:
    """A stored string value: renamed code word or bundled file path, anything else unchanged."""
    table = _table()
    if text in table["values"]:
        return table["values"][text]
    if text.startswith(OLD_MEDIA_FOLDER):
        return table["media"].get(text) or "media/" + text[len(OLD_MEDIA_FOLDER):]
    return text


def migrate(value):
    """Copy of a stored value with all old names replaced (dicts, lists, strings) – same rules as legacy.js."""
    keys = _table()["keys"]
    if isinstance(value, list):
        return [migrate(item) for item in value]
    if isinstance(value, dict):
        return {keys.get(key, key): migrate(inner) for key, inner in value.items() if key not in FORBIDDEN_KEYS}
    if isinstance(value, str):
        return migrate_text(value)
    return value


def migrate_data_folder(data_dir: Path, log=lambda text, level="info": None) -> None:
    """Rename and convert the files of version 2.1 and older (does nothing once they are gone)."""
    for old_name, new_name in RENAMED_FILES.items():
        old, new = data_dir / old_name, data_dir / new_name
        if old.exists() and not new.exists():
            try:
                old.rename(new)
            except OSError as error:
                log(f"Übernahme von {old_name} fehlgeschlagen: {error}", "warn")
    for old_name, new_name in CONVERTED_FILES.items():
        old, new = data_dir / old_name, data_dir / new_name
        if not old.exists() or (old != new and new.exists()):
            continue
        try:
            data = json.loads(old.read_text(encoding="utf-8"))
            if old_name == new_name and not _uses_old_names(data):
                continue
            new.write_text(json.dumps(migrate(data), ensure_ascii=False), encoding="utf-8")
            if old != new:
                old.unlink()
            log(f"Daten aus Version 2.1 übernommen ({old_name})", "info")
        except (OSError, ValueError) as error:
            log(f"Übernahme von {old_name} fehlgeschlagen: {error}", "warn")


def _uses_old_names(data) -> bool:
    """True if a stored dict still has keys from version 2.1 or older."""
    return isinstance(data, dict) and any(key in _table()["keys"] for key in data)
