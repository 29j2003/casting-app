"""Starting CS2 from the app with the right launch options (like HLAE's "Launch CS2").

CS2 is started through Steam (`steam -applaunch 730 <options>`), so Steam's own launch options still apply
and a running Steam simply takes the request. The options always contain `-netconport <port> -insecure`
(console port for the camera); the user can add more (e.g. `-novid -console`).
"""

import shlex
import subprocess
import sys

CS2_APP_ID = "730"
MAX_EXTRA = 300


def clean_extra(text: str) -> str:
    """Extra launch options as one printable line (no line breaks, limited length)."""
    words = ("".join(ch for ch in word if ch.isprintable()) for word in str(text).split())
    return " ".join(word for word in words if word)[:MAX_EXTRA]


def launch_options(port: int, extra: str) -> list[str]:
    """All launch options: console port first, then the user's extras."""
    options = ["-netconport", str(port), "-insecure"]
    extra = clean_extra(extra)
    if extra:
        try:
            parts = shlex.split(extra, posix=sys.platform != "win32")
        except ValueError:
            parts = extra.split()
        skip_next = False
        for part in parts:                   # the console port and -insecure are set above
            if skip_next:
                skip_next = False
            elif part == "-netconport":
                skip_next = True
            elif part != "-insecure":
                options.append(part)
    return options


def launch_command(steam_exe: str, port: int, extra: str) -> list[str]:
    return [steam_exe, "-applaunch", CS2_APP_ID, *launch_options(port, extra)]


def cs2_running() -> bool | None:
    """True/False if CS2's process runs; None if this can't be checked here."""
    try:
        if sys.platform == "win32":
            result = subprocess.run(["tasklist", "/FI", "IMAGENAME eq cs2.exe", "/NH"], capture_output=True, text=True,
                                    timeout=5, creationflags=subprocess.CREATE_NO_WINDOW)
            return "cs2.exe" in result.stdout.lower()
        result = subprocess.run(["pgrep", "-x", "cs2"], capture_output=True, timeout=5)
        return result.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return None


def start(command: list[str]) -> None:
    """Start the command detached from this app (closing the app does not close CS2). Raises OSError."""
    if sys.platform == "win32":
        flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
        subprocess.Popen(command, creationflags=flags, close_fds=True,
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        subprocess.Popen(command, start_new_session=True, close_fds=True,
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
