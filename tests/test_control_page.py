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
from casting_app import secret_store
from casting_app.secret_store import SecretStore
from casting_app.server import dach_match
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
    page.goto(f"{BASE_URL}/control.html?access={server.access_key}")
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
    page.goto(f"{BASE_URL}/control.html?access={server.access_key}")
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
    control.goto(f"{BASE_URL}/control.html?access={server.access_key}")
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
    control.goto(f"{BASE_URL}/control.html?access={server.access_key}")
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
    control.goto(f"{BASE_URL}/control.html?access={server.access_key}")
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


def test_dach_pages_keep_running_when_app_audio_changes(server, browser):
    """DACH CS – official in the preview: videos may play, switching app audio reloads nothing, empty cam slots are black."""
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    errors = watch(page)
    page.goto(f"{BASE_URL}/overlay.html?access={server.access_key}")      # stands in for the control page around the preview
    page.wait_for_timeout(800)
    page.evaluate("""(() => { const f = document.createElement('iframe'); f.id = 'p'; f.src = '/overlay.html?preview=1';
        f.style.cssText = 'position:fixed;inset:0;width:1920px;height:1080px;z-index:99'; document.body.appendChild(f); })()""")
    page.wait_for_timeout(1500)
    page.evaluate("""(() => { const z = JSON.parse(JSON.stringify(CastCore.DEFAULT)); z.theme = 'dachcs-official';
        z.broadcast.scene = 'dach-singlecast'; z.broadcast.active = true; z.revision = Date.now();
        fetch('/api/state', { method: 'POST', body: JSON.stringify(z) });            // the server's state wins in the overlay
        document.getElementById('p').contentWindow.postMessage({ cast: 'state', z }, location.origin); })()""")
    page.wait_for_timeout(1500)
    before = page.evaluate("""(() => { const d = document.getElementById('p').contentDocument;
        const pages = [...d.querySelectorAll('.dach-page')];
        // a reload by the overlay means writing src again (even the same value) or a new frame – not a late first load
        window._pages = pages; window._srcWrites = 0;
        new MutationObserver(r => window._srcWrites += r.filter(m => m.target.classList.contains('dach-page')).length).observe(d.body, { subtree: true, attributes: true, attributeFilter: ['src'] });
        return { allow: pages.map(f => f.getAttribute('allow')), src: pages.map(f => f.getAttribute('src')),
                 cams: [...d.querySelectorAll('.dach-cam')].map(k => getComputedStyle(k).backgroundColor) }; })()""")
    assert before["allow"] == ["autoplay"] * 3, "DACH-Seiten dürfen Videos abspielen"
    assert any(s and "/dach/singlecast" in s for s in before["src"])
    assert before["cams"] and all(c == "rgb(0, 0, 0)" for c in before["cams"]), f"leere Kamera-Rahmen müssen schwarz sein: {before['cams']}"
    for mode in ("app", "off", "app"):
        page.evaluate(f"document.getElementById('p').contentWindow.postMessage({{ cast: 'monitor', mode: '{mode}', vol: 100 }}, location.origin)")
        page.wait_for_timeout(1200)
    after = page.evaluate("""(() => { const pages = [...document.getElementById('p').contentDocument.querySelectorAll('.dach-page')];
        return { same: pages.length === window._pages.length && pages.every((f, i) => f === window._pages[i]),
                 writes: window._srcWrites, src: pages.map(f => f.getAttribute('src')), allow: pages.map(f => f.getAttribute('allow')) }; })()""")
    assert after["same"] and after["writes"] == 0 and after["src"] == before["src"], f"Ton umschalten darf keine DACH-Seite neu laden: {after}"
    assert after["allow"] == ["autoplay"] * 3
    assert errors == []


def test_series_cards_keep_their_own_map_results(server, browser):
    """Series scene: each map card shows its own result, the header shows the series total (2.2 had mixed them up)."""
    control, overlay = browser.new_page(), browser.new_page(viewport={"width": 1920, "height": 1080})
    errors = watch(control) + watch(overlay)
    control.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    control.wait_for_timeout(1200)
    overlay.goto(f"{BASE_URL}/series.html")
    overlay.wait_for_timeout(1000)
    control.evaluate("""(() => { Z.veto.steps = [
        { action: 'pick', team: 'a', map: 'Mirage', result: { a: 13, b: 7, status: 'done' } },
        { action: 'pick', team: 'b', map: 'Inferno', result: { a: 5, b: 13, status: 'done' } },
        { action: 'decider', map: 'Nuke', result: { a: 4, b: 2, status: 'running' } }]; send(); })()""")
    overlay.wait_for_timeout(900)
    control.evaluate("Z.texts.title = 'Nur ein anderer Text'; send()")             # any change that does not touch the maps
    overlay.wait_for_timeout(900)
    cards = overlay.evaluate("[...document.querySelectorAll('.series-card .series-score')].map(e => e.textContent.replace(/\\s/g, ''))")
    total = overlay.evaluate("document.querySelector('.series-total').textContent.replace(/\\s/g, '')")
    assert cards == ["13:7", "5:13", "4:2"], cards
    assert total == "1:1"
    assert errors == []


def test_long_team_names_switch_to_the_short_name(server, browser):
    """A team name that would shrink below 70 % shows the short name instead; without one it only shrinks."""
    control, overlay = browser.new_page(), browser.new_page(viewport={"width": 1920, "height": 1080})
    errors = watch(control) + watch(overlay)
    control.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    control.wait_for_timeout(1200)
    overlay.goto(f"{BASE_URL}/map-veto.html")
    overlay.wait_for_timeout(1000)
    names = "[...document.querySelectorAll('[data-matching] [data-team-name]')].map(e => e.textContent)"
    long_name = "Sehr Langer Teamname Esports Akademie Zwei"
    control.evaluate(f"Z.teams.a.name = {long_name!r}; Z.teams.a.short = ''; Z.teams.b.name = {long_name!r}; Z.teams.b.short = 'SLT'; send()")
    overlay.wait_for_timeout(900)
    assert overlay.evaluate(names)[:2] == [long_name, "SLT"]
    control.evaluate("Z.teams.a.name = 'BIG'; Z.teams.b.name = 'MOUZ'; send()")                # fits: full names again
    overlay.wait_for_timeout(900)
    assert overlay.evaluate(names)[:2] == ["BIG", "MOUZ"]
    assert errors == []


def test_a_won_map_is_offered_as_finished(server, browser):
    """13 rounds (or 16, 19 … in overtime) with two ahead: the series row offers „Map beenden?“."""
    page = browser.new_page()
    errors = watch(page)
    page.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    page.wait_for_timeout(1200)
    cases = page.evaluate("""[[13, 11], [13, 12], [12, 10], [16, 14], [16, 15], [19, 17], [17, 15], [22, 18], ['', 3]]
        .map(([a, b]) => mapDecided({ a, b }))""")
    assert cases == [True, False, False, True, False, True, False, True, False]
    page.evaluate("Z.veto.steps = [{ action: 'pick', team: 'a', map: 'Mirage', result: { a: 13, b: 4, status: 'running' } }]; seriesDraw()")
    assert page.evaluate("!document.querySelector('#series .map-finish').hidden")
    page.evaluate("document.querySelector('#series .map-finish').click()")
    assert page.evaluate("Z.veto.steps[0].result.status") == "done"
    assert errors == []


def test_map_veto_is_played_from_live_while_its_scene_runs(server, browser):
    """Scene „Map-Veto" in the program: the scene panel in Live shows the veto; a click there also shows under Match."""
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    errors = watch(page)
    page.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    page.wait_for_timeout(1200)
    page.evaluate("tabs('live'); Z.veto.steps = presetSteps('bo3'); sceneSwitch('intro')")
    page.wait_for_timeout(400)
    assert page.evaluate("$('sceneToolsVeto').hidden")
    page.evaluate("sceneSwitch('map-veto')")
    page.wait_for_timeout(400)
    assert page.evaluate("!$('sceneToolsVeto').hidden && !!$('sceneToolsVeto').offsetParent")
    first = page.evaluate("(() => { const b = document.querySelector('#vUpnextLive .map-buttons button'); b.click(); return b.textContent; })()")
    assert page.evaluate("Z.veto.steps[0].map") == first
    assert first in page.evaluate("$('vSteps').querySelector('select:nth-of-type(3)').value")
    assert first in page.inner_text("#vSummaryLive")
    page.evaluate("$('vBack').click()")                             # undo under Match → Live follows
    assert first not in page.inner_text("#vSummaryLive")
    page.evaluate("sceneSwitch('intro')")
    page.wait_for_timeout(400)
    assert page.evaluate("$('sceneToolsVeto').hidden")
    page.evaluate("$('panelFieldsButton').click()")                  # „Felder": Veto auch bei Intro zeigen
    page.evaluate("document.querySelector('#panelMenu [data-f=veto]').click()")
    assert not page.evaluate("$('sceneToolsVeto').hidden")
    assert page.evaluate("ui.panels.intro").count("veto") == 1
    page.evaluate("$('panelDefault').click()")                         # zurück auf die Vorgabe
    assert page.evaluate("$('sceneToolsVeto').hidden")
    assert errors == []


def test_scene_panel_shows_the_fields_of_each_scene(server, browser):
    """3.0: the panel follows the scene in the program – Ingame brings score and series, Intro the timer; the score
    buttons there count like the match bar, and a note stays per scene without ever reaching the stream."""
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    errors = watch(page)
    page.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    page.wait_for_timeout(1200)
    shown = "[...document.querySelectorAll('#panelFields [data-panel]')].filter(e => !e.hidden).map(e => e.dataset.panel)"
    page.evaluate("tabs('live'); sceneSwitch('ingame')")
    page.wait_for_timeout(400)
    assert page.evaluate(shown) == ["over", "score", "series", "note"]
    # „Über dem Spiel“: Scoreboard über dem Spielbild ein und wieder aus, ohne die Szene zu wechseln
    page.evaluate("document.querySelector('#pOver [data-over=scoreboard]').click()")
    assert page.evaluate("[Z.broadcast.scene, Z.broadcast.overGame.scene]") == ["ingame", "scoreboard"]
    assert page.evaluate("document.querySelector('#pOver [data-over=scoreboard]').getAttribute('aria-pressed')") == "true"
    page.evaluate("document.querySelector('#pOver [data-over=scoreboard]').click()")
    assert page.evaluate("Z.broadcast.overGame") is None
    before = page.evaluate("Z.teams.a.score || 0")
    page.evaluate("$('pPlusA').click()")
    assert page.evaluate("Z.teams.a.score") == before + 1
    assert page.text_content("#mbarScoreA") == page.inner_text("#pScoreA") == str(before + 1)
    page.fill("#pNote", "Timeout Team B noch 1x")
    page.evaluate("sceneSwitch('intro')")
    page.wait_for_timeout(400)
    assert page.evaluate(shown) == ["timer", "texts", "sponsor"]
    assert page.input_value("#pNote") == ""
    page.fill("[data-panel=texts] [data-field='texts.title']", "HALBFINALE")     # the same field under Setup follows
    assert page.evaluate("Z.texts.title") == "HALBFINALE"
    assert page.evaluate("[...document.querySelectorAll(\"[data-field='texts.title']\")].every(e => e.value === 'HALBFINALE')")
    page.evaluate("sceneSwitch('ingame')")
    page.wait_for_timeout(400)
    assert page.input_value("#pNote") == "Timeout Team B noch 1x"
    assert "Timeout" not in page.evaluate("JSON.stringify(Z)")
    assert errors == []


def test_ingame_button_opens_the_stats_over_the_game(server, browser):
    """2.14: while Ingame runs, a field below its button puts Scoreboard, Team A … over the game picture (no scene switch);
    without CS2 data the buttons of live scenes say so before you click."""
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    errors = watch(page)
    page.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    page.wait_for_timeout(1200)
    page.evaluate("Z.theme = 'regular'; everything(); tabs('live'); Z.broadcast.active = true; sceneArrange = false; "
                  "const c = sceneCfg(); c.on = true; ['ingame', 'scoreboard', 'h2h'].forEach(k => c.list[k].on = true); "
                  "liveLast = null; send(); sceneSwitch('intro')")
    page.wait_for_timeout(300)
    assert page.evaluate("document.querySelectorAll('#sceneButtons .scene-sub').length") == 0
    assert page.evaluate("document.querySelector('#sceneButtons [data-scene-def=scoreboard]').classList.contains('needs-data')")
    page.evaluate("document.querySelector('#sceneButtons [data-scene-def=scoreboard]').click()")     # without CS2 data: locked
    assert page.evaluate("Z.broadcast.scene") == "intro"
    page.evaluate("sceneSwitch('ingame')")
    page.wait_for_timeout(300)
    assert page.evaluate("[...document.querySelectorAll('#sceneButtons .scene-sub [data-over]')].map(b => b.dataset.over)") == \
        ["scoreboard", "team-a", "team-b", "h2h", "bracket", "series"]
    page.evaluate("document.querySelector('#sceneButtons .scene-sub [data-over=h2h]').click()")    # no CS2 data: locked
    assert page.evaluate("Z.broadcast.overGame") is None
    page.evaluate("document.querySelector('#sceneButtons .scene-sub [data-over=bracket]').click()")
    assert page.evaluate("[Z.broadcast.scene, Z.broadcast.overGame.scene]") == ["ingame", "bracket"]
    assert page.evaluate("document.querySelector('#sceneButtons .scene-sub [data-over=bracket]').classList.contains('on')")
    page.evaluate("document.querySelector('#sceneButtons .scene-sub [data-over=bracket]').click()")
    assert page.evaluate("Z.broadcast.overGame") is None
    page.evaluate("liveLast = { time: Date.now() }; scenesDraw()")                                  # CS2 data arrives
    page.evaluate("document.querySelector('#sceneButtons [data-scene-def=scoreboard]').click()")   # its own button switches
    assert page.evaluate("Z.broadcast.scene") == "scoreboard"
    assert errors == []


def test_sponsor_box_moves_between_bar_and_top_right(server, browser):
    """Sponsor in the bottom bar (default), top right on request; without a sponsor the bar closes the gap."""
    control, overlay = browser.new_page(), browser.new_page(viewport={"width": 1920, "height": 1080})
    errors = watch(control) + watch(overlay)
    control.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    control.wait_for_timeout(1200)
    overlay.goto(f"{BASE_URL}/intro.html")
    box = "(n => { const r = document.querySelector(n).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; })"
    places = {}
    for name, js in (("bar", "Z.sponsors.on = true; Z.sponsors.byTheme[Z.theme] = [{ name: 'Nordnet' }]; Z.sponsors.spot = 'bar'"),
                     ("top", "Z.sponsors.spot = 'top'"), ("none", "Z.sponsors.spot = 'bar'; Z.sponsors.on = false")):
        control.evaluate(js + "; send()")
        overlay.wait_for_timeout(900)
        places[name] = overlay.evaluate(f"[{box}('.sponsor.in-bar'), {box}('[data-part=timer]')]")
    assert places["bar"][0][1] > 800 and places["top"][0][1] < 300          # sponsor: bottom bar → top right
    assert places["top"][1][0] > places["bar"][1][0]                         # the bar moves to the middle without it
    assert places["none"][1] == places["top"][1]
    overlay.goto(f"{BASE_URL}/cast-duo-clips.html")                             # Clips: own layout, nothing moves
    control.evaluate("Z.sponsors.on = true; Z.sponsors.spot = 'top'; send()")
    overlay.wait_for_timeout(900)
    assert overlay.evaluate(f"{box}('[data-part=title]')") == [482, 47]
    assert errors == []


def test_matchday_loads_games_one_after_another(server, browser):
    """Spieltag: games from the tournament load as the current match; the result goes back into the tournament."""
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    errors = watch(page)
    page.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    page.wait_for_timeout(1200)
    page.evaluate("""(() => { const T = tour(); T.format = 'se'; T.gamesSource = ''; T.res = {};
      T.teams = ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((n, i) => ({ id: 't' + i, name: n, short: n.slice(0, 3), logo: '', players: ['a' + i, 'b' + i], faceitId: '' }));
      Z.matchday = { list: [], current: '' }; tournamentDraw(); window.confirmDialog = async () => true; })()""")
    page.evaluate("$('mdAddAllTour').click()")
    assert page.evaluate("Z.matchday.list.map(x => x.a.name + '-' + x.b.name)") == ["Alpha-Delta", "Bravo-Charlie"]
    page.evaluate("$('mdNext').click()")
    page.wait_for_timeout(300)
    assert page.evaluate("[Z.teams.a.name, Z.teams.b.name, Z.players.a.map(p => p.name).join()]") == ["Alpha", "Delta", "a0,b0"]
    page.evaluate("Z.teams.a.score = 2; Z.teams.b.score = 0; steps()[0].map = 'Nuke'; $('mdNext').click()")
    page.wait_for_timeout(300)
    assert page.evaluate("[Z.teams.a.name, Z.teams.a.score, steps().some(s => s.map)]") == ["Bravo", 0, False]
    assert page.evaluate("tour().res['W1-1']") == {"a": 2, "b": 0, "done": True}
    assert page.evaluate("Z.matchday.list.map(x => x.done)") == [True, False]
    assert errors == []


def test_corrected_faceit_results_stay(server, browser):
    """A FACEIT result changed by hand is marked as corrected and the next refresh keeps it."""
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    errors = watch(page)
    page.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    page.wait_for_timeout(1200)
    page.evaluate("""(() => { const T = tour(); T.format = 'import'; T.gamesSource = 'faceit';
      T.teams = [{ id: 'ta', name: 'Alpha', faceitId: 'fa', players: [] }, { id: 'tb', name: 'Bravo', faceitId: 'fb', players: [] }];
      T.games = [{ id: 'Fm1', round: 1, group: 0, a: 'ta', b: 'tb' }]; T.res = { Fm1: { a: 1, b: 0, done: true } };
      tournamentDraw(); tabs('tournament'); ui.below = Object.assign({}, ui.below, { tournament: 'games' }); belowApply(); })()""")
    page.fill("#tourTree input[data-s=a]", "0")
    page.fill("#tourTree input[data-s=b]", "1")
    page.evaluate("document.querySelector('#tourTree input[data-s=b]').dispatchEvent(new Event('change'))")
    assert page.evaluate("tour().res.Fm1.fixed") is True
    assert page.is_visible("#tourTree .tour-fixed")
    faceit = "[{ match_id: 'm1', status: 'FINISHED', teams: { faction1: { faction_id: 'fa' }, faction2: { faction_id: 'fb' } }, results: { score: { faction1: 1, faction2: 0 } } }]"
    page.evaluate(f"faceitResults(tour(), {faceit})")
    assert page.evaluate("[tour().res.Fm1.a, tour().res.Fm1.b]") == [0, 1]
    page.click("#tourTree .tour-fixed")                                          # back to FACEIT's value
    page.evaluate(f"faceitResults(tour(), {faceit})")
    assert page.evaluate("[tour().res.Fm1.a, tour().res.Fm1.b]") == [1, 0]
    assert errors == []


def test_team_intro_slides_switch_and_take_values_from_the_tournament(server, browser):
    """Teams scene: values come from the tournament; the slides switch by hand and run on automatically."""
    control, overlay = browser.new_page(), browser.new_page(viewport={"width": 1920, "height": 1080})
    errors = watch(control) + watch(overlay)
    control.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    control.wait_for_timeout(1200)
    control.evaluate("""(() => { Z.teams.a.name = 'Alpha'; Z.teams.b.name = 'Bravo'; Z.teamIntro = K.clone(K.DEFAULT.teamIntro);
      tour().teams = [{ id: 't1', name: 'Alpha', players: [], stats: { winrate: '64', matches: '12', series: '3', last: ['1', '0'] } },
                      { id: 't2', name: 'Bravo', players: [], stats: { winrate: '40', matches: '10', series: '0', last: [] } }];
      tiTake('a'); tiTake('b'); send(); })()""")
    assert control.evaluate("[Z.teamIntro.stats.a.seed, Z.teamIntro.stats.a.last, Z.teamIntro.stats.b.seed]") == ["1", "SN", "2"]
    overlay.goto(f"{BASE_URL}/teams.html")
    overlay.wait_for_timeout(1000)
    slide = "document.body.dataset.tislide"
    assert overlay.evaluate(slide) == "a"
    assert overlay.inner_text("[data-slide=a] [data-ti='a.winrate']") == "64 %"
    control.evaluate("tiShow('compare')")
    overlay.wait_for_timeout(700)
    assert overlay.evaluate(slide) == "compare"
    control.evaluate("Z.teamIntro.slides.b = false; tiAuto(8); Z.teamIntro.started = Date.now() - 16100; send()")   # step 2 of [a, compare] → a again (b is off)
    overlay.wait_for_timeout(900)
    assert overlay.evaluate(slide) == "a"
    # 2.16: own display name only in this scene, rows of the comparison on/off, „direct comparison" only with values
    control.evaluate("tiAuto(0); Z.teamIntro.names.a = 'NAVI'; Z.teamIntro.rows.matches = false; Z.teamIntro.h2h = { a: '2', b: '1' }; send(); tiShow('compare')")
    overlay.wait_for_timeout(900)
    assert overlay.inner_text("[data-slide=compare] .ti-name") .strip() == "NAVI"
    labels = overlay.evaluate("[...document.querySelectorAll('[data-ti-tape] .lab')].map(e => e.textContent)")
    assert "SPIELE" not in labels and labels[-1] == "DIREKTER VERGLEICH", labels
    assert control.evaluate("document.querySelector('#tiTabA').textContent") == "NAVI"
    assert errors == []


def test_faceit_swiss_is_told_apart_from_a_round_robin(server, browser):
    """Swiss pairs teams with the same record from round 2 on; a round robin does that only for about half the games."""
    page = browser.new_page()
    errors = watch(page)
    page.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    page.wait_for_timeout(1200)
    result = page.evaluate("""(() => {
      const ids = ['t1','t2','t3','t4','t5','t6','t7','t8'], won = (a, b) => ids.indexOf(a) < ids.indexOf(b);   // lower seed wins
      const play = (games, res, round, pairs) => pairs.forEach(([a, b], i) => { const id = round + '-' + i;
        games.push({ id, round, a, b }); res[id] = won(a, b) ? { a: 2, b: 0, done: true } : { a: 0, b: 2, done: true }; });
      // Swiss: Runde 1 gesetzt, danach gleiche Bilanz gegeneinander
      let g = [], r = {};
      play(g, r, 1, [['t1','t5'],['t2','t6'],['t3','t7'],['t4','t8']]);
      play(g, r, 2, [['t1','t2'],['t3','t4'],['t5','t6'],['t7','t8']]);
      play(g, r, 3, [['t1','t3'],['t2','t4'],['t5','t7'],['t6','t8']]);
      const swiss = faceitLooksSwiss(g, r, '');
      // jeder gegen jeden (Kreis-Verfahren)
      g = []; r = {}; const l = ids.slice();
      for (let round = 1; round < 8; round++) { const pairs = []; for (let i = 0; i < 4; i++) pairs.push([l[i], l[7 - i]]); play(g, r, round, pairs); l.splice(1, 0, l.pop()); }
      return [swiss, faceitLooksSwiss(g, r, ''), faceitLooksSwiss([], {}, 'SWISS')];
    })()""")
    assert result == [True, False, True]
    assert errors == []


def test_sponsor_lists_saved_by_2_2_still_load(server, browser):
    """2.2 kept the sponsor lists under „listen“ – sessions, backups and states from then load into „byTheme“."""
    page = browser.new_page()
    errors = watch(page)
    page.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    page.wait_for_timeout(1200)
    loaded = page.evaluate("""K.merge(K.clone(K.DEFAULT), { sponsors: { on: true, listen: { regular: [{ name: 'Alt', logo: '' }] } } }).sponsors""")
    assert loaded["byTheme"] == {"regular": [{"name": "Alt", "logo": ""}]} and "listen" not in loaded
    assert errors == []


def test_dach_cams_sit_under_the_page_and_never_show_the_previous_page(server, browser):
    """Order while switching: previous page (1) · cams (2) · new page (3); afterwards cams stay under the page,
    so its frame line and name tag lie on top and no hole ever shows the previous page."""
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    errors = watch(page)
    page.goto(f"{BASE_URL}/overlay.html?access={server.access_key}")
    page.wait_for_timeout(800)
    page.evaluate("""(() => { const z = JSON.parse(JSON.stringify(CastCore.DEFAULT)); z.theme = 'dachcs-official';
        z.broadcast.scene = 'dach-overview'; z.broadcast.active = true; z.broadcast.transition = 'fade'; z.broadcast.duration = 1500;
        z.revision = Date.now(); window._z = z; fetch('/api/state', { method: 'POST', body: JSON.stringify(z) }); })()""")
    page.wait_for_timeout(2500)
    page.evaluate("""(() => { const z = window._z; z.broadcast.scene = 'dach-duocast'; z.revision = Date.now();
        fetch('/api/state', { method: 'POST', body: JSON.stringify(z) }); })()""")
    order = "(() => { const z = e => +getComputedStyle(e).zIndex || 0, cams = z(document.querySelector('.dach-cams'));" \
            " return { cams, pages: [...document.querySelectorAll('.dach-page.on')].map(z).sort() }; })()"
    during = None
    for _ in range(60):                                         # catch the moment both pages are shown
        page.wait_for_timeout(50)
        state = page.evaluate(order)
        if len(state["pages"]) == 2:
            during = state
            break
    assert during and during["pages"][0] < during["cams"] < during["pages"][1], during
    page.wait_for_timeout(2000)
    after = page.evaluate(order)
    assert len(after["pages"]) == 1 and after["cams"] < after["pages"][0], after
    frames = page.evaluate("[...document.querySelectorAll('.dach-cam')].map(k => [k.dataset.source, k.style.left, k.style.width])")
    assert sorted(frames) == [["c1", "39px", "902px"], ["c2", "980px", "903px"]]
    assert errors == []


def test_app_settings_are_a_panel_with_all_sections(server, browser):
    """2.14: the settings open as a panel from the right (like before 2.6) – all sections one below the other, the chips
    on top jump to a section, the panel scrolls in a low window; the access keys of FACEIT and DACH CS live there."""
    page = browser.new_page(viewport={"width": 1200, "height": 600})
    errors = watch(page)
    page.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    page.wait_for_timeout(1200)
    page.evaluate("zoomSet(1)")                                                 # sizes below in page pixels
    page.click("#dialogOpen")
    page.wait_for_timeout(300)
    hidden = "[...document.querySelectorAll('.dialog-content > section')].filter(x => x.hidden).map(x => x.id)"
    assert page.evaluate(hidden) == []
    assert page.evaluate("!!$('faceitKey').offsetParent && !!$('dachKey').offsetParent && !!$('obsPort').offsetParent")
    box = page.evaluate("(() => { const r = document.querySelector('.dialog-box').getBoundingClientRect(); return [r.left, r.right, innerWidth]; })()")
    assert box[0] > 0 and abs(box[1] - box[2]) < 2, box                        # a panel on the right, not the whole page
    sizes = page.evaluate("(() => { const c = document.querySelector('.dialog-content'); return [c.scrollHeight, c.clientHeight, innerHeight]; })()")
    assert sizes[1] <= sizes[2] and sizes[0] > sizes[1], sizes                  # fits the window and scrolls
    page.click(".settings-nav [data-jump=updateArea]")
    page.wait_for_timeout(200)
    assert page.evaluate("document.querySelector('.settings-nav [data-jump=updateArea]').getAttribute('aria-current')") == "true"
    assert page.evaluate("(() => { const r = document.getElementById('updateSearch').getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; })()")
    page.keyboard.press("Escape")
    assert page.evaluate("$('appDialog').hidden")
    page.evaluate("tabs('match')")                                              # the pointer under Match leads there
    page.evaluate("document.querySelector('#faceitKeyHint [data-settings]').click()")
    page.wait_for_timeout(200)
    assert not page.evaluate("$('appDialog').hidden")
    assert page.evaluate("(() => { const r = $('faceitKey').getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; })()")
    assert errors == []


def test_css_variables_of_the_control_page_are_defined():
    """Every var(--name) the control page uses (also in JavaScript strings) is defined in its styles (or set from JS)."""
    web = Path(__file__).parent.parent / "web"
    files = [web / "control.html", web / "control.css", *sorted((web / "control").glob("*.js"))]
    text = "".join(f.read_text(encoding="utf-8") for f in files)
    used = set(re.findall(r"var\(--([a-z0-9-]+)", text))
    defined = set(re.findall(r"--([a-z0-9-]+)\s*:", text))
    defined |= set(re.findall(r"setProperty\([\"']--([a-z0-9-]+)", text))      # set from JavaScript
    assert not used - defined, f"nicht definiert: {sorted(used - defined)}"


def test_background_playlists_follow_the_scene(server, browser):
    """2.7: videos chosen up to 2.6 become the playlist „Standard"; each scene plays its playlist, the corner in Live
    changes it until the next scene switch, and a clip is sent once with its own id."""
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    errors = watch(page)
    page.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    page.wait_for_timeout(1200)
    page.evaluate("""Z.background.playlists = []; Z.background.videos = ['media/videos/a.mp4', 'media/videos/b.mp4']; everything()""")
    lists = page.evaluate("Z.background.playlists.map(p => [p.name, p.kind, p.videos.length, p.scenes.includes('pause'), p.scenes.includes('ingame')])")
    assert lists == [["Standard", "list", 2, True, False]]
    page.evaluate("""(() => { const p = { id: 'drone', name: 'Drohne', kind: 'loop', videos: ['media/videos/c.mp4', 'media/videos/d.mp4'],
        order: 'seq', transition: 'black', fade: 800, scenes: [] };
      const clips = { id: 'clips', name: 'Clips', kind: 'clips', videos: ['media/videos/e.mp4'], audio: true, scenes: [] };
      Z.background.playlists.push(p, clips); bgChosen = 'drone'; bgDraw(); })()""")
    page.evaluate("document.querySelector('#bgScenes .bg-scene').click()")         # first scene (Intro) → Drohne
    assert page.evaluate("Z.background.playlists[0].scenes.includes('intro')") is False
    page.evaluate("tabs('live'); sceneSwitch('intro')")
    page.wait_for_timeout(400)
    assert page.evaluate("[Z.background.videos, Z.background.play.transition]") == [["media/videos/c.mp4"], "black"]
    page.evaluate("sceneSwitch('pause')")
    page.wait_for_timeout(400)
    assert page.evaluate("Z.background.videos.length") == 2
    page.select_option("#bgCornerList", "drone")                                    # the corner: only until the next switch
    assert page.evaluate("Z.background.videos") == ["media/videos/c.mp4"]
    page.evaluate("sceneSwitch('end'); sceneSwitch('pause')")
    page.wait_for_timeout(400)
    assert page.evaluate("Z.background.videos.length") == 2
    page.evaluate("$('bgClipPlay').click()")
    clip = page.evaluate("Z.background.clip")
    assert clip["videos"] == ["media/videos/e.mp4"] and clip["audio"] is True and clip["id"] > 0
    assert errors == []


def test_timer_shows_its_text_and_switches_the_scene_at_zero(server, browser):
    """2.8: at 0:00 the overlay shows the chosen text instead of „00:00" and the control page switches the scene once."""
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    errors = watch(page)
    page.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    page.wait_for_timeout(1200)
    page.evaluate("tabs('live'); sceneSwitch('intro')")
    page.evaluate("Z.timer.end = { text: 'GLEICH GEHT LOS', scene: 'cast-duo' }; timerEndDraw(); Z.timer.running = true; Z.timer.target = Date.now() + 800; send()")
    page.wait_for_timeout(2200)
    assert page.evaluate("Z.broadcast.scene") == "cast-duo"
    page.evaluate("sceneSwitch('intro')")                                # only once – going back stays
    page.wait_for_timeout(1200)
    assert page.evaluate("Z.broadcast.scene") == "intro"
    overlay = browser.new_page(viewport={"width": 1920, "height": 1080})
    overlay_errors = watch(overlay)
    overlay.goto(f"{BASE_URL}/intro.html?access={server.access_key}")
    overlay.wait_for_timeout(1500)
    assert "GLEICH GEHT LOS" in overlay.inner_text(".timer")
    assert errors == [] and overlay_errors == []


def test_team_library_saves_and_loads_a_team_with_its_players(server, browser):
    """2.8: a team saved to the library (name, logo, players) comes back as team B – the score of the match stays."""
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    errors = watch(page)
    page.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    page.wait_for_timeout(1200)
    page.evaluate("Z.teams.a.name = 'Bravo Esports'; Z.teams.a.short = 'BRV'; Z.players.a = [{ name: 'p1' }, { name: 'p2' }]; Z.teams.b.score = 1")
    page.evaluate("teamLibSave('a')")
    page.wait_for_timeout(400)
    assert page.evaluate("[...$('teamLib').options].map(o => o.value)") == ["Bravo Esports"]
    page.evaluate("teamLibLoad('b')")
    page.wait_for_timeout(400)
    assert page.evaluate("[Z.teams.b.name, Z.teams.b.short, Z.teams.b.score, Z.players.b.length]") == ["Bravo Esports", "BRV", 1, 2]
    assert errors == []


def test_studio_mode_picks_first_and_takes_with_transition(server, browser):
    """Studio mode (like OBS): a click only puts the scene into the preview, „Übergang“ takes it live,
    and the previous program scene then waits in the preview. Off again = direct switching."""
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    errors = watch(page)
    page.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    page.wait_for_timeout(1200)
    page.evaluate("Z.theme = 'regular'; everything(); send(); tabs('live'); sceneSwitch('intro'); $('studioButton').click()")
    page.wait_for_timeout(1500)
    assert not page.evaluate("$('studioSide').hidden")
    page.evaluate("document.querySelector(\"#sceneButtons [data-scene-def='cast-duo']\").click()")
    page.wait_for_timeout(800)
    assert page.evaluate("[Z.broadcast.scene, studioNext]") == ["intro", "cast-duo"]
    assert page.evaluate("$('studioFrame').contentDocument.body.dataset.currentscene") == "cast-duo"   # Vorschau zeigt sie
    page.evaluate("$('studioTake').click()")
    page.wait_for_timeout(800)
    assert page.evaluate("[Z.broadcast.scene, studioNext]") == ["cast-duo", "intro"]
    page.evaluate("$('studioButton').click(); document.querySelector(\"#sceneButtons [data-scene-def='pause']\").click()")
    assert page.evaluate("[Z.broadcast.scene, $('studioSide').hidden]") == ["pause", True]
    # DACH CS – Offiziell: dieselbe Bedienung mit den DACH-Szenen
    page.evaluate("Z.theme = 'dachcs-official'; everything(); dachSwitch('dach-overview'); send(); $('studioButton').click()")
    page.wait_for_timeout(800)
    page.evaluate("document.querySelector(\"#sceneButtons [data-scene-def='dach-pause']\").click()")
    assert page.evaluate("[Z.broadcast.scene, studioNext, $('studioName').textContent]") == ["dach-overview", "dach-pause", "Pausescreen"]
    page.evaluate("$('studioTake').click()")
    assert page.evaluate("[Z.broadcast.scene, Z.dach.scene, studioNext]") == ["dach-pause", "dach-pause", "dach-overview"]
    page.evaluate("ui.studio = false; uiSave(); Z.theme = 'regular'; everything(); send()")
    assert errors == []


def test_a_workshop_map_lands_under_more_maps(server, browser):
    """2.15: a map from the Steam Workshop (Steam faked here) arrives with its picture under „Weitere Maps“ – the
    active pool stays as it is. Up to 2.14 the picture (a data: URL) could not be read on the page and nothing came."""
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    errors = watch(page)
    png = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
    page.route("**/api/workshop?**", lambda route: route.fulfill(
        status=200, content_type="application/json", body='{"id": "3070284539", "title": "de_thera", "image": "%s"}' % png))
    page.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    page.wait_for_timeout(1200)
    active = page.evaluate("Z.mapPool.filter(m => m.active !== false).map(m => m.name)")
    page.evaluate("tabs('match')")
    page.evaluate("$('poolWorkshop').value = 'https://steamcommunity.com/sharedfiles/filedetails/?id=3070284539'")
    page.evaluate("$('poolWorkshopGo').click()")
    for _ in range(40):
        if page.evaluate("Z.mapPool.some(m => m.name === 'de_thera')"):
            break
        page.wait_for_timeout(100)
    added = page.evaluate("Z.mapPool.find(m => m.name === 'de_thera')")
    assert added and added["active"] is False and added["image"], page.inner_text("#poolWorkshopStatus")
    assert page.evaluate("Z.mapPool.filter(m => m.active !== false).map(m => m.name)") == active
    page.evaluate("$('poolPlus').click()")
    assert page.evaluate("Z.mapPool[Z.mapPool.length - 1].active") is False
    assert errors == []


def test_one_group_of_the_table_from_the_scene_panel(server, browser):
    """2.15: with groups (table), the panel of the Bracket scene offers All · Group A · Group B – the scene stays and the
    overlay shows only that group. DACH CS – Official: scenes that need a match say so until „match entered“ is on."""
    control, overlay = browser.new_page(viewport={"width": 1600, "height": 1000}), browser.new_page(viewport={"width": 1920, "height": 1080})
    errors = watch(control) + watch(overlay)
    control.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    overlay.goto(f"{BASE_URL}/overlay.html?access={server.access_key}")
    control.wait_for_timeout(1200)
    control.evaluate("""Z.theme = 'regular'; everything(); tabs('live'); Z.broadcast.active = true; sceneCfg().on = true;
      Z.tournament = { format: 'table', groupsCount: 2, teams: [1, 2, 3, 4, 5, 6, 7, 8].map(i => ({ id: 't' + i, name: 'Team ' + i })) };
      send(); sceneSwitch('bracket')""")
    control.wait_for_timeout(500)
    buttons = control.evaluate("[...document.querySelectorAll('#pGroup [data-group]')].map(b => b.textContent)")
    assert len(buttons) == 3 and buttons[0] == "Alle", buttons
    control.evaluate("document.querySelectorAll('#pGroup [data-group]')[2].click()")
    assert control.evaluate("[Z.broadcast.scene, Z.tournament.showGroup]") == ["bracket", "1"]
    overlay.wait_for_timeout(1500)
    assert overlay.evaluate("document.querySelectorAll('.layer:last-child .bracket-tab').length") == 1
    # DACH CS – Offiziell: the server asks DACH CS itself whether a match is active (the page then only shows
    # „Du hast kein aktives Match eingetragen …“) – without one, the scenes that need a match are locked
    pages = {"text": "<html><body>Du hast kein aktives Match eingetragen. Bitte aktiviere ein Match im Userbereich</body></html>"}

    class Answer:
        def __init__(self, request):
            assert request.full_url.startswith("https://user.dachcs.de/castingoverlay/lineup.php?")
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def read(self, limit): return pages["text"].encode()

    server.dach_match = dach_match.MatchCheck(opener=lambda request, timeout: Answer(request))
    server.secrets.set(secret_store.DACH_USER_ID, "123")
    server.secrets.set(secret_store.DACH_KEY, "abcde-12345")
    try:
        control.evaluate("Z.theme = 'dachcs-official'; Z.dach = Object.assign({}, Z.dach, { match: null }); everything(); send(); scenesDraw(); dachMatchCheck(true)")
        control.wait_for_timeout(500)
        locked = "document.querySelector('#sceneButtons [data-scene-def=dach-table]').getAttribute('aria-disabled')"
        assert control.evaluate("Z.dach.match") is False and control.evaluate(locked) == "true"
        control.evaluate("document.querySelector('#sceneButtons [data-scene-def=dach-table]').click()")
        assert control.evaluate("Z.broadcast.scene") != "dach-table"                 # locked: no switch
        pages["text"] = "<html><body><div class='team'>Team A</div></body></html>"
        server.dach_match = dach_match.MatchCheck(opener=lambda request, timeout: Answer(request))
        control.evaluate("dachMatchCheck(true)")
        control.wait_for_timeout(500)
        assert control.evaluate("Z.dach.match") is True and control.evaluate(locked) is None
        assert "Match bei DACH CS aktiv" in control.evaluate("document.querySelector('#sceneButtons .dach-match').textContent")
    finally:
        server.secrets.delete(secret_store.DACH_USER_ID)
        server.secrets.delete(secret_store.DACH_KEY)
        server.dach_match = dach_match.MatchCheck()
    control.evaluate("Z.theme = 'regular'; Z.dach = Object.assign({}, Z.dach, { match: null }); everything(); send()")
    assert errors == []


def test_areas_stack_below_the_preview(server, browser):
    """2.15: under the preview an area can go above or below another one (drag onto its upper/lower quarter in
    „Layout bearbeiten“) – the stack is kept after a reload and comes apart again when one leaves."""
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    errors = watch(page)
    page.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    page.wait_for_timeout(1200)
    page.evaluate("zoomSet(1); tabs('live'); arrangementApply({ dock: { bottom: ['sceneList', 'audio'], right: [] }, hU: 420 }); layoutEdit(true)")
    page.wait_for_timeout(300)

    def drag(source, target, fy):
        s = page.locator(source).bounding_box()
        page.mouse.move(s["x"] + 40, s["y"] + s["height"] / 2)
        page.mouse.down()
        page.mouse.move(s["x"] + 60, s["y"] + s["height"] / 2 + 20, steps=4)
        t = page.locator(target).bounding_box()                    # (measured while dragging – the others make room)
        page.mouse.move(t["x"] + t["width"] / 2, t["y"] + t["height"] * fy, steps=8)
        hint = page.evaluate("document.querySelector('.tab-target').hidden ? '' : document.querySelector('.tab-target').textContent")
        page.mouse.up()
        page.wait_for_timeout(200)
        return hint

    hint = drag("[data-area=audio] > summary", "[data-area=sceneList]", 0.9)
    assert hint.startswith("Darunter"), (hint, errors)
    assert page.evaluate("ui.dock.bottom") == [{"stack": ["sceneList", "audio"]}]
    assert page.evaluate("document.querySelector('#dockBottom > .dock-stack > [data-area=audio]') !== null")
    page.reload()
    page.wait_for_timeout(1200)
    assert page.evaluate("[...document.querySelectorAll('#dockBottom > .dock-stack > details')].map(d => d.dataset.area)") == ["sceneList", "audio"]
    page.evaluate("dockPanel(document.querySelector('[data-area=audio]'), 'left')")
    assert page.evaluate("ui.dock.bottom") == ["sceneList"] and not page.evaluate("document.querySelector('.dock-stack')")
    page.evaluate("layoutEdit(false); workspaceChoose('Operator')")
    assert errors == []


FAKE_OBS = """window.obsCalls = []; window.obsItemOn = true; window.obsFilter = false;
channel.obs = { isOpen: true, request: () => true, send: () => true, onBrowsersources: () => true,
  question: async (type, data) => {
    obsCalls.push([type, data]);
    if (type === 'GetSceneItemId') return { sceneItemId: 7 };
    if (type === 'GetSceneItemEnabled') return { sceneItemEnabled: obsItemOn };
    if (type === 'SetSceneItemEnabled') { obsItemOn = data.sceneItemEnabled; return {}; }
    if (type === 'GetSourceFilter') { if (!obsFilter) throw new Error('No source filter was found'); return { filterSettings: {} }; }
    if (type === 'CreateSourceFilter') { obsFilter = true; return {}; }
    return {};
  } };"""


# only the requests of the background fade (other parts of the page talk to OBS at the same time)
FADE_CALLS = """obsCalls.filter(c => /SceneItemEnabled$|SourceFilter/.test(c[0]))
  .map(c => [c[0], c[1].filterSettings ? c[1].filterSettings.opacity : c[1].sceneItemEnabled])"""


def test_obs_background_fades_into_and_out_of_ingame(server, browser):
    """When OBS plays the background video, the switch to Ingame fades the source „Cast – Hintergrund“ out via
    the opacity filter „Cast – Blende“ (then hides it); leaving Ingame shows it at 0 % and fades it in."""
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    errors = watch(page)
    page.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    page.wait_for_timeout(1200)
    page.evaluate("Z.theme = 'regular'; Z.background.source = 'obs'; Z.broadcast.transition = 'fade'; "
                  "Z.broadcast.duration = 600; everything(); send(); sceneSwitch('intro');")
    page.wait_for_timeout(300)
    page.evaluate(FAKE_OBS + "bgFilterReady = false; bgOpacity = 1; sceneSwitch('ingame');")
    page.wait_for_timeout(1200)
    calls = page.evaluate(FADE_CALLS)
    kinds = [kind for kind, _ in calls]
    assert "CreateSourceFilter" in kinds
    opacities = [value for kind, value in calls if kind == "SetSourceFilterSettings"]
    assert len(opacities) >= 5, opacities                         # in steps, not a cut
    assert opacities[:-1] == sorted(opacities[:-1], reverse=True) and opacities[-2] == 0
    hide = kinds.index("SetSceneItemEnabled")
    assert calls[hide][1] is False and kinds[hide + 1:] == ["SetSourceFilterSettings"] and opacities[-1] == 1
    # back out of Ingame: enabled at 0 %, then fading in to 100 %
    page.evaluate("obsCalls.length = 0; sceneSwitch('cast-duo');")
    page.wait_for_timeout(1200)
    calls = page.evaluate(FADE_CALLS)
    kinds = [kind for kind, _ in calls]
    show = kinds.index("SetSceneItemEnabled")
    assert calls[show][1] is True and calls[show - 1] == ["SetSourceFilterSettings", 0]
    opacities = [value for kind, value in calls[show + 1:] if kind == "SetSourceFilterSettings"]
    assert len(opacities) >= 5 and opacities == sorted(opacities) and opacities[-1] == 1
    # a cut hides at once, without fading
    page.evaluate("obsCalls.length = 0; Z.broadcast.transition = 'cut'; sceneSwitch('ingame');")
    page.wait_for_timeout(500)
    kinds = [kind for kind, _ in page.evaluate(FADE_CALLS)]
    assert "SetSceneItemEnabled" in kinds and kinds.count("SetSourceFilterSettings") == 1
    # hidden = paused (saves decoding); DACH CS – Offiziell has its own backgrounds: the video is hidden there too
    media = "obsCalls.filter(c => c[0] === 'TriggerMediaInputAction').map(c => c[1].mediaAction.split('_').pop())"
    assert page.evaluate(media) == ["PAUSE"]
    page.evaluate("obsCalls.length = 0; sceneSwitch('intro');")
    page.wait_for_timeout(300)
    assert page.evaluate(media) == ["PLAY"] and page.evaluate("obsItemOn") is True
    page.evaluate("obsCalls.length = 0; themeChoose('dachcs-official');")
    page.wait_for_timeout(300)
    assert page.evaluate(media) == ["PAUSE"] and page.evaluate("obsItemOn") is False
    page.evaluate("themeChoose('regular');")
    page.wait_for_timeout(300)
    assert page.evaluate("obsItemOn") is True
    page.evaluate("Z.background.source = 'overlay'; Z.broadcast.transition = 'fade'; send()")
    assert errors == []


def test_background_video_runs_in_step_with_obs(server, browser):
    """The preview shows the same moment of a looping background video as the program: from the start of the
    playlist (play.since) – and, when OBS plays the video, from the position OBS reports (bg-sync)."""
    import subprocess
    from casting_app.server.media_converter import find_ffmpeg
    video = server.folders.videos / "sync-test.webm"
    if not video.is_file():
        subprocess.run([find_ffmpeg(), "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=25", "-t", "20",
                        "-c:v", "libvpx-vp9", "-b:v", "200k", "-deadline", "realtime", str(video)], check=True)
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    errors = watch(page)
    page.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    page.wait_for_timeout(1200)
    page.evaluate("""Z.theme = 'regular'; Z.background.source = 'overlay'; Z.broadcast.transition = 'cut';
      Z.background.playlists = [{ id: 'ps', name: 'S', kind: 'loop', videos: ['media/videos/sync-test.webm'], order: 'seq',
        transition: 'cut', fade: 0, scenes: ['intro', 'pause'] }];
      everything(); sceneSwitch('intro'); Z.background.play.since = Date.now() - 7000; send();""")
    position = "(() => { const v = $('frame').contentDocument.querySelector('.backdrop video.on'); return v ? v.currentTime : -1; })()"
    page.wait_for_timeout(5500)                                    # started at 0, the next check moves it to ~7 s + 5 s
    assert 10.5 < page.evaluate(position) < 14.5, page.evaluate(position)
    # OBS plays the video: the control page passes on its position, the preview jumps there
    page.evaluate("Z.background.source = 'obs'; send(); "
                  "$('frame').contentWindow.postMessage({ cast: 'bg-sync', cursor: 3000, at: Date.now() }, location.origin)")
    page.wait_for_timeout(400)
    assert 2.8 < page.evaluate(position) < 4.5, page.evaluate(position)
    page.evaluate("Z.background.source = 'overlay'; Z.background.playlists = []; bgApply('intro'); send()")
    assert errors == []


def test_audio_rows_show_live_levels_from_obs(server, browser):
    """Audio like the OBS mixer: compact rows, a level meter fed by InputVolumeMeters (−60 … 0 dB), monitoring under „More“."""
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    errors = watch(page)
    page.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    page.wait_for_timeout(1200)
    page.evaluate("""tabs('live'); document.querySelectorAll('[data-area=audio]').forEach(x => x.open = true);
      channel.obs = { isOpen: true, request: () => true, send: () => true, onBrowsersources: () => true,
        question: async (t, d) => t === 'GetInputList' ? { inputs: [{ inputName: 'Mikrofon' }] }
          : t === 'GetInputVolume' ? { inputVolumeMul: 1 } : t === 'GetInputMute' ? { inputMuted: false }
          : t === 'GetInputAudioSyncOffset' ? { inputAudioSyncOffset: 0 }
          : t === 'GetInputAudioMonitorType' ? { monitorType: 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT' } : {} };
      audioInputs = []; audioFetch();""")
    page.wait_for_timeout(800)
    row = "#audioList .audio-z"
    assert page.evaluate(f"!!document.querySelector('{row} .audio-listen')")             # monitoring on: headphones
    assert not page.evaluate(f"document.querySelector('{row} .audio-monitor-choice').offsetParent")   # hidden until „More“
    page.evaluate("audioMeters([{ inputName: 'Mikrofon', inputLevelsMul: [[0.1, 0.5, 0.5]] }])")      # −20 dB, peak −6 dB
    page.wait_for_timeout(200)
    cover, peak = page.evaluate(f"[...document.querySelectorAll('{row} .audio-meter i')].map(i => i.style.transform)")
    assert cover == "scaleX(0.333)" and peak.startswith("translateX(90")
    assert errors == []


def test_dach_frames_take_any_source_and_a_video(server, browser):
    """DACH CS – official: each frame can show another source (e.g. the guest in the big frame of the interaction page),
    and a source can be an own video from the videos folder (e.g. the own content break)."""
    import subprocess
    from casting_app.server.media_converter import find_ffmpeg
    video = server.folders.videos / "sync-test.webm"
    if not video.is_file():
        subprocess.run([find_ffmpeg(), "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=25", "-t", "20",
                        "-c:v", "libvpx-vp9", "-b:v", "200k", "-deadline", "realtime", str(video)], check=True)
    control, overlay = browser.new_page(viewport={"width": 1600, "height": 1000}), browser.new_page(viewport={"width": 1920, "height": 1080})
    errors = watch(control) + watch(overlay)
    control.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    overlay.goto(f"{BASE_URL}/overlay.html?access={server.access_key}")
    control.wait_for_timeout(1200)
    control.evaluate("""Z.theme = 'dachcs-official'; Z.broadcast.active = true; everything();
      Z.sources.guest = { type: 'video', video: 'media/videos/sync-test.webm', loop: true, audio: false };
      Z.dachFrame = { duointeraction: { content: { src: 'guest' } } }; dachSwitch('dach-inter2'); send();""")
    overlay.wait_for_timeout(2500)
    cams = overlay.evaluate("""[...document.querySelectorAll('.dach-cams .dach-cam')].map(k => [k.dataset.source, k.style.left, k.style.top,
      !!k.querySelector('video')])""")
    assert ["guest", "600px", "40px", True] in cams and not any(c[0] == "content" for c in cams), cams
    control.evaluate("tabs('setup'); dframeDraw();")
    assert control.evaluate("[...document.querySelectorAll('#dframeFields [data-src]')].length") >= 1
    control.evaluate("Z.theme = 'regular'; Z.dachFrame = {}; Z.sources.guest = { type: 'empty' }; everything(); send()")
    assert errors == []


def test_ads_play_all_or_one_and_go_back_afterwards(server, browser):
    """Ads: „All“ switches to the scene „Werbung“ and plays the ad videos with the label; at the end the last frame stays
    and after the set seconds the app goes back to the scene it came from („Stay“ would keep it)."""
    import subprocess
    from casting_app.server.media_converter import find_ffmpeg
    for name, source in (("ad-a.webm", "testsrc2"), ("ad-b.webm", "smptebars")):
        if not (server.folders.videos / name).is_file():
            subprocess.run([find_ffmpeg(), "-v", "error", "-y", "-f", "lavfi", "-i", f"{source}=size=320x180:rate=25", "-t", "1.5",
                            "-c:v", "libvpx-vp9", "-b:v", "200k", "-deadline", "realtime", str(server.folders.videos / name)], check=True)
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    errors = watch(page)
    page.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    page.wait_for_timeout(1200)
    page.evaluate("""Z.theme = 'regular'; Z.broadcast.transition = 'cut'; everything(); sceneSwitch('pause');
      Z.ads = { videos: ['media/videos/ad-a.webm', 'media/videos/ad-b.webm'], badge: true, back: 2, play: null }; send(); tabs('live'); panelValues();""")
    page.wait_for_timeout(500)
    assert page.evaluate("[...document.querySelectorAll('#pAds [data-ads]')].map(b => b.textContent.trim())") == ["Alle (2)", "ad-a", "ad-b"]
    page.evaluate("everything()")                                # loaded state (e.g. after a restart) shows the ticks in Setup
    page.wait_for_timeout(300)
    assert page.evaluate("[...document.querySelectorAll('#adVideos input:checked')].length") == 2
    page.evaluate("document.querySelector('#pAds [data-ads=all]').click()")
    page.wait_for_timeout(1200)
    assert page.evaluate("[Z.broadcast.scene, Z.ads.play.from, Z.ads.play.list.length]") == ["ads", "pause", 2]
    frame = "$('frame').contentDocument"
    assert page.evaluate(f"{frame}.querySelector('.ads-label').textContent") == "WERBUNG"
    assert page.evaluate(f"!!{frame}.querySelector('.ads-stage video')")
    for _ in range(100):                                       # both videos (2 × 1.5 s), then 2 s until going back – slow under load
        if page.evaluate("Z.broadcast.scene") != "ads":
            break
        page.wait_for_timeout(250)
    assert page.evaluate("[Z.broadcast.scene, Z.ads.play]") == ["pause", None]
    # a single ad, then „Stay“: remains in the scene
    page.evaluate("document.querySelector('#pAds [data-ads=\"1\"]').click()")
    for _ in range(75):
        if page.evaluate("!!document.querySelector('#pAds [data-ads-stay]')"):
            break
        page.wait_for_timeout(200)
    page.evaluate("document.querySelector('#pAds [data-ads-stay]').click()")
    page.wait_for_timeout(2500)
    assert page.evaluate("Z.broadcast.scene") == "ads"
    page.evaluate("document.querySelector('#pAds [data-ads-stop]').click()")
    assert page.evaluate("Z.broadcast.scene") == "pause"
    page.evaluate("Z.ads = { videos: [], badge: true, back: 10, play: null }; send()")
    assert errors == []


def test_videos_can_be_limited_per_theme(server, browser):
    """Videos per theme: marking videos with „Theme“ limits the choice in this theme (ads list, source „Video“);
    another theme without marks still offers all videos."""
    import subprocess
    from casting_app.server.media_converter import find_ffmpeg
    for name in ("ad-a.webm", "ad-b.webm"):
        if not (server.folders.videos / name).is_file():
            subprocess.run([find_ffmpeg(), "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=25", "-t", "1.5",
                            "-c:v", "libvpx-vp9", "-b:v", "200k", "-deadline", "realtime", str(server.folders.videos / name)], check=True)
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    errors = watch(page)
    page.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    page.wait_for_timeout(1200)
    page.evaluate("themeChoose('esea'); Z.themeVideos = {}; send(); tabs('setup'); videoInfoDraw(); adsLibrary = null; adsSetupDraw();")
    page.wait_for_timeout(800)
    ads_offered = "[...document.querySelectorAll('#adVideos .vid-row b')].map(b => b.textContent)"
    assert {"ad-a", "ad-b"} <= set(page.evaluate(ads_offered))
    page.evaluate("[...document.querySelectorAll('#videoInfo .vid-row')].find(r => r.textContent.includes('ad-a.webm')).querySelector('.vid-theme-chip').click()")
    page.wait_for_timeout(500)
    assert page.evaluate("Z.themeVideos.esea") == ["ad-a.webm"]
    assert page.evaluate(ads_offered) == ["ad-a"]
    assert page.evaluate("themeVideoFilter(['ad-a.webm', 'ad-b.webm'])") == ["ad-a.webm"]
    page.evaluate("themeChoose('regular')")
    page.wait_for_timeout(300)
    assert page.evaluate("themeVideoFilter(['ad-a.webm', 'ad-b.webm'])") == ["ad-a.webm", "ad-b.webm"]
    page.evaluate("Z.themeVideos = {}; send()")
    assert errors == []
