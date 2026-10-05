"""The app version.

Keep it identical in three places: here, in pyproject.toml and in web/cast-core.js.
Overlays compare their own version with the server's and reload when they differ;
tools/build.py refuses to build when the three disagree.
"""

VERSION = "2.2.0"
APP_NAME = "Casting-App"
