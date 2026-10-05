"""Start-up and life cycle of the desktop app.

Start-up
  1. An older Casting-App still running (also 1.x) is asked to quit; a newer one is never replaced.
  2. Single instance: if the app already runs, it is asked to show its window and this start ends.
  3. The server starts (unless the same or a newer version already serves – then the window uses that one).
  4. The window opens with the control page; the tray icon appears.

Quitting
  "Ganz beenden" (dialog or tray), /api/quit (control page or a newer version), the system
  logging off, or – with the window closed – 30 s without any connected overlay.
"""

import os
import shutil
import sys

import shiboken6
from PySide6.QtCore import QObject, QTimer, QUrl, Signal
from PySide6.QtGui import QDesktopServices, QIcon
from PySide6.QtNetwork import QLocalServer, QLocalSocket
from PySide6.QtWidgets import QApplication

from .. import instance, texts
from ..app_log import AppLog
from ..paths import DATA_DIR, IS_WINDOWS, WEB_DIR, create_folders
from .. import password_vault, secret_store
from ..secret_store import SecretStore, system_keyring_or_none
from ..settings import AppSettings
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
WINDOW_STORAGE = DATA_DIR / "app-window"


class ServerRequests(QObject):
    """Requests from background threads (server, update check), delivered to the Qt main thread as signals."""

    quit_requested = Signal()
    open_folder_requested = Signal(str)
    update_found = Signal(dict)
    language_changed = Signal(str)


class DesktopApp(QObject):
    """Connects window, tray and server."""

    def __init__(self, qt_app: QApplication, log: AppLog, server: CastingServer | None, server_requests: ServerRequests,
                 access_key: str = ""):
        """Create window and tray and connect them with the server; `server` is None when another server-only app runs
        (then access_key is that server's key from the keyring)."""
        super().__init__()
        self._qt_app = qt_app
        self._log = log
        self._server = server
        self._quitting = False
        self._reload_request_id = 0
        self._idle_since_ms = 0
        self.single_instance: "SingleInstance | None" = None    # kept alive while the app runs

        icon = QIcon(str(WEB_DIR / "media" / "app-logo-192.png"))
        qt_app.setWindowIcon(icon)
        from .web_page import create_profile        # needs the QApplication
        self._profile = create_profile(WINDOW_STORAGE, self)
        # the access key reaches the control page through the bridge – never in its address or browser storage
        self.window = MainWindow(self._profile, f"{BASE_URL}/control.html", icon, DATA_DIR / "window.json", access_key)
        self.tray = TrayIcon(QIcon(str(WEB_DIR / "media" / "app-logo-32.png")), self)

        self.window.quit_requested.connect(lambda: self.quit("Über das Fenster-Kreuz beendet"))
        self.window.hide_requested.connect(self.hide_window)
        self.window.page.bridge.overlays_reloaded.connect(self._overlays_reloaded_by_page)
        self.window.page.renderProcessTerminated.connect(self._page_crashed)
        self.tray.open_requested.connect(self.show_window)
        self.tray.reload_overlays_requested.connect(self.reload_overlays)
        self.tray.quit_requested.connect(lambda: self.quit("Über das Tray-Menü beendet"))
        server_requests.quit_requested.connect(lambda: self.quit(None))
        server_requests.open_folder_requested.connect(lambda folder: QDesktopServices.openUrl(QUrl.fromLocalFile(folder)))
        server_requests.update_found.connect(self._announce_update)
        server_requests.language_changed.connect(self._change_language)
        self._server_requests = server_requests
        self._update_url = ""
        self.tray.message_clicked.connect(self._open_update_settings)
        qt_app.commitDataRequest.connect(self._system_logs_off)
        qt_app.aboutToQuit.connect(self._shut_down)

        self._auto_quit_timer = QTimer(self)
        self._auto_quit_timer.timeout.connect(self._quit_when_idle)
        self._auto_quit_timer.start(AUTO_QUIT_CHECK_MS)

    def start(self) -> None:
        """Show window and tray; look for a new version in the background if that is switched on."""
        self.window.show()
        if self.tray.available:
            self.tray.show()
        if self._server:
            self._server.updater.on_found = self._server_requests.update_found.emit     # thread → Qt main thread
            if self._server.settings.get("check_for_updates"):
                self._server.updater.check_in_background()

    # --- update check ---

    def _announce_update(self, release: dict) -> None:
        """A newer version exists: tell it in the tray (installing: Setup → ⚙ App-Einstellungen → Update)."""
        self._update_url = release.get("url", "")
        self.tray.tell(texts.text("update.title", app=APP_NAME, version=release["version"]), texts.text("update.text"))

    def _open_update_settings(self) -> None:
        """Click on the tray message: show the window with the update area of the settings."""
        self.show_window()
        self.window.page.send_to_page({"type": "show-update"})

    def _change_language(self, language: str) -> None:
        """The app language was changed on the control page: tray and dialogs follow (the page reloads itself)."""
        texts.set_language(language)
        self.tray.retranslate()

    # --- window ---

    def hide_window(self) -> None:
        """"Nur Fenster schließen": hide the window, overlays keep running."""
        self.window.hide()
        self._log.info("Nur das Fenster geschlossen – Overlays laufen weiter")
        if IS_WINDOWS:
            self.tray.tell_once_that_app_keeps_running()

    def show_window(self) -> None:
        """Tray "Öffnen" or a second start: bring the window back."""
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
        """Answer of the control page to "reload overlays" from the tray."""
        if request_id != self._reload_request_id:
            return
        self._reload_request_id += 1               # answered – no fallback
        if via_obs:
            self.tray.tell(texts.text("reload.title"), texts.text("reload.via_obs"))
        else:
            self._reload_without_obs(self._reload_request_id, force=True)

    def _reload_without_obs(self, request_id: int, force: bool = False) -> None:
        """Fallback without OBS: overlays reload themselves through the live connection."""
        if not force and request_id != self._reload_request_id:
            return
        self._reload_request_id += 1
        count = self._server.reload_overlays() if self._server else 0
        self.tray.tell(texts.text("reload.title"), texts.text("reload.count", count=count) if count else texts.text("reload.none"))

    # --- quitting ---

    def quit(self, reason: str | None) -> None:
        """Quit the app (server, window, tray); `reason` goes to the log."""
        if self._quitting:
            return
        self._quitting = True
        if self.single_instance is not None:
            self.single_instance.close()
        if reason:
            self._log.info(reason)
        self.window.quitting = True
        self.tray.hide()
        self.window.close()
        self._qt_app.quit()

    def _page_crashed(self, status, exit_code: int) -> None:
        """The control page's renderer died (out of memory, GPU driver …): load it again instead of a white window."""
        if self._quitting:
            return
        self._log.error(f"Steuerseite abgestürzt ({status.name}, Code {exit_code}) – wird neu geladen")
        QTimer.singleShot(1000, lambda: not self._quitting and self.window.page.load(QUrl(f"{BASE_URL}/control.html")))

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
        """True if another instance runs and confirmed it shows its window.

        An app that is just quitting may still accept the connection but no longer answers – it does not count,
        otherwise both would end and no app would be left running.
        """
        socket = QLocalSocket()
        socket.connectToServer(INSTANCE_NAME)
        if not socket.waitForConnected(500):
            return False
        socket.write(f"zeigen {VERSION}\n".encode())
        socket.waitForBytesWritten(500)
        answered = socket.waitForReadyRead(1500) and socket.readAll().data().startswith(b"ok")
        socket.disconnectFromServer()
        return answered

    def listen(self) -> None:
        """Become the running instance: later starts connect here."""
        QLocalServer.removeServer(INSTANCE_NAME)      # left over after a crash
        self._server = QLocalServer(self)
        self._server.setSocketOptions(QLocalServer.SocketOption.UserAccessOption)
        self._server.newConnection.connect(self._second_start)
        self._server.listen(INSTANCE_NAME)

    def _second_start(self) -> None:
        """Another start of the app connected: show our window instead."""
        connection = self._server.nextPendingConnection()
        connection.readyRead.connect(lambda: (connection.readAll(), connection.write(b"ok\n"), connection.flush(),
                                              self.show_requested.emit()))
        connection.disconnected.connect(connection.deleteLater)

    def close(self) -> None:
        """Stop answering later starts (first step of quitting – a new start then runs on its own)."""
        if self._server is not None:
            self._server.close()


def take_over_window_settings_from_version_1() -> None:
    """Copy the control page's settings (localStorage of the old Edge window) once."""
    old = DATA_DIR / "fenster" / "Default" / "Local Storage"           # folder name of version 1.x
    new = WINDOW_STORAGE / "Local Storage"
    if new.exists() or not old.exists():
        return
    try:
        shutil.copytree(old, new, ignore=shutil.ignore_patterns("LOCK"))
    except OSError:
        pass


def _secret_backend(data_dir, settings, log: AppLog):
    """System keyring; without one (some Linux systems) optionally a password-protected vault.

    CASTING_APP_VAULT_PASSWORD opens the vault without a dialog (unattended starts, tests).
    """
    if system_keyring_or_none() is not None or not password_vault.is_available():
        return "system"
    vault = password_vault.vault_from_environment(data_dir, log.write)
    if vault:
        return vault
    from .vault_dialog import open_or_offer_vault
    return open_or_offer_vault(data_dir, settings)       # None: secrets for this session only


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
    settings = AppSettings(folders.data)
    texts.set_language(settings.get("app_language"))
    settings.listeners.append(lambda changed: "app_language" in changed
                              and server_requests.language_changed.emit(changed["app_language"]))
    store = SecretStore(folders.data, log.write, keyring_backend=_secret_backend(folders.data, settings, log))
    if running is None:
        server = CastingServer(folders, store, log, on_quit_requested=server_requests.quit_requested.emit,
                               open_folder=lambda folder: server_requests.open_folder_requested.emit(str(folder)),
                               settings=settings)
        log.info(f"{APP_NAME} {VERSION} startet · Daten: {folders.data} · Videos: {folders.videos}")
        server.start()                            # OSError if the port is taken
        access_key = server.access_key
    else:
        log.info(f"{APP_NAME} {running} läuft bereits ohne Fenster – das Fenster nutzt diesen Server")
        access_key = store.get(secret_store.ACCESS_KEY) or ""   # that server keeps its key in the same keyring

    take_over_window_settings_from_version_1()
    desktop = DesktopApp(qt_app, log, server, server_requests, access_key)
    desktop.single_instance = single              # keep it alive as long as the app runs
    single.show_requested.connect(desktop.show_window)
    desktop.start()
    return desktop


def run_desktop(no_gpu: bool = False) -> int:
    """Run the desktop app; returns the exit code."""
    prepare_qt(no_gpu)
    qt_app = QApplication(sys.argv)
    log = AppLog(DATA_DIR / "log.txt", echo_to_console=not IS_WINDOWS)
    log.catch_unhandled_errors()
    try:
        desktop = start_desktop_app(qt_app, log)
    except Exception as error:                    # the windowed build has no console: always say what happened
        log.error(f"Start fehlgeschlagen: {error!r}")
        from PySide6.QtWidgets import QMessageBox
        QMessageBox.critical(None, APP_NAME, texts.text("server_failed" if isinstance(error, OSError) else "start_failed", error=error))
        return 1
    if desktop is None:
        return 0
    return qt_app.exec()
