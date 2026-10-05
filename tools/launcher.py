"""Entry point for the packaged app (PyInstaller needs a plain script, not a package module)."""

import sys

from casting_app.__main__ import main

if __name__ == "__main__":
    sys.exit(main())
