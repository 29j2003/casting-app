"""Steam Workshop lookup for custom maps: only the number goes to Steam, only Steam's pictures come back.

    pytest tests/test_workshop.py
"""

import io
import json

import pytest

from casting_app.server import workshop


class Answer(io.BytesIO):
    """A fake urllib answer: body, final URL and content type."""

    def __init__(self, body: bytes, url: str = "", content_type: str = "application/json"):
        super().__init__(body)
        self._url = url
        self.headers = type("Headers", (), {"get_content_type": lambda _self: content_type})()

    def geturl(self) -> str:
        return self._url

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def steam(monkeypatch, details: dict, image_url: str = "", image_type: str = "image/jpeg", final_url: str | None = None):
    """Answer the details request with `details` and any picture request with a tiny JPEG."""
    sent = []

    def urlopen(request, timeout=0):
        sent.append(request)
        if request.full_url == workshop.DETAILS_URL:
            return Answer(json.dumps({"response": {"publishedfiledetails": [details]}}).encode())
        return Answer(b"\xff\xd8jpeg", final_url or request.full_url, image_type)

    monkeypatch.setattr(workshop.urllib.request, "urlopen", urlopen)
    return sent


def test_the_number_is_found_in_a_link_or_alone():
    assert workshop.workshop_id("https://steamcommunity.com/sharedfiles/filedetails/?id=3070284539") == "3070284539"
    assert workshop.workshop_id("  3070284539 ") == "3070284539"
    assert workshop.workshop_id("https://example.com/?id=abc") is None
    assert workshop.workshop_id("12") is None


def test_title_and_picture_come_back_and_only_the_number_is_sent(monkeypatch):
    sent = steam(monkeypatch, {"result": 1, "title": "de_thera", "preview_url": "https://images.steamusercontent.com/ugc/1/abc/"})
    found = workshop.lookup("https://steamcommunity.com/sharedfiles/filedetails/?id=3070284539")
    assert found["title"] == "de_thera" and found["id"] == "3070284539"
    assert found["image"].startswith("data:image/jpeg;base64,")
    assert sent[0].data == b"itemcount=1&publishedfileids%5B0%5D=3070284539"


def test_pictures_from_other_hosts_are_refused(monkeypatch):
    steam(monkeypatch, {"result": 1, "title": "x", "preview_url": "https://evil.example.com/a.jpg"})
    with pytest.raises(workshop.WorkshopError):
        workshop.lookup("3070284539")
    steam(monkeypatch, {"result": 1, "title": "x", "preview_url": "https://images.steamusercontent.com/a"},
          final_url="https://evil.example.com/a.jpg")                      # redirected away from Steam
    with pytest.raises(workshop.WorkshopError):
        workshop.lookup("3070284539")
    steam(monkeypatch, {"result": 1, "title": "x", "preview_url": "https://images.steamusercontent.com/a"}, image_type="text/html")
    with pytest.raises(workshop.WorkshopError):
        workshop.lookup("3070284539")


def test_an_unknown_item_is_reported(monkeypatch):
    steam(monkeypatch, {"result": 9})
    with pytest.raises(workshop.WorkshopError):
        workshop.lookup("3070284539")
