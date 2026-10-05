"""Messages between the control page and Python.

The control page calls window.castApp (scripts/page_bridge.js); its messages arrive here
through a QWebChannel that exists only in an isolated script world (scripts/app_bridge.js),
so embedded foreign pages cannot send anything. Each message is a small JSON object with
a "type"; unknown or malformed messages are ignored.
"""

import json

from PySide6.QtCore import QObject, Signal, Slot


class PageBridge(QObject):
    """Object published to the page as "app" on the web channel."""

    close_dialog_shown = Signal(int)          # request id: the page shows its close dialog
    close_answered = Signal(str)              # "quit", "window" or "" (cancel)
    audio_changed = Signal(bool, float)       # on/off, volume 0–100
    overlays_reloaded = Signal(int, bool)     # request id, True if OBS reloaded them

    @Slot(str)
    def receive(self, text: str) -> None:
        try:
            message = json.loads(text)
        except ValueError:
            return
        if not isinstance(message, dict):
            return
        kind = message.get("type")
        if kind == "close-dialog-shown":
            self.close_dialog_shown.emit(int(message.get("requestId") or 0))
        elif kind == "close-answer" and message.get("choice") in ("quit", "window", ""):
            self.close_answered.emit(message["choice"])
        elif kind == "audio":
            volume = message.get("volume")
            self.audio_changed.emit(message.get("on") is True, float(volume) if isinstance(volume, (int, float)) else float("nan"))
        elif kind == "overlays-reloaded":
            self.overlays_reloaded.emit(int(message.get("requestId") or 0), message.get("viaObs") is True)
