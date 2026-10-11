"""Moving the spectator camera in CS2.

Two ways, chosen by the setting "camera_mode" ("auto", "netcon", "keys"):

* Console port (preferred): CS2 started with `-netconport <port>` (and `-insecure`, CS2 refuses console
  commands on this port under VAC) accepts console commands over TCP. The camera switches with
  `spec_player "<name>"` or `spec_player_by_accountid <id>`; X-ray with `spec_show_xray`.
* Spectator keys (fallback, Windows only): presses 1–9/0 for the player's observer slot with SendInput.
  Only works while CS2 is the foreground window – the control page shows a warning band in this mode.
"""

import socket
import sys
import threading
import time

STEAMID64_BASE = 76561197960265728
RECONNECT_SECONDS = 2.0
CS2_WINDOW_TITLE = "Counter-Strike 2"


def account_id(steamid: str) -> int | None:
    """SteamID64 → account id (what spec_player_by_accountid expects)."""
    try:
        value = int(steamid) - STEAMID64_BASE
    except ValueError:
        return None
    return value if value > 0 else None


def spectate_command(name: str, steamid: str, method: str) -> str | None:
    """Console command that puts the camera on a player. Names with quotes or ';' would break the
    command (or chain another one), so those players are addressed by account id."""
    safe_name = "".join(ch for ch in name if ch.isprintable())
    if method == "name" and safe_name and not any(ch in safe_name for ch in '";'):
        return f'spec_player "{safe_name}"'
    account = account_id(steamid)
    return f"spec_player_by_accountid {account}" if account else None


class NetconClient:
    """Connection to CS2's console port; reconnects on its own while running."""

    def __init__(self, log):
        self._log = log
        self._lock = threading.Lock()
        self._socket: socket.socket | None = None
        self._address = ("127.0.0.1", 54545)
        self._running = False
        self._wake = threading.Event()

    @property
    def connected(self) -> bool:
        return self._socket is not None

    def configure(self, host: str, port: int) -> None:
        if (host, port) != self._address:
            self._address = (host, port)
            self._close()
            self._wake.set()

    def start(self) -> None:
        if not self._running:
            self._running = True
            threading.Thread(target=self._run, name="netcon", daemon=True).start()

    def stop(self) -> None:
        self._running = False
        self._close()
        self._wake.set()

    def send(self, command: str) -> bool:
        """Send one console command; False if not connected."""
        with self._lock:
            sock = self._socket
            if sock is None:
                return False
            try:
                sock.sendall(command.encode("utf-8") + b"\n")
                return True
            except OSError:
                pass
        self._close()
        return False

    def _close(self) -> None:
        with self._lock:
            sock, self._socket = self._socket, None
        if sock is not None:
            try:
                sock.close()
            except OSError:
                pass

    def _run(self) -> None:
        was_connected = False
        while self._running:
            address = self._address
            try:
                sock = socket.create_connection(address, timeout=2)
            except OSError:
                if was_connected:
                    self._log("Fernkonsole getrennt", "warn")
                    was_connected = False
                self._wake.wait(RECONNECT_SECONDS)
                self._wake.clear()
                continue
            sock.settimeout(1.0)
            with self._lock:
                self._socket = sock
            was_connected = True
            self._log(f"Fernkonsole verbunden ({address[0]}:{address[1]})", "ok")
            # CS2 sends its console output here; read it so the buffer never fills up
            while self._running and self._socket is sock:
                try:
                    if not sock.recv(65536):
                        break
                except socket.timeout:
                    continue
                except OSError:
                    break
            if self._socket is sock:
                self._close()
            if self._running:
                self._log("Fernkonsole getrennt", "warn")
                was_connected = False
                self._wake.wait(RECONNECT_SECONDS)
                self._wake.clear()


class KeyPresser:
    """Presses the spectator keys 1–9/0 in CS2 (Windows only, CS2 must be in the foreground)."""

    available = sys.platform == "win32"

    def __init__(self):
        self._user32 = None
        if self.available:
            import ctypes
            from ctypes import wintypes
            self._ctypes, self._wintypes = ctypes, wintypes
            self._user32 = ctypes.WinDLL("user32", use_last_error=True)
            self._input_type = self._make_input_type()

    def _make_input_type(self):
        ctypes, wintypes = self._ctypes, self._wintypes

        class KEYBDINPUT(ctypes.Structure):
            _fields_ = [("wVk", wintypes.WORD), ("wScan", wintypes.WORD), ("dwFlags", wintypes.DWORD),
                        ("time", wintypes.DWORD), ("dwExtraInfo", ctypes.c_size_t)]

        class MOUSEINPUT(ctypes.Structure):            # only here so the union has the right size
            _fields_ = [("dx", wintypes.LONG), ("dy", wintypes.LONG), ("mouseData", wintypes.DWORD),
                        ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD), ("dwExtraInfo", ctypes.c_size_t)]

        class INPUTUNION(ctypes.Union):
            _fields_ = [("ki", KEYBDINPUT), ("mi", MOUSEINPUT)]

        class INPUT(ctypes.Structure):
            _fields_ = [("type", wintypes.DWORD), ("u", INPUTUNION)]

        return INPUT

    def cs2_in_foreground(self) -> bool:
        if not self._user32:
            return False
        window = self._user32.GetForegroundWindow()
        if not window:
            return False
        buffer = self._ctypes.create_unicode_buffer(256)
        self._user32.GetWindowTextW(window, buffer, 256)
        return CS2_WINDOW_TITLE in buffer.value

    def press_slot(self, slot: int) -> bool:
        """Press the key for GSI observer_slot `slot` (0..9 → keys 1..9, 0)."""
        if not self._user32 or not 0 <= slot <= 9 or not self.cs2_in_foreground():
            return False
        digit = (slot + 1) % 10
        scan_code = 0x0B if digit == 0 else 0x01 + digit          # scan codes of the number row
        ok = self._send(scan_code, key_up=False)
        time.sleep(0.03)
        return self._send(scan_code, key_up=True) and ok

    def _send(self, scan_code: int, key_up: bool) -> bool:
        INPUT = self._input_type
        event = INPUT(type=1)                                      # INPUT_KEYBOARD
        event.u.ki.wScan = scan_code
        event.u.ki.dwFlags = 0x0008 | (0x0002 if key_up else 0)    # KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP
        return self._user32.SendInput(1, self._ctypes.byref(event), self._ctypes.sizeof(INPUT)) == 1


class Camera:
    """Chooses the way to CS2 (console port or keys) and sends camera commands."""

    def __init__(self, settings, log):
        self._settings = settings
        self._log = log
        self.netcon = NetconClient(log)
        self.keys = KeyPresser()

    def start(self) -> None:
        self.apply_settings()
        self.netcon.start()

    def stop(self) -> None:
        self.netcon.stop()

    def apply_settings(self) -> None:
        self.netcon.configure(self._settings["netcon_host"], self._settings["netcon_port"])

    def mode(self) -> str:
        """"netcon", "keys" or "none" – the way commands go right now."""
        wanted = self._settings["camera_mode"]
        if wanted in ("auto", "netcon") and self.netcon.connected:
            return "netcon"
        if wanted in ("auto", "keys") and self.keys.available:
            return "keys"
        return "none"

    def status(self) -> dict:
        mode = self.mode()
        return {"mode": mode, "netcon": self.netcon.connected, "keys_available": self.keys.available,
                "foreground": self.keys.cs2_in_foreground() if mode == "keys" else None}

    def spectate(self, name: str, steamid: str, slot: int) -> bool:
        mode = self.mode()
        if mode == "netcon":
            command = spectate_command(name, steamid, self._settings["spec_command"])
            return bool(command) and self.netcon.send(command)
        if mode == "keys":
            return self.keys.press_slot(slot)
        return False

    def set_xray(self, on: bool) -> bool:
        """X-ray only works over the console port."""
        return self.mode() == "netcon" and self.netcon.send(f"spec_show_xray {1 if on else 0}")
