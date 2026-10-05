"""Tests for taking over data of version 2.1 and older (casting_app/legacy.py, web/legacy.js).

    pytest tests/test_legacy.py

tests/data/state-2.1-default.json is the default state of version 2.1 (German names),
tests/data/state-default.json the default state of this version (web/cast-core.js).
"""

import json
from pathlib import Path

from casting_app import legacy
from casting_app.server.game_state import GameStateReceiver

DATA = Path(__file__).parent / "data"


def load(name: str):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def test_old_default_state_becomes_the_new_default_state():
    assert legacy.migrate(load("state-2.1-default.json")) == load("state-default.json")


def test_values_paths_and_texts():
    old = {"sendung": {"szene": "spieler", "uebergang": "schnitt"}, "texte": {"titel": "läuft"},
           "hintergrund": {"videos": ["medien/videos/a.mp4"], "bild": "medien/themes/dachcs/blau_1.svg"},
           "teams": {"a": {"name": "Spieler"}}}
    new = legacy.migrate(old)
    assert new["broadcast"] == {"scene": "players", "transition": "cut"}
    assert new["texts"]["title"] == "läuft"                          # visible text stays
    assert new["background"]["videos"] == ["media/videos/a.mp4"]
    assert new["background"]["image"] == "media/themes/dachcs/blue_1.svg"
    assert new["teams"]["a"]["name"] == "Spieler"                     # user text stays


def test_scene_order_groups_of_the_control_page():
    """ui.sceneRow from 2.1 keeps its group headers (#vor → #pregame …)."""
    assert legacy.migrate({"sceneRow": ["#vor", "intro", "#im", "ingame", "#nach", "#zwischen"]}) == \
        {"sceneRow": ["#pregame", "intro", "#during", "ingame", "#post", "#between"]}


def test_data_folder_is_taken_over_once(tmp_path):
    (tmp_path / "zustand.json").write_text(json.dumps(load("state-2.1-default.json")), encoding="utf-8")
    (tmp_path / "gsi.json").write_text(json.dumps({"token": "abc", "netz": True, "seiteA": "T", "teamA": "", "teamB": ""}))
    (tmp_path / "einstellungen.json").write_text('{"check_for_updates": false}')
    (tmp_path / "bilder").mkdir()
    (tmp_path / "bilder" / "x1.png").write_bytes(b"png")
    (tmp_path / "app-fenster").mkdir()
    legacy.migrate_data_folder(tmp_path)
    assert json.loads((tmp_path / "state.json").read_text(encoding="utf-8")) == load("state-default.json")
    assert not (tmp_path / "zustand.json").exists()
    assert (tmp_path / "images" / "x1.png").read_bytes() == b"png"
    assert (tmp_path / "settings.json").exists() and (tmp_path / "app-window").is_dir()
    receiver = GameStateReceiver(tmp_path, lambda event, data: None, lambda text, level="info": None)
    assert receiver.settings["sideA"] == "T" and receiver.settings["network"] is True and receiver.settings["token"] == "abc"
    receiver.set_lan_receiver(False)
    legacy.migrate_data_folder(tmp_path)                           # second start: nothing changes
    assert json.loads((tmp_path / "state.json").read_text(encoding="utf-8")) == load("state-default.json")
