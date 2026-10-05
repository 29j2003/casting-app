# Casting-App

Steuerung und Overlays für CS2-Casts in OBS – eine Programmdatei, eine Browserquelle.
Szenen mit Übergängen, Einblendungen, Themes (u. a. DACH CS – Offiziell), FACEIT-Import, CS2-Livedaten (GSI),
Turnierbaum/Tabellen, Ton-Steuerung über OBS.

Ausführliche Anleitung für Nutzer: [LIESMICH.md](LIESMICH.md)

## Aus dem Quellcode starten

```
node server.js          # Node 20 – öffnet die Steuerung unter http://localhost:8787
```

In OBS eine Browserquelle mit `http://localhost:8787/overlay.html` (1920 × 1080) anlegen – oder in der App
Setup → Szenen & OBS → „In OBS anlegen“.

## Bauen

```
npm install --no-save @yao-pkg/pkg @yao-pkg/pkg-fetch resedit pe-library
node tools/bauen.js                 # alle Systeme → dist/
node tools/bauen.js win             # nur Windows (Casting-App.exe)
```

Jeder Push auf `main` baut automatisch für Windows, Linux und macOS (GitHub Actions → „Bauen“ → Artefakte).
Ein Tag wie `v1.9.7` erzeugt ein Release mit allen Dateien.

## Tests

Die Tests steuern die laufende App per Playwright (`pip install playwright websockets && playwright install chromium`),
vorher `node server.js` starten:

```
python3 tests/test_uebergaenge.py   # alle Szenen × alle Übergangsarten
python3 tests/test_blitze.py        # Bild für Bild: kein Aufblitzen bei Szenenwechseln
python3 tests/test_schnelle_wechsel.py   # schnelle Wechsel, Ton über (nachgebautes) OBS
python3 tests/cs2_simulation.py     # schickt simulierte CS2-Spielstände an die App
```
