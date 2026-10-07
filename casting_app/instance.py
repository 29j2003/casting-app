"""Detecting and replacing an already running Casting-App (also versions 1.x).

Every version answers GET /api/ping with {"service": "cast", "version": ...} (versions 2.1 and
older: {"dienst": "cast", ...}) and quits on POST /api/quit (2.1 and older: /api/beenden, which
newer versions still accept). A newer version replaces an older one; an older version never
replaces a newer one.

Since 2.12 quitting needs the access key, and /api/ping?nonce=… answers with a proof that the
server knows the key (genuine_server): a program that merely took port 8787 gets neither the
app window, nor the key, nor the camera.
"""

import hmac
import json
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request

from .server.app_server import ACCESS_HEADER, PORT, ping_proof

PING_URL = f"http://127.0.0.1:{PORT}/api/ping"
QUIT_URL = f"http://127.0.0.1:{PORT}/api/beenden"       # the old name: understood by every version
HOST_HEADER = {"Host": f"localhost:{PORT}"}       # the server only answers to its own address


def running_version() -> str | None:
    """Version of the Casting-App on this PC, "old" for versions without a number, None if none runs."""
    request = urllib.request.Request(PING_URL, headers=HOST_HEADER)
    try:
        with _no_proxy().open(request, timeout=1.5) as answer:
            data = json.loads(answer.read())
    except (OSError, ValueError):
        return None
    if "cast" not in (data.get("service"), data.get("dienst")):
        return None
    return data.get("version") or "old"


def genuine_server(access_key: str) -> bool:
    """True if the server on our port proves that it knows our access key (it is our own app, 2.12+)."""
    if not access_key:
        return False
    nonce = secrets.token_urlsafe(24)
    request = urllib.request.Request(f"{PING_URL}?{urllib.parse.urlencode({'nonce': nonce})}", headers=HOST_HEADER)
    try:
        with _no_proxy().open(request, timeout=1.5) as answer:
            data = json.loads(answer.read())
    except (OSError, ValueError):
        return False
    return hmac.compare_digest(str(data.get("proof", "")), ping_proof(access_key, nonce))


def ask_running_app_to_quit(wait_seconds: float = 10, access_key: str = "") -> bool:
    """Ask the running app to quit and wait until its port is free. True if it is gone.

    Versions 2.12 and newer only quit with the access key; older ones ignore it."""
    headers = dict(HOST_HEADER, **({ACCESS_HEADER: access_key} if access_key else {}))
    request = urllib.request.Request(QUIT_URL, data=b"", method="POST", headers=headers)
    try:
        with _no_proxy().open(request, timeout=2):
            pass
    except OSError:
        pass
    deadline = time.monotonic() + wait_seconds
    while time.monotonic() < deadline:
        if running_version() is None:
            time.sleep(0.3)                       # let it finish closing its files
            return True
        time.sleep(0.25)
    return False


def _no_proxy():
    """URL opener that never uses a system proxy (the app talks to itself on this PC)."""
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))
