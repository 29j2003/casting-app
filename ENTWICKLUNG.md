# Casting-App – Handbuch für Änderungen

Dieses Handbuch erklärt, wie die App aufgebaut ist und wie man typische Änderungen macht, Schritt für Schritt.
Für Nutzer der App gibt es [LIESMICH.md](LIESMICH.md). Alles für Entwickler steht hier – auch Tests, Bauen, Signieren und Release.

**Regel für alle Änderungen:** Namen im Code sind englisch (Variablen, Funktionen, CSS-Klassen, IDs, Dateien,
JSON-Felder). Texte, die Nutzer sehen, sind deutsch und bekommen eine englische Übersetzung (siehe [Texte](#texte-und-sprachen)).

## Inhalt
- [So hängt alles zusammen](#so-hängt-alles-zusammen)
- [Einrichten, starten, testen](#einrichten-starten-testen)
- [Rezepte für häufige Änderungen](#rezepte-für-häufige-änderungen)
- [Texte und Sprachen](#texte-und-sprachen)
- [Gespeicherte Daten ändern](#gespeicherte-daten-ändern)
- [Technische Details](#technische-details)
- [Bauen und signieren](#bauen-und-signieren)
- [Version und Release](#version-und-release)
- [Fehlersuche](#fehlersuche)
- [Worauf man achten muss](#worauf-man-achten-muss)

## So hängt alles zusammen

```
             ┌──────────── Python (casting_app/) ────────────┐
             │  desktop/   Fenster, Tray, eine Instanz         │
 App-Fenster │  server/    HTTP-Server localhost:8787          │◄── CS2 (Game State Integration)
 (Qt)  ────► │             /api/…  Zustand, Bilder, Geheimnisse│
             └──────────────┬───────────────▲─────────────────┘
                            │ liefert web/  │ POST /api/state
            Server-Sent     ▼               │
            Events    ┌──────────┐    ┌─────┴───────┐
           (state,    │ Overlays │◄───│ Steuerseite │  web/control.html
            live …)   │ in OBS   │    │  (Z, send())│
                      └──────────┘    └─────────────┘
                 web/overlay.html + broadcast.js + cast.js
```

* **Der Zustand `Z`** ist alles, was eine Sendung ausmacht: Teams, Texte, Szene, Einblendungen, Turnier, Theme …
  Standardwerte und alle Felder stehen in `web/cast-core.js` (`DEFAULT`). Die Steuerseite ändert `Z` und ruft `send()` auf.
  `send()` schickt `Z` an den Server (`POST /api/state`), und der Server verteilt es per Server-Sent Events
  (`/api/events`) an alle Overlays. Die Overlays zeichnen mit `web/cast.js` neu – aber nur, was sich geändert hat.
* **Ein Overlay für alles:** OBS hat eine Browserquelle `overlay.html`. `web/broadcast.js` lädt dort die Szenen
  (`web/<scene>.html`) und macht die Übergänge. Teile, die in beiden Szenen vorkommen (`data-part`), bleiben stehen
  oder gleiten an ihren neuen Platz.
* **CS2-Livedaten:** CS2 schickt Spielstände an `/api/gsi`. `server/game_state.py` fasst sie zusammen und schickt sie
  als Ereignis `live` an die Overlays (höchstens fünfmal pro Sekunde).
* **Geheimnisse** (FACEIT-Key, DACH-CS-Zugang, OBS-Passwort) liegen nur im Schlüsselbund des Systems und nur der
  Server liest sie (`secret_store.py`). Die Webseiten können sie setzen oder löschen, aber nie lesen.
* **Einstellungen der App** (Sprache, Update-Suche) liegen in `settings.json` (`casting_app/settings.py`) – getrennt
  vom Zustand der Sendung.

| Wo | Was |
|---|---|
| `casting_app/__main__.py` | Start (Desktop-App oder `--no-window`) |
| `casting_app/server/app_server.py` | jede Anfrage: Sicherheitsprüfung, alle `/api`-Routen, Dateien |
| `casting_app/desktop/` | Fenster, Tray, Brücke `window.castApp`, Ton im App-Fenster |
| `web/control.html` | Steuerseite (CSS, HTML, JavaScript in einer Datei; Lageplan im Kopf des `<script>`) |
| `web/cast-core.js` | gemeinsamer Kern: Standardzustand, Übertragung, Turnier-Logik, Overlay-Texte |
| `web/cast.js` | Zeichnen aller Overlay-Teile |
| `web/broadcast.js` | Szenenwechsel und Übergänge in `overlay.html` |
| `web/themes.js` | die mitgelieferten Themes |
| `web/<scene>.html` | Szenen – **erzeugt** von `tools/generate_scenes.py` |
| `web/i18n.js`, `web/lang-en.js`, `casting_app/texts.py` | Sprache der App (Deutsch/Englisch) |
| `web/legacy.js`, `casting_app/legacy.py` | Übernahme alter Daten (Version 2.1 und älter) |
| `tests/` | pytest-Tests; `tests/live/` Skripte gegen die laufende App |

Große Dateien haben oben einen Kopfkommentar mit ihrem Aufbau. In `web/control.html` und `web/cast-core.js` sind die
Abschnitte mit `/* ---------- Name ---------- */` markiert – danach suchen.

## Einrichten, starten, testen

```
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -e ".[test]" && python -m playwright install chromium
python -m casting_app                             # Desktop-App
python -m casting_app --no-window                 # nur der Server (Overlays in OBS, Steuerseite im Browser)
```

Die Dateien in `web/` liest der Server bei jeder Anfrage neu. Nach einer Änderung dort reicht ein Neuladen der Seite.
Am bequemsten ist die Steuerseite im normalen Browser (`http://localhost:8787/control.html`, F5); das App-Fenster
lädt sie beim nächsten Start neu. Änderungen an Python brauchen einen Neustart der App.

| Test | Wann |
|---|---|
| `python -m pytest` (Linux ohne Bildschirm: `xvfb-run -a python -m pytest`) | nach jeder Änderung – dauert etwa 1,5 Minuten |
| `tests/live/transitions.py`, `tests/live/flicker.py` | nach Änderungen an Szenen, Übergängen, `broadcast.js` |
| `tests/live/fast_switching.py`, `tests/live/memory.py` | nach Änderungen an Ton, DACH CS oder größeren Umbauten |

Die CI (`.github/workflows/build.yml`) führt bei jedem Push alles aus und baut die App für Windows, Linux und macOS.

### Live-Tests (`tests/live/`)

Diese Skripte steuern eine **laufende** App und prüfen, was die Overlays wirklich zeigen – Bild für Bild, über viele
schnelle Klicks und über lange Sitzungen. Jedes gibt am Ende `OK: …` oder `PROBLEM: …` aus und endet bei einem Problem
mit Fehlercode 1. Vorher die App starten (unter Linux als root zusätzlich `QTWEBENGINE_DISABLE_SANDBOX=1`):

```
QTWEBENGINE_REMOTE_DEBUGGING=9222 python -m casting_app
```

| Skript | Prüft |
|---|---|
| `transitions.py` | jede Szene mit jeder Übergangsart: danach genau eine Szene, alles sichtbar, Stinger weg |
| `flicker.py [art]` | Bild für Bild während eines Wechsels: nichts blitzt auf, flackert oder verschwindet kurz |
| `fast_switching.py` | schnelle Klicks (eigene Szenen und DACH CS – Offiziell), Ton-Regler an ein nachgebautes OBS, Schließen-Frage |
| `memory.py [runden]` | lange Sitzung im App-Fenster: Speicher, DOM und Listener wachsen nicht |
| `cs2_simulation.py [url] [runden]` | kein Test – schickt simulierte CS2-Spielstände, um die Live-Statistik ohne CS2 auszuprobieren |

Gemeinsames liegt in `tests/live/common.py` (Adressen, Szenenliste, Öffnen von Steuerseite und Overlay). `cdp.py` ist ein
kleiner DevTools-Client für das App-Fenster, denn Playwright kann sich nicht an Qt WebEngine hängen.

Besonders hilfreich: `tests/test_control_page.py` klickt jeden Knopf der Steuerseite, lädt jede Szene, prüft
jede Einblendung im Overlay und öffnet die Steuerseite auf Englisch. Ein Tippfehler in einem Namen fällt dort sofort auf.

## Rezepte für häufige Änderungen

### Einen festen Text im Overlay ändern (z. B. „PAUSE“)
1. `web/cast-core.js` → `OVERLAY_TEXTS`: den Text in `de` **und** `en` ändern.
2. Fertig. Wer den Text schon selbst geändert hat (Setup → Überschriften), behält seinen eigenen.

Wörter, die das Overlay selbst schreibt (Turnierrunden, „Freilos“, Hinweise in der Vorschau), stehen daneben in `OVERLAY_WORDS`.

### Ein neues Feld für die Sendung (etwas, das man in der Steuerseite einträgt und das im Overlay erscheint)
1. **Standardwert:** in `web/cast-core.js` → `DEFAULT`, z. B. `texts: { …, subtitle: "" }`. Ältere gespeicherte
   Stände bekommen ihn beim Laden automatisch dazu.
2. **Eingabe:** in `web/control.html` an passender Stelle
   `<label>Untertitel<input type="text" data-field="texts.subtitle"></label>`.
   `data-field` verbindet das Feld automatisch mit `Z` (Abschnitt „Felder“). Für Zahlen `data-kind="number"`,
   für Haken `data-kind="bool"`, für mehrzeilige Listen `data-kind="list"`.
3. **Anzeige:** ein Element mit `data-t="texts.subtitle"` in der Szene zeigt den Text automatisch an
   (die Szene wird erzeugt, also in `tools/generate_scenes.py` einbauen, siehe nächstes Rezept). Was mehr als Text
   braucht, zeichnet eine Funktion in `web/cast.js`.
4. **Übersetzung** des neuen Beschriftungstexts in `web/lang-en.js`.

### Eine Szene ändern oder eine neue Szene anlegen
Die Dateien `web/<scene>.html` werden erzeugt – nie von Hand ändern.
1. `tools/generate_scenes.py`: die Szene mit den Bausteinen dort zusammensetzen (`box`, `cam`, `title_box`,
   `sponsor` …; Positionen in Pixeln auf 1920 × 1080; `data-part` = gleicher Name in mehreren Szenen → das Teil bleibt
   beim Wechsel stehen).
2. `python3 tools/generate_scenes.py` ausführen.
3. Nur für eine **neue** Szene, in `web/control.html`:
   * `OVERLAY_SCENES` (Schlüssel = Dateiname ohne `.html`, Name zum Anzeigen)
   * `SCENE_DEFAULT` (wo sie in der Reihenfolge im Reiter Live steht)
   * `<select id="scene">` (Auswahl der Vorschau)
   * den Namen in `web/lang-en.js` übersetzen.
4. Neue Szene auch in `tests/live/common.py` → `SCENES` eintragen; dann `tests/live/transitions.py` und `flicker.py` laufen lassen.

### Eine neue Einblendungsart
1. `web/cast-core.js` → `GFX_DEFAULT_POS`: Art und Standardposition.
2. `web/cast.js` → `gfxContent()`: was die Einblendung zeigt.
3. `web/cast.css`: Aussehen als `.gfx-<art>`. Die Position kommt von `.pos-…`.
4. `web/control.html`:
   * `GFX_NAMES` (Name in der Liste)
   * ein Knopf `<button class="button" data-gfx-new="<art>">+ Name</button>`
   * eigene Eingabefelder im Abschnitt „Einblendungen“ (`x.type === "<art>"`).
5. Übersetzungen in `web/lang-en.js`. `tests/test_control_page.py` prüft die neue Art im Overlay automatisch mit,
   sobald eine Einblendung dieser Art im Standardzustand steht.

### Ein neues Theme (Liga-Design)
1. `web/themes.js`: einen Eintrag nach dem Muster der anderen. Die Felder sind oben in der Datei erklärt.
2. Logos und Bilder nach `web/media/themes/`, im Theme mit `media/themes/…` angeben.
3. Der Name erscheint in der Steuerseite; für die englische Ansicht in `web/lang-en.js` übersetzen.

### Eine neue Server-Route (`/api/…`)
1. `casting_app/server/app_server.py` → `_api_routes()`: eine Zeile `"/api/<name>": ("POST", self._api_<name>)`
   (Methode `None` = jede), die Arbeit in einer eigenen Methode `_api_<name>(self, request, query)`.
   Die Sicherheitsprüfung (nur dieser PC, nur eigene Seiten) läuft schon vorher für jede Anfrage.
2. Antworten mit `request.send_json(status, {...})`, englische Feldnamen. Fehlertexte für Nutzer sind deutsch
   (`{"error": "…"}`) und kommen mit Übersetzung in `web/lang-en.js`.
3. Test in `tests/test_server.py`.
4. Geheimnisse nie zurückgeben – nur melden, **ob** etwas gespeichert ist.

### Eine neue Einstellung der App (gehört zur App, nicht zur Sendung)
1. `casting_app/settings.py`: Standardwert in `DEFAULTS`, Prüfung in `update()`.
2. Die Steuerseite liest und schreibt sie über `/api/app-settings`. Die Oberfläche steht unter ⚙ App-Einstellungen
   in `web/control.html` (Abschnitt „App-Einstellungen (Update-Suche) …“).
3. Soll Python sofort reagieren: `settings.listeners` (Beispiel: der Tray folgt der App-Sprache, `desktop/app.py`).

## Texte und Sprachen

Es gibt zwei unabhängige Sprachen: die **Sprache der App** und die **Sprache der Overlays**.

| Text | Wo er steht | Englisch |
|---|---|---|
| Steuerseite (Beschriftungen, Meldungen, Dialoge) | deutsch direkt in `web/control.html` | `web/lang-en.js` (deutscher Text → englischer) |
| Python (Tray, Fenster-Dialoge, Startfehler) | `casting_app/texts.py` | daneben im selben Eintrag |
| feste Texte im Overlay | `OVERLAY_TEXTS`/`OVERLAY_WORDS` in `web/cast-core.js` | daneben (`en`) |

So funktioniert die Steuerseite auf Englisch: `web/i18n.js` ersetzt beim Anzeigen jeden bekannten deutschen Text
durch den englischen. Das gilt auch für alles, was später per Skript entsteht. `{}` im Wörterbuch steht für einen
eingesetzten Wert, z. B. `"Theme „{}“ gelöscht": "Theme “{}” deleted"`.
Ein vergessener Eintrag ist nicht schlimm, der Text bleibt dann deutsch. `tests/test_control_page.py` meldet aber
jeden deutschen Rest in der englischen Ansicht.

**Werte, mit denen der Code rechnet oder vergleicht, nie aus sichtbarem Text ableiten.** Beispiel: Die Karten der
Steuerseite haben einen festen Schlüssel `data-area="…"`, nicht ihren Titel.

## Gespeicherte Daten ändern

Gespeichert werden:
* **auf dem PC** (Datenordner: Windows `%APPDATA%\Casting-App`, sonst `~/.casting-app`):
  - `state.json` – der Zustand
  - `settings.json`, `gsi.json`, `window.json`
  - `images/`, `app-window/` (Browserspeicher des Fensters)
  - `log.txt`
* **im Browser der Steuerseite:** der Zustand, die Oberfläche (`ui`) sowie Datenbanken für Bilder und Sitzungen.
* **in Dateien der Nutzer:** Sicherungen (`.json`) und Theme-Exporte.

Wer ein Feld umbenennt oder einen gespeicherten Wert ändert, muss dafür sorgen, dass alte Daten weiter laden:
* **Neue Felder** sind unproblematisch: Der Standardwert aus `DEFAULT` wird beim Laden ergänzt.
* **Umbenennungen** brauchen eine Übernahme. Die Tabelle alter Namen in `web/legacy.js` (zwischen `/*BEGIN*/` und `/*END*/`)
  nutzen sowohl die Steuerseite als auch `casting_app/legacy.py`. Neue Einträge per Skript in die JSON-Tabelle schreiben
  und einen Fall in `tests/test_legacy.py` ergänzen.

## Technische Details

* **Schließen:** `closeEvent` wird ignoriert, die Steuerseite zeigt sofort ihren eigenen Dialog
  (Ganz beenden · Nur Fenster schließen · Abbrechen). Bestätigt die Seite nicht binnen 1 s, fragt ein Systemdialog.
  „Nur Fenster schließen“ versteckt das Fenster; das Tray-Symbol bietet Öffnen · Overlays in OBS neu laden · Ganz beenden.
* **Brücke zur Steuerseite:** `window.castApp` (`desktop/scripts/page_bridge.js`) spricht nur über DOM-Ereignisse mit einer
  isolierten Skript-Welt (`app_bridge.js`), die den `QWebChannel` zu Python hält. Eingebettete fremde Seiten erreichen Python nicht.
* **Eine Instanz / Update-Ablösung:** `QLocalServer` – ein zweiter Start holt das Fenster nach vorn. Läuft eine **ältere**
  Version (auch 1.x), wird sie über `/api/ping` erkannt und über `/api/beenden` beendet (den Namen versteht jede Version;
  neu heißt er `/api/quit`). Eine ältere Version löst nie eine neuere ab.
* **Alte Adressen** aus 2.1 und älter leitet der Server weiter (`/steuerung.html`, `/spieler.html`, `/medien/…`); eine noch
  offene Seite der alten Version (z. B. in OBS) lädt sich einmal neu.
* **Leistung:** Grafikbeschleunigung an (Ausweg `--no-gpu`), keine Hintergrund-Drosselung (Chromium-Schalter in
  `desktop/app.py`), PyInstaller-Ordner statt Einzeldatei (kein Entpacken der ~200 MB Qt WebEngine bei jedem Start).

### Ton im App-Fenster

| | Wie | Reichweite |
|---|---|---|
| **Aus/An** | `QWebEnginePage.setAudioMuted()` für die ganze Seite | gilt für **alles** im Fenster, auch fremde iframes (VDO.Ninja, YouTube/Twitch-Clips, DACH CS) |
| **Lautstärke** | Qt hat keine Lautstärke je Seite. `desktop/scripts/volume.js` läuft in **jedem** Rahmen und multipliziert die Lautstärke aller `<video>`/`<audio>` und Web-Audio-Ausgaben mit einem Faktor. Neue Rahmen fragen ihn per `postMessage` ab, bestehende setzt Python über `runJavaScript()` | wirkt in eigenen und fremden Seiten |
| **Grenzen** | Medien in einem Shadow-DOM ohne Skript-`play()` und `new MediaElementAudioSourceNode()` werden nicht erfasst | dort hilft **Aus** |

Der Ton für OBS (obs-websocket: Lautstärke, Stumm, Verzögerung, Abhören) ist davon unabhängig.

### Geheimnisse

FACEIT-Key, DACH-CS-Nutzer-ID und -Key und das OBS-Passwort liegen **nur im Schlüsselbund des Systems** (Paket `keyring`:
Windows-Anmeldeinformationsverwaltung, macOS-Schlüsselbund, Linux Secret Service/KWallet), Dienstname „Casting-App“.
Ohne Schlüsselbund bietet die App einen Passwort-Tresor an (`password_vault.py`: Schlüssel per scrypt aus dem Passwort,
Inhalt AES-GCM; das Passwort wird nie gespeichert) – sonst gelten sie nur für die laufende Sitzung. Eine „verschlüsselte“
Datei mit danebenliegendem Schlüssel wäre nur scheinbar sicher und gibt es deshalb nicht.

* Nur der Server liest sie (`SecretStore.get()`); die Webseiten können sie setzen oder löschen, aber nie lesen
  (`/api/dach-access` meldet nur `idSet`/`keySet`). Die obs-websocket-Anmeldung rechnet der Server aus (`/api/obs-auth`).
* Sie stehen nie im Zustand, im Log, in Exporten, in Dateien, in Adressen (URLs) oder in API-Antworten.
* Dateien aus 1.x (`faceit.schluessel`, `dach.schluessel` per DPAPI bzw. Base64, `dach.json`) werden beim ersten Start
  einmalig in den Schlüsselbund übernommen und gelöscht.
* Im Repository liegen keine Zugangsdaten. Die CI liest den SignPath-Token nur aus den GitHub-Secrets.
* **Grenzen:** DACH CS nimmt ID und Key nur als URL-Parameter an. `/dach/<page>` leitet deshalb mit beiden weiter
  (`no-store`, `no-referrer`, nicht geloggt); die Adresse steht danach im iframe in OBS bzw. im App-Fenster.
  Der Server prüft Adresse, Host, `Origin` und `Sec-Fetch-Site`, aber kein Passwort: Ein Programm auf **diesem PC**, das
  Browser-Kopfzeilen fälscht, käme an `/dach/…` und `/api/obs-auth`. Programme unter demselben Nutzerkonto können
  ohnehin den Schlüsselbund lesen – dagegen schützt keine App.
* Die Vorschau bekommt Zustand und Live-Daten per `postMessage(…, location.origin)` – nie eine fremde Seite.
* FACEIT-Abfragen folgen keiner Weiterleitung (der Key ginge sonst an den Ziel-Host mit).

## Bauen und signieren

```
pip install -e ".[build]"
python tools/build.py        # baut für das laufende System nach dist/ (Teilschritte: app, package)
```

| System | Ergebnis |
|---|---|
| Windows | `Casting-App-<v>-Setup.exe` (NSIS, ohne Adminrechte) und `Casting-App-<v>-windows-portable.zip` |
| Linux | `Casting-App-<v>-linux-x86_64.AppImage` |
| macOS | `Casting-App-<v>-mac-arm64.dmg/.zip` bzw. `…-mac-x64.dmg/.zip` (je nach Mac), ad-hoc signiert |

Windows braucht NSIS (`makensis`). Die CI baut bei jedem Push für alle vier Systeme (Artefakte je System) und testet unter
Linux und Windows (Windows zusätzlich: echtes DPAPI, Anmeldeinformationsverwaltung, Installer still installieren, starten,
deinstallieren).

* **macOS:** ohne Apple-Konto ad-hoc signiert. Notarisierung ist vorbereitet, aber aus: `MAC_NOTARIZE=1` plus
  `MAC_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_APP_PASSWORD`, `APPLE_TEAM_ID` (gehärtete Laufzeit, `build/entitlements.mac.plist`).
* **Windows mit eigenem Zertifikat:** `WINDOWS_CERTIFICATE` (Pfad zur .pfx) und `WINDOWS_CERTIFICATE_PASSWORD` setzen (signtool).
* **Windows mit SignPath** (kostenlos für Open Source, entfernt die SmartScreen-Warnung) – einmal einrichten:
  1. Voraussetzungen: Repository öffentlich, OSI-anerkannte Lizenz (The Unlicense ✓), Bau nur in GitHub Actions (✓).
  2. Bei <https://signpath.org/apply> bewerben.
  3. Nach der Zusage im SignPath-Konto: Projekt `casting-app` mit GitHub als Build-Quelle, zwei Artifact Configurations
     `app-folder` und `installer` (Inhalt: die Dateien in `tools/signpath/`), eine Signing Policy, z. B. `release-signing`.
  4. Im GitHub-Repository (Settings → Secrets and variables → Actions): Secret `SIGNPATH_API_TOKEN`, Variablen
     `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_SIGNING_POLICY_SLUG`.

  Danach signiert der Windows-Bau in zwei Runden: `build.py app` → `Casting-App.exe` signieren → `build.py package` →
  Installer signieren. Ohne Secret wird unsigniert gebaut. Laut den Bedingungen muss dann in der README stehen:
  „Free code signing provided by SignPath.io, certificate by SignPath Foundation“.

## Version und Release

1. Die Version an drei Stellen gleich setzen:
   - `casting_app/version.py`
   - `pyproject.toml`
   - `web/cast-core.js` (`VERSION`)

   `tools/build.py` prüft das. Overlays mit einer anderen Version laden sich beim Verbinden neu.
2. Auf `main` mergen.
3. GitHub → Actions → **Bauen** → „Run workflow“ auf `main` mit „Release erstellen“. Der Workflow baut alles,
   testet, legt den Tag `v<Version>` an und lädt die Dateien hoch (Setup.exe, portable Zip, AppImage, dmg/zip).

## Fehlersuche

* **Log-Reiter** in der App, oder `log.txt` im Datenordner (⚙ → Daten & Log öffnen). Blaue Zeilen kommen direkt
  aus den Overlays, z. B. aus OBS.
* **Diagnose im Overlay:** Log-Reiter → „Diagnose in allen Overlays einblenden“. Zeigt Version, Zustand, Bilder und
  Videos direkt in der Browserquelle.
* **Entwicklerwerkzeuge des App-Fensters:** die App mit `QTWEBENGINE_REMOTE_DEBUGGING=9222 python -m casting_app`
  starten und in Chrome/Edge `http://localhost:9222` öffnen.
* **Overlays im normalen Browser:** `http://localhost:8787/overlay.html` oder eine einzelne Szene, z. B.
  `http://localhost:8787/players.html?preview=1`.

## Worauf man achten muss

* **Leistung** – die Overlays laufen in OBS während des Streams:
  - nur neu zeichnen, was sich geändert hat (`newNeeded` in `cast.js`)
  - keine Endlos-Animationen im Leerlauf
  - keine Filter auf großen Flächen
* **Keine Bedien-Hinweise im Stream:** Hinweise für den Bediener nur in der Vorschau (`body.idle`).
* **Overlays ändern sich nicht durch die Desktop-App:** Desktop-Besonderheiten liegen in `casting_app/desktop/` oder
  hinter `window.castApp`.
* **Geheimnisse** nie in Zustand, Log, Exporte, Dateien, URLs oder API-Antworten – und nie ins Repository.
* **Doku:** Nutzer-Anleitung nur in `LIESMICH.md`, alles für Entwickler nur hier. `README.md` ist die kurze Startseite.
