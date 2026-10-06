"""H.264/AAC videos in the app window (see casting_app/server/media_converter.py for the conversion).

Qt WebEngine (PySide6) plays WebM/VP9/AV1 but not H.264/AAC. In the app window – and only there,
overlays in OBS are untouched – this module
  - redirects media requests for MP4-like files to the server's /api/media (which answers with WebM),
  - injects scripts/codecs.js into every frame so pages still request those files.
Without FFmpeg nothing is installed and the preview shows a hint instead (broadcast.js, dachNote).
"""

import json
import urllib.parse
from pathlib import Path

from PySide6.QtCore import QUrl
from PySide6.QtWebEngineCore import (QWebEnginePage, QWebEngineProfile, QWebEngineScript,
                                     QWebEngineUrlRequestInfo, QWebEngineUrlRequestInterceptor)

from ..server.app_server import BASE_URL
from ..server.media_converter import find_ffmpeg, media_token

CODECS_SCRIPT = (Path(__file__).parent / "scripts" / "codecs.js").read_text(encoding="utf-8")
CONVERTED_SUFFIXES = (".mp4", ".m4v", ".mov", ".m4a", ".aac")
MEDIA_PATH = f"{BASE_URL}/api/media"


def needs_conversion(url: str) -> bool:
    """True for http(s) addresses of MP4-like files (not our own converted answers)."""
    if url.startswith(MEDIA_PATH):
        return False
    parts = urllib.parse.urlsplit(url)
    return parts.scheme in ("http", "https") and parts.path.lower().endswith(CONVERTED_SUFFIXES)


def converted_url(url: str, token: str, referer: str = "") -> str:
    """Address of `url` as WebM on the app's server (referer: the page that wanted it – some video servers check it)."""
    query = {"src": url, "t": token}
    if referer.startswith(("http://", "https://")):
        query["ref"] = referer
    return f"{MEDIA_PATH}?" + urllib.parse.urlencode(query)


class MediaRedirect(QWebEngineUrlRequestInterceptor):
    """Sends media requests for H.264 files to the app's converter (runs on Qt's network thread)."""

    def __init__(self, token: str, parent=None):
        super().__init__(parent)
        self._token = token

    def interceptRequest(self, info: QWebEngineUrlRequestInfo) -> None:
        if info.resourceType() != QWebEngineUrlRequestInfo.ResourceType.ResourceTypeMedia:
            return
        url = info.requestUrl().toString()
        if needs_conversion(url):
            info.redirect(QUrl(converted_url(url, self._token, info.firstPartyUrl().toString())))


def can_convert(access_key: str) -> bool:
    """True if the app window can play H.264 through the converter (FFmpeg found, key known)."""
    return bool(access_key) and find_ffmpeg() is not None


def install(profile: QWebEngineProfile, page: QWebEnginePage, access_key: str) -> MediaRedirect | None:
    """Set up H.264 playback for the app window. Returns the interceptor (the caller keeps it alive),
    None without FFmpeg or key."""
    convert = can_convert(access_key)
    script = QWebEngineScript()
    script.setName("casting-app-codecs")
    script.setSourceCode(CODECS_SCRIPT.replace("__CASTING_APP_CAN_CONVERT__", json.dumps(convert)))
    script.setInjectionPoint(QWebEngineScript.InjectionPoint.DocumentCreation)
    script.setWorldId(QWebEngineScript.ScriptWorldId.MainWorld)
    script.setRunsOnSubFrames(True)
    page.scripts().insert(script)
    if not convert:
        return None
    interceptor = MediaRedirect(media_token(access_key), profile)
    profile.setUrlRequestInterceptor(interceptor)
    return interceptor
