# Casting-App – Leitfaden für Claude Code

Desktop-App (Electron, Windows/Linux/macOS) zum Casten von CS2-Matches mit OBS. Ein Node-Server im Electron-Hauptprozess
liefert die Steuerseite (eigenes App-Fenster) und die Overlays aus; OBS zeigt alles in **einer** Browserquelle (`overlay.html`).
Nutzer: Julius (Twitch 29_THE_P4TCH3R), castet DACH CS Masters, ESEA, Uniliga. **Oberfläche, Texte und
Code-Kommentare auf Deutsch.**

## Aufbau
- `electron/main.js` – Electron-Hauptprozess: startet `server.js` (`starten()`), App-Fenster (BrowserWindow mit
  `steuerung.html`), eine Instanz (`requestSingleInstanceLock`), Update-Ablösung (nur neuere löst ältere ab, `/api/ping` +
  `/api/beenden`), Schließen-Dialog (`close` + `preventDefault` → Dialog der Steuerseite, Systemdialog nur als Rückfall),
  Tray (Öffnen · Overlays in OBS neu laden · Ganz beenden), Ton im App-Fenster (`setAudioMuted` + Faktor an alle Rahmen),
  Tresor (`safeStorage`) für `geheimnisse.js`, `--ohne-fenster` (nur Server), `--ohne-gpu`.
- `electron/preload.js` – läuft in **jedem** Rahmen (`nodeIntegrationInSubFrames`): Brücke `window.castApp` nur für die
  Steuerseite (oberster Rahmen, eigene Adresse); Lautstärke-Faktor für `<video>/<audio>` und Web Audio in allen Seiten.
- `server.js` – Node-HTTP-Server (Port 8787, nur localhost), als Modul (`starten`, `beenden`, `overlaysNeuLaden`) oder
  `node server.js` (nur Server, Geheimnisse dann nur für die Sitzung). Zustand, SSE-Live-Verbindung (`/api/ereignisse`),
  Bilder, FACEIT-Weiterleitung, CS2-GSI (lokal + Port 8788 mit Token), DACH-CS-Weiterleitung `/dach/<seite>`.
- `geheimnisse.js` – FACEIT-Key, DACH-CS-ID/-Key verschlüsselt (`*.geheim`), einmalige Übernahme der 1.x-Dateien (DPAPI/Base64).
- `web/steuerung.html` – die komplette Steueroberfläche (HTML/CSS/JS in einer Datei, sehr groß):
  Bereiche Live · Match · Turnier · Setup · Log, Docks, Arbeitsbereiche, Befehlspalette (Strg K), Ton über OBS-WebSocket.
- `web/overlay.html` + `web/sendung.js` – Szenenwechsel in einer Quelle (gemeinsame Teile bleiben/gleiten,
  Übergänge Schnitt/Blende/Schieben/Wischen/Stinger); DACH CS – Offiziell als Vollbild-iframes (3 Rahmen im Wechsel).
- `web/cast.js` – Zeichnen aller Overlay-Teile (Themes, Einblendungen, Live-Stats, Turnier, Ton im Overlay).
- `web/cast-kern.js` – gemeinsamer Kern (Standardzustand, Kanal, Turnier-Logik SE/DE/Swiss/GSL/Tabelle, DACH-Rahmen).
- `web/themes.js` – Themes (Regulär, DACH CS eigener Stil, DACH CS – Offiziell, ESEA, Uniliga).
- `web/<szene>.html` – Szenen-Vorlagen, **erzeugt** von `tools/szenen_erzeugen.py` (dort ändern, dann ausführen).

## Regeln
- **Version** steht in `package.json`, `server.js` und `web/cast-kern.js` – alle drei gleich halten
  (`tools/bauen.js` prüft das). Abweichende Versionen lassen OBS-Overlays neu laden.
- Geheimnisse (FACEIT-Key, DACH-ID und -Key) **nie** in Zustand, Log, Exporte oder Antworten schreiben – nur über `geheim.holen()` im Server.
- IPC im Hauptprozess nur von der Steuerseite annehmen (`vonSteuerseite`); fremde Seiten im Fenster bekommen keine Brücke.
- Overlays in OBS dürfen sich durch die Desktop-App nicht ändern – Electron-Besonderheiten nur in `electron/` bzw. hinter `window.castApp`.
- Leistung zählt (läuft in OBS): keine Filter auf großen Flächen, Zeichnen nur bei Änderung (`neuNoetig`), keine Endlos-Animationen im Leerlauf.
- Stream-Overlays dürfen keine Bedien-Hinweise zeigen – Hinweise nur in der Vorschau (`body.still`).
- Nach Änderungen an Übergängen: `tests/test_uebergaenge.py` und `tests/test_blitze.py` müssen sauber bleiben.
- Nach Änderungen an `electron/`: `tests/test_desktop.js` (unter Linux mit `xvfb-run -a`) muss sauber bleiben.
- `LIESMICH.md` und `web/ANLEITUNG.md` sind dieselbe Anleitung – beide gleich halten.

## Befehle
- Starten: `npm start` (Desktop-App) · `npm run ohne-fenster` · `node server.js` (nur Server, ohne Electron)
- Bauen: `node tools/bauen.js [win|linux|mac]` → `dist/` (electron-builder, Einstellungen in `electron-builder.config.js`)
- Tests: `node tests/test_geheimnisse.js` · `xvfb-run -a node tests/test_desktop.js` · Python-Tests gegen die laufende App
  (`npx electron . --remote-debugging-port=9222`, als root `--no-sandbox`)
- Szenen neu erzeugen: `python3 tools/szenen_erzeugen.py`

## Geplant
- OBS-Passwort (liegt noch im localStorage der Steuerseite) ebenfalls in den Tresor legen.
- Notarisierung für macOS einschalten, sobald ein Apple-Entwicklerkonto da ist; Windows-Signatur mit eigenem Zertifikat.
- Konzept 3 vollständig umsetzen: Match-Stepper + Spieltag, Turnier-Phasen, Teams-Vorstellung, Fernsteuerung (Touch Portal).
- DACH-Rahmen für Duocam/Interaktion/Interview exakt vermessen (Screenshots vom Nutzer).
