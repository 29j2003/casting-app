"""Dialogs for the password vault (systems without a keyring, see password_vault.py).

Called once at start, before the server starts:
  - a vault exists          → ask for its password (three tries; cancel = secrets for this session only)
  - no vault, not declined  → offer to create one ("Passwort festlegen", "Nur für diese Sitzung", "Nicht mehr fragen")
"""

from pathlib import Path

from PySide6.QtWidgets import QInputDialog, QLineEdit, QMessageBox

from .. import password_vault
from ..settings import AppSettings
from ..version import APP_NAME

ATTEMPTS = 3


def _ask(title: str, text: str) -> str | None:
    value, ok = QInputDialog.getText(None, title, text, QLineEdit.EchoMode.Password)
    return value if ok else None


def open_or_offer_vault(data_dir: Path, settings: AppSettings):
    """The opened PasswordVault, or None (secrets then live for this session only)."""
    if password_vault.vault_exists(data_dir):
        for attempt in range(ATTEMPTS):
            hint = "" if attempt == 0 else "Falsches Passwort. "
            password = _ask(f"{APP_NAME} – gespeicherte Schlüssel",
                            f"{hint}Passwort für FACEIT-Key, DACH-CS-Zugang und OBS-Passwort:")
            if password is None:
                return None
            try:
                return password_vault.PasswordVault(data_dir, password)
            except (password_vault.WrongPassword, ValueError):
                continue
        return None
    if not settings.get("offer_password_vault"):
        return None
    box = QMessageBox(QMessageBox.Icon.Question, APP_NAME, "Auf diesem System gibt es keinen Schlüsselbund.")
    box.setInformativeText("FACEIT-Key, DACH-CS-Zugang und OBS-Passwort gelten dann nur bis zum Beenden der App.\n"
                           "Stattdessen mit einem eigenen Passwort geschützt speichern? Es wird bei jedem Start abgefragt.")
    create = box.addButton("Passwort festlegen", QMessageBox.ButtonRole.AcceptRole)
    box.addButton("Nur für diese Sitzung", QMessageBox.ButtonRole.RejectRole)
    never = box.addButton("Nicht mehr fragen", QMessageBox.ButtonRole.DestructiveRole)
    box.exec()
    if box.clickedButton() is never:
        settings.update({"offer_password_vault": False})
        return None
    if box.clickedButton() is not create:
        return None
    while True:
        password = _ask(APP_NAME, f"Neues Passwort (mindestens {password_vault.MIN_PASSWORD_LENGTH} Zeichen):")
        if password is None:
            return None
        if _ask(APP_NAME, "Passwort wiederholen:") != password:
            QMessageBox.warning(None, APP_NAME, "Die Passwörter stimmen nicht überein.")
            continue
        try:
            return password_vault.PasswordVault(data_dir, password)
        except ValueError as error:
            QMessageBox.warning(None, APP_NAME, str(error))
