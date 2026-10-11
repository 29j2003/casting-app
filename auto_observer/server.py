"""HTTP server of the Auto-Observer (only 127.0.0.1): control page, its API and the GSI receiver.

Safety: only Host 127.0.0.1/localhost with our port (no DNS rebinding); every POST to /api needs the header
X-Auto-Observer (a foreign web page cannot send it without a CORS preflight, which is never allowed);
/gsi needs the token from the cfg file.
"""

import json
import os
import subprocess
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .engine import Engine

WEB_FOLDER = Path(__file__).resolve().parent / "web"
PAGES = {"/": ("index.html", "text/html; charset=utf-8"), "/app.js": ("app.js", "text/javascript; charset=utf-8"),
         "/app.css": ("app.css", "text/css; charset=utf-8")}
MAX_BODY = 4 * 1024 * 1024        # GSI posts with ten players and grenades stay far below this


def open_folder(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    if sys.platform == "win32":
        os.startfile(path)                                     # noqa: S606 – our own data folder
    else:
        subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", str(path)],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def make_handler(engine: Engine, port: int, demos=None):
    allowed_hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}

    class Handler(BaseHTTPRequestHandler):
        server_version = "Auto-Observer"

        def log_message(self, *args):                            # no request log in the console
            pass

        def _answer(self, status: int, body: bytes = b"", content_type: str = "application/json") -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            if content_type.startswith("text/html"):
                self.send_header("Content-Security-Policy",
                                 "default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(body)

        def _json(self, status: int, data) -> None:
            self._answer(status, json.dumps(data, ensure_ascii=False).encode("utf-8"))

        def _host_ok(self) -> bool:
            return self.headers.get("Host", "") in allowed_hosts

        def _body(self):
            try:
                length = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                return None
            if not 0 < length <= MAX_BODY:
                return None
            try:
                return json.loads(self.rfile.read(length))
            except (ValueError, UnicodeDecodeError):
                return None

        def do_GET(self):
            if not self._host_ok():
                return self._answer(403)
            path = self.path.split("?", 1)[0]
            if path == "/api/state":
                state = engine.state()
                if demos is not None:
                    state["demo"] = demos.state()
                return self._json(200, state)
            if path == "/favicon.ico":
                return self._answer(204)
            if path == "/api/ping":
                return self._json(200, {"service": "auto-observer"})
            if path in PAGES:
                name, content_type = PAGES[path]
                try:
                    return self._answer(200, (WEB_FOLDER / name).read_bytes(), content_type)
                except OSError:
                    return self._answer(500)
            return self._answer(404)

        def do_POST(self):
            try:
                self._post()
            except Exception as error:                       # answer instead of leaving the page waiting
                engine.log(f"Fehler bei {self.path}: {error!r}", "warn")
                try:
                    self._json(500, {"ok": False, "message": f"Interner Fehler: {error}"})
                except OSError:
                    pass

        def _post(self):
            if not self._host_ok():
                return self._answer(403)
            path = self.path.split("?", 1)[0]
            if path == "/gsi":
                return self._answer(engine.on_gsi(self._body()))
            if not path.startswith("/api/") or self.headers.get("X-Auto-Observer") != "1":
                return self._answer(403)
            if path == "/api/demo/upload" and demos is not None:
                query = urllib.parse.parse_qs(self.path.partition("?")[2])
                try:
                    length = int(self.headers.get("Content-Length") or 0)
                    saved = demos.upload(query.get("name", ["demo.dem"])[0], self.rfile, length)
                except (ValueError, OSError) as error:
                    self.close_connection = True
                    return self._json(400, {"ok": False, "message": str(error)})
                return self._json(200, {"ok": True, "file": saved.name})
            body = self._body()
            body = body if isinstance(body, dict) else {}
            if path == "/api/settings":
                return self._json(200, {"changed": engine.apply_settings(body)})
            if path == "/api/show":
                ok, message = engine.show(str(body.get("steamid") or ""))
                return self._json(200 if ok else 409, {"ok": ok, "message": message})
            if path == "/api/resume":
                engine.resume()
                return self._json(200, {"ok": True})
            if path == "/api/cfg/find":
                return self._json(200, {"folders": engine.find_cfg()})
            if path == "/api/cfg/write":
                ok, message = engine.write_cfg(str(body.get("folder") or ""))
                return self._json(200 if ok else 400, {"ok": ok, "message": message})
            if path == "/api/launch":
                ok, message = engine.launch_cs2()
                return self._json(200 if ok else 409, {"ok": ok, "message": message})
            if path == "/api/setup":
                engine.auto_setup()
                return self._json(200, {"ok": True})
            if path == "/api/record":
                engine.set_recording(bool(body.get("on")))
                return self._json(200, {"ok": True})
            if path == "/api/open-recordings":
                try:
                    open_folder(engine.recorder.folder)
                except OSError as error:
                    return self._json(500, {"ok": False, "message": str(error)})
                return self._json(200, {"ok": True})
            if path.startswith("/api/demo/") and demos is not None:
                return self._demo(path, body)
            return self._answer(404)

        def _demo(self, path: str, body: dict):
            if path == "/api/demo/choose":
                return self._json(200, {"ok": True, "added": demos.choose()})
            if path == "/api/demo/open":
                open_folder(demos.folder)
                return self._json(200, {"ok": True})
            if path == "/api/demo/faceit":
                if isinstance(body.get("key"), str) and body["key"].strip():
                    demos.faceit_key = body["key"].strip()[:200]
                ok, message = demos.faceit(str(body.get("link") or ""))
                return self._json(200 if ok else 409, {"ok": ok, "message": message})
            try:
                if path == "/api/demo/round":
                    number = body.get("round")
                    if not isinstance(number, int) or isinstance(number, bool):
                        raise ValueError("Rundennummer fehlt")
                    return self._json(200, {"ok": True, "text": demos.round_text(str(body.get("file") or ""), number)})
                if path == "/api/demo/evaluate":
                    return self._json(200, {"ok": True, "text": demos.evaluate(str(body.get("file") or ""))})
            except (ValueError, OSError) as error:
                return self._json(400, {"ok": False, "message": str(error)})
            return self._answer(404)

    return Handler


class Server(ThreadingHTTPServer):
    daemon_threads = True
    # on Windows SO_REUSEADDR would let a second instance bind the same port without an error
    allow_reuse_address = sys.platform != "win32"


def make_server(engine: Engine, port: int, demos=None) -> ThreadingHTTPServer:
    return Server(("127.0.0.1", port), make_handler(engine, port, demos))
