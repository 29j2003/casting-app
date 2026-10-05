"""CS2 live data (Game State Integration, "GSI").

CS2 posts the game state several times per second. On this PC it posts to
127.0.0.1:8787/api/gsi; an observer PC in the network posts to port 8788, where the
app accepts ONLY these posts and ONLY with its own token. The LAN receiver is off
until the user switches it on.

The processed state ("live") is sent to the overlays and the control page at most
five times per second. CS2 only reports damage and headshots of the running round,
so they are summed up per player here.
"""

import json
import secrets
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

LAN_PORT = 8788
LOCAL_TOKEN = "castoverlay"            # token of cfg files written by older versions for this PC
MAX_BODY = 2_000_000
SEND_INTERVAL = 0.2                    # seconds between live updates


def lan_addresses() -> list[str]:
    """IPv4 addresses of this PC in the local network."""
    addresses = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            address = info[4][0]
            if not address.startswith("127."):
                addresses.add(address)
    except OSError:
        pass
    try:                                       # the address used for outgoing traffic (no packet is sent)
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("10.255.255.255", 1))
            address = probe.getsockname()[0]
            if not address.startswith("127."):
                addresses.add(address)
    except OSError:
        pass
    return sorted(addresses)


def _number(value) -> int:
    """int of a GSI value; anything missing or invalid counts as 0."""
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


class GameStateReceiver:
    """Receives, processes and distributes CS2 game state."""

    def __init__(self, data_dir: Path, broadcast, log):
        """broadcast(event, data) sends to all pages; log(text, level) writes the app log."""
        self._settings_file = data_dir / "gsi.json"
        self._broadcast = broadcast
        self._log = log
        self._lock = threading.Lock()
        # settings (stored in gsi.json and shown on the control page)
        self.settings = {"token": secrets.token_hex(12), "network": False, "sideA": "CT", "teamA": "", "teamB": ""}
        try:
            self.settings.update(json.loads(self._settings_file.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            pass
        self.save_settings()
        self.last_raw: str | None = None       # last post as received
        self.last_time = 0.0
        self.live: dict | None = None          # processed state sent to the pages
        self.source: str | None = None         # "local" or "network"
        self._map_name = None
        self._round = 0
        self._players: dict = {}
        self._previous_score = None
        self._send_timer: threading.Timer | None = None
        self._lan_server: ThreadingHTTPServer | None = None

    # --- settings ---

    def save_settings(self) -> None:
        """Write gsi.json (token, network receiver, sides, team names)."""
        try:
            self._settings_file.write_text(json.dumps(self.settings), encoding="utf-8")
            self._settings_file.chmod(0o600)
        except OSError:
            pass

    def apply_settings(self, changes: dict) -> None:
        """Settings from the control page: LAN receiver, side of team A, team names."""
        if isinstance(changes.get("network"), bool):
            self.settings["network"] = changes["network"]
            self.set_lan_receiver(changes["network"])
        if changes.get("sideA") in ("CT", "T"):
            self.settings["sideA"] = changes["sideA"]
        for key in ("teamA", "teamB"):
            if isinstance(changes.get(key), str):
                self.settings[key] = changes[key][:60]
        self.save_settings()
        with self._lock:
            if self.live:
                self.live["sideA"] = self.settings["sideA"]
                self._broadcast("live", json.dumps(self.live))

    def info(self) -> dict:
        """State for the setup page."""
        return {"token": self.settings["token"], "network": self.lan_receiver_running, "networkWanted": self.settings["network"],
                "port": LAN_PORT, "ips": lan_addresses(), "sideA": self.settings["sideA"],
                "ageMs": int((time.time() - self.last_time) * 1000) if self.last_time else None,
                "source": self.source, "live": self.live}

    # --- receiving ---

    def accept(self, body: str, source: str) -> tuple[int, dict]:
        """Handle one post from CS2. Returns (HTTP status, answer)."""
        try:
            state = json.loads(body)
        except ValueError:
            return 400, {"error": "kein JSON"}
        token = (state.get("auth") or {}).get("token")
        if token != self.settings["token"] and not (source == "local" and token == LOCAL_TOKEN):
            return 403, {"error": "falscher Schlüssel"}
        self.last_raw, self.last_time = body, time.time()
        self._process(state, source)
        return 200, {"ok": True}

    def _process(self, state: dict, source: str) -> None:
        """Turn one CS2 post into the compact live state for the overlays."""
        game_map, round_info = state.get("map") or {}, state.get("round") or {}
        all_players = state.get("allplayers") or {}
        round_number = _number(game_map.get("round"))
        with self._lock:
            # new map or restarted: reset the statistics
            if game_map.get("name") != self._map_name or round_number < self._round:
                self._map_name, self._players, self._previous_score = game_map.get("name"), {}, None
            self._round = round_number
            self._count_damage(all_players, round_number)
            ct, t = game_map.get("team_ct") or {}, game_map.get("team_t") or {}
            self._detect_side_switch(ct, t)
            self._match_team_names(ct, t)
            rounds_played = round_number + (0 if round_info.get("phase") in (None, "", "freezetime") else 1)
            players = [self._player_line(player_id, player, rounds_played) for player_id, player in all_players.items()]
            self.live = {
                "time": int(time.time() * 1000), "source": source, "map": game_map.get("name") or "",
                "phase": game_map.get("phase") or "", "round": round_number, "roundPhase": round_info.get("phase") or "",
                "bomb": round_info.get("bomb") or "",
                "ct": {"name": ct.get("name") or "", "score": _number(ct.get("score"))},
                "t": {"name": t.get("name") or "", "score": _number(t.get("score"))},
                "sideA": self.settings["sideA"], "observed": (state.get("player") or {}).get("steamid") or "",
                "players": players,
            }
            if not self.source:
                self._log(f"CS2 sendet Live-Daten ({'Observer-PC im Netzwerk' if source == 'network' else 'dieser PC'})", "info")
            self.source = source
            if self._send_timer is None:              # at most five updates per second
                self._send_timer = threading.Timer(SEND_INTERVAL, self._send_live)
                self._send_timer.daemon = True
                self._send_timer.start()

    def _count_damage(self, all_players: dict, round_number: int) -> None:
        """Sum up damage and headshot kills over the rounds (CS2 reports the running round only)."""
        for player_id, player in all_players.items():
            state = player.get("state") or {}
            stats = self._players.setdefault(player_id, {"dmg": 0, "hs": 0, "round_dmg": 0, "round_hs": 0,
                                                         "round": round_number, "waiting": False})
            if round_number != stats["round"]:
                stats["dmg"] += stats["round_dmg"]
                stats["hs"] += stats["round_hs"]
                stats.update(round_dmg=0, round_hs=0, round=round_number, waiting=True)
            damage, headshots = _number(state.get("round_totaldmg")), _number(state.get("round_killhs"))
            if stats["waiting"]:                      # values of the previous round must not count twice
                if damage == 0 and headshots == 0:
                    stats["waiting"] = False
                else:
                    continue
            stats["round_dmg"] = max(stats["round_dmg"], damage)
            stats["round_hs"] = max(stats["round_hs"], headshots)

    def _detect_side_switch(self, ct: dict, t: dict) -> None:
        """Half time / overtime: the scores swap columns, so team A swaps sides."""
        previous = self._previous_score
        if previous and ct.get("score") != t.get("score") and ct.get("score") == previous["t"] and t.get("score") == previous["ct"]:
            self.settings["sideA"] = "T" if self.settings["sideA"] == "CT" else "CT"
            self.save_settings()
            self._log("CS2: Seitenwechsel erkannt", "info")
        self._previous_score = {"ct": ct.get("score"), "t": t.get("score")}

    def _match_team_names(self, ct: dict, t: dict) -> None:
        """If the server's team names (e.g. FACEIT) match team A/B, assign the sides automatically."""
        def similar(a, b):
            """Team names match if one contains the other (ignoring case)."""
            return bool(a and b) and (a.lower() in b.lower() or b.lower() in a.lower())
        team_a, team_b = self.settings["teamA"], self.settings["teamB"]
        if similar(ct.get("name"), team_a) or similar(t.get("name"), team_b):
            self.settings["sideA"] = "CT"
        elif similar(t.get("name"), team_a) or similar(ct.get("name"), team_b):
            self.settings["sideA"] = "T"

    def _player_line(self, player_id: str, player: dict, rounds_played: int) -> dict:
        """Statistics of one player as shown in scoreboard and head-to-head."""
        match_stats, state = player.get("match_stats") or {}, player.get("state") or {}
        stats = self._players.get(player_id, {})
        damage = stats.get("dmg", 0) + stats.get("round_dmg", 0)
        headshots = stats.get("hs", 0) + stats.get("round_hs", 0)
        kills = _number(match_stats.get("kills"))
        return {"id": player_id, "name": str(player.get("name") or "")[:32], "side": player.get("team"),
                "k": kills, "d": _number(match_stats.get("deaths")), "a": _number(match_stats.get("assists")),
                "mvps": _number(match_stats.get("mvps")), "adr": round(damage / max(1, rounds_played)),
                "hs": round(100 * headshots / kills) if kills else 0, "hp": _number(state.get("health")),
                "money": _number(state.get("money")), "equipment": _number(state.get("equip_value")),
                "roundKills": _number(state.get("round_kills"))}

    def _send_live(self) -> None:
        """Send the newest live state to all pages (timer: at most five times per second)."""
        with self._lock:
            self._send_timer = None
            data = json.dumps(self.live)
        self._broadcast("live", data)

    # --- LAN receiver (port 8788) ---

    @property
    def lan_receiver_running(self) -> bool:
        """True while the receiver for an observer PC (port 8788) is on."""
        return self._lan_server is not None

    def set_lan_receiver(self, on: bool) -> None:
        """Start/stop the receiver for an observer PC: POST /api/gsi with token only, everything else is refused."""
        if on and not self._lan_server:
            receiver = self

            class LanHandler(BaseHTTPRequestHandler):
                """Accepts only POST /api/gsi with the token – everything else is refused."""
                timeout = 10

                def do_POST(self):
                    if self.path.split("?")[0] != "/api/gsi":
                        return self._answer(403, {})
                    length = int(self.headers.get("Content-Length") or 0)
                    if length > MAX_BODY:
                        return self._answer(400, {})
                    status, answer = receiver.accept(self.rfile.read(length).decode("utf-8", "replace"), "network")
                    self._answer(status, answer)

                def do_GET(self):
                    self._answer(403, {})

                def _answer(self, status, answer):
                    """Send a small JSON answer."""
                    body = json.dumps(answer).encode()
                    self.send_response(status)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)

                def log_message(self, *args):
                    pass

            try:
                self._lan_server = ThreadingHTTPServer(("0.0.0.0", LAN_PORT), LanHandler)
            except OSError as error:
                self._log(f"Netzwerk-Empfang (Port {LAN_PORT}): {error}", "error")
                return
            self._lan_server.daemon_threads = True
            threading.Thread(target=self._lan_server.serve_forever, name="gsi-lan", daemon=True).start()
            self._log(f"Netzwerk-Empfang für CS2 an (Port {LAN_PORT})", "info")
        elif not on and self._lan_server:
            self._lan_server.shutdown()
            self._lan_server.server_close()
            self._lan_server = None
            self._log("Netzwerk-Empfang für CS2 aus", "info")
