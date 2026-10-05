# Casting-App – Leitfaden für Claude Code

Windows-App (läuft auch unter Linux/macOS) zum Casten von CS2-Matches mit OBS. Ein Node-Server liefert die
Steuerseite und die Overlays aus; OBS zeigt alles in **einer** Browserquelle (`overlay.html`).
Nutzer: Julius (Twitch 29_THE_P4TCH3R), castet DACH CS Masters, ESEA, Uniliga. **Oberfläche, Texte und
Code-Kommentare auf Deutsch.**

## Aufbau
- `server.js` – Node-HTTP-Server (Port 8787, nur localhost). Zustand, SSE-Live-Verbindung (`/api/ereignisse`),
  Bilder, FACEIT-Weiterleitung (Schlüssel per DPAPI verschlüsselt, nie herausgegeben), CS2-GSI (lokal + Port 8788
  mit Token), DACH-CS-Weiterleitung `/dach/<seite>` (ID/Key verschlüsselt), App-Fenster (Edge `--app`), Update-Ablösung.
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
- Geheimnisse (FACEIT-Key, DACH-Key) **nie** in Zustand, Log, Exporte oder Antworten schreiben.
- Leistung zählt (läuft in OBS): keine Filter auf großen Flächen, Zeichnen nur bei Änderung (`neuNoetig`), keine Endlos-Animationen im Leerlauf.
- Stream-Overlays dürfen keine Bedien-Hinweise zeigen – Hinweise nur in der Vorschau (`body.still`).
- Nach Änderungen an Übergängen: `tests/test_uebergaenge.py` und `tests/test_blitze.py` müssen sauber bleiben.

## Befehle
- Starten: `node server.js`
- Bauen: `node tools/bauen.js [win|linux|mac-x64|mac-arm64]` → `dist/`
- Szenen neu erzeugen: `python3 tools/szenen_erzeugen.py`

## Geplant
- Echte Desktop-App mit Electron (eigenes Fenster mit Nachfrage vor dem Schließen, volle Tonkontrolle im
  App-Fenster, Tray, eine Instanz, Windows/Linux/macOS) – die Overlays in OBS bleiben unverändert.
- Konzept 3 vollständig umsetzen: Match-Stepper + Spieltag, Turnier-Phasen, Teams-Vorstellung, Fernsteuerung (Touch Portal).
- DACH-Rahmen für Duocam/Interaktion/Interview exakt vermessen (Screenshots vom Nutzer).
