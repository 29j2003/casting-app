# Simuliert CS2: 10 Spieler, Runden, Schaden
import json, urllib.request, sys, random
TOKEN = json.load(urllib.request.urlopen("http://localhost:8787/api/gsi-info"))["token"]
ziel = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8787/api/gsi"
runden = int(sys.argv[2]) if len(sys.argv) > 2 else 5
random.seed(4)
spieler = {f"7656{i:04d}": {"name": n, "team": "CT" if i < 5 else "T", "k": 0, "d": 0, "a": 0, "mvps": 0} for i, n in enumerate(["Alpha1", "Alpha2", "Alpha3", "Alpha4", "Alpha5", "Beta1", "Beta2", "Beta3", "Beta4", "Beta5"])}
ct, t = 0, 0
def senden(runde, phase, dmg, hs):
    ap = {sid: {"name": p["name"], "team": p["team"], "match_stats": {"kills": p["k"], "deaths": p["d"], "assists": p["a"], "mvps": p["mvps"], "score": 0},
                "state": {"health": 100, "armor": 100, "money": 4000, "equip_value": 4500, "round_kills": 0, "round_killhs": hs.get(sid, 0), "round_totaldmg": dmg.get(sid, 0)}} for sid, p in spieler.items()}
    j = {"auth": {"token": TOKEN}, "map": {"name": "de_mirage", "phase": "live", "round": runde, "team_ct": {"score": ct, "name": "Team Alpha"}, "team_t": {"score": t, "name": "Team Beta"}},
         "round": {"phase": phase}, "player": {"steamid": "76560002"}, "allplayers": ap}
    return urllib.request.urlopen(urllib.request.Request(ziel, data=json.dumps(j).encode(), method="POST")).status
for r in range(runden):
    senden(r, "freezetime", {}, {})
    dmg, hs = {}, {}
    for sid, p in spieler.items():
        if random.random() < .5: p["k"] += 1; dmg[sid] = 100; hs[sid] = 1 if random.random() < .5 else 0
        else: p["d"] += 1; dmg[sid] = random.randint(0, 60)
    senden(r, "live", dmg, hs)
    if r % 2 == 0: ct += 1
    else: t += 1
    senden(r, "over", dmg, hs)
print("gesendet:", runden, "Runden")
