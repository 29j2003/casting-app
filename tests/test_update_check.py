"""Tests for casting_app/update_check.py and casting_app/settings.py.

    pytest tests/test_update_check.py
"""

import io
import json
import urllib.request

import pytest

from casting_app import update_check
from casting_app.settings import AppSettings
from casting_app.version import VERSION


def fake_github(monkeypatch, release: dict | Exception):
    def urlopen(request, timeout):
        assert request.full_url == update_check.RELEASES_URL
        if isinstance(release, Exception):
            raise release
        return io.BytesIO(json.dumps(release).encode())
    monkeypatch.setattr(urllib.request, "urlopen", urlopen)


def test_newer_release_is_reported(monkeypatch):
    fake_github(monkeypatch, {"tag_name": "v99.0.0", "html_url": "https://github.com/29j2003/casting-app/releases/tag/v99.0.0"})
    assert update_check.newer_release() == {"version": "99.0.0", "url": "https://github.com/29j2003/casting-app/releases/tag/v99.0.0"}


@pytest.mark.parametrize("release", [
    {"tag_name": f"v{VERSION}"},                          # same version
    {"tag_name": "v1.0.0"},                               # older
    {"tag_name": "v99.0.0", "prerelease": True},          # test versions are not offered
    {"tag_name": "v99.0.0", "draft": True},
    OSError("offline"),
])
def test_no_update_otherwise(monkeypatch, release):
    fake_github(monkeypatch, release)
    assert update_check.newer_release() is None


def test_foreign_links_are_not_offered(monkeypatch):
    fake_github(monkeypatch, {"tag_name": "v99.0.0", "html_url": "https://example.com/fake"})
    assert update_check.newer_release()["url"] == ""


def test_settings_are_saved_and_validated(tmp_path):
    settings = AppSettings(tmp_path)
    assert settings.as_dict() == {"check_for_updates": True, "app_language": "de", "offer_password_vault": True}
    settings.update({"check_for_updates": False, "app_language": "en", "unknown": 1})
    settings.update({"app_language": "fr"})                  # not supported: ignored
    assert AppSettings(tmp_path).as_dict() == {"check_for_updates": False, "app_language": "en", "offer_password_vault": True}
