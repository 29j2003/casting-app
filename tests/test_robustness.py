"""Damaged files, odd input and failing keyrings must never stop the app or lose data.

No server port is needed: the server object is created but not started.
    pytest tests/test_robustness.py
"""

import json

import pytest
from conftest import MemoryKeyring

from casting_app import password_vault
from casting_app.app_log import AppLog
from casting_app.files import read_json_object, write_atomic
from casting_app.paths import create_folders
from casting_app.secret_store import ACCESS_KEY, SecretStore
from casting_app.server.app_server import CastingServer, public_state
from casting_app.server.game_state import LEGACY_TOKEN, GameStateReceiver
from casting_app.settings import AppSettings


def make_server(tmp_path, backend=None):
    folders = create_folders(tmp_path)
    log = AppLog()
    store = SecretStore(folders.data, log.write, keyring_backend=backend or MemoryKeyring())
    return CastingServer(folders, store, log, on_quit_requested=lambda: None), folders, log


def test_write_atomic_replaces_in_one_step(tmp_path):
    target = tmp_path / "a.json"
    write_atomic(target, '{"x": 1}')
    write_atomic(target, '{"x": 2}')
    assert json.loads(target.read_text()) == {"x": 2}
    assert not (tmp_path / "a.json.tmp").exists()


@pytest.mark.parametrize("content", [b'{"revision": 1, "texts": {"title": "Gr\xc3', b"null", b"", b"[1, 2]"])
def test_damaged_state_file_does_not_stop_the_start(tmp_path, content):
    folders = create_folders(tmp_path)
    (folders.data / "state.json").write_bytes(content)
    server, folders, log = make_server(tmp_path)               # must not raise
    assert (folders.data / "state.json.damaged").exists() and not (folders.data / "state.json").exists()
    assert any("beschädigt" in e["text"] for e in log.latest())


def test_damaged_settings_give_defaults(tmp_path):
    for content in ("null", "5", '{"app_language": 3}', "{kaputt"):
        (tmp_path / "settings.json").write_text(content)
        assert AppSettings(tmp_path).get("app_language") == "de"


def test_damaged_gsi_file_is_kept_aside_and_types_are_checked(tmp_path):
    messages = []
    (tmp_path / "gsi.json").write_text('{"token": "abcd')
    GameStateReceiver(tmp_path, lambda e, d: None, lambda text, level="info": messages.append(text))
    assert (tmp_path / "gsi.json.damaged").exists()
    (tmp_path / "gsi.json").write_text(json.dumps({"token": None, "network": "ja", "sideA": "T"}))
    receiver = GameStateReceiver(tmp_path, lambda e, d: None, lambda text, level="info": None)
    assert isinstance(receiver.settings["token"], str) and len(receiver.settings["token"]) >= 16      # a new one
    assert receiver.settings["network"] is False and receiver.settings["sideA"] == "T"


def test_old_public_cs2_token_is_refused(tmp_path):
    messages = []
    receiver = GameStateReceiver(tmp_path, lambda e, d: None, lambda text, level="info": messages.append(text))
    post = {"auth": {"token": LEGACY_TOKEN}, "map": {"name": "de_mirage", "round": 1}}
    assert receiver.accept(json.dumps(post), "local")[0] == 403
    assert receiver.accept(json.dumps(post), "local")[0] == 403
    assert sum("alten Version" in m for m in messages) == 1                 # one hint, not one per post


def test_unexpected_cs2_data_is_refused_not_crashing(tmp_path):
    receiver = GameStateReceiver(tmp_path, lambda e, d: None, lambda text, level="info": None)
    token = receiver.settings["token"]
    for post in ({"auth": {"token": token}, "allplayers": [1, 2]}, {"auth": {"token": token}, "map": [1]},
                 {"auth": "x"}, [1, 2]):
        assert receiver.accept(json.dumps(post), "local")[0] in (400, 403)


def test_older_state_is_refused_with_the_current_revision(tmp_path):
    server, _, _ = make_server(tmp_path)
    assert server._store_state(json.dumps({"revision": 2000, "theme": "neu"}))
    assert not server._store_state(json.dumps({"revision": 1000, "theme": "alt"}))
    assert server._state_revision == 2000


def test_overlays_without_the_key_get_no_camera_links():
    state = {"revision": 5, "sources": {"c1": {"type": "link", "url": "https://vdo.ninja/?view=x&password=geheim",
                                              "device": "abc", "deviceName": "Cam", "mirror": True}}}
    public = json.loads(public_state(json.dumps(state)))
    assert public["sources"]["c1"] == {"type": "link", "url": "", "device": "", "deviceName": "", "mirror": True}
    assert json.loads(public_state("{kaputt")) == {"revision": 0}


def test_unreadable_keyring_never_replaces_the_stored_access_key(tmp_path):
    class LockedKeyring(MemoryKeyring):
        def get_password(self, service, username):
            raise RuntimeError("locked")
    locked = LockedKeyring()
    locked.passwords[("Casting-App", ACCESS_KEY)] = "x" * 43
    server, _, _ = make_server(tmp_path, locked)
    assert server.access_key and server.access_key != "x" * 43
    assert locked.passwords[("Casting-App", ACCESS_KEY)] == "x" * 43     # the stored key stays for the next start


def test_damaged_vault_file_is_reported_as_damaged(tmp_path):
    (tmp_path / password_vault.FILE_NAME).write_text('{"version": 1}')
    with pytest.raises(password_vault.DamagedVault):
        password_vault.PasswordVault(tmp_path, "langes-passwort-123")


def test_read_json_object_sets_damaged_files_aside(tmp_path):
    path = tmp_path / "x.json"
    assert read_json_object(path) is None
    path.write_text("{kaputt")
    assert read_json_object(path) is None and (tmp_path / "x.json.damaged").exists()


def test_odd_content_length_values_are_refused():
    from casting_app.server.net import content_length
    assert content_length({"Content-Length": "12"}) == 12 and content_length({}) == 0
    for value in ("²", "-1", "1e3", "١٢", "9" * 20):
        assert content_length({"Content-Length": value}) is None


def test_programs_of_the_system_get_the_environment_without_the_apps_libraries():
    """Issue #13: the built Linux app must not pass its own library paths to xdg-open (KDE's kde-open broke)."""
    from casting_app.system_open import system_environment
    bundle = "/tmp/.mount_CastXY/usr/lib/casting-app/_internal"
    frozen = {"LD_LIBRARY_PATH": bundle, "LD_LIBRARY_PATH_ORIG": "/opt/own/lib", "HOME": "/home/u",
              "QT_PLUGIN_PATH": bundle + "/PySide6/Qt/plugins", "XDG_DATA_DIRS": f"/usr/share:{bundle}/share",
              "GTK_PATH": bundle + "/gtk"}
    env = system_environment(frozen, bundle)
    assert env == {"LD_LIBRARY_PATH": "/opt/own/lib", "HOME": "/home/u", "XDG_DATA_DIRS": "/usr/share"}
    # started without own LD_LIBRARY_PATH: the system's programs get none either
    assert system_environment({"LD_LIBRARY_PATH": bundle, "PATH": "/usr/bin"}, bundle) == {"PATH": "/usr/bin"}
