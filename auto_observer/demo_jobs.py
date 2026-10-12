"""The "Demo" area of the control page: export demos in the background, one after the other.

Demos come from the file dialog (button "Demo auswählen"), from dragging files onto the page (upload to the
local server), from dragging them onto Auto-Observer.exe (start arguments) or from a FACEIT match link.
Each map ends up as `<data folder>/demos/<name>.rohdaten.jsonl.gz` (see demo_export.py); the page can copy one
round as text or let the director run over the map (demo_replay.py) and copy the report.
"""

import json
import re
import threading
import urllib.error
import urllib.request
import webbrowser
from collections import deque
from pathlib import Path

FACEIT_MATCH = re.compile(r"\b(1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b", re.I)
FACEIT_API = "https://open.faceit.com"
UPLOAD_LIMIT = 4 * 1024 ** 3
SAFE_NAME = re.compile(r"[^\w.\-]+")


def casting_app_faceit_key() -> str:
    """The FACEIT key the casting app keeps in the system keyring ("" if there is none or no keyring)."""
    try:
        import keyring
        return keyring.get_password("Casting-App", "faceit-key") or ""
    except Exception:                    # no keyring module or backend on this system
        return ""


class DemoJobs:
    """Queue of demo files to export, results and a short log for the page."""

    def __init__(self, data_folder: Path, log):
        self.folder = data_folder / "demos"
        self._log = log
        self._lock = threading.Lock()
        self._dialog_lock = threading.Lock()
        self._queue: deque[Path] = deque()
        self._running = False
        self.current = ""
        self.lines: deque = deque(maxlen=40)
        self.results: list[dict] = []
        self.faceit_key = ""                 # typed in on the page (only for this session)

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

    def add(self, paths: list[str]) -> int:
        added = 0
        with self._lock:
            for raw in paths:
                path = Path(raw)
                if path.is_file():
                    self._queue.append(path)
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
                path = self._queue.popleft()
                self.current = path.name
            try:
                for result in export_download(path, self.folder, log=self.note):
                    result["file"] = Path(result["file"]).name
                    with self._lock:
                        self.results = [r for r in self.results if r["file"] != result["file"]] + [result]
            except Exception as error:       # a broken demo must not stop the queue
                self.note(f"Fehler bei {path.name}: {error}")

    def state(self) -> dict:
        with self._lock:
            return {"running": self._running, "current": self.current, "queued": len(self._queue),
                    "log": list(self.lines)[-12:], "results": self._files(),
                    "faceit_key": bool(self.faceit_key or casting_app_faceit_key())}

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
        self.add([str(target)])
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
                    self.add([str(target)])
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
