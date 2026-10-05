# Live-Tests

Diese Skripte steuern eine **laufende** Casting-App und prüfen, was die Overlays wirklich zeigen. Die Prüfungen
gehen Bild für Bild, über viele schnelle Klicks und über lange Sitzungen. Jedes Skript gibt am Ende `OK: …`
oder `PROBLEM: …` aus und endet bei einem Problem mit Fehlercode 1. Die CI führt alle aus
(`.github/workflows/build.yml`, Job `test`).

Vorher die App starten (unter Linux als root zusätzlich `QTWEBENGINE_DISABLE_SANDBOX=1`):

```
QTWEBENGINE_REMOTE_DEBUGGING=9222 python -m casting_app
```

| Skript | Prüft |
|---|---|
| `transitions.py` | jede Szene mit jeder Übergangsart: danach genau eine Szene, alles sichtbar, Stinger weg |
| `flicker.py [art]` | Bild für Bild während eines Wechsels: nichts blitzt auf, flackert oder verschwindet kurz |
| `fast_switching.py` | schnelle Klicks (eigene Szenen und DACH CS – Offiziell), Ton-Regler an ein nachgebautes OBS, Schließen-Frage |
| `memory.py [runden]` | lange Sitzung im App-Fenster: Speicher, DOM und Listener wachsen nicht (braucht das Fenster mit Port 9222) |
| `cs2_simulation.py [url] [runden]` | kein Test – schickt simulierte CS2-Spielstände, um die Live-Statistik ohne CS2 auszuprobieren |

Gemeinsames liegt in `common.py`: Adressen, Szenenliste, Öffnen von Steuerseite und Overlay. `cdp.py` ist ein
kleiner DevTools-Client für das App-Fenster, denn Playwright kann sich nicht an Qt WebEngine hängen.

**Nach Änderungen an Übergängen oder an `web/broadcast.js`** müssen mindestens `transitions.py` und `flicker.py`
sauber durchlaufen.
