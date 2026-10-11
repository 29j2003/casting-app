"""The director: rates every alive player from the game situation and decides whom the camera shows.

Each player's rating = (base + decaying event score + situational score) × importance.

* Event score: things that just happened (kill, multi-kill, trade, clutch kill, damage taken, shots). Each adds
  a boost that fades with a half-life – slowly while the player is still in a fight, fast otherwise.
* Situational score: recomputed every tick from what is true right now – clutch, duels (with an estimate of
  who wins: health, armor, weapon, form, who has whom in view), flanks, an enemy holding the angle a clutcher
  walks into, plant/defuse, pushes.
* Importance: the producer's slider per player and per team (0–200 %) times the form from the match data;
  how much the form counts is a setting ("data_mix").

Switching rules keep the picture calm: a minimum time on a player that depends on the pace of the round
(long in a quiet 1v1, short when kills come fast), a clear margin before cutting, an immediate cut for a
much bigger moment, and an immediate cut when the shown player dies.

The scoring ideas (event decay, flank and sniper ranges, margin + dwell) follow the "Smart Auto Observer" of
AlexNB01/cs2-observer-toolkit (MIT License, Copyright (c) 2026 AlexNB01); the code here is written anew.
"""

import math
from dataclasses import dataclass, field

from .game import Event, Match, Player, approaching, distance, facing

# All tuning values in one place (game units, seconds, points).
TUNING = {
    "base": 5.0,                 # every alive player – lets the importance decide when nothing happens
    "kill": 100.0, "headshot": 15.0, "multi_kill": 25.0, "trade": 30.0, "trade_window": 5.0,
    "clutch_kill": 40.0, "clutch_kill_per_enemy": 20.0,
    "damage_taken": 50.0,
    "shot": 10.0, "shot_aimed": 15.0, "shot_cap": 45.0,
    "half_life_fight": 5.0, "half_life_near": 3.0, "half_life_idle": 2.0,
    "clutch": 300.0, "clutch_per_enemy": 25.0,
    "duel": 120.0, "duel_cap": 200.0, "duel_angle": 35.0,
    "flank": 45.0, "proximity": 10.0, "proximity_range": 1200.0,
    "angle_hold": 260.0, "angle_hold_degrees": 10.0,   # beats the clutcher by a "jump": cut before he peeks
    "plant": 150.0, "defuse": 200.0, "stop_defuse": 260.0, "stop_defuse_range": 2500.0,
    "push": 30.0, "push_carrier": 80.0, "push_radius": 700.0, "push_speed": 130.0,
    "flashed_factor": 0.4,       # a flashed player's view is white – show someone else
    "dwell": 2.5, "dwell_fast": 1.4, "dwell_calm": 4.0,
    "margin_factor": 1.25, "margin": 25.0,
    "jump": 250.0, "jump_min": 0.8,
    "dead_switch_gap": 0.4,      # wait this long between commands while the camera is on a dead player
    "freezetime_dwell": 2.0,
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


def duel_chance(a: Player, b: Player, form_a: float, form_b: float, a_sees_b: bool, b_sees_a: bool) -> float:
    """Rough chance that `a` wins a duel against `b` (0..1): health, armor, weapon, form, who has whom in view."""
    def strength(p: Player, p_form: float, sees: bool, seen: bool) -> float:
        armor = 1.0 if p.armor > 0 else 0.85
        if p.helmet:
            armor += 0.05
        value = p.weapon_strength * (max(1, p.health) / 100) ** 0.6 * armor * p_form
        if sees and not seen:
            value *= 1.8                   # behind or beside the enemy: big advantage
        if p.flashed > 150:
            value *= 0.3
        return value
    sa = strength(a, form_a, a_sees_b, b_sees_a)
    sb = strength(b, form_b, b_sees_a, a_sees_b)
    return sa / (sa + sb) if sa + sb > 0 else 0.5


class Director:
    """Keeps the decaying event scores and the switching memory; rates players and decides."""

    def __init__(self, tuning: dict | None = None):
        self.tuning = dict(TUNING, **(tuning or {}))
        self.event_scores: dict[str, list[tuple[float, float, str, str]]] = {}   # steamid → (time, amount, code, detail)
        self.last_switch = -math.inf
        self.last_target = ""
        self.ratings: list[Rating] = []

    def reset(self) -> None:
        self.event_scores.clear()
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
            elif event.kind == "shot":
                aimed = any(facing(player, enemy, 20) and distance(player.position, enemy.position) <= player.engage_range
                            for enemy in match.enemies(player) if player.position and enemy.position)
                boosts.append((event.time, t["shot"] + (t["shot_aimed"] if aimed else 0), "shots", ""))
            elif event.kind == "death":
                self.event_scores.pop(event.steamid, None)

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
            result["shots"] = (min(t["shot_cap"], result["shots"][0]), "")
        return result

    # --- situation ---

    def _situation(self, player: Player, match: Match, forms: dict[str, float]) -> dict[str, tuple[float, str]]:
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

        duel_points = 0.0
        duel_detail = ""
        best_duel = 0.0
        for enemy in enemies:
            if not (player.position and enemy.position):
                continue
            gap = distance(player.position, enemy.position)
            reach = max(player.engage_range, enemy.engage_range)
            if gap < t["proximity_range"]:
                add("proximity", t["proximity"] * (1 - gap / t["proximity_range"]))
            if gap > reach:
                continue
            sees = facing(player, enemy, t["duel_angle"])
            seen = facing(enemy, player, t["duel_angle"])
            closeness = 1 - gap / reach
            if sees or seen:
                chance = duel_chance(player, enemy, forms.get(player.steamid, 1.0), forms.get(enemy.steamid, 1.0), sees, seen)
                points = t["duel"] * closeness * chance
                duel_points += points
                if points > best_duel:
                    best_duel, duel_detail = points, enemy.name
            if sees and not seen and gap <= player.engage_range:
                add("flank", t["flank"] * closeness, enemy.name)
            # an enemy clutcher walks into the angle this player holds
            if (len(match.alive(enemy.team)) == 1 and gap <= player.engage_range
                    and facing(player, enemy, t["angle_hold_degrees"]) and approaching(enemy, player)):
                enemies_of_clutcher = len(match.enemies(enemy))
                add("angle", t["clutch"] + t["clutch_per_enemy"] * enemies_of_clutcher + t["angle_hold"], enemy.name)
        if duel_points:
            add("duel", min(t["duel_cap"], duel_points), duel_detail)

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
                add("push", t["push_carrier"] if carrier else t["push"])
        return parts

    # --- rating and deciding ---

    def rate(self, match: Match, importance, now: float, data_mix: float) -> list[Rating]:
        """Ratings of all alive players, best first. `importance(player)` gives the producer's weight (0..2)."""
        t = self.tuning
        forms = {p.steamid: form(p, match) for p in match.players.values()}
        ratings = []
        for player in match.alive():
            if not player.team:
                continue
            parts = self._event_score(player, match, now)
            for code, (points, detail) in self._situation(player, match, forms).items():
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
                                  {code: round(points, 1) for code, (points, _) in parts.items()}))
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
            # before the round: the most important player, once
            top = max(ratings, key=lambda r: (r.importance, r.steamid == current))
            if shown and top.steamid != current and top.importance > shown.importance and since >= t["freezetime_dwell"]:
                return Decision(top.steamid, "importance")
            if not shown and since >= t["dead_switch_gap"]:
                return Decision(top.steamid, "importance")
            return None
        if shown is None:
            # dead, left or free camera: cut away at once
            return Decision(best.steamid, best.reason, best.detail) if since >= t["dead_switch_gap"] else None
        if match.round_phase in ROUND_OVER or best.steamid == current:
            return None
        if best.score >= shown.score + t["jump"] and since >= t["jump_min"]:
            return Decision(best.steamid, best.reason, best.detail)
        if since >= self.dwell(match, now) and best.score > shown.score * t["margin_factor"] + t["margin"]:
            return Decision(best.steamid, best.reason, best.detail)
        return None

    def switched(self, steamid: str, now: float) -> None:
        """The camera was told to go to `steamid`."""
        self.last_switch, self.last_target = now, steamid
