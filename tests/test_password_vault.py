"""Tests for casting_app/password_vault.py (secrets storage for systems without a keyring).

    pytest tests/test_password_vault.py
"""

import pytest

from casting_app import password_vault
from casting_app.password_vault import PasswordVault, WrongPassword
from casting_app.secret_store import FACEIT_KEY, SecretStore

pytestmark = pytest.mark.skipif(not password_vault.is_available(), reason="cryptography not installed")


def test_round_trip_and_wrong_password(tmp_path):
    PasswordVault(tmp_path, "richtig-123").set_password("Casting-App", FACEIT_KEY, "abcdefgh-1234")
    assert PasswordVault(tmp_path, "richtig-123").get_password("Casting-App", FACEIT_KEY) == "abcdefgh-1234"
    with pytest.raises(WrongPassword):
        PasswordVault(tmp_path, "falsch-1234")


def test_file_reveals_nothing(tmp_path):
    PasswordVault(tmp_path, "richtig-123").set_password("Casting-App", FACEIT_KEY, "abcdefgh-1234")
    content = (tmp_path / password_vault.FILE_NAME).read_bytes()
    assert b"abcdefgh" not in content and b"richtig" not in content and b"faceit" not in content


def test_short_passwords_are_refused(tmp_path):
    with pytest.raises(ValueError):
        PasswordVault(tmp_path, "kurz")


def test_secret_store_works_with_the_vault(tmp_path):
    store = SecretStore(tmp_path, keyring_backend=PasswordVault(tmp_path, "richtig-123"))
    store.set(FACEIT_KEY, "abcdefgh-5678")
    assert store.persistent
    assert SecretStore(tmp_path, keyring_backend=PasswordVault(tmp_path, "richtig-123")).get(FACEIT_KEY) == "abcdefgh-5678"
    store.delete(FACEIT_KEY)
    assert not SecretStore(tmp_path, keyring_backend=PasswordVault(tmp_path, "richtig-123")).has(FACEIT_KEY)


def test_unlock_dialog_allows_three_tries(tmp_path, qapp, monkeypatch):
    from casting_app.desktop import vault_dialog
    from casting_app.settings import AppSettings
    PasswordVault(tmp_path, "richtig-123").set_password("Casting-App", FACEIT_KEY, "abcdefgh-1234")
    answers = iter(["falsch-0001", "falsch-0002", "richtig-123"])
    monkeypatch.setattr(vault_dialog, "_ask", lambda title, text: next(answers))
    vault = vault_dialog.open_or_offer_vault(tmp_path, AppSettings(tmp_path))
    assert vault.get_password("Casting-App", FACEIT_KEY) == "abcdefgh-1234"
    answers = iter(["falsch-0001", "falsch-0002", "falsch-0003"])
    assert vault_dialog.open_or_offer_vault(tmp_path, AppSettings(tmp_path)) is None   # then: session only


def test_environment_variable_opens_the_vault_without_dialog(tmp_path, monkeypatch):
    PasswordVault(tmp_path, "richtig-123").set_password("Casting-App", FACEIT_KEY, "abcdefgh-1234")
    warnings = []
    monkeypatch.delenv(password_vault.ENVIRONMENT_VARIABLE, raising=False)
    assert password_vault.vault_from_environment(tmp_path, lambda text, level: warnings.append(text)) is None
    monkeypatch.setenv(password_vault.ENVIRONMENT_VARIABLE, "richtig-123")
    vault = password_vault.vault_from_environment(tmp_path, lambda text, level: warnings.append(text))
    assert vault.get_password("Casting-App", FACEIT_KEY) == "abcdefgh-1234"
    monkeypatch.setenv(password_vault.ENVIRONMENT_VARIABLE, "falsch-0001")
    assert password_vault.vault_from_environment(tmp_path, lambda text, level: warnings.append(text)) is None
    assert len(warnings) == 1 and "falsch" not in warnings[0]
