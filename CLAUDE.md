# Casting-App – Leitfaden für Claude Code

Desktop-App in Python (PySide6 / Qt WebEngine, Windows/Linux/macOS) zum Casten von CS2-Matches mit OBS. Ein Python-Server
liefert die Steuerseite (eigenes App-Fenster) und die Overlays aus; OBS zeigt alles in **einer** Browserquelle (`overlay.html`).
Nutzer: Julius (Twitch 29_THE_P4TCH3R), castet DACH CS Masters, ESEA, Uniliga.
Aufbau und Rezepte für Änderungen: `ENTWICKLUNG.md` (bei neuen Bausteinen dort mitpflegen).
**Alle Namen im Code englisch** (Python und `web/`: Variablen, Funktionen, CSS-Klassen, IDs, API-Pfade, JSON-Felder, Dateien).
**Python-Code: englische Kommentare, sauber dokumentiert (Docstrings je Modul/Klasse).**
**Oberfläche, Texte für Nutzer und Doku auf Deutsch; Kommentare in `web/` dürfen deutsch bleiben.**

## Aufbau
- `casting_app/__main__.py` – Start: Desktop-App oder `--no-window`/`--ohne-fenster` (nur Server), `--no-gpu`/`--ohne-gpu`.
- `casting_app/server/` – HTTP-Server (Port 8787, nur localhost): `app_server.py` (Anfrage-Prüfung, alle `/api`-Routen,
  Zustand, Bilder, DACH-Weiterleitung `/dach/<page>`), `event_hub.py` (SSE `/api/events`), `static_files.py`,
  `game_state.py` + `cs2_setup.py` (CS2-GSI lokal + Port 8788 mit Token), `faceit.py`, `video_info.py`.
  Alte Adressen aus 2.1 (`steuerung.html`, `spieler.html` …, `/medien/…`, `/api/ereignisse`, `/api/beenden`) bleiben als
  Weiterleitung bzw. Alias – OBS-Quellen und ältere Versionen funktionieren weiter (`LEGACY_PAGES`, `_reload_legacy_page`).
- `casting_app/secret_store.py` – FACEIT-Key, DACH-CS-ID/-Key nur im Schlüsselbund (`keyring`), keine Dateien;
  ohne Schlüsselbund nur Sitzung; einmalige Übernahme der 1.x-Dateien (DPAPI über ctypes, Base64, dach.json).
- `casting_app/password_vault.py` – Passwort-Tresor für Systeme ohne Schlüsselbund (scrypt + AES-GCM, Passwort wird nie gespeichert).
- `casting_app/settings.py` (settings.json: Update-Prüfung, App-Sprache `app_language`, Tresor-Angebot) · `update_check.py` (GitHub Releases).
- `casting_app/legacy.py` + `web/legacy.js` – Übernahme der Daten aus 2.1 und älter (deutsche Namen): Datenordner
  (zustand.json → state.json …), Browser-Speicher, Bilder-/Sitzungs-Datenbanken, importierte Dateien. Gemeinsame Tabelle
  alt → neu in `web/legacy.js` (zwischen `/*BEGIN*/` und `/*END*/`, nicht von Hand ändern; Test: `tests/test_legacy.py`).
- `casting_app/instance.py` – laufende Version (`/api/ping`), ältere ablösen (`/api/beenden` – versteht jede Version), Versionsvergleich.
- `casting_app/desktop/` – `app.py` (Start, eine Instanz per `QLocalServer`, Tray, Auto-Beenden, Beenden),
  `main_window.py` (Fenster, `closeEvent` → Dialog der Steuerseite, Systemdialog nur als Rückfall), `web_page.py`
  (Rechte, Links, Downloads, Skripte), `bridge.py` + `scripts/page_bridge.js`/`app_bridge.js` (window.castApp ↔ isolierte
  Welt mit QWebChannel), `audio.py` + `scripts/volume.js` (Ton im App-Fenster), `tray.py`.
- `web/control.html` – die komplette Steueroberfläche (HTML/CSS/JS in einer Datei, sehr groß):
  Bereiche Live · Match · Turnier · Setup · Log, Docks, Arbeitsbereiche, Befehlspalette (Strg K), Ton über OBS-WebSocket.
- `web/overlay.html` + `web/broadcast.js` – Szenenwechsel in einer Quelle (gemeinsame Teile bleiben/gleiten,
  Übergänge Schnitt/Blende/Schieben/Wischen/Stinger); DACH CS – Offiziell als Vollbild-iframes (3 Rahmen im Wechsel).
- `web/cast.js` – Zeichnen aller Overlay-Teile (Themes, Einblendungen, Live-Stats, Turnier, Ton im Overlay).
- `web/cast-core.js` – gemeinsamer Kern (Standardzustand, Kanal, Turnier-Logik SE/DE/Swiss/GSL/Tabelle, DACH-Rahmen).
- `web/themes.js` – Themes (Regulär, DACH CS eigener Stil, DACH CS – Offiziell, ESEA, Uniliga).
- `web/connection.js` – Startwerte der OBS-Verbindung.
- `web/i18n.js` + `web/lang-en.js` – Sprache der Steuerseite (übersetzt beim Anzeigen, Wörterbuch Deutsch → Englisch);
  `casting_app/texts.py` – Texte der Python-Seite (Tray, Dialoge) in beiden Sprachen.
- `web/<scene>.html` – Szenen-Vorlagen, **erzeugt** von `tools/generate_scenes.py` (dort ändern, dann ausführen).

## Regeln
- **Version** steht in `casting_app/version.py`, `pyproject.toml` und `web/cast-core.js` – alle drei gleich halten
  (`tools/build.py` prüft das). Abweichende Versionen lassen OBS-Overlays neu laden.
- Geheimnisse (FACEIT-Key, DACH-ID und -Key) **nie** in Zustand, Log, Exporte, Dateien oder Antworten – nur `SecretStore.get()` im Server.
- Die Brücke zu Python liegt nur in der isolierten Welt der Steuerseite; fremde Seiten im Fenster bekommen keinen Zugang.
  Eingespielte Skripte nicht zur Laufzeit austauschen (Qt verpasst sonst Rahmen, die gerade entstehen).
- Overlays in OBS dürfen sich durch die Desktop-App nicht ändern – Desktop-Besonderheiten nur in `casting_app/desktop/` bzw. hinter `window.castApp`.
- Leistung zählt (läuft in OBS): keine Filter auf großen Flächen, Zeichnen nur bei Änderung (`newNeeded`), keine Endlos-Animationen im Leerlauf.
- Stream-Overlays dürfen keine Bedien-Hinweise zeigen – Hinweise nur in der Vorschau (`body.idle`).
- Nach Änderungen an Übergängen: `tests/live/transitions.py` und `tests/live/flicker.py` müssen sauber bleiben.
- Nach Änderungen an `casting_app/`: `python -m pytest` (unter Linux mit `xvfb-run -a`) muss sauber bleiben.
- `LIESMICH.md` und `web/ANLEITUNG.md` sind dieselbe Anleitung – beide gleich halten.
- **Zwei Sprachen** (App und Overlays, unabhängig): neuer sichtbarer Text in der Steuerseite → Übersetzung in
  `web/lang-en.js`; feste Overlay-Texte → `OVERLAY_TEXTS`/`OVERLAY_WORDS` in `web/cast-core.js` (beide Sprachen);
  Texte aus Python → `casting_app/texts.py`. Werte, die der Code vergleicht, nie aus sichtbarem Text ableiten.
- Gespeichertes Datenformat ändern (Zustand, Theme-/Sitzungs-Export): alte Daten müssen weiter laden – ggf. Übernahme in
  `web/legacy.js`/`casting_app/legacy.py` ergänzen.

## Befehle
- Einrichten: `pip install -e ".[test]"` (Python 3.11+); bauen zusätzlich `pip install -e ".[build]"`
- Starten: `python -m casting_app` (Desktop-App) · `python -m casting_app --no-window` (nur Server)
- Bauen: `python tools/build.py` → `dist/` (für das laufende System; PyInstaller, Windows-Installer `tools/installer.nsi`)
- Tests: `xvfb-run -a python -m pytest` · Skripte gegen die laufende App (`QTWEBENGINE_REMOTE_DEBUGGING=9222 python -m casting_app`,
  als root zusätzlich `QTWEBENGINE_DISABLE_SANDBOX=1`): `tests/live/` (`transitions.py`, `flicker.py`, `fast_switching.py`, `memory.py`)
- Szenen neu erzeugen: `python3 tools/generate_scenes.py`

## Geplant
- Notarisierung für macOS einschalten, sobald ein Apple-Entwicklerkonto da ist; Windows-Signatur mit eigenem Zertifikat.
- Konzept 3 vollständig umsetzen: Match-Stepper + Spieltag, Turnier-Phasen, Teams-Vorstellung, Fernsteuerung (Touch Portal).
- DACH-Rahmen für Duocam/Interaktion/Interview exakt vermessen (Screenshots vom Nutzer).
