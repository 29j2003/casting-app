"""Build the Auto-Observer test app (auto_observer/) into a single file, without anything of the casting app.

    python tools/build_auto_observer.py      →  dist/Auto-Observer.exe (Windows) or dist/Auto-Observer

Needs the packages of `requirements/auto-observer.txt` (`pip install --require-hashes -r requirements/auto-observer.txt`):
PyInstaller and, for the demo export, demoparser2 with pandas/polars/pyarrow – that makes the file large. The CI builds the Windows file in
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
        # demoparser2 imports its table libraries from compiled code – PyInstaller can't see that by itself
        "--collect-all", "demoparser2", "--hidden-import", "pandas", "--hidden-import", "pyarrow",
        "--hidden-import", "polars", "--hidden-import", "zstandard", "--hidden-import", "keyring",
        # nothing of the casting app
        "--exclude-module", "casting_app", "--exclude-module", "PySide6",
        str(launcher),
    ]
    map_data = ROOT / "auto_observer" / "map_data"
    if map_data.is_dir():                                    # learned map knowledge (map_knowledge.py)
        command[-1:-1] = ["--add-data", f"{map_data}{separator}auto_observer/map_data"]
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
