"""The web page of the app window.

- loads only the app's own pages; links to the internet open in the default browser
- camera/microphone only for the app's own pages (capture devices in the preview)
- installs the page bridge (window.castApp) and the web channel to Python
- downloads (session export, CS2 cfg file) ask where to save
"""

import json
from pathlib import Path

from PySide6.QtCore import QFile, QIODevice, QStandardPaths, QUrl
from PySide6.QtGui import QDesktopServices
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtWebEngineCore import (QWebEngineDownloadRequest, QWebEnginePage, QWebEnginePermission,
                                     QWebEngineProfile, QWebEngineScript, QWebEngineSettings)
from PySide6.QtWidgets import QFileDialog

from ..server.app_server import ALLOWED_ORIGINS
from . import media
from .bridge import PageBridge

SCRIPTS = Path(__file__).parent / "scripts"
ALLOWED_PERMISSIONS = {QWebEnginePermission.PermissionType.MediaAudioCapture,
                       QWebEnginePermission.PermissionType.MediaVideoCapture,
                       QWebEnginePermission.PermissionType.MediaAudioVideoCapture}
BRIDGE_WORLD = QWebEngineScript.ScriptWorldId.ApplicationWorld


def is_own_page(url: QUrl) -> bool:
    """True for pages of the local Casting-App server."""
    return f"{url.scheme()}://{url.authority()}" in ALLOWED_ORIGINS


def create_profile(storage_dir: Path, parent=None) -> QWebEngineProfile:
    """Persistent browser profile of the app window (localStorage, cache) in the data folder."""
    profile = QWebEngineProfile("casting-app", parent)
    profile.setPersistentStoragePath(str(storage_dir))
    profile.setCachePath(str(storage_dir / "cache"))
    profile.setHttpUserAgent(profile.httpUserAgent() + " CastingApp")
    profile.downloadRequested.connect(_ask_where_to_save)
    settings = profile.settings()
    settings.setAttribute(QWebEngineSettings.WebAttribute.PlaybackRequiresUserGesture, False)
    settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptCanAccessClipboard, True)
    settings.setAttribute(QWebEngineSettings.WebAttribute.FullScreenSupportEnabled, True)
    return profile


def _ask_where_to_save(download: QWebEngineDownloadRequest) -> None:
    """Downloads (exports, cfg file) go where the user chooses in a save dialog."""
    folder = QStandardPaths.writableLocation(QStandardPaths.StandardLocation.DownloadLocation) or str(Path.home())
    target, _ = QFileDialog.getSaveFileName(None, "Speichern unter", str(Path(folder) / download.suggestedFileName()))
    if not target:
        download.cancel()
        return
    download.setDownloadDirectory(str(Path(target).parent))
    download.setDownloadFileName(Path(target).name)
    download.accept()


def _read_qt_resource(path: str) -> str:
    """Text of a file bundled with Qt (qwebchannel.js)."""
    resource = QFile(path)
    if not resource.open(QIODevice.OpenModeFlag.ReadOnly):
        raise FileNotFoundError(path)
    return bytes(resource.readAll()).decode("utf-8")


def _script(name: str, source: str, world, injection_point) -> QWebEngineScript:
    """A script injected into every page load (see the module docstring for which world it runs in)."""
    script = QWebEngineScript()
    script.setName(name)
    script.setSourceCode(source)
    script.setWorldId(world)
    script.setInjectionPoint(injection_point)
    script.setRunsOnSubFrames(False)
    return script


class AppWebPage(QWebEnginePage):
    """Web page of the app window with the bridge to Python."""

    def __init__(self, profile: QWebEngineProfile, parent=None, access_key: str = ""):
        """Page with the injected bridge and volume scripts and the Python side of the bridge.

        access_key: the server's key, given to the control page as window.castApp.accessKey (main frame only).
        """
        super().__init__(profile, parent)
        self.bridge = PageBridge(self)
        self._channel = QWebChannel(self)
        self._channel.registerObject("app", self.bridge)
        self.setWebChannel(self._channel, BRIDGE_WORLD)
        created = QWebEngineScript.InjectionPoint.DocumentCreation
        app_bridge = _read_qt_resource(":/qtwebchannel/qwebchannel.js") + "\n" + (SCRIPTS / "app_bridge.js").read_text(encoding="utf-8")
        self.scripts().insert(_script("casting-app-bridge", app_bridge, BRIDGE_WORLD, created))
        page_bridge = (SCRIPTS / "page_bridge.js").read_text(encoding="utf-8")
        page_bridge = page_bridge.replace('"__CASTING_APP_ACCESS_KEY__"', json.dumps(access_key))
        page_bridge = page_bridge.replace('"__CASTING_APP_CAN_CONVERT__"', json.dumps("true" if media.can_convert(access_key) else "false"))
        self.scripts().insert(_script("casting-app-page-bridge", page_bridge, QWebEngineScript.ScriptWorldId.MainWorld, created))
        self.permissionRequested.connect(self._decide_permission)

    def send_to_page(self, message: dict) -> None:
        """Send a message to the control page (see page_bridge.js for the message types)."""
        self.runJavaScript(f"window.castAppSend && window.castAppSend({json.dumps(message)})", BRIDGE_WORLD)

    def _decide_permission(self, permission: QWebEnginePermission) -> None:
        """Camera and microphone (for the camera picker) are allowed for the app's own pages only."""
        if permission.permissionType() in ALLOWED_PERMISSIONS and is_own_page(permission.origin()):
            permission.grant()
        else:
            permission.deny()

    def acceptNavigationRequest(self, url: QUrl, navigation_type, is_main_frame: bool) -> bool:
        """The window shows only the app's own pages; internet links go to the default browser."""
        if not is_main_frame or is_own_page(url) or url.scheme() in ("about", "data", "blob"):
            return True
        if url.scheme() in ("http", "https"):
            QDesktopServices.openUrl(url)
        return False

    def createWindow(self, window_type):
        """Links opened in a new window: hand them to the default browser."""
        return _ExternalLinkPage(self.profile(), self)


class _ExternalLinkPage(QWebEnginePage):
    """Throw-away page that passes its first navigation to the default browser."""

    def acceptNavigationRequest(self, url: QUrl, navigation_type, is_main_frame: bool) -> bool:
        if url.scheme() in ("http", "https"):
            QDesktopServices.openUrl(url)
        self.deleteLater()
        return False
