"""OBS WebSocket password: stored in the keyring, the server answers OBS's login challenge.

A fake OBS (obs-websocket 5) that requires a password; the control page in a real browser saves the
password and must then log in – while the password never appears in the page's storage or API answers.
    pytest tests/test_obs_password.py
"""

import asyncio
import base64
import hashlib
import json
import threading

import pytest
import websockets
from conftest import MemoryKeyring
from playwright.sync_api import sync_playwright

from casting_app import instance
from casting_app.app_log import AppLog
from casting_app.paths import create_folders
from casting_app.secret_store import SecretStore
from casting_app.server.app_server import CastingServer

OBS_PORT = 4466
OBS_PASSWORD = "geheim-obs-123"


def obs_login_answer(password: str, salt: str, challenge: str) -> str:
    """The obs-websocket 5 login formula."""
    secret = base64.b64encode(hashlib.sha256((password + salt).encode()).digest()).decode()
    return base64.b64encode(hashlib.sha256((secret + challenge).encode()).digest()).decode()


class FakeObs:
    """Minimal obs-websocket server that only accepts the right password."""

    def __init__(self, sources: dict | None = None):
        self.logins = []                       # True/False per login attempt
        self.sources = dict(sources or {})     # browser sources: name -> url
        self.changed = {}                      # SetInputSettings: name -> new url
        self._loop = asyncio.new_event_loop()
        threading.Thread(target=self._loop.run_forever, daemon=True).start()
        asyncio.run_coroutine_threadsafe(self._start(), self._loop).result(5)

    async def _start(self):
        self._server = await websockets.serve(self._connection, "127.0.0.1", OBS_PORT)

    def stop(self) -> None:
        """Free the port for the next test."""
        async def close():
            self._server.close()
            await self._server.wait_closed()
        asyncio.run_coroutine_threadsafe(close(), self._loop).result(5)

    async def _connection(self, socket):
        salt, challenge = "salzig", "herausforderung"
        await socket.send(json.dumps({"op": 0, "d": {"rpcVersion": 1, "authentication": {"salt": salt, "challenge": challenge}}}))
        identify = json.loads(await socket.recv())["d"]
        ok = identify.get("authentication") == obs_login_answer(OBS_PASSWORD, salt, challenge)
        self.logins.append(ok)
        if not ok:
            await socket.close(4009, "Authentication failed")
            return
        await socket.send(json.dumps({"op": 2, "d": {"negotiatedRpcVersion": 1}}))
        async for raw in socket:
            request = json.loads(raw)["d"]
            kind, data, answer = request["requestType"], request.get("requestData") or {}, {}
            if kind == "GetInputList":
                answer = {"inputs": [{"inputName": n, "inputKind": "browser_source"} for n in self.sources]}
            elif kind == "GetInputSettings":
                answer = {"inputSettings": {"url": self.sources.get(data.get("inputName"), ""), "is_local_file": False}}
            elif kind == "SetInputSettings" and "url" in (data.get("inputSettings") or {}):
                self.changed[data["inputName"]] = self.sources[data["inputName"]] = data["inputSettings"]["url"]
            await socket.send(json.dumps({"op": 7, "d": {"requestType": kind, "requestId": request["requestId"],
                                                         "requestStatus": {"result": True, "code": 100}, "responseData": answer}}))


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


def test_server_answers_obs_login_without_revealing_the_password(server):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page()
        page.goto(f"http://localhost:8787/control.html?access={server.access_key}")
        answer = page.evaluate("""async () => {
            const before = await (await fetch('/api/obs-auth', { method: 'POST', body: JSON.stringify({ salt: 's', challenge: 'c' }) })).status;
            await fetch('/api/obs-password', { method: 'POST', body: JSON.stringify({ password: 'abc' }) });
            const after = await (await fetch('/api/obs-auth', { method: 'POST', body: JSON.stringify({ salt: 's', challenge: 'c' }) })).json();
            const status = await (await fetch('/api/obs-password')).text();
            await fetch('/api/obs-password', { method: 'DELETE' });
            return [before, after.authentication, status];
        }""")
        browser.close()
    assert answer[0] == 404                                   # nothing stored yet
    assert answer[1] == obs_login_answer("abc", "s", "c")
    assert "abc" not in answer[2]


def test_control_page_logs_in_to_obs_with_password_from_keyring(server):
    obs = FakeObs()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page()
        # an old version kept the password in the browser: it must move into the keyring
        page.goto(f"http://localhost:8787/control.html?access={server.access_key}")
        page.evaluate(f"localStorage.setItem('cast-verbindung', JSON.stringify({{ port: {OBS_PORT}, passwort: '{OBS_PASSWORD}' }}))")
        page.reload()
        page.wait_for_function("() => document.getElementById('obsPassword').placeholder === '✓ gespeichert'", timeout=10_000)
        page.evaluate("document.getElementById('obsNew').click()")
        page.wait_for_function("() => channel.obs && channel.obs.isOpen", timeout=15_000)
        storage = page.evaluate("JSON.stringify(localStorage)")
        browser.close()
    obs.stop()
    assert True in obs.logins, "OBS hat die Anmeldung nicht angenommen"
    assert OBS_PASSWORD not in storage, "das Passwort darf nicht mehr im Browser-Speicher stehen"
    assert server.secrets.get("obs-password") == OBS_PASSWORD


def test_old_obs_sources_get_the_access_key_after_asking(server):
    """Browser sources of an older version (no key) are updated only after the user confirms – others stay untouched."""
    server.secrets.set("obs-password", OBS_PASSWORD)
    obs = FakeObs({"Cast – Overlay": "http://localhost:8787/overlay.html", "Fremd": "https://example.com/widget"})
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page()
        page.goto(f"http://localhost:8787/control.html?access={server.access_key}")
        page.evaluate(f"localStorage.setItem('cast-verbindung', JSON.stringify({{ port: {OBS_PORT} }}))")
        page.reload()                                                          # the key stays for the tab
        page.wait_for_function("() => typeof channel !== 'undefined' && channel.obs && channel.obs.isOpen", timeout=15_000)
        page.wait_for_function("() => !document.getElementById('question').hidden", timeout=10_000)
        assert "Cast – Overlay" in page.inner_text("#questionList") and "Fremd" not in page.inner_text("#questionList")
        assert server.access_key not in page.inner_text("#question")          # the key is never shown
        page.click("#questionYes")
        page.wait_for_timeout(1000)
        browser.close()
    obs.stop()
    assert obs.changed == {"Cast – Overlay": f"http://localhost:8787/overlay.html?access={server.access_key}"}
