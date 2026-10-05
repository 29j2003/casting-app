"""Dialogs for the password vault (systems without a keyring, see password_vault.py).

Called once at start, before the server starts:
  - a vault exists          → ask for its password (three tries; cancel = secrets for this session only)
  - no vault, not declined  → offer to create one ("Passwort festlegen", "Nur für diese Sitzung", "Nicht mehr fragen")
"""

from pathlib import Path

from PySide6.QtWidgets import QInputDialog, QLineEdit, QMessageBox

from .. import password_vault
from ..settings import AppSettings
from ..texts import text
from ..version import APP_NAME

ATTEMPTS = 3


def _ask(title: str, text: str) -> str | None:
    """Password input dialog; None if the user cancels."""
    value, ok = QInputDialog.getText(None, title, text, QLineEdit.EchoMode.Password)
    return value if ok else None


def open_or_offer_vault(data_dir: Path, settings: AppSettings):
    """The opened PasswordVault, or None (secrets then live for this session only)."""
    if password_vault.vault_exists(data_dir):
        for attempt in range(ATTEMPTS):
            hint = "" if attempt == 0 else text("vault.wrong")
            password = _ask(text("vault.unlock.title", app=APP_NAME), hint + text("vault.unlock.text"))
            if password is None:
                return None
            try:
                return password_vault.PasswordVault(data_dir, password)
            except (password_vault.WrongPassword, ValueError):
                continue
        return None
    if not settings.get("offer_password_vault"):
        return None
    box = QMessageBox(QMessageBox.Icon.Question, APP_NAME, text("vault.offer.text"))
    box.setInformativeText(text("vault.offer.details"))
    create = box.addButton(text("vault.offer.create"), QMessageBox.ButtonRole.AcceptRole)
    box.addButton(text("vault.offer.session"), QMessageBox.ButtonRole.RejectRole)
    never = box.addButton(text("vault.offer.never"), QMessageBox.ButtonRole.DestructiveRole)
    box.exec()
    if box.clickedButton() is never:
        settings.update({"offer_password_vault": False})
        return None
    if box.clickedButton() is not create:
        return None
    while True:
        password = _ask(APP_NAME, text("vault.new", length=password_vault.MIN_PASSWORD_LENGTH))
        if password is None:
            return None
        if _ask(APP_NAME, text("vault.repeat")) != password:
            QMessageBox.warning(None, APP_NAME, text("vault.mismatch"))
            continue
        try:
            return password_vault.PasswordVault(data_dir, password)
        except ValueError:
            QMessageBox.warning(None, APP_NAME, text("vault.too_short", length=password_vault.MIN_PASSWORD_LENGTH))
