"""Texts the Python side shows to the user, in both app languages (German and English).

Tray menu and notifications, dialogs and the message shown when the server cannot start all
come from here. The control page translates its own texts (web/i18n.js); both follow the
same setting, "app_language" in settings.json (⚙ App-Einstellungen → Sprache der App).

    text("tray.open")                     → "Öffnen" / "Open"
    text("update.title", version="2.3")   → values are filled into {placeholders}
"""

LANGUAGES = ("de", "en")
_language = "de"

TEXTS = {
    # tray
    "tray.tooltip": ("{app} {version} – Overlays laufen", "{app} {version} – overlays running"),
    "tray.open": ("Öffnen", "Open"),
    "tray.reload_overlays": ("Overlays in OBS neu laden", "Reload overlays in OBS"),
    "tray.quit": ("Ganz beenden", "Quit completely"),
    "tray.keeps_running.title": ("{app} läuft weiter", "{app} keeps running"),
    "tray.keeps_running.text": ("Die Overlays in OBS laufen weiter. Über dieses Symbol öffnest du das Fenster wieder oder beendest die App.",
                                "The overlays in OBS keep running. Use this icon to open the window again or to quit the app."),
    "reload.title": ("Overlays neu laden", "Reload overlays"),
    "reload.via_obs": ("Die Browserquellen in OBS werden neu geladen.", "The browser sources in OBS are being reloaded."),
    "reload.count": ("{count} Overlay(s) neu geladen.", "{count} overlay(s) reloaded."),
    "reload.none": ("Kein Overlay verbunden.", "No overlay connected."),
    "update.title": ("{app} {version} ist da", "{app} {version} is available"),
    "update.text": ("Klicke hier, um die neue Version herunterzuladen.", "Click here to download the new version."),
    # closing the window (system dialog, only when the control page does not answer)
    "close.title": ("{app} schließen?", "Close {app}?"),
    "close.text": ("Bei „Nur Fenster schließen“ laufen die Overlays in OBS weiter.",
                   "With “Close window only” the overlays in OBS keep running."),
    "close.quit": ("Ganz beenden", "Quit completely"),
    "close.hide": ("Nur Fenster schließen", "Close window only"),
    "close.cancel": ("Abbrechen", "Cancel"),
    # start
    "server_failed": ("Der Server konnte nicht starten:\n{error}\n\nLäuft ein anderes Programm auf Port 8787?",
                      "The server could not start:\n{error}\n\nIs another program using port 8787?"),
    # password vault (systems without a keyring)
    "vault.unlock.title": ("{app} – gespeicherte Schlüssel", "{app} – saved keys"),
    "vault.unlock.text": ("Passwort für FACEIT-Key, DACH-CS-Zugang und OBS-Passwort:",
                          "Password for the FACEIT key, DACH CS access and OBS password:"),
    "vault.wrong": ("Falsches Passwort. ", "Wrong password. "),
    "vault.offer.text": ("Auf diesem System gibt es keinen Schlüsselbund.", "This system has no keyring."),
    "vault.offer.details": ("FACEIT-Key, DACH-CS-Zugang und OBS-Passwort gelten dann nur bis zum Beenden der App.\n"
                            "Stattdessen mit einem eigenen Passwort geschützt speichern? Es wird bei jedem Start abgefragt.",
                            "The FACEIT key, DACH CS access and OBS password then only last until the app quits.\n"
                            "Store them protected by your own password instead? It is asked for at every start."),
    "vault.offer.create": ("Passwort festlegen", "Set password"),
    "vault.offer.session": ("Nur für diese Sitzung", "This session only"),
    "vault.offer.never": ("Nicht mehr fragen", "Don't ask again"),
    "vault.new": ("Neues Passwort (mindestens {length} Zeichen):", "New password (at least {length} characters):"),
    "vault.repeat": ("Passwort wiederholen:", "Repeat password:"),
    "vault.mismatch": ("Die Passwörter stimmen nicht überein.", "The passwords do not match."),
    "vault.too_short": ("Das Passwort braucht mindestens {length} Zeichen.", "The password needs at least {length} characters."),
}


def set_language(language: str) -> None:
    """Use this app language for all following texts ("de" or "en"; anything else is ignored)."""
    global _language
    if language in LANGUAGES:
        _language = language


def language() -> str:
    """The current app language ("de" or "en")."""
    return _language


def text(key: str, **values) -> str:
    """The text in the current app language, with {placeholders} filled in."""
    german, english = TEXTS[key]
    return (english if _language == "en" else german).format(**values)
