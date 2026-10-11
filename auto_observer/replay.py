"""Play a recording back through the director, without CS2 (for tuning).

    python -m auto_observer.replay recordings/2026-10-11_20-00-00.jsonl [--weights steamid=1.5 ...]

Prints every switch the director would make and how often it agreed with the camera in the recording
(when a human observed, that is the human's choice).
"""

import argparse
import sys

from .director import Director
from .game import Match
from .recorder import load


def simulate(records: list[dict], weights: dict[str, float] | None = None, data_mix: float = 0.5,
             tick: float = 0.1) -> dict:
    """Run the director over recorded posts. The simulated camera follows the director's switches at once."""
    weights = weights or {}
    match, director = Match(), Director()
    switches: list[dict] = []
    current = ""
    agree = total = 0
    next_tick = None
    posts = [r for r in records if isinstance(r.get("gsi"), dict)]
    for record in posts:
        now = float(record["t"])
        events = match.update(record["gsi"], now)
        director.feed(events, match)
        if next_tick is None:
            next_tick = now
        while next_tick <= now:
            ratings = director.rate(match, lambda p: weights.get(p.steamid, 1.0), next_tick, data_mix)
            decision = director.decide(match, ratings, current, next_tick)
            if decision:
                director.switched(decision.steamid, next_tick)
                current = decision.steamid
                player = match.players[decision.steamid]
                switches.append({"t": round(next_tick, 1), "round": match.round + 1, "name": player.name,
                                 "reason": decision.reason, "detail": decision.detail})
            next_tick += tick
        if match.round_phase == "live" and match.observed in match.players:
            total += 1
            agree += match.observed == current
    return {"switches": switches, "agreement": agree / total if total else None, "posts": len(posts)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="auto_observer.replay")
    parser.add_argument("file")
    parser.add_argument("--weights", nargs="*", default=[], help="steamid=Gewicht, z. B. 7656…=1.5")
    parser.add_argument("--mix", type=float, default=0.5, help="Einfluss der Matchdaten 0..1")
    args = parser.parse_args(argv)
    weights = {}
    for item in args.weights:
        key, _, value = item.partition("=")
        weights[key] = float(value)
    result = simulate(load(args.file), weights, args.mix)
    for switch in result["switches"]:
        detail = f" ({switch['detail']})" if switch["detail"] else ""
        print(f"{switch['t']:8.1f}s  Runde {switch['round']:>2}  → {switch['name']:<20} {switch['reason']}{detail}")
    agreement = result["agreement"]
    print(f"\n{len(result['switches'])} Wechsel bei {result['posts']} Posts", end="")
    print(f", Übereinstimmung mit der Aufnahme: {agreement:.0%}" if agreement is not None else "")
    return 0


if __name__ == "__main__":
    sys.exit(main())
