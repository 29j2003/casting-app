"""Tests for casting_app/secret_store.py: keyring only, no secret files, one-time migration of 1.x files.

    pytest tests/test_secret_store.py
"""

import base64
import json
import sys

import pytest
from conftest import MemoryKeyring

from casting_app import secret_store
from casting_app.secret_store import DACH_KEY, DACH_USER_ID, FACEIT_KEY, SecretStore


def fake_dpapi(content: str) -> str:
    """Stands in for Windows DPAPI in the tests: "protected" means reversed Base64."""
    return base64.b64decode(content.strip()[::-1]).decode()


def write_legacy_files(folder, windows: bool) -> None:
    def protect(text: str) -> str:
        encoded = base64.b64encode(text.encode()).decode()
        return encoded[::-1] if windows else encoded
    (folder / "faceit.schluessel").write_text(protect("abcdefgh-1234-5678"))
    (folder / "dach.schluessel").write_text(protect("dachkey-0815"))
    (folder / "dach.json").write_text(json.dumps({"userid": "4242"}))


@pytest.mark.parametrize("windows", [True, False], ids=["windows-dpapi", "base64"])
def test_migrates_legacy_files_into_keyring_and_deletes_them(tmp_path, windows):
    write_legacy_files(tmp_path, windows)
    keyring = MemoryKeyring()
    messages = []
    store = SecretStore(tmp_path, lambda text, level="info": messages.append(text), keyring_backend=keyring,
                        legacy_decrypt=fake_dpapi if windows else secret_store.decrypt_legacy_file)
    assert store.get(FACEIT_KEY) == "abcdefgh-1234-5678"
    assert store.get(DACH_KEY) == "dachkey-0815"
    assert store.get(DACH_USER_ID) == "4242"
    assert list(tmp_path.iterdir()) == [], "keine Dateien mehr im Datenordner"
    assert keyring.passwords[("Casting-App", FACEIT_KEY)] == "abcdefgh-1234-5678"
    assert not any(secret in " ".join(messages) for secret in ("abcdefgh", "dachkey", "4242"))


def test_secrets_survive_restart_and_delete_is_permanent(tmp_path):
    keyring = MemoryKeyring()
    SecretStore(tmp_path, keyring_backend=keyring).set(FACEIT_KEY, "abcdefgh-9999")
    restarted = SecretStore(tmp_path, keyring_backend=keyring)
    assert restarted.get(FACEIT_KEY) == "abcdefgh-9999"
    restarted.delete(FACEIT_KEY)
    assert not SecretStore(tmp_path, keyring_backend=keyring).has(FACEIT_KEY)


def test_invalid_values_are_rejected(tmp_path):
    store = SecretStore(tmp_path, keyring_backend=MemoryKeyring())
    for name, value in ((FACEIT_KEY, "kurz"), (DACH_USER_ID, "12a"), (DACH_KEY, "mit leerzeichen")):
        with pytest.raises(ValueError):
            store.set(name, value)


def test_unreadable_legacy_file_is_set_aside(tmp_path):
    (tmp_path / "faceit.schluessel").write_text("kaputt")

    def broken(content):
        raise OSError("DPAPI could not decrypt the file")
    store = SecretStore(tmp_path, keyring_backend=MemoryKeyring(), legacy_decrypt=broken)
    assert not store.has(FACEIT_KEY)
    assert (tmp_path / "faceit.schluessel.nicht-lesbar").exists()


def test_without_keyring_secrets_live_for_the_session_only(tmp_path):
    messages = []
    store = SecretStore(tmp_path, lambda text, level="info": messages.append((level, text)), keyring_backend=None)
    store.set(FACEIT_KEY, "abcdefgh-9999")
    assert store.has(FACEIT_KEY) and not store.persistent
    assert list(tmp_path.iterdir()) == [], "ohne Schlüsselbund wird nichts auf die Platte geschrieben"
    assert any(level == "warn" for level, _ in messages)


@pytest.mark.skipif(sys.platform != "win32", reason="real DPAPI and Credential Manager exist only on Windows")
def test_windows_real_dpapi_file_moves_into_credential_manager(tmp_path):
    """End to end on Windows: a file protected like version 1.x did ends up in the Credential Manager."""
    import ctypes
    from ctypes import wintypes

    from keyring.backends.Windows import WinVaultKeyring

    class DataBlob(ctypes.Structure):
        _fields_ = [("size", wintypes.DWORD), ("data", ctypes.POINTER(ctypes.c_char))]

    def protect(text: str) -> str:
        raw = text.encode()
        buffer = ctypes.create_string_buffer(raw, len(raw))
        plain, protected = DataBlob(len(raw), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_char))), DataBlob()
        assert ctypes.windll.crypt32.CryptProtectData(ctypes.byref(plain), None, None, None, None, 0, ctypes.byref(protected))
        try:
            return base64.b64encode(ctypes.string_at(protected.data, protected.size)).decode()
        finally:
            ctypes.windll.kernel32.LocalFree(protected.data)

    (tmp_path / "faceit.schluessel").write_text(protect("abcdefgh-wind-0ws1"))
    vault = WinVaultKeyring()
    try:
        store = SecretStore(tmp_path, keyring_backend=vault)
        assert store.get(FACEIT_KEY) == "abcdefgh-wind-0ws1"
        assert vault.get_password("Casting-App", FACEIT_KEY) == "abcdefgh-wind-0ws1"
        assert not (tmp_path / "faceit.schluessel").exists()
    finally:
        try:
            vault.delete_password("Casting-App", FACEIT_KEY)
        except Exception:
            pass
