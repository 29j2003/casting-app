"""Recording of the GSI posts of a match (one JSON line per post) for tuning the director offline.

A line is {"t": seconds since the start, "gsi": the post without its token}. Also recorded are the
switches the Auto-Observer sent ({"t", "switch": steamid, "reason"} – "manual": true when picked by hand) and the
marks of the caster ({"t", "mark": "bad", ...} from the "bad cut" key). The first line is {"t", "meta": …}
(app version, map, the caster's sliders and roles). `replay.py` plays a file back.

Files are gzip-compressed (`recordings/<date_time>_<map>.jsonl.gz`, a few MB per map instead of ~200 MB) and
flushed every few seconds, so a crash loses at most those seconds. A new file starts for every map.
"""

import gzip
import io
import json
import threading
import time
import zlib
from datetime import datetime
from pathlib import Path

FLUSH_EVERY = 5.0                        # seconds between flushes to disk


class Recorder:
    """Writes the posts to recordings/<date_time>_<map>.jsonl.gz in the data folder while on."""

    def __init__(self, folder: Path):
        self.folder = folder / "recordings"
        self._lock = threading.Lock()
        self._file = None                    # text wrapper around …
        self._gzip = None                    # … the gzip stream
        self._start = 0.0
        self._flushed = 0.0
        self.path = ""
        self.lines = 0
        self.label = ""                      # map of the running file
        self.automatic = False               # started by the app itself (not with the button)

    @property
    def on(self) -> bool:
        return self._file is not None

    def start(self, label: str = "", meta: dict | None = None, automatic: bool = False) -> str:
        with self._lock:
            if self._file is None:
                self.folder.mkdir(parents=True, exist_ok=True)
                safe = "".join(ch for ch in label if ch.isalnum() or ch in "_-")[:40]
                name = f"{datetime.now():%Y-%m-%d_%H-%M-%S}" + (f"_{safe}" if safe else "")
                path = self.folder / f"{name}.jsonl.gz"
                self._gzip = gzip.GzipFile(path, "wb", compresslevel=6)
                self._file = io.TextIOWrapper(self._gzip, encoding="utf-8")
                self._start = self._flushed = time.monotonic()
                self.path, self.lines, self.label, self.automatic = str(path), 0, label, automatic
                if meta is not None:
                    self._write_line({"meta": meta, "t": 0.0})
            return self.path

    def stop(self) -> None:
        with self._lock:
            self._close()

    def _close(self) -> None:
        if self._file is not None:
            try:
                self._file.close()           # also ends the gzip stream
            except OSError:
                pass
            self._file = self._gzip = None
            self.automatic = False

    def write(self, record: dict) -> None:
        with self._lock:
            if self._file is None:
                return
            self._write_line(dict(record, t=round(time.monotonic() - self._start, 3)))

    def _write_line(self, record: dict) -> None:
        try:
            self._file.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
            self.lines += 1
            now = time.monotonic()
            if now - self._flushed >= FLUSH_EVERY:
                self._file.flush()
                self._gzip.flush(zlib.Z_SYNC_FLUSH)    # readable up to here even if the app dies
                self._flushed = now
        except OSError:
            self._close()


def without_token(post: dict) -> dict:
    return {k: v for k, v in post.items() if k != "auth"}


def load(path: str | Path) -> list[dict]:
    """Records of a recording file, .jsonl or .jsonl.gz (broken lines and a cut-off end are skipped)."""
    records = []
    opener = gzip.open if str(path).endswith(".gz") else open
    with opener(path, "rt", encoding="utf-8") as file:
        try:
            for line in file:
                try:
                    record = json.loads(line)
                except ValueError:
                    continue
                if isinstance(record, dict) and isinstance(record.get("t"), (int, float)):
                    records.append(record)
        except (EOFError, OSError, zlib.error):
            pass                             # file of a crashed app: keep what was flushed
    return records
