"""Smoke test of the control page and the overlays in a real browser: no JavaScript errors anywhere.

Opens every area of the control page, clicks every visible button once, opens the command palette and
loads every scene – a renamed name that one part of the code still uses the old way shows up here.
    pytest tests/test_control_page.py
"""

import re

import pytest
from conftest import MemoryKeyring
from playwright.sync_api import sync_playwright

from casting_app import instance
from casting_app.app_log import AppLog
from casting_app.paths import WEB_DIR, create_folders
from casting_app.secret_store import SecretStore
from casting_app.server.app_server import BASE_URL, CastingServer

# buttons that would end the test (quit the app, reload the page) or only open a file chooser
SKIPPED_BUTTONS = "#quitButton, [data-w=quit], #reset, .file-button"
SCENES = sorted(p.stem for p in WEB_DIR.glob("*.html") if p.stem not in ("control", "overlay"))
# messages of the browser that are no errors of the page itself (no OBS, no internet in the test)
EXPECTED = re.compile(r"WebSocket|ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|"
                      r"status of 40[134]|status of 50[0-9]|net::ERR_|Failed to load resource")


@pytest.fixture(scope="module")
def server(tmp_path_factory):
    assert instance.running_version() is None, "Bitte vorher jede laufende Casting-App beenden"
    folders = create_folders(tmp_path_factory.mktemp("dokumente"))
    log = AppLog()
    app_server = CastingServer(folders, SecretStore(folders.data, log.write, keyring_backend=MemoryKeyring()), log,
                               on_quit_requested=lambda: None)
    app_server.start()
    yield app_server
    app_server.stop()


@pytest.fixture
def browser():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        yield browser
        browser.close()


def watch(page) -> list[str]:
    """Collect uncaught errors and console errors of a page."""
    errors = []
    page.on("pageerror", lambda error: errors.append(f"{error}"))
    page.on("console", lambda message: message.type == "error" and not EXPECTED.search(message.text)
            and errors.append(message.text))
    page.on("dialog", lambda dialog: dialog.dismiss())
    return errors


def test_every_area_and_button_of_the_control_page(server, browser):
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    errors = watch(page)
    page.goto(f"{BASE_URL}/control.html")
    page.wait_for_timeout(1500)
    clicked = 0
    for target in page.eval_on_selector_all("#tabs button[data-target]", "l => l.map(b => b.dataset.target)"):
        page.evaluate(f"tabs({target!r})")
        page.wait_for_timeout(200)
        subpages = page.eval_on_selector_all("[data-below]", "l => l.filter(b => b.offsetParent).map(b => b.dataset.below)")
        for subpage in subpages or [None]:
            if subpage:
                page.evaluate(f"document.querySelector('[data-below={subpage}]').click()")
                page.wait_for_timeout(100)
            clicked += page.evaluate(f"""async () => {{
                const buttons = [...document.querySelectorAll('button')].filter(b => b.offsetParent && !b.disabled && !b.matches({SKIPPED_BUTTONS!r}));
                for (const b of buttons) {{
                  if (!b.isConnected || !b.offsetParent) continue;
                  try {{ b.click(); }} catch (e) {{ console.error(e.message); }}
                  await new Promise(r => setTimeout(r, 30));
                  // close whatever the button opened: question dialogs, palette, menus
                  document.querySelectorAll('.question:not(#question) [data-w=""], #questionNo').forEach(x => x.offsetParent && x.click());
                  paletteClose();
                  document.dispatchEvent(new KeyboardEvent('keydown', {{ key: 'Escape', bubbles: true }}));
                }}
                return buttons.length; }}""")
            page.evaluate(f"tabs({target!r})")
    page.keyboard.press("Control+k")
    page.wait_for_timeout(200)
    page.keyboard.type("szene")
    page.wait_for_timeout(200)
    page.keyboard.press("Escape")
    assert clicked > 100, f"nur {clicked} Knöpfe gefunden"
    assert errors == []


@pytest.mark.parametrize("scene", SCENES)
def test_scene_pages_load_without_errors(server, browser, scene):
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    errors = watch(page)
    page.goto(f"{BASE_URL}/{scene}.html?preview=1")
    page.wait_for_timeout(800)
    assert page.evaluate("document.body.dataset.scene") == scene
    assert errors == []


def test_overlay_switches_scenes_without_errors(server, browser):
    control, overlay = browser.new_page(), browser.new_page(viewport={"width": 1920, "height": 1080})
    control_errors, overlay_errors = watch(control), watch(overlay)
    control.goto(f"{BASE_URL}/control.html")
    overlay.goto(f"{BASE_URL}/overlay.html")
    control.wait_for_timeout(1500)
    for scene in ("intro", "cast-duo", "players", "series", "sponsors", "end", "scoreboard", "bracket"):
        control.evaluate(f"Z.broadcast.active = true; Z.broadcast.transition = 'cut'; sceneSwitch('{scene}')")
        overlay.wait_for_timeout(700)
        assert overlay.evaluate("document.body.dataset.currentscene") == scene
    assert control_errors == [] and overlay_errors == []
