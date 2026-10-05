"""Start the Casting-App.

    python -m casting_app                 desktop app (window, tray, server)
    python -m casting_app --no-window     server only, for OBS overlays (alias: --ohne-fenster)
    python -m casting_app --no-gpu        desktop app without graphics acceleration (alias: --ohne-gpu)

Without a system keyring, the server-only mode opens the password vault with CASTING_APP_VAULT_PASSWORD.
"""

import argparse
import signal
import sys
import threading

from . import instance, password_vault, update_check
from .app_log import AppLog
from .paths import DATA_DIR, create_folders
from .secret_store import SecretStore, system_keyring_or_none
from .server.app_server import BASE_URL, CastingServer
from .version import APP_NAME, VERSION


def parse_arguments(arguments: list[str] | None = None) -> argparse.Namespace:
    """Command line options (English names, German aliases from version 1.x)."""
    parser = argparse.ArgumentParser(prog=APP_NAME, description="Steuerung und Overlays für CS2-Casts in OBS")
    parser.add_argument("--no-window", "--ohne-fenster", dest="no_window", action="store_true",
                        help="nur den Server für die Overlays starten (kein Fenster, kein Tray)")
    parser.add_argument("--no-gpu", "--ohne-gpu", dest="no_gpu", action="store_true",
                        help="Grafikbeschleunigung aus (nur bei Problemen mit dem Grafiktreiber)")
    parser.add_argument("--version", action="version", version=f"{APP_NAME} {VERSION}")
    known, _ = parser.parse_known_args(arguments)       # Qt/Chromium options are passed through
    return known


def run_server_only() -> int:
    """Server without window: runs until Ctrl+C or until a page/newer version asks it to quit."""
    log = AppLog(DATA_DIR / "log.txt", echo_to_console=True)
    running = instance.running_version()
    if running and instance.compare_versions(running, VERSION) >= 0:
        print(f"{APP_NAME} {running} läuft bereits: {BASE_URL}")
        return 0
    if running:
        log.warn(f"Version {running} läuft noch – wird durch {VERSION} ersetzt")
        instance.ask_running_app_to_quit()

    quit_event = threading.Event()
    folders = create_folders()
    server = CastingServer(folders, SecretStore(folders.data, log.write, keyring_backend=_secret_backend(folders.data, log)),
                           log, on_quit_requested=quit_event.set)
    log.info(f"{APP_NAME} {VERSION} startet · Daten: {folders.data} · Videos: {folders.videos}")
    try:
        server.start()
    except OSError as error:
        print(f"Port belegt: {error}", file=sys.stderr)
        return 1
    print(f"{APP_NAME} {VERSION} läuft ohne Fenster: {BASE_URL} · Overlays: {BASE_URL}/overlay.html", flush=True)
    if server.settings.get("check_for_updates"):
        threading.Thread(target=_note_update, args=(server, log), name="update-check", daemon=True).start()
    signal.signal(signal.SIGTERM, lambda *_: quit_event.set())
    try:
        while not quit_event.wait(0.5):
            pass
    except KeyboardInterrupt:
        pass
    server.stop()
    log.info(f"{APP_NAME} beendet")
    return 0


def _secret_backend(data_dir, log: AppLog):
    """System keyring; without one, a password vault opened with CASTING_APP_VAULT_PASSWORD (if set)."""
    if system_keyring_or_none() is not None:
        return "system"
    return password_vault.vault_from_environment(data_dir, log.write) or "system"


def _note_update(server: CastingServer, log: AppLog) -> None:
    """Server without window: a newer version is only noted in the log and the settings dialog."""
    release = update_check.newer_release()
    if release:
        server.available_update = release
        log.info(f"Neue Version {release['version']} verfügbar: {release['url']}")


def main(arguments: list[str] | None = None) -> int:
    """Entry point of `python -m casting_app` and of the built app; returns the exit code."""
    if sys.stdout:                               # a windowed build on Windows has no console at all
        sys.stdout.reconfigure(errors="replace")
    options = parse_arguments(arguments)
    if options.no_window:
        return run_server_only()
    from .desktop.app import run_desktop                 # Qt is only loaded for the desktop app
    return run_desktop(no_gpu=options.no_gpu)


if __name__ == "__main__":
    sys.exit(main())
