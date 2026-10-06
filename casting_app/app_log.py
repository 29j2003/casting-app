"""The app log.

Keeps the last entries in memory (shown in the "Log" tab) and appends every entry to log.txt
in the data folder. Never log secrets – see secret_store.py.
"""

import sys
import threading
import time
import traceback
from collections import deque
from pathlib import Path

MAX_ENTRIES_IN_MEMORY = 400
MAX_TEXT_LENGTH = 500
MAX_FILE_SIZE = 2_000_000          # bytes; a bigger log.txt is moved to log.txt.old on start


class AppLog:
    """Thread-safe log with a memory ring buffer and a log file."""

    def __init__(self, log_file: Path | None = None, echo_to_console: bool = False):
        """log_file: where entries are appended (None = memory only); echo_to_console: also print them."""
        self._entries: deque = deque(maxlen=MAX_ENTRIES_IN_MEMORY)
        self._lock = threading.Lock()
        self._file = log_file
        self._echo = echo_to_console
        self._writes = 0
        if log_file:
            try:
                log_file.parent.mkdir(parents=True, exist_ok=True)
            except OSError:
                pass
            self._rotate_if_big()

    def _rotate_if_big(self) -> None:
        """A log.txt bigger than MAX_FILE_SIZE becomes log.txt.old (at start and every 500 entries)."""
        try:
            if self._file.exists() and self._file.stat().st_size > MAX_FILE_SIZE:
                self._file.replace(self._file.with_name(self._file.name + ".old"))
        except OSError:
            pass

    def write(self, text: str, level: str = "info") -> None:
        """Add an entry. level: "info", "warn", "error" or "overlay" (the page styles these)."""
        entry = {"time": int(time.time() * 1000), "kind": level, "text": str(text)[:MAX_TEXT_LENGTH]}
        with self._lock:
            self._entries.append(entry)
            if self._file:
                self._writes += 1
                if self._writes % 500 == 0:
                    self._rotate_if_big()
                stamp = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(entry["time"] / 1000))
                try:
                    with open(self._file, "a", encoding="utf-8") as f:
                        f.write(f"{stamp}Z [{level}] {entry['text']}\n")
                except OSError:
                    pass
        if self._echo:
            print(f"[{level}] {entry['text']}", flush=True)

    def info(self, text: str) -> None:
        """Normal event."""
        self.write(text, "info")

    def warn(self, text: str) -> None:
        """Something the user may want to know (shown in yellow)."""
        self.write(text, "warn")

    def error(self, text: str) -> None:
        """Something failed (shown in red)."""
        self.write(text, "error")

    def catch_unhandled_errors(self) -> None:
        """Send errors nobody caught (main thread and other threads) to the log – the windowed app has no console."""
        def report(kind, value, trace, thread_name="main"):
            last = traceback.extract_tb(trace)[-1] if trace else None
            where = f" ({last.filename.rsplit('/', 1)[-1].rsplit(chr(92), 1)[-1]}:{last.lineno})" if last else ""
            self.error(f"Unerwarteter Fehler [{thread_name}]: {kind.__name__}: {value}{where}")
        previous = sys.excepthook
        sys.excepthook = lambda kind, value, trace: (report(kind, value, trace), previous(kind, value, trace))
        threading.excepthook = lambda args: report(args.exc_type, args.exc_value, args.exc_traceback,
                                                   getattr(args.thread, "name", "?"))

    def latest(self, count: int = 200) -> list[dict]:
        """The newest entries, oldest first."""
        with self._lock:
            return list(self._entries)[-count:]
