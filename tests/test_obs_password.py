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

    def __init__(self):
        self.logins = []                       # True/False per login attempt
        self._loop = asyncio.new_event_loop()
        threading.Thread(target=self._loop.run_forever, daemon=True).start()
        asyncio.run_coroutine_threadsafe(self._start(), self._loop).result(5)

    async def _start(self):
        self._server = await websockets.serve(self._connection, "127.0.0.1", OBS_PORT)

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
            await socket.send(json.dumps({"op": 7, "d": {"requestType": request["requestType"], "requestId": request["requestId"],
                                                         "requestStatus": {"result": True, "code": 100}, "responseData": {}}}))


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
        page.goto("http://localhost:8787/steuerung.html")
        answer = page.evaluate("""async () => {
            const before = await (await fetch('/api/obs-anmeldung', { method: 'POST', body: JSON.stringify({ salt: 's', challenge: 'c' }) })).status;
            await fetch('/api/obs-passwort', { method: 'POST', body: JSON.stringify({ passwort: 'abc' }) });
            const after = await (await fetch('/api/obs-anmeldung', { method: 'POST', body: JSON.stringify({ salt: 's', challenge: 'c' }) })).json();
            const status = await (await fetch('/api/obs-passwort')).text();
            await fetch('/api/obs-passwort', { method: 'DELETE' });
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
        page.goto("http://localhost:8787/steuerung.html")
        page.evaluate(f"localStorage.setItem('cast-verbindung', JSON.stringify({{ port: {OBS_PORT}, passwort: '{OBS_PASSWORD}' }}))")
        page.reload()
        page.wait_for_function("() => document.getElementById('obsPasswort').placeholder === '✓ gespeichert'", timeout=10_000)
        page.evaluate("document.getElementById('obsNeu').click()")
        page.wait_for_function("() => kanal.obs && kanal.obs.offen", timeout=15_000)
        storage = page.evaluate("JSON.stringify(localStorage)")
        browser.close()
    assert True in obs.logins, "OBS hat die Anmeldung nicht angenommen"
    assert OBS_PASSWORD not in storage, "das Passwort darf nicht mehr im Browser-Speicher stehen"
    assert server.secrets.get("obs-password") == OBS_PASSWORD
