"""Build the Casting-App for the system this script runs on.

    python tools/build.py              everything for this system
    python tools/build.py app          only the app folder (dist/Casting-App) – e.g. to have it signed first
    python tools/build.py package      only the packages (installer, AppImage, dmg) from an existing app folder

Result in dist/:
    Windows  Casting-App-<version>-Setup.exe (installer) and Casting-App-<version>-windows-portable.zip
    Linux    Casting-App-<version>-linux-x86_64.AppImage
    macOS    Casting-App-<version>-mac-<arch>.dmg and .zip (arch = arm64 or x64, the machine's own)

Requirements: pip install -e ".[build]"; Windows additionally NSIS (makensis), Linux downloads appimagetool.

Signing
    Windows: unsigned unless WINDOWS_CERTIFICATE (path to .pfx) and WINDOWS_CERTIFICATE_PASSWORD are set (signtool).
             In CI the app can instead be signed by SignPath (free for open source): "app" → sign the folder →
             "package" → sign the installer; see .github/workflows/build.yml.
    macOS:   ad-hoc signed ("-") so Apple Silicon starts it. Notarization is prepared but off:
             set MAC_NOTARIZE=1, MAC_SIGNING_IDENTITY ("Developer ID Application: …"), APPLE_ID,
             APPLE_APP_PASSWORD and APPLE_TEAM_ID to sign with hardened runtime and notarize.
"""

import os
import platform
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from casting_app.version import APP_NAME, VERSION  # noqa: E402

DIST = ROOT / "dist"
WORK = ROOT / "pyinstaller-work"
ICONS = ROOT / "build"
APPIMAGETOOL_URL = "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage"
BUNDLE_ID = "de.casting-app.desktop"
# Qt parts the app never uses (PyInstaller's hooks would pull them in with Qt WebEngine)
UNUSED_MODULES = ["PySide6.QtQuick", "PySide6.QtQml", "PySide6.QtQuickWidgets", "PySide6.QtPositioning",
                  "PySide6.QtOpenGL", "PySide6.QtWebEngineQuick", "tkinter"]
KEPT_LANGUAGES = ("de", "en")          # translations of Qt and of the web engine that stay in the build


def check_versions() -> None:
    """The version must be the same in casting_app/version.py, pyproject.toml and web/cast-core.js."""
    found = {
        "pyproject.toml": re.search(r'^version = "([^"]+)"', (ROOT / "pyproject.toml").read_text(encoding="utf-8"), re.M),
        "web/cast-core.js": re.search(r'const VERSION = "([^"]+)"', (ROOT / "web" / "cast-core.js").read_text(encoding="utf-8")),
    }
    for file, match in found.items():
        if not match or match.group(1) != VERSION:
            sys.exit(f"✗ {file}: Version passt nicht zu casting_app/version.py ({VERSION})")
    print(f"✓ Version {VERSION} in casting_app/version.py, pyproject.toml und web/cast-core.js")


def run(*command, **options) -> None:
    """Run a command and stop the build if it fails (prints it first, so the CI log shows each step)."""
    print("▶", " ".join(str(part) for part in command), flush=True)
    subprocess.run([str(part) for part in command], check=True, **options)


def windows_version_file() -> Path:
    """Version info shown in Windows (file properties → details)."""
    numbers = ", ".join(VERSION.split(".") + ["0"])
    text = f"""VSVersionInfo(
  ffi=FixedFileInfo(filevers=({numbers}), prodvers=({numbers})),
  kids=[StringFileInfo([StringTable('040704b0', [
    StringStruct('CompanyName', '29_THE_P4TCH3R'), StringStruct('FileDescription', '{APP_NAME}'),
    StringStruct('FileVersion', '{VERSION}'), StringStruct('InternalName', '{APP_NAME}'),
    StringStruct('LegalCopyright', '© 29_THE_P4TCH3R'), StringStruct('OriginalFilename', '{APP_NAME}.exe'),
    StringStruct('ProductName', '{APP_NAME}'), StringStruct('ProductVersion', '{VERSION}')])]),
  VarFileInfo([VarStruct('Translation', [1031, 1200])])]
)"""
    path = WORK / "version-info.txt"
    path.write_text(text, encoding="utf-8")
    return path


def run_pyinstaller() -> Path:
    """Bundle the app as a folder (onedir: starts fast, no unpacking on every start)."""
    separator = os.pathsep
    command = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--windowed", "--name", APP_NAME,
               "--distpath", DIST, "--workpath", WORK, "--specpath", WORK, "--paths", ROOT,
               "--add-data", f"{ROOT / 'web'}{separator}web",
               "--add-data", f"{ROOT / 'casting_app' / 'desktop' / 'scripts'}{separator}casting_app/desktop/scripts",
               "--collect-submodules", "keyring.backends"]
    for module in UNUSED_MODULES:
        command += ["--exclude-module", module]
    if sys.platform == "win32":
        command += ["--icon", ICONS / "icon.ico", "--version-file", windows_version_file()]
    elif sys.platform == "darwin":
        command += ["--icon", ICONS / "icon.png", "--osx-bundle-identifier", BUNDLE_ID]
    run(*command, ROOT / "tools" / "launcher.py")
    app = DIST / (f"{APP_NAME}.app" if sys.platform == "darwin" else APP_NAME)
    remove_unused_translations(app)
    return app


def remove_unused_translations(app: Path) -> None:
    """Keep only German and English translations of Qt and Qt WebEngine (saves about 50 MB)."""
    removed = 0
    for folder in [p for p in app.rglob("*") if p.is_dir() and p.name in ("translations", "qtwebengine_locales")]:
        for file in folder.iterdir():
            language = file.stem.split("_")[-1] if file.suffix == ".qm" else file.stem.split("-")[0]
            if file.is_file() and language not in KEPT_LANGUAGES:
                removed += file.stat().st_size
                file.unlink()
    print(f"✓ {removed / 1048576:.0f} MB ungenutzte Übersetzungen entfernt")


# --- Windows ---

def sign_windows(file: Path) -> None:
    """Sign an .exe with signtool – only when a certificate is configured (see module docstring)."""
    certificate = os.environ.get("WINDOWS_CERTIFICATE")
    if certificate:
        run("signtool", "sign", "/f", certificate, "/p", os.environ.get("WINDOWS_CERTIFICATE_PASSWORD", ""),
            "/fd", "SHA256", "/tr", "http://timestamp.digicert.com", "/td", "SHA256", "/d", APP_NAME, file)


def package_windows(app_folder: Path) -> None:
    """Portable zip and NSIS installer (tools/installer.nsi) from the app folder; both signed if possible."""
    sign_windows(app_folder / f"{APP_NAME}.exe")
    portable = DIST / f"{APP_NAME}-{VERSION}-windows-portable"
    shutil.make_archive(str(portable), "zip", app_folder.parent, app_folder.name)
    makensis = shutil.which("makensis") or r"C:\Program Files (x86)\NSIS\makensis.exe"
    run(makensis, f"/DVERSION={VERSION}", f"/DAPP_FOLDER={app_folder}", f"/DOUTPUT={DIST / f'{APP_NAME}-{VERSION}-Setup.exe'}",
        f"/DICON={ICONS / 'icon.ico'}", ROOT / "tools" / "installer.nsi")
    sign_windows(DIST / f"{APP_NAME}-{VERSION}-Setup.exe")


# --- Linux ---

def package_linux(app_folder: Path) -> None:
    """AppImage: the PyInstaller folder plus start script, desktop entry and icon."""
    app_dir = WORK / "Casting-App.AppDir"
    shutil.rmtree(app_dir, ignore_errors=True)
    shutil.copytree(app_folder, app_dir / "usr" / "lib" / "casting-app")
    (app_dir / "AppRun").write_text('#!/bin/sh\nexec "$(dirname "$(readlink -f "$0")")/usr/lib/casting-app/Casting-App" "$@"\n')
    (app_dir / "AppRun").chmod(0o755)
    (app_dir / "casting-app.desktop").write_text(
        "[Desktop Entry]\nType=Application\nName=Casting-App\nComment=Steuerung und Overlays für CS2-Casts in OBS\n"
        "Exec=Casting-App\nIcon=casting-app\nCategories=AudioVideo;\nTerminal=false\n")
    shutil.copy(ICONS / "icon.png", app_dir / "casting-app.png")
    tool = WORK / "appimagetool"
    if not tool.exists():
        urllib.request.urlretrieve(APPIMAGETOOL_URL, tool)
        tool.chmod(0o755)
    target = DIST / f"{APP_NAME}-{VERSION}-linux-x86_64.AppImage"
    run(tool, app_dir, target, env={**os.environ, "ARCH": "x86_64", "APPIMAGE_EXTRACT_AND_RUN": "1"})


# --- macOS ---

def package_mac(app_bundle: Path) -> None:
    """Sign the .app (ad-hoc or Developer ID), pack it as zip and dmg, notarize when MAC_NOTARIZE=1."""
    architecture = "arm64" if platform.machine() == "arm64" else "x64"
    if os.environ.get("MAC_NOTARIZE") == "1":
        identity = os.environ["MAC_SIGNING_IDENTITY"]
        run("codesign", "--force", "--deep", "--options", "runtime", "--timestamp",
            "--entitlements", ICONS / "entitlements.mac.plist", "--sign", identity, app_bundle)
    else:
        run("codesign", "--force", "--deep", "--sign", "-", app_bundle)       # ad-hoc: starts on Apple Silicon
    run("codesign", "--verify", "--deep", "--strict", app_bundle)
    base = DIST / f"{APP_NAME}-{VERSION}-mac-{architecture}"
    run("ditto", "-c", "-k", "--keepParent", app_bundle, f"{base}.zip")
    run("hdiutil", "create", "-volname", APP_NAME, "-srcfolder", app_bundle, "-ov", "-format", "UDZO", f"{base}.dmg")
    if os.environ.get("MAC_NOTARIZE") == "1":
        run("xcrun", "notarytool", "submit", f"{base}.dmg", "--apple-id", os.environ["APPLE_ID"],
            "--password", os.environ["APPLE_APP_PASSWORD"], "--team-id", os.environ["APPLE_TEAM_ID"], "--wait")
        run("xcrun", "stapler", "staple", f"{base}.dmg")


def main() -> None:
    """Run the requested stage: all (default), app or package."""
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")    # Windows consoles default to cp1252
    stage = sys.argv[1] if len(sys.argv) > 1 else "all"
    if stage not in ("all", "app", "package"):
        sys.exit("Aufruf: python tools/build.py [app|package]")
    check_versions()
    WORK.mkdir(exist_ok=True)
    if stage in ("all", "app"):
        shutil.rmtree(DIST, ignore_errors=True)
        app = run_pyinstaller()
        if stage == "app":
            return print(f"✓ {app.relative_to(ROOT)}")
    else:
        app = DIST / (f"{APP_NAME}.app" if sys.platform == "darwin" else APP_NAME)
        if not app.exists():
            sys.exit(f"✗ {app.relative_to(ROOT)} fehlt – zuerst „python tools/build.py app“")
        for old in DIST.glob(f"{APP_NAME}-*"):         # packages of an earlier run
            old.unlink()
    if sys.platform == "win32":
        package_windows(app)
    elif sys.platform == "darwin":
        package_mac(app)
    else:
        package_linux(app)
    for file in sorted(DIST.iterdir()):
        if file.is_file():
            print(f"✓ dist/{file.name} ({file.stat().st_size / 1048576:.1f} MB)")


if __name__ == "__main__":
    main()
