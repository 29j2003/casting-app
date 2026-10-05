"""Tests for the HTTP server (casting_app/server): security rules, secrets, state, files.

Starts the server in-process on port 8787 – no other Casting-App may run.
    pytest tests/test_server.py
"""

import http.client
import json
import os
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
    ACCESS["key"] = app_server.access_key
    yield app_server
    app_server.stop()


ACCESS = {}          # the server's access key (set by the fixture)


def request(method, path, body=None, headers=None, host="localhost:8787", access=True):
    """One request like the app's own pages make it (with the access key) – access=False: like a foreign program."""
    connection = http.client.HTTPConnection("127.0.0.1", 8787, timeout=5)
    key = {"X-Casting-Access": ACCESS.get("key", "")} if access else {}
    connection.request(method, path, body=body, headers={"Host": host, **key, **(headers or {})})
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
    # the token is not kept: the control page's view of the last post has no "auth"
    status, _, body = request("GET", "/api/gsi")
    assert status == 200 and "auth" not in json.loads(body)["data"] and post["auth"]["token"].encode() not in body
    assert request("POST", "/api/gsi", "[1, 2]")[0] == 400


def test_obs_login_only_for_the_control_page(server):
    server.secrets.set("obs-password", "geheim-obs-123")
    challenge = json.dumps({"salt": "s", "challenge": "c"})
    own_page = {"Origin": "http://localhost:8787", "Sec-Fetch-Site": "same-origin"}
    assert request("POST", "/api/obs-auth", challenge)[0] == 403              # a program without browser headers
    assert request("POST", "/api/obs-auth", challenge, headers=own_page, access=False)[0] == 403   # forged, no key
    status, _, body = request("POST", "/api/obs-auth", challenge, headers=own_page)
    assert status == 200 and "authentication" in json.loads(body)
    server.secrets.delete("obs-password")


def test_faceit_never_follows_redirects():
    """urllib would send the API key along to the host a redirect names – the FACEIT client refuses redirects."""
    from casting_app.server import faceit
    handler = next(h for h in faceit._opener.handlers if isinstance(h, faceit._NoRedirects))
    assert handler.redirect_request(None, None, 302, "Found", {}, "https://evil.example/") is None


def test_vault_password_is_removed_from_the_environment(tmp_path, monkeypatch):
    from casting_app import password_vault
    monkeypatch.setenv(password_vault.ENVIRONMENT_VARIABLE, "nur-fuer-tests")
    password_vault.vault_from_environment(tmp_path, lambda *a, **k: None)
    assert password_vault.ENVIRONMENT_VARIABLE not in os.environ


def test_app_language_setting(server, tmp_path):
    from casting_app.settings import AppSettings
    settings = AppSettings(tmp_path)
    changes = []
    settings.listeners.append(changes.append)
    assert settings.get("app_language") == "de"
    settings.update({"language": "en"})                      # name in 2.1
    assert settings.get("app_language") == "en" and changes == [{"app_language": "en"}]
    settings.update({"app_language": "fr"})                  # unknown languages are ignored
    assert AppSettings(tmp_path).get("app_language") == "en"


def test_dach_notice_follows_the_overlay_language(server):
    server.secrets.delete("dach-user-id")
    newer = int(time.time() * 1000) * 10 + 100
    request("POST", "/api/state", json.dumps({"revision": newer, "overlayLanguage": "en"}))
    status, _, body = request("GET", "/dach/pause", access=False)               # an old OBS source without the key
    assert status == 403 and b"needs the app's access key" in body
    status, _, body = request("GET", "/dach/pause?access=" + ACCESS["key"], access=False)
    assert status == 409 and b"DACH CS access missing" in body
    request("POST", "/api/state", json.dumps({"revision": newer + 1, "overlayLanguage": "de"}))
    assert "DACH-CS-Zugang fehlt" in request("GET", "/dach/pause")[2].decode()


def test_without_the_access_key_only_what_an_overlay_needs(server):
    """A program on this PC without the key can neither read secrets nor change anything."""
    for method, path in [("POST", "/api/state"), ("GET", "/api/gsi-info"), ("GET", "/api/gsi-cfg"), ("GET", "/api/log"),
                         ("GET", "/api/dach-access"), ("POST", "/api/faceit-key"), ("GET", "/api/folder-list?path=/"),
                         ("GET", "/api/app-settings"), ("POST", "/api/image/abcd1234"), ("GET", "/api/faceit/data/v4/matches/x")]:
        assert request(method, path, "{}", access=False)[0] == 403, path
    assert request("GET", "/api/state", access=False, headers={"X-Casting-Access": "falsch"})[0] == 200   # overlays read the state
    assert request("GET", "/api/ping", access=False)[0] == 200
    assert request("GET", "/overlay.html", access=False)[0] == 200
