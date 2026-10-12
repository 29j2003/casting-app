"""The engine ties everything together: GSI posts in, director decisions out to the camera.

* `on_gsi()` takes CS2's posts (token checked), updates the match and feeds events to the director.
* `tick()` runs ten times a second: rates the players, decides and switches the camera.
* Taking over by hand (a click on the control page, or someone switching in CS2) pauses the automatic;
  with the return timer on, it takes over again after the set seconds.
* `state()` is everything the control page shows.
"""

import math
import secrets
import threading
import time
from collections import deque
from pathlib import Path

from . import VERSION, launcher
from .camera import Camera
from .cs2_cfg import cfg_installed, cs2_exe, find_cfg_folders, find_steam_exe, write_cfg
from .director import Director, form
from .map_knowledge import MapKnowledge
from .game import Match, Player
from .recorder import Recorder, without_token
from .settings import DEFAULTS, Settings

GSI_TIMEOUT = 5.0          # no post for this long: CS2 is not sending
COMMAND_GRACE = 2.0        # time CS2 gets to report a switch we sent
LOG_LINES = 80
CAMERA_NAMES = {"netcon": "Fernkonsole", "keys": "Tasten", "none": "keine"}


class Engine:
    """State and logic of the running Auto-Observer (thread-safe, all public methods take the lock)."""

    def __init__(self, settings: Settings, camera: Camera, recorder: Recorder, port: int, clock=time.monotonic):
        self.settings, self.camera, self.recorder = settings, camera, recorder
        self.port = port
        self.clock = clock
        self.lock = threading.RLock()
        self.match = Match()
        self.knowledge = MapKnowledge.load_folder()       # where fights happen per map (learned from demos)
        self.director = Director(knowledge=self.knowledge)
        self.paused = False
        self.paused_until: float | None = None
        self.pause_reason = ""
        self.commanded, self.commanded_at = "", -math.inf
        self.last_observed = ""
        self.last_switch: dict | None = None
        self.last_gsi, self.posts = -math.inf, 0
        self.receiving = False
        self.xray_sent = False
        self.camera_problem = ""
        self.log_lines: deque = deque(maxlen=LOG_LINES)
        self.echo = None                        # optional: also print log lines (console window)

    @property
    def gsi_uri(self) -> str:
        return f"http://127.0.0.1:{self.port}/gsi"

    def log(self, text: str, level: str = "info") -> None:
        self.log_lines.append({"time": time.strftime("%H:%M:%S"), "text": text, "level": level})
        if self.echo:
            self.echo(f"[{time.strftime('%H:%M:%S')}] {text}")

    # --- CS2 posts ---

    def on_gsi(self, post) -> int:
        """HTTP status for one GSI post."""
        if not isinstance(post, dict):
            return 400
        auth = post.get("auth") if isinstance(post.get("auth"), dict) else {}
        token = auth.get("token") if isinstance(auth.get("token"), str) else ""
        if not secrets.compare_digest(token.encode(), self.settings.token.encode()):
            return 403
        with self.lock:
            now = self.clock()
            if not self.receiving:
                self.receiving = True
                self.log("CS2-Daten kommen an", "ok")
            self.last_gsi = now
            self.posts += 1
            try:
                events = self.match.update(post, now)
            except (TypeError, ValueError, AttributeError, OverflowError):
                return 400                      # not what CS2 sends
            self.director.feed(events, self.match)
            self._check_manual_switch(now)
            current = self._current(now)
            if any(e.kind == "death" and e.steamid == current for e in events):
                self._direct(now)               # shown player died: cut now, not at the next tick
            self.recorder.write({"gsi": without_token(post)})
        return 200

    def _check_manual_switch(self, now: float) -> None:
        """Someone switched the camera in CS2 (observer at the PC): pause the automatic (again: timer restarts)."""
        observed, previous = self.match.observed, self.last_observed
        self.last_observed = observed
        if not observed or observed == previous or not previous:
            return
        if observed == self.commanded and now - self.commanded_at <= 3 * COMMAND_GRACE:
            return                              # our own switch arrived
        if not self.settings["enabled"] or not self.settings["pause_on_manual"]:
            return
        before, after = self.match.players.get(previous), self.match.players.get(observed)
        if not (before and after and before.alive and after.alive):
            return                              # CS2 moves on from a dead player by itself
        if self.match.round_phase not in ("live", "freezetime") or now - self.commanded_at < COMMAND_GRACE:
            return
        self._pause(now, f"Eingriff in CS2: {after.name}")

    # --- taking over ---

    def _pause(self, now: float, reason: str) -> None:
        self.paused = True
        self.paused_until = now + self.settings["return_seconds"] if self.settings["return_timer"] else None
        self.pause_reason = reason
        suffix = f" – zurück in {self.settings['return_seconds']} s" if self.paused_until else " – zurück per Knopf"
        self.log(f"Automatik pausiert ({reason}){suffix}", "warn")

    def resume(self, automatic: bool = False) -> None:
        with self.lock:
            if self.paused:
                self.paused, self.paused_until, self.pause_reason = False, None, ""
                self.director.last_switch = -math.inf
                self.log("Automatik übernimmt wieder" + (" (Timer)" if automatic else ""), "ok")

    def show(self, steamid: str) -> tuple[bool, str]:
        """Put the camera on a player by hand (pauses the automatic)."""
        with self.lock:
            player = self.match.players.get(steamid)
            if not player:
                return False, "Spieler nicht gefunden"
            if not player.alive:
                return False, f"{player.name} ist tot"
            if not self._send(player):
                return False, self.camera_problem or "Kamera nicht erreichbar"
            now = self.clock()
            if self.settings["enabled"]:
                self._pause(now, f"von Hand: {player.name}")
            self.recorder.write({"switch": steamid, "manual": True})
            return True, ""

    # --- the director loop ---

    def tick(self) -> None:
        with self.lock:
            now = self.clock()
            self._keep_xray()
            if self.paused and self.paused_until is not None and now >= self.paused_until:
                self.resume(automatic=True)
            if now - self.last_gsi > GSI_TIMEOUT:
                if self.receiving:
                    self.receiving = False
                    self.log("Keine CS2-Daten mehr", "warn")
                return
            self._direct(now)

    def _direct(self, now: float) -> None:
        """Rate the players and, if the automatic runs, switch the camera when the director says so."""
        ratings = self.director.rate(self.match, self._importance, now, self.settings["data_mix"],
                                     lambda player: self.settings.player_role(player.steamid))
        if not self.settings["enabled"] or self.paused:
            return
        decision = self.director.decide(self.match, ratings, self._current(now), now)
        if decision:
            player = self.match.players.get(decision.steamid)
            if player and self._send(player):
                self.director.switched(player.steamid, now)
                self.last_switch = {"steamid": player.steamid, "name": player.name, "reason": decision.reason,
                                    "detail": decision.detail, "time": now}
                self.recorder.write({"switch": player.steamid, "reason": decision.reason})

    def _send(self, player: Player) -> bool:
        mode = self.camera.mode()
        ok = self.camera.spectate(player.name, player.steamid, player.slot)
        if ok:
            self.commanded, self.commanded_at = player.steamid, self.clock()
            self.camera_problem = ""
        elif mode == "keys":
            self.camera_problem = "CS2 ist nicht im Vordergrund – Tasten kommen nicht an"
        elif mode == "none":
            self.camera_problem = "Keine Verbindung zu CS2 (Fernkonsole)"
        else:
            self.camera_problem = "Befehl ging nicht raus"
        return ok

    def _current(self, now: float) -> str:
        """Player on camera; a switch we just sent counts as done until CS2 reports it."""
        if self.commanded and now - self.commanded_at < COMMAND_GRACE and self.match.observed != self.commanded:
            return self.commanded
        return self.match.observed

    def _importance(self, player: Player) -> float:
        return self.settings.player_weight(player.steamid) * self.settings.team_weight(self.match.team_key(player.team))

    def _keep_xray(self) -> None:
        """Send the X-ray setting once after each (re)connection of the console port."""
        if not self.camera.netcon.connected:
            self.xray_sent = False
        elif not self.xray_sent:
            self.xray_sent = self.camera.set_xray(self.settings["xray"])

    # --- settings and setup ---

    def apply_settings(self, changes: dict) -> list[str]:
        with self.lock:
            changed = self.settings.apply(changes)
            if "enabled" in changed:
                if self.settings["enabled"]:
                    self.paused, self.paused_until, self.pause_reason = False, None, ""
                    self.director.last_switch = -math.inf
                self.log("Auto-Observer " + ("an" if self.settings["enabled"] else "aus"), "ok")
            if "xray" in changed:
                self.xray_sent = self.camera.set_xray(self.settings["xray"])
                if not self.xray_sent:
                    self.log("X-Ray geht nur über die Fernkonsole", "warn")
            if {"netcon_host", "netcon_port"} & set(changed):
                self.camera.apply_settings()
            if "camera_mode" in changed:
                self.log(f"Kamera-Weg: {self.settings['camera_mode']}", "info")
            return changed

    def find_cfg(self) -> list[str]:
        return find_cfg_folders()

    def steam_exe(self) -> str:
        """Steam program: the one set by hand, else the one found."""
        return self.settings["steam_exe"] or find_steam_exe()

    def auto_setup(self) -> None:
        """Find CS2 and write the GSI file without asking (on start and before launching CS2)."""
        folder = self.settings["cfg_folder"]
        if not folder or not Path(folder).is_dir():
            found = find_cfg_folders()
            folder = found[0] if found else ""
        if not folder:
            self.log("CS2 nicht gefunden – cfg-Ordner in der Einrichtung eintragen", "warn")
            return
        if not cfg_installed(folder, self.settings.token):
            ok, message = self.write_cfg(folder)
            if not ok:
                self.log(f"GSI-Datei nicht geschrieben: {message}", "warn")
        elif self.settings["cfg_folder"] != folder:
            self.settings.apply({"cfg_folder": folder})

    def launch_cs2(self) -> tuple[bool, str]:
        """Start CS2 through Steam with the console port (and the extra options)."""
        if self.camera.netcon.connected:
            return False, "CS2 läuft schon und die Fernkonsole ist verbunden"
        self.auto_setup()
        steam = self.steam_exe()
        if not steam:
            return False, "Steam nicht gefunden – Pfad in der Einrichtung eintragen"
        if launcher.cs2_running():
            return False, "CS2 läuft schon, aber ohne Fernkonsole – CS2 beenden und hier neu starten"
        command = launcher.launch_command(steam, self.settings["netcon_port"], self.settings["launch_extra"])
        try:
            launcher.start(command)
        except OSError as error:
            return False, f"Start ging nicht: {error}"
        self.log("CS2 wird gestartet: " + " ".join(command[1:]), "ok")
        return True, ""

    def write_cfg(self, folder: str) -> tuple[bool, str]:
        try:
            path = write_cfg(folder, self.gsi_uri, self.settings.token)
        except (ValueError, OSError) as error:
            return False, str(error)
        with self.lock:
            self.settings.apply({"cfg_folder": folder.strip()})
            self.log(f"GSI-Datei eingerichtet: {path} (gilt ab dem nächsten Start von CS2)", "ok")
        return True, path

    def set_recording(self, on: bool) -> None:
        with self.lock:
            if on and not self.recorder.on:
                path = self.recorder.start()
                self.log(f"Mitschnitt läuft: {path}", "ok")
            elif not on and self.recorder.on:
                self.recorder.stop()
                self.log(f"Mitschnitt gespeichert ({self.recorder.lines} Zeilen)", "ok")

    # --- for the control page ---

    def state(self) -> dict:
        with self.lock:
            now = self.clock()
            match, settings = self.match, self.settings
            ratings = {r.steamid: r for r in self.director.ratings}
            current = self._current(now)
            teams = []
            for side in ("CT", "T"):
                key = match.team_key(side)
                players = sorted((p for p in match.players.values() if p.team == side), key=lambda p: p.slot)
                teams.append({
                    "side": side, "key": key, "name": match.team_names.get(side) or side,
                    "score": match.scores.get(side, 0), "weight": settings.team_weight(key),
                    "players": [self._player_state(p, ratings.get(p.steamid), form(p, match), current) for p in players],
                })
            upcoming = next((r for r in self.director.ratings if r.steamid != current), None)
            camera = self.camera.status()
            return {
                "version": VERSION,
                "receiving": self.receiving, "posts": self.posts,
                "camera": camera, "camera_name": CAMERA_NAMES.get(camera["mode"], camera["mode"]),
                "camera_problem": self.camera_problem,
                "settings": {k: settings[k] for k in DEFAULTS if k not in ("player_weights", "team_weights", "player_roles")},
                "map": match.map_name, "map_known": self.knowledge.knows(match.map_name), "round": match.round + (1 if match.round_phase in ("live", "freezetime") else 0),
                "phase": match.round_phase, "observed": current,
                "paused": {"on": self.paused, "reason": self.pause_reason,
                           "seconds": max(0, math.ceil(self.paused_until - now)) if self.paused and self.paused_until else None},
                "last": dict(self.last_switch, ago=round(now - self.last_switch["time"], 1)) if self.last_switch else None,
                "next": {"steamid": upcoming.steamid, "name": upcoming.name, "reason": upcoming.reason,
                         "detail": upcoming.detail} if upcoming else None,
                "teams": teams,
                "recording": {"on": self.recorder.on, "path": self.recorder.path, "lines": self.recorder.lines},
                "setup": self._setup_state(),
                "log": list(self.log_lines)[-30:],
            }

    def _setup_state(self) -> dict:
        settings = self.settings
        steam = self.steam_exe()
        command = launcher.launch_command("steam", settings["netcon_port"], settings["launch_extra"])
        return {"cfg_folder": settings["cfg_folder"], "installed": cfg_installed(settings["cfg_folder"], settings.token),
                "cs2_found": bool(cs2_exe(settings["cfg_folder"])), "steam": steam, "steam_auto": not settings["steam_exe"],
                "command": " ".join(command)}

    def _player_state(self, player: Player, rating, player_form: float, current: str) -> dict:
        return {
            "steamid": player.steamid, "name": player.name, "slot": player.slot, "alive": player.alive,
            "health": player.health, "weight": self.settings.player_weight(player.steamid),
            "form": round(player_form, 2), "score": round(rating.score) if rating else 0,
            "reason": rating.reason if rating else "", "detail": rating.detail if rating else "",
            "observed": player.steamid == current, "kills": player.kills, "deaths": player.deaths,
            "role": self.settings.player_role(player.steamid), "role_used": self.director.roles.get(player.steamid, ""),
        }
