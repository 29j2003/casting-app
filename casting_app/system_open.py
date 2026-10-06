"""Open folders and web links with the system's own programs (file manager, browser).

Why: the built Linux app (PyInstaller, also inside the AppImage) points LD_LIBRARY_PATH at its own bundled
libraries (Qt, GLib …). Every program it starts inherits that. On KDE, xdg-open hands a folder to kde-open,
which then loads the app's Qt instead of the system's and fails without a word (issue #13); browsers and
other file managers can break the same way. So programs of the system are started with the environment
the app itself was started with: LD_LIBRARY_PATH as before (PyInstaller keeps it in LD_LIBRARY_PATH_ORIG)
and no variable that points into the app's own folder.

Windows, macOS and running from source are not affected; there the usual ways are used (Qt or os.startfile).
"""

import os
import subprocess
import sys

IS_FROZEN_LINUX = sys.platform.startswith("linux") and bool(getattr(sys, "frozen", False))


def system_environment(environment: dict[str, str] | None = None, bundle: str | None = None) -> dict[str, str]:
    """The environment for programs of the system: without the app's library paths (see module docstring).

    environment: defaults to os.environ; bundle: the app's own folder (defaults to sys._MEIPASS).
    """
    env = dict(os.environ if environment is None else environment)
    bundle = bundle if bundle is not None else getattr(sys, "_MEIPASS", "")
    original = env.pop("LD_LIBRARY_PATH_ORIG", None)
    if original is not None:
        env["LD_LIBRARY_PATH"] = original
    else:
        env.pop("LD_LIBRARY_PATH", None)
    if bundle:
        for name, value in list(env.items()):
            if bundle in value:
                parts = [p for p in value.split(":") if bundle not in p]     # Linux path lists (":")
                if parts and ":" in value:
                    env[name] = ":".join(parts)
                else:
                    del env[name]
    return env


def open_with_system(target: str) -> bool:
    """Built Linux app: open a folder path or http(s) link with xdg-open in the system's environment.

    Returns False when this does not apply (other systems, from source) or xdg-open is missing –
    then the caller uses its usual way (Qt's QDesktopServices).
    """
    if not IS_FROZEN_LINUX:
        return False
    try:
        subprocess.Popen(["xdg-open", target], env=system_environment(), start_new_session=True, close_fds=True,
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except OSError:
        return False
