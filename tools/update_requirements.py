"""Pin the build's Python packages: writes requirements/build.txt (exact versions plus SHA-256 of every file).

    pip install uv
    python tools/update_requirements.py

The CI builds the release with `pip install --require-hashes -r requirements/build.txt` – a new (possibly
poisoned) version of a package on PyPI never ends up in the app by itself; only a deliberate run of this script
moves to newer versions. Run it before each release (newest fixes), then let the CI test the result.
The list covers Windows, Linux and macOS and Python 3.11+ at once (uv --universal); the app's own dependencies
come from pyproject.toml, build-only tools from requirements/build.in.
"""

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    uv = shutil.which("uv")
    if not uv:
        sys.exit("uv fehlt – erst: pip install uv")
    subprocess.run([uv, "pip", "compile", "pyproject.toml", "requirements/build.in", "--extra", "build", "--universal",
                    "--python-version", "3.11", "--generate-hashes", "--no-header", "--upgrade",
                    "-o", "requirements/build.txt"], cwd=ROOT, check=True)
    print("✓ requirements/build.txt neu geschrieben – Unterschiede mit git diff prüfen, dann über die CI testen")


if __name__ == "__main__":
    main()
