""""Ton im App-Fenster": mute and volume for everything that plays in the app window.

Mute    – QWebEnginePage.setAudioMuted() silences the whole page, including embedded
          foreign pages running in their own processes (VDO.Ninja, YouTube/Twitch clips,
          DACH CS). This always works.
Volume  – Qt has no volume per page. scripts/volume.js runs in every frame and multiplies
          the volume of all <video>/<audio> elements and all Web Audio output by one factor.
          A frame asks the control page for the factor when it starts (the bridge world of
          the control page answers); when the factor changes, every existing frame is
          updated through QWebEngineFrame.runJavaScript().
          The injected script itself never changes: Qt can miss a frame that is created
          while page scripts are being replaced.
"""

from pathlib import Path

from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineScript

VOLUME_SCRIPT = (Path(__file__).parent / "scripts" / "volume.js").read_text(encoding="utf-8")
DEFAULT_VOLUME = 60
BRIDGE_WORLD = QWebEngineScript.ScriptWorldId.ApplicationWorld


class AppWindowAudio:
    """Audio of one web page; off by default."""

    def __init__(self, page: QWebEnginePage):
        """Starts muted: "Ton im App-Fenster" is off by default."""
        self._page = page
        self.enabled = False
        self.volume = DEFAULT_VOLUME             # percent
        page.setAudioMuted(True)
        script = QWebEngineScript()
        script.setName("casting-app-volume")
        script.setSourceCode(VOLUME_SCRIPT)
        script.setInjectionPoint(QWebEngineScript.InjectionPoint.DocumentCreation)
        script.setWorldId(QWebEngineScript.ScriptWorldId.MainWorld)
        script.setRunsOnSubFrames(True)
        page.scripts().insert(script)
        page.loadFinished.connect(lambda ok: self._publish_factor())

    @property
    def factor(self) -> float:
        """Volume factor 0…1 that volume.js applies to all media in the window."""
        return max(0.0, min(1.0, self.volume / 100))

    def set(self, enabled: bool, volume: float | None = None) -> None:
        """Switch audio on/off and optionally change the volume (0–100)."""
        self.enabled = bool(enabled)
        if volume is not None and volume == volume:     # ignore NaN
            self.volume = max(0.0, min(100.0, float(volume)))
        self._page.setAudioMuted(not self.enabled)
        self._publish_factor()
        self._update_frames(self._page.mainFrame())

    def _publish_factor(self) -> None:
        """Tell the control page's bridge the factor it hands out to newly started frames."""
        self._page.runJavaScript(f"window.castAppSetVolumeFactor && window.castAppSetVolumeFactor({self.factor!r})", BRIDGE_WORLD)

    def _update_frames(self, frame) -> None:
        """Push the current factor into every frame that already exists."""
        if not frame.isValid():
            return
        frame.runJavaScript(f'(window[Symbol.for("casting-app-volume")] || (() => {{}}))({self.factor!r})',
                            QWebEngineScript.ScriptWorldId.MainWorld)
        for child in frame.children():
            self._update_frames(child)
