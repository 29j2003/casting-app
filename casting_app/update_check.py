"""Looks for a newer Casting-App on GitHub Releases (once per start, can be switched off in the settings).

Only the version number is fetched – nothing about the user or the cast is sent.
Network problems or a private repository simply mean "no update found".
"""

import json
import urllib.request

from .instance import compare_versions
from .version import VERSION

RELEASES_URL = "https://api.github.com/repos/29j2003/casting-app/releases/latest"
TIMEOUT_SECONDS = 5


def newer_release() -> dict | None:
    """{"version": "2.1.0", "url": "<release page>"} if GitHub has a newer version, else None."""
    request = urllib.request.Request(RELEASES_URL, headers={"Accept": "application/vnd.github+json", "User-Agent": "casting-app"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as answer:
            release = json.loads(answer.read(1_000_000))
    except (OSError, ValueError):
        return None
    version = str(release.get("tag_name") or "").lstrip("v")
    if not version or release.get("draft") or release.get("prerelease") or compare_versions(version, VERSION) <= 0:
        return None
    url = str(release.get("html_url") or "")
    return {"version": version, "url": url if url.startswith("https://github.com/") else ""}
