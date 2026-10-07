"""The app version.

Keep it identical in three places: here, in pyproject.toml and in web/cast-core.js.
Overlays compare their own version with the server's and reload when they differ;
tools/build.py refuses to build when the three disagree.
"""

VERSION = "2.12.0"
APP_NAME = "Casting-App"


def compare_versions(a: str, b: str) -> int:
    """> 0 if a is newer than b, < 0 if older, 0 if equal ("old" counts as oldest)."""
    def parts(version):
        """Version as a list of numbers; anything unreadable counts as oldest."""
        try:
            return [int(p) for p in str(version).split(".")]
        except ValueError:
            return [-1]
    left, right = parts(a), parts(b)
    length = max(len(left), len(right))
    left += [0] * (length - len(left))
    right += [0] * (length - len(right))
    return (left > right) - (left < right)
