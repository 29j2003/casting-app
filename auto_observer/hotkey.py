"""A global key for the caster ("bad cut"), also while CS2 has the focus (Windows: RegisterHotKey).

The key goes to this app only while it is registered – CS2 does not see it then. Other systems have no global
key here; the button on the control page does the same.
"""

import sys
import threading

KEYS = {**{f"F{n}": 0x6F + n for n in range(1, 25)},           # F1 = 0x70 … F24 = 0x87
        **{f"Num{n}": 0x60 + n for n in range(10)},
        "Pause": 0x13, "ScrollLock": 0x91, "Insert": 0x2D, "Home": 0x24, "End": 0x23,
        "PageUp": 0x21, "PageDown": 0x22}
MOD_NOREPEAT = 0x4000
WM_HOTKEY, WM_QUIT = 0x0312, 0x0012
HOTKEY_ID = 0xA0B1


class GlobalHotkey:
    """Calls `action` when the key is pressed anywhere; `set_key` changes or (with "") removes it."""

    def __init__(self, action, log):
        self._action, self._log = action, log
        self._thread: threading.Thread | None = None
        self._thread_id = 0
        self._lock = threading.Lock()
        self.key = ""
        self.active = False

    @staticmethod
    def available() -> bool:
        return sys.platform == "win32"

    def set_key(self, key: str) -> None:
        with self._lock:
            if key == self.key and (self.active or not key):
                return
            self._stop()
            self.key = key if key in KEYS else ""
            if self.key and self.available():
                ready = threading.Event()
                self._thread = threading.Thread(target=self._run, args=(self.key, ready), name="hotkey", daemon=True)
                self._thread.start()
                ready.wait(2)

    def _stop(self) -> None:
        if self._thread is not None and self._thread_id:
            import ctypes
            ctypes.windll.user32.PostThreadMessageW(self._thread_id, WM_QUIT, 0, 0)
            self._thread.join(2)
        self._thread, self._thread_id, self.active = None, 0, False

    def _run(self, key: str, ready: threading.Event) -> None:
        import ctypes
        from ctypes import wintypes
        user32, kernel32 = ctypes.windll.user32, ctypes.windll.kernel32
        self._thread_id = kernel32.GetCurrentThreadId()
        if not user32.RegisterHotKey(None, HOTKEY_ID, MOD_NOREPEAT, KEYS[key]):
            self._log(f"Taste {key} ist schon von einem anderen Programm belegt – andere Taste wählen", "warn")
            ready.set()
            return
        self.active = True
        ready.set()
        message = wintypes.MSG()
        try:
            while user32.GetMessageW(ctypes.byref(message), None, 0, 0) > 0:
                if message.message == WM_HOTKEY and message.wParam == HOTKEY_ID:
                    try:
                        self._action("Taste")
                    except Exception as error:          # never lose the key because of one failure
                        self._log(f"Markieren ging nicht: {error!r}", "warn")
        finally:
            user32.UnregisterHotKey(None, HOTKEY_ID)
            self.active = False

    def state(self) -> dict:
        return {"key": self.key, "active": self.active, "available": self.available()}
