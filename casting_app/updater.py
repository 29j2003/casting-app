"""Update the app from inside the app (Setup → ⚙ App-Einstellungen → Update).

How it works:
  1. check()    – asks GitHub Releases for the latest version (only the version list is fetched, nothing is sent).
  2. install()  – downloads the file that fits this system, checks its SHA-256 against GitHub's checksum,
                  then starts a small helper that waits until this app has quit, puts the new version in place
                  and starts it again. The app quits right after (the caller passes `quit_app`).

What fits which system (install_kind()):
  windows-installer  installed with Casting-App-<v>-Setup.exe → the new Setup runs silently (/S)
  appimage           Linux AppImage                          → the AppImage file is replaced
  mac                macOS .app                              → the .app is replaced by the one from the zip
  manual             portable zip, source checkout, other    → the release page is opened instead

Network problems or a private repository simply mean "no update found". The status is a plain dict the
control page shows (GET /api/update): state, version, progress, error, kind.
"""

import hashlib
import json
import os
import platform
import shlex
import subprocess
import sys
import tempfile
import threading
import urllib.request
from pathlib import Path
from typing import Callable

from .paths import IS_MAC, IS_WINDOWS
from .version import APP_NAME, VERSION, compare_versions

RELEASES_URL = "https://api.github.com/repos/29j2003/casting-app/releases/latest"
DOWNLOAD_PREFIX = "https://github.com/29j2003/casting-app/releases/download/"
TIMEOUT_SECONDS = 10
CHUNK = 1 << 20


def install_kind() -> str:
    """How this copy of the app can be updated (see module docstring)."""
    if not getattr(sys, "frozen", False):
        return "manual"
    executable = Path(sys.executable).resolve()
    if IS_WINDOWS:
        return "windows-installer" if (executable.parent / "Deinstallieren.exe").exists() else "manual"
    if IS_MAC:
        return "mac" if app_bundle(executable) else "manual"
    return "appimage" if os.environ.get("APPIMAGE") else "manual"


def app_bundle(executable: Path) -> Path | None:
    """The Casting-App.app folder this executable runs from (macOS), or None."""
    for parent in executable.parents:
        if parent.suffix == ".app":
            return parent
    return None


def asset_suffix(kind: str) -> str | None:
    """End of the release file name that fits this system."""
    if kind == "windows-installer":
        return "-Setup.exe"
    if kind == "appimage":
        return "-linux-x86_64.AppImage"
    if kind == "mac":
        return "-mac-arm64.zip" if platform.machine() == "arm64" else "-mac-x64.zip"
    return None


def _get_json(url: str):
    request = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": APP_NAME})
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as answer:
        return json.loads(answer.read(2_000_000))


def newer_release(fetch: Callable[[str], dict] = _get_json) -> dict | None:
    """{"version", "url", "asset": {"name", "url", "size", "sha256"} | None} if GitHub has a newer version."""
    try:
        release = fetch(RELEASES_URL)
    except (OSError, ValueError):
        return None
    if not isinstance(release, dict):
        return None
    version = str(release.get("tag_name") or "").lstrip("v")
    if not version or release.get("draft") or release.get("prerelease") or compare_versions(version, VERSION) <= 0:
        return None
    page = str(release.get("html_url") or "")
    suffix = asset_suffix(install_kind())
    asset = None
    for item in release.get("assets") or []:
        name, url, digest = str(item.get("name") or ""), str(item.get("browser_download_url") or ""), str(item.get("digest") or "")
        if suffix and name.endswith(suffix) and url.startswith(DOWNLOAD_PREFIX) and digest.startswith("sha256:"):
            asset = {"name": name, "url": url, "size": int(item.get("size") or 0), "sha256": digest[7:].lower()}
    return {"version": version, "url": page if page.startswith("https://github.com/") else "", "asset": asset}


class Updater:
    """Check for and install updates; every step runs in a background thread, `status` tells the page."""

    def __init__(self, data_dir: Path, log: Callable[[str, str], None], quit_app: Callable[[], None] | None = None):
        """quit_app: ends the app (desktop: like "Ganz beenden"); None = installing is not offered.
        on_found (attribute): called from the check thread with the release when a newer version exists (tray)."""
        self.on_found: Callable[[dict], None] | None = None
        self._folder = data_dir / "update"
        self._log = log
        self._quit_app = quit_app
        self._lock = threading.Lock()
        self.release: dict | None = None
        self.status = {"state": "idle", "current": VERSION, "kind": install_kind(), "version": "", "progress": 0, "error": "",
                       "updatedFrom": self._note_installed_version()}

    def _note_installed_version(self) -> str:
        """First start after an update: the version before it ("" otherwise); downloads of earlier updates are removed."""
        marker = self._folder / "installed-version.txt"
        try:
            previous = marker.read_text(encoding="utf-8").strip()
        except OSError:
            previous = ""
        if previous == VERSION:
            return ""
        try:
            self._folder.mkdir(parents=True, exist_ok=True)
            for old in self._folder.iterdir():
                if old.is_file() and old != marker:
                    old.unlink(missing_ok=True)
            marker.write_text(VERSION, encoding="utf-8")
        except OSError:
            pass
        if previous:
            self._log(f"Aktualisiert: {previous} → {VERSION}", "info")
        return previous

    def _set(self, **changes) -> None:
        with self._lock:
            self.status.update(changes)

    def snapshot(self) -> dict:
        """Copy of the status for the control page (plus the release page and whether one click installs it)."""
        with self._lock:
            status = dict(self.status)
        release = self.release or {}
        status["url"] = release.get("url", "")
        status["canInstall"] = bool(release.get("asset")) and self._quit_app is not None
        return status

    # --- check ---

    def check_in_background(self) -> None:
        """Ask GitHub (in a thread); the result ends up in `status`."""
        if self.status["state"] in ("checking", "downloading", "installing"):
            return
        self._set(state="checking", error="")
        threading.Thread(target=self._check, name="update-check", daemon=True).start()

    def _check(self) -> None:
        release = newer_release()
        self.release = release
        if release:
            self._set(state="available", version=release["version"])
            self._log(f"Neue Version {release['version']} verfügbar", "info")
            if self.on_found:
                self.on_found(release)
        else:
            self._set(state="current", version="")

    # --- install ---

    def install_in_background(self) -> bool:
        """Download, verify and install the found release; False if there is nothing to install."""
        release = self.release or {}
        if not release.get("asset") or self._quit_app is None or self.status["state"] in ("downloading", "installing"):
            return False
        self._set(state="downloading", progress=0, error="")
        threading.Thread(target=self._install, args=(release,), name="update-install", daemon=True).start()
        return True

    def _install(self, release: dict) -> None:
        asset = release["asset"]
        try:
            file = self._download(asset)
            self._set(state="installing", progress=100)
            self._log(f"Update auf {release['version']} wird installiert – die App startet gleich neu", "info")
            start_replacement(install_kind(), file)
        except (OSError, ValueError) as error:
            self._set(state="error", error=str(error)[:200])
            self._log(f"Update fehlgeschlagen: {error}", "error")
            return
        self._quit_app()

    def _download(self, asset: dict) -> Path:
        """Download into the data folder and check the SHA-256; raises ValueError if it does not match."""
        self._folder.mkdir(parents=True, exist_ok=True)
        target = self._folder / Path(asset["name"]).name
        partial = target.with_name(target.name + ".part")
        digest = hashlib.sha256()
        request = urllib.request.Request(asset["url"], headers={"User-Agent": APP_NAME})
        with urllib.request.urlopen(request, timeout=60) as answer, open(partial, "wb") as out:
            total = asset.get("size") or int(answer.headers.get("Content-Length") or 0)
            done = 0
            while chunk := answer.read(CHUNK):
                out.write(chunk)
                digest.update(chunk)
                done += len(chunk)
                if total:
                    self._set(progress=min(99, int(done * 100 / total)))
        if digest.hexdigest() != asset["sha256"]:
            partial.unlink(missing_ok=True)
            raise ValueError("Prüfsumme stimmt nicht – Datei verworfen")
        os.replace(partial, target)
        return target


def start_replacement(kind: str, file: Path, pid: int | None = None) -> None:
    """Start the helper that waits for this app (or process `pid`) to quit, puts `file` in place and starts the new version."""
    pid = pid or os.getpid()
    if kind == "windows-installer":
        executable = Path(sys.executable).resolve()
        script = Path(tempfile.gettempdir()) / "casting-app-update.cmd"
        script.write_text(
            "@echo off\r\n"
            f":wait\r\ntasklist /FI \"PID eq {pid}\" | find \"{pid}\" >nul && (timeout /t 1 >nul & goto wait)\r\n"
            f"\"{file}\" /S\r\n"
            f"start \"\" \"{executable}\"\r\n"
            "del \"%~f0\"\r\n", encoding="utf-8")
        flags = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        subprocess.Popen(["cmd", "/c", str(script)], creationflags=flags, close_fds=True)
        return
    if kind == "appimage":
        current = Path(os.environ["APPIMAGE"])
        fresh = current.with_name(current.name + ".new")
        fresh.write_bytes(file.read_bytes())
        fresh.chmod(0o755)
        file.unlink(missing_ok=True)
        command = (f"while kill -0 {pid} 2>/dev/null; do sleep 0.5; done; "
                   f"mv -f {shlex.quote(str(fresh))} {shlex.quote(str(current))} && exec {shlex.quote(str(current))}")
    elif kind == "mac":
        bundle = app_bundle(Path(sys.executable).resolve())
        if bundle is None:
            raise ValueError("App-Ordner nicht gefunden")
        staging = Path(tempfile.mkdtemp(prefix="casting-app-update-"))
        subprocess.run(["ditto", "-x", "-k", str(file), str(staging)], check=True)
        fresh = next(staging.glob("*.app"), None)
        if fresh is None:
            raise ValueError("Im Update ist keine App")
        command = (f"while kill -0 {pid} 2>/dev/null; do sleep 0.5; done; "
                   f"rm -rf {shlex.quote(str(bundle))} && ditto {shlex.quote(str(fresh))} {shlex.quote(str(bundle))} && "
                   f"rm -rf {shlex.quote(str(staging))} {shlex.quote(str(file))}; open {shlex.quote(str(bundle))}")
    else:
        raise ValueError("Für diese Installation gibt es kein automatisches Update")
    subprocess.Popen(["/bin/sh", "-c", command], start_new_session=True, close_fds=True,
                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
