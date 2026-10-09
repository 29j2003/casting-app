# Casting-App – Handbuch für Änderungen

Dieses Handbuch erklärt, wie die App aufgebaut ist und wie man typische Änderungen macht, Schritt für Schritt.
Für Nutzer der App gibt es [README.md](../README.md) (Anleitung, Englisch). Alles für Entwickler steht hier – auch Tests, Bauen, Signieren und Release.
Die Kurzfassung der Regeln für den KI-Assistenten Claude Code liegt in `.claude/CLAUDE.md`.

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
| `casting_app/desktop/` | Fenster, Tray, Brücke `window.castApp`, Ton im App-Fenster, H.264-Umleitung (`media.py`) |
| `casting_app/server/media_converter.py` | H.264 → WebM mit FFmpeg für das App-Fenster (`/api/media`) |
| `casting_app/server/dach_match.py` | DACH CS: ist ein Match aktiv? (`/api/dach-match`) |
| `web/control.html` | Steuerseite: Aufbau (Reiter, Karten, Dialoge) |
| `web/control.css` | Steuerseite: Aussehen (Farben als Variablen in `:root`) |
| `web/control/01-core.js` … `13-app.js` | Steuerseite: Logik nach Themen (Lageplan in `01-core.js`); der Server liefert sie verbunden als `/control.js` |
| `web/cast-core.js` | gemeinsamer Kern: Standardzustand, Übertragung, Turnier-Logik, Overlay-Texte |
| `web/cast.js` | Zeichnen aller Overlay-Teile |
| `web/broadcast.js` | Szenenwechsel und Übergänge in `overlay.html` |
| `web/themes.js` | die mitgelieferten Themes |
| `web/<scene>.html` | Szenen – **erzeugt** von `tools/generate_scenes.py` |
| `web/i18n.js`, `web/lang-en.js`, `casting_app/texts.py` | Sprache der App (Deutsch/Englisch) |
| `web/legacy.js`, `casting_app/legacy.py` | Übernahme alter Daten (Version 2.1 und älter) |
| `tests/` | pytest-Tests; `tests/live/` Skripte gegen die laufende App |

Große Dateien haben oben einen Kopfkommentar mit ihrem Aufbau. In `web/control/*.js` und `web/cast-core.js` sind die
Abschnitte mit `/* ---------- Name ---------- */` markiert – danach suchen.

## Einrichten, starten, testen

```
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -e ".[test]" && python -m playwright install chromium
python -m casting_app                             # Desktop-App
python -m casting_app --no-window                 # nur der Server (Overlays in OBS, Steuerseite im Browser)
```

Die Dateien in `web/` liest der Server bei jeder Anfrage neu. Nach einer Änderung dort reicht ein Neuladen der Seite.
Am bequemsten ist die Steuerseite im normalen Browser (⚙ App-Einstellungen → „Steuerseite im Browser öffnen“, dann F5); das App-Fenster
lädt sie beim nächsten Start neu. Änderungen an Python brauchen einen Neustart der App.

| Test | Wann |
|---|---|
| `python -m pytest` (Linux ohne Bildschirm: `xvfb-run -a python -m pytest`) | nach jeder Änderung – dauert etwa 1,5 Minuten |
| `tests/live/transitions.py`, `tests/live/flicker.py`, `tests/live/background.py` | nach Änderungen an Szenen, Übergängen, Hintergrund, `broadcast.js` |
| `tests/live/fast_switching.py`, `tests/live/memory.py` | nach Änderungen an Ton, DACH CS oder größeren Umbauten |

Die CI (`.github/workflows/build.yml`) führt bei jedem Push alles aus und baut die App für Windows, Linux und macOS.
Der schnellste Job `checks` sagt nach unter einer Minute, ob es grundsätzlich passt: keine privaten E-Mail-Adressen,
Python und JavaScript syntaktisch in Ordnung, Szenen-Dateien passen zu `tools/generate_scenes.py`.

### Live-Tests (`tests/live/`)

Diese Skripte steuern eine **laufende** App und prüfen, was die Overlays wirklich zeigen – Bild für Bild, über viele
schnelle Klicks und über lange Sitzungen. Jedes gibt am Ende `OK: …` oder `PROBLEM: …` aus und endet bei einem Problem
mit Fehlercode 1. Vorher die App starten (unter Linux als root zusätzlich `QTWEBENGINE_DISABLE_SANDBOX=1`):

```
python -m casting_app --debug          # DevTools auf 127.0.0.1:9222 (nur mit diesem Schalter)
```

| Skript | Prüft |
|---|---|
| `transitions.py` | jede Szene mit jeder Übergangsart: danach genau eine Szene, alles sichtbar, Stinger weg |
| `flicker.py [art]` | Bild für Bild während eines Wechsels: nichts blitzt auf, flackert oder verschwindet kurz; das Logo wird nie überblendet |
| `background.py` | Bild für Bild: das Hintergrund-Video blendet mit der Szene (Intro ↔ Ingame, Playlist-Wechsel), nie ein Schnitt aufs Theme |
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
3. Nur für eine **neue** Szene:
   * `web/control/…` → `OVERLAY_SCENES` (Schlüssel = Dateiname ohne `.html`, Name zum Anzeigen)
   * `web/control/…` → `SCENE_DEFAULT` (wo sie in der Reihenfolge im Reiter Live steht)
   * `web/control.html` → `<select id="scene">` (Auswahl der Vorschau)
   * den Namen in `web/lang-en.js` übersetzen.
   * Varianten, die erst nach Einschalten erscheinen sollen: `SCENES_OFF` (`web/control/04-obs-scenes.js`).
   * Hat sie den Sponsor in der Leiste (`bottom_cast(…, with_sponsor=True)`): in `SPONSOR_SCENES` (`05-live.js`) und
     `sponsors.sceneList` (`cast-core.js`) eintragen; die Regeln „Sponsor oben rechts / ohne Sponsor“ in `cast.css` greifen
     automatisch für jede Szene mit `.sponsor.in-bar` (außer Intro/Pause/Ende, die eigene Positionen haben).
   * Neue Personen/Kameras: Schlüssel in `Z.caster` und `SLOTS` (`03-match.js`); `cam(…, small=True)` = kleines Namensschild in der Kachel.
4. Neue Szene auch in `tests/live/common.py` → `SCENES` eintragen; dann `tests/live/transitions.py` und `flicker.py` laufen lassen.

### Eine neue Einblendungsart
1. `web/cast-core.js` → `GFX_DEFAULT_POS`: Art und Standardposition.
2. `web/cast.js` → `gfxContent()`: was die Einblendung zeigt.
3. `web/cast.css`: Aussehen als `.gfx-<art>`. Die Position kommt von `.pos-…`.
4. Steuerseite:
   * `web/control/…` → `GFX_NAMES` (Name in der Liste)
   * `web/control.html` → ein Knopf `<button class="button" data-gfx-new="<art>">+ Name</button>`
   * `web/control/…` → eigene Eingabefelder im Abschnitt „Einblendungen“ (`x.type === "<art>"`).
5. Übersetzungen in `web/lang-en.js`. `tests/test_control_page.py` prüft die neue Art im Overlay automatisch mit,
   sobald eine Einblendung dieser Art im Standardzustand steht.

### Schrift und Aufräumen der Steuerseite

* Schrift der Oberfläche: **Inter** (`web/fonts/Inter-*.woff2`, Latin-Teilmenge mit Umlauten, Lizenz `LICENSES/Inter-OFL.txt`) –
  Barlow zeigte unter Windows das „i“ wie ein „l“. Überschriften der Karten bleiben `--title-font` (Rajdhani/Barlow).
* Unterbereiche in einer Karte: `<details class="sub-group"><summary>…</summary><div class="sub-body">…</div></details>` –
  jedes verschachtelte `details` in `.content` wird automatisch zur schlichten Klapp-Zeile (keine Karte in der Karte).
* Lange feste Hilfetexte (`p.small` ohne id, ab 110 Zeichen) zeigt `helpTextsShorten()` (13-app.js) einzeilig mit „…“;
  ein Klick zeigt den ganzen Text. Statusmeldungen haben eine id und bleiben ganz.
* Standard-Anordnung in Live (Vorlagen „Einsteiger“/„Operator“ in `08-navigation.js`): Szenen links (nicht angedockt,
  `sceneList` merkt sich dort als einziger Bereich offen/zu), Ton im Dock unten, der Rest im Dock rechts. Wer eine der
  beiden Vorlagen nutzt, bekommt sie einmal neu angewendet (`ui.layout221`).
* Auswahl vieler Szenen: Kacheln `.scene-pick-chip` (`aria-pressed`) statt Schalter-Reihen (Szenen & OBS, Sponsoren);
  große Matrizen (Szenen-Panels) mit `.cell-check`.

### Icons in der Steuerseite

Knöpfe zeigen SVG-Icons, keine Zeichen wie 🔓 ⧉ ⏻ – die hängen von den Schriften des Systems ab und sahen unter Linux
und Windows unterschiedlich groß aus. Satz und Helfer: `ICONS` / `icon(name)` in `web/control/01-core.js`.
Im HTML `data-icon="name"` (wird beim Laden vorangestellt), im Skript `${icon("name")}`. Knöpfe nur mit Icon brauchen ein
`aria-label` (Bildschirmleser, und es nimmt den Abstand zum Text weg).

### Panel der Szene (Live) – ein neues Feld

Die Karte `data-area="scene-tools"` („Panel der Szene“) zeigt die Felder der Szene im Programm (`sceneNow()` in
`web/control/05-live.js`, auch im Modus mit mehreren OBS-Szenen). Felder: `PANEL_FIELDS`, Vorgaben je Szene: `PANEL_DEFAULTS`;
eigene Auswahl je Szene in `ui.panels` (Oberfläche, nicht Teil der Sendung), Notizen in `ui.notes`.
Ein neues Feld:
1. In `web/control.html` im Panel ein `<section class="panel-field" data-panel="<key>" hidden>` anlegen.
2. `["<key>", "Name"]` in `PANEL_FIELDS`, bei passenden Szenen in `PANEL_DEFAULTS` eintragen.
3. Werte in `panelValues()` füllen bzw. dieselbe Zeichen-/Klickfunktion nutzen wie unter Match (Beispiele: `vetoUpnextDraw()`,
   `mbarPoint()`), Eingaben mit `data-field` – dasselbe Feld darf an mehreren Stellen stehen, die anderen ziehen mit (01-core „Felder“).
So bleiben alle Stellen gleich, ohne eigenen Abgleich. Neue Texte → `web/lang-en.js`.

### Hintergrund-Playlisten

`Z.background.playlists` (Felder in `web/control/07-background.js`, Abschnitt „Playlisten“). `bgApply(scene)` schreibt vor
jedem Senden, was laufen soll, nach `Z.background.videos` (Liste) und `Z.background.play` (Übergang, Dauer, Reihenfolge) –
das Overlay (`cast.js`: `background()`) kennt keine Playlisten. Clips: `Z.background.clip = { id: Zeitpunkt, videos, audio }`,
jede Seite spielt einen Abruf einmal (`clips()`). Alte Zustände: `bgPlaylists()` macht aus `videos` die Playlist „Standard“.
Spielt OBS ab (`source: "obs"`), bekommt die Quelle „Cast – Hintergrund“ die Videos (`obsBackground(true)`).
* **Ton je Szene:** `bgAudioFor(szene)` – eigene Wahl der Szene (`Z.background.sceneAudio[szene]`, Knopf „Ton an/aus“
  in der Live-Ecke), sonst der Haken `audio` ihrer Playlist. Ergebnis in `Z.background.play.audio`: das Overlay
  (`audioApply`) schaltet danach die Playlist-Videos laut/stumm (Clips nach `clip.audio`); spielt OBS ab, schaltet
  `obsBackgroundAudio()` „Cast – Hintergrund“ per `SetInputMute` (nur bei Änderung; aus in Ingame und bei DACH).
  Für den Schlüssel `background` gibt es im Overlay keine eigene Stummschaltung mehr (`audioSettings`).
* **Sichtbarkeit in OBS** (`obsBackgroundVisible(delay, fade)` → `obsBackgroundSync`): aus bei Ingame und bei DACH CS –
  Offiziell, sonst an. Weich über den Farbkorrektur-Filter „Cast – Blende“ (`color_filter_v2`, `opacity`; legt die App
  bei Bedarf an): `bgOpacityTo()` schickt ~30 Schritte pro Sekunde per `SetSourceFilterSettings`, erst danach
  `SetSceneItemEnabled` (versteckt: Filter wieder 100 %, Medium per `TriggerMediaInputAction` angehalten). Ein neuer
  Wechsel (`bgFadeRun`) bricht eine laufende Blende ab und setzt an der aktuellen Deckkraft an. Ohne Filter: hart.
* **Gleichlauf:** `Z.background.play.since` = Start der Playlist (bleibt, solange die Videos gleich sind). Ein einzelnes
  Video in Schleife springt beim Start auf `(jetzt − since) % Dauer` (`bgSince` in `cast.js`), die Vorschau prüft alle
  4 s nach. Spielt OBS ab, fragt die Steuerseite alle 4 s `GetMediaInputStatus` und schickt `{cast: "bg-sync", cursor, at}`
  an ihre Vorschau-iframes (`bgSeek`, Sprung erst ab 0,35 s Abweichung).

### Werbung (Szene `ads`)

`Z.ads = { videos, badge, back, play }`. Die Steuerseite (`07-background.js`, „Werbung“) setzt `play = { id, list, from }`
und wechselt nach `ads`; `cast.js` (`ads()`) spielt die Liste im Teil `[data-part=ads]` nacheinander mit Ton, das letzte
Bild bleibt stehen. Die Vorschau im App-Fenster meldet `ads-progress` und `ads-ended` per `postMessage` an die
Steuerseite; danach läuft `adsBack` (Sekunden aus `back`) bis zurück zu `from`. Verlässt die Sendung die Szene, wird
`play` gelöscht (`sceneSwitch`, bei DACH-Seiten `dachSwitch`). Schild „WERBUNG“/„AD“: `OVERLAY_WORDS.ad`.
* **DACH CS – Offiziell:** DACH CS hat keine Werbe-Seite. `ads` steht in `DACH_SCENES` (Spalte Pause, ohne DACH-Seite);
  `dachSwitch("ads")` geht über `sceneSwitch`, `sceneSwitch("dach-…")` über `dachSwitch`. `broadcast.js` (`dachAds`)
  legt dann eine eigene Ebene `.dach-ads` mit `[data-part=ads]` über die laufende DACH-Seite (die geladen bleibt) und
  blendet sie mit dem Übergang ein/aus. Geht es danach auf eine andere DACH-Seite, lädt sie unter der Werbung, schaltet
  hart um, und erst dann blendet die Werbung aus. Panel-Vorgaben der DACH-Pausen enthalten „Werbung“.

### Videos je Theme

`Z.themeVideos[theme] = [Dateinamen]`. `themeVideoFilter(names)` liefert für das aktuelle Theme nur die zugeordneten
(keine zugeordnet = alle) – benutzt von Bibliothek, Werbung und Quelle „Video“ (`03-match.js`). Zuordnen in der
Bibliothek (`videoInfoDraw`, Schalter „Theme“, `ui.videosAssign`).

### Steam Workshop (`casting_app/server/workshop.py`)

`/api/workshop?id=<Link oder Nummer>` → `{id, title, image}`. Nur die Nummer geht an Steams öffentliche
`GetPublishedFileDetails`; das Vorschaubild nur über HTTPS von Steams Bild-Servern (auch nach Weiterleitung geprüft),
größenbegrenzt. Tests: `tests/test_workshop.py`.

### Unterseiten, Status und Stepper (`web/control/06-layout.js`)

`SUBPAGES[group]` = Liste `[key, Name, [data-area …]]` je Bereich mit Unterseiten (Match, Turnier, Setup); die Karten
(`<details data-area>`) bleiben im HTML, `belowApply()` blendet je Unterseite die passenden ein. `subStatus(group, key)` liefert
`[Zustand, Zeile]` (`ok|wait|next|""`) für den Punkt in der Liste. Für Bereiche in `STEPPER_GROUPS` hängt `belowApply()` unten
„← …“ / „Weiter: … →“ an. Neue Unterseite: Karte mit `data-area` anlegen, Eintrag in `SUBPAGES`, Status in `subStatus`.

### Spieltag (`Z.matchday`, `web/control/05-live.js`)

`Z.matchday = { list: [{ id, time, a, b, gameId, done }], current }`; `a`/`b` = `{ name, short, logo, players }` (Spieler wie
`Z.players`). `mdLoad(id)` setzt `Z.teams`/`Z.players`, leert Spielstand und Veto (`presetSteps`) und schreibt das Ergebnis des
bisher laufenden Spiels über `gameId` in `Z.tournament.res` – nur bei selbst geführten Turnieren (`gamesSource !== "faceit"`).

### Teams-Vorstellung (Szene `teams`, Folien)

Eine Szene mit drei Folien (`.ti-slide[data-slide=a|b|compare]` in `.ti-slides`); Kopfzeile und untere Leiste bleiben stehen.
`cast.js` → `teamIntro()` setzt `data-tislide` an der Szene (Body bzw. `.layer`) und füllt Spielerkarten (`data-ti-players`),
Werte (`data-ti="a.winrate"` …) und den Vergleich (`data-ti-tape`). Welche Folie läuft, rechnen Overlay und Steuerseite gleich:
von Hand `Z.teamIntro.slide`, automatisch aus `auto` (Sekunden) und `started` (`teamIntroSlide()` / `tiCurrent()`).
Neue Folie: Markup in `tools/generate_scenes.py` (`ti_*`), Schlüssel in `slides`, CSS-Regel für `[data-tislide=…]`, `tiSlides()` in `05-live.js`.

### Korrigierte Turnier-Ergebnisse

Ein Spiel in `Z.tournament.res` bekommt `fixed: true`, sobald es von Hand geändert wird und das Turnier mit FACEIT verknüpft ist.
`faceitResults()` und der Abgleich über Team-IDs überspringen solche Spiele; das Schild „korrigiert ↺“ löscht `fixed` wieder.

### Box-Stil der Overlays (hell · dunkel · Mischung)

Theme-Feld `boxStyle` (`light` Standard, `dark`, `mixed`; in `Z.themeData[theme]`). `cast.js` → `theme()` setzt
`body[data-boxstyle]` und `--paper`/`--paper-text` (die hellen Theme-Farben). `cast.css` (Abschnitt „Box-Stil“) stellt bei
dunkel/Mischung `--light`/`--text-dark` auf dunkel um – alle Felder, die `var(--light)` nutzen, folgen. Logo-Felder
(Sponsor, Marke) nutzen `--paper` und bleiben hell; bei Mischung auch Titel (`[data-part=title]`, `[data-part=head]`, `.large`).
Neue helle Fläche, die in jedem Stil hell bleiben soll → `var(--paper)`.

### Form und Farbe (Konzept 3.0)

Abschnitt „Konzept 3.0“ am Ende von `web/control.css`: `.button` = Taste (erhaben, lila Leuchten, sinkt beim Drücken),
`.toggleSwitch input[type=checkbox]` = Schalter, `.state` (+ `ok|wait|live|next|over`) = Punkt + Text nur zur Anzeige.
Farben mit fester Bedeutung als Variablen: `--live` Rot, `--ok` Grün, `--wait` Gelb, `--off` Grau, `--accent` Lila (nächster Schritt),
`--over` Blau (über dem Spiel). Nichts blinkt im Leerlauf. Größe: `zoomSet("auto")` in `06-layout.js` (Fensterbreite / 1920).

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
   in `web/control.html` (Seite `#appDialog`: Liste `.settings-nav` mit `data-jump`, je Bereich ein `<section>` in `.dialog-content`;
   `settings(true, "<id>")` öffnet direkt einen Bereich, `settingsNavDraw()` setzt die Status-Punkte), die Logik in
   `web/control/13-app.js` (Abschnitt „App-Einstellungen (Sprache, Update-Suche)“) und `06-layout.js` (Seite, Liste).
3. Soll Python sofort reagieren: `settings.listeners` (Beispiel: der Tray folgt der App-Sprache, `desktop/app.py`).

## Texte und Sprachen

Es gibt zwei unabhängige Sprachen: die **Sprache der App** und die **Sprache der Overlays**.

| Text | Wo er steht | Englisch |
|---|---|---|
| Steuerseite (Beschriftungen, Meldungen, Dialoge) | deutsch direkt in `web/control.html` / `web/control/*.js` | `web/lang-en.js` (deutscher Text → englischer) |
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
  - `media-cache/` (umgewandelte Videos, höchstens 3 GB), `update/` (Download eines Updates, Versionsmerker)
  - `secrets.vault` (nur ohne Schlüsselbund: Passwort-Tresor), `instance.sock` (Linux/macOS: eine Instanz)
  - `….damaged` – beiseitegelegte kaputte Dateien
  Der Ordner ist nur für den eigenen Nutzer lesbar (Linux/macOS: Rechte 0700).
* **im Browser der Steuerseite:** der Zustand, die Oberfläche (`ui`) sowie Datenbanken für Bilder und Sitzungen.
* **in Dateien der Nutzer:** Sicherungen (`.json`) und Theme-Exporte.

Wer ein Feld umbenennt oder einen gespeicherten Wert ändert, muss dafür sorgen, dass alte Daten weiter laden:
* **Neue Felder** sind unproblematisch: Der Standardwert aus `DEFAULT` wird beim Laden ergänzt.
* **Umbenennungen** brauchen eine Übernahme. Die Tabelle alter Namen in `web/legacy.js` (zwischen `/*BEGIN*/` und `/*END*/`)
  nutzen sowohl die Steuerseite als auch `casting_app/legacy.py`. Neue Einträge per Skript in die JSON-Tabelle schreiben
  und einen Fall in `tests/test_legacy.py` ergänzen. Diese Tabelle greift nur bei Daten aus 2.1 und älter (deutsche Namen).
* **Umbenennungen ab 2.2** (z. B. `sponsors.listen` → `sponsors.byTheme` in 2.3) stellt `renamedFields()` in
  `web/cast-core.js` um – jeder Zustand, jede Sitzung und Sicherung läuft beim Laden durch `K.merge`. Test dazu in
  `tests/test_control_page.py`.

## Technische Details

* **Szenenwechsel im Detail** (`web/broadcast.js`, `switchTo`): Teile beider Szenen werden gepaart – *bleibt* (dasselbe
  Element gleitet), *Überblendung* (verschiedener Inhalt), *kommt*/*geht*. Neue Teile tragen bis zu ihrem Einsatz die Klasse
  `.pending` (`cast.css`: `.pending, .pending * { visibility: hidden !important }` – auch Kinder mit eigenem `visibility`
  bleiben verborgen; `tests/live/flicker.py` meldet das als „content of hidden parts shows“). Sieht ein Überblend-Paar nach
  dem Zeichnen gleich aus (Klassen als Menge ohne `pending`, `data-*`), wird es zu *bleibt*. `restyle()` setzt am Ende den
  Stil der Zielszene, behält aber `--brand-scale`. Gleiten geht von der **echten** Lage (`where()`, berechneter Stil) zur
  echten Ziel-Lage – CSS-Regeln mit `!important` (Leiste rückt ohne Sponsor auf, `cast.css`) gelten mit; solange ein Teil
  gleitet, trägt es `.gliding`, und diese Regeln haben `:not(.gliding)`, sonst könnte die Animation sie nicht übersteuern.
  Neue Regeln dieser Art brauchen ebenfalls `:not(.gliding)`; `tests/live/flicker.py` meldet Hin-und-her-Sprünge.
* **Logo kleiner statt Raster verschieben:** Ein Szenen-Logo mit `data-max` (Breite in px, z. B. „4 Personen“ über
  `max_brand` in `tools/generate_scenes.py`) wird über `--brand-scale` verkleinert (`cast.js`, Theme); erst wenn es dabei
  unter 55 % fiele, steht nur das Icon. Die CSS-Regel `.brand { scale: var(--brand-scale, 1) }` gleitet beim Wechsel mit.
* **Docks** (`web/control/06-layout.js`): `ui.dock.bottom/right` ist eine Liste von Einträgen – Bereich (`"audio"` oder
  `{area, open}`), Tab-Gruppe (`{tabs: […], active}`) oder Stapel (`{stack: [Einträge]}`, nur unter der Vorschau: eine Spalte
  `.dock-stack`). `dockEntryPlace()` legt jeden Eintrag an (Start und Arbeitsbereiche), `dockRemember()` schreibt sie zurück;
  `stackCleanup()`/`groupCleanup()` lösen Stapel und Gruppen mit nur einem Teil auf.
* **Design der Steuerseite** (Ende von `control.css`, „Design 2.17“): Dunkel = „Arena“, Hell = „Hell“. Farben nur über die
  Variablen in `:root` / `:root[data-design=light]` (`--hot` Hauptknopf, `--onair` laufende Szene, `--card` Karten, `--grp`
  Gruppenfarbe je Szenenspalte). Neue Teile nutzen diese Variablen statt fester Farben, dann passen sie in beiden Stilen.
* **Erklärtexte** (`06-layout.js`): feste `p.small` ohne `id` direkt in `.content` eines Bereichs, länger als 70 Zeichen, bekommen
  `.explain` und sind versteckt; das „?“ am Titel schaltet `details.explain-open`. Statusmeldungen brauchen deshalb eine `id`.
* **Teams-Vorstellung** (`05-live.js`, `tiDraw`): Reiter `ui.tiTab`; Daten in `Z.teamIntro` – `names` (Anzeigename nur für
  `.ti-name`-Spans der Szene, `cast.js → teams()`), `rows` (Zeilen im Vergleich), `h2h` (direkter Vergleich).
* **Steuerseite schreibt nur Änderungen:** Zeitgeber (Timer alle 250 ms, Match-Leiste, Log) nutzen `setText`, `setImage`,
  `setHtml` (`01-core.js`) – das DOM wird nur angefasst, wenn sich der Wert wirklich ändert (spart Layout und Bildaufbau).
* **DACH CS – Offiziell** (`web/broadcast.js`, `dachShow`): drei iframes im Wechsel. Ebenen: vorige Seite (z 1) ·
  `.dach-cams` (z 2) · aktuelle Seite (z 3). Die DACH-Seiten haben durchsichtige Löcher für Kameras; die Rahmen aus
  `DACH_FRAME` (`web/cast-core.js`, gemessen inkl. gelber Linie) liegen darunter, Linie und Namensschild der Seite darüber.
  Beim Wechsel sitzen die Kameras sofort in den neuen Rahmen und laufen mit derselben Animation wie die neue Seite;
  `.dach-under` (z 0) füllt die Löcher beider Seiten schwarz, bis der Wechsel fertig ist. Die Blende geht über
  `.dach-dip` (Dunkelblau der DACH-Seiten, z 2 unter den Kameras): alte Seite → Blau → neue Seite. Schieben/Wischen
  legen `.dach-floor` (dasselbe Blau, z 0) darunter, außer die Ingame-Seite (durchsichtig) ist beteiligt.
  **Match aktiv?** `server/dach_match.py` lädt `lineup.php` selbst (ID und Key bleiben im Server) und sucht „kein aktives
  Match“; `/api/dach-match` → `{match: true|false|null}` (20 s zwischengespeichert). Die Steuerseite fragt alle 30 s
  (`dachMatchCheck`) und sperrt bei `false` die Szenen aus `DACH_NEEDS_MATCH` (`aria-disabled`). **Quelle je Rahmen:**
  `Z.dachFrame[seite][rahmen].src` (eine aus `DACH_SOURCES`, Standard = der Rahmen selbst); `dachFrameSet` legt je
  Quelle ein `.dach-cam[data-source]` an (dieselbe Quelle nur einmal). Quellenart **„Video“** (`Z.sources[k].type =
  "video"`, `video: "media/videos/…"`, `loop`, `audio`) zeichnet `sources()` in `cast.js`. Neue Seite vermessen:
  Video/Screenshot der Seite, gelbe Linie suchen (1920 × 1080), Werte in `DACH_FRAME` eintragen.
* **PySide6 unter 6.12** (`pyproject.toml`): Ab 6.12 steckt Qt WebEngine im eigenen Paket `PySide6_WebEngine` (nicht mehr
  in Addons) – ohne es fehlt `PySide6.QtWebEngineWidgets`. Zum Umstieg: Paket ergänzen, `tools/build.py` und die
  PyInstaller-Hooks auf allen drei Systemen bauen und testen, dann die Grenze anheben.
* **Videoformate / H.264 im App-Fenster:** Qt WebEngine aus PySide6 kann kein H.264/AAC (VP8/VP9/AV1 ja); OBS (CEF) kann es.
  Im App-Fenster leitet `desktop/media.py` (`QWebEngineUrlRequestInterceptor`) Medienanfragen auf MP4-artige Dateien auf
  `/api/media?src=…&t=…` um; `server/media_converter.py` wandelt mit FFmpeg in WebM (VP8 + Opus, höchstens 720p und
  30 fps – das Fenster zeigt nur die Vorschau, Software-Dekodieren von 1080p60 ließ sie beim Szenenwechsel ruckeln;
  `CACHE_VERSION` gehört zum Cache-Schlüssel), streamt schon während
  der Umwandlung und legt das Ergebnis in `media-cache/` (höchstens 3 GB, Range-fähig). `t` ist `media_token()` aus dem
  Zugangsschlüssel – fremde Programme können den Server nicht als Download-Werkzeug nutzen. `desktop/scripts/codecs.js`
  sorgt dafür, dass Seiten MP4 überhaupt anfragen (`canPlayType`, `<source type>`). FFmpeg kommt aus `imageio-ffmpeg`
  (GPL, eigenes Programm, `LICENSES/FFmpeg.txt`; nicht auf macOS Intel – die Fassung dort ist „nonfree“). Ohne FFmpeg
  zeigt `dachNote()` in der Vorschau einen Hinweis. Tests: `test_desktop.py` (fremde Seite mit MP4), `test_server.py`.
* **Schließen:** `closeEvent` wird ignoriert, die Steuerseite zeigt sofort ihren eigenen Dialog
  (Ganz beenden · Nur Fenster schließen · Abbrechen). Bestätigt die Seite nicht binnen 1 s, fragt ein Systemdialog.
  „Nur Fenster schließen“ versteckt das Fenster; das Tray-Symbol bietet Öffnen · Overlays in OBS neu laden · Ganz beenden.
* **Brücke zur Steuerseite:** `window.castApp` (`desktop/scripts/page_bridge.js`) spricht nur über DOM-Ereignisse mit einer
  isolierten Skript-Welt (`app_bridge.js`), die den `QWebChannel` zu Python hält. Eingebettete fremde Seiten erreichen Python nicht.
* **Eine Instanz / Update-Ablösung:** `QLocalServer` – ein zweiter Start holt das Fenster nach vorn. Läuft eine **ältere**
  Version (auch 1.x), wird sie über `/api/ping` erkannt und über `/api/beenden` beendet (den Namen versteht jede Version;
  neu heißt er `/api/quit`; ab 2.12 nur mit Zugangsschlüssel). Eine ältere Version löst nie eine neuere ab.
  Antwortet auf Port 8787 eine gleiche oder neuere Version, prüft der Start mit `/api/ping?nonce=…`, ob sie echt ist:
  Nur wer den Zugangsschlüssel kennt, kann `proof` (HMAC über die Zufallszahl) richtig ausrechnen
  (`instance.genuine_server`). Sonst startet die App nicht und meldet den belegten Port.
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

**Ton in OBS** (`web/control/11-audio.js`): eine kompakte Zeile je Quelle wie im OBS-Mixer. **Pegel:** die Steuerseite
abonniert `InputVolumeMeters` (Bit `1<<16`; etwa 20 Meldungen pro Sekunde) **nur, solange der Ton-Bereich zu sehen ist**:
`audioMeterSubscribe()` schaltet das Bit über `channel.obs.subscribe()` (obs-websocket `Reidentify`, op 3) an und aus –
beim Öffnen/Schließen des Bereichs, Reiterwechsel und `visibilitychange`. Grundabo in `01-core.js` ohne Pegel. `audioMeters()`
merkt sich die Werte und zeichnet höchstens einmal je Bild (`requestAnimationFrame`) und nur, wenn der Bereich zu sehen
ist – über `transform` (Deckel `scaleX`, Spitze `translateX`), ohne DOM-Neuaufbau. Skala −60 … 0 dB.

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
  einmalig in den Schlüsselbund übernommen und gelöscht – ohne Schlüsselbund und ohne Tresor gelten sie nur für diese
  Sitzung und werden trotzdem gelöscht (eine Base64-Datei wäre ein schwacher Speicher).
* Im Repository liegen keine Zugangsdaten. Die CI liest den SignPath-Token nur aus den GitHub-Secrets.
* **Zugangsschlüssel (ab 2.3):** Beim ersten Start erzeugt der Server einen Zufallsschlüssel (`access-key` im
  Schlüsselbund). Ohne ihn liefert er nur, was ein Overlay braucht (`OPEN_API` in `app_server.py`: Zustand lesen,
  Live-Verbindung, Bilder, Meldungen, Ping) – kein `/dach/…`, keine OBS-Anmeldung, keine Änderung, keine
  Tokens oder Pfade. So kommt auch ein Programm auf diesem PC, das Browser-Kopfzeilen fälscht, an nichts heran.
  - **App-Fenster:** Python gibt den Schlüssel beim Anlegen der Seite in `window.castApp.accessKey` (`page_bridge.js`) –
    nie in einer Adresse, im Verlauf oder im Browser-Speicher. Vorschau-Rahmen lesen ihn vom Fenster (`window.top`).
  - **Browser** („Steuerseite im Browser öffnen“): die Seite holt einen Einmal-Code (`/api/access-code`, 2 Minuten gültig)
    und öffnet `/open?code=…`; der Server legt den Schlüssel für diesen Tab in `sessionStorage`. Der Code im Verlauf ist danach wertlos.
  - **OBS-Quellen** bekommen ihn in der Adresse („In OBS anlegen“) – OBS speichert ihn in seiner Szenen-Datei.
    Ältere Quellen ohne Schlüssel findet die Steuerseite beim Verbinden mit OBS und stellt sie nach Rückfrage um (`accessCheck`).
  - `cast-core.js` hängt ihn an jede `/api/…`-Anfrage (Kopfzeile `X-Casting-Access`) und an die Live-Verbindung (`?access=`).
  - **Ohne Schlüssel** bekommt ein Overlay den Zustand ohne Kamera-Links und Geräte (`public_state` – VDO.Ninja-Links
    können Passwörter enthalten). Höchstens 15 Live-Verbindungen ohne Schlüssel gleichzeitig.
  - **Beenden** (`/api/quit`, `/api/beenden`) braucht ab 2.12 den Schlüssel; der Windows-Installer beendet die App
    mit `taskkill` (die CI prüft beides).
  - Ohne Fenster steht die Adresse mit Schlüssel nur in der Konsole, nie im Log.
  - Ist der Schlüsselbund beim Start gesperrt, gilt ein vorläufiger Schlüssel – der gespeicherte wird nie überschrieben.
  - Neue Route, die ein Overlay ohne Schlüssel braucht → in `OPEN_API` eintragen (nur, wenn nichts Geheimes drin ist).
  - Tests: `server.access_key`; Live-Skripte lesen ihn aus dem App-Fenster (`tests/live/common.py`).
* **Grenzen:** DACH CS nimmt ID und Key nur als URL-Parameter an. `/dach/<page>` leitet deshalb mit beiden weiter
  (`no-store`, `no-referrer`, nicht geloggt); die Adresse steht danach im iframe in OBS bzw. im App-Fenster.
  Programme unter demselben Nutzerkonto können den Schlüsselbund (und damit auch den Zugangsschlüssel) lesen –
  dagegen schützt keine App, das ist die Grenze des Betriebssystems.
* Die Vorschau bekommt Zustand und Live-Daten per `postMessage(…, location.origin)` – nie eine fremde Seite.
* FACEIT-Abfragen folgen keiner Weiterleitung (der Key ginge sonst an den Ziel-Host mit).
* **Ablösen einer älteren Version** (`instance.ask_running_app_to_quit`): der Zugangsschlüssel geht nur an einen Server,
  der vorher beweist, dass er ihn kennt (`genuine_server`, HMAC über eine Zufallszahl). Ein fremdes Programm auf Port 8787,
  das sich als alte Version ausgibt, bekommt ihn nicht. Belegt ein fremdes Programm `[::1]:8787`, startet der Server nicht
  (das Fenster lädt `localhost`, das auf `::1` zeigen kann).
* **App-Fenster** (`desktop/web_page.py`): eingebettete Rahmen dürfen nur Webseiten laden (`SUBFRAME_SCHEMES`; keine
  `steam:`, `smb:`, `search-ms:` … an Programme des Systems, `DisallowUnknownUrlSchemes`), keine Fenster ohne Klick öffnen
  (`JavascriptCanOpenWindows` aus) und keine Dialoge (`alert/confirm/prompt` nur von eigenen Seiten). Ins Hauptfenster
  dürfen nur eigene Seiten und Blobs eigener Seiten.
* **Ein Fenster je Nutzer:** unter Windows ist der Pipe-Name zufällig und liegt im privaten Datenordner
  (`instance-name`) – ein anderer Nutzer kann ihn nicht vorher belegen und so jeden Start schlucken.
* **Fernsteuerung** (DevTools, Port 9222) nur mit `--debug` und nur auf 127.0.0.1 – nie über eine geerbte Variable und
  nicht nach einem Update-Neustart (`RESTART_FLAGS`). Programme des Systems bekommen keine `QTWEBENGINE_*`-Variablen.
* **Videos fürs App-Fenster** (`/api/media`): `public_host` löst Namen und Zahlen-Schreibweisen (`127.1`, `2130706433`)
  auf; jede Adresse dahinter muss öffentlich sein. FFmpeg liest nur Videodateien (`-format_whitelist`, keine
  HLS-Listen mit Einträgen ins lokale Netz). Rest-Risiko: eine Weiterleitung des fremden Servers folgt FFmpeg selbst.
* **Workshop-Bilder:** jede Weiterleitung wird vor dem Folgen geprüft (nur Steams Bild-Server).
* **Anfragen:** Steuerzeichen im Pfad → 400 (kein Zeilenumbruch in einer Weiterleitung); `//` in Datei-Pfaden → 404
  (unter Windows wäre das ein Netzwerkpfad); Werte aus Anfragen ins Log nur einzeilig (`log_text`); ein Zustand, den
  Python nicht lesen kann (zu tief verschachtelt), wird abgelehnt statt gespeichert.
* **Sitzung laden** (`13-app.js`): Theme-Farben nur als `#hex`, Schrift-Datei nur aus `fonts/` (`themeValuesClean`);
  enthält die Datei Adressen im Internet (Kamera-Links, Bilder), fragt die Seite vorher und kann sie weglassen
  (`importExternalHosts`). Lautstärken je Szene nur als Zahl, Playlisten nur mit Text-Einträgen, FACEIT-IDs nur aus
  Buchstaben, Zahlen und `-` (`faceitJson`).
* Ohne App (Seite als Datei) liegt das OBS-Passwort nur in `sessionStorage`, nie dauerhaft im Browser.

### Privatsphäre (E-Mail-Adressen)

Commits tragen die E-Mail-Adresse des Autors – im öffentlichen Repository für alle sichtbar. Deshalb:
* GitHub → Settings → Emails: „Keep my email addresses private“ und „Block command line pushes that expose my email“ an.
* Lokal `git config user.email "<id>+<name>@users.noreply.github.com"` (die Adresse steht auf derselben GitHub-Seite).
* `tools/check_privacy.py` (CI-Job `checks`) schlägt fehl, sobald ein Commit (Autor, Committer, eine Adresse in der
  Nachricht) oder ein Tag eine andere als eine noreply-Adresse trägt oder eine Datei eine E-Mail-Adresse enthält; die
  Adresse selbst gibt es nie aus. Als noreply zählen nur genau `<id>+<name>@users.noreply.github.com`,
  `noreply@github.com` und `noreply@anthropic.com`. `KNOWN_OLD_COMMITS` nennt den einen Commit von vor dieser Prüfung –
  er steht weiter im öffentlichen Verlauf (entfernen ginge nur durch Umschreiben der ganzen Geschichte).

### Programme des Systems starten (Linux)

Die gebaute Linux-App (PyInstaller, AppImage) setzt `LD_LIBRARY_PATH` auf ihre eigenen Bibliotheken. Startet sie damit
`xdg-open`, lädt z. B. `kde-open` das Qt der App statt das des Systems und scheitert still (Issue #13: „Videos-Ordner öffnen“
unter KDE). Darum öffnen Ordner und Links über `casting_app/system_open.py` (`open_with_system`, Umgebung aus
`system_environment()`: ursprüngliches `LD_LIBRARY_PATH`, nichts, was in den App-Ordner zeigt). Auch der Neustart nach einem
AppImage-Update nutzt diese Umgebung. Neue Stellen, die ein Programm des Systems starten, ebenso.

### Stabilität (Dateien, Fehler)

* Eigene Dateien (Zustand, Einstellungen, CS2-Einstellungen, Fenster, Bilder, Tresor) immer mit `files.write_atomic`
  schreiben: erst `<name>.tmp`, dann in einem Schritt ersetzen – ein Absturz hinterlässt nie eine halbe Datei.
* Lesen mit `files.read_json_object`: eine beschädigte Datei wird als `<name>.damaged` beiseitegelegt (Log-Eintrag),
  die App startet mit Standardwerten. Nie eine Datei überschreiben, die sich nicht lesen ließ.
* Der Zustand hat eine laufende Nummer (`revision`, `K.nextRevision`). Ein älterer Stand bekommt 409 mit der Nummer des
  Servers; die Steuerseite macht darüber weiter (wichtig, wenn die Uhr des PCs zurückgestellt wurde).
* Unerwartete Fehler (auch in Threads) landen im Log (`AppLog.catch_unhandled_errors`); stürzt die Steuerseite im
  Fenster ab, lädt die App sie neu.
* Server-Sockets: `server/net.py` (`ExclusiveHTTPServer` – unter Windows bekommt ein zweiter Server den Port wirklich nicht;
  `content_length` lehnt „-1“ und Unsinn ab).

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
  „Free code signing provided by SignPath.io, certificate by SignPath Foundation“. Signiert wird nur auf `main` und
  bei Release-Tags – ein beliebiger Branch bekommt keine Signatur.
* **Lieferkette:** Actions in `build.yml` sind auf Commit-SHAs festgelegt (Kommentar dahinter = Version; ein Tag lässt
  sich verschieben, ein SHA nicht). `appimagetool` und die AppImage-Laufzeit kommen in fester Version mit SHA-256
  (`tools/build.py`, `download_checked`) – neue Version: Datei laden, `sha256sum`, beides eintragen. Checkout ohne
  gespeicherte Zugangsdaten (`persist-credentials: false`). Ein schon veröffentlichtes Release wird nie überschrieben
  (der Release-Job bricht ab – erst die Version erhöhen).
* **Lizenzen** mitgelieferter Teile in `LICENSES/` (FFmpeg, Qt/PySide6, alle Schriften) – neue Schrift oder Bibliothek
  → Lizenztext dazulegen (ohne E-Mail-Adressen der Urheber, `check_privacy.py` prüft auch diese Dateien).

## Update aus der App

`casting_app/updater.py` (Server-Routen `/api/update`, `/api/update-check`, `/api/update-install`, Oberfläche unter
⚙ → Update: `control.html` `#updateArea`, Logik in `control/13-app.js`, Abschnitt „Update“):
1. GitHub-API `releases/latest` → Version und die Datei für dieses System (`install_kind()`, `asset_suffix()`).
   Nur Dateien unter `github.com/29j2003/casting-app/releases/download/` mit `sha256`-Prüfsumme der API werden angeboten.
2. Download in den Datenordner (`update/`), SHA-256 prüfen – stimmt sie nicht, wird nichts installiert.
3. `start_replacement()` startet einen kleinen Helfer (Windows: `.cmd`, sonst `/bin/sh`), der wartet, bis die App beendet
   ist, die neue Version einsetzt und sie startet. Was schiefgehen kann (Kopieren, Entpacken), passiert vorher, solange
   die App noch läuft – Fehler landen dann im Status statt in einer geschlossenen App. Der Helfer startet immer eine App
   (die neue oder, wenn der Tausch scheitert, die alte).
   * Windows: Setup mit `/S /D=<bisheriger Ordner>`; Pfade als Umgebungsvariablen (`!CA_FILE!` – Umlaute, `&`, `%`
     bleiben heil), Warten mit `ping` (ohne Konsole). Der Installer merkt sich `InstallLocation` (`InstallDirRegKey`).
   * AppImage: Kopie als `….new` neben die alte, nach dem Beenden `mv`.
   * macOS: neue `.app` vorher als `….app.new` daneben, danach Tausch mit Rückfall auf die alte. Kein automatisches
     Update aus dem DMG, aus App Translocation oder ohne Schreibrecht im Ordner (`install_kind()` → „manual“).
4. Beim nächsten Start notiert `update/installed-version.txt` „aktualisiert von …“ und alte Downloads werden gelöscht.

Die Dateinamen der Releases (`Casting-App-<v>-Setup.exe`, `…-linux-x86_64.AppImage`, `…-mac-arm64.zip`, `…-mac-x64.zip`)
kommen aus `tools/build.py` – wer sie ändert, muss `asset_suffix()` anpassen.

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

* **Log-Reiter** in der App, oder `log.txt` im Datenordner (Reiter Log → Ordner → „Daten & Log“). Blaue Zeilen kommen direkt
  aus den Overlays, z. B. aus OBS.
* **Diagnose im Overlay:** Log-Reiter → „Diagnose in allen Overlays einblenden“. Zeigt Version, Zustand, Bilder und
  Videos direkt in der Browserquelle.
* **Entwicklerwerkzeuge des App-Fensters:** die App mit `python -m casting_app --debug` starten (nur dieser
  Schalter öffnet Port 9222 – jedes Programm auf dem PC könnte darüber den Zugangsschlüssel lesen) und in Chrome/Edge
  `http://localhost:9222` öffnen. Fehler in der Steuerseite
  zeigen auf `/control.js` – die Zeilen davor `// ===== control/<datei>.js =====` sagen, aus welcher Datei sie stammen.
* **Overlays im normalen Browser:** `http://localhost:8787/overlay.html` oder eine einzelne Szene, z. B.
  `http://localhost:8787/players.html?preview=1`.
* **Studio-Modus:** zweite `overlay.html?preview=1&studio=<szene>` (`#studioFrame`, `13-app.js`); sie zeigt immer die gewählte
  Szene (cast.js setzt `Z.broadcast.scene` nur dort um), Wechsel per `postMessage({cast: "studio", scene})` ohne Neuladen.

## Worauf man achten muss

* **Leistung** – die Overlays laufen in OBS während des Streams:
  - nur neu zeichnen, was sich geändert hat (`newNeeded` in `cast.js`)
  - keine Endlos-Animationen im Leerlauf
  - keine Filter auf großen Flächen
  - teure Messungen nur bei Änderung: `fit()` (Namen kürzen) merkt sich Text, Theme-Schrift und Breite und misst sonst
    nicht neu; Spielstand und Serie schreiben nur, wenn sich der Text ändert; Live-Stats zeichnen die Teams nur bei
    geänderten Werten neu
* **Leistung der Steuerseite und des Servers:**
  - `/control.js` wird einmal verbunden und erst neu gebaut, wenn sich eine Datei in `web/control/` ändert
    (`control_script()`, Stempel aus den Änderungszeiten)
  - `video_info.py` merkt sich die Angaben je Datei (Pfad, Größe, Änderungszeit) – FFprobe läuft nur einmal je Video
  - Status der Unterseiten (`subStatusDraw`) rechnet nur sichtbare Gruppen und das Turnier einmal je Durchlauf (`subMemo`)
  - HTML nur setzen, wenn es sich ändert (`setHtml`); laufender Status (Werbung) wird als Text nachgetragen, ohne die Liste neu zu bauen
* **Keine Bedien-Hinweise im Stream:** Hinweise für den Bediener nur in der Vorschau (`body.idle`).
* **Overlays ändern sich nicht durch die Desktop-App:** Desktop-Besonderheiten liegen in `casting_app/desktop/` oder
  hinter `window.castApp`.
* **Geheimnisse** nie in Zustand, Log, Exporte, Dateien, URLs oder API-Antworten – und nie ins Repository.
* **Doku:** genau zwei Dateien – `README.md` (Startseite und Anleitung für Nutzer, auf Englisch, nur der aktuelle Stand ohne
  Versionsgeschichte; Knopf-Namen wie in `web/lang-en.js`) und `ENTWICKLUNG.md` (alles für
  Entwickler). Dazu `.claude/CLAUDE.md` für Claude Code. Keine weiteren `.md`-Dateien.
  Bilder der README liegen in `docs/images/` (App auf Englisch, nur erfundene Namen – keine echten Personen, Teams oder Sponsoren);
  bei sichtbaren Änderungen an der Oberfläche neu aufnehmen (Steuerseite 1600 × 960, Overlay 1920 × 1080 auf 1280 × 720 verkleinert).
