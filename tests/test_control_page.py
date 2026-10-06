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
    """Scene „Map-Veto" in the program: Live → „Zur Szene" shows the veto; a click there also shows under Match."""
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
    page.evaluate("$('sceneToolsVetoShow').click()")
    assert not page.evaluate("$('sceneToolsVeto').hidden")
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


def test_app_settings_scroll_down_to_update_on_a_small_window(server, browser):
    """2.3.0: the settings did not scroll – on a low window Update and the last sections were out of reach."""
    page = browser.new_page(viewport={"width": 1200, "height": 600})
    errors = watch(page)
    page.goto(f"{BASE_URL}/control.html?access={server.access_key}")
    page.wait_for_timeout(1200)
    page.click("#dialogOpen")
    page.wait_for_timeout(300)
    sizes = page.evaluate("(() => { const c = document.querySelector('.dialog-content'); return [c.scrollHeight, c.clientHeight, innerHeight]; })()")
    assert sizes[1] <= sizes[2] and sizes[0] > sizes[1], sizes                  # fits the window and scrolls
    page.click(".settings-nav [data-jump=setMusic]")                           # the last section
    page.wait_for_timeout(900)
    assert page.evaluate("(() => { const r = document.querySelector('#setMusic [data-field=\\'music.address\\']').getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; })()")
    page.click(".settings-nav [data-jump=updateArea]")
    page.wait_for_timeout(900)
    assert page.evaluate("(() => { const r = document.getElementById('updateSearch').getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; })()")
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
