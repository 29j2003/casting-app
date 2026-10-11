"""Recording of the GSI posts of a match (one JSON line per post) for tuning the director offline.

A line is {"t": seconds since the start, "gsi": the post without its token}. Also recorded are the
switches the Auto-Observer sent ({"t", "switch": steamid}). `replay.py` plays a file back.
"""

import json
import threading
import time
from datetime import datetime
from pathlib import Path


class Recorder:
    """Writes the posts to recordings/<date_time>.jsonl in the data folder while on."""

    def __init__(self, folder: Path):
        self.folder = folder / "recordings"
        self._lock = threading.Lock()
        self._file = None
        self._start = 0.0
        self.path = ""
        self.lines = 0

    @property
    def on(self) -> bool:
        return self._file is not None

    def start(self) -> str:
        with self._lock:
            if self._file is None:
                self.folder.mkdir(parents=True, exist_ok=True)
                path = self.folder / f"{datetime.now():%Y-%m-%d_%H-%M-%S}.jsonl"
                self._file = path.open("w", encoding="utf-8")
                self._start, self.path, self.lines = time.monotonic(), str(path), 0
            return self.path

    def stop(self) -> None:
        with self._lock:
            if self._file is not None:
                self._file.close()
                self._file = None

    def write(self, record: dict) -> None:
        with self._lock:
            if self._file is None:
                return
            record = dict(record, t=round(time.monotonic() - self._start, 3))
            try:
                self._file.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
                self._file.flush()
                self.lines += 1
            except OSError:
                self._file.close()
                self._file = None


def without_token(post: dict) -> dict:
    return {k: v for k, v in post.items() if k != "auth"}


def load(path: str | Path) -> list[dict]:
    """Records of a recording file (broken lines are skipped)."""
    records = []
    with open(path, encoding="utf-8") as file:
        for line in file:
            try:
                record = json.loads(line)
            except ValueError:
                continue
            if isinstance(record, dict) and isinstance(record.get("t"), (int, float)):
                records.append(record)
    return records
