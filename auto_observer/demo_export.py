"""Demo export: CS2 demos (also HLTV .rar/.zip, FACEIT .dem.zst/.dem.gz) → raw data for tuning the director.

One output file per map: `<demo>.rohdaten.jsonl.gz`, one JSON object per line, sorted by tick:

* `{"type": "meta", ...}` – map, tick rate, frame step, players, the field order of frames
* `{"type": "f", "tick", "t", "round", "freeze", "planted", "p": [[...], ...]}` – all players every `every` ticks
  (fields in meta["frame_fields"]: position, view, health, armor, weapon, bullets, flashed, scoped, walking,
  money, equipment, kit, defusing, callout, who sees him, inventory)
* `{"type": "e", "tick", "t", "round", "name", ...}` – events: deaths, hits, shots, reloads, zooms, blinds,
  grenades, bomb, round start/end

`t` is seconds since the demo start. `round_text()` makes a short text of one round to paste into a chat.
Parsing uses demoparser2 (MIT, github.com/LaihoE/demoparser); it is only imported when a demo is read.
"""

import bz2
import gzip
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

FORMAT_VERSION = 1
TICKRATE = 64
FRAME_FIELDS = ["steamid", "team", "x", "y", "z", "yaw", "pitch", "hp", "armor", "helmet", "alive", "weapon",
                "ammo", "flash", "scoped", "walking", "duck", "money", "equip", "kit", "defusing", "place",
                "seen_by", "inventory"]
TICK_FIELDS = ["X", "Y", "Z", "yaw", "pitch", "health", "armor_value", "has_helmet", "is_alive", "team_num",
               "active_weapon_name", "active_weapon_ammo", "flash_duration", "is_scoped", "is_walking", "duck_amount",
               "balance", "current_equip_value", "has_defuser", "is_defusing", "last_place_name",
               "approximate_spotted_by", "inventory", "is_freeze_period", "is_bomb_planted"]
# event → the columns kept (renamed for readability)
EVENTS = {
    "player_death": {"attacker_steamid": "attacker", "user_steamid": "victim", "assister_steamid": "assister",
                     "weapon": "weapon", "headshot": "headshot", "thrusmoke": "thrusmoke", "penetrated": "penetrated",
                     "noscope": "noscope", "attackerblind": "attackerblind"},
    "player_hurt": {"attacker_steamid": "attacker", "user_steamid": "victim", "dmg_health": "dmg",
                    "dmg_armor": "dmg_armor", "hitgroup": "hitgroup", "weapon": "weapon", "health": "health"},
    "weapon_fire": {"user_steamid": "player", "weapon": "weapon"},
    "weapon_reload": {"user_steamid": "player"},
    "weapon_zoom": {"user_steamid": "player"},
    "player_blind": {"user_steamid": "victim", "attacker_steamid": "attacker", "blind_duration": "duration"},
    "smokegrenade_detonate": {"user_steamid": "player", "entityid": "id", "x": "x", "y": "y", "z": "z"},
    "smokegrenade_expired": {"user_steamid": "player", "entityid": "id", "x": "x", "y": "y", "z": "z"},
    "flashbang_detonate": {"user_steamid": "player", "entityid": "id", "x": "x", "y": "y", "z": "z"},
    "hegrenade_detonate": {"user_steamid": "player", "entityid": "id", "x": "x", "y": "y", "z": "z"},
    "inferno_startburn": {"user_steamid": "player", "entityid": "id", "x": "x", "y": "y", "z": "z"},
    "inferno_expire": {"user_steamid": "player", "entityid": "id", "x": "x", "y": "y", "z": "z"},
    "bomb_pickup": {"user_steamid": "player"}, "bomb_dropped": {"user_steamid": "player"},
    "bomb_beginplant": {"user_steamid": "player"}, "bomb_planted": {"user_steamid": "player", "site": "site"},
    "bomb_begindefuse": {"user_steamid": "player", "haskit": "haskit"}, "bomb_defused": {"user_steamid": "player"},
    "bomb_exploded": {"user_steamid": "player"},
    "round_freeze_end": {}, "round_end": {"winner": "winner", "reason": "reason"},
}
TEAMS = {2: "T", 3: "CT"}
DEMO_SUFFIXES = (".dem", ".dem.gz", ".dem.zst", ".dem.bz2")
ARCHIVE_SUFFIXES = (".rar", ".zip", ".7z")


# --- getting the .dem files out of downloads ---

def _suffix(path: Path) -> str:
    name = path.name.lower()
    for suffix in DEMO_SUFFIXES + ARCHIVE_SUFFIXES:
        if name.endswith(suffix):
            return suffix
    return path.suffix.lower()


def _seven_zip() -> str | None:
    for candidate in (shutil.which("7z"), r"C:\Program Files\7-Zip\7z.exe", r"C:\Program Files (x86)\7-Zip\7z.exe"):
        if candidate and Path(candidate).is_file():
            return candidate
    return None


def unpack(path: Path, work: Path, log) -> list[Path]:
    """The .dem files in a download: a .dem itself, a packed .dem (.gz/.zst/.bz2) or an archive (.zip/.rar/.7z)."""
    suffix = _suffix(path)
    if suffix == ".dem":
        return [path]
    if suffix in (".dem.gz", ".dem.bz2", ".dem.zst"):
        target = work / path.name[: -len(suffix)]
        target = target.with_name(target.name + ".dem")
        log(f"Entpacke {path.name} …")
        if suffix == ".dem.zst":
            import zstandard
            with open(path, "rb") as source, open(target, "wb") as out:
                zstandard.ZstdDecompressor().copy_stream(source, out)
        else:
            opener = gzip.open if suffix == ".dem.gz" else bz2.open
            with opener(path, "rb") as source, open(target, "wb") as out:
                shutil.copyfileobj(source, out, 1024 * 1024)
        return [target]
    if suffix in ARCHIVE_SUFFIXES:
        folder = work / re.sub(r"[^\w.-]+", "_", path.stem)[:60]
        folder.mkdir(parents=True, exist_ok=True)
        log(f"Entpacke {path.name} …")
        if suffix == ".zip":
            with zipfile.ZipFile(path) as archive:
                for member in archive.infolist():
                    name = Path(member.filename).name
                    if name.lower().endswith(DEMO_SUFFIXES):
                        with archive.open(member) as source, open(folder / name, "wb") as out:
                            shutil.copyfileobj(source, out, 1024 * 1024)
        else:
            _extract_with_tools(path, folder)
        found = []
        for item in sorted(folder.rglob("*")):
            if item.is_file() and item.name.lower().endswith(DEMO_SUFFIXES):
                found += unpack(item, work, log) if not item.name.lower().endswith(".dem") else [item]
        if not found:
            raise ValueError(f"In {path.name} ist keine Demo (.dem)")
        return found
    raise ValueError(f"{path.name}: unbekanntes Format (erwartet .dem, .rar, .zip, .dem.zst, .dem.gz)")


def _extract_with_tools(path: Path, folder: Path) -> None:
    """RAR/7z: Windows' own tar (Windows 11 reads RAR) or 7-Zip if installed."""
    flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    attempts = []
    tar = shutil.which("tar")
    if tar:
        attempts.append([tar, "-xf", str(path), "-C", str(folder)])
    seven = _seven_zip()
    if seven:
        attempts.append([seven, "x", "-y", f"-o{folder}", str(path)])
    for command in attempts:
        try:
            result = subprocess.run(command, capture_output=True, timeout=1800, creationflags=flags)
        except (OSError, subprocess.SubprocessError):
            continue
        if result.returncode == 0 and any(folder.rglob("*.dem*")):
            return
    raise ValueError(f"{path.name} lässt sich nicht entpacken – bitte selbst entpacken (Rechtsklick → Alle "
                     "extrahieren bzw. 7-Zip) und die .dem-Dateien auswählen")


# --- reading a demo ---

def _int(value):
    value = _clean(value)
    return None if value is None else int(value)


def _clean(value):
    """JSON-friendly value: numpy numbers → Python, NaN → None, floats rounded."""
    if value is None:
        return None
    if hasattr(value, "item") and not isinstance(value, (list, tuple, str)):
        try:
            value = value.item()
        except (ValueError, AttributeError):
            pass
    if isinstance(value, float):
        if not math.isfinite(value):
            return None
        return round(value, 1)
    if isinstance(value, (list, tuple)):
        return [_clean(v) for v in value]
    if hasattr(value, "tolist"):
        return [_clean(v) for v in value.tolist()]
    return value


def export(demo: Path, target: Path, every: int = 8, log=print) -> dict:
    """Write the raw data of one demo; returns a short summary (map, rounds, kills, size)."""
    from demoparser2 import DemoParser                      # large – only loaded for demos

    log(f"Lese {demo.name} …")
    parser = DemoParser(str(demo))
    header = parser.parse_header()
    events: list[dict] = []
    last_tick = 0
    round_ends: list[int] = []
    for name, columns in EVENTS.items():
        try:
            table = parser.parse_event(name)
        except Exception:                                    # event not in this demo
            continue
        if table is None or len(table) == 0:
            continue
        for row in table.to_dict("records"):
            tick = int(row.get("tick") or 0)
            last_tick = max(last_tick, tick)
            item = {"type": "e", "tick": tick, "name": name}
            for source, label in columns.items():
                if source in row:
                    item[label] = _clean(row[source])
            if name == "player_death" and isinstance(item.get("weapon"), str):
                item["weapon"] = item["weapon"].removeprefix("weapon_")
            events.append(item)
            if name == "round_end":
                round_ends.append(tick)
    round_ends.sort()
    if not last_tick:
        raise ValueError(f"{demo.name}: keine Spieldaten gefunden")

    def round_of(tick: int) -> int:
        return 1 + sum(1 for end in round_ends if end < tick)

    log(f"{header.get('map_name', '?')}: {len(round_ends)} Runden, lese Positionen …")
    ticks = list(range(0, last_tick + TICKRATE * 3, every))
    table = parser.parse_ticks(TICK_FIELDS, ticks=ticks)
    frames: dict[int, dict] = {}
    players: dict[str, str] = {}
    for row in table.to_dict("records"):
        steamid = str(row.get("steamid") or "")
        team = TEAMS.get(_clean(row.get("team_num")))
        if not steamid or steamid == "0" or not team:
            continue                                         # spectators, GOTV
        tick = int(row["tick"])
        players[steamid] = str(row.get("name") or "")[:32]
        frame = frames.setdefault(tick, {"type": "f", "tick": tick, "freeze": bool(row.get("is_freeze_period")),
                                         "planted": bool(row.get("is_bomb_planted")), "p": []})
        x, y, z = (_clean(row.get(axis)) for axis in ("X", "Y", "Z"))
        frame["p"].append([
            steamid, team, None if x is None else round(x), None if y is None else round(y),
            None if z is None else round(z), _clean(row.get("yaw")), _clean(row.get("pitch")),
            _int(row.get("health")), _int(row.get("armor_value")), bool(row.get("has_helmet")),
            bool(row.get("is_alive")), _clean(row.get("active_weapon_name")), _int(row.get("active_weapon_ammo")),
            _clean(row.get("flash_duration")), bool(row.get("is_scoped")), bool(row.get("is_walking")),
            _clean(row.get("duck_amount")), _int(row.get("balance")), _int(row.get("current_equip_value")),
            bool(row.get("has_defuser")), bool(row.get("is_defusing")), _clean(row.get("last_place_name")),
            [str(s) for s in (_clean(row.get("approximate_spotted_by")) or [])],
            _clean(row.get("inventory")) or [],
        ])
    rows = list(frames.values()) + events
    for row in rows:
        row["t"] = round(row["tick"] / TICKRATE, 3)
        row["round"] = round_of(row["tick"])
    rows.sort(key=lambda r: (r["tick"], r["type"] != "f"))
    kills = sum(1 for e in events if e["name"] == "player_death")
    meta = {"type": "meta", "version": FORMAT_VERSION, "map": header.get("map_name", ""), "tickrate": TICKRATE,
            "every": every, "server": header.get("server_name", ""), "source": demo.name, "players": players,
            "frame_fields": FRAME_FIELDS, "rounds": len(round_ends), "kills": kills}
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(target.name + ".part")       # only complete files carry the real name
    with gzip.open(partial, "wt", encoding="utf-8", compresslevel=6) as out:
        for row in [meta] + rows:
            out.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
    os.replace(partial, target)
    size = target.stat().st_size
    log(f"Fertig: {target.name} ({size / 1_000_000:.1f} MB, {len(round_ends)} Runden, {kills} Kills)")
    return {"file": str(target), "map": meta["map"], "rounds": len(round_ends), "kills": kills, "size": size}


def export_download(path: Path, out_folder: Path, every: int = 8, log=print) -> list[dict]:
    """Export every demo in a download (single demo or archive)."""
    results = []
    with tempfile.TemporaryDirectory(prefix="auto-observer-demo-") as temporary:
        for demo in unpack(path, Path(temporary), log):
            stem = re.sub(r"[^\w.-]+", "_", demo.name[: -len(".dem")])[:80] or "demo"
            results.append(export(demo, out_folder / f"{stem}.rohdaten.jsonl.gz", every, log))
    return results


# --- reading the raw data back ---

def load(path: str | Path) -> tuple[dict, list[dict]]:
    """Meta line and all rows of a raw data file."""
    with gzip.open(path, "rt", encoding="utf-8") as source:
        lines = [json.loads(line) for line in source if line.strip()]
    if not lines or lines[0].get("type") != "meta":
        raise ValueError("keine Rohdaten-Datei")
    return lines[0], lines[1:]


def round_text(path: str | Path, round_number: int, step: float = 2.0) -> str:
    """One round as compact text to paste into a chat: every event with its time, and every `step` seconds
    where each living player is (from the end of the buy time on)."""
    meta, rows = load(path)
    names = meta.get("players", {})
    index = {name: i for i, name in enumerate(meta["frame_fields"])}
    rows = [r for r in rows if r.get("round") == round_number]
    if not rows:
        return f"Runde {round_number} nicht gefunden (Map hat {meta.get('rounds', '?')} Runden)"
    start = next((r["t"] for r in rows if r.get("name") == "round_freeze_end"), rows[0]["t"])
    out = [f"# {meta.get('map')} Runde {round_number} ({meta.get('source')})",
           "# Zeit s seit Kaufphase | Spieler: Name Seite x,y Blick HP Waffe(Kugeln) Callout [gesehen von]"]

    def who(steamid, length: int = 12) -> str:
        return names.get(str(steamid), str(steamid or "?"))[:length]

    def short_weapon(name) -> str:
        return str(name or "-").replace(" Grenade", "").replace("Desert Eagle", "Deagle")[:10]

    next_frame = start
    for row in rows:
        clock = row["t"] - start
        if row["type"] == "f":
            if row["t"] < next_frame:
                continue
            next_frame = row["t"] + step
            parts = []
            for p in row["p"]:
                if not p[index["alive"]]:
                    continue
                seen = ",".join(who(s, 6) for s in p[index["seen_by"]])
                yaw = p[index["yaw"]]
                parts.append(f"{who(p[0])} {p[index['team']]} {p[index['x']]},{p[index['y']]} "
                             f"{'' if yaw is None else round(yaw)} {p[index['hp']]} {short_weapon(p[index['weapon']])}"
                             f"({p[index['ammo']]}) {p[index['place']] or ''}" + (f" [{seen}]" if seen else ""))
            out.append(f"{clock:5.1f} | " + "; ".join(parts))
        elif row["name"] != "weapon_fire" and clock >= -1:
            detail = {k: v for k, v in row.items() if k not in ("type", "tick", "t", "round", "name")}
            for key in ("attacker", "victim", "player", "assister"):
                if detail.get(key):
                    detail[key] = who(detail[key])
            text = " ".join(f"{k}={v}" for k, v in detail.items() if v not in (None, "", False, 0))
            out.append(f"{clock:5.1f} * {row['name']} {text}")
        elif row["name"] == "weapon_fire" and clock >= 0:
            out.append(f"{clock:5.1f} * shot {who(row.get('player'))} {str(row.get('weapon', '')).removeprefix('weapon_')}")
    return "\n".join(out)
