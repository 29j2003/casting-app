# Casting-App

Steuerung und Overlays für CS2-Casts in OBS – eine Desktop-App in Python (PySide6 / Qt WebEngine) für Windows, Linux
und macOS, eine Browserquelle. Szenen mit Übergängen, Einblendungen, Themes (u. a. DACH CS – Offiziell), FACEIT-Import,
CS2-Livedaten (GSI), Turnierbaum/Tabellen, Ton-Steuerung über OBS.

Ausführliche Anleitung für Nutzer: [LIESMICH.md](LIESMICH.md) · Änderungen am Code (Aufbau, Rezepte): [ENTWICKLUNG.md](ENTWICKLUNG.md)

## Aufbau (ab 2.0)

```
casting_app/                      Python-Paket (Code und Kommentare englisch)
 ├─ __main__.py                   Start: Desktop-App oder --no-window (nur Server)
 ├─ version.py                    Version (gleich in pyproject.toml und web/cast-core.js)
 ├─ paths.py, app_log.py          Ordner der App, Log (log.txt + Reiter „Log“)
 ├─ secret_store.py               FACEIT-Key, DACH-CS-ID/-Key, OBS-Passwort – nur im Schlüsselbund des Systems
 ├─ password_vault.py             Passwort-Tresor für Systeme ohne Schlüsselbund
 ├─ settings.py, update_check.py  App-Einstellungen (settings.json), Suche nach neuer Version
 ├─ legacy.py                     Daten aus 2.1 und älter (deutsche Namen) einmalig übernehmen
 ├─ texts.py                      Texte der Python-Seite (Tray, Dialoge) auf Deutsch und Englisch
 ├─ instance.py                   laufende Version erkennen, ältere ablösen
 ├─ server/                       HTTP-Server http://localhost:8787 (nur dieser PC)
 │   ├─ app_server.py             Prüfung jeder Anfrage, alle /api-Routen, Zustand, Bilder
 │   ├─ event_hub.py              Live-Verbindung zu Steuerseite und Overlays (Server-Sent Events)
 │   ├─ static_files.py           Dateien aus web/, eigene Videos/Schriften (Range, ETag)
 │   ├─ game_state.py, cs2_setup.py   CS2-Livedaten, Empfang vom Observer-PC (Port 8788), cfg-Datei
 │   ├─ faceit.py                 einzige Verbindung nach draußen (FACEIT-Daten)
 │   └─ video_info.py             Videos prüfen (Codec, Auflösung, Faststart)
 └─ desktop/                      Fenster (Qt)
     ├─ app.py                    Start, eine Instanz, Tray, Beenden
     ├─ main_window.py            Fenster mit der Steuerseite, Frage vor dem Schließen
     ├─ web_page.py, bridge.py    Seite, Brücke window.castApp ↔ Python, Rechte, Links, Downloads
     ├─ audio.py                  „Ton im App-Fenster“
     ├─ tray.py                   Tray-Symbol
     └─ scripts/                  ins Fenster eingespieltes JavaScript (Brücke, Lautstärke)
web/                              Steuerseite (control.html) und Overlays (overlay.html, Szenen), laufen auch in OBS
 ├─ i18n.js, lang-en.js           Sprache der App: übersetzt die Steuerseite beim Anzeigen (Wörterbuch Deutsch → Englisch)
 └─ legacy.js                     Tabelle alter (deutscher) Namen → neue Namen für die Daten-Übernahme
tools/generate_scenes.py          erzeugt die Szenen-Vorlagen web/<scene>.html
tools/build.py                    Bauen mit PyInstaller (+ installer.nsi für Windows)
tests/                            pytest-Tests; tests/live/ Skripte gegen die laufende App
```

* **Overlays in OBS** laden wie bisher `http://localhost:8787/overlay.html`.
* **Englische Namen (ab 2.2):** Code, API-Pfade, JSON-Felder und Dateien heißen englisch (`control.html`, `cast-core.js`,
  `broadcast.js`, `players.html`, `/api/state` …). Gespeicherte Daten aus 2.1 und älter werden beim ersten Start übernommen
  (`casting_app/legacy.py` für den Datenordner, `web/legacy.js` für Browser-Speicher, Datenbanken und importierte Dateien).
  Alte Adressen leitet der Server weiter (`/steuerung.html`, `/spieler.html`, `/medien/…`); eine noch offene Seite der alten
  Version (z. B. in OBS) lädt sich einmal neu.
* **Schließen:** `closeEvent` wird ignoriert, die Steuerseite zeigt sofort ihren eigenen Dialog
  (Ganz beenden · Nur Fenster schließen · Abbrechen). Bestätigt die Seite nicht binnen 1 s, fragt ein Systemdialog.
  „Nur Fenster schließen“ versteckt das Fenster; das Tray-Symbol (29-Logo) bietet Öffnen · Overlays in OBS neu laden · Ganz beenden.
* **Brücke zur Steuerseite:** `window.castApp` (`desktop/scripts/page_bridge.js`) spricht nur über DOM-Ereignisse mit einer
  isolierten Skript-Welt (`app_bridge.js`), die den `QWebChannel` zu Python hält. Eingebettete fremde Seiten erreichen Python nicht.
* **Eine Instanz / Update-Ablösung:** `QLocalServer` – ein zweiter Start holt das Fenster nach vorn. Läuft eine **ältere**
  Version (auch 1.x), wird sie über `/api/ping` erkannt und über `/api/beenden` beendet (den Namen versteht jede Version; neu heißt er `/api/quit`); eine ältere löst nie eine neuere ab.
* **Ohne Fenster:** `Casting-App --no-window` (Alias `--ohne-fenster`) startet nur den Server.
* **Leistung:** Grafikbeschleunigung an (Ausweg `--no-gpu` / `--ohne-gpu`), keine Hintergrund-Drosselung
  (Chromium-Schalter in `desktop/app.py`), PyInstaller-Ordner statt Einzeldatei (kein Entpacken bei jedem Start).

### Zwei Sprachen: App und Overlays (unabhängig)

| | Wo | Wie |
|---|---|---|
| **Sprache der App** | `settings.json` → `app_language` (plus `localStorage`, damit schon der erste Bildaufbau stimmt) | Die Texte im Code bleiben deutsch. `web/i18n.js` übersetzt auf Englisch alles Sichtbare beim Anzeigen (Textknoten, `title`/`placeholder`/`aria-label`, `alert`/`confirm`/`prompt`, auch später entstehende Elemente per `MutationObserver`) mit dem Wörterbuch `web/lang-en.js`; `{}` steht für eingesetzte Werte. Tray und Dialoge: `casting_app/texts.py`. |
| **Sprache der Overlays** | im Zustand (`overlayLanguage`) – OBS bekommt sie mit | `OVERLAY_TEXTS` (Standardwerte der Überschriften) und `OVERLAY_WORDS` (Wörter, die das Overlay selbst schreibt) in `web/cast-core.js`. Beim Wechsel tauschen nur Texte, die noch auf dem Standard der alten Sprache stehen. |

Neuer sichtbarer Text in der Steuerseite → Eintrag in `web/lang-en.js` ergänzen; `tests/test_control_page.py` öffnet die
Steuerseite auf Englisch, klickt alle Knöpfe und meldet jeden deutschen Rest.

### Ton im App-Fenster – was geht und was nicht

| | Wie | Zuverlässigkeit |
|---|---|---|
| **Aus/An** | `QWebEnginePage.setAudioMuted()` für die ganze Seite | gilt für **alles** im Fenster, auch fremde iframes in eigenen Prozessen (VDO.Ninja, YouTube/Twitch-Clips, DACH CS) |
| **Lautstärke** | Qt hat keine Lautstärke je Seite. `desktop/scripts/volume.js` läuft in **jedem** Rahmen (vor dessen Skripten) und multipliziert die Lautstärke aller `<video>`/`<audio>` und aller Web-Audio-Ausgaben mit einem Faktor. Neue Rahmen fragen den Faktor per `postMessage` bei der Steuerseite ab, bestehende aktualisiert Python über `QWebEngineFrame.runJavaScript()` | wirkt in eigenen und fremden Seiten; die Seiten lesen weiter ihre eigenen Werte (VDO.Ninja-iframe-API, YouTube-Player bleiben bedienbar) |
| **Grenzen** | Medien in einem Shadow-DOM, die ohne Skript-`play()` und ohne `volume`-Zugriff starten, und `new MediaElementAudioSourceNode()` werden nicht erfasst | dort hilft **Aus** (wirkt immer) |

In der Desktop-App bekommt die Vorschau 100 % (der Faktor gilt danach für alles gleich); im normalen Browser regelt sie wie
bisher selbst. Der Ton für OBS (obs-websocket: Lautstärke, Stumm, Verzögerung, Abhören) ist unverändert.

### Geheimnisse

FACEIT-Key, DACH-CS-Nutzer-ID und -Key liegen **nur im Schlüsselbund des Systems** (Paket `keyring`: Windows-Anmeldeinformations-
verwaltung, macOS-Schlüsselbund, Linux Secret Service/KWallet), Dienstname „Casting-App“. Es gibt keine Geheimnis-Dateien.
Ohne Schlüsselbund (manche Linux-Systeme) bietet die App einen Passwort-Tresor an (`password_vault.py`: Schlüssel per scrypt
aus dem Passwort, Inhalt AES-GCM; das Passwort wird nie gespeichert) – sonst gelten sie nur für die laufende Sitzung. Eine
„verschlüsselte“ Datei mit danebenliegendem Schlüssel wäre nur scheinbar sicher und gibt es deshalb nicht. Auch das
**OBS-Passwort** liegt im Schlüsselbund; die obs-websocket-Anmeldung rechnet der Server aus (`/api/obs-auth`). Sie stehen nie im Zustand, im Log, in Exporten oder API-Antworten (`/api/dach-access` meldet nur
`idSet`/`keySet`). Dateien aus 1.x (`faceit.schluessel`, `dach.schluessel` per DPAPI bzw. Base64, `dach.json`) werden beim
ersten Start einmalig in den Schlüsselbund übernommen und gelöscht (DPAPI direkt über die Windows-API, ohne PowerShell).

## Aus dem Quellcode starten

```
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -e ".[test]"                          # Python 3.11+
python -m casting_app                             # Desktop-App (Fenster + Server)
python -m casting_app --no-window                 # nur der Server
```

In OBS eine Browserquelle mit `http://localhost:8787/overlay.html` (1920 × 1080) anlegen – oder in der App
Setup → Szenen & OBS → „In OBS anlegen“.

## Bauen

```
pip install -e ".[build]"
python tools/build.py        # baut für das laufende System nach dist/ (Teilschritte: app, package)
```

| System | Ergebnis |
|---|---|
| Windows | `Casting-App-<v>-Setup.exe` (NSIS, ohne Adminrechte) und `Casting-App-<v>-windows-portable.zip` – 29-Symbol, Versionsinfo |
| Linux | `Casting-App-<v>-linux-x86_64.AppImage` |
| macOS | `Casting-App-<v>-mac-arm64.dmg/.zip` bzw. `…-mac-x64.dmg/.zip` (je nach Mac), ad-hoc signiert |

`tools/build.py` prüft vorher, dass die Version in `casting_app/version.py`, `pyproject.toml` und `web/cast-core.js` gleich ist.
Windows braucht NSIS (`makensis`). Die portable Version ist ein zip mit Ordner: PyInstaller als Einzeldatei müsste die ~200 MB
von Qt WebEngine bei jedem Start erst entpacken.

* **Windows signieren:** kostenlos über die SignPath Foundation (Open Source) – Einrichtung in
  [tools/signpath/README.md](tools/signpath/README.md); danach signiert die CI `Casting-App.exe` und den Installer selbst.
  Alternativ mit eigenem Zertifikat: `WINDOWS_CERTIFICATE` (Pfad zur .pfx) und `WINDOWS_CERTIFICATE_PASSWORD` setzen (signtool).
* **macOS:** ohne Apple-Konto ad-hoc signiert. Notarisierung ist vorbereitet, aber aus: `MAC_NOTARIZE=1` plus
  `MAC_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_APP_PASSWORD`, `APPLE_TEAM_ID` (gehärtete Laufzeit, `build/entitlements.mac.plist`).

**GitHub Actions** (`.github/workflows/build.yml`): jeder Push baut für Windows, Linux, macOS Apple Silicon und Intel
(Artefakte je System) und führt unter Linux und Windows alle Tests aus (Windows zusätzlich: echtes DPAPI, Anmeldeinformations-
verwaltung, Installer still installieren/starten/deinstallieren). **Release:** Actions → Bauen → „Run workflow“ auf `main` mit
„Release erstellen“ – der Workflow legt den Tag `v<Version>` an und lädt alle Dateien hoch (oder einen passenden Tag pushen).

## Tests

```
pip install -e ".[test]" && python -m playwright install chromium
python -m pytest                 # Schlüsselbund, Server und Desktop-App (Linux ohne Bildschirm: xvfb-run -a python -m pytest)
```

Die Live-Tests steuern die laufende App – vorher `QTWEBENGINE_REMOTE_DEBUGGING=9222 python -m casting_app` starten
(oder nur `python -m casting_app --no-window`; `memory.py` braucht das Fenster). Jedes Skript endet bei einem Problem
mit Fehlercode 1; Details in [tests/live/README.md](tests/live/README.md):

```
python tests/live/transitions.py         # alle Szenen × alle Übergangsarten
python tests/live/flicker.py [art]       # Bild für Bild: kein Aufblitzen bei Szenenwechseln
python tests/live/fast_switching.py      # schnelle Wechsel (auch DACH CS), Ton über ein nachgebautes OBS
python tests/live/memory.py [runden]     # lange Sitzung im App-Fenster: Speicher bleibt stabil
python tests/live/cs2_simulation.py      # schickt simulierte CS2-Spielstände an die App
```
