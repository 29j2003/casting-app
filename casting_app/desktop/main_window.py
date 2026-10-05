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

from ..version import APP_NAME
from .audio import AppWindowAudio
from .web_page import AppWebPage

PAGE_CONFIRM_TIMEOUT_MS = 1000
CLOSE_CHOICES = ("beenden", "fenster", "")        # quit · hide window · cancel


class MainWindow(QMainWindow):
    """Window with the control page."""

    quit_requested = Signal()          # "Ganz beenden"
    hide_requested = Signal()          # "Nur Fenster schließen"

    def __init__(self, profile, url: str, icon: QIcon, geometry_file: Path):
        super().__init__()
        self.setWindowTitle(APP_NAME)
        self.setWindowIcon(icon)
        self.setMinimumSize(900, 560)
        self.quitting = False          # set while the app quits: closing is allowed then
        self._geometry_file = geometry_file
        self._restore_geometry()

        self.page = AppWebPage(profile, self)
        self.view = QWebEngineView(self)
        self.view.setPage(self.page)
        self.setCentralWidget(self.view)
        self.audio = AppWindowAudio(self.page)

        self.page.bridge.close_dialog_shown.connect(self._page_shows_close_dialog)
        self.page.bridge.close_answered.connect(self.handle_close_choice)
        self.page.bridge.audio_changed.connect(self.audio.set)
        self._close_request_id = 0
        self._close_request_confirmed = False
        self._system_dialog_open = False
        self.page.load(QUrl(url))

    # --- closing ---

    def closeEvent(self, event: QCloseEvent) -> None:
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
        if request_id == self._close_request_id:
            self._close_request_confirmed = True

    def _fall_back_to_system_dialog(self, request_id: int) -> None:
        if request_id != self._close_request_id or self._close_request_confirmed or not self.isVisible():
            return
        self._system_dialog_open = True
        box = QMessageBox(QMessageBox.Icon.Question, f"{APP_NAME} schließen?", f"{APP_NAME} schließen?", parent=self)
        box.setInformativeText("Bei „Nur Fenster schließen“ laufen die Overlays in OBS weiter.")
        quit_button = box.addButton("Ganz beenden", QMessageBox.ButtonRole.DestructiveRole)
        hide_button = box.addButton("Nur Fenster schließen", QMessageBox.ButtonRole.AcceptRole)
        box.addButton("Abbrechen", QMessageBox.ButtonRole.RejectRole)
        box.setDefaultButton(hide_button)
        box.exec()
        self._system_dialog_open = False
        clicked = box.clickedButton()
        self.handle_close_choice("beenden" if clicked is quit_button else "fenster" if clicked is hide_button else "")

    def handle_close_choice(self, choice: str) -> None:
        self._close_request_id += 1     # an answer ends the pending request
        if choice == "beenden":
            self.quit_requested.emit()
        elif choice == "fenster":
            self.hide_requested.emit()

    # --- showing again ---

    def bring_to_front(self) -> None:
        if self.isMinimized():
            self.showNormal()
        self.show()
        self.raise_()
        self.activateWindow()

    # --- size and position ---

    def _restore_geometry(self) -> None:
        try:
            saved = json.loads(self._geometry_file.read_text(encoding="utf-8"))
            if not self.restoreGeometry(QByteArray.fromBase64(saved["geometry"].encode())):
                raise ValueError
        except (OSError, ValueError, KeyError, TypeError):
            self.resize(1500, 950)

    def _save_geometry(self) -> None:
        try:
            self._geometry_file.write_text(json.dumps({"geometry": bytes(self.saveGeometry().toBase64()).decode()}),
                                           encoding="utf-8")
        except OSError:
            pass

    def hideEvent(self, event) -> None:
        self._save_geometry()
        super().hideEvent(event)
