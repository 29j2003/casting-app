"""The local HTTP server: control page, overlays and the API behind them.

Security rules (unchanged from version 1.x):
  - only requests from this PC to the app's own address (protects against DNS rebinding)
  - only the app's own pages may use the API; websites from the internet are refused
  - files are served only from web/ and from the user's video and font folders
  - secrets are used inside the server only (see secret_store.py)

Version 2.1 and older used German paths. The few that other programs or old pages still call
are kept as aliases: see LEGACY_PAGES and the last entries of _api_routes().
"""

import base64
import hashlib
import hmac
import ipaddress
import json
import re
import secrets
import socket
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Callable

from .. import legacy, secret_store
from ..files import set_aside, write_atomic
from ..app_log import AppLog
from ..paths import IS_WINDOWS, WEB_DIR, AppFolders
from ..settings import AppSettings
from ..updater import Updater
from ..version import VERSION
from . import cs2_setup, faceit, workshop
from .event_hub import EventClient, EventHub
from .net import ExclusiveHTTPServer, content_length
from .game_state import LAN_PORT, GameStateReceiver, lan_addresses
from .media_converter import MediaConverter, media_token
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
STATE_REVISION = re.compile(r'"revision"\s*:\s*(\d+)')
MAX_LOG_MESSAGES_PER_MINUTE = 30

# Official DACH CS browser sources; OBS loads /dach/<page> and the app redirects with ID and key
DACH_PAGES = {"overview", "singlecast", "duocast", "lineup", "mapveto", "ingame", "positions", "tabelle", "playoffs",
              "last_matches", "current_matches", "next_matches", "last_matches_f1", "last_matches_f2",
              "next_matches_f1", "next_matches_f2", "mvp", "pause", "pause_content", "pause_own_content",
              "singleinteraction", "duointeraction", "solo_interview", "duointerview", "endscreen"}
DACH_MISSING_PAGE = ('<body style="margin:0;background:transparent;font:600 28px Segoe UI,sans-serif;color:#fff;'
                     'display:grid;place-items:center;height:100vh"><div style="background:rgba(0,0,0,.6);padding:24px 32px;'
                     'border-radius:12px">{text}</div></body>')
# shown in OBS instead of the DACH page, in the overlay language of the cast
DACH_MISSING_TEXT = {"de": "DACH-CS-Zugang fehlt – in der Casting-App unter ⚙ App-Einstellungen → Verbindungen & Zugänge eintragen",
                     "en": "DACH CS access missing – enter it in the Casting-App under ⚙ App settings → Connections & access"}
DACH_NO_ACCESS_TEXT = {"de": "Diese Browserquelle braucht den Zugangsschlüssel der App – Casting-App mit OBS verbinden und „Umstellen“ wählen",
                       "en": "This browser source needs the app's access key – connect the Casting-App to OBS and choose “Update”"}

# The access key: only pages that know it (the app window, OBS sources set up by the app) may read or change
# anything beyond what an overlay needs. It travels as ?access=… (page addresses, /dach/…) or as the
# X-Casting-Access header (fetch from the pages, see cast-core.js). Without it a program on this PC gets nothing.
ACCESS_HEADER = "X-Casting-Access"
ACCESS_CODE_SECONDS = 120
OPEN_EXPIRED_TEXT = {"de": "Dieser Link ist abgelaufen oder wurde schon benutzt – in der App erneut auf „Steuerseite im Browser öffnen“ klicken.",
                     "en": "This link has expired or was already used – click “Open control page in browser” in the app again."}
# /api paths an overlay in OBS needs – open without the key (nothing secret, nothing that changes the cast).
# Quitting needs the key (2.12+): otherwise any program on this PC could stop the app and take over its port.
OPEN_API = {("GET", "/api/ping"), ("GET", "/api/events"), ("GET", "/api/ereignisse"), ("GET", "/api/state"),
            ("POST", "/api/report")}
PING_NONCE = re.compile(r"^[A-Za-z0-9_-]{16,64}$")
VIDEO_SUFFIXES = (".mp4", ".m4v", ".webm", ".mov")
FONT_SUFFIXES = (".ttf", ".otf", ".woff", ".woff2")
OVERLAY_LANGUAGE = re.compile(r'"overlayLanguage"\s*:\s*"(de|en)"')


# file names of version 2.1 and older -> new names (OBS browser sources may still use the old ones)
LEGACY_PAGES = {"steuerung.html": "control.html", "ende.html": "end.html", "serie.html": "series.html",
                "spieler.html": "players.html", "sponsoren.html": "sponsors.html"}


# parts of the state that only pages with the access key get (camera links can carry passwords)
PRIVATE_SOURCE_FIELDS = ("url", "device", "deviceName")


def public_host(address: str) -> bool:
    """False for addresses on this PC or in the local network (the app must not be used to reach those)."""
    host = (urllib.parse.urlsplit(address).hostname or "").lower()
    if not host or host == "localhost" or host.endswith(".localhost") or host.endswith(".local"):
        return False
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return True                               # a name: resolved by FFmpeg (names of local machines are rare in links)
    return ip.is_global


class BodyTooLarge(ValueError):
    """A request body over the limit of its route (answered with 413)."""


def ping_proof(access_key: str, nonce: str) -> str:
    """HMAC that shows a server knows the access key (answer of /api/ping?nonce=…)."""
    return hmac.new(access_key.encode(), b"casting-app ping:" + nonce.encode(), "sha256").hexdigest()


def public_state(text: str) -> str:
    """The state without camera links and device names – for overlays that do not have the access key."""
    try:
        state = json.loads(text)
        for source in (state.get("sources") or {}).values():
            if isinstance(source, dict):
                for field in PRIVATE_SOURCE_FIELDS:
                    if field in source:
                        source[field] = ""
        return json.dumps(state, ensure_ascii=False)
    except (ValueError, AttributeError):
        match = STATE_REVISION.search(text)
        return json.dumps({"revision": int(match.group(1)) if match else 0})


class CastingServer:
    """Owns the app state and serves all requests."""

    def __init__(self, folders: AppFolders, secrets: secret_store.SecretStore, log: AppLog,
                 on_quit_requested: Callable[[], None], open_folder: Callable[[Path], None] | None = None,
                 settings: AppSettings | None = None):
        """
        on_quit_requested – called when a page or a newer version asks the app to quit (/api/quit)
        open_folder       – shows a folder in the file manager (desktop app); None = Windows Explorer only
        settings          – app settings (created from the data folder if not given)
        """
        self.folders = folders
        self.secrets = secrets
        self.log = log
        self.events = EventHub()
        self.settings = settings or AppSettings(folders.data)
        self.updater = Updater(folders.data, log.write, quit_app=on_quit_requested)   # Setup → ⚙ → Update
        self.game_state = GameStateReceiver(folders.data, self.events.broadcast, log.write)
        self._on_quit_requested = on_quit_requested
        self._open_folder = open_folder
        self._started_at = int(time.time() * 1000)
        self._servers: list[ExclusiveHTTPServer] = []
        self._log_message_times: list[float] = []
        self._routes = self._api_routes()
        self.access_key = self._load_access_key()
        self.media = MediaConverter(folders.data / "media-cache", log.write)   # H.264 for the app window
        self.media_public_only = True             # /api/media fetches only from the internet (tests switch it off)
        self._access_codes: dict[str, float] = {}    # one-time codes for "open the control page in the browser"

        self._state_file = folders.data / "state.json"
        self._state_lock = threading.Lock()
        self._save_lock = threading.Lock()
        self._state_text: str | None = None      # app state as JSON text (kept as sent by the control page)
        self._state_revision = 0                 # "revision": increases with every change
        self._public_state_text: str | None = None   # the same without camera links (overlays without the key)
        self._save_timer: threading.Timer | None = None
        self._load_state()

    # --- lifecycle ---

    def start(self) -> None:
        """Listen on 127.0.0.1 and ::1. Raises OSError if the port is taken."""
        handler = self._handler_class()
        main_server = ExclusiveHTTPServer(("127.0.0.1", PORT), handler)
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
        if self.game_state.settings.get("network"):
            self.game_state.set_lan_receiver(True)
        self._schedule_image_cleanup(60)

    def stop(self) -> None:
        """Stop listening, then save the state (a change arriving in between would otherwise be lost)."""
        for server in self._servers:
            server.shutdown()
            server.server_close()
        self.media.stop()
        self.game_state.set_lan_receiver(False)
        self.save_state_now()

    def reload_overlays(self) -> int:
        """Make every connected overlay reload itself; returns how many were told."""
        count = self.events.broadcast("reload", "{}", overlays_only=True)
        self.log.info(f"{count} Overlay(s) neu geladen" if count else "Overlays neu laden: keine Overlays verbunden")
        return count

    # --- app state ---

    def _load_state(self) -> None:
        """Read state.json from the last session (the overlays get it on connect)."""
        self._state_text = None
        try:
            text = self._state_file.read_text(encoding="utf-8")
            if not isinstance(json.loads(text), dict):   # a half-written file must not stop the app (it is set aside)
                raise ValueError("kein Zustand")
        except FileNotFoundError:
            return
        except (OSError, ValueError):
            set_aside(self._state_file, self.log.write)
            return
        match = STATE_REVISION.search(text)
        self._state_text, self._state_revision = text, (int(match.group(1)) if match else 0)
        self._public_state_text = public_state(text)

    def _store_state(self, text: str) -> bool:
        """Take a new state from the control page; older states (lower "revision") are ignored."""
        match = STATE_REVISION.search(text)
        if not match:
            return False
        number = int(match.group(1))
        with self._state_lock:
            if number < self._state_revision:
                return False
            self._state_text, self._state_revision = text, number
            self._public_state_text = public_state(text)
            if self._save_timer:
                self._save_timer.cancel()
            self._save_timer = threading.Timer(STATE_SAVE_DELAY, self.save_state_now)
            self._save_timer.daemon = True
            self._save_timer.start()
        self.events.broadcast("state", text.replace("\n", " "), overlays_only=True,
                              public_data=self._public_state_text.replace("\n", " "))
        return True

    def save_state_now(self) -> None:
        """Write the state to state.json immediately (also called when the app quits)."""
        with self._state_lock:
            if self._save_timer:
                self._save_timer.cancel()
                self._save_timer = None
        with self._save_lock:                    # one writer at a time; it reads the newest state inside the lock
            with self._state_lock:
                text = self._state_text
            if text:
                try:
                    write_atomic(self._state_file, text, private=True)   # camera links can carry passwords
                except OSError as error:
                    self.log.error(f"Speichern fehlgeschlagen: {error}")

    def overlay_language(self) -> str:
        """Language of the overlays ("de"/"en"), as chosen on the control page (part of the state)."""
        match = OVERLAY_LANGUAGE.search(self._state_text or "")
        return match.group(1) if match else "de"

    # --- images ---

    def _schedule_image_cleanup(self, delay: float) -> None:
        """Run the image cleanup after `delay` seconds (it then repeats every 6 hours)."""
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
        """Request handler class that hands every request to this server."""
        server = self

        class RequestHandler(_JsonHandler):
            def do_GET(self):
                server.handle(self)

            do_HEAD = do_POST = do_DELETE = do_PUT = do_GET

        return RequestHandler

    def handle(self, request: "_JsonHandler") -> None:
        """Entry point for every HTTP request: route it, never let an error stop the server."""
        request.body_was_read = False
        if content_length(request.headers) is None:    # "-1", "abc" …: refuse before anything reads the body
            request.close_connection = True
            return request.send_plain(400)
        try:
            self._route(request)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except BodyTooLarge:
            request.close_connection = True       # the unread body must not be taken for the next request
            request.send_json(413, {"error": "zu groß"})
        except Exception as error:               # never let one request take the server down
            self.log.error(f"Fehler: {error}")
            try:
                request.send_json(500, {"error": "intern"})
            except OSError:
                pass
        # a body nobody read would be mistaken for the next request on this connection
        if not request.body_was_read and content_length(request.headers):
            request.close_connection = True

    def _route(self, request: "_JsonHandler") -> None:
        """Security checks (this PC, own address, own pages), then the API or a file."""
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
            status, answer = self.game_state.accept(request.read_body(2_000_000), "local")
            return request.send_json(status, answer)

        if path == "/open" and request.command == "GET":
            return self._open_with_code(request, str(query.get("code", "")))

        # the app window asks for H.264 videos as WebM (also from DACH pages: cross-site, so before the check below)
        if path == "/api/media" and request.command in ("GET", "HEAD"):
            return self._api_media(request, query)

        dach_match = re.match(r"^/dach/([a-z0-9_]{2,30})$", path)
        if dach_match and request.command == "GET":
            return self._redirect_to_dach(request, dach_match.group(1), fetch_site, query)

        # 3) everything else: only our own pages, no websites from the internet
        if (fetch_site and fetch_site not in SAME_SITE) or (origin and origin not in ALLOWED_ORIGINS):
            return request.send_plain(403)
        request.extra_headers = {"X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer"}

        if path.startswith("/api/"):
            open_path = (request.command, path) in OPEN_API or (
                request.command == "GET" and re.match(r"^/api/image/[a-z0-9]{4,40}$", path))
            if not open_path and not self.has_access(request, query):
                return request.send_json(403, {"error": "kein Zugang"})
            return self._route_api(request, path, query)
        return self._serve_file(request, path)

    def has_access(self, request, query: dict) -> bool:
        """True if the request carries the access key (header from the pages, or ?access= in an address)."""
        given = request.headers.get(ACCESS_HEADER) or query.get("access") or ""
        return hmac.compare_digest(given.encode(), self.access_key.encode())

    def issue_access_code(self) -> str:
        """A one-time code that opens the control page in a browser (valid for ACCESS_CODE_SECONDS, once)."""
        code = secrets.token_urlsafe(24)
        now = time.time()
        with self._state_lock:
            self._access_codes = {c: t for c, t in self._access_codes.items() if t > now}
            self._access_codes[code] = now + ACCESS_CODE_SECONDS
        return code

    def _open_with_code(self, request, code: str) -> None:
        """/open?code=…: hand the key to this browser tab (sessionStorage) and show the control page.

        The code works once, so the address in the browser history is worthless afterwards.
        """
        with self._state_lock:
            valid_until = self._access_codes.pop(code, 0)
        if valid_until < time.time():
            text = OPEN_EXPIRED_TEXT[self.settings.get("app_language")]
            return request.send_body(403, f'<!doctype html><meta charset="utf-8"><p style="font:18px sans-serif">{text}</p>'.encode(),
                                     "text/html; charset=utf-8")
        page = ('<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><script>'
                f'sessionStorage.setItem("casting-access", {json.dumps(self.access_key)}); location.replace("/control.html");'
                '</script>')
        request.send_body(200, page.encode(), "text/html; charset=utf-8", {"Referrer-Policy": "no-referrer"})

    def _load_access_key(self) -> str:
        """The access key from the keyring (or vault); a new one is created on the first start.

        Without a keyring it lives for this session only – the control page then offers to update the OBS sources.
        """
        key = self.secrets.get(secret_store.ACCESS_KEY)
        if key:
            return key
        key = secrets.token_urlsafe(32)
        if self.secrets.load_failed:                  # never overwrite a stored key we merely could not read
            self.log.warn("Zugangsschlüssel nicht lesbar – ein vorläufiger gilt bis zum Neustart")
            return key
        try:
            self.secrets.set(secret_store.ACCESS_KEY, key)
        except OSError:
            self.log.warn("Zugangsschlüssel konnte nicht gespeichert werden – gilt nur bis zum Beenden")
        return key

    def _api_media(self, request, query: dict) -> None:
        """/api/media?src=…&t=…: a video as WebM for the app window (see media_converter.py).

        Only with the media token (derived from the access key, known to the app window only) and only
        for http(s) addresses – no other program can use the app to fetch things.
        """
        token, source = str(query.get("t", "")), str(query.get("src", ""))
        if not hmac.compare_digest(token.encode(), media_token(self.access_key).encode()):
            return request.send_plain(403)
        if not re.match(r"^https?://", source) or len(source) > 4000 or (self.media_public_only and not public_host(source)):
            return request.send_json(400, {"error": "ungültige Adresse"})
        referer = str(query.get("ref", ""))
        self.media.serve(request, source, referer if re.match(r"^https?://", referer) and len(referer) < 2000 else "")

    def _redirect_to_dach(self, request, page: str, fetch_site: str | None, query: dict) -> None:
        """Forward OBS/the preview to the official DACH CS browser source (ID and key added here only).

        Only with the app's access key: the redirect address contains the DACH ID and key.
        """
        if fetch_site and fetch_site not in SAME_SITE:
            return request.send_plain(403)
        if page not in DACH_PAGES:
            return request.send_json(404, {"error": "unbekannte DACH-CS-Seite"})
        if not self.has_access(request, query):
            page_text = DACH_MISSING_PAGE.replace("{text}", DACH_NO_ACCESS_TEXT[self.overlay_language()])
            return request.send_body(403, page_text.encode(), "text/html; charset=utf-8")
        user_id, key = self.secrets.get(secret_store.DACH_USER_ID), self.secrets.get(secret_store.DACH_KEY)
        if not user_id or not key:
            page_text = DACH_MISSING_PAGE.replace("{text}", DACH_MISSING_TEXT[self.overlay_language()])
            return request.send_body(409, page_text.encode(), "text/html; charset=utf-8")
        target = (f"https://user.dachcs.de/castingoverlay/{page}.php?"
                  + urllib.parse.urlencode({"userid": user_id, "key": key}))
        request.send_plain(302, {"Location": target, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})

    def _api_routes(self) -> dict:
        """The API: path → (allowed HTTP method, or None for any; handler(request, query)).

        A new route is one line here plus its handler below. The security checks in _route() have
        already run for every request that gets this far. Paths with a value inside (/api/image/<id>,
        /api/faceit/<path>) are handled in _route_api() itself.
        """
        return {
            "/api/ping": (None, self._api_ping),
            "/api/events": (None, self._stream_events),
            "/api/state": (None, self._api_state),
            "/api/log": (None, self._api_log),
            "/api/quit": ("POST", self._api_quit),
            # CS2 live data and its setup
            "/api/gsi": (None, self._api_last_game_state),
            "/api/gsi-info": (None, lambda request, query: request.send_json(200, self.game_state.info())),
            "/api/gsi-settings": ("POST", self._api_gsi_settings),
            "/api/gsi-cfg": (None, self._api_gsi_cfg_download),
            "/api/gsi-path": ("POST", lambda request, query: self._api_gsi_cfg_into_folder(request)),
            "/api/gsi-setup": ("POST", lambda request, query: self._api_gsi_set_up(request)),
            "/api/folder-list": (None, lambda request, query: request.send_json(
                200, cs2_setup.list_subfolders(str(query.get("path", "")).strip()))),
            "/api/cs2-search": (None, lambda request, query: request.send_json(200, {"finds": cs2_setup.search_cfg_folders()})),
            # secrets (set, delete, ask whether stored – never read)
            "/api/dach-access": (None, lambda request, query: self._api_dach_access(request)),
            "/api/faceit-key": (None, lambda request, query: self._api_faceit_key(request)),
            "/api/obs-password": (None, lambda request, query: self._api_obs_password(request)),
            "/api/obs-auth": ("POST", lambda request, query: self._api_obs_login(request)),
            "/api/access-code": ("POST", lambda request, query: request.send_json(200, {"code": self.issue_access_code()})),
            # app settings, overlays, user files
            "/api/app-settings": (None, self._api_app_settings),
            "/api/update": (None, lambda request, query: request.send_json(200, self.updater.snapshot())),
            "/api/update-check": ("POST", lambda request, query: (self.updater.check_in_background(),
                                                                   request.send_json(200, self.updater.snapshot()))),
            "/api/update-install": ("POST", lambda request, query: request.send_json(
                200 if self.updater.install_in_background() else 409, self.updater.snapshot())),
            "/api/report": ("POST", lambda request, query: self._api_overlay_message(request)),
            "/api/videos": (None, lambda request, query: self._api_videos(request)),
            "/api/fonts": (None, self._api_fonts),
            "/api/folder": ("POST", lambda request, query: self._api_open_folder(request, query.get("which"))),
            "/api/workshop": (None, self._api_workshop),
            # names of version 2.1 and older, still used by old pages and old versions
            "/api/beenden": ("POST", self._api_quit),
            "/api/ereignisse": (None, lambda request, query: self._reload_legacy_page(request)),
        }

    def _route_api(self, request, path: str, query: dict) -> None:
        """Hand an /api request to its handler (see _api_routes); unknown paths and wrong methods get 404."""
        image_match = re.match(r"^/api/image/([a-z0-9]{4,40})$", path)
        if image_match:
            return self._api_image(request, image_match.group(1))
        if path.startswith("/api/faceit/"):
            return self._api_faceit(request, path[len("/api/faceit/"):], query)
        method, handler = self._routes.get(path, (None, None))
        if handler is None or (method and request.command != method):
            return request.send_json(404, {"error": "unbekannt"})
        return handler(request, query)

    # --- API endpoints ---

    def _api_ping(self, request, query: dict) -> None:
        """Who is running here: newer versions use it to replace older ones (instance.py)."""
        # "dienst" lets version 2.1 and older recognise a newer running app (and leave it alone)
        answer = {"ok": True, "service": "cast", "dienst": "cast", "version": VERSION}
        # proof that this really is the Casting-App (only it knows the access key) – instance.py checks it
        # before it hands a server its window, the key or the camera; ping_proof() must stay in sync
        nonce = str(query.get("nonce", ""))
        if PING_NONCE.match(nonce):
            answer["proof"] = ping_proof(self.access_key, nonce)
        request.send_json(200, answer)

    def _api_quit(self, request, query: dict) -> None:
        """Quit the app (control page or a newer version); answers first, quits 0.2 s later."""
        request.send_json(200, {"ok": True})
        self.log.info("Beendet über die Steuerseite")
        timer = threading.Timer(0.2, self._on_quit_requested)
        timer.daemon = True
        timer.start()

    def _api_log(self, request, query: dict) -> None:
        """Everything the Log tab shows: version, folders, log entries, connected pages, CS2 data age."""
        request.send_json(200, {
            "version": VERSION, "start": self._started_at, "folder": self.folders.as_dict(), "log": self.log.latest(200),
            "clients": [c.describe() for c in self.events.clients()],
            "gsi": int((time.time() - self.game_state.last_time) * 1000) if self.game_state.last_raw else None})

    def _api_last_game_state(self, request, query: dict) -> None:
        """The last post from CS2 as received (for troubleshooting), with its age."""
        if not self.game_state.last_raw:
            return request.send_json(200, {"data": None})
        age = int((time.time() - self.game_state.last_time) * 1000)
        request.send_body(200, f'{{"ageMs":{age},"data":{self.game_state.last_raw}}}'.encode())

    def _api_gsi_settings(self, request, query: dict) -> None:
        """Network receiver on/off, side of team A, team names (POST from the setup page)."""
        self.game_state.apply_settings(request.read_json(4000))
        request.send_json(200, {"ok": True, "network": self.game_state.lan_receiver_running})

    def _api_app_settings(self, request, query: dict) -> None:
        """GET: app settings plus the update status; POST: change settings (settings.py validates)."""
        if request.command == "POST":
            self.settings.update(request.read_json(1000))
        request.send_json(200, {**self.settings.as_dict(), "update": self.updater.snapshot()})

    def _api_fonts(self, request, query: dict) -> None:
        """The user's own font files (Documents/Casting-App/Schriften)."""
        fonts = sorted(f.name for f in self.folders.fonts.iterdir() if f.suffix.lower() in FONT_SUFFIXES)
        request.send_json(200, {"folder": str(self.folders.fonts), "fonts": fonts})

    def _reload_legacy_page(self, request) -> None:
        """A page of version 2.1 or older (still open in OBS) asks for events: tell it to reload once.

        It then loads the new version of itself (old file names are redirected, see LEGACY_PAGES).
        """
        request.send_plain(200, {"Content-Type": "text/event-stream", "Cache-Control": "no-store"}, end_headers_only=True)
        request.wfile.write(b"retry: 1500\n\nevent: neuladen\ndata: {}\n\n")
        request.wfile.flush()
        request.close_connection = True

    def _stream_events(self, request, query: dict) -> None:
        """Live connection: state, live data, client list and reload requests."""
        client = EventClient(page=str(query.get("page", "?"))[:40],
                             from_obs="OBS/" in request.headers.get("User-Agent", ""),
                             version=str(query.get("v", "old"))[:20], trusted=self.has_access(request, query))
        if not self.events.add(client):
            return request.send_json(503, {"error": "zu viele Verbindungen"})
        label = f"{client.page}{' (OBS)' if client.from_obs else ''}"
        request.send_plain(200, {"Content-Type": "text/event-stream", "Cache-Control": "no-store", "Connection": "keep-alive"},
                           end_headers_only=True)
        try:
            request.wfile.write(b"retry: 1500\n\n")
            if client.version != VERSION:
                request.wfile.write(b"event: reload\ndata: {}\n\n")
                self.log.warn(f"{label} läuft mit alter Version {client.version} – wird neu geladen")
            if not client.is_control_page and self._state_text:
                state = self._state_text if client.trusted else (self._public_state_text or "{}")
                request.wfile.write(f"event: state\ndata: {state.replace(chr(10), ' ')}\n\n".encode())
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
        """GET: the state (only if newer than ?after=); POST: a new state from the control page."""
        if request.command == "POST":
            text = request.read_body(MAX_STATE_SIZE)
            if not STATE_REVISION.search(text):
                return request.send_json(400, {"error": "keine Revision"})
            if not self._store_state(text):
                # older than what the server has (e.g. the PC clock went back): the page continues above it
                return request.send_json(409, {"error": "veraltet", "revision": self._state_revision})
            return request.send_json(200, {"ok": True})
        newer_than = int(query["after"]) if str(query.get("after", "")).isdigit() else 0
        if not self._state_text or self._state_revision <= newer_than:
            return request.send_plain(204)
        full = self.has_access(request, query)
        return request.send_body(200, (self._state_text if full else self._public_state_text or "{}").encode())

    def _api_image(self, request, image_id: str) -> None:
        """GET: an uploaded image; POST: store an image sent as data URL."""
        if request.command == "POST":
            match = IMAGE_DATA_URL.match(request.read_body(MAX_IMAGE_SIZE))
            if not match:
                return request.send_json(400, {"error": "kein Bild"})
            try:
                data = base64.b64decode(match.group(2), validate=True)
            except ValueError:
                return request.send_json(400, {"error": "kein Bild"})
            target = self.folders.images / f"{image_id}{IMAGE_TYPES[match.group(1)]}"
            write_atomic(target, data)                 # the old image stays until the new one is complete
            for old in self.folders.images.glob(f"{image_id}.*"):
                if old != target:
                    old.unlink(missing_ok=True)
            return request.send_json(200, {"ok": True})
        image = next(self.folders.images.glob(f"{image_id}.*"), None)
        if not image:
            return request.send_json(404, {"error": "nicht gefunden"})
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
        """cfg file content for CS2 on this PC."""
        return cs2_setup.cfg_text(f"http://127.0.0.1:{PORT}/api/gsi", self.game_state.settings["token"])

    def _api_gsi_cfg_into_folder(self, request) -> None:
        """Put the cfg file into a typed/chosen folder – but only into CS2's cfg folder."""
        raw = str(request.read_json(4000).get("path") or ".").strip() or "."
        if cs2_setup.network_path(raw):
            return request.send_json(200, {"ok": False, "error": "Netzwerkpfade werden nicht unterstützt."})
        folder = Path(raw).resolve()
        if not cs2_setup.is_cs2_cfg_folder(folder):
            return request.send_json(200, {"ok": False, "error": "Das ist nicht der CS2-Ordner. Er endet auf „game\\csgo\\cfg“."})
        try:
            target = folder / cs2_setup.CFG_FILE_NAME
            target.write_text(self._local_cfg_text(), encoding="utf-8")
        except OSError:
            return request.send_json(200, {"ok": False, "error": "Ordner nicht gefunden oder kein Schreibzugriff."})
        self.log.info(f"CS2-Datei abgelegt: {target}")
        request.send_json(200, {"ok": True, "file": str(target)})

    def _api_gsi_set_up(self, request) -> None:
        """Find CS2 automatically and write the cfg file; otherwise save it in the user's folder."""
        found = cs2_setup.find_known_cfg_folder() or next(iter(map(Path, cs2_setup.search_cfg_folders())), None)
        if not found:
            fallback = self.folders.own_files / cs2_setup.CFG_FILE_NAME
            fallback.write_text(self._local_cfg_text(), encoding="utf-8")
            self.log.warn(f"CS2-Ordner nicht gefunden – cfg in {fallback} gespeichert")
            return request.send_json(200, {"ok": False, "file": str(fallback)})
        target = found / cs2_setup.CFG_FILE_NAME
        target.write_text(self._local_cfg_text(), encoding="utf-8")
        self.log.info(f"CS2-Live-Daten eingerichtet: {found}")
        request.send_json(200, {"ok": True, "file": str(target)})

    def _api_dach_access(self, request) -> None:
        """DACH CS user ID and key: set, delete, or ask WHETHER they are stored – never return them."""
        store = self.secrets

        def status():
            return {"idSet": store.has(secret_store.DACH_USER_ID), "keySet": store.has(secret_store.DACH_KEY),
                    "persistent": store.persistent}

        if request.command == "POST":
            data = request.read_json(1000)
            user_id, key = str(data.get("userid") or "").strip(), str(data.get("key") or "").strip()
            if not user_id and not store.has(secret_store.DACH_USER_ID):
                return request.send_json(400, {"error": "Bitte die Nutzer-ID eintragen (nur Ziffern, z. B. 123)."})
            if user_id and not secret_store.is_valid(secret_store.DACH_USER_ID, user_id):
                return request.send_json(400, {"error": "Die Nutzer-ID besteht nur aus Ziffern (z. B. 123)."})
            if key and not secret_store.is_valid(secret_store.DACH_KEY, key):
                return request.send_json(400, {"error": "Das sieht nicht wie ein DACH-CS-Key aus."})
            try:
                if user_id:
                    store.set(secret_store.DACH_USER_ID, user_id)
                if key:
                    store.set(secret_store.DACH_KEY, key)
            except (OSError, ValueError):
                return request.send_json(500, {"error": "Speichern fehlgeschlagen"})
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
            key = str(request.read_json(1000).get("key") or "").strip()
            if not secret_store.is_valid(secret_store.FACEIT_KEY, key):
                return request.send_json(400, {"error": "Das sieht nicht wie ein FACEIT-Schlüssel aus."})
            try:
                store.set(secret_store.FACEIT_KEY, key)
            except (OSError, ValueError):
                return request.send_json(500, {"error": "Speichern fehlgeschlagen"})
            self.log.info("FACEIT-Schlüssel gespeichert" + (" (Schlüsselbund)" if store.persistent else " (nur für diese Sitzung)"))
            return request.send_json(200, {"isSet": True, "persistent": store.persistent})
        if request.command == "DELETE":
            store.delete(secret_store.FACEIT_KEY)
            self.log.info("FACEIT-Schlüssel gelöscht")
            return request.send_json(200, {"isSet": False})
        return request.send_json(200, {"isSet": store.has(secret_store.FACEIT_KEY), "persistent": store.persistent})

    def _api_obs_password(self, request) -> None:
        """OBS WebSocket password: set, delete, or ask WHETHER one is stored – it is never returned."""
        store = self.secrets
        if request.command == "POST":
            password = str(request.read_json(1000).get("password") or "")
            if not secret_store.is_valid(secret_store.OBS_PASSWORD, password):
                return request.send_json(400, {"error": "Ungültiges Passwort"})
            try:
                store.set(secret_store.OBS_PASSWORD, password)
            except (OSError, ValueError):
                return request.send_json(500, {"error": "Speichern fehlgeschlagen"})
            self.log.info("OBS-Passwort gespeichert" + (" (Schlüsselbund)" if store.persistent else " (nur für diese Sitzung)"))
        elif request.command == "DELETE":
            store.delete(secret_store.OBS_PASSWORD)
            self.log.info("OBS-Passwort gelöscht")
        return request.send_json(200, {"isSet": store.has(secret_store.OBS_PASSWORD), "persistent": store.persistent})

    def _api_obs_login(self, request) -> None:
        """Answer OBS's login challenge (obs-websocket 5) so the password itself never leaves the server.

        Only for the control page: a browser always sends Origin and Sec-Fetch-Site with this POST, a plain
        program on this PC (curl, scripts) usually does not – it gets no answer that would let it into OBS.
        """
        if (request.headers.get("Origin") not in ALLOWED_ORIGINS
                or request.headers.get("Sec-Fetch-Site") != "same-origin"):
            return request.send_plain(403)
        password = self.secrets.get(secret_store.OBS_PASSWORD)
        if not password:
            return request.send_json(404, {"error": "kein OBS-Passwort gespeichert"})
        data = request.read_json(1000)
        salt, challenge = str(data.get("salt") or ""), str(data.get("challenge") or "")
        if not salt or not challenge or len(salt) > 200 or len(challenge) > 200:
            return request.send_json(400, {"error": "salt und challenge fehlen"})
        secret = base64.b64encode(hashlib.sha256((password + salt).encode()).digest()).decode()
        answer = base64.b64encode(hashlib.sha256((secret + challenge).encode()).digest()).decode()
        request.send_json(200, {"authentication": answer})

    def _api_workshop(self, request, query: dict) -> None:
        """A custom map from the Steam Workshop: ?id=<link or number> → {id, title, image (data URL)}."""
        try:
            found = workshop.lookup(str(query.get("id", "")))
        except workshop.WorkshopError as error:
            return request.send_json(400, {"error": str(error)})
        except (OSError, ValueError) as error:
            self.log.warn(f"Steam Workshop nicht erreichbar: {error}")
            return request.send_json(502, {"error": "Steam ist gerade nicht erreichbar – Name und Bild von Hand eintragen."})
        self.log.info(f"Workshop-Map übernommen: {found['title']}")
        return request.send_json(200, found)

    def _api_faceit(self, request, resource: str, query: dict) -> None:
        """Forward an allowed FACEIT request; the API key is added here and never leaves the server."""
        if not faceit.ALLOWED_PATH.match(resource):
            return request.send_json(404, {"error": "unbekannt"})
        if faceit.needs_api_key(resource) and not self.secrets.has(secret_store.FACEIT_KEY):
            return request.send_json(401, {"error": "kein FACEIT-Schlüssel gespeichert"})
        try:
            status, body = faceit.fetch(resource + faceit.clean_query(query), self.secrets.get(secret_store.FACEIT_KEY))
        except OSError as error:
            self.log.error(f"FACEIT: {error}")
            return request.send_json(502, {"error": str(error)})
        self.log.info(f"FACEIT {status} {'/'.join(resource.split('/')[:2])}")
        request.send_body(status, body)

    def _api_overlay_message(self, request) -> None:
        """Messages from the overlays (e.g. inside OBS) go into the log – short and rate-limited."""
        now = time.time()
        self._log_message_times = [t for t in self._log_message_times if now - t < 60]
        if len(self._log_message_times) >= MAX_LOG_MESSAGES_PER_MINUTE:
            return request.send_json(429, {"error": "zu viele Meldungen"})
        self._log_message_times.append(now)
        data = request.read_json(4000)
        page = re.sub(r"[^\w ()äöüÄÖÜ-]", "", str(data.get("page") or "?"))[:40]
        text = re.sub(r"[\r\n]+", " ", str(data.get("text") or ""))[:300]
        if text:
            self.log.write(f"{page}: {text}", "overlay")
        request.send_json(200, {"ok": True})

    def _api_videos(self, request) -> None:
        """The user's background videos with codec, size and resolution."""
        videos = []
        for video in sorted(self.folders.videos.iterdir()):
            if video.suffix.lower() in VIDEO_SUFFIXES:
                try:
                    videos.append(video_info(video))
                except OSError:
                    videos.append({"name": video.name, "error": True})
        request.send_json(200, {"folder": str(self.folders.videos), "videos": videos})

    def _api_open_folder(self, request, which: str | None) -> None:
        """Show the videos, fonts or data folder in the file manager."""
        folder = {"videos": self.folders.videos, "fonts": self.folders.fonts, "data": self.folders.data}.get(which or "")
        if not folder:
            return request.send_json(400, {"error": "unbekannt"})
        opened = True
        if self._open_folder:
            self._open_folder(folder)
        elif IS_WINDOWS:
            import os
            os.startfile(folder)                  # noqa: S606 – shows our own folder in Explorer
        else:                                     # server without window: the page shows the path instead
            opened = False
        request.send_json(200, {"ok": opened, "folder": str(folder)})

    # --- files ---

    def _serve_file(self, request, path: str) -> None:
        """App files, the user's videos (/media/videos/…) and fonts (/fonts/… – own fonts first)."""
        if request.command not in ("GET", "HEAD"):
            return request.send_plain(405)
        if path == "/":
            return request.send_plain(302, {"Location": "/control.html"})
        relative = path.lstrip("/")
        # pages and files of version 2.1 and older (browser sources in OBS keep their address)
        legacy_name = LEGACY_PAGES.get(relative) or (legacy.migrate_text(relative) if relative.startswith(legacy.OLD_MEDIA_FOLDER) else None)
        if legacy_name:
            query = urllib.parse.urlsplit(request.path).query
            return request.send_plain(301, {"Location": "/" + legacy_name + ("?" + query if query else "")})
        if re.search(r"(^|/)\.|\\|:|\x00", relative):
            return request.send_json(404, {"error": "nicht gefunden"})
        if relative == "control.js":
            return request.send_body(200, control_script(), CONTENT_TYPES[".js"])
        suffix = Path(relative).suffix.lower()
        if suffix not in CONTENT_TYPES:
            return request.send_json(404, {"error": "nicht gefunden"})
        # the user's folders hold files from anywhere (downloaded packs): only videos and fonts from there –
        # an .html or .svg in them would otherwise run as one of our own pages
        if relative.startswith("media/videos/"):
            if suffix not in VIDEO_SUFFIXES:
                return request.send_json(404, {"error": "nicht gefunden"})
            full = path_inside(self.folders.videos, relative[len("media/videos/"):])
        elif relative.startswith("fonts/"):
            if suffix not in FONT_SUFFIXES:
                return request.send_json(404, {"error": "nicht gefunden"})
            own_font = path_inside(self.folders.fonts, relative[len("fonts/"):])
            full = own_font if own_font and own_font.exists() else path_inside(WEB_DIR, relative)
        else:
            full = path_inside(WEB_DIR, relative)
        if not full:
            return request.send_json(404, {"error": "nicht gefunden"})
        # pages may only be embedded by our own pages
        extra = {"Content-Security-Policy": "frame-ancestors 'self'"} if suffix == ".html" else {}
        send_file(request, full, CONTENT_TYPES[suffix], VERSION, extra)


def control_script() -> bytes:
    """The control page's logic: web/control/*.js joined in file-name order into one script.

    Humans edit the numbered files; the browser gets one script, so a function may be used before the file that
    declares it (as if it were one big file). A marker line in front of each part shows where it came from.
    """
    parts = []
    for file in sorted((WEB_DIR / "control").glob("*.js")):
        parts.append(f"\n// ===== control/{file.name} =====\n" + file.read_text(encoding="utf-8"))
    return "".join(parts).encode("utf-8")


class _IPv6Server(ExclusiveHTTPServer):
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
        """Status, headers and body (JSON by default)."""
        self.send_plain(status, {"Content-Type": content_type, "Content-Length": str(len(body)), "Cache-Control": "no-store",
                                 **(headers or {})}, end_headers_only=True)
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_json(self, status: int, data) -> None:
        """Answer with `data` as JSON."""
        self.send_body(status, json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def read_body(self, max_size: int) -> str:
        """The request body as text; raises ValueError if it is larger than `max_size`."""
        length = content_length(self.headers) or 0
        if length > max_size:
            raise BodyTooLarge("zu groß")
        self.body_was_read = True
        return self.rfile.read(length).decode("utf-8", "replace")

    def read_json(self, max_size: int) -> dict:
        """The request body as a dict ({} if it is missing or not a JSON object)."""
        try:
            data = json.loads(self.read_body(max_size) or "{}")
            return data if isinstance(data, dict) else {}
        except BodyTooLarge:
            raise
        except ValueError:
            return {}

    def log_message(self, *args):
        pass                                      # requests are not logged (the app log stays readable)
