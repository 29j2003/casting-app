"""Plays H.264/AAC videos (MP4) in the app window: converts them to WebM (VP8 + Opus) with FFmpeg.

Why: Qt WebEngine (PySide6) has no H.264/AAC decoder – an MP4 from a DACH CS page or an own background
video stays black and silent in the app window. OBS has its own browser with H.264 and is not affected;
nothing here is used by overlays in OBS.

How:
  1. The app window redirects media requests for MP4-like files to /api/media?src=…&t=…
     (casting_app/desktop/media.py; t = media_token(access key), so no other program can use this).
  2. The first request starts FFmpeg, which writes <cache>/<hash>.webm.part; the answer streams the file
     while it grows, so the video starts after a second or two. Further requests (loop, second frame)
     read along or – once FFmpeg is done – get the finished file with Range support.
  3. The cache keeps at most CACHE_LIMIT bytes; the oldest files go first.

FFmpeg comes with the app (package imageio-ffmpeg, GPLv3 – see LICENSES/FFmpeg.txt); a system FFmpeg is
used if that package is missing. Without FFmpeg the answer is 404 and the app window shows a hint instead.
"""

import hashlib
import hmac
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Callable

from .static_files import send_file

CACHE_LIMIT = 3 * 1024 ** 3
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 CastingApp"
MAX_JOBS = 2
CHUNK = 256 * 1024
# limits for every source: only web protocols (no local files, no other schemes), give up on a silent server,
# and never let one video grow without end (a live stream or a trickling server would otherwise fill the disk)
INPUT_LIMITS = ["-protocol_whitelist", "http,https,tls,tcp", "-rw_timeout", "15000000"]
OUTPUT_LIMITS = ["-t", "3600", "-fs", str(2 * 1024 ** 3)]
STALL_SECONDS = 60                    # a reader gives up when the file has not grown for this long
FFMPEG_ARGS = ["-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "4M", "-maxrate", "6M",
               "-bufsize", "8M", "-g", "60", "-c:a", "libopus", "-b:a", "160k", "-f", "webm"]


def media_token(access_key: str) -> str:
    """Token in /api/media addresses: derived from the access key, so the key itself never appears there."""
    return hmac.new(access_key.encode(), b"casting-app-media", hashlib.sha256).hexdigest()[:32]


def find_ffmpeg() -> str | None:
    """Path of the FFmpeg program: the bundled one (imageio-ffmpeg), else one on the system, else None."""
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return shutil.which("ffmpeg")


class _Job:
    """One running conversion; readers follow the growing .part file until `done`."""

    def __init__(self, process: subprocess.Popen, part: Path):
        self.process = process
        self.part = part
        self.done = threading.Event()
        self.ok = False


class MediaConverter:
    """Converts and caches videos for the app window (see module docstring)."""

    def __init__(self, cache_dir: Path, log: Callable[[str, str], None], ffmpeg: str | None = None):
        """ffmpeg: path of the program; looked up with find_ffmpeg() on first use when None."""
        self._dir = cache_dir
        self._log = log
        self._ffmpeg = ffmpeg
        self._ffmpeg_searched = ffmpeg is not None
        self._jobs: dict[str, _Job] = {}
        self._lock = threading.Lock()

    @property
    def available(self) -> bool:
        """True if FFmpeg was found."""
        if not self._ffmpeg_searched:
            self._ffmpeg, self._ffmpeg_searched = find_ffmpeg(), True
        return bool(self._ffmpeg)

    def serve(self, request, source: str, referer: str = "") -> None:
        """Answer `request` with `source` as WebM (finished file, or streamed while it is converted)."""
        if not self.available:
            return request.send_json(404, {"error": "FFmpeg fehlt – Video läuft nur in OBS"})
        key = hashlib.sha256(source.encode()).hexdigest()[:24]
        final = self._dir / f"{key}.webm"
        if final.is_file():
            final.touch()                                    # recently used: stays in the cache longest
            return send_file(request, final, "video/webm", "media")
        if request.command == "HEAD":                        # only a question – no conversion for it
            return request.send_plain(200, {"Content-Type": "video/webm", "Cache-Control": "no-store"})
        job = self._start(key, source, referer)
        if job is None:
            return request.send_json(503, {"error": "zu viele Umwandlungen gleichzeitig"})
        self._stream(request, job)

    def stop(self) -> None:
        """End all conversions (app quits); unfinished files are deleted."""
        with self._lock:
            jobs = list(self._jobs.values())
        for job in jobs:
            if job.process.poll() is None:
                job.process.kill()

    # --- conversion ---

    def _start(self, key: str, source: str, referer: str = "") -> _Job | None:
        with self._lock:
            if key in self._jobs:
                return self._jobs[key]
            if len(self._jobs) >= MAX_JOBS:
                return None
            self._dir.mkdir(parents=True, exist_ok=True)
            part = self._dir / f"{key}.webm.part"
            part.unlink(missing_ok=True)
            flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            referer = referer.replace("\r", "").replace("\n", "")      # no extra header lines
            fetch = ["-user_agent", USER_AGENT] + (["-headers", f"Referer: {referer}\r\n"] if referer else [])
            process = subprocess.Popen([self._ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
                                        *INPUT_LIMITS, *fetch, "-i", source, *FFMPEG_ARGS, *OUTPUT_LIMITS, str(part)],
                                       stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                                       creationflags=flags)
            job = self._jobs[key] = _Job(process, part)
        self._log("Video wird für das App-Fenster umgewandelt (H.264 → WebM)", "info")
        threading.Thread(target=self._finish, args=(key, job), name="media-convert", daemon=True).start()
        return job

    def _finish(self, key: str, job: _Job) -> None:
        """Wait for FFmpeg, keep the result – and always free the job slot and wake the readers, whatever fails."""
        try:
            errors = job.process.stderr.read().decode("utf-8", "replace")[-400:] if job.process.stderr else ""
            code = job.process.wait()
            final = self._dir / f"{key}.webm"
            if code == 0 and job.part.is_file() and job.part.stat().st_size > 0:
                for _ in range(10):                          # Windows: a reader may still have the file open
                    try:
                        job.part.replace(final)
                        job.ok = True
                        break
                    except OSError:
                        time.sleep(0.5)
                self._trim_cache()
            else:
                job.part.unlink(missing_ok=True)
                if code > 0:                                 # < 0: stopped on purpose
                    self._log(f"Video konnte nicht umgewandelt werden: {errors.strip() or code}", "warn")
        except OSError as error:
            self._log(f"Video-Umwandlung: {error}", "warn")
        finally:
            with self._lock:
                self._jobs.pop(key, None)
            job.done.set()

    def _trim_cache(self) -> None:
        """Delete the least recently used files while the cache is larger than CACHE_LIMIT; leftover .part files always go."""
        with self._lock:
            running = {job.part for job in self._jobs.values()}
        files = []
        for f in [*self._dir.glob("*.webm"), *self._dir.glob("*.webm.part")]:
            try:
                if f not in running:
                    info = f.stat()
                    files.append((info.st_mtime, info.st_size, f))
            except OSError:
                pass
        files.sort()
        total = sum(size for _, size, f in files if not f.name.endswith(".part"))
        for _, size, f in files:
            leftover = f.name.endswith(".part")
            if not leftover and total <= CACHE_LIMIT:
                continue
            try:
                f.unlink()
                if not leftover:
                    total -= size
            except OSError:
                pass

    # --- streaming while converting ---

    def _stream(self, request, job: _Job) -> None:
        """Send the growing file as it is written (no length known yet); ends when FFmpeg is done."""
        request.close_connection = True
        request.send_plain(200, {"Content-Type": "video/webm", "Cache-Control": "no-store", "Connection": "close"},
                           end_headers_only=True)
        if request.command == "HEAD":
            return
        sent, seen, last_growth = 0, 0, time.monotonic()
        final = job.part.with_name(job.part.name[:-len(".part")])
        try:
            while True:
                finished = job.done.is_set()
                path = final if finished and job.ok else job.part
                try:
                    with open(path, "rb") as f:
                        f.seek(sent)
                        while chunk := f.read(CHUNK):
                            request.wfile.write(chunk)
                            sent += len(chunk)
                except FileNotFoundError:
                    if finished:
                        return                               # failed or renamed and gone
                if finished:
                    return
                if sent != seen:
                    seen, last_growth = sent, time.monotonic()
                elif time.monotonic() - last_growth > STALL_SECONDS:
                    return                                   # nothing new for a minute: stop waiting
                time.sleep(0.2)
        except (BrokenPipeError, ConnectionResetError, OSError):
            return                                           # the window stopped listening; FFmpeg goes on for the cache
