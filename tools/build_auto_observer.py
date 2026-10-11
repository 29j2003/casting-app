"""Build the Auto-Observer test app (auto_observer/) into a single file, without anything of the casting app.

    python tools/build_auto_observer.py      →  dist/Auto-Observer.exe (Windows) or dist/Auto-Observer

Needs PyInstaller (`pip install --require-hashes -r requirements/build.txt`). The CI builds the Windows file in
.github/workflows/auto-observer.yml and offers it as the artifact "Auto-Observer-windows".
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "pyinstaller-work" / "auto-observer"
DIST = ROOT / "dist"
LAUNCHER = 'from auto_observer.__main__ import main\n\nraise SystemExit(main())\n'


def main() -> int:
    BUILD.mkdir(parents=True, exist_ok=True)
    launcher = BUILD / "Auto-Observer.py"
    launcher.write_text(LAUNCHER, encoding="utf-8")
    separator = ";" if sys.platform == "win32" else ":"
    command = [
        sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onefile", "--console",
        "--name", "Auto-Observer", "--distpath", str(DIST), "--workpath", str(BUILD / "work"), "--specpath", str(BUILD),
        "--paths", str(ROOT),
        "--add-data", f"{ROOT / 'auto_observer' / 'web'}{separator}auto_observer/web",
        # the test app uses the standard library only – keep everything else out
        "--exclude-module", "casting_app", "--exclude-module", "PySide6", "--exclude-module", "tkinter",
        "--exclude-module", "keyring", "--exclude-module", "cryptography",
        str(launcher),
    ]
    result = subprocess.run(command, cwd=ROOT)
    if result.returncode:
        return result.returncode
    name = "Auto-Observer.exe" if sys.platform == "win32" else "Auto-Observer"
    built = DIST / name
    if not built.is_file():
        print(f"nicht gebaut: {built}")
        return 1
    print(f"fertig: {built} ({built.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
