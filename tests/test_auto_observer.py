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
    def __init__(self):
        self.connected = True


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


# --- setup and starting CS2 ---

def test_launch_options():
    from auto_observer.launcher import launch_command, launch_options
    assert launch_options(54545, "") == ["-netconport", "54545", "-insecure"]
    assert launch_options(2121, "-novid  -console -netconport 1 -insecure\n+exec x") == [
        "-netconport", "2121", "-insecure", "-novid", "-console", "+exec", "x"]
    assert launch_command("steam.exe", 2121, "")[:3] == ["steam.exe", "-applaunch", "730"]


def test_auto_setup_and_launch(engine, tmp_path, monkeypatch):
    from auto_observer import engine as engine_module
    cfg = tmp_path / "lib" / "game" / "csgo" / "cfg"
    cfg.mkdir(parents=True)
    monkeypatch.setattr(engine_module, "find_cfg_folders", lambda: [str(cfg)])
    monkeypatch.setattr(engine_module, "find_steam_exe", lambda: "C:/Steam/steam.exe")
    started = []
    monkeypatch.setattr(engine_module.launcher, "start", started.append)
    monkeypatch.setattr(engine_module.launcher, "cs2_running", lambda: False)

    engine.auto_setup()
    assert engine.settings["cfg_folder"] == str(cfg) and cfg_installed(str(cfg), TOKEN)
    setup = engine.state()["setup"]
    assert setup["installed"] and setup["steam"] == "C:/Steam/steam.exe" and "-netconport 54545 -insecure" in setup["command"]

    ok, _ = engine.launch_cs2()                     # console already connected: nothing to start
    assert not ok and not started
    engine.camera.netcon.connected = False
    engine.settings.apply({"launch_extra": "-novid"})
    ok, message = engine.launch_cs2()
    assert ok, message
    assert started == [["C:/Steam/steam.exe", "-applaunch", "730", "-netconport", "54545", "-insecure", "-novid"]]
    monkeypatch.setattr(engine_module.launcher, "cs2_running", lambda: True)
    ok, message = engine.launch_cs2()               # running without console port: must be closed first
    assert not ok and "beenden" in message and len(started) == 1


def test_cs2_running_survives_any_console_encoding(monkeypatch):
    from auto_observer import launcher
    monkeypatch.setattr(launcher.sys, "platform", "win32")
    monkeypatch.setattr(launcher.subprocess, "CREATE_NO_WINDOW", 0x08000000, raising=False)
    answers = {"out": "Informationen: Es werden keine Aufgaben mit den angegebenen Kriterien ausgef\x81hrt.".encode("latin-1")}

    def run(*args, **kwargs):
        return launcher.subprocess.CompletedProcess(args, 0, answers["out"], b"")

    monkeypatch.setattr(launcher.subprocess, "run", run)
    assert launcher.cs2_running() is False
    answers["out"] = b"cs2.exe                      12345 Console                    1  2.000.000 K"
    assert launcher.cs2_running() is True
    answers["out"] = None
    assert launcher.cs2_running() is False


def test_server_answers_even_when_something_breaks(server, engine, monkeypatch):
    def broken():
        raise AttributeError("kaputt")
    monkeypatch.setattr(engine, "launch_cs2", broken)
    status, body = request(server, "POST", "/api/launch", {}, {"X-Auto-Observer": "1"})
    assert status == 500 and not json.loads(body)["ok"]


# --- feedback from the first real test: kill hold, faster cut on death, standoff, variety ---

def test_stays_on_killer_for_a_moment():
    match, director = Match(), Director()
    match.update(post(lineup(), observed=0), 0.0)
    director.switched(sid(0), -10.0)
    dead = {f"p{i}": {"hp": 0} for i in range(1, 5)}                 # big moment elsewhere: P5 clutch-like
    match.update(post(lineup(p0={"kills": 1, "round_kills": 1}, **dead), observed=0), 0.5)
    director.feed(match.recent_events("kill", 0), match)
    _, ratings = rate(match, 0.9, director=director)
    assert director.decide(match, ratings, sid(0), 0.9) is None      # 0.4 s after his kill: stay


def test_cuts_to_the_killer_when_shown_player_dies():
    players = lineup(p0={"pos": (0, 0, 0)}, p5={"pos": (900, 0, 0)}, p6={"pos": (0, 9000, 0)})
    match, director = Match(), Director()
    match.update(post(players, observed=0), 0.0)
    director.switched(sid(0), 0.0)
    players = lineup(p0={"pos": (0, 0, 0), "hp": 0}, p5={"pos": (900, 0, 0), "kills": 1, "round_kills": 1},
                     p6={"pos": (0, 9000, 0)})
    director.feed(match.update(post(players, observed=0), 0.3), match)
    _, ratings = rate(match, 0.3, director=director)
    decision = director.decide(match, ratings, sid(0), 0.3)
    assert decision and decision.steamid == sid(5) and decision.reason == "killer"


def test_standoff_loses_against_a_real_fight():
    # P0/P5 look at each other (through a wall?) for long; P1/P6 just started shooting
    players = lineup(p0={"pos": (0, 0, 0), "fwd": (1, 0, 0)}, p5={"pos": (800, 0, 0), "fwd": (-1, 0, 0)},
                     p1={"pos": (0, 40000, 0), "fwd": (1, 0, 0)}, p6={"pos": (1500, 40000, 0), "fwd": (0, 1, 0)})
    match, director = Match(), Director()
    match.update(post(players), 0.0)
    rate(match, 0.0, director=director)
    for step in range(1, 81):
        now = step * 0.1
        if step == 75:
            players[sid(1)]["weapons"]["weapon_1"]["ammo_clip"] = 24          # P1 starts shooting
        director.feed(match.update(post(players), now), match)
        _, ratings = rate(match, now, director=director)
    scores = {r.steamid: r for r in ratings}
    assert scores[sid(1)].score > scores[sid(0)].score


def test_variety_in_buy_time():
    match, director = Match(), Director()
    match.update(post(lineup(), phase="freezetime", observed=0), 0.0)
    director.switched(sid(0), 0.0)
    _, ratings = rate(match, 2.0, director=director)
    assert director.decide(match, ratings, sid(0), 2.0) is None
    _, ratings = rate(match, 5.5, director=director)
    decision = director.decide(match, ratings, sid(0), 5.5)
    assert decision and match.players[decision.steamid].team == "T"
    director.switched(decision.steamid, 5.5)
    _, ratings = rate(match, 11.0, director=director)
    again = director.decide(match, ratings, decision.steamid, 11.0)
    assert again and match.players[again.steamid].team == "CT" and again.steamid != sid(0)   # not shown yet


def test_engine_cuts_at_once_when_shown_player_dies(engine):
    engine.apply_settings({"enabled": True})
    engine.on_gsi(post(lineup(), observed=0))
    engine.clock_.now += 3
    engine.on_gsi(post(lineup(), observed=0))
    sent = len(engine.camera.sent)
    engine.clock_.now += 0.1
    engine.on_gsi(post(lineup(p0={"hp": 0}), observed=0))     # no tick in between
    assert len(engine.camera.sent) == sent + 1 and engine.camera.sent[-1] != sid(0)


def test_aimed_shooting_elsewhere_wins_over_a_quiet_duel():
    # camera on P0, who faces P5 (fresh duel, nobody shoots); far away P1 shoots at P6 – and misses
    players = lineup(p0={"pos": (0, 0, 0), "fwd": (1, 0, 0)}, p5={"pos": (700, 0, 0), "fwd": (-1, 0, 0)},
                     p1={"pos": (0, 40000, 0), "fwd": (1, 0, 0)}, p6={"pos": (1400, 40000, 0), "fwd": (0, 1, 0)})
    match, director = Match(), Director()
    match.update(post(players, observed=0), 0.0)
    director.switched(sid(0), 0.0)
    rate(match, 0.0, director=director)
    for step in range(1, 40):
        now = step * 0.1
        if step == 30:
            players[sid(1)]["weapons"]["weapon_1"]["ammo_clip"] = 27
        director.feed(match.update(post(players, observed=0), now), match)
        _, ratings = rate(match, now, director=director)
        decision = director.decide(match, ratings, sid(0), now)
        if step < 30:
            assert decision is None or decision.steamid != sid(1)
        elif decision:
            break
    assert decision and decision.steamid == sid(1) and decision.reason == "shots" and decision.detail == "P6"
    assert now <= 3.1                                                     # at once, not after a long dwell


def test_no_cut_away_from_a_player_who_is_shooting_himself():
    players = lineup(p0={"pos": (0, 0, 0), "fwd": (1, 0, 0)}, p5={"pos": (700, 0, 0), "fwd": (-1, 0, 0)},
                     p1={"pos": (0, 40000, 0), "fwd": (1, 0, 0)}, p6={"pos": (1400, 40000, 0), "fwd": (0, 1, 0)})
    match, director = Match(), Director()
    match.update(post(players, observed=0), 0.0)
    director.switched(sid(0), 0.0)
    players[sid(0)]["weapons"]["weapon_1"]["ammo_clip"] = 28
    players[sid(1)]["weapons"]["weapon_1"]["ammo_clip"] = 28
    director.feed(match.update(post(players, observed=0), 1.5), match)
    _, ratings = rate(match, 1.6, director=director)
    decision = director.decide(match, ratings, sid(0), 1.6)
    assert decision is None or decision.steamid != sid(1) or decision.reason != "shots"


def test_grenade_thrower_is_shown_when_nothing_else_happens():
    match, director = Match(), Director()
    first = post(lineup(), observed=0)
    first["grenades"] = {"10": {"owner": sid(6), "type": "smoke", "position": "0, 0, 0", "lifetime": "3.0"}}
    assert match.update(first, 0.0) == []                       # already flying when the app starts: no throw
    director.switched(sid(0), 0.0)
    second = post(lineup(), observed=0)
    second["grenades"] = dict(first["grenades"], **{
        "11": {"owner": sid(7), "type": "flashbang", "position": "0, 0, 0", "lifetime": "0.1"},
        "12": {"owner": sid(8), "type": "inferno", "flames": {}}})
    events = match.update(second, 2.0)
    assert [(e.kind, e.steamid, e.detail) for e in events] == [("throw", sid(7), "flashbang")]
    director.feed(events, match)
    _, ratings = rate(match, 2.1, director=director)
    decision = director.decide(match, ratings, sid(0), 2.1)
    assert decision and decision.steamid == sid(7) and decision.reason == "nade" and decision.detail == "flashbang"


def test_one_fight_in_focus_kill_elsewhere_does_not_pull():
    players = lineup(p0={"pos": (0, 0, 0), "fwd": (1, 0, 0)}, p5={"pos": (700, 0, 0), "fwd": (-1, 0, 0)})
    match, director = Match(), Director()
    match.update(post(players, observed=0), 0.0)
    director.switched(sid(0), 0.0)
    players[sid(0)]["weapons"]["weapon_1"]["ammo_clip"] = 26                    # P0 fights P5
    players[sid(8)]["match_stats"]["kills"] = 1                                 # P8 kills elsewhere
    players[sid(8)]["state"]["round_kills"] = 1
    players[sid(3)]["state"]["health"] = 0
    director.feed(match.update(post(players, observed=0), 3.0), match)
    for now in (3.1, 4.0, 5.0):
        _, ratings = rate(match, now, director=director)
        assert director.decide(match, ratings, sid(0), now) is None


# --- duel details: bullets, reloading, secondary, distance, helmet, grenades; looking ahead ---

def armed(steamid, team, *weapons, health=100, armor=100, helmet=True):
    from auto_observer.game import Weapon
    player = Player(steamid, team=team, health=health, armor=armor, helmet=helmet)
    player.weapons = [Weapon(*w) for w in weapons]
    active = next((w for w in player.weapons if w.state in ("active", "reloading")), None)
    if active:
        player.weapon, player.weapon_type, player.clip = active.name, active.type, active.clip
    return player


def test_duel_chance_uses_ammo_secondary_distance_and_gear():
    ak = ("weapon_ak47", "Rifle", 30, 30, "active")
    full = armed("a", "T", ak)
    empty = armed("b", "CT", ("weapon_m4a1", "Rifle", 0, 25, "active"))
    reloading = armed("c", "CT", ("weapon_m4a1", "Rifle", 5, 25, "reloading"))
    with_pistol = armed("d", "CT", ("weapon_m4a1", "Rifle", 0, 25, "holstered"), ("weapon_usp_silencer", "Pistol", 12, 12, "active"))
    assert duel_chance(full, empty, 1, 1, True, True) > 0.8
    assert duel_chance(full, reloading, 1, 1, True, True) > 0.7
    assert 0.5 < duel_chance(full, with_pistol, 1, 1, True, True) < duel_chance(full, empty, 1, 1, True, True)
    awp = armed("e", "CT", ("weapon_awp", "SniperRifle", 5, 5, "active"))
    assert duel_chance(awp, full, 1, 1, True, True, gap=2000) > duel_chance(awp, full, 1, 1, True, True, gap=300)
    shotgun = armed("f", "CT", ("weapon_nova", "Shotgun", 8, 8, "active"))
    assert duel_chance(shotgun, full, 1, 1, True, True, gap=200) > duel_chance(shotgun, full, 1, 1, True, True, gap=1000)
    no_helmet = armed("g", "CT", ("weapon_m4a1", "Rifle", 25, 25, "active"), helmet=False)
    helmet = armed("h", "CT", ("weapon_m4a1", "Rifle", 25, 25, "active"))
    assert duel_chance(helmet, full, 1, 1, True, True) > duel_chance(no_helmet, full, 1, 1, True, True)
    nades = armed("i", "CT", ("weapon_m4a1", "Rifle", 25, 25, "active"), ("weapon_flashbang", "Grenade", -1, -1, "holstered"),
                  ("weapon_hegrenade", "Grenade", -1, -1, "holstered"))
    assert duel_chance(nades, full, 1, 1, True, True) > duel_chance(helmet, full, 1, 1, True, True)


def test_players_running_into_each_other_count_before_they_see_each_other():
    match, director = Match(), Director()
    # P0 runs east, P5 runs west, 1700 apart, both looking north (not at each other)
    for step in range(6):
        now = step * 0.1
        players = lineup(p0={"pos": (step * 25, 0, 0), "fwd": (0, 1, 0)}, p5={"pos": (1700 - step * 25, 0, 0), "fwd": (0, 1, 0)})
        director.feed(match.update(post(players), now), match)
    _, ratings = rate(match, 0.5, director=director)
    parts = {r.steamid: r.parts for r in ratings}
    assert "contact" in parts[sid(0)] and "contact" in parts[sid(5)]
    still = Match()
    still.update(post(lineup(p0={"pos": (0, 0, 0), "fwd": (0, 1, 0)}, p5={"pos": (1500, 0, 0), "fwd": (0, 1, 0)})), 0.0)
    _, ratings = rate(still, 0.1)
    assert all("contact" not in r.parts for r in ratings)


# --- predictions: trades, swing on reload, flash peek, sneaking, round time, bomb, utility, roles ---

def feed_frames(frames, director=None, start=0.0, step=0.1):
    """Feed a list of GSI posts (one every `step` seconds); returns match, director and the last ratings."""
    match, director = Match(), director or Director()
    now = start
    for frame in frames:
        director.feed(match.update(frame, now), match)
        _, ratings = rate(match, now, director=director)
        now += step
    return match, director, {r.steamid: r for r in ratings}


def moving(pid, start, end, frames, **extra):
    """Positions of one player moving from start to end over `frames` posts."""
    return [dict({"pos": tuple(s + (e - s) * i / max(1, frames - 1) for s, e in zip(start, end))}, **extra) for i in range(frames)]


def test_teammate_going_for_the_trade():
    frames = []
    p1_path = moving(1, (0, 2000, 0), (0, 1700, 0), 8, fwd=(0, -1, 0))
    for i in range(8):
        dead = {"hp": 0} if i >= 2 else {}
        kills = {"kills": 1, "round_kills": 1} if i >= 2 else {}
        frames.append(post(lineup(p0=dict({"pos": (0, 0, 0)}, **dead), p5=dict({"pos": (0, 900, 0), "fwd": (0, -1, 0)}, **kills),
                                  p1=p1_path[i])))
    match, _, ratings = feed_frames(frames)
    assert "trade_try" in ratings[sid(1)].parts and ratings[sid(1)].parts["trade_try"] > 0
    assert match.opening_kills == {sid(5): 1} and match.opening_deaths == {sid(0): 1}


def test_swing_on_reloader_and_flash_peek_and_sneak():
    frames = []
    path = moving(0, (0, 0, 0), (0, 300, 0), 8, fwd=(0, 1, 0))
    for i in range(8):
        players = lineup(p0=path[i], p5={"pos": (0, 1200, 0), "fwd": (1, 0, 0)})
        players[sid(5)]["weapons"]["weapon_1"]["state"] = "reloading"
        frames.append(post(players))
    _, _, ratings = feed_frames(frames)
    assert "swing" in ratings[sid(0)].parts

    frames = [post(lineup(p0={"pos": (0, 0, 0), "fwd": (0, 1, 0)}, p5={"pos": (0, 1000, 0), "fwd": (1, 0, 0), "flashed": 255}))] * 3
    _, _, ratings = feed_frames(frames)
    assert "flash_peek" in ratings[sid(0)].parts

    # P0 walks slowly (≈100 u/s) towards P5, who looks the other way
    path = moving(0, (0, 0, 0), (0, 70, 0), 8, fwd=(0, 1, 0))
    frames = [post(lineup(p0=path[i], p5={"pos": (0, 1300, 0), "fwd": (0, 1, 0)})) for i in range(8)]
    _, _, ratings = feed_frames(frames)
    assert "sneak" in ratings[sid(0)].parts


def test_round_time_and_bomb():
    setup = lineup(p0={"pos": (0, 0, 0), "fwd": (1, 0, 0)}, p5={"pos": (800, 0, 0), "fwd": (-1, 0, 0)})
    early, late = post(setup), post(setup)
    early["phase_countdowns"] = {"phase": "live", "phase_ends_in": "80.0"}
    late["phase_countdowns"] = {"phase": "live", "phase_ends_in": "10.0"}
    _, _, early_ratings = feed_frames([early])
    _, _, late_ratings = feed_frames([late])
    assert late_ratings[sid(5)].score > early_ratings[sid(5)].score            # T must go
    assert late_ratings[sid(0)].score == pytest.approx(early_ratings[sid(0)].score)

    # bomb planted at (0, 0): CT P1 near with time, CT P2 far away with 3 s left → P2 saves
    bomb = {"state": "planted", "position": "0, 0, 0", "countdown": "3.0"}
    players = lineup(p1={"pos": (0, 300, 0), "fwd": (1, 0, 0)}, p6={"pos": (900, 300, 0), "fwd": (-1, 0, 0)},
                     p2={"pos": (0, 6000, 0), "fwd": (1, 0, 0)}, p7={"pos": (900, 6000, 0), "fwd": (-1, 0, 0)})
    _, _, ratings = feed_frames([post(players, bomb=bomb)])
    assert ratings[sid(2)].score < ratings[sid(7)].score


def test_smokes_together_mean_an_attack():
    smokes = {"1": {"owner": sid(5), "type": "smoke", "position": "0, 0, 0", "effecttime": "1.0"},
              "2": {"owner": sid(6), "type": "smoke", "position": "300, 100, 0", "effecttime": "0.5"}}
    first = post(lineup(p0={"pos": (100, 800, 0)}))
    second = post(lineup(p0={"pos": (100, 800, 0)}))
    second["grenades"] = smokes
    _, _, ratings = feed_frames([first, second])
    assert "execute" in ratings[sid(0)].parts


def test_roles_learned_and_set_by_hand(engine):
    from auto_observer.director import learned_role
    match = Match()
    match.update(post(lineup(p6={"weapon": ("weapon_awp", "SniperRifle", 5)})), 0.0)
    match.opening_kills = {sid(0): 3}
    match.trade_kills = {sid(1): 2}
    assert learned_role(match.players[sid(0)], match) == "entry"
    assert learned_role(match.players[sid(1)], match) == "support"
    assert learned_role(match.players[sid(6)], match) == "awp"
    assert engine.settings.apply({"player_roles": {sid(3): {"role": "lurker", "name": "P3"}, sid(4): {"role": "boss"}}}) == ["player_roles"]
    engine.on_gsi(post(lineup()))
    engine.tick()
    players = {p["steamid"]: p for team in engine.state()["teams"] for p in team["players"]}
    assert players[sid(3)]["role"] == "lurker" and players[sid(3)]["role_used"] == "lurker" and players[sid(4)]["role"] == ""


# --- demo export (without a real demo: synthetic raw data) ---

def write_raw(path):
    """A tiny raw data file: one round, CT P0 and T P5 face each other, P5 shoots and kills P0."""
    import gzip
    from auto_observer.demo_export import FRAME_FIELDS
    meta = {"type": "meta", "version": 1, "map": "de_test", "tickrate": 64, "every": 8, "source": "test.dem",
            "players": {sid(0): "Alpha", sid(5): "Bravo", sid(1): "Charlie"}, "frame_fields": FRAME_FIELDS,
            "rounds": 1, "kills": 1}
    rows = [{"type": "e", "tick": 0, "t": 0.0, "round": 1, "name": "round_freeze_end"}]
    for n in range(0, 40):
        tick = 8 * n
        t = tick / 64
        dead = t > 3.5
        ammo = 30 if t < 2.0 else 24
        rows.append({"type": "f", "tick": tick, "t": t, "round": 1, "freeze": False, "planted": False, "p": [
            [sid(0), "CT", 0, 0, 0, 0.0, 0.0, 0 if dead else 100, 100, True, not dead, "M4A4", 30, 0.0, False, False, 0.0,
             800, 4100, False, False, "Mid", [sid(5)], ["knife", "USP-S", "M4A4"]],
            [sid(5), "T", 800, 0, 0, 180.0, 0.0, 100, 100, True, True, "AK-47", ammo, 0.0, False, False, 0.0,
             800, 3700, False, False, "Connector", [sid(0)], ["knife_t", "Glock-18", "AK-47", "Flashbang"]],
            [sid(1), "CT", 0, 9000, 0, 90.0, 0.0, 100, 100, True, True, "AWP", 5, 0.0, False, False, 0.0,
             800, 5700, False, False, "Window", [], ["knife", "USP-S", "AWP"]],
        ]})
        if tick == 128:
            rows.append({"type": "e", "tick": tick, "t": t, "round": 1, "name": "weapon_fire", "player": sid(5), "weapon": "weapon_ak47"})
    rows.append({"type": "e", "tick": 228, "t": 228 / 64, "round": 1, "name": "player_hurt", "attacker": sid(5),
                 "victim": sid(0), "dmg": 100, "hitgroup": "head", "weapon": "ak47"})
    rows.append({"type": "e", "tick": 228, "t": 228 / 64, "round": 1, "name": "player_death", "attacker": sid(5),
                 "victim": sid(0), "weapon": "ak47", "headshot": True})
    rows.sort(key=lambda r: (r["tick"], r["type"] != "f"))
    with gzip.open(path, "wt", encoding="utf-8") as out:
        for row in [meta] + rows:
            out.write(json.dumps(row) + "\n")


def test_demo_replay_measures_the_director(tmp_path):
    from auto_observer.demo_replay import evaluate, report
    path = tmp_path / "x.rohdaten.jsonl.gz"
    write_raw(path)
    result = evaluate(str(path))
    assert result["kills"] == 1 and result["map"] == "de_test"
    assert result["seen"] == 1                      # a real duel at 800 units: the camera must be on it
    text = report(result)
    assert "1 Kills" in text and "gesehen" in text


def test_round_text_is_short_and_readable(tmp_path):
    from auto_observer.demo_export import round_text
    path = tmp_path / "x.rohdaten.jsonl.gz"
    write_raw(path)
    text = round_text(path, 1)
    assert "Bravo T 800,0" in text and "player_death attacker=Bravo victim=Alpha" in text and "[Bravo]" in text
    assert "nicht gefunden" in round_text(path, 7)


def test_unpack_downloads(tmp_path):
    import gzip as gz
    import zipfile
    from auto_observer.demo_export import unpack
    demo = tmp_path / "a.dem"
    demo.write_bytes(b"PBDEMS2\x00" + b"x" * 100)
    with zipfile.ZipFile(tmp_path / "hltv.zip", "w") as archive:
        archive.write(demo, "match/de_mirage.dem")
        archive.writestr("readme.txt", "nope")
    with gz.open(tmp_path / "b.dem.gz", "wb") as packed:
        packed.write(demo.read_bytes())
    work = tmp_path / "work"
    work.mkdir()
    found = unpack(tmp_path / "hltv.zip", work, lambda *a: None)
    assert [p.name for p in found] == ["de_mirage.dem"] and found[0].read_bytes() == demo.read_bytes()
    assert unpack(tmp_path / "b.dem.gz", work, lambda *a: None)[0].read_bytes() == demo.read_bytes()
    assert unpack(demo, work, lambda *a: None) == [demo]
    with pytest.raises(ValueError):
        unpack(tmp_path / "readme.txt", work, lambda *a: None)


def test_demo_area_on_the_server(engine, tmp_path):
    from auto_observer.demo_jobs import DemoJobs
    demos = DemoJobs(tmp_path, lambda *a: None)
    demos.folder.mkdir(parents=True)
    write_raw(demos.folder / "x.rohdaten.jsonl.gz")
    srv = make_server(engine, 0, demos)
    port = srv.server_address[1]
    srv.RequestHandlerClass = __import__("auto_observer.server", fromlist=["make_handler"]).make_handler(engine, port, demos)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        header = {"X-Auto-Observer": "1"}
        status, body = request(port, "POST", "/api/demo/round", {"file": "x.rohdaten.jsonl.gz", "round": 1}, header)
        assert status == 200 and "Bravo" in json.loads(body)["text"]
        status, body = request(port, "POST", "/api/demo/evaluate", {"file": "x.rohdaten.jsonl.gz"}, header)
        assert status == 200 and "de_test" in json.loads(body)["text"]
        for name in ("../settings.json", "x.rohdaten.jsonl.gz/../../settings.json", ""):
            assert request(port, "POST", "/api/demo/round", {"file": name, "round": 1}, header)[0] == 400
        status, body = request(port, "GET", "/api/state")
        assert json.loads(body)["demo"]["results"][0]["file"] == "x.rohdaten.jsonl.gz"
        status, _ = request(port, "POST", "/api/demo/faceit", {"link": "keine id"}, header)
        assert status == 409
    finally:
        srv.shutdown()
        srv.server_close()


def test_map_knowledge_learns_where_fights_happen(tmp_path):
    from auto_observer.map_knowledge import MapKnowledge, build, save
    path = tmp_path / "x.rohdaten.jsonl.gz"
    write_raw(path)
    knowledge = build([str(path)])
    assert set(knowledge) == {"de_test"}
    save(knowledge, tmp_path / "map_data")
    know = MapKnowledge.load_folder(tmp_path / "map_data")
    assert know.knows("de_test") and not know.knows("de_other")
    assert know.place("de_test", (800, 0, 0)) == "Connector" and know.place("de_test", (0, 9000, 0)) == "Window"
    assert know.place("de_test", (850, 30, 0)) == "Connector"                  # a neighbour cell
    hot = know.fight_chance("de_test", (800, 0, 0), (0, 0, 0))                  # T in Connector vs CT in Mid
    cold = know.fight_chance("de_test", (800, 0, 0), (0, 9000, 0))              # vs CT in Window
    assert hot > cold > 0 and know.fight_chance("de_other", (0, 0, 0), (1, 1, 1)) is None


# --- Leetify ---

class FakeAnswer:
    def __init__(self, data):
        self.data = json.dumps(data).encode()

    def read(self, limit=None):
        return self.data

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def leetify_profile(aim, opening, trades):
    return {"name": "x", "steam64_id": "1", "rating": {"aim": aim, "positioning": 50, "utility": 50, "clutch": 0.1,
            "opening": opening, "ct_leetify": 0.0, "t_leetify": 0.0},
            "stats": {"t_opening_aggression_success_rate": opening * 100, "ct_opening_duel_success_percentage": 50,
                      "trade_kill_opportunities_per_round": trades, "trade_kills_success_percentage": 40}}


def test_leetify_profiles_form_and_roles(tmp_path):
    import urllib.error
    from auto_observer.leetify import LeetifyScout
    seen_headers = []
    profiles = {sid(0): leetify_profile(95, 0.1, 0.1), sid(1): leetify_profile(60, -0.05, 0.4),
                sid(2): leetify_profile(70, 0.0, 0.2), sid(3): leetify_profile(65, -0.02, 0.1)}

    def opener(request, timeout):
        seen_headers.append(dict(request.header_items()))
        steamid = request.full_url.split("steam64_id=")[1]
        if steamid not in profiles:
            raise urllib.error.HTTPError(request.full_url, 404, "not found", {}, None)
        return FakeAnswer(profiles[steamid])

    scout = LeetifyScout(tmp_path, lambda *a: None, opener)
    assert scout.set_key("not a key!")[0] is False
    ok, _ = scout.set_key("abcd1234-0000-0000-0000-000000000000")
    assert ok
    scout.request([sid(i) for i in range(5)])
    for _ in range(100):
        if not scout.state([sid(i) for i in range(5)])["busy"]:
            break
        time.sleep(0.05)
    state = scout.state([sid(i) for i in range(5)])
    assert state["loaded"] == 4 and state["key"] and not state["error"]
    assert all("Bearer abcd1234" in h.get("Authorization", "") for h in seen_headers)
    priors = scout.form_priors([sid(i) for i in range(5)])
    assert priors[sid(0)] > 1.05 > priors[sid(1)] and sid(4) not in priors
    roles = scout.roles({"CT": [sid(0), sid(1), sid(2), sid(3)]})
    assert roles[sid(0)] == "entry" and roles[sid(1)] == "support"
    cache = (tmp_path / "leetify-cache.json").read_text()
    assert "abcd1234" not in cache and sid(0) in cache                     # the key is never written to a file
    again = LeetifyScout(tmp_path, lambda *a: None, opener)                 # cached for a day
    assert again.profile(sid(0))["aim"] == 95


def test_leetify_start_value_in_the_director():
    match = Match()
    match.update(post(lineup(), phase="freezetime", round_number=0), 0.0)
    player = match.players[sid(0)]
    assert form(player, match, 1.2) == pytest.approx(1.2)                    # before the first round: Leetify only
    match.round, match.round_phase = 8, "live"
    assert form(player, match, 1.2) == pytest.approx(form(player, match, 1.0))   # after 8 rounds: the match only


def test_leetify_key_never_reaches_the_page(engine):
    ok, _ = engine.set_leetify_key("abcd1234-1111-2222-3333-444444444444")
    assert ok
    engine.on_gsi(post(lineup()))
    text = json.dumps(engine.state())
    assert "abcd1234" not in text and engine.state()["leetify"]["key"] is True
    assert "abcd1234" not in json.dumps(list(engine.log_lines))
