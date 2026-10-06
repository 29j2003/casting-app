"""FACEIT match data (besides the Steam Workshop lookup and the update check, the app's only connection to the internet).

The control page asks /api/faceit/<path>; the server forwards only whitelisted
paths and adds the API key itself, so the key never reaches the page.
"""

import re
import urllib.error
import urllib.request

ALLOWED_PATH = re.compile(
    r"^(data/v4/matches/[A-Za-z0-9-]{8,80}(?:/stats)?"
    r"|democracy/v1/match/[A-Za-z0-9-]{8,80}/history"
    r"|data/v4/championships/[A-Za-z0-9-]{8,80}(?:/subscriptions|/matches)?"
    r"|data/v4/teams/[A-Za-z0-9-]{8,80}(?:/stats/cs2)?)$")
ALLOWED_QUERY_KEYS = ("offset", "limit", "type")
QUERY_VALUE = re.compile(r"^[a-z0-9]{1,10}$", re.I)
MAX_ANSWER_SIZE = 5_000_000
TIMEOUT_SECONDS = 15


def needs_api_key(path: str) -> bool:
    """The Data API (open.faceit.com) needs the key; the public match history does not."""
    return path.startswith("data/")


def clean_query(params: dict[str, str]) -> str:
    """Only the allowed query parameters with harmless values."""
    kept = [f"{key}={params[key]}" for key in ALLOWED_QUERY_KEYS if QUERY_VALUE.match(params.get(key) or "")]
    return "?" + "&".join(kept) if kept else ""


class _NoRedirects(urllib.request.HTTPRedirectHandler):
    """Refuse redirects: urllib would otherwise send the API key along to whatever host a redirect names."""

    def redirect_request(self, request, fp, code, message, headers, new_url):
        return None                                        # urllib then raises HTTPError with the 3xx status


_opener = urllib.request.build_opener(_NoRedirects)


def fetch(path_with_query: str, api_key: str | None) -> tuple[int, bytes]:
    """GET a FACEIT resource. Returns (HTTP status, body). Raises OSError on network problems."""
    host = "open.faceit.com" if needs_api_key(path_with_query) else "api.faceit.com"
    request = urllib.request.Request(f"https://{host}/{path_with_query}",
                                     headers={"User-Agent": "casting-app", "Accept": "application/json"})
    if api_key and needs_api_key(path_with_query):
        request.add_header("Authorization", f"Bearer {api_key}")
    try:
        with _opener.open(request, timeout=TIMEOUT_SECONDS) as answer:
            return answer.status, _read_limited(answer)
    except urllib.error.HTTPError as error:
        return error.code, _read_limited(error)


def _read_limited(stream) -> bytes:
    """Read an answer, refusing anything larger than MAX_ANSWER_SIZE."""
    body = stream.read(MAX_ANSWER_SIZE + 1)
    if len(body) > MAX_ANSWER_SIZE:
        raise OSError("Antwort zu groß")
    return body
