"""Tests of the Auto-Observer test app (auto_observer/): game model, director, engine, server, camera, cfg."""

import http.client
import json
import socket
import threading
import time

import pytest

from auto_observer import camera as camera_module
from auto_observer.cs2_cfg import CFG_FILE_NAME, cfg_installed, write_cfg
from auto_observer.director import Director, duel_chance, form
from auto_observer.engine import Engine
from auto_observer.game import Match, Player
from auto_observer.recorder import Recorder, load
from auto_observer.replay import simulate
from auto_observer.server import make_server
from auto_observer.settings import Settings

TOKEN = "t" * 32
BASE_ID = 76561198000000000


def sid(i: int) -> str:
    return str(BASE_ID + i)


def gsi_player(name, team, slot, pos=(0, 0, 0), fwd=(1, 0, 0), hp=100, kills=0, deaths=0, round_kills=0,
               weapon=("weapon_ak47", "Rifle", 30), armor=100, flashed=0, killhs=0):
    return {
        "name": name, "team": team, "observer_slot": slot,
        "state": {"health": hp, "armor": armor, "helmet": True, "flashed": flashed, "round_kills": round_kills,
                  "round_killhs": killhs, "round_totaldmg": 0},
        "match_stats": {"kills": kills, "deaths": deaths, "assists": 0},
        "weapons": {"weapon_0": {"name": "weapon_knife", "type": "Knife", "state": "holstered"},
                    "weapon_1": {"name": weapon[0], "type": weapon[1], "ammo_clip": weapon[2], "state": "active"}},
        "position": ", ".join(f"{v:.2f}" for v in pos), "forward": ", ".join(f"{v:.2f}" for v in fwd),
    }


def lineup(**changes):
    """Ten players: CT 0–4 at x=0, T 5–9 at x=20000, 3000 apart (nobody in range of anybody)."""
    players = {}
    for i in range(10):
        team = "CT" if i < 5 else "T"
        base = dict(name=f"P{i}", team=team, slot=i, pos=(0 if i < 5 else 20000, i * 3000, 0))
        base.update(changes.get(f"p{i}", {}))
        players[sid(i)] = gsi_player(**base)
    return players


def post(players, phase="live", observed=0, round_number=3, bomb=None, token=TOKEN):
    data = {
        "provider": {"name": "Counter-Strike 2"},
        "map": {"name": "de_mirage", "phase": "live", "round": round_number,
                "team_ct": {"score": 2, "name": "Alpha"}, "team_t": {"score": 1, "name": "Bravo"}},
        "round": {"phase": phase}, "player": {"steamid": sid(observed) if isinstance(observed, int) else observed},
        "allplayers": players, "auth": {"token": token},
    }
    if bomb:
        data["bomb"] = bomb
    return data


# --- game model ---

def test_events_from_snapshots():
    match = Match()
    assert match.update(post(lineup()), 0.0) == []
    events = match.update(post(lineup(p0={"kills": 1, "round_kills": 1, "killhs": 1, "weapon": ("weapon_ak47", "Rifle", 27)},
                                      p5={"hp": 0}, p6={"hp": 60})), 0.2)
    kinds = {(e.kind, e.steamid) for e in events}
    assert ("kill", sid(0)) in kinds and ("death", sid(5)) in kinds and ("damage", sid(6)) in kinds
    assert ("shot", sid(0)) in kinds
    assert next(e for e in events if e.kind == "kill").headshot
    assert match.players[sid(0)].position == (0.0, 0.0, 0.0)
    assert match.team_key("CT") == "name:Alpha"


def test_broken_data_is_ignored():
    match = Match()
    payload = post(lineup())
    payload["allplayers"][sid(1)]["position"] = "nan, 1, 2"
    payload["allplayers"][sid(2)]["state"] = "kaputt"
    payload["allplayers"]["x"] = 5
    match.update(payload, 0.0)
    assert match.players[sid(1)].position is None
    assert match.players[sid(2)].health == 0


# --- director ---

def rate(match, now, weights=None, director=None):
    director = director or Director()
    return director, director.rate(match, lambda p: (weights or {}).get(p.steamid, 1.0), now, 0.5)


def test_cut_away_from_dead_player_at_once():
    match = Match()
    match.update(post(lineup(), observed=0), 0.0)
    match.update(post(lineup(p0={"hp": 0}), observed=0), 0.2)
    director, ratings = rate(match, 0.3)
    decision = director.decide(match, ratings, sid(0), 0.3)
    assert decision and decision.steamid != sid(0) and match.players[decision.steamid].alive


def test_clutch_player_is_shown():
    dead = {f"p{i}": {"hp": 0} for i in range(1, 5)}
    match = Match()
    match.update(post(lineup(**dead)), 0.0)
    _, ratings = rate(match, 0.1)
    assert ratings[0].steamid == sid(0) and ratings[0].reason == "clutch" and ratings[0].detail == "1v5"


def test_duel_and_importance():
    # P0 and P5 face each other at 800 units, P1 and P6 as well (further down): equal duels
    players = lineup(p0={"pos": (0, 0, 0), "fwd": (1, 0, 0)}, p5={"pos": (800, 0, 0), "fwd": (-1, 0, 0)},
                     p1={"pos": (0, 40000, 0), "fwd": (1, 0, 0)}, p6={"pos": (800, 40000, 0), "fwd": (-1, 0, 0)})
    match = Match()
    match.update(post(players), 0.0)
    _, ratings = rate(match, 0.1)
    scores = {r.steamid: r.score for r in ratings}
    assert scores[sid(0)] == pytest.approx(scores[sid(1)]) == pytest.approx(scores[sid(5)])
    assert scores[sid(0)] > scores[sid(2)]                        # nobody near P2
    _, ratings = rate(match, 0.1, weights={sid(1): 1.5})
    assert ratings[0].steamid == sid(1)


def test_duel_chance_weapons_health_and_flank():
    rifle = Player("a", team="CT", health=100, armor=100, weapon_type="Rifle")
    pistol = Player("b", team="T", health=100, armor=0, weapon="weapon_glock", weapon_type="Pistol")
    assert duel_chance(rifle, pistol, 1, 1, True, True) > 0.65
    hurt = Player("c", team="CT", health=10, armor=0, weapon_type="Rifle")
    assert duel_chance(hurt, rifle, 1, 1, True, True) < 0.4
    assert duel_chance(pistol, rifle, 1, 1, True, False) > duel_chance(pistol, rifle, 1, 1, True, True)


def test_form_from_match_data():
    match = Match()
    match.round, match.round_phase = 10, "freezetime"
    star = Player("s", kills=20, deaths=4, damage=1300)
    weak = Player("w", kills=3, deaths=9, damage=350)
    assert form(star, match) > 1.15 and form(weak, match) < 0.9


def test_no_flapping_between_similar_players():
    players = lineup(p0={"pos": (0, 0, 0), "fwd": (1, 0, 0)}, p5={"pos": (800, 0, 0), "fwd": (-1, 0, 0)},
                     p1={"pos": (0, 40000, 0), "fwd": (1, 0, 0)}, p6={"pos": (850, 40000, 0), "fwd": (-1, 0, 0)})
    match = Match()
    match.update(post(players, observed=1), 0.0)
    director, ratings = rate(match, 0.1)
    director.switched(sid(1), 0.0)
    for step in range(1, 60):
        now = step * 0.1
        director, ratings = rate(match, now, director=director)
        assert director.decide(match, ratings, sid(1), now) is None


def test_kill_pulls_camera_after_dwell():
    match = Match()
    director = Director()
    match.update(post(lineup(), observed=1), 0.0)
    director.switched(sid(1), 0.0)
    events = match.update(post(lineup(p3={"kills": 1, "round_kills": 1}), observed=1), 0.5)
    director.feed(events, match)
    _, ratings = rate(match, 0.6, director=director)
    decision = director.decide(match, ratings, sid(1), 0.6)
    assert decision is None or decision.steamid == sid(3)      # a jump may cut early, never elsewhere
    _, ratings = rate(match, 3.0, director=director)
    decision = director.decide(match, ratings, sid(1), 3.0)
    assert decision and decision.steamid == sid(3) and decision.reason == "kill"


def test_freezetime_shows_most_important_player():
    match = Match()
    match.update(post(lineup(), phase="freezetime", observed=1), 0.0)
    director, ratings = rate(match, 5.0, weights={sid(7): 1.8})
    decision = director.decide(match, ratings, sid(1), 5.0)
    assert decision and decision.steamid == sid(7)


def test_defuse_shows_defender_who_can_stop_it():
    dead = {f"p{i}": {"hp": 0} for i in (1, 2, 3, 4, 6, 7, 8, 9)}
    players = lineup(**dead, p0={"pos": (0, 0, 0)}, p5={"pos": (1500, 0, 0), "fwd": (0, 1, 0)})
    match = Match()
    match.update(post(players, bomb={"state": "defusing", "player": sid(0), "position": "0, 0, 0"}), 0.0)
    _, ratings = rate(match, 0.1)
    reasons = {r.steamid: r.parts for r in ratings}
    assert "stop_defuse" in reasons[sid(5)] and "defuse" in reasons[sid(0)]


# --- engine with a fake camera ---

class FakeNetcon:
    connected = True


class FakeCamera:
    def __init__(self):
        self.sent = []
        self.netcon = FakeNetcon()
        self.available = True

    def mode(self):
        return "netcon" if self.available else "none"

    def status(self):
        return {"mode": self.mode(), "netcon": self.available, "keys_available": False, "foreground": None}

    def spectate(self, name, steamid, slot):
        if self.available:
            self.sent.append(steamid)
        return self.available

    def set_xray(self, on):
        self.sent.append(f"xray {on}")
        return True

    def apply_settings(self):
        pass


class Clock:
    def __init__(self):
        self.now = 100.0

    def __call__(self):
        return self.now


@pytest.fixture
def engine(tmp_path):
    settings = Settings(tmp_path)
    settings.token = TOKEN
    clock = Clock()
    engine = Engine(settings, FakeCamera(), Recorder(tmp_path), 8790, clock)
    engine.clock_ = clock
    return engine


def test_engine_token_and_switching(engine):
    assert engine.on_gsi(post(lineup(), token="falsch")) == 403
    assert engine.on_gsi("kein json") == 400
    assert engine.on_gsi(post(lineup(), observed=0)) == 200
    engine.apply_settings({"enabled": True})
    engine.clock_.now += 0.2
    engine.on_gsi(post(lineup(p0={"hp": 0}), observed=0))
    engine.tick()
    switched = [s for s in engine.camera.sent if s.startswith("7656")]
    assert switched and switched[-1] != sid(0)
    state = engine.state()
    assert state["receiving"] and len(state["teams"][0]["players"]) == 5
    assert json.dumps(state)                                     # page gets plain JSON


def test_click_pauses_and_timer_returns(engine):
    engine.on_gsi(post(lineup(), observed=0))
    engine.apply_settings({"enabled": True, "return_timer": True, "return_seconds": 5})
    ok, _ = engine.show(sid(7))
    assert ok and engine.paused and engine.camera.sent[-1] == sid(7)
    engine.clock_.now += 3
    engine.on_gsi(post(lineup(), observed=7))
    engine.tick()
    assert engine.paused
    engine.clock_.now += 3
    engine.on_gsi(post(lineup(), observed=7))
    engine.tick()
    assert not engine.paused


def test_switch_in_cs2_pauses_until_button(engine):
    engine.apply_settings({"enabled": True, "return_timer": True, "return_seconds": 10})
    engine.on_gsi(post(lineup(), observed=0))
    engine.clock_.now += 5
    engine.on_gsi(post(lineup(), observed=2))
    assert engine.paused and engine.paused_until == engine.clock_.now + 10
    engine.clock_.now += 8
    engine.on_gsi(post(lineup(), observed=3))                   # still switching by hand: timer starts again
    assert engine.paused_until == engine.clock_.now + 10
    engine.resume()
    engine.apply_settings({"return_timer": False})
    engine.on_gsi(post(lineup(), observed=0))
    engine.clock_.now += 5
    engine.on_gsi(post(lineup(), observed=4))                   # observer pressed a key in CS2
    assert engine.paused and engine.paused_until is None
    engine.clock_.now += 100
    engine.on_gsi(post(lineup(), observed=4))
    engine.tick()
    assert engine.paused
    engine.resume()
    assert not engine.paused


def test_cs2_moving_on_from_dead_player_is_no_takeover(engine):
    engine.apply_settings({"enabled": True})
    engine.on_gsi(post(lineup(), observed=0))
    engine.clock_.now += 5
    engine.on_gsi(post(lineup(p0={"hp": 0}), observed=0))
    engine.clock_.now += 0.1
    engine.on_gsi(post(lineup(p0={"hp": 0}), observed=3))
    assert not engine.paused


def test_recording_and_replay(engine, tmp_path):
    engine.set_recording(True)
    engine.on_gsi(post(lineup(), observed=0))
    engine.clock_.now += 0.5
    engine.on_gsi(post(lineup(p0={"hp": 0}), observed=0))
    path = engine.recorder.path
    engine.set_recording(False)
    records = load(path)
    assert len(records) == 2 and "auth" not in records[0]["gsi"]
    records[1]["t"] = records[0]["t"] + 0.5
    result = simulate(records)
    assert result["posts"] == 2 and result["switches"]


# --- settings ---

def test_settings_validate_and_persist(tmp_path):
    settings = Settings(tmp_path)
    changed = settings.apply({"return_seconds": 0, "netcon_port": "x", "camera_mode": "irgendwas", "xray": "ja",
                              "data_mix": 7, "netcon_host": "a b", "unknown": 1,
                              "player_weights": {sid(1): {"weight": 9, "name": "donk"}, sid(2): {"weight": "x"}}})
    assert set(changed) == {"data_mix", "player_weights"}
    assert settings["data_mix"] == 1.0 and settings.player_weight(sid(1)) == 2.0 and settings.player_weight(sid(2)) == 1.0
    again = Settings(tmp_path)
    assert again.player_weight(sid(1)) == 2.0 and again.token == settings.token and len(settings.token) >= 16


# --- cfg file ---

def test_cfg_file(tmp_path):
    with pytest.raises(ValueError):
        write_cfg(str(tmp_path), "http://127.0.0.1:8790/gsi", TOKEN)
    folder = tmp_path / "game" / "csgo" / "cfg"
    folder.mkdir(parents=True)
    path = write_cfg(str(folder), "http://127.0.0.1:8790/gsi", TOKEN)
    text = (folder / CFG_FILE_NAME).read_text()
    assert path.endswith(CFG_FILE_NAME) and TOKEN in text and '"allplayers_position" "1"' in text
    assert cfg_installed(str(folder), TOKEN) and not cfg_installed(str(folder), "x" * 32)


# --- camera ---

def test_spectate_command_never_breaks_the_console():
    assert camera_module.spectate_command("donk", sid(1), "name") == 'spec_player "donk"'
    assert camera_module.spectate_command('a"; quit', sid(1), "name") == f"spec_player_by_accountid {BASE_ID + 1 - camera_module.STEAMID64_BASE}"
    assert camera_module.spectate_command("x", "kaputt", "accountid") is None


def test_netcon_sends_commands():
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen(1)
    port = listener.getsockname()[1]
    received = []

    def serve():
        connection, _ = listener.accept()
        connection.settimeout(3)
        data = b""
        while b"\n" not in data:
            data += connection.recv(1024)
        received.append(data.decode())
        connection.close()

    threading.Thread(target=serve, daemon=True).start()
    client = camera_module.NetconClient(lambda *a: None)
    client.configure("127.0.0.1", port)
    client.start()
    try:
        for _ in range(50):
            if client.connected:
                break
            time.sleep(0.05)
        assert client.send('spec_player "donk"')
        for _ in range(50):
            if received:
                break
            time.sleep(0.05)
        assert received == ['spec_player "donk"\n']
    finally:
        client.stop()
        listener.close()


# --- server ---

@pytest.fixture
def server(engine):
    srv = make_server(engine, 0)
    port = srv.server_address[1]
    srv.RequestHandlerClass = __import__("auto_observer.server", fromlist=["make_handler"]).make_handler(engine, port)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield port
    srv.shutdown()
    srv.server_close()


def request(port, method, path, body=None, headers=None):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    data = json.dumps(body).encode() if body is not None else None
    all_headers = {"Host": f"127.0.0.1:{port}", "Content-Type": "application/json"}
    all_headers.update(headers or {})
    connection.request(method, path, body=data, headers=all_headers)
    answer = connection.getresponse()
    return answer.status, answer.read()


def test_server_routes_and_safety(server):
    port = server
    assert request(port, "GET", "/")[0] == 200
    assert request(port, "GET", "/app.js")[0] == 200
    assert request(port, "GET", "/", headers={"Host": "evil.example:80"})[0] == 403
    assert request(port, "POST", "/gsi", post(lineup()))[0] == 200
    assert request(port, "POST", "/gsi", post(lineup(), token="nope"))[0] == 403
    # without the header a foreign page could post; it must be refused
    assert request(port, "POST", "/api/settings", {"enabled": True})[0] == 403
    status, body = request(port, "POST", "/api/settings", {"enabled": True}, {"X-Auto-Observer": "1"})
    assert status == 200 and json.loads(body)["changed"] == ["enabled"]
    status, body = request(port, "GET", "/api/state")
    state = json.loads(body)
    assert status == 200 and state["settings"]["enabled"] and state["teams"][1]["name"] == "Bravo"
    status, _ = request(port, "POST", "/api/show", {"steamid": sid(6)}, {"X-Auto-Observer": "1"})
    assert status == 200
