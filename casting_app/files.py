"""Safe reading and writing of the app's own files (state, settings, CS2 settings, window, images).

write_atomic()  – a crash or power cut never leaves a half-written file: the data goes to "<name>.tmp",
                  is flushed to disk and then replaces the file in one step.
read_json_object() – the JSON object in a file, or None if it is missing; a damaged file is kept as
                  "<name>.damaged" (never silently overwritten) and reported through `log`.
"""

import json
import os
import time
from pathlib import Path
from typing import Callable


def write_atomic(path: Path, data: str | bytes, private: bool = False) -> None:
    """Replace `path` with `data` in one step. private=True: only the user may read it. Raises OSError."""
    raw = data.encode("utf-8") if isinstance(data, str) else data
    temporary = path.with_name(path.name + ".tmp")
    try:
        # private: readable only by the user from the first byte on (not only after a chmod at the end)
        flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, "O_BINARY", 0)
        with os.fdopen(os.open(temporary, flags, 0o600 if private else 0o666), "wb") as file:
            file.write(raw)
            file.flush()
            os.fsync(file.fileno())
        if private:
            os.chmod(temporary, 0o600)            # an older .tmp left behind keeps its mode on O_TRUNC
        for attempt in range(5):                  # Windows: a virus scanner may hold the old file for a moment
            try:
                os.replace(temporary, path)
                return
            except PermissionError:
                if attempt == 4:
                    raise
                time.sleep(0.05 * (attempt + 1))
    except OSError:
        try:
            os.unlink(temporary)                  # no half-written copy left behind
        except OSError:
            pass
        raise


def read_json_object(path: Path, log: Callable[[str, str], None] | None = None) -> dict | None:
    """The JSON object stored in `path`; None if the file is missing or damaged (then kept as .damaged)."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    except FileNotFoundError:
        return None
    except (OSError, ValueError):
        pass
    set_aside(path, log)
    return None


def set_aside(path: Path, log: Callable[[str, str], None] | None = None) -> None:
    """Keep a damaged file as "<name>.damaged" (for a look by hand) so a fresh one can be written."""
    try:
        os.replace(path, path.with_name(path.name + ".damaged"))
    except OSError:
        return
    if log:
        log(f"{path.name} war beschädigt – als {path.name}.damaged beiseitegelegt, Standardwerte gelten", "warn")
