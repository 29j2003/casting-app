"""Smoke test of the control page and the overlays in a real browser: no JavaScript errors anywhere.

Opens every area of the control page, clicks every visible button once, opens the command palette and
loads every scene – a renamed name that one part of the code still uses the old way shows up here.
    pytest tests/test_control_page.py
"""

import os
import re
from pathlib import Path

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


# words that only appear in German texts (to find texts the English dictionary does not know yet)
GERMAN = re.compile(r"[äöüÄÖÜß]|\b(der|die|das|und|nicht|mit|für|oder|eine?n?|wird|werden|ist|sind|noch|zum|zur|bei|auf|aus|wie|alle|keine?)\b")
VISIBLE_GERMAN_TEXTS = """() => {
  const found = new Set(), walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const e = n.parentElement;
    if (!e || e.closest("script, style, textarea, [data-no-translate], #logText") || !n.nodeValue.trim()) continue;
    found.add(n.nodeValue.trim());
  }
  document.querySelectorAll("[title], [placeholder], [aria-label]").forEach(e =>
    ["title", "placeholder", "aria-label"].forEach(a => e.getAttribute(a) && found.add(e.getAttribute(a))));
  return [...found];
}"""


def test_control_page_in_english(server, browser):
    """App language English: the whole control page (all areas, settings, palette) shows no German text."""
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    errors = watch(page)
    page.goto(f"{BASE_URL}/control.html")
    page.evaluate("localStorage.setItem('casting-app-language', 'en')")
    server.settings.update({"app_language": "en"})
    page.reload()
    page.wait_for_timeout(1500)
    texts = set()
    for target in page.eval_on_selector_all("#tabs button[data-target]", "l => l.map(b => b.dataset.target)"):
        page.evaluate(f"tabs({target!r})")
        page.wait_for_timeout(150)
        for subpage in page.eval_on_selector_all("[data-below]", "l => l.filter(b => b.offsetParent).map(b => b.dataset.below)") or [None]:
            if subpage:
                page.evaluate(f"document.querySelector('[data-below={subpage}]').click()")
                page.wait_for_timeout(100)
            texts |= set(page.evaluate(VISIBLE_GERMAN_TEXTS))
            # every button once: dialogs, menus and messages it opens must be English too
            texts |= set(page.evaluate(f"""async () => {{
                const collect = {VISIBLE_GERMAN_TEXTS}, found = new Set();
                const buttons = [...document.querySelectorAll('button')].filter(b => b.offsetParent && !b.disabled && !b.matches({SKIPPED_BUTTONS!r}));
                for (const b of buttons) {{
                  if (!b.isConnected || !b.offsetParent) continue;
                  try {{ b.click(); }} catch (e) {{}}
                  await new Promise(r => setTimeout(r, 40));
                  collect().forEach(x => found.add(x));
                  document.querySelectorAll('.question:not(#question) [data-w=""], #questionNo').forEach(x => x.offsetParent && x.click());
                  paletteClose();
                  document.dispatchEvent(new KeyboardEvent('keydown', {{ key: 'Escape', bubbles: true }}));
                }}
                return [...found]; }}"""))
            page.evaluate(f"tabs({target!r})")
    page.evaluate("document.querySelector('[title=\"App settings\"], #settingsOpen')?.click()")
    texts |= set(page.evaluate(VISIBLE_GERMAN_TEXTS))
    server.settings.update({"app_language": "de"})
    german = sorted(t for t in texts if GERMAN.search(t))
    if os.environ.get("CASTING_APP_DUMP_TEXTS"):
        Path(os.environ["CASTING_APP_DUMP_TEXTS"]).write_text("\n".join(sorted(texts)), encoding="utf-8")
    assert page.evaluate("CastI18n.language") == "en"
    assert german == [], "nicht übersetzt (web/lang-en.js ergänzen):\n" + "\n".join(german)
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


def test_overlay_language_is_independent_of_the_app_language(server, browser):
    """Overlay language English with a German app: fixed overlay texts switch, own texts stay."""
    control, overlay = browser.new_page(), browser.new_page(viewport={"width": 1920, "height": 1080})
    errors = watch(control) + []
    control.goto(f"{BASE_URL}/control.html")
    control.wait_for_timeout(1200)
    control.evaluate("Z.texts.endTitle = 'Bis morgen!'; send()")
    control.evaluate("document.querySelector('#overlayLanguage [data-language=en]').click()")
    control.wait_for_timeout(800)
    assert control.evaluate("CastI18n.language") == "de"
    state = control.evaluate("({ lang: Z.overlayLanguage, pause: Z.texts.pauseTitle, end: Z.texts.endTitle, ticker: Z.texts.ticker[0] })")
    assert state == {"lang": "en", "pause": "BREAK", "end": "Bis morgen!", "ticker": "Welcome to the cast"}
    overlay.goto(f"{BASE_URL}/pause.html")
    overlay.wait_for_timeout(1000)
    assert "BREAK" in overlay.inner_text("body")
    control.evaluate("document.querySelector('#overlayLanguage [data-language=de]').click()")
    assert control.evaluate("[Z.texts.pauseTitle, Z.texts.endTitle]") == ["PAUSE", "Bis morgen!"]
    assert errors == []


def test_every_graphic_appears_in_the_overlay_at_its_position(server, browser):
    """Each graphic type shows up in the overlay with its CSS class and in the chosen corner."""
    control, overlay = browser.new_page(), browser.new_page(viewport={"width": 1920, "height": 1080})
    errors = watch(control) + []
    overlay_errors = watch(overlay)
    control.goto(f"{BASE_URL}/control.html")
    control.wait_for_timeout(1200)
    overlay.goto(f"{BASE_URL}/cast-solo.html")
    overlay.wait_for_timeout(1000)
    kinds = control.evaluate("Z.graphics.map(x => x.type)")
    for kind in kinds:
        control.evaluate(f"""Z.graphics.forEach(x => {{ x.on = x.type === {kind!r}; x.until = 0; x.pos = 'tr'; x.scenes = []; }});
                             Z.broadcast.scene = 'cast-solo'; send()""")
        overlay.wait_for_timeout(900)
        shown = overlay.evaluate(f"""(() => {{ const e = document.querySelector('.gfx.gfx-{kind}.on');
            if (!e) return null; const r = e.getBoundingClientRect();
            return {{ classes: e.className, opacity: getComputedStyle(e).opacity, right: Math.round(innerWidth - r.right) }}; }})()""")
        assert shown, f"Einblendung {kind} erscheint nicht im Overlay"
        assert "pos-tr" in shown["classes"] and float(shown["opacity"]) > 0
        assert shown["right"] < 200, f"Einblendung {kind} steht nicht rechts oben: {shown}"
    assert errors == [] and overlay_errors == []
