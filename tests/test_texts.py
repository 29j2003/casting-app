"""The texts of the Python side (casting_app/texts.py) exist in both languages and fill in their values."""

import re

from casting_app import texts


def test_every_text_has_both_languages_with_the_same_placeholders():
    for key, (german, english) in texts.TEXTS.items():
        assert german and english, key
        assert sorted(re.findall(r"\{(\w+)\}", german)) == sorted(re.findall(r"\{(\w+)\}", english)), key


def test_language_switch():
    try:
        texts.set_language("en")
        assert texts.text("tray.quit") == "Quit completely"
        assert texts.text("reload.count", count=2) == "2 overlay(s) reloaded."
        texts.set_language("xx")                              # ignored
        assert texts.language() == "en"
    finally:
        texts.set_language("de")
    assert texts.text("tray.quit") == "Ganz beenden"
