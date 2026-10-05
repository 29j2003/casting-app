"""The local HTTP server: control page, overlays and the API behind them.

Security rules (unchanged from version 1.x):
  - only requests from this PC to the app's own address (protects against DNS rebinding)
  - only the app's own pages may use the API; websites from the internet are refused
  - files are served only from web/ and from the user's video and font folders
  - secrets are used inside the server only (see secret_store.py)

The API and the JSON field names are German because the existing web pages use them.
"""

import base64
import json
import re
import socket
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Callable

from .. import secret_store
from ..app_log import AppLog
from ..paths import IS_WINDOWS, WEB_DIR, AppFolders
from ..version import VERSION
from . import cs2_setup, faceit
from .event_hub import EventClient, EventHub
from .game_state import LAN_PORT, GameStateReceiver, lan_addresses
from .static_files import CONTENT_TYPES, path_inside, send_file
from .video_info import video_info

PORT = 8787
BASE_URL = f"http://localhost:{PORT}"
ALLOWED_HOSTS = {f"localhost:{PORT}", f"127.0.0.1:{PORT}", f"[::1]:{PORT}"}
ALLOWED_ORIGINS = {BASE_URL, f"http://127.0.0.1:{PORT}", f"http://[::1]:{PORT}"}
LOCAL_ADDRESSES = {"127.0.0.1", "::1", "::ffff:127.0.0.1"}
SAME_SITE = {"same-origin", "none"}             # allowed values of the Sec-Fetch-Site header

MAX_STATE_SIZE = 3_000_000
MAX_IMAGE_SIZE = 12_000_000
STATE_SAVE_DELAY = 0.4                           # seconds; saves are bundled
IMAGE_KEEP_DAYS = 7
IMAGE_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif", "image/svg+xml": ".svg"}
IMAGE_DATA_URL = re.compile(r"^data:(image/(?:png|jpeg|webp|gif|svg\+xml));base64,([A-Za-z0-9+/=]+)$")
STATE_NUMBER = re.compile(r'"stand"\s*:\s*(\d+)')
MAX_LOG_MESSAGES_PER_MINUTE = 30

# Official DACH CS browser sources; OBS loads /dach/<page> and the app redirects with ID and key
DACH_PAGES = {"overview", "singlecast", "duocast", "lineup", "mapveto", "ingame", "positions", "tabelle", "playoffs",
              "last_matches", "current_matches", "next_matches", "last_matches_f1", "last_matches_f2",
              "next_matches_f1", "next_matches_f2", "mvp", "pause", "pause_content", "pause_own_content",
              "singleinteraction", "duointeraction", "solo_interview", "duointerview", "endscreen"}
DACH_MISSING_PAGE = ('<body style="margin:0;background:transparent;font:600 28px Segoe UI,sans-serif;color:#fff;'
                     'display:grid;place-items:center;height:100vh"><div style="background:rgba(0,0,0,.6);padding:24px 32px;'
                     'border-radius:12px">DACH-CS-Zugang fehlt – in der Casting-App unter Setup → Aussehen eintragen</div></body>')


class CastingServer:
    """Owns the app state and serves all requests."""

    def __init__(self, folders: AppFolders, secrets: secret_store.SecretStore, log: AppLog,
                 on_quit_requested: Callable[[], None], open_folder: Callable[[Path], None] | None = None):
        """
        on_quit_requested – called when a page or a newer version asks the app to quit (/api/beenden)
        open_folder       – shows a folder in the file manager (desktop app); None = Windows Explorer only
        """
        self.folders = folders
        self.secrets = secrets
        self.log = log
        self.events = EventHub()
        self.game_state = GameStateReceiver(folders.data, self.events.broadcast, log.write)
        self._on_quit_requested = on_quit_requested
        self._open_folder = open_folder
        self._started_at = int(time.time() * 1000)
        self._servers: list[ThreadingHTTPServer] = []
        self._log_message_times: list[float] = []

        self._state_file = folders.data / "zustand.json"
        self._state_lock = threading.Lock()
        self._state_text: str | None = None      # app state as JSON text (kept as sent by the control page)
        self._state_number = 0                   # "stand": increases with every change
        self._save_timer: threading.Timer | None = None
        self._load_state()

    # --- lifecycle ---

    def start(self) -> None:
        """Listen on 127.0.0.1 and ::1. Raises OSError if the port is taken."""
        handler = self._handler_class()
        main_server = ThreadingHTTPServer(("127.0.0.1", PORT), handler)
        self._servers = [main_server]
        try:
            ipv6_server = _IPv6Server(("::1", PORT), handler)
            self._servers.append(ipv6_server)
        except OSError:
            pass                                  # no IPv6 – not needed
        for server in self._servers:
            server.daemon_threads = True
            threading.Thread(target=server.serve_forever, name="http", daemon=True).start()
        self.log.info(f"Server bereit: {BASE_URL}")
        if self.game_state.settings.get("netz"):
            self.game_state.set_lan_receiver(True)
        self._schedule_image_cleanup(60)

    def stop(self) -> None:
        """Save the state and stop listening."""
        self.save_state_now()
        for server in self._servers:
            server.shutdown()
            server.server_close()
        self.game_state.set_lan_receiver(False)

    def reload_overlays(self) -> int:
        """Make every connected overlay reload itself; returns how many were told."""
        count = self.events.broadcast("neuladen", "{}", overlays_only=True)
        self.log.info(f"{count} Overlay(s) neu geladen" if count else "Overlays neu laden: keine Overlays verbunden")
        return count

    # --- app state ---

    def _load_state(self) -> None:
        try:
            self._state_text = self._state_file.read_text(encoding="utf-8")
            match = STATE_NUMBER.search(self._state_text)
            self._state_number = int(match.group(1)) if match else 0
        except OSError:
            self._state_text = None

    def _store_state(self, text: str) -> bool:
        """Take a new state from the control page; older states (lower "stand") are ignored."""
        match = STATE_NUMBER.search(text)
        if not match:
            return False
        number = int(match.group(1))
        with self._state_lock:
            if number < self._state_number:
                return True
            self._state_text, self._state_number = text, number
            if self._save_timer:
                self._save_timer.cancel()
            self._save_timer = threading.Timer(STATE_SAVE_DELAY, self.save_state_now)
            self._save_timer.daemon = True
            self._save_timer.start()
        self.events.broadcast("zustand", text.replace("\n", " "), overlays_only=True)
        return True

    def save_state_now(self) -> None:
        with self._state_lock:
            if self._save_timer:
                self._save_timer.cancel()
                self._save_timer = None
            text = self._state_text
        if text:
            try:
                self._state_file.write_text(text, encoding="utf-8")
            except OSError as error:
                self.log.error(f"Speichern fehlgeschlagen: {error}")

    # --- images ---

    def _schedule_image_cleanup(self, delay: float) -> None:
        timer = threading.Timer(delay, self._clean_up_images)
        timer.daemon = True
        timer.start()

    def _clean_up_images(self) -> None:
        """Delete uploaded images that the state no longer uses and that are older than 7 days."""
        try:
            used = set(re.findall(r"asset:([a-z0-9]+)", self._state_text or ""))
            removed = 0
            for image in self.folders.images.iterdir():
                if image.stem not in used and time.time() - image.stat().st_mtime > IMAGE_KEEP_DAYS * 86400:
                    image.unlink()
                    removed += 1
            if removed:
                self.log.info(f"{removed} ungenutzte Bilder aufgeräumt")
        except OSError:
            pass
        self._schedule_image_cleanup(6 * 3600)

    # --- request handling ---

    def _handler_class(self):
        server = self

        class RequestHandler(_JsonHandler):
            def do_GET(self):
                server.handle(self)

            do_HEAD = do_POST = do_DELETE = do_PUT = do_GET

        return RequestHandler

    def handle(self, request: "_JsonHandler") -> None:
        request.body_was_read = False
        try:
            self._route(request)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as error:               # never let one request take the server down
            self.log.error(f"Fehler: {error}")
            try:
                request.send_json(500, {"fehler": "intern"})
            except OSError:
                pass
        # a body nobody read would be mistaken for the next request on this connection
        if not request.body_was_read and int(request.headers.get("Content-Length") or 0) > 0:
            request.close_connection = True

    def _route(self, request: "_JsonHandler") -> None:
        # 1) only this PC and only our own address
        if request.client_address[0] not in LOCAL_ADDRESSES or request.headers.get("Host", "") not in ALLOWED_HOSTS:
            return request.send_plain(403)
        url = urllib.parse.urlsplit(request.path)
        path = urllib.parse.unquote(url.path)
        query = {k: v[0] for k, v in urllib.parse.parse_qs(url.query).items()}
        origin = request.headers.get("Origin")
        fetch_site = request.headers.get("Sec-Fetch-Site")

        # 2) CS2 posts live data (a program: no Origin, no Sec-Fetch-Site)
        if path == "/api/gsi" and request.command == "POST":
            if origin or fetch_site:
                return request.send_plain(403)
            status, answer = self.game_state.accept(request.read_body(2_000_000), "lokal")
            return request.send_json(status, answer)

        dach_match = re.match(r"^/dach/([a-z0-9_]{2,30})$", path)
        if dach_match and request.command == "GET":
            return self._redirect_to_dach(request, dach_match.group(1), fetch_site)

        # 3) everything else: only our own pages, no websites from the internet
        if (fetch_site and fetch_site not in SAME_SITE) or (origin and origin not in ALLOWED_ORIGINS):
            return request.send_plain(403)
        request.extra_headers = {"X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer"}

        if path.startswith("/api/"):
            return self._route_api(request, path, query)
        return self._serve_file(request, path)

    def _redirect_to_dach(self, request, page: str, fetch_site: str | None) -> None:
        """Forward OBS/the preview to the official DACH CS browser source (ID and key added here only)."""
        if fetch_site and fetch_site not in SAME_SITE:
            return request.send_plain(403)
        if page not in DACH_PAGES:
            return request.send_json(404, {"fehler": "unbekannte DACH-CS-Seite"})
        user_id, key = self.secrets.get(secret_store.DACH_USER_ID), self.secrets.get(secret_store.DACH_KEY)
        if not user_id or not key:
            return request.send_body(409, DACH_MISSING_PAGE.encode(), "text/html; charset=utf-8")
        target = (f"https://user.dachcs.de/castingoverlay/{page}.php?"
                  + urllib.parse.urlencode({"userid": user_id, "key": key}))
        request.send_plain(302, {"Location": target, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})

    def _route_api(self, request, path: str, query: dict) -> None:
        method = request.command
        if path == "/api/ping":
            return request.send_json(200, {"ok": True, "dienst": "cast", "version": VERSION})
        if path == "/api/ereignisse":
            return self._stream_events(request, query)
        if path == "/api/zustand":
            return self._api_state(request, query)
        image_match = re.match(r"^/api/bild/([a-z0-9]{4,40})$", path)
        if image_match:
            return self._api_image(request, image_match.group(1))
        if path == "/api/gsi-info":
            return request.send_json(200, self.game_state.info())
        if path == "/api/gsi-einstellungen" and method == "POST":
            self.game_state.apply_settings(request.read_json(4000))
            return request.send_json(200, {"ok": True, "netz": self.game_state.lan_receiver_running})
        if path == "/api/gsi-cfg":
            return self._api_gsi_cfg_download(request, query)
        if path == "/api/ordner-liste":
            return request.send_json(200, cs2_setup.list_subfolders(str(query.get("pfad", "")).strip()))
        if path == "/api/cs2-suchen":
            return request.send_json(200, {"funde": cs2_setup.search_cfg_folders()})
        if path == "/api/gsi-pfad" and method == "POST":
            return self._api_gsi_cfg_into_folder(request)
        if path == "/api/gsi-einrichten" and method == "POST":
            return self._api_gsi_set_up(request)
        if path == "/api/gsi":
            if not self.game_state.last_raw:
                return request.send_json(200, {"daten": None})
            age = int((time.time() - self.game_state.last_time) * 1000)
            return request.send_body(200, f'{{"alterMs":{age},"daten":{self.game_state.last_raw}}}'.encode())
        if path == "/api/dach-zugang":
            return self._api_dach_access(request)
        if path == "/api/faceit-schluessel":
            return self._api_faceit_key(request)
        if path.startswith("/api/faceit/"):
            return self._api_faceit(request, path[len("/api/faceit/"):], query)
        if path == "/api/meldung" and method == "POST":
            return self._api_overlay_message(request)
        if path == "/api/videos":
            return self._api_videos(request)
        if path == "/api/schriften":
            fonts = sorted(f.name for f in self.folders.fonts.iterdir() if f.suffix.lower() in (".ttf", ".otf", ".woff", ".woff2"))
            return request.send_json(200, {"ordner": str(self.folders.fonts), "schriften": fonts})
        if path == "/api/ordner" and method == "POST":
            return self._api_open_folder(request, query.get("welcher"))
        if path == "/api/log":
            return request.send_json(200, {
                "version": VERSION, "start": self._started_at, "ordner": self.folders.as_dict(), "log": self.log.latest(200),
                "clients": [c.describe() for c in self.events.clients()],
                "gsi": int((time.time() - self.game_state.last_time) * 1000) if self.game_state.last_raw else None})
        if path == "/api/beenden" and method == "POST":
            request.send_json(200, {"ok": True})
            self.log.info("Beendet über die Steuerseite")
            timer = threading.Timer(0.2, self._on_quit_requested)
            timer.daemon = True
            timer.start()
            return None
        return request.send_json(404, {"fehler": "unbekannt"})

    # --- API endpoints ---

    def _stream_events(self, request, query: dict) -> None:
        """Live connection: state, live data, client list and reload requests."""
        client = EventClient(page=str(query.get("seite", "?"))[:40],
                             from_obs="OBS/" in request.headers.get("User-Agent", ""),
                             version=str(query.get("v", "alt"))[:20])
        if not self.events.add(client):
            return request.send_json(503, {"fehler": "zu viele Verbindungen"})
        label = f"{client.page}{' (OBS)' if client.from_obs else ''}"
        request.send_plain(200, {"Content-Type": "text/event-stream", "Cache-Control": "no-store", "Connection": "keep-alive"},
                           end_headers_only=True)
        try:
            request.wfile.write(b"retry: 1500\n\n")
            if client.version != VERSION:
                request.wfile.write(b"event: neuladen\ndata: {}\n\n")
                self.log.warn(f"{label} läuft mit alter Version {client.version} – wird neu geladen")
            if not client.is_control_page and self._state_text:
                request.wfile.write(f"event: zustand\ndata: {self._state_text.replace(chr(10), ' ')}\n\n".encode())
            request.wfile.flush()
            self.log.info(f"verbunden: {label} · Version {client.version}")
            while not client.closed:
                request.wfile.write(client.next_message().encode())
                request.wfile.flush()
        except OSError:
            pass
        finally:
            self.events.remove(client)
            self.log.info(f"getrennt: {label}")
        request.close_connection = True

    def _api_state(self, request, query: dict) -> None:
        if request.command == "POST":
            if not self._store_state(request.read_body(MAX_STATE_SIZE)):
                return request.send_json(400, {"fehler": "kein Stand"})
            return request.send_json(200, {"ok": True})
        newer_than = int(query.get("nach") or 0) if str(query.get("nach") or "0").isdigit() else 0
        if not self._state_text or self._state_number <= newer_than:
            return request.send_plain(204)
        return request.send_body(200, self._state_text.encode())

    def _api_image(self, request, image_id: str) -> None:
        if request.command == "POST":
            match = IMAGE_DATA_URL.match(request.read_body(MAX_IMAGE_SIZE))
            if not match:
                return request.send_json(400, {"fehler": "kein Bild"})
            for old in self.folders.images.glob(f"{image_id}.*"):
                old.unlink()
            (self.folders.images / f"{image_id}{IMAGE_TYPES[match.group(1)]}").write_bytes(base64.b64decode(match.group(2)))
            return request.send_json(200, {"ok": True})
        image = next(self.folders.images.glob(f"{image_id}.*"), None)
        if not image:
            return request.send_json(404, {"fehler": "nicht gefunden"})
        # images must never run as a page (important for SVG)
        send_file(request, image, CONTENT_TYPES[image.suffix], VERSION,
                  {"Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'"})

    def _api_gsi_cfg_download(self, request, query: dict) -> None:
        """cfg file for an observer PC, pointing at this PC in the network."""
        addresses = lan_addresses()
        address = query.get("ip") if query.get("ip") in addresses else (addresses[0] if addresses else "127.0.0.1")
        body = cs2_setup.cfg_text(f"http://{address}:{LAN_PORT}/api/gsi", self.game_state.settings["token"]).encode()
        request.send_body(200, body, "application/octet-stream",
                          {"Content-Disposition": f'attachment; filename="{cs2_setup.CFG_FILE_NAME}"'})

    def _local_cfg_text(self) -> str:
        return cs2_setup.cfg_text(f"http://127.0.0.1:{PORT}/api/gsi", self.game_state.settings["token"])

    def _api_gsi_cfg_into_folder(self, request) -> None:
        """Put the cfg file into a typed/chosen folder – but only into CS2's cfg folder."""
        folder = Path(str(request.read_json(4000).get("pfad") or ".").strip() or ".").resolve()
        if not cs2_setup.is_cs2_cfg_folder(folder):
            return request.send_json(200, {"ok": False, "fehler": "Das ist nicht der CS2-Ordner. Er endet auf „game\\csgo\\cfg“."})
        try:
            target = folder / cs2_setup.CFG_FILE_NAME
            target.write_text(self._local_cfg_text(), encoding="utf-8")
        except OSError:
            return request.send_json(200, {"ok": False, "fehler": "Ordner nicht gefunden oder kein Schreibzugriff."})
        self.log.info(f"CS2-Datei abgelegt: {target}")
        request.send_json(200, {"ok": True, "datei": str(target)})

    def _api_gsi_set_up(self, request) -> None:
        """Find CS2 automatically and write the cfg file; otherwise save it in the user's folder."""
        found = cs2_setup.find_known_cfg_folder() or next(iter(map(Path, cs2_setup.search_cfg_folders())), None)
        if not found:
            fallback = self.folders.own_files / cs2_setup.CFG_FILE_NAME
            fallback.write_text(self._local_cfg_text(), encoding="utf-8")
            self.log.warn(f"CS2-Ordner nicht gefunden – cfg in {fallback} gespeichert")
            return request.send_json(200, {"ok": False, "datei": str(fallback)})
        target = found / cs2_setup.CFG_FILE_NAME
        target.write_text(self._local_cfg_text(), encoding="utf-8")
        self.log.info(f"CS2-Live-Daten eingerichtet: {found}")
        request.send_json(200, {"ok": True, "datei": str(target)})

    def _api_dach_access(self, request) -> None:
        """DACH CS user ID and key: set, delete, or ask WHETHER they are stored – never return them."""
        store = self.secrets

        def status():
            return {"idGesetzt": store.has(secret_store.DACH_USER_ID), "keyGesetzt": store.has(secret_store.DACH_KEY),
                    "dauerhaft": store.persistent}

        if request.command == "POST":
            data = request.read_json(1000)
            user_id, key = str(data.get("userid") or "").strip(), str(data.get("key") or "").strip()
            if not user_id and not store.has(secret_store.DACH_USER_ID):
                return request.send_json(400, {"fehler": "Bitte die Nutzer-ID eintragen (nur Ziffern, z. B. 123)."})
            if user_id and not secret_store.is_valid(secret_store.DACH_USER_ID, user_id):
                return request.send_json(400, {"fehler": "Die Nutzer-ID besteht nur aus Ziffern (z. B. 123)."})
            if key and not secret_store.is_valid(secret_store.DACH_KEY, key):
                return request.send_json(400, {"fehler": "Das sieht nicht wie ein DACH-CS-Key aus."})
            try:
                if user_id:
                    store.set(secret_store.DACH_USER_ID, user_id)
                if key:
                    store.set(secret_store.DACH_KEY, key)
            except (OSError, ValueError):
                return request.send_json(500, {"fehler": "Speichern fehlgeschlagen"})
            self.log.info("DACH-CS-Zugang gespeichert" + (" (Schlüsselbund)" if store.persistent else " (nur für diese Sitzung)"))
            return request.send_json(200, status())
        if request.command == "DELETE":
            store.delete(secret_store.DACH_USER_ID)
            store.delete(secret_store.DACH_KEY)
            self.log.info("DACH-CS-Zugang gelöscht")
        return request.send_json(200, status())

    def _api_faceit_key(self, request) -> None:
        """FACEIT key: set, delete, or ask WHETHER one is stored – the key itself never leaves the server."""
        store = self.secrets
        if request.command == "POST":
            key = str(request.read_json(1000).get("schluessel") or "").strip()
            if not secret_store.is_valid(secret_store.FACEIT_KEY, key):
                return request.send_json(400, {"fehler": "Das sieht nicht wie ein FACEIT-Schlüssel aus."})
            try:
                store.set(secret_store.FACEIT_KEY, key)
            except (OSError, ValueError):
                return request.send_json(500, {"fehler": "Speichern fehlgeschlagen"})
            self.log.info("FACEIT-Schlüssel gespeichert" + (" (Schlüsselbund)" if store.persistent else " (nur für diese Sitzung)"))
            return request.send_json(200, {"gesetzt": True, "dauerhaft": store.persistent})
        if request.command == "DELETE":
            store.delete(secret_store.FACEIT_KEY)
            self.log.info("FACEIT-Schlüssel gelöscht")
            return request.send_json(200, {"gesetzt": False})
        return request.send_json(200, {"gesetzt": store.has(secret_store.FACEIT_KEY), "dauerhaft": store.persistent})

    def _api_faceit(self, request, resource: str, query: dict) -> None:
        if not faceit.ALLOWED_PATH.match(resource):
            return request.send_json(404, {"fehler": "unbekannt"})
        if faceit.needs_api_key(resource) and not self.secrets.has(secret_store.FACEIT_KEY):
            return request.send_json(401, {"fehler": "kein FACEIT-Schlüssel gespeichert"})
        try:
            status, body = faceit.fetch(resource + faceit.clean_query(query), self.secrets.get(secret_store.FACEIT_KEY))
        except OSError as error:
            self.log.error(f"FACEIT: {error}")
            return request.send_json(502, {"fehler": str(error)})
        self.log.info(f"FACEIT {status} {'/'.join(resource.split('/')[:2])}")
        request.send_body(status, body)

    def _api_overlay_message(self, request) -> None:
        """Messages from the overlays (e.g. inside OBS) go into the log – short and rate-limited."""
        now = time.time()
        self._log_message_times = [t for t in self._log_message_times if now - t < 60]
        if len(self._log_message_times) >= MAX_LOG_MESSAGES_PER_MINUTE:
            return request.send_json(429, {"fehler": "zu viele Meldungen"})
        self._log_message_times.append(now)
        data = request.read_json(4000)
        page = re.sub(r"[^\w ()äöüÄÖÜ-]", "", str(data.get("seite") or "?"))[:40]
        text = re.sub(r"[\r\n]+", " ", str(data.get("text") or ""))[:300]
        if text:
            self.log.write(f"{page}: {text}", "overlay")
        request.send_json(200, {"ok": True})

    def _api_videos(self, request) -> None:
        videos = []
        for video in sorted(self.folders.videos.iterdir()):
            if video.suffix.lower() in (".mp4", ".m4v", ".webm", ".mov"):
                try:
                    videos.append(video_info(video))
                except OSError:
                    videos.append({"name": video.name, "fehler": True})
        request.send_json(200, {"ordner": str(self.folders.videos), "videos": videos})

    def _api_open_folder(self, request, which: str | None) -> None:
        folder = {"videos": self.folders.videos, "schriften": self.folders.fonts, "daten": self.folders.data}.get(which or "")
        if not folder:
            return request.send_json(400, {"fehler": "unbekannt"})
        if self._open_folder:
            self._open_folder(folder)
        elif IS_WINDOWS:
            import os
            os.startfile(folder)                  # noqa: S606 – shows our own folder in Explorer
        request.send_json(200, {"ok": True, "ordner": str(folder)})

    # --- files ---

    def _serve_file(self, request, path: str) -> None:
        """App files, the user's videos (/medien/videos/…) and fonts (/fonts/… – own fonts first)."""
        if request.command not in ("GET", "HEAD"):
            return request.send_plain(405)
        if path == "/":
            return request.send_plain(302, {"Location": "/steuerung.html"})
        relative = path.lstrip("/")
        if re.search(r"(^|/)\.|\\|:|\x00", relative):
            return request.send_json(404, {"fehler": "nicht gefunden"})
        suffix = Path(relative).suffix.lower()
        if suffix not in CONTENT_TYPES:
            return request.send_json(404, {"fehler": "nicht gefunden"})
        if relative.startswith("medien/videos/"):
            full = path_inside(self.folders.videos, relative[len("medien/videos/"):])
        elif relative.startswith("fonts/"):
            own_font = path_inside(self.folders.fonts, relative[len("fonts/"):])
            full = own_font if own_font and own_font.exists() else path_inside(WEB_DIR, relative)
        else:
            full = path_inside(WEB_DIR, relative)
        if not full:
            return request.send_json(404, {"fehler": "nicht gefunden"})
        # pages may only be embedded by our own pages
        extra = {"Content-Security-Policy": "frame-ancestors 'self'"} if suffix == ".html" else {}
        send_file(request, full, CONTENT_TYPES[suffix], VERSION, extra)


class _IPv6Server(ThreadingHTTPServer):
    """Same server on ::1 (some systems resolve "localhost" to IPv6 first)."""

    address_family = socket.AF_INET6

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
        super().server_bind()


class _JsonHandler(BaseHTTPRequestHandler):
    """Request handler with small helpers for answers and bodies."""

    protocol_version = "HTTP/1.1"
    timeout = 60
    extra_headers: dict = {}                      # security headers, set per request by the server
    body_was_read = False

    def send_plain(self, status: int, headers: dict | None = None, *, end_headers_only: bool = False) -> None:
        """Status and headers; without a body unless end_headers_only (the caller writes the body)."""
        self.send_response(status)
        for name, value in {**self.extra_headers, **(headers or {})}.items():
            self.send_header(name, value)
        if not end_headers_only and "Content-Length" not in (headers or {}) and status not in (204, 304):
            self.send_header("Content-Length", "0")
        self.end_headers()

    def send_body(self, status: int, body: bytes, content_type: str = "application/json; charset=utf-8",
                  headers: dict | None = None) -> None:
        self.send_plain(status, {"Content-Type": content_type, "Content-Length": str(len(body)), "Cache-Control": "no-store",
                                 **(headers or {})}, end_headers_only=True)
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_json(self, status: int, data) -> None:
        self.send_body(status, json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def read_body(self, max_size: int) -> str:
        length = int(self.headers.get("Content-Length") or 0)
        if length > max_size:
            raise ValueError("zu groß")
        self.body_was_read = True
        return self.rfile.read(length).decode("utf-8", "replace")

    def read_json(self, max_size: int) -> dict:
        try:
            data = json.loads(self.read_body(max_size) or "{}")
            return data if isinstance(data, dict) else {}
        except ValueError:
            return {}

    def log_message(self, *args):
        pass                                      # requests are not logged (the app log stays readable)
