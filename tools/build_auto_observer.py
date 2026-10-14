"""Build the Auto-Observer test app (auto_observer/) into a single file, without anything of the casting app.

    python tools/build_auto_observer.py           →  dist/Auto-Observer.exe (small: observer, recording, packing)
    python tools/build_auto_observer.py --demos   →  dist/Auto-Observer-Demos.exe (also turns demos into raw data)

Needs the packages of `requirements/auto-observer.txt` (`pip install --require-hashes -r requirements/auto-observer.txt`):
PyInstaller and, for the demo export, demoparser2 with pandas/polars/pyarrow – that makes the demo version large
(~175 MB); the small one leaves them out. The CI builds both Windows files in .github/workflows/auto-observer.yml
(artifacts "Auto-Observer-windows" and "Auto-Observer-Demos-windows").
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "pyinstaller-work" / "auto-observer"
DIST = ROOT / "dist"
LAUNCHER = 'from auto_observer.__main__ import main\n\nraise SystemExit(main())\n'
DEMO_MODULES = ("demoparser2", "pandas", "pyarrow", "polars", "numpy", "zstandard", "tkinter")


def main(argv: list[str] | None = None) -> int:
    demos = "--demos" in (sys.argv[1:] if argv is None else argv)
    name = "Auto-Observer-Demos" if demos else "Auto-Observer"
    work = BUILD / name
    work.mkdir(parents=True, exist_ok=True)
    launcher = work / f"{name}.py"
    launcher.write_text(LAUNCHER, encoding="utf-8")
    separator = ";" if sys.platform == "win32" else ":"
    command = [
        sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onefile", "--console",
        "--name", name, "--distpath", str(DIST), "--workpath", str(work / "work"), "--specpath", str(work),
        "--paths", str(ROOT),
        "--add-data", f"{ROOT / 'auto_observer' / 'web'}{separator}auto_observer/web",
        "--hidden-import", "keyring",
        # nothing of the casting app
        "--exclude-module", "casting_app", "--exclude-module", "PySide6",
    ]
    if demos:
        # demoparser2 imports its table libraries from compiled code – PyInstaller can't see that by itself
        command += ["--collect-all", "demoparser2", "--hidden-import", "pandas", "--hidden-import", "pyarrow",
                    "--hidden-import", "polars", "--hidden-import", "zstandard"]
    else:
        for module in DEMO_MODULES:                          # the small version: no demo reader
            command += ["--exclude-module", module]
    command.append(str(launcher))
    map_data = ROOT / "auto_observer" / "map_data"
    if map_data.is_dir():                                    # learned map knowledge (map_knowledge.py)
        command[-1:-1] = ["--add-data", f"{map_data}{separator}auto_observer/map_data"]
    result = subprocess.run(command, cwd=ROOT)
    if result.returncode:
        return result.returncode
    built = DIST / (f"{name}.exe" if sys.platform == "win32" else name)
    if not built.is_file():
        print(f"nicht gebaut: {built}")
        return 1
    print(f"fertig: {built} ({built.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
