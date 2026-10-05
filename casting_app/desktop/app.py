"""Start-up and life cycle of the desktop app.

Start-up
  1. An older Casting-App still running (also 1.x) is asked to quit; a newer one is never replaced.
  2. Single instance: if the app already runs, it is asked to show its window and this start ends.
  3. The server starts (unless the same or a newer version already serves – then the window uses that one).
  4. The window opens with the control page; the tray icon appears.

Quitting
  "Ganz beenden" (dialog or tray), /api/beenden (control page or a newer version), the system
  logging off, or – with the window closed – 30 s without any connected overlay.
"""

import os
import shutil
import sys

import shiboken6
from PySide6.QtCore import QObject, QTimer, QUrl, Signal
from PySide6.QtGui import QDesktopServices, QGuiApplication, QIcon
from PySide6.QtNetwork import QLocalServer, QLocalSocket
from PySide6.QtWidgets import QApplication

from .. import instance
from ..app_log import AppLog
from ..paths import DATA_DIR, IS_WINDOWS, WEB_DIR, create_folders
from ..secret_store import SecretStore
from ..server.app_server import BASE_URL, CastingServer
from ..version import APP_NAME, VERSION
from .main_window import MainWindow
from .tray import TrayIcon

# Keep the preview smooth in the background and covered, and allow autoplay (also for the volume control)
CHROMIUM_FLAGS = ["--autoplay-policy=no-user-gesture-required", "--disable-renderer-backgrounding",
                  "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows"]
INSTANCE_NAME = f"casting-app-{os.environ.get('USERNAME') or os.environ.get('USER') or 'user'}"
AUTO_QUIT_AFTER_MS = 30_000
AUTO_QUIT_CHECK_MS = 5_000
RELOAD_FALLBACK_MS = 4_000
WINDOW_STORAGE = DATA_DIR / "app-fenster"


class ServerRequests(QObject):
    """Requests from the server's threads, delivered to the Qt main thread as signals."""

    quit_requested = Signal()
    open_folder_requested = Signal(str)


class DesktopApp(QObject):
    """Connects window, tray and server."""

    def __init__(self, qt_app: QApplication, log: AppLog, server: CastingServer | None, server_requests: ServerRequests):
        super().__init__()
        self._qt_app = qt_app
        self._log = log
        self._server = server
        self._quitting = False
        self._reload_request_id = 0
        self._idle_since_ms = 0

        icon = QIcon(str(WEB_DIR / "medien" / "app-logo-192.png"))
        qt_app.setWindowIcon(icon)
        from .web_page import create_profile        # needs the QApplication
        self._profile = create_profile(WINDOW_STORAGE, self)
        self.window = MainWindow(self._profile, f"{BASE_URL}/steuerung.html", icon, DATA_DIR / "fenster.json")
        self.tray = TrayIcon(QIcon(str(WEB_DIR / "medien" / "app-logo-32.png")), self)

        self.window.quit_requested.connect(lambda: self.quit("Über das Fenster-Kreuz beendet"))
        self.window.hide_requested.connect(self.hide_window)
        self.window.page.bridge.overlays_reloaded.connect(self._overlays_reloaded_by_page)
        self.tray.open_requested.connect(self.show_window)
        self.tray.reload_overlays_requested.connect(self.reload_overlays)
        self.tray.quit_requested.connect(lambda: self.quit("Über das Tray-Menü beendet"))
        server_requests.quit_requested.connect(lambda: self.quit(None))
        server_requests.open_folder_requested.connect(lambda folder: QDesktopServices.openUrl(QUrl.fromLocalFile(folder)))
        qt_app.commitDataRequest.connect(self._system_logs_off)
        qt_app.aboutToQuit.connect(self._shut_down)

        self._auto_quit_timer = QTimer(self)
        self._auto_quit_timer.timeout.connect(self._quit_when_idle)
        self._auto_quit_timer.start(AUTO_QUIT_CHECK_MS)

    def start(self) -> None:
        self.window.show()
        if self.tray.available:
            self.tray.show()

    # --- window ---

    def hide_window(self) -> None:
        """"Nur Fenster schließen": hide the window, overlays keep running."""
        self.window.hide()
        self._log.info("Nur das Fenster geschlossen – Overlays laufen weiter")
        if IS_WINDOWS:
            self.tray.tell_once_that_app_keeps_running()

    def show_window(self) -> None:
        if self.window is not None:
            self.window.bring_to_front()

    # --- overlays ---

    def reload_overlays(self) -> None:
        """Tray: reload the browser sources via OBS (like the button in the app); without OBS via the live connection."""
        self._reload_request_id += 1
        request_id = self._reload_request_id
        self.window.page.send_to_page({"type": "reload-overlays", "requestId": request_id})
        QTimer.singleShot(RELOAD_FALLBACK_MS, lambda: self._reload_without_obs(request_id))

    def _overlays_reloaded_by_page(self, request_id: int, via_obs: bool) -> None:
        if request_id != self._reload_request_id:
            return
        self._reload_request_id += 1               # answered – no fallback
        if via_obs:
            self.tray.tell("Overlays neu laden", "Die Browserquellen in OBS werden neu geladen.")
        else:
            self._reload_without_obs(self._reload_request_id, force=True)

    def _reload_without_obs(self, request_id: int, force: bool = False) -> None:
        if not force and request_id != self._reload_request_id:
            return
        self._reload_request_id += 1
        count = self._server.reload_overlays() if self._server else 0
        self.tray.tell("Overlays neu laden", f"{count} Overlay(s) neu geladen." if count else "Kein Overlay verbunden.")

    # --- quitting ---

    def quit(self, reason: str | None) -> None:
        if self._quitting:
            return
        self._quitting = True
        if reason:
            self._log.info(reason)
        self.window.quitting = True
        self.tray.hide()
        self.window.close()
        self._qt_app.quit()

    def _system_logs_off(self, session_manager) -> None:
        """Windows/Linux log-off or shutdown: save and let the window close without asking."""
        self.window.quitting = True
        if self._server:
            self._server.save_state_now()

    def _shut_down(self) -> None:
        """Stop the server (saves the state) and release the window before its browser profile."""
        if self._server:
            self._server.stop()
            self._log.info(f"{APP_NAME} beendet")
            self._server = None
        if self.window is not None:
            shiboken6.delete(self.window)        # the page must go before the profile it uses
            self.window = None

    def _quit_when_idle(self) -> None:
        """With the window closed: quit after 30 s without any connected page (e.g. OBS closed)."""
        if self.window is None:
            return
        busy = self.window.isVisible() or (self._server and self._server.events.count() > 0)
        if busy:
            self._idle_since_ms = 0
            return
        self._idle_since_ms += AUTO_QUIT_CHECK_MS
        if self._idle_since_ms >= AUTO_QUIT_AFTER_MS:
            self.quit("Weder Fenster noch Overlays offen – beende")


class SingleInstance(QObject):
    """Makes sure only one desktop app runs per user; later starts bring its window to the front."""

    show_requested = Signal()

    def __init__(self):
        super().__init__()
        self._server: QLocalServer | None = None

    def hand_over_to_running_app(self) -> bool:
        """True if another instance runs (it was asked to show its window)."""
        socket = QLocalSocket()
        socket.connectToServer(INSTANCE_NAME)
        if not socket.waitForConnected(500):
            return False
        socket.write(f"zeigen {VERSION}\n".encode())
        socket.waitForBytesWritten(500)
        socket.disconnectFromServer()
        return True

    def listen(self) -> None:
        QLocalServer.removeServer(INSTANCE_NAME)      # left over after a crash
        self._server = QLocalServer(self)
        self._server.setSocketOptions(QLocalServer.SocketOption.UserAccessOption)
        self._server.newConnection.connect(self._second_start)
        self._server.listen(INSTANCE_NAME)

    def _second_start(self) -> None:
        connection = self._server.nextPendingConnection()
        connection.readyRead.connect(lambda: (connection.readAll(), self.show_requested.emit()))
        connection.disconnected.connect(connection.deleteLater)


def take_over_window_settings_from_version_1() -> None:
    """Copy the control page's settings (localStorage of the old Edge window) once."""
    old = DATA_DIR / "fenster" / "Default" / "Local Storage"
    new = WINDOW_STORAGE / "Local Storage"
    if new.exists() or not old.exists():
        return
    try:
        shutil.copytree(old, new, ignore=shutil.ignore_patterns("LOCK"))
    except OSError:
        pass


def prepare_qt(no_gpu: bool = False) -> None:
    """Settings that must be made before the QApplication exists."""
    flags = CHROMIUM_FLAGS + (["--disable-gpu"] if no_gpu else [])
    os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = " ".join(flags + [os.environ.get("QTWEBENGINE_CHROMIUM_FLAGS", "")]).strip()
    QApplication.setApplicationName(APP_NAME)
    QApplication.setApplicationVersion(VERSION)
    QApplication.setDesktopFileName("casting-app")


def start_desktop_app(qt_app: QApplication, log: AppLog) -> DesktopApp | None:
    """Start server, window and tray. None if another instance runs (it shows its window instead)."""
    qt_app.setQuitOnLastWindowClosed(False)
    running = instance.running_version()
    if running and instance.compare_versions(running, VERSION) < 0:
        log.warn(f"Version {running} läuft noch – wird durch {VERSION} ersetzt")
        instance.ask_running_app_to_quit()
        running = None
    single = SingleInstance()
    if single.hand_over_to_running_app():
        return None
    single.listen()

    folders = create_folders()
    server_requests = ServerRequests()
    server = None
    if running is None:
        server = CastingServer(folders, SecretStore(folders.data, log.write), log,
                               on_quit_requested=server_requests.quit_requested.emit,
                               open_folder=lambda folder: server_requests.open_folder_requested.emit(str(folder)))
        log.info(f"{APP_NAME} {VERSION} startet · Daten: {folders.data} · Videos: {folders.videos}")
        server.start()                            # OSError if the port is taken
    else:
        log.info(f"{APP_NAME} {running} läuft bereits ohne Fenster – das Fenster nutzt diesen Server")

    take_over_window_settings_from_version_1()
    desktop = DesktopApp(qt_app, log, server, server_requests)
    desktop.single_instance = single              # keep it alive as long as the app runs
    single.show_requested.connect(desktop.show_window)
    desktop.start()
    return desktop


def run_desktop(no_gpu: bool = False) -> int:
    """Run the desktop app; returns the exit code."""
    prepare_qt(no_gpu)
    qt_app = QApplication(sys.argv)
    log = AppLog(DATA_DIR / "log.txt", echo_to_console=not IS_WINDOWS)
    try:
        desktop = start_desktop_app(qt_app, log)
    except OSError as error:
        from PySide6.QtWidgets import QMessageBox
        QMessageBox.critical(None, APP_NAME, f"Der Server konnte nicht starten:\n{error}\n\nLäuft ein anderes Programm auf Port 8787?")
        return 1
    if desktop is None:
        return 0
    return qt_app.exec()
