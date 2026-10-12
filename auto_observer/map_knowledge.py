"""Map knowledge learned from demos: where fights happen.

From raw demo data (demo_export.py) we count, per map and for every moment of live play, which callout each T and
each CT stands at and whether the two kill each other within the next seconds. That gives, per pair of callouts
(T at X, CT at Y), the chance of a fight soon – "Palace vs. A site" is hot, "T spawn vs. CT spawn" is not.

GSI does not send callouts, only positions, so each map also gets a coarse grid (position → most frequent callout
there, from the demo frames).

    python -m auto_observer.map_knowledge build <file>.rohdaten.jsonl.gz [...]   → auto_observer/map_data/<map>.json

The live director uses `MapKnowledge.fight_chance(map, T position, CT position)`.
"""

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

from .demo_export import load

DATA_FOLDER = Path(__file__).resolve().parent / "map_data"
HORIZON = 3.0            # a "fight soon" = a kill between the two within this many seconds
SAMPLE_EVERY = 2         # use every 2nd frame (4 per second at the default export)
CELL = 96                # grid cell size in game units (x, y)
LEVEL = 160              # height step (maps with floors on top of each other, e.g. Nuke)
PRIOR = 30.0             # pseudo frames that pull rare callout pairs towards the map's average


def cell_key(x: float, y: float, z: float) -> str:
    return f"{int(x // CELL)}_{int(y // CELL)}_{int(z // LEVEL)}"


class Counts:
    """Counting for one map (several demos of the same map add up)."""

    def __init__(self):
        self.grid: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self.pairs: dict[tuple[str, str], list[int]] = defaultdict(lambda: [0, 0])   # (T place, CT place) → [frames, fights]
        self.frames = 0
        self.fights = 0

    def add_file(self, path) -> str:
        meta, rows = load(path)
        index = {name: i for i, name in enumerate(meta["frame_fields"])}
        kills = [(r["t"], str(r.get("attacker")), str(r.get("victim"))) for r in rows
                 if r["type"] == "e" and r["name"] == "player_death" and r.get("attacker")]
        fight_times: dict[frozenset, list[float]] = defaultdict(list)
        for moment, attacker, victim in kills:
            fight_times[frozenset((attacker, victim))].append(moment)
        live_from, over = None, True
        frame_number = 0
        for row in rows:
            if row["type"] == "e":
                if row["name"] == "round_freeze_end":
                    live_from, over = row["t"], False
                elif row["name"] == "round_end":
                    over = True
                continue
            frame_number += 1
            alive = [p for p in row["p"] if p[index["alive"]] and p[index["x"]] is not None]
            for p in alive:
                if p[index["place"]]:
                    self.grid[cell_key(p[index["x"]], p[index["y"]], p[index["z"]])][p[index["place"]]] += 1
            if over or live_from is None or row.get("freeze") or frame_number % SAMPLE_EVERY:
                continue
            t = row["t"]
            ts = [p for p in alive if p[index["team"]] == "T"]
            cts = [p for p in alive if p[index["team"]] == "CT"]
            for a in ts:
                for b in cts:
                    key = (a[index["place"]] or "?", b[index["place"]] or "?")
                    fight = any(t < moment <= t + HORIZON for moment in fight_times.get(frozenset((a[0], b[0])), ()))
                    entry = self.pairs[key]
                    entry[0] += 1
                    entry[1] += fight
                    self.frames += 1
                    self.fights += fight
        return meta.get("map", "")

    def result(self, map_name: str) -> dict:
        grid = {cell: max(places.items(), key=lambda item: item[1])[0] for cell, places in self.grid.items()}
        return {"map": map_name, "version": 1, "horizon": HORIZON, "cell": CELL, "level": LEVEL,
                "base": self.fights / self.frames if self.frames else 0.0,
                "pairs": {f"{t}|{ct}": [frames, fights] for (t, ct), (frames, fights) in self.pairs.items()},
                "grid": grid}


def build(paths: list[str]) -> dict[str, dict]:
    """Map name → knowledge, from raw data files (several per map are combined)."""
    counts: dict[str, Counts] = {}
    for path in paths:
        meta, _ = load(path)
        counts.setdefault(meta.get("map", ""), Counts()).add_file(path)
    return {name: count.result(name) for name, count in counts.items()}


class MapKnowledge:
    """Knowledge of all maps that have data; answers "how likely is a fight between these two soon?"."""

    def __init__(self, maps: dict[str, dict] | None = None):
        self.maps = maps or {}
        self._cache: dict[str, dict] = {}

    @classmethod
    def load_folder(cls, folder: Path = DATA_FOLDER) -> "MapKnowledge":
        maps = {}
        if folder.is_dir():
            for path in folder.glob("*.json"):
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    continue
                if isinstance(data, dict) and data.get("map"):
                    maps[data["map"]] = data
        return cls(maps)

    def knows(self, map_name: str) -> bool:
        return map_name in self.maps

    def place(self, map_name: str, position) -> str:
        data = self.maps.get(map_name)
        if not data or not position:
            return ""
        x, y, z = position
        grid = data["grid"]
        cell = cell_key(x, y, z)
        if cell in grid:
            return grid[cell]
        cx, cy, cz = (int(v) for v in cell.split("_"))
        for dz in (0, -1, 1):                          # neighbour cells (positions between two samples)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    near = f"{cx + dx}_{cy + dy}_{cz + dz}"
                    if near in grid:
                        return grid[near]
        return ""

    def fight_chance(self, map_name: str, t_position, ct_position) -> float | None:
        """Chance (0..1) that a T at `t_position` and a CT at `ct_position` fight within the horizon; None if unknown."""
        data = self.maps.get(map_name)
        if not data:
            return None
        t_place, ct_place = self.place(map_name, t_position), self.place(map_name, ct_position)
        if not t_place or not ct_place:
            return None
        frames, fights = data["pairs"].get(f"{t_place}|{ct_place}", (0, 0))
        return (fights + PRIOR * data["base"]) / (frames + PRIOR)


def save(knowledge: dict[str, dict], folder: Path = DATA_FOLDER) -> list[Path]:
    folder.mkdir(parents=True, exist_ok=True)
    written = []
    for name, data in knowledge.items():
        path = folder / f"{name}.json"
        path.write_text(json.dumps(data, separators=(",", ":"), sort_keys=True), encoding="utf-8")
        written.append(path)
    return written


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="auto_observer.map_knowledge")
    parser.add_argument("command", choices=["build"])
    parser.add_argument("files", nargs="+")
    parser.add_argument("--out", default=str(DATA_FOLDER))
    args = parser.parse_args(argv)
    for path in save(build(args.files), Path(args.out)):
        data = json.loads(path.read_text(encoding="utf-8"))
        print(f"{path.name}: {len(data['pairs'])} Callout-Paare, {len(data['grid'])} Rasterfelder, "
              f"Grundrate {data['base']:.3%}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
