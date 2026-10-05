"""The app log.

Keeps the last entries in memory (shown in the "Log" tab) and appends every entry to log.txt
in the data folder. Never log secrets – see secret_store.py.
"""

import threading
import time
from collections import deque
from pathlib import Path

MAX_ENTRIES_IN_MEMORY = 400
MAX_TEXT_LENGTH = 500
MAX_FILE_SIZE = 2_000_000          # bytes; a bigger log.txt is moved to log.txt.alt on start


class AppLog:
    """Thread-safe log with a memory ring buffer and a log file."""

    def __init__(self, log_file: Path | None = None, echo_to_console: bool = False):
        self._entries: deque = deque(maxlen=MAX_ENTRIES_IN_MEMORY)
        self._lock = threading.Lock()
        self._file = log_file
        self._echo = echo_to_console
        if log_file:
            try:
                log_file.parent.mkdir(parents=True, exist_ok=True)
                if log_file.exists() and log_file.stat().st_size > MAX_FILE_SIZE:
                    log_file.replace(log_file.with_name(log_file.name + ".alt"))
            except OSError:
                pass

    def write(self, text: str, level: str = "info") -> None:
        """Add an entry. level: "info", "warn", "fehler" or "overlay" (the page styles these)."""
        entry = {"zeit": int(time.time() * 1000), "art": level, "text": str(text)[:MAX_TEXT_LENGTH]}
        with self._lock:
            self._entries.append(entry)
            if self._file:
                stamp = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(entry["zeit"] / 1000))
                try:
                    with open(self._file, "a", encoding="utf-8") as f:
                        f.write(f"{stamp}Z [{level}] {entry['text']}\n")
                except OSError:
                    pass
        if self._echo:
            print(f"[{level}] {entry['text']}", flush=True)

    def info(self, text: str) -> None:
        self.write(text, "info")

    def warn(self, text: str) -> None:
        self.write(text, "warn")

    def error(self, text: str) -> None:
        self.write(text, "fehler")

    def latest(self, count: int = 200) -> list[dict]:
        """The newest entries, oldest first."""
        with self._lock:
            return list(self._entries)[-count:]
