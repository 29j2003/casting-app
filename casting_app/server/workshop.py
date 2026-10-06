"""Steam Workshop: name and preview picture of a custom map, for the map pool.

The control page asks /api/workshop?id=<number>. The server sends only that number to Steam's public
GetPublishedFileDetails (no key needed) and downloads the preview picture – only over HTTPS and only from
Steam's own image hosts – and hands both back as a title and a data URL.
"""

import base64
import json
import re
import urllib.error
import urllib.parse
import urllib.request

DETAILS_URL = "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/"
WORKSHOP_ID = re.compile(r"^\d{4,20}$")
# Steam serves workshop previews from these hosts; anything else is refused
IMAGE_HOSTS = re.compile(r"(^|\.)(steamusercontent\.com|steamuserimages-a\.akamaihd\.net|steamstatic\.com|akamaihd\.net)$")
IMAGE_TYPES = {"image/jpeg": "image/jpeg", "image/jpg": "image/jpeg", "image/png": "image/png", "image/webp": "image/webp"}
MAX_DETAILS_SIZE = 1_000_000
MAX_IMAGE_SIZE = 6_000_000
TIMEOUT_SECONDS = 15


class WorkshopError(Exception):
    """A problem worth telling the user (German text, translated in web/lang-en.js)."""


def workshop_id(text: str) -> str | None:
    """The number of a workshop item from a link (…?id=123456) or the bare number."""
    text = (text or "").strip()
    match = re.search(r"[?&]id=(\d+)", text)
    candidate = match.group(1) if match else text
    return candidate if WORKSHOP_ID.match(candidate) else None


def _read(answer, limit: int) -> bytes:
    body = answer.read(limit + 1)
    if len(body) > limit:
        raise WorkshopError("Antwort von Steam zu groß")
    return body


def details(item_id: str) -> tuple[str, str]:
    """(title, preview URL) of a workshop item. Raises WorkshopError or OSError."""
    data = urllib.parse.urlencode({"itemcount": 1, "publishedfileids[0]": item_id}).encode()
    request = urllib.request.Request(DETAILS_URL, data=data, headers={"User-Agent": "casting-app"})
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as answer:
        found = json.loads(_read(answer, MAX_DETAILS_SIZE))
    items = (found.get("response") or {}).get("publishedfiledetails") or []
    item = items[0] if items else {}
    if item.get("result") != 1 or not item.get("title"):
        raise WorkshopError("Nicht im Workshop gefunden – stimmt der Link?")
    return str(item["title"])[:80], str(item.get("preview_url") or "")


def _allowed_image_url(url: str) -> bool:
    parts = urllib.parse.urlparse(url)
    return parts.scheme == "https" and bool(IMAGE_HOSTS.search(parts.hostname or ""))


def preview(url: str) -> str:
    """The preview picture as data URL ("" without one). Raises WorkshopError or OSError."""
    if not url:
        return ""
    if not _allowed_image_url(url):
        raise WorkshopError("Vorschaubild liegt nicht bei Steam")
    request = urllib.request.Request(url, headers={"User-Agent": "casting-app"})
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as answer:
        if not _allowed_image_url(answer.geturl()):          # a redirect must stay on Steam as well
            raise WorkshopError("Vorschaubild liegt nicht bei Steam")
        kind = IMAGE_TYPES.get((answer.headers.get_content_type() or "").lower())
        if not kind:
            raise WorkshopError("Vorschaubild ist kein Bild")
        body = _read(answer, MAX_IMAGE_SIZE)
    return f"data:{kind};base64," + base64.b64encode(body).decode()


def lookup(text: str) -> dict:
    """{title, image, id} for a workshop link or number. Raises WorkshopError or OSError."""
    item_id = workshop_id(text)
    if not item_id:
        raise WorkshopError("Das ist kein Workshop-Link – er endet auf „?id=“ und einer Zahl.")
    title, url = details(item_id)
    return {"id": item_id, "title": title, "image": preview(url)}
