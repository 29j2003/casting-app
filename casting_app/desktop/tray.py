"""Tray icon (29 logo) with the menu: Öffnen · Overlays in OBS neu laden · Ganz beenden (texts in the app language)."""

from PySide6.QtCore import QObject, Signal
from PySide6.QtGui import QAction, QIcon
from PySide6.QtWidgets import QMenu, QSystemTrayIcon

from ..paths import IS_MAC
from ..texts import text
from ..version import APP_NAME, VERSION


class TrayIcon(QObject):
    """The tray icon; emits signals for its menu entries."""

    open_requested = Signal()
    reload_overlays_requested = Signal()
    quit_requested = Signal()
    message_clicked = Signal()          # the user clicked a notification (e.g. "new version")

    def __init__(self, icon: QIcon, parent=None):
        super().__init__(parent)
        self._icon = QSystemTrayIcon(icon, self)
        menu = QMenu()
        self._actions = {}
        for key, signal in (("tray.open", self.open_requested), ("tray.reload_overlays", self.reload_overlays_requested),
                            (None, None), ("tray.quit", self.quit_requested)):
            if key is None:
                menu.addSeparator()
                continue
            action = QAction(menu)
            action.triggered.connect(signal.emit)
            menu.addAction(action)
            self._actions[key] = action
        self._menu = menu                  # keep a reference: Qt does not own the menu
        self.retranslate()
        self._icon.setContextMenu(menu)
        self._icon.activated.connect(self._clicked)
        self._icon.messageClicked.connect(self.message_clicked.emit)
        self._hint_shown = False

    def retranslate(self) -> None:
        """Menu and tooltip in the current app language (called again when it changes)."""
        self._icon.setToolTip(text("tray.tooltip", app=APP_NAME, version=VERSION))
        for key, action in self._actions.items():
            action.setText(text(key))

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
            self.tell(text("tray.keeps_running.title", app=APP_NAME), text("tray.keeps_running.text"))

    def _clicked(self, reason: QSystemTrayIcon.ActivationReason) -> None:
        # a click opens the window (on macOS a click shows the menu instead)
        if not IS_MAC and reason == QSystemTrayIcon.ActivationReason.Trigger:
            self.open_requested.emit()
