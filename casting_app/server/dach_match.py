"""DACH CS: is a match active in the user area?

Without an active match the official DACH CS browser sources (lineup, table, last/next matches …) only show the
plain text „Du hast kein aktives Match eingetragen. Bitte aktiviere ein Match im Userbereich“. The server loads one
of these pages itself – with the stored user ID and key, which never leave the server – and only reports whether
that sentence is there. The control page locks the scenes that need a match while none is active.
"""

import re
import time
import urllib.parse
import urllib.request

PAGE_URL = "https://user.dachcs.de/castingoverlay/{page}.php"
PROBE_PAGE = "lineup"                      # needs the active match; the page is small
NO_MATCH = re.compile(r"kein\s+aktives\s+match|no\s+active\s+match", re.IGNORECASE)
MAX_SIZE = 2_000_000
TIMEOUT_SECONDS = 8
CACHE_SECONDS = 20                         # several control pages asking at once share one request


class MatchCheck:
    """Asks DACH CS at most every CACHE_SECONDS; answers True (match active), False (none) or None (unknown)."""

    def __init__(self, opener=None):
        self._opener = opener
        self._last = (0.0, None, "")       # (time, result, credentials fingerprint)

    def active(self, user_id: str | None, key: str | None) -> bool | None:
        """Whether a match is active – None without access data or when DACH CS can't be reached."""
        if not user_id or not key:
            return None
        fingerprint = str(hash((user_id, key)))
        checked, result, used = self._last
        if used == fingerprint and time.monotonic() - checked < CACHE_SECONDS:
            return result
        result = self._ask(user_id, key)
        self._last = (time.monotonic(), result, fingerprint)
        return result

    def _ask(self, user_id: str, key: str) -> bool | None:
        url = PAGE_URL.format(page=PROBE_PAGE) + "?" + urllib.parse.urlencode({"userid": user_id, "key": key})
        request = urllib.request.Request(url, headers={"User-Agent": "casting-app"})
        opener = self._opener or urllib.request.urlopen
        try:
            with opener(request, timeout=TIMEOUT_SECONDS) as answer:
                body = answer.read(MAX_SIZE).decode("utf-8", "replace")
        except (OSError, ValueError):
            return None                    # the address contains the key – never logged or passed on
        return not NO_MATCH.search(re.sub(r"<[^>]*>", " ", body))
