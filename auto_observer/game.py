"""Game model: turns the CS2 Game State Integration posts into players, match data and events.

CS2 only sends snapshots (every ~0.1 s). Events such as kills, deaths, damage and shots are derived by
comparing a player's values with the previous snapshot. Positions and view directions of all players are
only sent to spectators (observer slot, GOTV) with "allplayers_position" in the GSI cfg file.
"""

import math
from collections import deque
from dataclasses import dataclass, field

Vector = tuple[float, float, float]

TRAIL_SECONDS = 2.0            # how much position history is kept per player (speed, approaching)
RECENT_SECONDS = 10.0          # how long events stay in Match.recent
NAME_LIMIT = 32

# engagement range in game units per weapon type (an AWP duel happens much further away than a pistol duel)
WEAPON_RANGE = {"SniperRifle": 3000, "Rifle": 1600, "Machine Gun": 1500, "Submachine Gun": 1100,
                "Pistol": 950, "Shotgun": 600, "Knife": 200}
DEFAULT_RANGE = 1200
# rough strength of a weapon in a duel (only relative values matter)
WEAPON_STRENGTH = {"SniperRifle": 1.15, "Rifle": 1.0, "Machine Gun": 0.8, "Submachine Gun": 0.7,
                   "Shotgun": 0.6, "Pistol": 0.45, "Knife": 0.1, "Grenade": 0.25, "C4": 0.1}
STRONG_PISTOLS = {"weapon_deagle": 0.65, "weapon_revolver": 0.6}


def parse_vector(text) -> Vector | None:
    """GSI vectors are strings like "-123.45, 678.90, 12.00"."""
    if not isinstance(text, str):
        return None
    try:
        x, y, z = (float(part) for part in text.split(","))
    except ValueError:
        return None
    if not all(math.isfinite(v) for v in (x, y, z)):
        return None
    return (x, y, z)


def _int(value, default: int = 0) -> int:
    """Whole number from GSI data (CS2 sometimes sends numbers as strings)."""
    try:
        number = int(float(value))
    except (TypeError, ValueError, OverflowError):
        return default
    return number


def distance(a: Vector, b: Vector) -> float:
    return math.dist(a, b)


@dataclass
class Event:
    """Something that just happened to a player (derived from two snapshots)."""
    kind: str              # "kill", "death", "damage", "shot", "throw"
    steamid: str
    time: float
    amount: int = 1        # kills in this snapshot, damage taken, bullets fired
    headshot: bool = False
    detail: str = ""       # grenade type for "throw" (smoke, flashbang, frag, firebomb, decoy)


@dataclass
class Player:
    """One player as seen in the latest snapshot plus statistics summed over the map."""
    steamid: str
    name: str = ""
    team: str = ""                     # "CT" or "T"
    slot: int = -1                     # GSI observer_slot, 0..9 (spectator key = slot + 1, slot 9 = key 0)
    health: int = 0
    armor: int = 0
    helmet: bool = False
    flashed: int = 0                   # 0..255
    position: Vector | None = None
    forward: Vector | None = None
    weapon: str = ""                   # active weapon, e.g. "weapon_ak47"
    weapon_type: str = ""              # "Rifle", "SniperRifle", "Pistol", ...
    clip: int = -1                     # bullets in the active weapon's magazine (-1: unknown)
    kills: int = 0
    deaths: int = 0
    assists: int = 0
    round_kills: int = 0
    round_killhs: int = 0
    damage: int = 0                    # damage dealt in the finished rounds of this map
    round_damage: int = 0              # damage dealt in the running round
    damage_round: int = -1             # round number round_damage belongs to
    waiting_for_reset: bool = False    # new round: CS2 still reports last round's damage until it resets
    trail: deque = field(default_factory=deque)   # (time, position)

    @property
    def alive(self) -> bool:
        return self.health > 0

    @property
    def engage_range(self) -> float:
        return WEAPON_RANGE.get(self.weapon_type, DEFAULT_RANGE)

    @property
    def weapon_strength(self) -> float:
        return STRONG_PISTOLS.get(self.weapon, WEAPON_STRENGTH.get(self.weapon_type, 0.5))

    def speed(self) -> float:
        """Speed over the last ~0.5 s in units per second (0 if unknown)."""
        if len(self.trail) < 2:
            return 0.0
        end_time, end = self.trail[-1]
        for start_time, start in self.trail:
            if end_time - start_time <= 0.6:
                if end_time - start_time < 0.05:
                    return 0.0
                return distance(start, end) / (end_time - start_time)
        return 0.0

    def position_ago(self, seconds: float) -> Vector | None:
        """Position about `seconds` ago (the oldest known one if the trail is shorter)."""
        if not self.trail:
            return None
        newest = self.trail[-1][0]
        for moment, position in reversed(self.trail):
            if newest - moment >= seconds:
                return position
        return self.trail[0][1]


class Match:
    """Everything the director needs to know about the running map, updated from each GSI post."""

    def __init__(self):
        self.players: dict[str, Player] = {}
        self.map_name = ""
        self.map_phase = ""            # warmup, live, intermission, gameover
        self.round = 0                 # finished rounds (map.round)
        self.round_phase = ""          # freezetime, live, over
        self.bomb_state = ""           # carried, dropped, planting, planted, defusing, defused, exploded
        self.bomb_player = ""          # steamid of the carrier / planter / defuser
        self.bomb_position: Vector | None = None
        self.observed = ""             # steamid the spectator camera is on ("" or a non-player id in free cam)
        self.team_names = {"CT": "", "T": ""}
        self.scores = {"CT": 0, "T": 0}
        self.updated = 0.0             # time of the last post
        self.recent: deque[Event] = deque()
        self.grenades: set[str] = set()   # ids of the grenades in the last post ("allgrenades")
        self.grenades_known = False       # the first post only tells which grenades already fly

    # --- reading ---

    def alive(self, team: str | None = None) -> list[Player]:
        return [p for p in self.players.values() if p.alive and (team is None or p.team == team)]

    def enemies(self, player: Player) -> list[Player]:
        return [p for p in self.players.values() if p.alive and p.team and p.team != player.team]

    def rounds_played(self) -> int:
        return self.round + (1 if self.round_phase in ("live", "over") else 0)

    def team_key(self, side: str) -> str:
        """Stable key of the team now playing `side`: its name, or else its lowest steamid (rosters keep sides' order)."""
        name = self.team_names.get(side, "")
        if name:
            return "name:" + name
        members = sorted(p.steamid for p in self.players.values() if p.team == side)
        return "roster:" + members[0] if members else "side:" + side

    def recent_events(self, kind: str, since: float) -> list[Event]:
        return [e for e in self.recent if e.kind == kind and e.time >= since]

    # --- updating ---

    def update(self, state: dict, now: float) -> list[Event]:
        """Take one GSI post; returns the events derived from it."""
        game_map = state.get("map") if isinstance(state.get("map"), dict) else {}
        round_info = state.get("round") if isinstance(state.get("round"), dict) else {}
        bomb = state.get("bomb") if isinstance(state.get("bomb"), dict) else {}
        observed = state.get("player") if isinstance(state.get("player"), dict) else {}
        all_players = state.get("allplayers") if isinstance(state.get("allplayers"), dict) else {}

        map_name = str(game_map.get("name") or "")
        round_number = _int(game_map.get("round"))
        new_map = (map_name and map_name != self.map_name) or round_number < self.round
        if new_map:
            self.players.clear()
            self.recent.clear()
            self.grenades, self.grenades_known = set(), False
        if map_name:
            self.map_name = map_name
        self.map_phase = str(game_map.get("phase") or self.map_phase)
        self.round = round_number
        self.round_phase = str(round_info.get("phase") or "")
        for side, key in (("CT", "team_ct"), ("T", "team_t")):
            team = game_map.get(key) if isinstance(game_map.get(key), dict) else {}
            self.team_names[side] = str(team.get("name") or "")[:NAME_LIMIT]
            self.scores[side] = _int(team.get("score"))
        self.bomb_state = str(bomb.get("state") or "")
        self.bomb_player = str(bomb.get("player") or "")
        self.bomb_position = parse_vector(bomb.get("position"))
        self.observed = str(observed.get("steamid") or "")
        self.updated = now

        events: list[Event] = []
        for steamid, data in all_players.items():
            if isinstance(data, dict):
                events += self._update_player(str(steamid), data, now)
        for steamid in [s for s in self.players if s not in all_players]:
            del self.players[steamid]          # left the server
        events += self._update_grenades(state.get("grenades"), now)

        self.recent.extend(events)
        while self.recent and now - self.recent[0].time > RECENT_SECONDS:
            self.recent.popleft()
        return events

    def _update_player(self, steamid: str, data: dict, now: float) -> list[Event]:
        player = self.players.get(steamid)
        fresh = player is None
        if fresh:
            player = self.players[steamid] = Player(steamid)
        before = (player.health, player.kills, player.round_killhs, player.weapon, player.clip, player.round_kills)

        state = data.get("state") if isinstance(data.get("state"), dict) else {}
        stats = data.get("match_stats") if isinstance(data.get("match_stats"), dict) else {}
        player.name = str(data.get("name") or "")[:NAME_LIMIT]
        player.team = str(data.get("team") or "")
        player.slot = _int(data.get("observer_slot"), -1)
        player.health = max(0, _int(state.get("health")))
        player.armor = _int(state.get("armor"))
        player.helmet = bool(state.get("helmet"))
        player.flashed = _int(state.get("flashed"))
        player.round_kills = _int(state.get("round_kills"))
        player.round_killhs = _int(state.get("round_killhs"))
        player.kills = _int(stats.get("kills"))
        player.deaths = _int(stats.get("deaths"))
        player.assists = _int(stats.get("assists"))
        self._count_damage(player, _int(state.get("round_totaldmg")))

        player.weapon, player.weapon_type, player.clip = "", "", -1
        weapons = data.get("weapons") if isinstance(data.get("weapons"), dict) else {}
        for weapon in weapons.values():
            if isinstance(weapon, dict) and weapon.get("state") == "active":
                player.weapon = str(weapon.get("name") or "")
                player.weapon_type = str(weapon.get("type") or "")
                player.clip = _int(weapon.get("ammo_clip"), -1)

        position = parse_vector(data.get("position"))
        player.position = position
        player.forward = parse_vector(data.get("forward"))
        if position:
            player.trail.append((now, position))
            while player.trail and now - player.trail[0][0] > TRAIL_SECONDS:
                player.trail.popleft()
        else:
            player.trail.clear()

        if fresh:
            return []
        health, kills, killhs, weapon, clip, round_kills = before
        events = []
        if player.kills > kills and player.round_kills >= round_kills:
            events.append(Event("kill", steamid, now, player.kills - kills, player.round_killhs > killhs))
        if health > 0 and player.health == 0:
            events.append(Event("death", steamid, now))
        elif health > player.health > 0:
            events.append(Event("damage", steamid, now, health - player.health))
        if (self.round_phase == "live" and player.alive and weapon == player.weapon and clip >= 0
                and 0 <= player.clip < clip):
            events.append(Event("shot", steamid, now, clip - player.clip))
        return events

    def _update_grenades(self, grenades, now: float) -> list[Event]:
        """A grenade id that was not there before = its owner just threw it (fire on the ground does not count)."""
        if not isinstance(grenades, dict):
            return []
        events = []
        current = set()
        for grenade_id, grenade in grenades.items():
            if not isinstance(grenade, dict):
                continue
            current.add(str(grenade_id))
            kind = str(grenade.get("type") or "")
            owner = str(grenade.get("owner") or "")
            if (self.grenades_known and str(grenade_id) not in self.grenades and kind != "inferno"
                    and owner in self.players and self.players[owner].alive):
                events.append(Event("throw", owner, now, detail=kind[:20]))
        self.grenades, self.grenades_known = current, True
        return events

    def _count_damage(self, player: Player, round_damage: int) -> None:
        """Sum up the damage over the rounds (CS2 only reports the running round)."""
        if player.damage_round != self.round:
            if player.damage_round >= 0:
                player.damage += player.round_damage
                player.waiting_for_reset = True
            player.round_damage, player.damage_round = 0, self.round
        if player.waiting_for_reset:               # last round's value must not count twice
            if round_damage != 0:
                return
            player.waiting_for_reset = False
        player.round_damage = max(player.round_damage, round_damage)


# --- geometry helpers for the director ---

def facing(viewer: Player, target: Player, max_angle: float) -> bool:
    """True if `viewer` looks towards `target` within `max_angle` degrees (walls are unknown)."""
    if not (viewer.position and viewer.forward and target.position):
        return False
    direction = [t - v for t, v in zip(target.position, viewer.position)]
    length = math.hypot(*direction)
    forward_length = math.hypot(*viewer.forward)
    if length < 1 or forward_length < 1e-6:
        return length < 1
    cosine = sum(d * f for d, f in zip(direction, viewer.forward)) / (length * forward_length)
    return cosine >= math.cos(math.radians(max_angle))


def approaching(mover: Player, target: Player, seconds: float = 0.7, minimum: float = 40.0) -> bool:
    """True if `mover` got at least `minimum` units closer to `target` during the last `seconds`."""
    earlier = mover.position_ago(seconds)
    if not (earlier and mover.position and target.position):
        return False
    return distance(earlier, target.position) - distance(mover.position, target.position) >= minimum
