"""Password-protected storage for secrets on systems without a keyring (mainly Linux without Secret Service/KWallet).

The file secrets.vault in the data folder is useless without the password: the key is derived from the
password with scrypt and the content is encrypted with AES-GCM. The password itself is never stored – the
user types it when the app starts (desktop) or provides it in CASTING_APP_VAULT_PASSWORD (server without window).

The class offers the small part of the keyring backend interface that SecretStore uses
(get_password, set_password, delete_password), so SecretStore works with it unchanged.
"""

import base64
import hashlib
import json
import os
import threading
from pathlib import Path

from .files import set_aside, write_atomic

FILE_NAME = "secrets.vault"
SCRYPT = {"n": 2 ** 15, "r": 8, "p": 1, "maxmem": 64 * 1024 * 1024}
MIN_PASSWORD_LENGTH = 8
ENVIRONMENT_VARIABLE = "CASTING_APP_VAULT_PASSWORD"


class WrongPassword(Exception):
    """The password does not open the vault."""


class DamagedVault(Exception):
    """The vault file is not readable at all (cut off, edited) – no password can open it."""


def _aes_gcm():
    """AES-GCM from the `cryptography` package (imported late: only needed for the vault)."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    return AESGCM


def is_available() -> bool:
    """True if the encryption library is installed (it comes with the Linux keyring support)."""
    try:
        _aes_gcm()
        return True
    except ImportError:
        return False


def vault_file(data_dir: Path) -> Path:
    """Path of the vault file in the data folder."""
    return data_dir / FILE_NAME


def vault_exists(data_dir: Path) -> bool:
    """True if a vault file was created earlier in this data folder."""
    return (data_dir / FILE_NAME).exists()


def vault_from_environment(data_dir: Path, log) -> "PasswordVault | None":
    """The vault opened with CASTING_APP_VAULT_PASSWORD, or None if that variable is not set or does not open it.

    Used by the server-only mode and by unattended starts of the desktop app (no password dialog then).
    """
    password = os.environ.pop(ENVIRONMENT_VARIABLE, None)     # removed at once: child processes must not inherit it
    if not password or not is_available():
        return None
    try:
        return PasswordVault(data_dir, password)
    except (WrongPassword, ValueError):
        log(f"{ENVIRONMENT_VARIABLE} öffnet den Schlüssel-Tresor nicht – Schlüssel gelten nur für diese Sitzung", "warn")
        return None
    except DamagedVault:
        set_aside(vault_file(data_dir), log)
        return None


class PasswordVault:
    """Secrets in an encrypted file; open it with the password (raises WrongPassword)."""

    priority = 1                                  # looks like a usable keyring backend to SecretStore

    def __init__(self, data_dir: Path, password: str):
        """Open the vault in `data_dir` with `password` (or prepare a new one); raises WrongPassword or ValueError."""
        if len(password) < MIN_PASSWORD_LENGTH:
            raise ValueError(f"Das Passwort braucht mindestens {MIN_PASSWORD_LENGTH} Zeichen.")
        self._file = data_dir / FILE_NAME
        self._password = password.encode()
        self._lock = threading.Lock()
        self._salt = os.urandom(16)
        self._entries: dict[str, str] = {}
        if self._file.exists():
            self._open()

    def _key(self) -> bytes:
        """The AES key derived from the password and the salt of this vault (scrypt)."""
        return hashlib.scrypt(self._password, salt=self._salt, dklen=32, **SCRYPT)

    def _open(self) -> None:
        """Read and decrypt the vault file; raises WrongPassword if the password does not fit."""
        try:
            stored = json.loads(self._file.read_text(encoding="utf-8"))
            self._salt = base64.b64decode(stored["salt"])
            nonce, data = base64.b64decode(stored["nonce"]), base64.b64decode(stored["data"])
        except (OSError, ValueError, KeyError, TypeError) as error:
            raise DamagedVault from error
        try:
            plain = _aes_gcm()(self._key()).decrypt(nonce, data, None)
        except Exception as error:                # cryptography raises InvalidTag for a wrong password
            raise WrongPassword from error
        self._entries = json.loads(plain)

    def _save(self) -> None:
        """Encrypt all entries with a fresh nonce and replace the file atomically (owner-only permissions)."""
        nonce = os.urandom(12)
        data = _aes_gcm()(self._key()).encrypt(nonce, json.dumps(self._entries).encode(), None)
        content = {"version": 1, "salt": base64.b64encode(self._salt).decode(),
                   "nonce": base64.b64encode(nonce).decode(), "data": base64.b64encode(data).decode()}
        write_atomic(self._file, json.dumps(content), private=True)

    # --- keyring backend interface used by SecretStore ---

    def get_password(self, service: str, name: str) -> str | None:
        """Stored value of `name`, or None (keyring interface)."""
        with self._lock:
            return self._entries.get(f"{service}/{name}")

    def set_password(self, service: str, name: str, value: str) -> None:
        """Store `value` under `name` and save the vault (keyring interface)."""
        with self._lock:
            self._entries[f"{service}/{name}"] = value
            self._save()

    def delete_password(self, service: str, name: str) -> None:
        """Remove `name` from the vault if it is there (keyring interface)."""
        with self._lock:
            if self._entries.pop(f"{service}/{name}", None) is not None:
                self._save()
