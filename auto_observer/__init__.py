"""Auto-Observer: a small standalone test app that switches the CS2 spectator camera automatically.

It is deliberately independent of the casting app (nothing from `casting_app` is imported): CS2 posts its
game state (GSI) to this app, the director (`director.py`) decides whom to show, and the camera
(`camera.py`) switches the player in CS2 over the console port (`-netconport`) or, as a fallback on
Windows, by pressing the spectator keys 1–0. The control page (`web/`) runs in the browser.

Start: `python -m auto_observer` (or the built `Auto-Observer.exe`, see `tools/build_auto_observer.py`).
"""

VERSION = "0.1.0"
