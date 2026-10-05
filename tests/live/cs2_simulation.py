"""Sends simulated CS2 game state to the running app – for trying the live stats without CS2.

    python tests/live/cs2_simulation.py [url] [rounds]

url defaults to this PC (http://127.0.0.1:8787/api/gsi); for the network receiver use
http://<ip>:8788/api/gsi. Ten players (team Alpha on CT, team Beta on T) play `rounds` rounds
(default 5): each round has a freeze time, a live phase with kills and damage, and an end.
"""

import json
import random
import sys
import urllib.request

INFO_URL = "http://localhost:8787/api/gsi-info"
PLAYER_NAMES = ["Alpha1", "Alpha2", "Alpha3", "Alpha4", "Alpha5", "Beta1", "Beta2", "Beta3", "Beta4", "Beta5"]


class Match:
    """A simulated match on de_mirage that posts its state like CS2's Game State Integration."""

    def __init__(self, url: str, token: str):
        self.url, self.token = url, token
        self.players = {f"7656{i:04d}": {"name": name, "team": "CT" if i < 5 else "T", "k": 0, "d": 0, "a": 0, "mvps": 0}
                        for i, name in enumerate(PLAYER_NAMES)}
        self.score = {"CT": 0, "T": 0}

    def post(self, round_number: int, phase: str, damage: dict, headshots: dict) -> int:
        """Post one game state; returns the HTTP status."""
        all_players = {steam_id: {
            "name": p["name"], "team": p["team"],
            "match_stats": {"kills": p["k"], "deaths": p["d"], "assists": p["a"], "mvps": p["mvps"], "score": 0},
            "state": {"health": 100, "armor": 100, "money": 4000, "equip_value": 4500, "round_kills": 0,
                      "round_killhs": headshots.get(steam_id, 0), "round_totaldmg": damage.get(steam_id, 0)}}
            for steam_id, p in self.players.items()}
        state = {"auth": {"token": self.token},
                 "map": {"name": "de_mirage", "phase": "live", "round": round_number,
                         "team_ct": {"score": self.score["CT"], "name": "Team Alpha"},
                         "team_t": {"score": self.score["T"], "name": "Team Beta"}},
                 "round": {"phase": phase}, "player": {"steamid": "76560002"}, "allplayers": all_players}
        request = urllib.request.Request(self.url, data=json.dumps(state).encode(), method="POST")
        with urllib.request.urlopen(request) as answer:
            return answer.status

    def play_round(self, round_number: int) -> None:
        """Freeze time, a live phase where every player either gets a kill or dies, then the round end."""
        self.post(round_number, "freezetime", {}, {})
        damage, headshots = {}, {}
        for steam_id, p in self.players.items():
            if random.random() < 0.5:
                p["k"] += 1
                damage[steam_id], headshots[steam_id] = 100, int(random.random() < 0.5)
            else:
                p["d"] += 1
                damage[steam_id] = random.randint(0, 60)
        self.post(round_number, "live", damage, headshots)
        self.score["CT" if round_number % 2 == 0 else "T"] += 1
        self.post(round_number, "over", damage, headshots)


def main() -> None:
    url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8787/api/gsi"
    rounds = int(sys.argv[2]) if len(sys.argv) > 2 else 5
    with urllib.request.urlopen(INFO_URL) as answer:
        token = json.load(answer)["token"]
    random.seed(4)
    match = Match(url, token)
    for round_number in range(rounds):
        match.play_round(round_number)
    print(f"sent {rounds} rounds")


main()
