"""Start of the Auto-Observer: server on 127.0.0.1:8790, director loop, control page in the browser.

    python -m auto_observer [--port 8790] [--no-browser]

A second start only opens the control page of the running one. Close the console window (or Ctrl+C) to quit.
"""

import argparse
import json
import sys
import threading
import urllib.request
import webbrowser

from . import VERSION
from .camera import Camera
from .engine import Engine
from .recorder import Recorder
from .server import make_server
from .settings import Settings

DEFAULT_PORT = 8790
TICK_SECONDS = 0.1


def already_running(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/ping", timeout=1) as answer:
            return json.load(answer).get("service") == "auto-observer"
    except (OSError, ValueError):
        return False


def run_ticks(engine: Engine, stop: threading.Event) -> None:
    while not stop.wait(TICK_SECONDS):
        try:
            engine.tick()
        except Exception as error:                               # one bad tick must never stop the director
            engine.log(f"Fehler in der Regie: {error!r}", "warn")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="auto_observer", description="Auto-Observer für CS2 (Test-App)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--no-browser", action="store_true", help="Steuerseite nicht automatisch öffnen")
    args = parser.parse_args(argv)
    url = f"http://127.0.0.1:{args.port}/"

    if already_running(args.port):
        print(f"Auto-Observer läuft schon – öffne {url}")
        webbrowser.open(url)
        return 0

    settings = Settings()
    engine = None

    def log(text: str, level: str = "info") -> None:
        if engine is not None:
            engine.log(text, level)

    camera = Camera(settings, log)
    engine = Engine(settings, camera, Recorder(settings.folder), args.port)
    engine.echo = lambda line: print(line, flush=True)
    try:
        server = make_server(engine, args.port)
    except OSError as error:
        print(f"Port {args.port} ist belegt ({error}). Mit --port einen anderen wählen.")
        return 1
    camera.start()
    stop = threading.Event()
    threading.Thread(target=run_ticks, args=(engine, stop), name="director", daemon=True).start()

    print(f"Auto-Observer {VERSION}")
    print(f"Steuerseite: {url}")
    print(f"Daten: {settings.folder}")
    print("Zum Beenden dieses Fenster schließen oder Strg+C drücken.\n")
    engine.auto_setup()
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        engine.set_recording(False)
        camera.stop()
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
