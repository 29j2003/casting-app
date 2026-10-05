"""Detecting and replacing an already running Casting-App (also versions 1.x).

Every version answers GET /api/ping with {"dienst": "cast", "version": ...} and quits on
POST /api/beenden. A newer version replaces an older one; an older version never
replaces a newer one.
"""

import json
import time
import urllib.error
import urllib.request

from .server.app_server import PORT

PING_URL = f"http://127.0.0.1:{PORT}/api/ping"
QUIT_URL = f"http://127.0.0.1:{PORT}/api/beenden"
HOST_HEADER = {"Host": f"localhost:{PORT}"}       # the server only answers to its own address


def running_version() -> str | None:
    """Version of the Casting-App on this PC, "alt" for versions without a number, None if none runs."""
    request = urllib.request.Request(PING_URL, headers=HOST_HEADER)
    try:
        with _no_proxy().open(request, timeout=1.5) as answer:
            data = json.loads(answer.read())
    except (OSError, ValueError):
        return None
    return (data.get("version") or "alt") if data.get("dienst") == "cast" else None


def compare_versions(a: str, b: str) -> int:
    """> 0 if a is newer than b, < 0 if older, 0 if equal ("alt" counts as oldest)."""
    def parts(version):
        try:
            return [int(p) for p in str(version).split(".")]
        except ValueError:
            return [-1]
    left, right = parts(a), parts(b)
    length = max(len(left), len(right))
    left += [0] * (length - len(left))
    right += [0] * (length - len(right))
    return (left > right) - (left < right)


def ask_running_app_to_quit(wait_seconds: float = 10) -> bool:
    """Ask the running app to quit and wait until its port is free. True if it is gone."""
    request = urllib.request.Request(QUIT_URL, data=b"", method="POST", headers=HOST_HEADER)
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
