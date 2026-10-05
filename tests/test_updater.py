"""Tests for casting_app/updater.py (update from inside the app) and casting_app/settings.py.

No network: GitHub's answers and the download are simulated.
    pytest tests/test_updater.py
"""

import hashlib
import io
import time

import pytest

from casting_app import updater
from casting_app.settings import AppSettings
from casting_app.version import VERSION, compare_versions

PAGE = "https://github.com/29j2003/casting-app/releases/tag/v99.0.0"
DOWNLOAD = "https://github.com/29j2003/casting-app/releases/download/v99.0.0/"


def release(**changes) -> dict:
    data = {"tag_name": "v99.0.0", "html_url": PAGE, "assets": [
        {"name": "Casting-App-99.0.0-Setup.exe", "browser_download_url": DOWNLOAD + "Casting-App-99.0.0-Setup.exe",
         "size": 4, "digest": "sha256:" + hashlib.sha256(b"neu!").hexdigest()},
        {"name": "Casting-App-99.0.0-linux-x86_64.AppImage", "browser_download_url": DOWNLOAD + "Casting-App-99.0.0-linux-x86_64.AppImage",
         "size": 4, "digest": "sha256:" + hashlib.sha256(b"neu!").hexdigest()}]}
    data.update(changes)
    return data


def test_versions_are_compared_as_numbers():
    assert compare_versions("2.10.0", "2.9.9") > 0 and compare_versions("2.3", "2.3.0") == 0 and compare_versions("old", "1.0") < 0


def test_newer_release_with_the_file_for_this_system(monkeypatch):
    monkeypatch.setattr(updater, "install_kind", lambda: "windows-installer")
    found = updater.newer_release(lambda url: release())
    assert found["version"] == "99.0.0" and found["url"] == PAGE
    assert found["asset"]["name"].endswith("-Setup.exe") and len(found["asset"]["sha256"]) == 64


def test_no_one_click_install_without_a_fitting_and_checked_file(monkeypatch):
    monkeypatch.setattr(updater, "install_kind", lambda: "manual")             # portable or source checkout
    assert updater.newer_release(lambda url: release())["asset"] is None
    monkeypatch.setattr(updater, "install_kind", lambda: "appimage")
    no_digest = release(assets=[{"name": "Casting-App-99.0.0-linux-x86_64.AppImage", "browser_download_url": DOWNLOAD + "x"}])
    assert updater.newer_release(lambda url: no_digest)["asset"] is None       # no checksum → no automatic install
    foreign = release(assets=[{"name": "Casting-App-99.0.0-linux-x86_64.AppImage", "browser_download_url": "https://example.com/x",
                               "digest": "sha256:" + "0" * 64}])
    assert updater.newer_release(lambda url: foreign)["asset"] is None         # only files from the project's releases


@pytest.mark.parametrize("answer", [
    {"tag_name": f"v{VERSION}"}, {"tag_name": "v1.0.0"},
    {"tag_name": "v99.0.0", "prerelease": True}, {"tag_name": "v99.0.0", "draft": True}, [], OSError("offline")])
def test_no_update_otherwise(answer):
    def fetch(url):
        if isinstance(answer, Exception):
            raise answer
        return answer
    assert updater.newer_release(fetch) is None


def test_foreign_release_pages_are_not_linked():
    assert updater.newer_release(lambda url: release(html_url="https://example.com/fake"))["url"] == ""


def wait_for(update, *states):
    for _ in range(100):
        if update.status["state"] in states:
            return
        time.sleep(0.02)
    raise AssertionError(update.status)


def test_download_with_wrong_checksum_installs_nothing(tmp_path, monkeypatch):
    monkeypatch.setattr(updater, "install_kind", lambda: "appimage")
    quits, started = [], []
    update = updater.Updater(tmp_path, lambda text, level="info": None, quit_app=lambda: quits.append(1))
    update.release = {"version": "99.0.0", "url": PAGE, "asset": {"name": "x.AppImage", "url": DOWNLOAD + "x", "size": 4,
                                                                  "sha256": hashlib.sha256(b"neu!").hexdigest()}}
    monkeypatch.setattr(updater.urllib.request, "urlopen", lambda request, timeout: io.BytesIO(b"falsch"))
    monkeypatch.setattr(updater, "start_replacement", lambda kind, file: started.append(file))
    assert update.install_in_background()
    wait_for(update, "error")
    assert "Prüfsumme" in update.status["error"] and not quits and not started
    assert not list((tmp_path / "update").glob("x.AppImage*"))


def test_verified_download_replaces_and_quits(tmp_path, monkeypatch):
    monkeypatch.setattr(updater, "install_kind", lambda: "appimage")
    quits, started = [], []
    update = updater.Updater(tmp_path, lambda text, level="info": None, quit_app=lambda: quits.append(1))
    update.release = {"version": "99.0.0", "url": PAGE, "asset": {"name": "x.AppImage", "url": DOWNLOAD + "x", "size": 4,
                                                                  "sha256": hashlib.sha256(b"neu!").hexdigest()}}
    monkeypatch.setattr(updater.urllib.request, "urlopen", lambda request, timeout: io.BytesIO(b"neu!"))
    monkeypatch.setattr(updater, "start_replacement", lambda kind, file: started.append((kind, file.read_bytes())))
    assert update.snapshot()["canInstall"]
    assert update.install_in_background()
    wait_for(update, "installing")
    for _ in range(50):
        if quits:
            break
        time.sleep(0.02)
    assert started == [("appimage", b"neu!")] and quits == [1]


def test_check_reports_a_found_version(tmp_path, monkeypatch):
    monkeypatch.setattr(updater, "newer_release", lambda: {"version": "99.0.0", "url": PAGE, "asset": None})
    found = []
    update = updater.Updater(tmp_path, lambda text, level="info": None)
    update.on_found = found.append
    update.check_in_background()
    wait_for(update, "available")
    snapshot = update.snapshot()
    assert snapshot["version"] == "99.0.0" and snapshot["url"] == PAGE and not snapshot["canInstall"] and found


def test_settings_are_saved_and_validated(tmp_path):
    settings = AppSettings(tmp_path)
    assert settings.as_dict() == {"check_for_updates": True, "app_language": "de", "offer_password_vault": True}
    settings.update({"check_for_updates": False, "app_language": "en", "unknown": 1})
    settings.update({"app_language": "fr"})                  # not supported: ignored
    assert AppSettings(tmp_path).as_dict() == {"check_for_updates": False, "app_language": "en", "offer_password_vault": True}


@pytest.mark.skipif(updater.IS_WINDOWS or updater.IS_MAC, reason="AppImage: Linux")
def test_appimage_is_replaced_after_the_old_app_quit_and_started_again(tmp_path, monkeypatch):
    import subprocess
    marker = tmp_path / "started"
    current = tmp_path / "Casting-App.AppImage"
    current.write_text("#!/bin/sh\necho alt > /dev/null\n")
    current.chmod(0o755)
    download = tmp_path / "download.AppImage"
    download.write_text(f"#!/bin/sh\necho neu > {marker}\n")
    monkeypatch.setenv("APPIMAGE", str(current))
    old_app = subprocess.Popen(["sleep", "0.6"])                          # stands in for the running app
    updater.start_replacement("appimage", download, pid=old_app.pid)
    assert current.read_text().count("alt")                                 # not replaced while the app still runs
    old_app.wait()
    for _ in range(50):
        if marker.exists():
            break
        time.sleep(0.1)
    assert marker.read_text().strip() == "neu" and "neu" in current.read_text() and not download.exists()


def test_first_start_after_an_update_is_noted(tmp_path):
    (tmp_path / "update").mkdir()
    (tmp_path / "update" / "installed-version.txt").write_text("2.2.1")
    (tmp_path / "update" / "Casting-App-old-Setup.exe").write_bytes(b"x")      # download of that update
    messages = []
    update = updater.Updater(tmp_path, lambda text, level="info": messages.append(text))
    assert update.snapshot()["updatedFrom"] == "2.2.1" and any("2.2.1" in m for m in messages)
    assert not (tmp_path / "update" / "Casting-App-old-Setup.exe").exists()
    assert updater.Updater(tmp_path, lambda text, level="info": None).snapshot()["updatedFrom"] == ""   # only once
