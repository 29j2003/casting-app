"""The director: rates every alive player from the game situation and decides whom the camera shows.

Each player's rating = (base + decaying event score + situational score) × importance.

* Event score: things that just happened (kill, multi-kill, trade, clutch kill, damage taken, shots). Each adds
  a boost that fades with a half-life – slowly while the player is still in a fight, fast otherwise.
* Situational score: recomputed every tick from what is true right now – clutch, duels (with an estimate of
  who wins: weapons at this distance, bullets left, reloading, secondary, health, armor, helmet, grenades,
  flashed, running, form, who has whom in view), players running into each other (looking 0.5 s ahead), flanks, an enemy holding the angle a clutcher
  walks into, plant/defuse, pushes.
* Importance: the producer's slider per player and per team (0–200 %) times the form from the match data;
  how much the form counts is a setting ("data_mix").

Switching rules keep the picture calm: a minimum time on a player that depends on the pace of the round
(long in a quiet 1v1, short when kills come fast), a clear margin before cutting, an immediate cut for a
much bigger moment, at least ~1 s on a player who just killed, a quick cut to real action (aimed shots – even
misses – or hits) when the shown player has none, no cut away while the shown player is in a fight (a kill
elsewhere may be missed – one fight in focus), the grenade thrower when nothing else happens, and an immediate cut when the shown player
dies (to the killer if known). Two players only looking at each other – often through a wall – lose value
after a few seconds without shots or hits ("standoff"), so a real fight elsewhere wins. In buy time and quiet
moments the camera changes now and then: the other side and players not shown for a while first.

The scoring ideas (event decay, flank and sniper ranges, margin + dwell) follow the "Smart Auto Observer" of
AlexNB01/cs2-observer-toolkit (MIT License, Copyright (c) 2026 AlexNB01); the code here is written anew.
"""

import math
from dataclasses import dataclass, field

from .game import STRONG_PISTOLS, WEAPON_STRENGTH, Event, Match, Player, approaching, distance, facing

# All tuning values in one place (game units, seconds, points).
TUNING = {
    "base": 5.0,                 # every alive player – lets the importance decide when nothing happens
    "kill": 100.0, "headshot": 15.0, "multi_kill": 25.0, "trade": 30.0, "trade_window": 5.0,
    "clutch_kill": 40.0, "clutch_kill_per_enemy": 20.0,
    "damage_taken": 50.0,
    "shooter_hit": 45.0, "shooter_angle": 35.0,   # enemy looking at a player who just got hit: probably the shooter
    "shot": 12.0, "shot_aimed": 40.0, "shot_cap": 120.0, "shot_target": 30.0,
    "aim_angle": 30.0, "aim_reach": 1.2, "aim_close": 600.0,   # aimed: facing an enemy in reach, or one very close
    # real action beats prediction: aimed shots/hits elsewhere and nothing like that on the shown player → cut
    "action_fresh": 1.2, "action_quiet": 2.5,
    # grenades: the thrower is shown when nothing else happens
    "nade": {"smoke": 40.0, "flashbang": 45.0, "frag": 45.0, "firebomb": 45.0, "decoy": 10.0}, "nade_other": 30.0,
    "nade_fresh": 1.0,
    "half_life_fight": 5.0, "half_life_near": 3.0, "half_life_idle": 2.0,
    "clutch": 300.0, "clutch_per_enemy": 25.0,
    "duel": 120.0, "duel_cap": 200.0, "duel_angle": 35.0,
    # looking ahead: where players will be in a moment – cut a bit before contact, not at the first shot
    "lookahead": 0.5, "closing_min": 40.0, "contact": 0.6, "contact_cap": 120.0,
    "flank": 45.0, "proximity": 10.0, "proximity_range": 1200.0,
    # standoff: two players only "looking" at each other (often through a wall) lose value without shots or hits
    "standoff_grace": 2.5, "standoff_half_life": 2.0, "standoff_floor": 0.15,
    "angle_hold": 260.0, "angle_hold_degrees": 10.0,   # beats the clutcher by a "jump": cut before he peeks
    # predictions from the situation
    "trade_try": 90.0, "trade_try_window": 4.0, "trade_reach": 1.3,      # teammate of a fallen player goes for the refrag
    "swing": 80.0,                     # swinging an enemy who reloads
    "flash_peek": 100.0, "flash_blind": 150,   # peeking a flashed enemy
    "sneak": 45.0, "sneak_speed": (40.0, 160.0),   # walking/crouching (silent) towards an enemy who doesn't look
    "late_round": 25.0, "late_factor": 1.25,       # little time left: the Ts must go
    "retake": 40.0, "save_factor": 0.5, "run_speed": 250.0,
    "outnumbered": 0.1,               # per player fewer: the waiting side gets the contact
    "execute": 35.0, "execute_window": 8.0, "execute_cluster": 700.0, "execute_reach": 1300.0,
    "eco_equip": 2000, "full_equip": 3500, "eco_push": 1.5,
    "plant": 150.0, "defuse": 200.0, "stop_defuse": 260.0, "stop_defuse_range": 2500.0,
    "push": 30.0, "push_carrier": 80.0, "push_radius": 700.0, "push_speed": 130.0,
    "flashed_factor": 0.4,       # a flashed player's view is white – show someone else
    "dwell": 2.0, "dwell_fast": 1.4, "dwell_calm": 3.5,
    "margin_factor": 1.2, "margin": 20.0,
    "jump": 250.0, "jump_min": 1.0,
    "kill_hold": 1.2,            # the shown player just killed: stay at least this long
    "dead_switch_gap": 0.15,     # wait this long between commands while the camera is on a dead player
    "killer_window": 1.5,        # shown player died: cut to whoever killed within this time
    # variety when nothing happens (buy time, quiet moments): other side and players not shown for a while first
    "rotate_freezetime": 5.0, "rotate_quiet": 7.0, "quiet_score": 15.0,
    "other_side_bonus": 1.3, "stale_seconds": 20.0,
}

PRE_ROUND = ("freezetime",)
ROUND_OVER = ("over",)


@dataclass
class Rating:
    """How interesting a player is right now and why."""
    steamid: str
    name: str
    score: float
    importance: float
    reason: str                  # code of the biggest part: kill, clutch, duel, flank, angle, defuse, ...
    detail: str = ""             # e.g. "1v2" or an opponent's name
    parts: dict = field(default_factory=dict)
    raw: float = 0.0             # score before importance


@dataclass
class Decision:
    """Switch the camera to this player."""
    steamid: str
    reason: str
    detail: str = ""


def form(player: Player, match: Match) -> float:
    """Form from the match data, 0.75 … 1.3 (1.0 = average). Counts fully only after 8 rounds."""
    rounds = match.rounds_played()
    if rounds <= 0:
        return 1.0
    kpr = player.kills / rounds
    survival = 1 - min(1.0, player.deaths / rounds)
    adr = (player.damage + player.round_damage) / rounds
    rating = (kpr / 0.68 + survival / 0.32 + adr / 78) / 3
    confidence = min(1.0, rounds / 8)
    return max(0.75, min(1.3, 1 + (rating - 1) * 0.5 * confidence))


ROLES = ("entry", "awp", "lurker", "support", "anchor")
# how a role changes the parts of the rating (learned from the match or set by hand)
ROLE_EFFECTS = {
    "entry": {"duel": 1.25, "contact": 1.25},          # until the opening kill of the round
    "support": {"trade_try": 1.4},
    "lurker": {"sneak": 1.5, "flank": 1.3},
    "anchor": {"execute": 1.5},
    "awp": {"duel": 1.1},
}


def learned_role(player: Player, match: Match) -> str:
    """Role from this match: AWP in hand, most opening duels (entry), most trade kills (support)."""
    if any(w.type == "SniperRifle" and w.name == "weapon_awp" for w in player.guns()):
        return "awp"
    team = [p for p in match.players.values() if p.team == player.team]
    openings = {p.steamid: match.opening_kills.get(p.steamid, 0) + match.opening_deaths.get(p.steamid, 0) for p in team}
    if openings.get(player.steamid, 0) >= 3 and openings[player.steamid] == max(openings.values()):
        return "entry"
    trades = {p.steamid: match.trade_kills.get(p.steamid, 0) for p in team}
    if trades.get(player.steamid, 0) >= 2 and trades[player.steamid] == max(trades.values()):
        return "support"
    return ""


DUEL_GRENADES = {"weapon_flashbang", "weapon_hegrenade", "weapon_molotov", "weapon_incgrenade"}
ONE_TAP = {"Rifle", "SniperRifle"}          # without a helmet one shot to the head is enough


def weapon_power(name: str, kind: str, gap: float) -> float:
    """How good a weapon is at this distance (AWP far, shotgun and SMG close)."""
    value = STRONG_PISTOLS.get(name, WEAPON_STRENGTH.get(kind, 0.5))
    if kind == "SniperRifle":
        value *= 0.7 if gap < 400 else 1.1 if gap > 1200 else 1.0
    elif kind == "Submachine Gun":
        value *= 1.2 if gap < 600 else 0.8 if gap > 1300 else 1.0
    elif kind == "Shotgun":
        value *= 1.6 if gap < 350 else 0.5 if gap > 800 else 1.0
    elif kind == "Pistol":
        value *= 1.2 if gap < 400 else 0.8 if gap > 1200 else 1.0
    return value


def fighting_power(player: Player, gap: float) -> float:
    """The best a player can shoot with right now: bullets left, reloading, or switching to the secondary."""
    values = []
    for weapon in player.guns():
        active = weapon.state in ("active", "reloading")
        value = weapon_power(weapon.name, weapon.type, gap)
        if weapon.clip == 0:
            value *= 0.15 if active else 0.0                 # empty magazine
        elif weapon.clip_max > 5 and 0 < weapon.clip <= max(2, weapon.clip_max // 10):
            value *= 0.6                                     # nearly empty
        if weapon.state == "reloading":
            value *= 0.3
        if not active:
            value *= 0.8                                     # needs a moment to switch
        values.append(value)
    if values:
        return max(values)
    return weapon_power(player.weapon, player.weapon_type, gap) if player.weapon_type else 0.3


def duel_chance(a: Player, b: Player, form_a: float, form_b: float, a_sees_b: bool, b_sees_a: bool,
                gap: float = 1000.0) -> float:
    """Rough chance that `a` wins a duel against `b` (0..1): weapons at this distance, bullets left, reloading,
    secondary, health, armor and helmet, grenades, flashed, running, form, and who has whom in view."""
    def strength(p: Player, enemy: Player, p_form: float, sees: bool, seen: bool) -> float:
        value = fighting_power(p, gap) * (max(1, p.health) / 100) ** 0.6 * p_form
        value *= 1.0 if p.armor > 0 else 0.85
        if not p.helmet and enemy.weapon_type in ONE_TAP:
            value *= 0.9
        value *= 1 + 0.04 * min(3, sum(1 for name in p.grenades if name in DUEL_GRENADES))
        if sees and not seen:
            value *= 1.8                   # behind or beside the enemy: big advantage
        if p.flashed > 150:
            value *= 0.3
        if p.speed() > 210:
            value *= 0.9                   # running: inaccurate
        return value
    sa = strength(a, b, form_a, a_sees_b, b_sees_a)
    sb = strength(b, a, form_b, b_sees_a, a_sees_b)
    return sa / (sa + sb) if sa + sb > 0 else 0.5


class Director:
    """Keeps the decaying event scores and the switching memory; rates players and decides."""

    def __init__(self, tuning: dict | None = None):
        self.tuning = dict(TUNING, **(tuning or {}))
        self.event_scores: dict[str, list[tuple[float, float, str, str]]] = {}   # steamid → (time, amount, code, detail)
        self.last_switch = -math.inf
        self.last_target = ""
        self.ratings: list[Rating] = []
        self.last_action: dict[str, float] = {}           # steamid → time of the last shot, hit or kill
        self.last_aimed: dict[str, float] = {}            # steamid → time of the last aimed shot, hit taken/dealt or kill
        self.last_throw: dict[str, float] = {}            # steamid → time of the last grenade thrown
        self.pair_since: dict[tuple[str, str], float] = {}  # duel pair → since when they face each other
        self.shown_at: dict[str, float] = {}               # steamid → when the camera last went there
        self.roles: dict[str, str] = {}                    # steamid → role used in the last rating
        self._pairs_seen: set[tuple[str, str]] = set()

    def reset(self) -> None:
        self.event_scores.clear()
        self.last_action.clear()
        self.last_aimed.clear()
        self.last_throw.clear()
        self.pair_since.clear()
        self.shown_at.clear()
        self.last_switch, self.last_target, self.ratings = -math.inf, "", []

    # --- events ---

    def feed(self, events: list[Event], match: Match) -> None:
        """Turn new events into decaying boosts."""
        t = self.tuning
        for event in events:
            player = match.players.get(event.steamid)
            if not player:
                continue
            boosts = self.event_scores.setdefault(event.steamid, [])
            if event.kind in ("kill", "shot", "damage"):
                self.last_action[event.steamid] = event.time
            if event.kind in ("kill", "damage"):
                self.last_aimed[event.steamid] = event.time
            if event.kind == "kill":
                amount = t["kill"] * event.amount + (t["headshot"] if event.headshot else 0)
                if player.round_kills >= 2:
                    amount += t["multi_kill"] * (player.round_kills - 1)
                teammates_died = [e for e in match.recent_events("death", event.time - t["trade_window"])
                                  if e.steamid != player.steamid
                                  and getattr(match.players.get(e.steamid), "team", None) == player.team]
                if teammates_died:
                    amount += t["trade"]
                enemies = len(match.enemies(player))
                if player.alive and len(match.alive(player.team)) == 1:
                    amount += t["clutch_kill"] + t["clutch_kill_per_enemy"] * enemies
                code = "multi_kill" if player.round_kills >= 2 else "kill"
                boosts.append((event.time, amount, code, str(player.round_kills)))
            elif event.kind == "damage":
                boosts.append((event.time, t["damage_taken"], "fight", ""))
                for enemy in match.enemies(player):
                    if (player.position and enemy.position and facing(enemy, player, t["shooter_angle"])
                            and distance(player.position, enemy.position) <= enemy.engage_range):
                        self.event_scores.setdefault(enemy.steamid, []).append((event.time, t["shooter_hit"], "fight", player.name))
                        self.last_action[enemy.steamid] = self.last_aimed[enemy.steamid] = event.time
            elif event.kind == "shot":
                target = self._aimed_at(player, match)
                if target:
                    boosts.append((event.time, (t["shot"] + t["shot_aimed"]) * event.amount ** 0.5, "shots", target.name))
                    self.last_aimed[player.steamid] = event.time
                    self.event_scores.setdefault(target.steamid, []).append((event.time, t["shot_target"], "fight", player.name))
                    self.last_action[target.steamid] = event.time
                else:
                    boosts.append((event.time, t["shot"], "shots", ""))
            elif event.kind == "throw":
                value = t["nade"].get(event.detail, t["nade_other"])
                if value >= 20:                       # a decoy is no reason to cut
                    boosts.append((event.time, value, "nade", event.detail))
                    self.last_throw[event.steamid] = event.time
            elif event.kind == "death":
                self.event_scores.pop(event.steamid, None)

    def _aimed_at(self, player: Player, match: Match) -> Player | None:
        """The enemy a shot is aimed at (even if it misses): looked at within reach, or very close; else None."""
        t = self.tuning
        if not player.position:
            return None
        best, best_gap = None, math.inf
        for enemy in match.enemies(player):
            if not enemy.position:
                continue
            gap = distance(player.position, enemy.position)
            aimed = (gap <= t["aim_close"]
                     or (gap <= player.engage_range * t["aim_reach"] and facing(player, enemy, t["aim_angle"])))
            if aimed and gap < best_gap:
                best, best_gap = enemy, gap
        return best

    def _event_score(self, player: Player, match: Match, now: float) -> dict[str, tuple[float, str]]:
        """Current value of the decaying boosts, grouped by code (code → (points, detail))."""
        t = self.tuning
        boosts = self.event_scores.get(player.steamid, [])
        if not boosts:
            return {}
        enemies = match.enemies(player)
        in_fight = any(facing(player, e, t["duel_angle"]) and player.position and e.position
                       and distance(player.position, e.position) <= player.engage_range for e in enemies)
        near = any(player.position and e.position and distance(player.position, e.position) <= player.engage_range
                   for e in enemies)
        half_life = t["half_life_fight"] if in_fight else t["half_life_near"] if near else t["half_life_idle"]
        result: dict[str, tuple[float, str]] = {}
        kept = []
        for moment, amount, code, detail in boosts:
            value = amount * 0.5 ** (max(0.0, now - moment) / half_life)
            if value < 0.5:
                continue
            kept.append((moment, amount, code, detail))
            points, _ = result.get(code, (0.0, detail))
            result[code] = (points + value, detail)
        self.event_scores[player.steamid] = kept
        if "shots" in result:
            result["shots"] = (min(t["shot_cap"], result["shots"][0]), result["shots"][1])
        return result

    # --- situation ---

    def _standoff(self, player: Player, enemy: Player, now: float, closing: bool = False) -> float:
        """1.0 while a duel is fresh, someone shoots/gets hit or they close in; falls off while they only look."""
        t = self.tuning
        pair = (min(player.steamid, enemy.steamid), max(player.steamid, enemy.steamid))
        self._pairs_seen.add(pair)
        start = self.pair_since.setdefault(pair, now)
        latest = max(start, self.last_action.get(player.steamid, -math.inf), self.last_action.get(enemy.steamid, -math.inf))
        if closing:
            self.pair_since[pair] = latest = now
        quiet = now - latest - t["standoff_grace"]
        if quiet <= 0:
            return 1.0
        return max(t["standoff_floor"], 0.5 ** (quiet / t["standoff_half_life"]))

    def _situation(self, player: Player, match: Match, forms: dict[str, float], now: float,
                   role: str = "", eco: dict | None = None) -> dict[str, tuple[float, str]]:
        """Points from what is true right now (code → (points, detail))."""
        t = self.tuning
        parts: dict[str, tuple[float, str]] = {}

        def add(code: str, points: float, detail: str = "") -> None:
            old, old_detail = parts.get(code, (0.0, ""))
            parts[code] = (old + points, detail or old_detail)

        if match.round_phase != "live":
            return parts
        enemies = match.enemies(player)
        team_alive = match.alive(player.team)
        if len(team_alive) == 1 and enemies:
            add("clutch", t["clutch"] + t["clutch_per_enemy"] * len(enemies), f"1v{len(enemies)}")

        duel_points = contact_points = 0.0
        duel_detail = contact_detail = ""
        best_duel = best_contact = 0.0
        for enemy in enemies:
            if not (player.position and enemy.position):
                continue
            gap = distance(player.position, enemy.position)
            ahead = distance(player.position_in(t["lookahead"]), enemy.position_in(t["lookahead"]))
            closing = gap - ahead >= t["closing_min"]
            near = min(gap, ahead)               # moving towards each other: count the distance of a moment later
            reach = max(player.engage_range, enemy.engage_range)
            if near < t["proximity_range"]:
                add("proximity", t["proximity"] * (1 - near / t["proximity_range"]))
            if near > reach:
                continue
            sees = facing(player, enemy, t["duel_angle"])
            seen = facing(enemy, player, t["duel_angle"])
            closeness = 1 - near / reach
            if sees or seen or closing:
                closeness *= self._standoff(player, enemy, now, closing)
                chance = duel_chance(player, enemy, forms.get(player.steamid, 1.0), forms.get(enemy.steamid, 1.0),
                                     sees, seen, near)
                points = t["duel"] * closeness * chance
                label = f"{enemy.name} ({round(chance * 100)} %)"
                if sees or seen:
                    duel_points += points
                    if points > best_duel:
                        best_duel, duel_detail = points, label
                else:                            # not in view yet, but running into each other
                    points *= t["contact"]
                    contact_points += points
                    if points > best_contact:
                        best_contact, contact_detail = points, label
            if sees and not seen and gap <= player.engage_range:
                add("flank", t["flank"] * closeness, enemy.name)
            # an enemy clutcher walks into the angle this player holds
            if (len(match.alive(enemy.team)) == 1 and gap <= player.engage_range
                    and facing(player, enemy, t["angle_hold_degrees"]) and approaching(enemy, player)):
                enemies_of_clutcher = len(match.enemies(enemy))
                add("angle", t["clutch"] + t["clutch_per_enemy"] * enemies_of_clutcher + t["angle_hold"], enemy.name)
            if gap <= reach:
                moving_in = closing or approaching(player, enemy)
                if enemy.reloading and moving_in:
                    add("swing", t["swing"] * closeness, enemy.name)
                if enemy.flashed > t["flash_blind"] and (moving_in or facing(player, enemy, 45)):
                    add("flash_peek", t["flash_peek"] * closeness, enemy.name)
            low, high = t["sneak_speed"]
            if (low <= player.speed() <= high and gap <= reach * 1.2 and approaching(player, enemy, minimum=25)
                    and not facing(enemy, player, 60)):
                add("sneak", t["sneak"] * max(0.0, 1 - gap / (reach * 1.2)), enemy.name)
        if duel_points:
            add("duel", min(t["duel_cap"], duel_points), duel_detail)
        if contact_points:
            add("contact", min(t["contact_cap"], contact_points), contact_detail)

        # trades: a teammate just died – who goes for the refrag?
        trade_skill = 1 + 0.15 * min(3, match.trade_kills.get(player.steamid, 0))
        for moment, killer_id, victim_id, _spot in match.kill_spots:
            killer = match.players.get(killer_id)
            victim = match.players.get(victim_id)
            if (now - moment > t["trade_try_window"] or not killer or not killer.alive or not victim
                    or victim.team != player.team or not (player.position and killer.position)):
                continue
            gap = distance(player.position, killer.position)
            reach = max(player.engage_range, killer.engage_range) * t["trade_reach"]
            if gap <= reach and (approaching(player, killer) or facing(player, killer, 45)):
                chance = duel_chance(player, killer, forms.get(player.steamid, 1.0), forms.get(killer.steamid, 1.0),
                                     facing(player, killer, t["duel_angle"]), facing(killer, player, t["duel_angle"]), gap)
                add("trade_try", t["trade_try"] * (1 - gap / reach) * chance * trade_skill, killer.name)

        # smokes and fires of one team close together: an attack is coming there
        for zone_team, center in self._execute_zones(match, now):
            if not player.position:
                continue
            gap = distance(player.position, center)
            if player.team != zone_team and gap <= t["execute_reach"]:
                add("execute", t["execute"] * (1 - gap / t["execute_reach"]))
            elif player.team == zone_team and gap <= t["execute_reach"] * 1.5 and player.speed() > 60:
                add("execute", t["execute"] * (1 - gap / (t["execute_reach"] * 1.5)))

        # bomb planted: CTs on the way to it (retake) – unless the time can't be enough any more (save)
        factor = 1.0
        if match.bomb_state in ("planted", "defusing") and match.bomb_position and player.position and player.team == "CT":
            gap = distance(player.position, match.bomb_position)
            if match.bomb_left is not None:
                needed = gap / t["run_speed"] + (5 if player.defusekit else 10)
                if match.bomb_left < needed - 0.5 and match.bomb_player != player.steamid:
                    factor *= t["save_factor"]
            earlier = player.position_ago(0.7)
            if earlier and distance(earlier, match.bomb_position) - gap > 40 and gap < 3000:
                add("retake", t["retake"])

        # bomb
        if match.bomb_state == "planting" and match.bomb_player == player.steamid:
            add("plant", t["plant"])
        if match.bomb_state == "defusing":
            if match.bomb_player == player.steamid:
                add("defuse", t["defuse"])
            elif player.team == "T":
                defuser = match.players.get(match.bomb_player)
                spot = match.bomb_position or (defuser.position if defuser else None)
                if spot and player.position:
                    nearest = min((p for p in match.alive("T") if p.position),
                                  key=lambda p: distance(p.position, spot), default=None)
                    if nearest is player and distance(player.position, spot) <= t["stop_defuse_range"]:
                        add("stop_defuse", t["stop_defuse"])

        # pushes: three or more of a team moving together
        if player.position and player.speed() >= t["push_speed"]:
            together = [p for p in team_alive if p is not player and p.position
                        and distance(p.position, player.position) <= t["push_radius"] and p.speed() >= t["push_speed"]]
            if len(together) >= 2:
                carrier = match.bomb_state == "carried" and match.bomb_player == player.steamid
                add("push", (t["push_carrier"] if carrier else t["push"]) * (t["eco_push"] if (eco or {}).get(player.team) else 1))

        # round state: little time left (the Ts must go), fewer players (they get the contact)
        if (player.team == "T" and match.countdown_phase == "live" and match.phase_left is not None
                and match.phase_left < t["late_round"] and match.bomb_state not in ("planted", "defusing")):
            factor *= t["late_factor"]
        fewer = len(enemies) - len(team_alive)
        if fewer > 0 and len(team_alive) >= 2:
            factor *= 1 + t["outnumbered"] * fewer
        effects = ROLE_EFFECTS.get(role, {})
        if role == "entry" and match.opening_done():
            effects = {}
        return {code: (points * factor * effects.get(code, 1.0), detail) for code, (points, detail) in parts.items()}

    def _execute_zones(self, match: Match, now: float) -> list[tuple[str, tuple]]:
        """Places where one team popped two or more smokes/fires close together in the last seconds."""
        t = self.tuning
        recent = [(kind, pos, team) for moment, kind, pos, team in match.utility if now - moment <= t["execute_window"]]
        zones = []
        for team in ("CT", "T"):
            spots = [pos for _, pos, owner in recent if owner == team]
            for spot in spots:
                near = [other for other in spots if distance(spot, other) <= t["execute_cluster"]]
                if len(near) >= 2:
                    center = tuple(sum(c) / len(near) for c in zip(*near))
                    if all(distance(center, z[1]) > t["execute_cluster"] for z in zones if z[0] == team):
                        zones.append((team, center))
        return zones

    # --- rating and deciding ---

    def rate(self, match: Match, importance, now: float, data_mix: float, roles=None) -> list[Rating]:
        """Ratings of all alive players, best first. `importance(player)` gives the producer's weight (0..2),
        `roles(player)` the role set by hand ("" = learn it from the match)."""
        t = self.tuning
        forms = {p.steamid: form(p, match) for p in match.players.values()}
        equip = {}
        for side in ("CT", "T"):
            values = [p.equip_value for p in match.players.values() if p.team == side and p.alive]
            equip[side] = sum(values) / len(values) if values else 0
        eco = {side: equip[side] < t["eco_equip"] and equip[other] > t["full_equip"]
               for side, other in (("CT", "T"), ("T", "CT"))}
        self.roles = {}
        self._pairs_seen = set()
        ratings = []
        for player in match.alive():
            if not player.team:
                continue
            parts = self._event_score(player, match, now)
            role = (roles(player) if roles else "") or learned_role(player, match)
            self.roles[player.steamid] = role
            for code, (points, detail) in self._situation(player, match, forms, now, role, eco).items():
                old, old_detail = parts.get(code, (0.0, ""))
                parts[code] = (old + points, detail or old_detail)
            weight = importance(player) * forms[player.steamid] ** data_mix
            raw = t["base"] + sum(points for points, _ in parts.values())
            if player.flashed > 150:
                raw *= t["flashed_factor"]
            if parts:
                reason, (_, detail) = max(parts.items(), key=lambda item: item[1][0])
            else:
                reason, detail = "importance", ""
            ratings.append(Rating(player.steamid, player.name, raw * weight, weight, reason, detail,
                                  {code: round(points, 1) for code, (points, _) in parts.items()}, raw))
        for pair in [pair for pair in self.pair_since if pair not in self._pairs_seen]:
            del self.pair_since[pair]            # no longer facing each other: a new duel starts fresh
        ratings.sort(key=lambda r: r.score, reverse=True)
        self.ratings = ratings
        return ratings

    def dwell(self, match: Match, now: float) -> float:
        """Minimum time on a player: short when kills come fast, long in a quiet end of the round."""
        t = self.tuning
        recent_kills = sum(e.amount for e in match.recent_events("kill", now - 5))
        if recent_kills >= 2:
            return t["dwell_fast"]
        if len(match.alive()) <= 3 and recent_kills == 0:
            return t["dwell_calm"]
        return t["dwell"]

    def decide(self, match: Match, ratings: list[Rating], current: str, now: float) -> Decision | None:
        """Whom to cut to now (None: stay). `current` is the player on camera (or just commanded)."""
        t = self.tuning
        if not ratings:
            return None
        since = now - self.last_switch
        by_id = {r.steamid: r for r in ratings}
        shown = by_id.get(current)
        best = ratings[0]

        if match.round_phase in PRE_ROUND:
            # buy time: the most important players, changing now and then (other side and not shown for a while first)
            if (shown is None and since >= t["dead_switch_gap"]) or since >= t["rotate_freezetime"]:
                pick = self._rotation_pick(ratings, current, match, now)
                if pick:
                    return Decision(pick, "rotation")
            return None
        if shown is None:
            # dead, left or free camera: cut away at once – to the killer if there is one
            if since < t["dead_switch_gap"]:
                return None
            killer = self._killer_of(current, match, now, by_id)
            if killer:
                return Decision(killer, "killer", match.players[current].name if current in match.players else "")
            return Decision(best.steamid, best.reason, best.detail)
        if any(e.steamid == current for e in match.recent_events("kill", now - t["kill_hold"])):
            return None                          # let the kill sink in
        if match.round_phase in ROUND_OVER:
            return None
        if now - self.last_aimed.get(current, -math.inf) <= t["action_quiet"]:
            return None                          # the shown player is in a fight: stay, even if a kill falls elsewhere
        fighting = [r for r in ratings if r.importance > 0 and r.steamid != current
                    and now - self.last_aimed.get(r.steamid, -math.inf) <= t["action_fresh"]]
        if since >= t["jump_min"] and fighting:
            action = max(fighting, key=lambda r: r.score)
            return Decision(action.steamid, action.reason, action.detail)
        throwing = [r for r in ratings if r.importance > 0 and r.steamid != current
                    and now - self.last_throw.get(r.steamid, -math.inf) <= t["nade_fresh"]]
        if (since >= t["jump_min"] and throwing and not fighting
                and now - self.last_throw.get(current, -math.inf) > t["nade_fresh"] + 1.0):
            thrower = max(throwing, key=lambda r: r.score)
            return Decision(thrower.steamid, "nade", self._nade_of(thrower.steamid))
        if best.steamid != current:
            if best.score >= shown.score + t["jump"] and since >= t["jump_min"]:
                return Decision(best.steamid, best.reason, best.detail)
            if since >= self.dwell(match, now) and best.score > shown.score * t["margin_factor"] + t["margin"]:
                return Decision(best.steamid, best.reason, best.detail)
        if (match.round_phase == "live" and since >= t["rotate_quiet"]
                and best.raw < t["quiet_score"] and shown.raw < t["quiet_score"]):
            pick = self._rotation_pick(ratings, current, match, now)
            if pick:
                return Decision(pick, "rotation")
        return None

    def _nade_of(self, steamid: str) -> str:
        boosts = [b for b in self.event_scores.get(steamid, []) if b[2] == "nade"]
        return boosts[-1][3] if boosts else ""

    def _rotation_pick(self, ratings: list[Rating], current: str, match: Match, now: float) -> str | None:
        """For quiet moments: important players, the other side and those not shown for a while first."""
        t = self.tuning
        current_team = match.players[current].team if current in match.players else ""

        def value(rating: Rating) -> float:
            player = match.players[rating.steamid]
            stale = min(1.0, (now - self.shown_at.get(rating.steamid, -math.inf)) / t["stale_seconds"])
            side = t["other_side_bonus"] if current_team and player.team != current_team else 1.0
            return rating.importance * (0.2 + stale) * side

        candidates = [r for r in ratings if r.steamid != current and r.importance > 0]
        return max(candidates, key=value).steamid if candidates else None

    def _killer_of(self, victim_id: str, match: Match, now: float, alive: dict) -> str | None:
        """Who just killed the shown player (an enemy with a fresh kill; the nearest one if several)."""
        victim = match.players.get(victim_id)
        killers = {e.steamid for e in match.recent_events("kill", now - self.tuning["killer_window"])
                   if e.steamid in alive and (victim is None or match.players[e.steamid].team != victim.team)}
        if not killers:
            return None
        if victim and victim.position:
            return min(killers, key=lambda k: distance(victim.position, match.players[k].position)
                       if match.players[k].position else math.inf)
        return next(iter(killers))

    def switched(self, steamid: str, now: float) -> None:
        """The camera was told to go to `steamid`."""
        self.last_switch, self.last_target = now, steamid
        self.shown_at[steamid] = now
