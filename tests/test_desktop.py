"""Tests for the desktop app: window, close question, tray behaviour, single instance,
app-window audio and secrets. Runs the real app in-process (pytest-qt).

    pytest tests/test_desktop.py          (Linux without a screen: xvfb-run -a pytest …)

No other Casting-App may run on this PC during the test.
"""

import itertools
import json
import os
import ssl
import subprocess
import sys
import tempfile
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest
from conftest import MEMORY_KEYRING, TEST_HOME
from PySide6.QtWidgets import QApplication

from casting_app import instance
from casting_app.app_log import AppLog
from casting_app.desktop import app as desktop_app
from casting_app.paths import DATA_DIR

ROOT = Path(__file__).resolve().parent.parent
_RESULT_NUMBERS = itertools.count(1)
CLOSE_BUTTONS = "[...document.querySelectorAll('.frage:not(#frage) button')].map(b => b.textContent)"


@pytest.fixture(scope="session")
def qapp_args():
    # only for the test: accept the self-made certificate of the HTTPS test page
    os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = "--ignore-certificate-errors"
    desktop_app.prepare_qt()
    return [sys.argv[0]]


@pytest.fixture(scope="module")
def desktop(qapp):
    assert instance.running_version() is None, "Bitte vorher jede laufende Casting-App beenden"
    app = desktop_app.start_desktop_app(qapp, AppLog(DATA_DIR / "log.txt"))
    yield app
    if not app._quitting:
        app.quit("Testende")


def run_js(qtbot, target, code: str, world=0):
    """Run JavaScript in a page or frame and wait for the result."""
    box = {}
    wrapped = f"Promise.resolve(({code})).then(r => JSON.stringify(r === undefined ? null : r))"
    # Qt does not wait for promises: store the result in the page and poll it
    key = f"__test_result_{next(_RESULT_NUMBERS)}"
    target.runJavaScript(f"{wrapped}.then(t => window['{key}'] = t)", world)
    def done():
        target.runJavaScript(f"window['{key}']", world, lambda result: box.update(result=result) if isinstance(result, str) and result else None)
        return "result" in box
    qtbot.waitUntil(done, timeout=10_000)
    return json.loads(box["result"])


def wait_for_page(qtbot, desktop):
    page = desktop.window.page
    qtbot.waitUntil(lambda: run_js(qtbot, page, "!!(window.castApp && document.querySelector('#beendenKnopf'))") is True,
                    timeout=30_000)
    return page


def ping() -> dict | None:
    try:
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(
                urllib.request.Request("http://127.0.0.1:8787/api/ping", headers={"Host": "localhost:8787"}), timeout=2) as answer:
            return json.loads(answer.read())
    except OSError:
        return None


def test_window_shows_control_page(qtbot, desktop):
    page = wait_for_page(qtbot, desktop)
    assert desktop.window.isVisible()
    assert page.url().toString() == "http://localhost:8787/steuerung.html"
    assert ping()["version"] == "2.0.0"
    # the connection to Python is invisible to the page (isolated world)
    assert run_js(qtbot, page, "typeof window.qt + ' ' + typeof window.castAppSend") == "undefined undefined"


def test_close_asks_first_and_cancel_keeps_window(qtbot, desktop):
    page = wait_for_page(qtbot, desktop)
    desktop.window.close()                                    # like clicking X
    qtbot.wait(200)
    assert desktop.window.isVisible(), "das Fenster muss offen bleiben, solange gefragt wird"
    assert run_js(qtbot, page, CLOSE_BUTTONS) == ["Ganz beenden", "Nur Fenster schließen", "Abbrechen"]
    desktop.window.close()                                    # second click: still one dialog
    qtbot.wait(200)
    assert len(run_js(qtbot, page, CLOSE_BUTTONS)) == 3
    run_js(qtbot, page, "document.querySelector('.frage:not(#frage) [data-w=\"\"]').click()")
    qtbot.wait(1300)                                          # longer than the system-dialog fallback
    assert desktop.window.isVisible()
    assert QApplication.activeModalWidget() is None, "nach Abbrechen darf kein Systemdialog kommen"
    assert run_js(qtbot, page, CLOSE_BUTTONS) == []


def test_power_button_opens_same_dialog_and_hide_keeps_server(qtbot, desktop):
    page = wait_for_page(qtbot, desktop)
    run_js(qtbot, page, "document.getElementById('beendenKnopf').click()")
    qtbot.wait(150)
    assert len(run_js(qtbot, page, CLOSE_BUTTONS)) == 3
    run_js(qtbot, page, "document.querySelector('.frage:not(#frage) [data-w=\"fenster\"]').click()")
    qtbot.waitUntil(lambda: not desktop.window.isVisible(), timeout=3000)
    assert ping() is not None, "Server/Overlays laufen weiter"


def test_second_start_shows_existing_window(qtbot, desktop):
    assert not desktop.window.isVisible()
    second = subprocess.Popen([sys.executable, "-m", "casting_app"], cwd=ROOT)
    qtbot.waitUntil(lambda: second.poll() is not None, timeout=20_000)
    assert second.returncode == 0
    qtbot.waitUntil(desktop.window.isVisible, timeout=5000)


def test_app_window_audio_is_off_by_default_and_regulates_foreign_frames(qtbot, desktop):
    page = wait_for_page(qtbot, desktop)
    run_js(qtbot, page, "ui.appTon && $('appTon').click()")   # start from "off"
    qtbot.wait(300)
    assert page.isAudioMuted()
    with _https_test_page() as https_url:
        run_js(qtbot, page, f"""(() => {{ const d = $('frame').contentDocument, f = d.createElement('iframe');
            f.id = 'fremd'; f.src = {json.dumps(https_url)}; d.body.appendChild(f); }})()""")
        frame = _wait_for_frame(qtbot, page, https_url)
        run_js(qtbot, page, "(() => { if (!ui.appTon) $('appTon').click(); const r = $('appTonVol'); r.value = 40; r.dispatchEvent(new Event('input')); })()")
        qtbot.wait(500)
        assert not page.isAudioMuted()
        measured = run_js(qtbot, frame, """(() => { const v = document.querySelector('video'); v.volume = 0.5;
            const c = new AudioContext(); c.createOscillator().connect(c.destination);
            const p = window[Symbol.for('casting-app-volume')].inspect(v, c); return [v.volume, p.actualVolume, p.contextGain, origin]; })()""")
        page_value, audible, context_gain, frame_origin = measured
        assert frame_origin.startswith("https://127.0.0.1"), "Rahmen muss fremd (cross-origin) sein"
        assert page_value == 0.5 and abs(audible - 0.2) < 1e-6 and abs(context_gain - 0.4) < 1e-6
        run_js(qtbot, page, "(() => { const r = $('appTonVol'); r.value = 100; r.dispatchEvent(new Event('input')); })()")
        qtbot.wait(400)
        audible = run_js(qtbot, frame, "window[Symbol.for('casting-app-volume')].inspect(document.querySelector('video')).actualVolume")
        assert abs(audible - 0.5) < 1e-6
        run_js(qtbot, page, "$('appTon').click()")
        qtbot.wait(300)
        assert page.isAudioMuted()


def test_secrets_stay_in_keyring_only(qtbot, desktop):
    page = wait_for_page(qtbot, desktop)
    faceit_key, dach_key = "abcdef12-3456-7890-abcd-ef1234567890", "dachkey-0815"
    run_js(qtbot, page, f"""fetch('/api/faceit-schluessel', {{ method: 'POST', body: JSON.stringify({{ schluessel: '{faceit_key}' }}) }}).then(() => 1)""")
    run_js(qtbot, page, f"""fetch('/api/dach-zugang', {{ method: 'POST', body: JSON.stringify({{ userid: '4242', key: '{dach_key}' }}) }}).then(() => 1)""")
    qtbot.wait(300)
    texts = run_js(qtbot, page, """Promise.all(['/api/log', '/api/dach-zugang', '/api/faceit-schluessel'].map(u => fetch(u).then(r => r.text())))
        .then(t => t.join('\\n') + JSON.stringify(Z))""")
    for secret in (faceit_key, dach_key, "4242"):
        assert secret not in texts
    assert MEMORY_KEYRING.passwords[("Casting-App", "faceit-key")] == faceit_key
    for file in TEST_HOME.rglob("*"):
        if file.is_file() and file.stat().st_size < 5_000_000:
            content = file.read_bytes()
            assert faceit_key.encode() not in content and dach_key.encode() not in content, f"Geheimnis in {file}"


def test_quit_from_dialog_stops_everything(qtbot, desktop):
    page = wait_for_page(qtbot, desktop)
    desktop.window.close()
    qtbot.wait(200)
    run_js(qtbot, page, "document.querySelector('.frage:not(#frage) [data-w=\"beenden\"]').click()")
    qtbot.waitUntil(lambda: desktop._quitting, timeout=3000)
    QApplication.instance().aboutToQuit.emit()                # the event loop of the test does not end by itself
    qtbot.waitUntil(lambda: ping() is None, timeout=5000)


# --- helpers ---

def _wait_for_frame(qtbot, page, url_start):
    def find(frame):
        if frame.url().toString().startswith(url_start):
            return frame
        return next((found for child in frame.children() if (found := find(child))), None)
    qtbot.waitUntil(lambda: find(page.mainFrame()) is not None, timeout=10_000)
    return find(page.mainFrame())


class _https_test_page:
    """Small HTTPS page with its own certificate – a foreign origin like VDO.Ninja or DACH CS."""

    def __enter__(self):
        folder = Path(tempfile.mkdtemp())
        subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=127.0.0.1", "-days", "1",
                        "-keyout", folder / "key.pem", "-out", folder / "cert.pem"], check=True, capture_output=True)

        class Page(BaseHTTPRequestHandler):
            def do_GET(self):
                body = b"<video muted></video><p>fremde Seite</p>"
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        self._server = HTTPServer(("127.0.0.1", 0), Page)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(folder / "cert.pem", folder / "key.pem")
        self._server.socket = context.wrap_socket(self._server.socket, server_side=True)
        threading.Thread(target=self._server.serve_forever, daemon=True).start()
        return f"https://127.0.0.1:{self._server.server_address[1]}/"

    def __exit__(self, *errors):
        self._server.shutdown()
