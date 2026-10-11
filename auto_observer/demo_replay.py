"""Running the director over raw demo data (from demo_export.py) and measuring how good it is.

The raw data is turned back into GSI-like posts (what CS2 would have sent a spectator), the director decides
on each frame as it would live, and a simulated camera follows at once. Measured against what really happened:

* kills seen: was the camera on the killer or the victim when the kill fell – and since how long (lead)?
* switches per minute of live play, and how many shots were shorter than a second
* the worst misses (round, time, who killed whom where, and what the camera showed instead)

    python -m auto_observer.demo_replay <file>.rohdaten.jsonl.gz [more files] [--round N]
"""

import argparse
import math
import statistics
import sys
from collections import Counter, defaultdict

from .demo_export import load
from .director import Director
from .game import Match
from .weapons import THROWN, from_display

ROUND_TIME = 115.0
BOMB_TIME = 40.0
FLIGHT_SECONDS = 1.5          # a thrown grenade is "in the air" this long (for the throw detection)


def _vector(values) -> str | None:
    if any(v is None for v in values):
        return None
    return ", ".join(f"{v:.2f}" for v in values)


def _forward(yaw, pitch) -> str | None:
    if yaw is None or pitch is None:
        return None
    yaw, pitch = math.radians(yaw), math.radians(pitch)
    return _vector((math.cos(pitch) * math.cos(yaw), math.cos(pitch) * math.sin(yaw), -math.sin(pitch)))


class GsiBuilder:
    """Rebuilds GSI posts from raw demo rows (state carried between frames: stats, bomb, grenades, reloads)."""

    def __init__(self, meta: dict):
        self.meta = meta
        self.index = {name: i for i, name in enumerate(meta["frame_fields"])}
        self.slots: dict[str, int] = {}
        self.kills = defaultdict(int)
        self.deaths = defaultdict(int)
        self.assists = defaultdict(int)
        self.round_kills = defaultdict(int)
        self.round_killhs = defaultdict(int)
        self.round_damage = defaultdict(int)
        self.reload_until: dict[str, float] = {}
        self.blind_until: dict[str, float] = {}
        self.grenades: dict[str, dict] = {}      # id → GSI grenade (+ "_until")
        self.grenade_count = 0
        self.bomb = {"state": "", "player": "", "plant_time": None, "position": None}
        self.round = 0
        self.freeze_end = None
        self.round_over = False
        self.positions: dict[str, tuple] = {}

    def event(self, row: dict) -> None:
        name, t = row["name"], row["t"]
        if name == "round_freeze_end":
            self.freeze_end, self.round_over = t, False
            self.round_kills.clear(), self.round_killhs.clear(), self.round_damage.clear()
            self.bomb = {"state": "carried", "player": "", "plant_time": None, "position": None}
        elif name == "round_end":
            self.round_over = True
        elif name == "player_death":
            attacker, victim = str(row.get("attacker") or ""), str(row.get("victim") or "")
            self.deaths[victim] += 1
            if attacker and attacker != victim:
                self.kills[attacker] += 1
                self.round_kills[attacker] += 1
                if row.get("headshot"):
                    self.round_killhs[attacker] += 1
            if row.get("assister"):
                self.assists[str(row["assister"])] += 1
        elif name == "player_hurt":
            attacker = str(row.get("attacker") or "")
            if attacker:
                self.round_damage[attacker] += int(row.get("dmg") or 0)
        elif name == "weapon_reload":
            self.reload_until[str(row.get("player"))] = t + 2.5
        elif name == "player_blind":
            self.blind_until[str(row.get("victim"))] = t + float(row.get("duration") or 0)
        elif name == "weapon_fire":
            kind = THROWN.get(str(row.get("weapon") or ""))
            if kind:
                self.grenade_count += 1
                self.grenades[f"g{self.grenade_count}"] = {"owner": str(row.get("player")), "type": kind,
                                                            "lifetime": "0.1", "_until": t + FLIGHT_SECONDS}
        elif name == "smokegrenade_detonate":
            self.grenades[f"s{row.get('id')}"] = {"owner": str(row.get("player")), "type": "smoke", "effecttime": "1.0",
                                                  "position": _vector((row.get("x"), row.get("y"), row.get("z"))),
                                                  "_until": t + 18}
        elif name == "smokegrenade_expired":
            self.grenades.pop(f"s{row.get('id')}", None)
        elif name == "inferno_startburn":
            position = _vector((row.get("x"), row.get("y"), row.get("z")))
            self.grenades[f"i{row.get('id')}"] = {"owner": str(row.get("player")), "type": "inferno",
                                                  "flames": {"f": position}, "_until": t + 7}
        elif name == "inferno_expire":
            self.grenades.pop(f"i{row.get('id')}", None)
        elif name in ("bomb_pickup",):
            self.bomb.update(state="carried", player=str(row.get("player")))
        elif name == "bomb_dropped":
            self.bomb.update(state="dropped", player="")
        elif name == "bomb_beginplant":
            self.bomb.update(state="planting", player=str(row.get("player")))
        elif name == "bomb_planted":
            planter = str(row.get("player"))
            self.bomb.update(state="planted", player="", plant_time=t, position=self.positions.get(planter))
        elif name == "bomb_begindefuse":
            self.bomb.update(state="defusing", player=str(row.get("player")))
        elif name in ("bomb_defused", "bomb_exploded"):
            self.bomb.update(state=name.removeprefix("bomb_"), player="")

    def frame(self, row: dict, observed: str) -> dict:
        """GSI post for one frame; `observed` is the player the simulated camera is on."""
        i, t = self.index, row["t"]
        players = {}
        sides = defaultdict(list)
        for p in row["p"]:
            sides[p[i["team"]]].append(p[0])
        for team in sides.values():
            for steamid in sorted(team):
                self.slots.setdefault(steamid, len(self.slots) % 10)
        for p in row["p"]:
            steamid = p[0]
            alive = p[i["alive"]]
            position = (p[i["x"]], p[i["y"]], p[i["z"]])
            if alive and None not in position:
                self.positions[steamid] = position
            weapons = {}
            active_name, active_type, active_clip = from_display(p[i["weapon"]])
            reloading = self.reload_until.get(steamid, -1) > t
            for n, display in enumerate(p[i["inventory"]] or []):
                gsi, kind, clip_max = from_display(display)
                is_active = display == p[i["weapon"]]
                weapon = {"name": gsi, "type": kind,
                          "state": ("reloading" if reloading else "active") if is_active else "holstered"}
                if clip_max > 0:
                    weapon["ammo_clip"] = p[i["ammo"]] if is_active and p[i["ammo"]] is not None else clip_max
                    weapon["ammo_clip_max"] = clip_max
                weapons[f"weapon_{n}"] = weapon
            if active_name and not any(w["state"] != "holstered" for w in weapons.values()):
                weapons["weapon_active"] = {"name": active_name, "type": active_type, "state": "active",
                                            "ammo_clip": p[i["ammo"]] if p[i["ammo"]] is not None else -1,
                                            "ammo_clip_max": active_clip}
            blind = self.blind_until.get(steamid, -1) - t
            players[steamid] = {
                "name": self.meta["players"].get(steamid, steamid), "team": p[i["team"]],
                "observer_slot": self.slots.get(steamid, -1),
                "state": {"health": p[i["hp"]] or 0 if alive else 0, "armor": p[i["armor"]] or 0,
                          "helmet": p[i["helmet"]], "flashed": 255 if blind > 0.7 else int(max(0, blind) / 0.7 * 200),
                          "round_kills": self.round_kills[steamid], "round_killhs": self.round_killhs[steamid],
                          "round_totaldmg": self.round_damage[steamid], "equip_value": p[i["equip"]] or 0,
                          "money": p[i["money"]] or 0, "defusekit": p[i["kit"]]},
                "match_stats": {"kills": self.kills[steamid], "deaths": self.deaths[steamid],
                                "assists": self.assists[steamid]},
                "weapons": weapons,
                "position": _vector(position), "forward": _forward(p[i["yaw"]], p[i["pitch"]]),
            }
        self.grenades = {k: g for k, g in self.grenades.items() if g["_until"] > t}
        phase = "freezetime" if row.get("freeze") else "over" if self.round_over else "live"
        countdown = {"phase": "live", "phase_ends_in": str(max(0.0, ROUND_TIME - (t - self.freeze_end)))
                     } if self.freeze_end is not None and phase == "live" else {"phase": phase}
        bomb = {"state": self.bomb["state"], "player": self.bomb["player"]}
        if self.bomb["state"] in ("planted", "defusing") and self.bomb["plant_time"] is not None:
            left = max(0.0, BOMB_TIME - (t - self.bomb["plant_time"]))
            bomb["countdown"] = f"{left:.1f}"
            countdown = {"phase": "bomb", "phase_ends_in": f"{left:.1f}"}
            if self.bomb["position"]:
                bomb["position"] = _vector(self.bomb["position"])
        return {
            "map": {"name": self.meta.get("map", ""), "phase": "live", "round": row["round"] - 1},
            "round": {"phase": phase}, "player": {"steamid": observed}, "allplayers": players, "bomb": bomb,
            "phase_countdowns": countdown,
            "grenades": {k: {key: v for key, v in g.items() if not key.startswith("_")} for k, g in self.grenades.items()},
        }


def timeline(path: str) -> tuple[dict, list[tuple]]:
    """Raw data turned into what the director sees, once per file: ("frame", t, round, post) and
    ("kill", t, round, attacker, victim, freeze_end). The camera is filled in per run (post["player"])."""
    meta, rows = load(path)
    builder = GsiBuilder(meta)
    items = []
    for row in rows:
        if row["type"] == "e":
            builder.event(row)
            if row["name"] == "player_death" and row.get("attacker") and row.get("attacker") != row.get("victim"):
                items.append(("kill", row["t"], row["round"], str(row["attacker"]), str(row.get("victim")),
                              builder.freeze_end))
        else:
            items.append(("frame", row["t"], row["round"], builder.frame(row, "")))
    return meta, items


def evaluate(source, tuning: dict | None = None, only_round: int | None = None, weights: dict | None = None) -> dict:
    """Run the director over one raw data file (path, or the result of timeline()); returns the measurements."""
    meta, items = timeline(source) if isinstance(source, str) else source
    match, director = Match(), Director(tuning)
    weights = weights or {}
    camera, camera_since = "", 0.0
    segments: list[tuple[float, float, str, str]] = []           # (start, end, steamid, reason)
    reason = ""
    kills, live_time, last_t, live_switches = [], 0.0, None, 0
    for item in items:
        if only_round is not None and item[2] != only_round:
            continue
        if item[0] == "kill":
            _, t, round_number, attacker, victim, freeze_end = item
            kills.append({"t": t, "round": round_number, "attacker": attacker, "victim": victim, "camera": camera,
                          "since": camera_since, "reason": reason, "freeze_end": freeze_end})
            continue
        _, t, _, post = item
        live = match.round_phase == "live"
        if last_t is not None and live:
            live_time += t - last_t
        last_t = t
        post["player"] = {"steamid": camera}
        events = match.update(post, t)
        director.feed(events, match)
        ratings = director.rate(match, lambda p: weights.get(p.steamid, 1.0), t, 0.5)
        decision = director.decide(match, ratings, camera, t)
        if decision and decision.steamid != camera:
            if camera:
                segments.append((camera_since, t, camera, reason))
            live_switches += live
            director.switched(decision.steamid, t)
            camera, camera_since, reason = decision.steamid, t, f"{decision.reason} {decision.detail}".strip()
    if camera and last_t is not None:
        segments.append((camera_since, last_t, camera, reason))

    names = meta.get("players", {})
    seen = [k for k in kills if k["camera"] in (k["attacker"], k["victim"])]
    leads = [k["t"] - k["since"] for k in seen]
    shots = [end - start for start, end, _, _ in segments if end > start]
    misses = []
    for k in kills:
        if k in seen:
            continue
        misses.append(f"Runde {k['round']:>2} {k['t'] - (k['freeze_end'] or k['t']):5.1f}s: "
                      f"{names.get(k['attacker'], '?')} → {names.get(k['victim'], '?')}, "
                      f"Kamera auf {names.get(k['camera'], '-')} ({k['reason'] or '-'})")
    return {
        "map": meta.get("map"), "source": meta.get("source"), "kills": len(kills), "seen": len(seen),
        "seen_rate": len(seen) / len(kills) if kills else None,
        "lead_05": sum(1 for x in leads if x >= 0.5) / len(kills) if kills else None,
        "lead_1": sum(1 for x in leads if x >= 1.0) / len(kills) if kills else None,
        "lead_median": statistics.median(leads) if leads else None,
        "on_killer": sum(1 for k in seen if k["camera"] == k["attacker"]),
        "switches": len(segments), "switches_per_min": live_switches / (live_time / 60) if live_time else None,
        "short_shots": sum(1 for s in shots if s < 1.0), "shot_median": statistics.median(shots) if shots else None,
        "reasons": dict(Counter(reason.split(" ")[0] for _, _, _, reason in segments).most_common()),
        "misses": misses,
    }


def report(result: dict, misses: int = 20) -> str:
    """Short text for the chat."""
    def pct(value) -> str:
        return "-" if value is None else f"{value:.0%}"
    lines = [
        f"{result['map']} ({result['source']}): {result['kills']} Kills",
        f"  gesehen (Kamera auf Schütze oder Opfer): {result['seen']} = {pct(result['seen_rate'])}, "
        f"davon auf dem Schützen {result['on_killer']}",
        f"  mit Vorlauf ≥0,5 s: {pct(result['lead_05'])}, ≥1 s: {pct(result['lead_1'])}, "
        f"Median {result['lead_median'] or 0:.1f} s",
        f"  Wechsel: {result['switches']} ({(result['switches_per_min'] or 0):.1f}/min live), "
        f"Einstellung Median {(result['shot_median'] or 0):.1f} s, kürzer als 1 s: {result['short_shots']}",
    ]
    lines.append("  Wechsel-Gründe: " + ", ".join(f"{k} {v}" for k, v in result["reasons"].items()))
    if result["misses"]:
        lines.append(f"  verpasst ({len(result['misses'])}):")
        lines += ["    " + miss for miss in result["misses"][:misses]]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="auto_observer.demo_replay")
    parser.add_argument("files", nargs="+")
    parser.add_argument("--round", type=int)
    args = parser.parse_args(argv)
    for path in args.files:
        print(report(evaluate(path, only_round=args.round)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
