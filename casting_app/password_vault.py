"""Password-protected storage for secrets on systems without a keyring (mainly Linux without Secret Service/KWallet).

The file geheimnisse.tresor in the data folder is useless without the password: the key is derived from the
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

FILE_NAME = "geheimnisse.tresor"
SCRYPT = {"n": 2 ** 15, "r": 8, "p": 1, "maxmem": 64 * 1024 * 1024}
MIN_PASSWORD_LENGTH = 8


class WrongPassword(Exception):
    """The password does not open the vault."""


def _aes_gcm():
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    return AESGCM


def is_available() -> bool:
    """True if the encryption library is installed (it comes with the Linux keyring support)."""
    try:
        _aes_gcm()
        return True
    except ImportError:
        return False


def vault_exists(data_dir: Path) -> bool:
    return (data_dir / FILE_NAME).exists()


class PasswordVault:
    """Secrets in an encrypted file; open it with the password (raises WrongPassword)."""

    priority = 1                                  # looks like a usable keyring backend to SecretStore

    def __init__(self, data_dir: Path, password: str):
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
        return hashlib.scrypt(self._password, salt=self._salt, dklen=32, **SCRYPT)

    def _open(self) -> None:
        stored = json.loads(self._file.read_text(encoding="utf-8"))
        self._salt = base64.b64decode(stored["salt"])
        try:
            plain = _aes_gcm()(self._key()).decrypt(base64.b64decode(stored["nonce"]), base64.b64decode(stored["data"]), None)
        except Exception as error:                # cryptography raises InvalidTag for a wrong password
            raise WrongPassword from error
        self._entries = json.loads(plain)

    def _save(self) -> None:
        nonce = os.urandom(12)
        data = _aes_gcm()(self._key()).encrypt(nonce, json.dumps(self._entries).encode(), None)
        content = {"version": 1, "salt": base64.b64encode(self._salt).decode(),
                   "nonce": base64.b64encode(nonce).decode(), "data": base64.b64encode(data).decode()}
        temporary = self._file.with_suffix(".neu")
        temporary.write_text(json.dumps(content), encoding="utf-8")
        temporary.chmod(0o600)
        temporary.replace(self._file)

    # --- keyring backend interface used by SecretStore ---

    def get_password(self, service: str, name: str) -> str | None:
        with self._lock:
            return self._entries.get(f"{service}/{name}")

    def set_password(self, service: str, name: str, value: str) -> None:
        with self._lock:
            self._entries[f"{service}/{name}"] = value
            self._save()

    def delete_password(self, service: str, name: str) -> None:
        with self._lock:
            if self._entries.pop(f"{service}/{name}", None) is not None:
                self._save()
