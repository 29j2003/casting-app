# Casting-App

Steuerung und Overlays für CS2-Casts in OBS – eine Desktop-App (Electron) für Windows, Linux und macOS, eine Browserquelle.
Szenen mit Übergängen, Einblendungen, Themes (u. a. DACH CS – Offiziell), FACEIT-Import, CS2-Livedaten (GSI),
Turnierbaum/Tabellen, Ton-Steuerung über OBS.

Ausführliche Anleitung für Nutzer: [LIESMICH.md](LIESMICH.md)

## Aufbau (ab 2.0)

```
Electron-Hauptprozess (electron/main.js)
 ├─ startet server.js im selben Prozess  →  http://localhost:8787  (nur dieser PC)
 │    ├─ /steuerung.html  → im eigenen App-Fenster (BrowserWindow)
 │    ├─ /overlay.html    → in OBS als Browserquelle (unverändert)
 │    └─ Port 8788        → CS2-Livedaten vom Observer-PC (nur mit Schlüssel, aus bis eingeschaltet)
 ├─ Fenster: eine Instanz, Schließen-Dialog, Tray, Ton im App-Fenster
 └─ Tresor für Geheimnisse (safeStorage) → geheimnisse.js
electron/preload.js – Brücke window.castApp (nur Steuerseite) + Lautstärke in allen Rahmen des Fensters
```

* **Schließen:** `close`-Ereignis des Fensters wird abgefangen (`preventDefault`), die Steuerseite zeigt sofort ihren eigenen
  Dialog (Ganz beenden · Nur Fenster schließen · Abbrechen). Antwortet die Seite nicht binnen 1 s, fragt ein Systemdialog.
  „Nur Fenster schließen“ versteckt das Fenster; das Tray-Symbol (29-Logo) bietet Öffnen · Overlays in OBS neu laden · Ganz beenden.
* **Eine Instanz / Update-Ablösung:** `requestSingleInstanceLock` – ein zweiter Start holt das Fenster nach vorn.
  Läuft eine **ältere** Version (auch 1.x ohne Electron), wird sie über `/api/ping` erkannt und über `/api/beenden` beendet.
  Eine ältere Version löst nie eine neuere ab.
* **Ohne Fenster:** `Casting-App --ohne-fenster` (bzw. `npm run ohne-fenster`) startet nur den Server.
  Zum Entwickeln/Testen geht weiter `node server.js` – dann allerdings ohne dauerhaften Tresor (Schlüssel nur für die Sitzung).
* **Leistung:** Grafikbeschleunigung an (Ausweg `--ohne-gpu`), keine Hintergrund-Drosselung
  (`backgroundThrottling: false`, Renderer-/Timer-/Verdeckt-Drosselung aus), Fenster wird angelegt, während der Server startet.

### Ton im App-Fenster – was geht und was nicht

| | Wie | Zuverlässigkeit |
|---|---|---|
| **Aus/An** | `webContents.setAudioMuted()` für das ganze Fenster | gilt für **alles** im Fenster, auch fremde iframes in eigenen Prozessen (VDO.Ninja, YouTube/Twitch-Clips, DACH CS) |
| **Lautstärke** | Electron hat keine Lautstärke je Fenster. Der Preload läuft mit `nodeIntegrationInSubFrames` in **jedem** Rahmen und multipliziert dort in der Seite selbst die Lautstärke aller `<video>`/`<audio>` (Setter von `volume`, `play()`) und aller Web-Audio-Ausgaben (Regler vor `destination`) mit dem gewählten Faktor | wirkt in eigenen und fremden Seiten; die Seiten lesen weiter ihre eigenen Werte (VDO.Ninja-iframe-API, YouTube-Player bleiben unverändert bedienbar) |
| **Grenzen** | Medien in einem Shadow-DOM, die ohne Skript-`play()` und ohne `volume`-Zugriff automatisch starten, und `new MediaElementAudioSourceNode()` per Konstruktor werden nicht erfasst | dort hilft nur **Aus** (das immer wirkt) |

Die Vorschau bekommt in der Desktop-App die Lautstärke 100 % (der Faktor gilt danach für alles gleich); im normalen Browser
regelt sie wie bisher selbst. Der Ton für OBS (obs-websocket: Lautstärke, Stumm, Verzögerung, Abhören) ist unverändert.

### Geheimnisse

FACEIT-Key, DACH-CS-Nutzer-ID und -Key liegen je in einer Datei `*.geheim` im Datenordner, verschlüsselt mit Electron
`safeStorage` (Windows DPAPI, macOS Schlüsselbund, Linux Secret Service/KWallet; ohne Schlüsselbund `basic_text` mit Hinweis im Log).
Sie stehen nie im Zustand, im Log, in Exporten oder API-Antworten (`/api/dach-zugang` meldet nur `idGesetzt`/`keyGesetzt`).
Alte Dateien aus 1.x (`faceit.schluessel`, `dach.schluessel` per DPAPI/PowerShell bzw. Base64, `dach.json`) werden beim ersten
Start einmalig übernommen und gelöscht; nicht lesbare werden in `*.nicht-lesbar` umbenannt.

## Aus dem Quellcode starten

```
npm install             # Node 22 – bringt Electron mit
npm start               # Desktop-App (Fenster + Server)
npm run ohne-fenster    # nur der Server
node server.js          # nur der Server, ohne Electron (Entwicklung/Tests)
```

In OBS eine Browserquelle mit `http://localhost:8787/overlay.html` (1920 × 1080) anlegen – oder in der App
Setup → Szenen & OBS → „In OBS anlegen“.

## Bauen

```
npm install
node tools/bauen.js win      # Windows: dist/Casting-App-Setup-<v>.exe (NSIS) + dist/Casting-App-<v>-portable.exe
node tools/bauen.js linux    # Linux:   dist/Casting-App-<v>-linux-x86_64.AppImage
node tools/bauen.js mac      # macOS:   dist/Casting-App-<v>-mac-{x64,arm64}.{dmg,zip} (nur auf einem Mac)
```

Einstellungen in `electron-builder.config.js`, Symbole in `build/` (29-Logo). `tools/bauen.js` prüft vorher, dass die Version
in `package.json`, `server.js` und `web/cast-kern.js` gleich ist.

* **Windows signieren:** `CSC_LINK` (Pfad/Base64 der .pfx) und `CSC_KEY_PASSWORD` setzen – electron-builder signiert dann
  Installer und App. Ohne Zertifikat bleiben die Dateien unsigniert (SmartScreen-Hinweis beim ersten Start).
* **macOS:** ohne Apple-Konto ad-hoc signiert (`identity: "-"`). Notarisierung ist vorbereitet, aber aus:
  `CAST_NOTARISIEREN=1` plus `CSC_LINK`/`CSC_KEY_PASSWORD` (Developer-ID) und `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`
  schaltet gehärtete Laufzeit (`build/entitlements.mac.plist`) und Notarisierung ein.

**GitHub Actions** (`.github/workflows/bauen.yml`): jeder Push baut für Windows, Linux und macOS (Artefakte je System) und
führt unter Linux alle Tests gegen die laufende Desktop-App aus. Ein Tag wie `v2.0.0` (muss zur Version passen) erzeugt
zusätzlich ein Release mit allen Dateien.

## Tests

```
npm install && pip install playwright websockets && python3 -m playwright install chromium
node tests/test_geheimnisse.js          # Tresor, Übernahme der alten DPAPI-/Base64-Dateien
node tests/test_desktop.js              # echte Desktop-App: Schließen-Dialog, Tray, eine Instanz, Ton, Geheimnisse
                                        # (Linux ohne Bildschirm: xvfb-run -a node tests/test_desktop.js)
```

Die Overlay-Tests steuern die laufende App per Playwright – vorher die App starten
(`npx electron . --remote-debugging-port=9222`, als root zusätzlich `--no-sandbox`; oder nur `node server.js`):

```
python3 tests/test_uebergaenge.py        # alle Szenen × alle Übergangsarten
python3 tests/test_blitze.py [art]       # Bild für Bild: kein Aufblitzen bei Szenenwechseln
python3 tests/test_schnelle_wechsel.py   # schnelle Wechsel, Ton über (nachgebautes) OBS
python3 tests/test_speicher.py [runden]  # lange Sitzung im App-Fenster: Speicher bleibt stabil (braucht --remote-debugging-port=9222)
python3 tests/cs2_simulation.py          # schickt simulierte CS2-Spielstände an die App
```
