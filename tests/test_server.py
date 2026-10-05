"""Tests for the HTTP server (casting_app/server): security rules, secrets, state, files.

Starts the server in-process on port 8787 – no other Casting-App may run.
    pytest tests/test_server.py
"""

import http.client
import json
import time

import pytest
from conftest import MemoryKeyring

from casting_app import instance
from casting_app.app_log import AppLog
from casting_app.paths import create_folders
from casting_app.secret_store import SecretStore
from casting_app.server.app_server import CastingServer
from casting_app.version import VERSION


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


def request(method, path, body=None, headers=None, host="localhost:8787"):
    connection = http.client.HTTPConnection("127.0.0.1", 8787, timeout=5)
    connection.request(method, path, body=body, headers={"Host": host, **(headers or {})})
    answer = connection.getresponse()
    data = answer.read()
    connection.close()
    return answer.status, dict(answer.getheaders()), data


def test_ping(server):
    status, _, body = request("GET", "/api/ping")
    assert status == 200 and json.loads(body) == {"ok": True, "service": "cast", "dienst": "cast", "version": VERSION}


@pytest.mark.parametrize("headers, host", [
    ({}, "evil.example:8787"),                              # DNS rebinding: foreign host name
    ({"Sec-Fetch-Site": "cross-site"}, "localhost:8787"),   # a website from the internet
    ({"Origin": "https://evil.example"}, "localhost:8787"),
])
def test_foreign_requests_are_refused(server, headers, host):
    assert request("GET", "/api/log", headers=headers, host=host)[0] == 403


def test_files_only_from_own_folders(server):
    assert request("GET", "/overlay.html")[0] == 200
    assert request("GET", "/..%2f..%2fetc%2fpasswd.html")[0] == 404
    assert request("GET", "/.git/config.md")[0] == 404
    status, headers, body = request("GET", "/media/maps/de_dust2.jpg", headers={"Range": "bytes=0-99"})
    assert status == 206 and len(body) == 100 and headers["Content-Range"].startswith("bytes 0-99/")


def test_secrets_are_never_returned(server):
    request("POST", "/api/faceit-key", json.dumps({"key": "abcdefgh-1234-5678"}))
    request("POST", "/api/dach-access", json.dumps({"userid": "4242", "key": "dachkey-0815"}))
    answers = b"".join(request("GET", path)[2] for path in ("/api/faceit-key", "/api/dach-access", "/api/log"))
    for secret in (b"abcdefgh-1234-5678", b"dachkey-0815", b"4242"):
        assert secret not in answers
    status, headers, _ = request("GET", "/dach/pause")
    assert status == 302 and headers["Location"].startswith("https://user.dachcs.de/castingoverlay/pause.php?userid=4242&key=")


def test_state_is_kept_and_older_states_are_ignored(server):
    newer = int(time.time() * 1000) * 10                    # "revision" is a time stamp; stay above any earlier state
    request("POST", "/api/state", json.dumps({"revision": newer, "theme": "new"}))
    request("POST", "/api/state", json.dumps({"revision": newer - 5, "theme": "old"}))
    status, _, body = request("GET", "/api/state?after=1")
    assert status == 200 and json.loads(body)["theme"] == "new"
    assert request("GET", f"/api/state?after={newer}")[0] == 204
    time.sleep(0.6)                                          # saving is bundled
    assert json.loads((server.folders.data / "state.json").read_text())["theme"] == "new"


def test_pages_of_version_2_1_still_work(server):
    """OBS browser sources keep their old address; an old page that is still open reloads itself."""
    status, headers, _ = request("GET", "/spieler.html?preview=1")
    assert status == 301 and headers["Location"] == "/players.html?preview=1"
    assert request("GET", "/steuerung.html")[1]["Location"] == "/control.html"
    assert request("GET", "/medien/themes/dachcs/blau_1.svg")[1]["Location"] == "/media/themes/dachcs/blue_1.svg"
    status, _, body = request("GET", "/api/ereignisse?seite=spieler&v=2.1.0")
    assert status == 200 and b"event: neuladen" in body
    assert request("POST", "/api/beenden", headers={"Origin": "https://evil.example"})[0] == 403


def test_game_state_needs_token(server):
    post = {"auth": {"token": "falsch"}, "map": {"name": "de_mirage", "round": 1}}
    assert request("POST", "/api/gsi", json.dumps(post))[0] == 403
    post["auth"]["token"] = server.game_state.settings["token"]
    assert request("POST", "/api/gsi", json.dumps(post))[0] == 200
    # a website may not post game state
    assert request("POST", "/api/gsi", json.dumps(post), headers={"Sec-Fetch-Site": "same-origin"})[0] == 403
