"""Secrets of the app: FACEIT API key, DACH CS user ID and DACH CS key, OBS WebSocket password.

Where they live
    Only in the system keyring – Windows Credential Manager, macOS Keychain or
    Linux Secret Service/KWallet – through the `keyring` package. Nothing secret
    is written to the data folder.

    Without a usable keyring (e.g. Linux without Secret Service) the secrets are
    kept in memory for the current session only and the log says so. A weak
    "encrypted" file with a key stored next to it would only look safe, so the
    app deliberately does not do that.

Who can read them
    Only the server code, via `SecretStore.get()`. They never appear in the app
    state, the log, exports or any API response; the control page can only set
    or delete them and ask whether one is stored.

Migration from version 1.x (once, on first start)
    faceit.schluessel, dach.schluessel – Windows: DPAPI-protected, otherwise Base64
    dach.json                          – the DACH user ID in plain text
    The values are moved into the keyring and the old files are deleted. A file
    that cannot be read (e.g. created by another Windows account) is renamed to
    *.unreadable so the app does not retry on every start.
"""

import base64
import json
import re
import sys
import threading
from pathlib import Path
from typing import Callable

KEYRING_SERVICE = "Casting-App"

FACEIT_KEY = "faceit-key"
DACH_USER_ID = "dach-user-id"
DACH_KEY = "dach-key"
OBS_PASSWORD = "obs-password"
ACCESS_KEY = "access-key"          # the app's own key for its pages and OBS sources (see app_server)

# What a valid value looks like – anything else is rejected before it is stored
VALID_VALUE = {
    FACEIT_KEY: re.compile(r"^[A-Za-z0-9-]{8,100}$"),
    DACH_USER_ID: re.compile(r"^\d{1,9}$"),
    DACH_KEY: re.compile(r"^[A-Za-z0-9-]{5,64}$"),
    OBS_PASSWORD: re.compile(r"^[^\r\n]{1,200}$"),
    ACCESS_KEY: re.compile(r"^[A-Za-z0-9_-]{32,64}$"),
}

# Old 1.x files: (secret name, file name, format)
LEGACY_FILES = (
    (FACEIT_KEY, "faceit.schluessel", "protected"),
    (DACH_KEY, "dach.schluessel", "protected"),
    (DACH_USER_ID, "dach.json", "json"),
)


def is_valid(name: str, value: str) -> bool:
    """True if `value` looks like a valid secret of kind `name`."""
    return bool(VALID_VALUE[name].match(value or ""))


def decrypt_legacy_file(content: str) -> str:
    """Decrypt the content of a 1.x secret file.

    Windows: Base64 of DPAPI data bound to the current user (CryptUnprotectData).
    Other systems: plain Base64 (1.x had no real protection there).
    """
    raw = base64.b64decode(content.strip())
    if sys.platform != "win32":
        return raw.decode("utf-8")
    import ctypes
    from ctypes import wintypes

    class DataBlob(ctypes.Structure):
        """DATA_BLOB of the Windows API: size and pointer of a byte buffer."""
        _fields_ = [("size", wintypes.DWORD), ("data", ctypes.POINTER(ctypes.c_char))]

    buffer = ctypes.create_string_buffer(raw, len(raw))
    encrypted = DataBlob(len(raw), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_char)))
    decrypted = DataBlob()
    if not ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(encrypted), None, None, None, None, 0,
                                                    ctypes.byref(decrypted)):
        raise OSError("DPAPI could not decrypt the file")
    try:
        return ctypes.string_at(decrypted.data, decrypted.size).decode("utf-8")
    finally:
        ctypes.windll.kernel32.LocalFree(decrypted.data)


def system_keyring_or_none():
    """The system keyring backend, or None when the system has no usable keyring."""
    try:
        import keyring
        from keyring.backends import fail
        backend = keyring.get_keyring()
        if isinstance(backend, fail.Keyring) or getattr(backend, "priority", 1) <= 0:
            return None
        return backend
    except Exception:
        return None


class SecretStore:
    """Holds the secrets; persists them in the system keyring when one is available."""

    def __init__(self, data_dir: Path, log: Callable[[str, str], None] = lambda text, level="info": None,
                 keyring_backend="system", legacy_decrypt: Callable[[str], str] = decrypt_legacy_file):
        """
        data_dir         – folder with the old 1.x files (for the one-time migration)
        log              – log function (text, level)
        keyring_backend  – "system" for the system keyring, None for session only, or a keyring backend (tests)
        legacy_decrypt   – decrypts 1.x files (replaceable in tests)
        """
        self._data_dir = data_dir
        self._log = log
        self._backend = system_keyring_or_none() if keyring_backend == "system" else keyring_backend
        self._legacy_decrypt = legacy_decrypt
        self._values: dict[str, str] = {}
        self._lock = threading.Lock()
        if self._backend is None:
            self._log("Kein Schlüsselbund des Systems verfügbar – FACEIT-Key und DACH-CS-Zugang gelten nur für diese Sitzung", "warn")
        self._load()
        self._migrate_legacy_files()

    # --- public API ---

    @property
    def persistent(self) -> bool:
        """True when secrets survive a restart (system keyring available)."""
        return self._backend is not None

    def has(self, name: str) -> bool:
        """True if the secret `name` is stored (the control page may ask this – never for the value)."""
        with self._lock:
            return name in self._values

    def get(self, name: str) -> str | None:
        """The secret value – for use inside the server only, never send it anywhere else."""
        with self._lock:
            return self._values.get(name)

    def set(self, name: str, value: str) -> None:
        """Store a secret. Raises ValueError for invalid values, OSError if the keyring refuses."""
        if not is_valid(name, value):
            raise ValueError("invalid value")
        if self._backend is not None:
            try:
                self._backend.set_password(KEYRING_SERVICE, name, value)
            except Exception as error:
                raise OSError("keyring refused to store the secret") from error
        with self._lock:
            self._values[name] = value

    def delete(self, name: str) -> None:
        """Forget the secret `name` (memory and keyring)."""
        with self._lock:
            self._values.pop(name, None)
        if self._backend is not None:
            try:
                self._backend.delete_password(KEYRING_SERVICE, name)
            except Exception:
                pass                                   # was not stored – nothing to delete

    # --- internals ---

    def _load(self) -> None:
        """Read all known secrets from the keyring into memory."""
        if self._backend is None:
            return
        for name in VALID_VALUE:
            try:
                value = self._backend.get_password(KEYRING_SERVICE, name)
            except Exception:
                self._log("Schlüsselbund nicht lesbar – FACEIT-Key/DACH-CS-Zugang bitte neu eintragen", "warn")
                return
            if value and is_valid(name, value):
                self._values[name] = value

    def _migrate_legacy_files(self) -> None:
        """Move the secret files of version 1.x into the keyring once (see module docstring)."""
        for name, file_name, file_format in LEGACY_FILES:
            path = self._data_dir / file_name
            (self._data_dir / (file_name + ".unreadable")).unlink(missing_ok=True)    # left by older versions
            if not path.exists():
                continue
            if self.has(name):                         # already migrated earlier
                path.unlink(missing_ok=True)
                continue
            try:
                content = path.read_text(encoding="utf-8")
                if file_format == "json":
                    value = str(json.loads(content).get("userid") or "")
                else:
                    value = self._legacy_decrypt(content)
                value = value.strip()
            except Exception:                          # cannot be decoded: delete it, it holds nothing usable
                path.unlink(missing_ok=True)
                self._log(f"Alte Datei {file_name} nicht lesbar – bitte den Wert neu eintragen", "warn")
                continue
            try:
                if is_valid(name, value):
                    self.set(name, value)
                    self._log(f"Gespeicherten Zugang aus Version 1.x übernommen ({file_name})", "info")
            except Exception:                          # keyring refused: keep the file and try again next start
                self._log(f"Alte Datei {file_name} konnte noch nicht übernommen werden", "warn")
                continue
            if self.persistent:                        # without keyring keep the file for the next try
                path.unlink(missing_ok=True)
