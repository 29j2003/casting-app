"""The "Demo" area of the control page: export demos in the background, one after the other.

Demos come from the file dialog (button "Demo auswählen"), from dragging files onto the page (upload to the
local server), from dragging them onto Auto-Observer.exe (start arguments) or from a FACEIT match link.
Each map ends up as `<data folder>/demos/<name>.rohdaten.jsonl.gz` (see demo_export.py); the page can copy one
round as text or let the director run over the map (demo_replay.py) and copy the report.

Many demos at once: a whole folder ("Ordner umwandeln"), watching the download folder (every finished demo download
is exported on its own), a list of HLTV links (opened in the browser one after the other – HLTV lets only browsers
download, the watched folder picks the files up) and packing all raw data into a few zip files to pass on.
`demos/sources.json` remembers which downloads and HLTV demo numbers were exported already. Packed raw data files are
deleted (they are in the zip), so the folder does not grow and nothing is sent twice.
"""

import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
import zipfile
from collections import deque
from pathlib import Path

FACEIT_MATCH = re.compile(r"\b(1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b", re.I)
FACEIT_API = "https://open.faceit.com"
UPLOAD_LIMIT = 4 * 1024 ** 3
SAFE_NAME = re.compile(r"[^\w.\-]+")
DOWNLOAD_SUFFIXES = (".rar", ".zip", ".7z", ".dem", ".dem.zst", ".dem.gz", ".dem.bz2")
UNFINISHED = (".crdownload", ".part", ".partial", ".download", ".tmp")   # browsers' files while downloading
STABLE_SECONDS = 4.0                     # a download counts as finished when its size stays the same this long
WATCH_EVERY = 3.0
FOLDER_DEPTH = 2                         # "Ordner umwandeln" also looks into sub folders this deep
FOLDER_LIMIT = 500
PART_SIZE = 29_000_000                   # one zip from "Für Claude packen" at most (chat uploads: 30 MB per file)
ZIP_ENTRY = 200                          # zip bookkeeping per file on top of its name (headers, directory)
HLTV_LINK = re.compile(r"https?://(?:www\.)?hltv\.org/((?:matches/\d+/[\w-]+|download/demo/\d+))", re.I)
HLTV_DEMO = re.compile(r"/download/demo/(\d+)")
HLTV_RANGE = re.compile(r"(?<![\w/-])(\d{4,7})\s*(?:-|–|bis)\s*(\d{4,7})(?![\w/-])")   # "108800-108852"
HLTV_GAP = 2.0                           # seconds between two links (polite to HLTV, browser keeps up)
HLTV_LIMIT = 60
HLTV_AGENT = "Auto-Observer (demo export for casting)"
WAITING_MAX = 2                          # load the next demo only when at most this many wait for their export


def downloads_folder() -> Path:
    """The user's download folder (Windows: also when moved to another drive)."""
    if sys.platform == "win32":
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                                r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders") as key:
                value, _ = winreg.QueryValueEx(key, "{374DE290-123F-4565-9164-39C4925E467B}")
            return Path(os.path.expandvars(value))
        except OSError:
            pass
    return Path.home() / "Downloads"


def is_download(path: Path) -> bool:
    """A demo download by its name (not a half-finished browser file)."""
    name = path.name.lower()
    return name.endswith(DOWNLOAD_SUFFIXES) and not name.startswith("rohdaten_")      # not our own packed zips


def hltv_links(text: str) -> list[str]:
    """HLTV match and demo links in any pasted text, without duplicates, in order. Demo numbers count up, so a
    range like "108800-108852" stands for every demo link in between."""
    text = text or ""
    paths = HLTV_LINK.findall(text)
    for first, last in HLTV_RANGE.findall(HLTV_LINK.sub(" ", text)):
        low, high = sorted((int(first), int(last)))
        paths += [f"download/demo/{number}" for number in range(low, min(high, low + HLTV_LIMIT - 1) + 1)]
    seen, links = set(), []
    for path in paths:
        same = re.sub(r"^(matches/\d+)/.*", r"\1", path.lower())          # one match, however its link is written
        if same not in seen:
            seen.add(same)
            links.append(f"https://www.hltv.org/{path}")
    return links[:HLTV_LIMIT]


def casting_app_faceit_key() -> str:
    """The FACEIT key the casting app keeps in the system keyring ("" if there is none or no keyring)."""
    try:
        import keyring
        return keyring.get_password("Casting-App", "faceit-key") or ""
    except Exception:                    # no keyring module or backend on this system
        return ""


class DemoJobs:
    """Queue of demo files to export, results and a short log for the page."""

    def __init__(self, data_folder: Path, log, settings=None):
        self.folder = data_folder / "demos"
        self._log = log
        self._settings = settings            # demo_watch, demo_watch_folder, demo_delete (None in tests: all off)
        self._lock = threading.Lock()
        self._dialog_lock = threading.Lock()
        self._queue: deque[tuple[Path, bool]] = deque()     # (file, delete it after a good export)
        self._running = False
        self.current = ""
        self.lines: deque = deque(maxlen=40)
        self.results: list[dict] = []
        self.faceit_key = ""                 # typed in on the page (only for this session)
        self._sizes: dict[str, tuple[int, float]] = {}      # watched file → (size, since when unchanged)
        self._queued: set[str] = set()
        self._hltv_busy = False
        self._hltv_stop = threading.Event()
        self._sources = self._load_sources()

    # --- what was done already (demos/sources.json) ---

    def _load_sources(self) -> dict:
        try:
            data = json.loads((self.folder / "sources.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            data = {}
        data = data if isinstance(data, dict) else {}
        for key, empty in (("done", {}), ("hltv", [])):
            if not isinstance(data.get(key), type(empty)):
                data[key] = empty
        return data

    def _save_sources(self) -> None:
        try:
            self.folder.mkdir(parents=True, exist_ok=True)
            temporary = self.folder / "sources.json.tmp"
            temporary.write_text(json.dumps(self._sources, ensure_ascii=False), encoding="utf-8")
            os.replace(temporary, self.folder / "sources.json")
        except OSError:
            pass

    @staticmethod
    def _source_key(path: Path) -> str:
        try:
            return f"{path.name}|{path.stat().st_size}"
        except OSError:
            return path.name

    def _setting(self, key: str, default):
        try:
            return self._settings[key] if self._settings is not None else default
        except KeyError:
            return default

    # --- queue ---

    def _files(self) -> list[dict]:
        """Exports of this session (with map and counts) and older files in the folder."""
        known = {r["file"]: r for r in self.results}
        files = []
        if self.folder.is_dir():
            for path in sorted(self.folder.glob("*.rohdaten.jsonl.gz"), key=lambda p: p.stat().st_mtime):
                files.append(known.get(path.name) or {"file": path.name, "map": "", "rounds": None, "kills": None,
                                                      "size": path.stat().st_size})
        return files

    def note(self, text: str) -> None:
        self.lines.append(text)
        self._log(text, "info")

    def add(self, paths: list[str], delete: bool = False) -> int:
        """Queue files for export; `delete` = remove each file after its good export (copies, or if wanted)."""
        added = 0
        with self._lock:
            for raw in paths:
                path = Path(raw)
                if path.is_file() and str(path) not in self._queued:
                    self._queue.append((path, delete))
                    self._queued.add(str(path))
                    added += 1
            if added and not self._running:
                self._running = True
                threading.Thread(target=self._work, name="demo-export", daemon=True).start()
        return added

    def _work(self) -> None:
        from .demo_export import export_download
        while True:
            with self._lock:
                if not self._queue:
                    self._running, self.current = False, ""
                    return
                path, delete = self._queue.popleft()
                self.current = path.name
            key, good = self._source_key(path), False
            try:
                for result in export_download(path, self.folder, log=self.note):
                    result["file"] = Path(result["file"]).name
                    with self._lock:
                        self.results = [r for r in self.results if r["file"] != result["file"]] + [result]
                good = True
            except Exception as error:       # a broken demo must not stop the queue
                self.note(f"Fehler bei {path.name}: {error}")
            with self._lock:
                self._queued.discard(str(path))
                self._sources["done"][key] = "ok" if good else "error"
                self._save_sources()
            if good and delete:
                try:
                    path.unlink()
                    self.note(f"{path.name} gelöscht (umgewandelt)")
                except OSError as error:
                    self.note(f"{path.name} nicht gelöscht: {error}")

    def state(self) -> dict:
        with self._lock:
            return {"running": self._running, "current": self.current, "queued": len(self._queue),
                    "log": list(self.lines)[-12:], "results": self._files(),
                    "faceit_key": bool(self.faceit_key or casting_app_faceit_key()),
                    "watch_folder": str(self.watch_folder()), "unpacked": len(self._files()),
                    "hltv_busy": self._hltv_busy}

    # --- many demos at once ---

    def watch_folder(self) -> Path:
        chosen = str(self._setting("demo_watch_folder", "") or "").strip()
        return Path(chosen) if chosen else downloads_folder()

    def start_watching(self) -> None:
        threading.Thread(target=self._watch_loop, name="demo-watch", daemon=True).start()

    def _watch_loop(self) -> None:
        while True:
            try:
                self.watch_once()
            except Exception as error:       # never stop watching because of one odd file
                self._log(f"Download-Ordner: {error!r}", "warn")
            time.sleep(WATCH_EVERY)

    def watch_once(self, now: float | None = None) -> int:
        """One look into the watched folder: queue finished demo downloads that are new since watching began."""
        if not self._setting("demo_watch", False):
            self._sources.pop("watch_since", None)
            self._sizes.clear()
            return 0
        now = time.time() if now is None else now
        if not isinstance(self._sources.get("watch_since"), (int, float)):
            self._sources["watch_since"] = now
            self._save_sources()
            self.note(f"Beobachte {self.watch_folder()} – neue Demo-Downloads werden von selbst umgewandelt")
        since = self._sources["watch_since"]
        folder = self.watch_folder()
        try:
            entries = [p for p in folder.iterdir() if p.is_file()]
        except OSError:
            return 0
        names = {p.name.lower() for p in entries}
        ready = []
        for path in entries:
            if not is_download(path) or any(path.name.lower() + end in names for end in UNFINISHED):
                continue
            try:
                info = path.stat()
            except OSError:
                continue
            if info.st_mtime < since - 60 or info.st_size == 0 or self._source_key(path) in self._sources["done"]:
                continue
            size, unchanged_since = self._sizes.get(str(path), (-1, now))
            if size != info.st_size:
                self._sizes[str(path)] = (info.st_size, now)
                continue
            if now - unchanged_since >= STABLE_SECONDS and str(path) not in self._queued:
                ready.append(path)
        if ready:
            self.note(f"Neue Demo im Download-Ordner: {', '.join(p.name for p in ready)}")
        return self.add([str(p) for p in ready], delete=bool(self._setting("demo_delete", False)))

    def add_folder(self, folder: Path) -> tuple[int, int]:
        """Queue every demo in a folder (and sub folders) that was not exported before; (queued, skipped)."""
        found: list[Path] = []
        base_depth = len(folder.parts)
        for root, dirs, files in os.walk(folder):
            if len(Path(root).parts) - base_depth >= FOLDER_DEPTH:
                dirs[:] = []
            found += [Path(root) / name for name in files if is_download(Path(name))]
            if len(found) >= FOLDER_LIMIT:
                break
        found.sort(key=lambda p: p.stat().st_mtime if p.exists() else 0)
        fresh = [p for p in found if self._source_key(p) not in self._sources["done"]]
        added = self.add([str(p) for p in fresh], delete=bool(self._setting("demo_delete", False)))
        return added, len(found) - len(fresh)

    def choose_folder(self) -> tuple[bool, str]:
        with self._dialog_lock:
            try:
                import tkinter
                from tkinter import filedialog
                root = tkinter.Tk()
                root.withdraw()
                root.attributes("-topmost", True)
                chosen = filedialog.askdirectory(parent=root, title="Ordner mit Demos auswählen",
                                                 initialdir=str(self.watch_folder()))
                root.destroy()
            except Exception as error:
                return False, f"Ordnerauswahl geht nicht ({error})"
        if not chosen:
            return False, "Kein Ordner gewählt"
        added, skipped = self.add_folder(Path(chosen))
        text = f"{added} Demo(s) aus {chosen} in der Warteschlange"
        if skipped:
            text += f", {skipped} schon umgewandelt"
        self.note(text)
        return True, text

    def pack(self) -> tuple[bool, str]:
        """All raw data files into zip files of at most PART_SIZE in the demos folder; each file is deleted once its
        zip is written and checked."""
        files = sorted(self.folder.glob("*.rohdaten.jsonl.gz"), key=lambda p: p.stat().st_mtime)
        if not files:
            return False, "Keine Rohdaten zum Packen (schon gepackte Dateien sind gelöscht)"
        parts, part, size = [], [], 22                       # 22: end record of a zip
        for path in files:
            length = path.stat().st_size + ZIP_ENTRY + 2 * len(path.name.encode())
            if part and size + length > PART_SIZE:
                parts.append(part)
                part, size = [], 22
            part.append(path)
            size += length
        parts.append(part)
        stamp = time.strftime("%Y-%m-%d_%H-%M-%S")
        written, packed = [], 0
        for number, group in enumerate(parts, 1):
            target = self.folder / (f"Rohdaten_{stamp}" + (f"_{number}" if len(parts) > 1 else "") + ".zip")
            temporary = target.with_suffix(".zip.part")
            try:
                with zipfile.ZipFile(temporary, "w", zipfile.ZIP_STORED) as archive:   # already gzip
                    for path in group:
                        archive.write(path, path.name)
                with zipfile.ZipFile(temporary) as archive:
                    if archive.testzip() is not None or len(archive.namelist()) != len(group):
                        raise OSError("Zip fehlerhaft")
                os.replace(temporary, target)
            except OSError as error:
                temporary.unlink(missing_ok=True)
                self.note(f"Packen abgebrochen: {error}")
                break
            for path in group:
                try:
                    path.unlink()
                    packed += 1
                except OSError as error:
                    self.note(f"{path.name} nicht gelöscht: {error}")
            written.append(f"{target.name} ({target.stat().st_size / 1e6:.0f} MB)")
        if not written:
            return False, "Packen ging nicht"
        text = f"{packed} Rohdaten-Datei(en) gepackt und gelöscht: {', '.join(written)}"
        self.note(text)
        return True, text

    def hltv(self, text: str) -> tuple[bool, str]:
        """Load HLTV demos one after the other: directly if HLTV lets the app, else in the browser (the watched
        download folder then exports them)."""
        links = hltv_links(text)
        if not links:
            return False, "Keine HLTV-Links gefunden (…hltv.org/download/demo/…, …/matches/… oder Nummern von–bis)"
        if self._hltv_busy:
            return False, "Die letzten HLTV-Demos werden noch geladen"
        self._hltv_busy = True
        self._hltv_stop.clear()
        threading.Thread(target=self._load_hltv, args=(links,), name="hltv-links", daemon=True).start()
        return True, f"{len(links)} HLTV-Demo(s) werden nacheinander geladen"

    def stop_hltv(self) -> None:
        self._hltv_stop.set()

    def _load_hltv(self, links: list[str]) -> None:
        direct = True                        # HLTV often answers only browsers – then stop asking it
        missing = skipped = 0
        try:
            for number, link in enumerate(links):
                if self._hltv_stop.is_set():
                    self.note("HLTV-Laden gestoppt")
                    return
                if number:
                    self._hltv_stop.wait(HLTV_GAP)
                demo = HLTV_DEMO.search(link)
                if not demo and direct:
                    demo, direct = self._hltv_demo_link(link)
                if demo and demo.group(1) in self._sources["hltv"]:
                    skipped += 1                             # loaded and exported before
                    continue
                if demo and direct:
                    while len(self._queue) >= WAITING_MAX and not self._hltv_stop.is_set():
                        self._hltv_stop.wait(2)              # don't fill the disk faster than the export runs
                    result = self._fetch_hltv_demo(demo.group(1))
                    if result == "ok":
                        continue
                    if result == "missing":
                        missing += 1
                        continue
                    direct = False
                    self.note("HLTV lässt die App nicht selbst laden – ab jetzt über den Browser")
                self._open_in_browser(link if not demo else f"https://www.hltv.org/download/demo/{demo.group(1)}",
                                      bool(demo))
        finally:
            if missing:
                self.note(f"{missing} Demo-Nummer(n) ohne Demo bei HLTV übersprungen")
            if skipped:
                self.note(f"{skipped} HLTV-Demo(s) schon früher geladen – übersprungen")
            self._hltv_busy = False

    def _open_in_browser(self, link: str, is_demo: bool) -> None:
        if self._settings is not None and not self._setting("demo_watch", False):
            self._settings.apply({"demo_watch": True})
            self.note("Download-Ordner wird jetzt beobachtet – die Demos werden nach dem Download umgewandelt")
        webbrowser.open(link)
        self.note(f"Im Browser angestoßen: {link}" if is_demo else
                  f"Match im Browser geöffnet – dort „GOTV Demo“ klicken: {link}")

    def _fetch_hltv_demo(self, number: str) -> str:
        """Download one HLTV demo into demos/uploads and queue it: "ok", "missing" (no such demo) or "blocked"."""
        request = urllib.request.Request(f"https://www.hltv.org/download/demo/{number}",
                                         headers={"User-Agent": HLTV_AGENT})
        target = None
        try:
            with urllib.request.urlopen(request, timeout=30) as answer:
                if "text/html" in (answer.headers.get("Content-Type") or ""):
                    return "blocked"                         # a check page instead of the file
                disposition = answer.headers.get("Content-Disposition") or ""
                named = re.search(r'filename\*?=(?:UTF-8\'\')?"?([^";]+)', disposition)
                name = urllib.parse.unquote(named.group(1)) if named else \
                    Path(urllib.parse.urlparse(answer.geturl()).path).name
                name = SAFE_NAME.sub("_", Path(name).name)[:120]
                if not is_download(Path(name)):
                    name = f"hltv-{number}.rar"
                target = self.folder / "uploads" / name
                target.parent.mkdir(parents=True, exist_ok=True)
                temporary = target.with_name(target.name + ".part")
                self.note(f"Lade HLTV-Demo {number} ({name}) …")
                loaded = 0
                with open(temporary, "wb") as out:
                    while chunk := answer.read(1024 * 1024):
                        if self._hltv_stop.is_set():
                            raise InterruptedError
                        out.write(chunk)
                        loaded += len(chunk)
                os.replace(temporary, target)
        except urllib.error.HTTPError as error:
            return "missing" if error.code in (404, 410) else "blocked"
        except InterruptedError:
            if target is not None:
                target.with_name(target.name + ".part").unlink(missing_ok=True)
            return "ok"
        except (urllib.error.URLError, OSError, ValueError) as error:
            if target is not None:
                target.with_name(target.name + ".part").unlink(missing_ok=True)
            self.note(f"HLTV-Demo {number} nicht geladen: {error}")
            return "blocked"
        self.note(f"HLTV-Demo {number} geladen ({loaded / 1e6:.0f} MB)")
        with self._lock:
            self._sources["hltv"] = (self._sources["hltv"] + [number])[-5000:]
            self._save_sources()
        self.add([str(target)], delete=True)               # our own download – not needed after the export
        return "ok"

    @staticmethod
    def _hltv_demo_link(link: str):
        """(demo link match or None, HLTV still worth asking)."""
        request = urllib.request.Request(link, headers={"User-Agent": HLTV_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=15) as answer:
                page = answer.read(3 * 1024 * 1024).decode("utf-8", "replace")
        except urllib.error.HTTPError as error:
            return None, error.code not in (403, 429, 503)
        except (urllib.error.URLError, OSError, ValueError):
            return None, False
        found = HLTV_DEMO.search(page)
        return found, found is not None or "challenge" not in page.lower()     # Cloudflare's check page

    # --- getting files ---

    def choose(self) -> int:
        """Native file dialog on this PC (the browser can't hand over file paths)."""
        with self._dialog_lock:
            try:
                import tkinter
                from tkinter import filedialog
                root = tkinter.Tk()
                root.withdraw()
                root.attributes("-topmost", True)
                names = filedialog.askopenfilenames(
                    parent=root, title="Demos auswählen",
                    filetypes=[("Demos und Archive", "*.dem *.rar *.zip *.7z *.zst *.gz *.bz2"), ("Alle Dateien", "*.*")])
                root.destroy()
            except Exception as error:
                self.note(f"Dateiauswahl geht nicht ({error}) – Datei auf die Seite ziehen")
                return 0
        return self.add(list(names))

    def upload(self, name: str, stream, length: int) -> Path:
        """Save a file dragged onto the page and queue it."""
        if not 0 < length <= UPLOAD_LIMIT:
            raise ValueError("Datei leer oder zu groß")
        safe = SAFE_NAME.sub("_", Path(name).name)[:120] or "demo.dem"
        target = self.folder / "uploads" / safe
        target.parent.mkdir(parents=True, exist_ok=True)
        left = length
        with open(target, "wb") as out:
            while left > 0:
                chunk = stream.read(min(1024 * 1024, left))
                if not chunk:
                    raise ValueError("Übertragung abgebrochen")
                out.write(chunk)
                left -= len(chunk)
        self.add([str(target)], delete=True)                # our own copy – not needed after the export
        return target

    def faceit(self, link: str) -> tuple[bool, str]:
        """Load the demo of a FACEIT match: with download rights of the key directly, else open the match room."""
        found = FACEIT_MATCH.search(link or "")
        if not found:
            return False, "Kein FACEIT-Match im Link gefunden (…/room/1-…)"
        match_id = found.group(1)
        key = self.faceit_key or casting_app_faceit_key()
        room = f"https://www.faceit.com/de/cs2/room/{match_id}"
        if not key:
            webbrowser.open(room)
            return False, "Kein FACEIT-Key – Matchroom geöffnet: Demo dort herunterladen und hier auswählen"
        try:
            details = self._faceit_json(f"{FACEIT_API}/data/v4/matches/{match_id}", key)
            urls = details.get("demo_url") or []
            if not urls:
                return False, "FACEIT hat für dieses Match (noch) keine Demo"
            target = self.folder / "uploads" / f"{match_id}.dem.zst"
            for resource in urls:
                signed = self._faceit_json(f"{FACEIT_API}/download/v2/demos/download", key, {"resource_url": resource})
                url = (signed.get("payload") or {}).get("download_url") or ""
                if url.startswith("https://"):
                    suffix = ".dem.gz" if ".gz" in url.split("?")[0] else ".dem.zst"
                    target = target.with_name(f"{match_id}{suffix}")
                    self.note(f"Lade FACEIT-Demo {match_id} …")
                    self._download(url, target)
                    self.add([str(target)], delete=True)        # our own download – not needed afterwards
                    return True, "FACEIT-Demo geladen, Export läuft"
        except urllib.error.HTTPError as error:
            if error.code in (401, 403):
                webbrowser.open(room)
                return False, ("Dein FACEIT-Key darf keine Demos laden (FACEIT schaltet das extra frei). "
                               "Matchroom geöffnet: Demo dort herunterladen und hier auswählen")
            return False, f"FACEIT antwortet mit Fehler {error.code}"
        except (urllib.error.URLError, OSError, ValueError) as error:
            return False, f"FACEIT nicht erreichbar: {error}"
        webbrowser.open(room)
        return False, "Kein Download-Link von FACEIT – Matchroom geöffnet"

    @staticmethod
    def _faceit_json(url: str, key: str, body: dict | None = None) -> dict:
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(url, data=data, method="POST" if body is not None else "GET")
        request.add_header("Authorization", f"Bearer {key}")
        request.add_header("Accept", "application/json")
        if body is not None:
            request.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(request, timeout=20) as answer:
            result = json.loads(answer.read(5 * 1024 * 1024))
        return result if isinstance(result, dict) else {}

    @staticmethod
    def _download(url: str, target: Path) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=60) as answer, open(target, "wb") as out:
            while chunk := answer.read(1024 * 1024):
                out.write(chunk)

    # --- using the results ---

    def path_of(self, name: str) -> Path:
        path = self.folder / Path(str(name)).name
        if not path.name.endswith(".rohdaten.jsonl.gz") or not path.is_file():
            raise ValueError("Rohdaten-Datei nicht gefunden")
        return path

    def round_text(self, name: str, round_number: int) -> str:
        from .demo_export import round_text
        return round_text(self.path_of(name), round_number)

    def evaluate(self, name: str) -> str:
        from .demo_replay import evaluate, report
        from .map_knowledge import MapKnowledge
        return report(evaluate(str(self.path_of(name)), knowledge=MapKnowledge.load_folder()))
