"""Shared helpers for the live test scripts (they drive a running Casting-App, see docs/ENTWICKLUNG.md → Live-Tests).

The scripts open the control page and an overlay in Playwright's Chromium, change the state through the
control page's own functions (sceneSwitch, dachSwitch, send …) and look at what the overlay shows.
"""

import contextlib
import sys

from playwright.async_api import async_playwright

BASE_URL = "http://localhost:8787"

# all scenes of the "own" themes (every scene file in web/ except control.html and overlay.html)
SCENES = ["intro", "cast-duo", "cast-solo", "cast-duo-clips", "cast-solo-clips", "cast-duo-interview", "cast-solo-interview",
          "map-veto", "players", "series", "sponsors", "ingame", "pause", "end"]
TRANSITIONS = ["cut", "fade", "slide", "wipe", "stinger"]
# DACH CS – official: scene name → page of the official browser source (/dach/<page>)
DACH_PAGES = {"dach-duocast": "duocast", "dach-singlecast": "singlecast", "dach-pause": "pause",
              "dach-table": "tabelle", "dach-overview": "overview"}


async def access_key() -> str:
    """The app's access key, read from its own window (the app runs with QTWEBENGINE_REMOTE_DEBUGGING=9222).

    The key never appears in a file, the log or browser storage; the window gets it through window.castApp.
    """
    from cdp import PageConnection
    page = await PageConnection.open()
    try:
        key = await page.evaluate("(window.castApp && window.castApp.accessKey) || ''")
    finally:
        await page.close()
    if not key:
        sys.exit("Zugangsschlüssel nicht gefunden – läuft die App mit Fenster und QTWEBENGINE_REMOTE_DEBUGGING=9222?")
    return key


@contextlib.asynccontextmanager
async def control_and_overlay(overlay_url: str = "/overlay.html"):
    """Yields (control page, overlay page, list of JavaScript errors of both); the broadcast is switched on."""
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        errors: list[str] = []
        control = await (await browser.new_context(viewport={"width": 1500, "height": 900})).new_page()
        overlay = await (await browser.new_context(viewport={"width": 1920, "height": 1080})).new_page()
        for page in (control, overlay):
            page.on("pageerror", lambda error: errors.append(str(error)))
        key = await access_key()
        await control.goto(BASE_URL + "/control.html?access=" + key)
        await control.wait_for_timeout(1200)
        await control.evaluate("Z.broadcast.active = true; Z.broadcast.duration = 500; Z.broadcast.scene = 'intro'; "
                               "Z.sponsors.byTheme = {}; Z.background.videos = []; everything(); send();")
        await overlay.goto(BASE_URL + overlay_url + ("&" if "?" in overlay_url else "?") + "access=" + key)
        await overlay.wait_for_timeout(1500)
        try:
            yield control, overlay, errors
        finally:
            await browser.close()


async def switch_scene(control, scene: str, transition: str) -> None:
    """Switch the broadcast to `scene` with `transition`, like a click in the Live tab."""
    await control.evaluate(f"Z.broadcast.transition = {transition!r}; sceneSwitch({scene!r})")


def finish(ok: bool, summary: str) -> None:
    """Print the result and end the script with exit code 0 (ok) or 1 (problem) – the CI looks at the code."""
    print(("OK: " if ok else "PROBLEM: ") + summary)
    sys.exit(0 if ok else 1)
