"""Player profiles from Leetify (public CS API) as a start value for form and roles before the match has data.

    GET https://api-public.cs-prod.leetify.com/v3/profile?steam64_id=<id>     (header Authorization: Bearer <key>)

The key comes from leetify.com/app/developer and is kept only in the system keyring (service "Auto-Observer") –
never in settings.json, the log or the control page. Profiles are fetched once per player in the background and
cached for a day in the data folder (only the few values used, no key).

What is used (field names as in the API, see github.com/Ativ3k/leetify-api, MIT):
* rating: aim, positioning, utility, clutch, opening, ct_leetify, t_leetify → a form factor relative to the other
  players of the match (z-scores, so the API's scales don't matter)
* stats: t_opening_aggression_success_rate, ct_opening_duel_success_percentage (entry), trade_kill_opportunities_per_round,
  trade_kills_success_percentage (support) → a suggested role per team
"""

import json
import statistics
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://api-public.cs-prod.leetify.com"
KEYRING_SERVICE = "Auto-Observer"
KEYRING_NAME = "leetify-key"
CACHE_SECONDS = 24 * 3600
RATING_FIELDS = ("aim", "positioning", "utility", "clutch", "opening", "ct_leetify", "t_leetify")
STAT_FIELDS = ("t_opening_aggression_success_rate", "ct_opening_duel_success_percentage",
               "trade_kill_opportunities_per_round", "trade_kills_success_percentage")
FORM_WEIGHTS = {"aim": 0.35, "positioning": 0.2, "opening": 0.2, "clutch": 0.1, "leetify": 0.15}


def _number(value) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if value == value else None


def compact(profile: dict) -> dict:
    """The few values used from a profile response."""
    rating = profile.get("rating") if isinstance(profile.get("rating"), dict) else {}
    stats = profile.get("stats") if isinstance(profile.get("stats"), dict) else {}
    result = {"name": str(profile.get("name") or "")[:40]}
    for field in RATING_FIELDS:
        result[field] = _number(rating.get(field))
    for field in STAT_FIELDS:
        result[field] = _number(stats.get(field))
    return result


def load_key() -> str:
    try:
        import keyring
        return keyring.get_password(KEYRING_SERVICE, KEYRING_NAME) or ""
    except Exception:                    # no keyring on this system
        return ""


def store_key(key: str) -> bool:
    """Save the key in the keyring (True) – without a keyring it only lives for this session (False)."""
    try:
        import keyring
        if key:
            keyring.set_password(KEYRING_SERVICE, KEYRING_NAME, key)
        else:
            keyring.delete_password(KEYRING_SERVICE, KEYRING_NAME)
        return True
    except Exception:
        return False


def valid_key(key: str) -> bool:
    return 8 <= len(key) <= 200 and all(ch.isalnum() or ch in "-_." for ch in key)


class LeetifyScout:
    """Fetches and caches Leetify profiles of the players in the match; derives form start values and roles."""

    def __init__(self, data_folder: Path, log, opener=None):
        self.cache_file = data_folder / "leetify-cache.json"
        self._log = log
        self._open = opener or urllib.request.urlopen
        self._lock = threading.Lock()
        self._key = load_key()
        self._key_stored = bool(self._key)
        self._profiles: dict[str, dict] = {}         # steamid → compact profile (+ "time"), {} = no profile
        self._wanted: list[str] = []
        self._running = False
        self.error = ""
        self._load_cache()

    # --- key ---

    @property
    def has_key(self) -> bool:
        return bool(self._key)

    def set_key(self, key: str) -> tuple[bool, str]:
        key = key.strip()
        if key and not valid_key(key):
            return False, "Das sieht nicht wie ein Leetify-Key aus"
        with self._lock:
            self._key = key
            self.error = ""
            if key:
                self._profiles = {s: p for s, p in self._profiles.items() if p}   # retry players without a profile
        stored = store_key(key)
        self._key_stored = stored and bool(key)
        if not key:
            return True, "Leetify-Key entfernt"
        self.request(list(self._wanted))
        return True, "Leetify-Key gespeichert" if stored else "Leetify-Key gilt bis zum Beenden (kein Schlüsselbund)"

    # --- cache ---

    def _load_cache(self) -> None:
        try:
            data = json.loads(self.cache_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return
        now = time.time()
        if isinstance(data, dict):
            for steamid, profile in data.items():
                if isinstance(profile, dict) and now - float(profile.get("time") or 0) < CACHE_SECONDS:
                    self._profiles[str(steamid)] = profile

    def _save_cache(self) -> None:
        with self._lock:
            data = {s: p for s, p in self._profiles.items() if p}
        try:
            self.cache_file.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.cache_file.with_suffix(".tmp")
            temporary.write_text(json.dumps(data), encoding="utf-8")
            temporary.replace(self.cache_file)
        except OSError:
            pass

    # --- fetching ---

    def request(self, steamids: list[str]) -> None:
        """Fetch the profiles of these players (in the background, each once)."""
        with self._lock:
            self._wanted = list(dict.fromkeys(self._wanted + [s for s in steamids if s.isdigit()]))[-40:]
            todo = [s for s in self._wanted if s not in self._profiles]
            if not todo or not self._key or self._running:
                return
            self._running = True
        threading.Thread(target=self._fetch_all, name="leetify", daemon=True).start()

    def _fetch_all(self) -> None:
        try:
            while True:
                with self._lock:
                    todo = [s for s in self._wanted if s not in self._profiles]
                    key = self._key
                if not todo or not key:
                    return
                steamid = todo[0]
                profile = self._fetch(steamid, key)
                if profile is None:
                    return                           # stop on errors (bad key, no connection); error is set
                with self._lock:
                    self._profiles[steamid] = profile
                self._save_cache()
                time.sleep(0.3)                      # gentle on the API
        finally:
            with self._lock:
                self._running = False

    def _fetch(self, steamid: str, key: str) -> dict | None:
        url = f"{API}/v3/profile?" + urllib.parse.urlencode({"steam64_id": steamid})
        request = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}", "_leetify_key": key,
                                                       "Accept": "application/json"})
        try:
            with self._open(request, timeout=10) as answer:
                data = json.loads(answer.read(2 * 1024 * 1024))
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return {}                            # no Leetify profile: remember, don't ask again
            self.error = "Leetify-Key ungültig" if error.code in (401, 403) else f"Leetify antwortet mit Fehler {error.code}"
            self._log(self.error, "warn")
            return None
        except (urllib.error.URLError, OSError, ValueError) as error:
            self.error = f"Leetify nicht erreichbar ({type(error).__name__})"
            self._log(self.error, "warn")
            return None
        if not isinstance(data, dict):
            return {}
        profile = compact(data)
        profile["time"] = time.time()
        return profile

    # --- using the profiles ---

    def profile(self, steamid: str) -> dict:
        with self._lock:
            return dict(self._profiles.get(steamid) or {})

    def form_priors(self, steamids: list[str]) -> dict[str, float]:
        """Start value of the form (0.8 … 1.25) for players with a profile, relative to the others in the match."""
        profiles = {s: self.profile(s) for s in steamids}
        profiles = {s: p for s, p in profiles.items() if p}
        if len(profiles) < 3:
            return {}
        scores: dict[str, float] = {s: 0.0 for s in profiles}
        for field, weight in FORM_WEIGHTS.items():
            values = {}
            for steamid, p in profiles.items():
                if field == "leetify":
                    parts = [v for v in (p.get("ct_leetify"), p.get("t_leetify")) if v is not None]
                    value = sum(parts) / len(parts) if parts else None
                else:
                    value = p.get(field)
                if value is not None:
                    values[steamid] = value
            if len(values) < 3:
                continue
            mean, spread = statistics.mean(values.values()), statistics.pstdev(values.values())
            if spread <= 0:
                continue
            for steamid, value in values.items():
                scores[steamid] += weight * (value - mean) / spread
        return {s: max(0.8, min(1.25, 1 + 0.12 * z)) for s, z in scores.items()}

    def roles(self, teams: dict[str, list[str]]) -> dict[str, str]:
        """Suggested role per player: entry (most opening aggression in his team), support (most trade chances)."""
        result = {}
        for members in teams.values():
            profiles = {s: self.profile(s) for s in members}
            entry = self._top(profiles, lambda p: _sum(p.get("t_opening_aggression_success_rate"),
                                                         p.get("ct_opening_duel_success_percentage")))
            support = self._top(profiles, lambda p: p.get("trade_kill_opportunities_per_round"))
            if entry:
                result[entry] = "entry"
            if support and support != entry:
                result[support] = "support"
        return result

    @staticmethod
    def _top(profiles: dict, value) -> str:
        scored = [(value(p), s) for s, p in profiles.items() if p and value(p) is not None]
        if len(scored) < 3:
            return ""
        return max(scored)[1]

    def state(self, steamids: list[str]) -> dict:
        loaded = sum(1 for s in steamids if self.profile(s))
        with self._lock:
            return {"key": bool(self._key), "stored": self._key_stored, "loaded": loaded, "players": len(steamids),
                    "busy": self._running, "error": self.error}


def _sum(*values) -> float | None:
    numbers = [v for v in values if v is not None]
    return sum(numbers) if numbers else None
