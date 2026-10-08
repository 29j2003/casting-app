"""DACH CS: the server recognises whether a match is active (without one the pages only show a notice).

    pytest tests/test_dach_match.py
"""

from casting_app.server import dach_match

NO_MATCH_PAGE = b"<html><body>Du hast kein aktives Match eingetragen. Bitte aktiviere ein Match im Userbereich</body></html>"


class Answer:
    def __init__(self, body: bytes):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, limit):
        return self.body[:limit]


def opener_for(body: bytes, calls: list):
    def opener(request, timeout):
        calls.append(request.full_url)
        return Answer(body)
    return opener


def test_no_active_match_is_recognised():
    calls = []
    assert dach_match.MatchCheck(opener_for(NO_MATCH_PAGE, calls)).active("123", "abcde-12345") is False
    assert calls[0].startswith("https://user.dachcs.de/castingoverlay/lineup.php?") and "userid=123" in calls[0]


def test_a_page_with_content_means_a_match_is_active():
    assert dach_match.MatchCheck(opener_for(b"<div>Team A</div><div>Team B</div>", [])).active("123", "abcde-12345") is True


def test_without_access_data_or_connection_it_is_unknown():
    calls = []
    assert dach_match.MatchCheck(opener_for(NO_MATCH_PAGE, calls)).active(None, "abcde-12345") is None
    assert calls == []                                    # nothing is asked without ID and key

    def broken(request, timeout):
        raise OSError("no network")
    assert dach_match.MatchCheck(broken).active("123", "abcde-12345") is None


def test_answers_are_shared_for_a_short_time():
    calls = []
    check = dach_match.MatchCheck(opener_for(NO_MATCH_PAGE, calls))
    for _ in range(3):
        check.active("123", "abcde-12345")
    assert len(calls) == 1
    check.active("456", "abcde-12345")                    # other access data: asked again
    assert len(calls) == 2
