"""The app window: shows the control page and asks before closing.

Clicking X does not close anything right away. The control page shows its own dialog
("Ganz beenden" · "Nur Fenster schließen" · "Abbrechen") while the window stays open.
If the page does not confirm within a second (still loading, stuck or unreachable),
a system dialog with the same choice appears instead.
"""

import json
from pathlib import Path

from PySide6.QtCore import QByteArray, QTimer, QUrl, Signal
from PySide6.QtGui import QCloseEvent, QIcon
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QMainWindow, QMessageBox

from ..files import write_atomic
from ..texts import text
from ..version import APP_NAME
from . import media
from .audio import AppWindowAudio
from .web_page import AppWebPage

PAGE_CONFIRM_TIMEOUT_MS = 1000


class MainWindow(QMainWindow):
    """Window with the control page."""

    quit_requested = Signal()          # "Ganz beenden"
    hide_requested = Signal()          # "Nur Fenster schließen"

    def __init__(self, profile, url: str, icon: QIcon, geometry_file: Path, access_key: str = ""):
        """Window with the control page at `url`; size and position are kept in `geometry_file`;
        access_key goes to the page through the bridge (see AppWebPage)."""
        super().__init__()
        self.setWindowTitle(APP_NAME)
        self.setWindowIcon(icon)
        self.setMinimumSize(900, 560)
        self.quitting = False          # set while the app quits: closing is allowed then
        self._geometry_file = geometry_file
        self._restore_geometry()

        self.page = AppWebPage(profile, self, access_key)
        self.view = QWebEngineView(self)
        self.view.setPage(self.page)
        self.setCentralWidget(self.view)
        self.audio = AppWindowAudio(self.page)
        self._media_redirect = media.install(profile, self.page, access_key)     # H.264 videos play as WebM

        self.page.bridge.close_dialog_shown.connect(self._page_shows_close_dialog)
        self.page.bridge.close_answered.connect(self.handle_close_choice)
        self.page.bridge.audio_changed.connect(self.audio.set)
        self._close_request_id = 0
        self._close_request_confirmed = False
        self._system_dialog_open = False
        self.page.load(QUrl(url))

    # --- closing ---

    def closeEvent(self, event: QCloseEvent) -> None:
        """Clicking X never closes directly: the control page shows its own close question."""
        if self.quitting:
            self._save_geometry()
            event.accept()
            return
        event.ignore()                 # keep the window; ask first
        self.ask_how_to_close()

    def ask_how_to_close(self) -> None:
        """Let the control page show its close dialog; fall back to a system dialog."""
        if self._system_dialog_open:
            return
        self._close_request_id += 1
        self._close_request_confirmed = False
        request_id = self._close_request_id
        self.page.send_to_page({"type": "ask-close", "requestId": request_id})
        QTimer.singleShot(PAGE_CONFIRM_TIMEOUT_MS, lambda: self._fall_back_to_system_dialog(request_id))

    def _page_shows_close_dialog(self, request_id: int) -> None:
        """The page confirmed that its dialog is open – no system dialog needed."""
        if request_id == self._close_request_id:
            self._close_request_confirmed = True

    def _fall_back_to_system_dialog(self, request_id: int) -> None:
        """The page did not answer in time (e.g. still loading): ask with a system dialog."""
        if request_id != self._close_request_id or self._close_request_confirmed or not self.isVisible():
            return
        self._system_dialog_open = True
        title = text("close.title", app=APP_NAME)
        box = QMessageBox(QMessageBox.Icon.Question, title, title, parent=self)
        box.setInformativeText(text("close.text"))
        quit_button = box.addButton(text("close.quit"), QMessageBox.ButtonRole.DestructiveRole)
        hide_button = box.addButton(text("close.hide"), QMessageBox.ButtonRole.AcceptRole)
        box.addButton(text("close.cancel"), QMessageBox.ButtonRole.RejectRole)
        box.setDefaultButton(hide_button)
        box.exec()
        self._system_dialog_open = False
        clicked = box.clickedButton()
        self.handle_close_choice("quit" if clicked is quit_button else "window" if clicked is hide_button else "")

    def handle_close_choice(self, choice: str) -> None:
        """Answer of the close question: "quit", "window" (hide) or "" (cancel)."""
        self._close_request_id += 1     # an answer ends the pending request
        if choice == "quit":
            self.quit_requested.emit()
        elif choice == "window":
            self.hide_requested.emit()

    # --- showing again ---

    def bring_to_front(self) -> None:
        """Show the window again (tray, second start) and give it focus."""
        if self.isMinimized():
            self.showNormal()
        self.show()
        self.raise_()
        self.activateWindow()

    # --- size and position ---

    def _restore_geometry(self) -> None:
        """Size and position from the last session, if the file exists."""
        try:
            saved = json.loads(self._geometry_file.read_text(encoding="utf-8"))
            if not self.restoreGeometry(QByteArray.fromBase64(saved["geometry"].encode())):
                raise ValueError
        except (OSError, ValueError, KeyError, TypeError):
            self.resize(1500, 950)

    def _save_geometry(self) -> None:
        """Remember size and position for the next start."""
        try:
            write_atomic(self._geometry_file, json.dumps({"geometry": bytes(self.saveGeometry().toBase64()).decode()}))
        except OSError:
            pass

    def hideEvent(self, event) -> None:
        """Save the geometry whenever the window is hidden."""
        self._save_geometry()
        super().hideEvent(event)
