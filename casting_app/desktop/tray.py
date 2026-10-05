"""Tray icon (29 logo) with the menu: Öffnen · Overlays in OBS neu laden · Ganz beenden."""

from PySide6.QtCore import QObject, Signal
from PySide6.QtGui import QAction, QIcon
from PySide6.QtWidgets import QMenu, QSystemTrayIcon

from ..paths import IS_MAC
from ..version import APP_NAME, VERSION


class TrayIcon(QObject):
    """The tray icon; emits signals for its menu entries."""

    open_requested = Signal()
    reload_overlays_requested = Signal()
    quit_requested = Signal()

    def __init__(self, icon: QIcon, parent=None):
        super().__init__(parent)
        self._icon = QSystemTrayIcon(icon, self)
        self._icon.setToolTip(f"{APP_NAME} {VERSION} – Overlays laufen")
        menu = QMenu()
        for text, signal in (("Öffnen", self.open_requested), ("Overlays in OBS neu laden", self.reload_overlays_requested)):
            action = QAction(text, menu)
            action.triggered.connect(signal.emit)
            menu.addAction(action)
        menu.addSeparator()
        quit_action = QAction("Ganz beenden", menu)
        quit_action.triggered.connect(self.quit_requested.emit)
        menu.addAction(quit_action)
        self._menu = menu                  # keep a reference: Qt does not own the menu
        self._icon.setContextMenu(menu)
        self._icon.activated.connect(self._clicked)
        self._hint_shown = False

    @property
    def available(self) -> bool:
        """False on desktops without a tray (e.g. GNOME without extension)."""
        return QSystemTrayIcon.isSystemTrayAvailable()

    def show(self) -> None:
        self._icon.show()

    def hide(self) -> None:
        self._icon.hide()

    def tell(self, title: str, text: str) -> None:
        """Short notification next to the tray icon."""
        if self._icon.isVisible() and QSystemTrayIcon.supportsMessages():
            self._icon.showMessage(title, text, QSystemTrayIcon.MessageIcon.Information, 5000)

    def tell_once_that_app_keeps_running(self) -> None:
        if not self._hint_shown:
            self._hint_shown = True
            self.tell(f"{APP_NAME} läuft weiter",
                      "Die Overlays in OBS laufen weiter. Über dieses Symbol öffnest du das Fenster wieder oder beendest die App.")

    def _clicked(self, reason: QSystemTrayIcon.ActivationReason) -> None:
        # a click opens the window (on macOS a click shows the menu instead)
        if not IS_MAC and reason == QSystemTrayIcon.ActivationReason.Trigger:
            self.open_requested.emit()
