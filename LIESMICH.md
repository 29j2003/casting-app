# Casting-App

Ein eigenes Programm mit eigenem Fenster – für Windows, Linux und macOS. Die Overlays laufen in OBS wie immer in
**einer** Browserquelle („Cast – Overlay“). Ihre Adresse enthält einen Zugangsschlüssel – am einfachsten legt die App sie
selbst an (Setup → Szenen & OBS); sonst dort „Overlay-Adresse kopieren“.

## Installieren (ab 2.0)

* **Windows:** `Casting-App-2.x.x-Setup.exe` ausführen (Installation für dein Konto, ohne Adminrechte, mit Startmenü- und
  Desktop-Verknüpfung) – oder ohne Installation `Casting-App-2.x.x-windows-portable.zip` entpacken und darin
  `Casting-App.exe` starten (z. B. vom USB-Stick). Windows fragt beim ersten Mal evtl. „Windows hat den PC geschützt":
  **Weitere Informationen → Trotzdem ausführen** (die Datei ist nicht signiert).
* **Linux:** `Casting-App-2.x.x-linux-x86_64.AppImage` ausführbar machen (`chmod +x …`) und starten.
* **macOS:** `.dmg` öffnen (Apple Silicon: `…-mac-arm64.dmg`, Intel: `…-mac-x64.dmg`) und die App in „Programme“ ziehen.
  Die App ist nicht von Apple beglaubigt: beim ersten Start **Rechtsklick → Öffnen → Öffnen**.

## Umstieg von Version 1.x

Einfach die neue Version starten – eine noch laufende alte Version wird dabei automatisch beendet.
* Zustand, Bilder, Sitzungen, Videos und Schriften bleiben, wo sie sind, und werden weiter benutzt.
* **FACEIT-Key und DACH-CS-Zugang** übernimmt die App beim ersten Start einmalig in den Schlüsselbund des Systems
  (Windows: Anmeldeinformationsverwaltung) und löscht die alten Dateien.
* **Einstellungen der Oberfläche** (Arbeitsbereiche, Docks, OBS-Verbindung) übernimmt sie einmalig aus dem alten Edge-Fenster.
  Fehlt danach etwas: OBS-Verbindung unter ⚙ neu eintragen, Arbeitsbereich neu wählen.
* Die alte `Casting-App.exe` wird nicht mehr gebraucht. Edge oder Chrome braucht die App nicht mehr.

## Umstieg von Version 2.1 auf 2.2

Ab 2.2 heißen Dateien und gespeicherte Daten intern englisch (z. B. `control.html` statt `steuerung.html`). Beim ersten
Start übernimmt die App alles einmalig: Zustand, Sitzungen, Bilder, Themes, Arbeitsbereiche und Docks. Browserquellen in
OBS mit den alten Adressen (z. B. `…/spieler.html`) funktionieren weiter, `overlay.html` bleibt ohnehin gleich.
Sicherungen (`.json`) und Theme-Dateien aus 2.1 lassen sich weiter laden.

## Beim ersten Start

1. **Casting-App** starten.
2. Es öffnet sich das Fenster **Casting-App**. Die Karte **„Erste Schritte"** führt durch alles Weitere:
   * **OBS verbinden:** OBS → Werkzeuge → WebSocket-Server-Einstellungen → „WebSocket-Server aktivieren".
     Port und Passwort („Verbindungsinformationen anzeigen") in der App unter **⚙ App-Einstellungen → Verbindung zu OBS** eintragen.
   * **Szenen einrichten:** Setup → **Szenen & OBS** → **„Szene ‚Cast – Sendung‘ in OBS anlegen"**. In OBS gibt es dann die Szene „Cast – Sendung"
     mit einer Browserquelle (mit dem Zugangsschlüssel der App). Wer die Browserquelle lieber selbst anlegt:
     **„Overlay-Adresse kopieren"** und in OBS als Browserquelle (1920 × 1080) einfügen.
   * Theme, Teams und Caster eintragen.
   * **Spielbild:** In OBS die Spielaufnahme in der Szene „Cast – Sendung" **unter** die Browserquelle legen.
     In der Szene **Ingame** ist das Overlay durchsichtig, nur Sponsor und Einblendungen sind zu sehen.
3. Im Reiter **Live** Szenen per Klick wechseln, Übergang wählen, Einblendungen zeigen.

## Aufbau

* **Live** – nur, was du in der Sendung brauchst: Programm-Vorschau, Szenen, **Match** (Punkte, Map, Serie, Timer),
  **Turnier live** (Gruppe, Team hervorheben, „Tabelle zeigen“), Einblendungen und Ton.
* **Match** – Unterseiten: Import & Sitzungen · Teams & Spieler · Map-Veto & Serie · Caster & Kameras · Timer & Texte (und „Alle“).
* **Turnier** – eigener Bereich für Baum, Tabelle und FACEIT-Abgleich.
* **Setup** – Unterseiten: Aussehen · Sponsoren · Map-Pool · Hintergrund · Szenen & OBS · CS2-Livedaten.
* **Arbeitsbereiche** (oben links): Vorlagen *Operator*, *Caster – große Knöpfe*, *Laptop / neben OBS*, *Vorbereitung*
  und eigene („Aktuelle Anordnung speichern als …“). Ein Arbeitsbereich merkt sich Docks, Größen, Lage, Schlösser und Knopfgröße.
  Dein bisheriges Layout wurde als „Mein bisheriges Layout“ übernommen.
* **Layout bearbeiten** (Symbol oben rechts neben ⚙, im Menü Arbeitsbereiche oder Strg K): oben erscheint die Leiste
  „LAYOUT BEARBEITEN“ mit „Als Arbeitsbereich speichern“ und „Fertig“. Nur dann lassen sich Bereiche ziehen, andocken und in der Größe ändern –
  im Normalbetrieb verschiebt sich nichts aus Versehen. Leere Reiter-Spalten blenden sich aus.

## Sitzungen & Sicherung (Match → Import & Sitzungen)

Speichere ein Match als Sitzung („Speichern“, „Speichern unter …“) und lade es später mit „Laden“. „Sichern (.json)“ und
„Laden (.json)“ bringen alles auf einen anderen PC. „Alles zurücksetzen“ fragt vorher nach.

## Map-Veto (Match → Map-Veto & Serie)

Quelle „Manuell“ oder „FACEIT“, Format/Preset wählen, „Neu starten“. „↶ Rückgängig“ nimmt den letzten Schritt zurück.
Eigene Abläufe mit „+ Schritt“ bauen und „Als Preset speichern“. Gewonnene Maps zählen auf Wunsch automatisch als Punktestand.

## Kameras & Quellen (Match → Caster & Kameras)

Pro Kamera-Rahmen: VDO.Ninja-Link, ein Gerät (Webcam/Capture-Karte, „Geräte suchen“), ein Bild – oder leer, wenn du in OBS
eine eigene Quelle darüberlegst. Die Sprecher-Anzeige lässt das Namensschild leuchten, wenn jemand spricht (Schwelle einstellbar).

## Timer & Lauftexte (Match → Timer & Texte)

Timer mit Minuten setzen oder „bis Uhrzeit“ laufen lassen; Start/Pause und ±1 min gehen auch in Live → Match.
Lauftext: eine Meldung pro Zeile, Tempo einstellbar; dazu ein großer Titel.

## DACH CS – Offiziell (fünfter Stil)

Setup → Aussehen → Stil **„DACH CS – Offiziell“** wählen, **Nutzer-ID** und **Key** aus dem DACH-CS-Nutzerbereich
(Casting → Browserquellen) eintragen. Der Key wird verschlüsselt gespeichert und nie wieder angezeigt.

* Alles läuft in **einer** Browserquelle („Cast – Overlay“): Live → Szenen zeigt die 25 DACH-Seiten (Overview, Single-/Duocam,
  Lineup, Mapveto, Ingame, Tabelle, Playoffs, Matches, MVP, Pausen, Interaktion, Interviews, Endscreen). Die neue Seite wird
  vorgeladen und dann mit dem gewählten Übergang gewechselt (Schnitt, Blende, Schieben, Wischen, Stinger – wie bei den eigenen
  Szenen); Kameras gleiten dabei in ihre neuen Rahmen, das Bild läuft weiter. Ohne Scrollbalken, exakt 1920 × 1080.
* **Kameras und Inhalt** (Caster, Gast, Clip) setzt die App automatisch in die Rahmen der jeweiligen Seite. Ein leerer
  Rahmen ist schwarz – nie der Hintergrund der DACH-Seite, auch nicht kurz beim Wechsel.
  „Kamera- und Inhalts-Rahmen anpassen“ zeigt die Rahmen in der Vorschau und lässt sie pixelgenau verschieben.
* Die Inhalte der Grafiken (Teams, Ergebnisse, Tabelle …) kommen aus dem DACH-CS-Live-Dashboard. Einblendungen der App liegen darüber.
* „DACH CS – eigener Stil“ bleibt als freies Design erhalten.

## Ton (Live → Ton) – geregelt direkt in OBS

Wie im OBS-Mixer: **alle Quellen mit Ton in OBS** (auch Mikrofon, Desktop-Audio, Spiel), die der App zuerst. Die App regelt
sie live über OBS – **Lautstärke** (bis 300 %), **Stumm**, **Verzögerung** (Synchronisation, −950 bis 20 000 ms, unter ⋯) und
direkt sichtbar das **Abhören**:

* *Abhören aus* – nur im Stream/der Aufnahme, nicht auf deinem Kopfhörer
* *Nur abhören* – nur auf deinem Kopfhörer, nicht im Stream
* *Abhören + Ausgabe* – im Stream und auf deinem Kopfhörer

Eigene Zeilen der App: „Cast – Overlay“ (alles, was im Overlay klingt: Clips, DACH-Seiten, Videos), „Cast – Hintergrund“ (wenn OBS das Video
abspielt) und je Caster/Gast eine eigene Quelle: bei VDO.Ninja-Gästen „Als eigene OBS-Tonquelle“ anklicken – dann ist ihr Ton
einzeln regelbar und läuft nicht mehr doppelt im Overlay. Änderungen direkt in OBS erscheinen hier ebenfalls.

**Ton im App-Fenster** (oben im Bereich Ton, Standard: aus): schaltet alles stumm oder hörbar, was im App-Fenster klingt –
Videos, Kameras, Clips (YouTube, Twitch), VDO.Ninja und DACH-Seiten – mit eigener Lautstärke. Der Stream bleibt davon unberührt.
Umschalten lädt nichts neu: Videos, Kameras und DACH-Seiten laufen weiter, nur der Ton geht an oder aus.
* **Aus** schaltet das ganze Fenster stumm – zuverlässig, auch für alle eingebetteten fremden Seiten.
* **Lautstärke** gilt für alle Video- und Audio-Elemente und für Web Audio in allen Seiten des Fensters (auch VDO.Ninja,
  Clips und DACH CS). Die Player der Seiten zeigen dabei weiter ihre eigene Lautstärke an; die App regelt nur, was am Ende
  hörbar ist. Grenzen: Ton, den eine fremde Seite auf ganz ungewöhnlichem Weg erzeugt (z. B. in einem verborgenen
  Shadow-DOM ohne Abspielen per Skript), ist evtl. nur über **Aus** zu regeln.

## Fenster schließen

Klick aufs **X**: das Fenster bleibt erst einmal offen und die App fragt sofort
**Ganz beenden · Nur Fenster schließen · Abbrechen**. Dieselbe Auswahl öffnet ⏻ oben rechts.
* **Nur Fenster schließen:** das Fenster verschwindet, die Overlays in OBS laufen weiter. Im Infobereich der Taskleiste
  (macOS: Menüleiste) bleibt das **29-Symbol** mit dem Menü **Öffnen · Overlays in OBS neu laden · Ganz beenden**.
  Ein Klick aufs Symbol (macOS: öffnet das Menü) oder ein erneuter Start der App holt das Fenster zurück.
* **Overlays in OBS neu laden** lädt die Browserquellen über OBS neu (wie der Knopf in der App); ohne OBS-Verbindung lädt
  die App die verbundenen Overlays selbst neu.
* Ist das Fenster geschlossen und auch kein Overlay mehr verbunden (OBS zu), beendet sich die App nach 30 s von selbst.

## Cleanfeed

In **Ingame** erscheint oben in der Programm-Karte **Cleanfeed**: blendet alle Grafiken der App aus, im Programm bleibt nur das Spielbild
(beim Szenenwechsel automatisch wieder aus). Für einen dauerhaften zweiten Ausgang: Setup → Szenen & OBS → **„Cleanfeed-Szene in OBS
anlegen“** – „Cast – Cleanfeed“ mit denselben Quellen wie die Ingame-Szene, aber ohne Grafiken (ausgeben z. B. über die virtuelle Kamera
mit Ausgabe „Szene“, NDI oder Source Record).

## Stats über dem Spiel

Läuft **Ingame**, tragen Scoreboard, Team A/B, Head-to-Head, Turnierbaum und Serie den Hinweis „ÜBER SPIEL“: ein Klick zeigt die
Ansicht über dem Spielbild (leicht abgedunkelt), ein zweiter blendet sie aus – Ingame läuft weiter. Nach der eingestellten Zeit
(Knopf „Übergang: …“ in der Programm-Karte → „Stats über dem Spiel (während Ingame) ausblenden nach … Sekunden“,
Standard 15, 0 = bleibt stehen) verschwindet sie von selbst. **Umschalt-Klick** wechselt
trotzdem in die ganze Szene. In jeder anderen Szene wechseln die Knöpfe ganz normal.

## Reiter

* **Live** – während der Sendung: Szenen, Match, Turnier live, Einblendungen, Ton.
* **Match** – das aktuelle Spiel: Sitzungen, FACEIT, Map-Veto, Teams, Spieler, Timer, Lauftexte, Caster, Kameras.
* **Turnier** – Baum, Tabelle, FACEIT-Turnier.
* **Setup** – Themes, Überschriften, Sponsoren, Map-Pool, Hintergrund, OBS-Szenen, CS2-Daten.
* **Log** – Status, Ordner, Protokoll.

## Turnierbaum (Reiter Turnier, Szene „Turnierbaum“)

* **„Turnier übernehmen“** (FACEIT-Link): holt Teams mit Logos, Spielern und Statistiken und übernimmt den **genauen Aufbau** –
  Gruppen mit Tabelle (jeder gegen jeden) oder den Baum genau so, wie FACEIT ihn führt. „Ergebnisse aktualisieren“ holt neue Spielstände.
* **Punkteregel je Turnier** (Gruppen mit Tabelle): Vorlagen wie „Sieg 3 · Niederlage mit Map-Gewinn 1 · Niederlage 0“ oder eigene Werte
  für Sieg 2:0, Sieg 2:1, Niederlage 1:2, Niederlage 0:2 und Unentschieden. Bei Punktgleichheit zählt der direkte Vergleich, dann die
  Rundendifferenz (RD, holt die App von FACEIT), dann die Siege. **„Gruppe im Overlay“** zeigt alle Gruppen oder nur eine –
  die Tabellen passen sich der Fläche an (eine Gruppe groß, mehrere nebeneinander).
* Formate von Hand: **Gruppen mit Tabelle** (Gruppenzahl, Plätze die weiterkommen, offene Spiele unter der Tabelle), **Single Elimination**, **Double Elimination** (oben/unten + Grand Final), **Swiss** (Siege/Niederlagen einstellbar,
  „Nächste Runde auslosen“) und **Gruppen (GSL)** – bis 32 Teams. Reihenfolge der Teams = Setzliste, Freilose werden automatisch vergeben.
* Teams mit Kürzel, Logo, Spielern und optionaler FACEIT-Team-ID. FACEIT-Turnier (Link oder ID) →
  **„Turnier übernehmen“**, **„Ergebnisse aktualisieren“** und **„Team-Statistiken von FACEIT laden“** (Siegquote, Spiele,
  Serie, letzte Ergebnisse) – oder alles von Hand.
* **Klick auf ein Team** im Baum hebt es im Overlay hervor und zeigt sein Profil.
* Sichtbarkeit: alles, **Runde für Runde aufdecken** (bis Runde X), **erst ab Runde X**, Ergebnisse ausblenden (nur, wer weiterkommt).

## Themes (Setup → Aussehen → Themes)

Neue Themes anlegen, **duplizieren**, **löschen** (mit Rückgängig), **exportieren** und **importieren**.
Ein Export ist eine Datei mit allen Farben, Logos, Bildern und Sponsoren – zum Teilen mit anderen Castern oder als Sicherung.
Mitgelieferte Themes lassen sich nicht löschen, nur zurücksetzen („Theme anpassen“ → „Dieses Theme auf Standard zurücksetzen“). „Regulär“ ist jetzt Nachtviolett mit neutralem Logo-Feld
für dein Org- oder Streamer-Logo (Theme anpassen → Logo-Feld).

## Einblendungen

Im Bereich Einblendungen stehen deine **Favoriten (★)** mit Schalter; „Alle …“ zeigt alle, „+ Neu“ legt eine neue an.
**⋯** an einer Einblendung öffnet ihre Einstellungen: **Name in der Liste**, **Position**, **Dauer** (danach automatisch aus),
**Wiederholen alle … Min.** (z. B. Sponsor-Hinweis alle 10 min für 15 s) und **Nur in diesen Szenen**; dazu Duplizieren,
Nach oben/unten und Löschen (mit Rückgängig). Arten:
* **Caster:** alle Caster auf einmal, untereinander oder nebeneinander, auf Wunsch mit Gast.
* **Bauchbinde:** Name + Zusatz.
* **Hinweis:** z. B. „Gleich geht's weiter".
* **Punktestand:** Logos + Stand.
* **Map-Info:** Pick · Map · Next, automatisch aus Veto & Serie.
* **Map-Fakt:** Fakten zur aktuellen Map. Du trägst sie im Map-Pool ein (ein Fakt pro Zeile). Sie wechseln automatisch.

In der Szene **Ingame** weichen alle Positionen dem Spiel-HUD aus (Minimap, Scoreboard, Killfeed, Spielerkarten).

## Die Oberfläche (wie in OBS)

* **Oben** wählst du den Arbeitsbereich (Operator, Caster – große Knöpfe, Laptop / neben OBS, Vorbereitung oder eigene).
* **Strg K** öffnet „Suchen & Befehle“: Szene wechseln, Einblendung zeigen, Bereich öffnen oder andocken – alles per Tastatur.
  **Strg 1–4** springt zu Live, Match, Turnier und Setup.

* **Links** die Reiter, **in der Mitte** die Vorschau. Nur im Modus **Layout bearbeiten** lassen sich Bereiche **unter die Vorschau** oder **rechts daneben** andocken:
  am Titel (⠿) greifen und ziehen – die möglichen Ablageflächen leuchten auf, eine Linie zeigt, wo der Bereich landet.
  Zurück in den Reiter: auf die linke Spalte ziehen. Alternativ **⧉** am Bereich → Ort wählen.
* Über einer angedockten Karte erscheint ein **Kompass**: Rand = davor/danach einsortieren, **Mitte = als Tab** stapeln.
  Tabs anklicken zum Wechseln, an der Tab-Leiste wieder herausziehen.
* **Umsortieren:** Bereiche im Reiter einfach nach oben/unten ziehen – die Reihenfolge bleibt gespeichert.
* **Szenen anordnen:** in „Layout bearbeiten“ im Bereich „Szenen“ auf **✎ Anordnen** – Knöpfe an die gewünschte Stelle ziehen, Haken = Szene wird angezeigt.
  Standard sind fünf Gruppen: **Vor dem Spiel** (Intro, Cast Solo, Cast Duo, Line-ups, Map-Veto) · **Im Spiel** (Ingame) ·
  **Stats & Turnier** (Scoreboard, Team A/B, Head-to-Head, Turnierbaum, Serie) · **Pause** (Pause, Sponsoren, Clips) ·
  **Nach dem Spiel** (Interviews, Ende).
* **Docks zeigen immer alles:** reicht der Platz nicht, scrollt jede Karte für sich. Doppelklick auf die Trennlinie über dem
  Vorschau-Dock passt die Höhe an den Inhalt an.
* **🔒 Schloss** mittig auf der Trennlinie von Reiter-Spalte, Vorschau-Dock und Seiten-Dock: gesperrt ändert sich dort nichts mehr –
  nichts hinein- oder herausziehen, keine Größenänderung, Arbeitsbereiche lassen den Bereich in Ruhe.
* **Lage frei wählbar** (⚙ → Oberfläche oder Strg K): Reiter-Spalte links/rechts, Seiten-Dock links/rechts der Vorschau,
  Vorschau-Dock unter oder über der Vorschau.
* **Trennlinien** ziehen, um Breite bzw. Höhe zu ändern. **⇥** klappt die Vorschau ein.
* Oben: Verbindungsanzeige („… von 3 verbunden“: OBS, Overlays, Musik), **Suchen & Befehle**, **⊟ / ⊞** alle Bereiche
  ein/aus, **− / 100 % / +** alles kleiner/größer, Layout bearbeiten, **⚙** App-Einstellungen, **⏻** Schließen.

## App-Einstellungen (⚙)

Alles, was nur die App betrifft: **Sprache · Language**, **Verbindung zu OBS**, **Musik (Spotify über Tuna)**,
**Aussehen der App** (Dunkel, Hell, Wie Windows; Größe der Oberfläche), **Oberfläche** (Lage der Docks, „Anordnung
zurücksetzen“, „‚Erste Schritte‘ wieder zeigen“), **Update** und **App** („App ganz beenden“, „Daten & Log öffnen“).
Alles rund um CS bleibt in den Reitern.

**Browserquellen umstellen:** Unter ⚙ → Verbindung zu OBS zeigt die App, welche ihrer Browserquellen noch keinen
Zugangsschlüssel haben. „Browserquellen umstellen“ stellt sie um – jede lädt dabei einmal kurz neu, also nicht während
der Sendung.

## Update (ab 2.3)

Unter ⚙ → **Update**: „Nach Updates suchen“ fragt GitHub, ob es eine neuere Version gibt. Gibt es eine, aktualisiert
**„Jetzt aktualisieren“** die App mit einem Klick: Sie lädt die passende Datei, vergleicht sie mit der Prüfsumme von
GitHub, beendet sich, setzt die neue Version ein und startet neu. Einstellungen, Bilder und Zugänge bleiben.

| Installiert als | Update |
|---|---|
| Windows mit `…-Setup.exe` | automatisch (der Installer läuft unsichtbar) |
| Linux AppImage | automatisch (die AppImage-Datei wird ersetzt) |
| macOS (`.dmg`/`.zip`) | automatisch (die App im Programme-Ordner wird ersetzt) |
| Windows portable, aus dem Quellcode | „Download-Seite öffnen“ – von Hand ersetzen |

* **Bei jedem Start nach Updates suchen** (Standard: an) – findet die App eine neue Version, sagt sie es im Tray;
  ein Klick darauf öffnet den Bereich Update.
* Beim ersten Start nach einem Update steht dort „aktualisiert von v…“.
* Nicht während einer laufenden Sendung aktualisieren: Die Overlays in OBS sind dabei kurz weg.

## Sprache · Language (ab 2.2)

Unter ⚙ → **Sprache · Language** gibt es zwei Einstellungen, die unabhängig voneinander sind – z. B. die App auf
Englisch und die Overlays auf Deutsch:
* **Sprache der App** (Deutsch / English): Steuerseite, Dialoge und Tray-Menü. Die Steuerseite lädt danach kurz neu.
* **Sprache der Overlays** (Deutsch / English): die festen Texte im Stream – Überschriften wie „PAUSE“/„BREAK“,
  „ENDSTAND“/„FINAL SCORE“, Turnierrunden, Statistik-Köpfe. Texte, die du selbst geändert hast, bleiben, wie sie sind;
  nur Texte, die noch auf dem Standard stehen, wechseln die Sprache. Die Overlays in OBS ändern sich sofort mit.

## Szenenwechsel

Was in beiden Szenen vorkommt (Logo, Lauftext, Match-Up, Sponsor, Kameras …), **bleibt stehen oder gleitet an seinen neuen Platz**.
Nur was sich ändert, blendet aus bzw. ein – je nach gewähltem Übergang (Blende, Schieben, Wischen, Schnitt, Stinger).
Kameras laufen dabei ohne Neuladen weiter.

## Gut zu wissen

* **Nur eine App:** Startest du die App ein zweites Mal, kommt einfach das vorhandene Fenster nach vorn.
  Eine **neuere Version** löst eine laufende ältere automatisch ab (die Overlays verbinden sich danach von selbst neu).
* **Ohne Fenster:** `Casting-App --no-window` (oder `--ohne-fenster`) startet nur den Server für die Overlays (kein Fenster, kein Symbol).
* **Videos** (Hintergrund) und **eigene Schriften** liegen in *Dokumente → Casting-App*. Die App öffnet die Ordner per Knopf.
* **Wer spielt die Videos ab?** (Setup → Hintergrund)
  * **OBS** (empfohlen): alle Formate, die OBS kann, auch H.265 und 4K, mit Hardware-Dekodierung. Die App legt die Medienquelle
    „Cast – Hintergrund" direkt unter das Overlay (über die Spielaufnahme) und blendet sie in der Ingame-Szene automatisch aus.
  * **Das Overlay**: am sichersten MP4 (H.264) oder WebM (VP9). Die App prüft jedes Video.
* **Einstellungen, Bilder und Log** liegen in *%APPDATA%\Casting-App* (Linux/macOS: *~/.casting-app*). Der Reiter **Log** zeigt, was gerade passiert,
  welche Overlays verbunden sind (auch die in OBS) und öffnet alle Ordner.
* **FACEIT:** Match → Import & Sitzungen → FACEIT: API-Key (Server side, von developers.faceit.com) → „Schlüssel speichern“,
  Matchroom-Link einfügen, „Daten holen" (optional „alle 15 s aktualisieren“).
* **CS2-Livedaten:** Setup → CS2-Livedaten führt Schritt für Schritt durch die Einrichtung – für CS2 auf diesem PC
  („Automatisch einrichten“, „Auf allen Laufwerken suchen“, Pfad direkt eintippen – mit Vorschlägen – oder „Ordner durchsuchen …“
  mit Suchfeld) oder auf einem Observer-PC im Netzwerk (Port 8788, Datei mit
  Adresse und Schlüssel zum Herunterladen). Das Match als Zuschauer öffnen (GOTV/Observer), dann liefert CS2 alle 10 Spieler.
  Neue Szenen: **Scoreboard**, **Team A**, **Team B**, **Head-to-Head** · neue Einblendungen: **Scoreboard (live)**, **Spieler (live)**.
  Zur Halbzeit tauscht die App die Seiten selbst; ADR und HS % rechnet sie aus den Rundendaten mit.
* **Hintergrund-Video: am besten spielt OBS es ab.** Die Browserquelle in OBS gibt Videos nicht zuverlässig wieder
  (in der App-Vorschau läuft es trotzdem). Sobald ein Overlay in OBS verbunden ist, bietet die App oben „OBS spielt ab – einrichten" an:
  ein Klick, kurz bestätigen – dann spielt OBS das Video als Medienquelle unter dem Overlay (auch H.265/AV1, mehrere Videos mit VLC).
* **Probleme?** Der Reiter **Log** zeigt auch Meldungen aus den Overlays in OBS, z. B. wenn ein Video nicht abspielt.
* „In OBS anlegen" bzw. „Szene ‚Cast – Sendung‘ in OBS anlegen" stellt auch **vorhandene** Browserquellen aus älteren Versionen auf die App um.
* **Ruckelt die Vorschau oder bleibt das Fenster schwarz** (alter Grafiktreiber)? Die App mit `--no-gpu` (oder `--ohne-gpu`) starten.
* Einstellungen der Vorversion („Cast-Overlay") übernimmt die App beim ersten Start automatisch.

## Sicherheitsabfragen

* **Alles, was OBS verändert** (Szenen anlegen, Hintergrund-Quelle einrichten), zeigt vorher eine Liste, was genau passiert –
  erst „In OBS ausführen" ändert etwas. Gelöscht wird in OBS nichts – nur „Cleanfeed-Szene in OBS anlegen“ ersetzt
  eine vorhandene Szene „Cast – Cleanfeed“.
* **Veto neu starten / leeren, Sitzung laden, FACEIT-Daten übernehmen, alles zurücksetzen, App beenden** fragen nach,
  wenn dabei Eingetragenes verloren ginge.
* **Entfernen** (Einblendung, Map, Sponsor, Spieler, Veto-Schritt) lässt sich ein paar Sekunden lang **rückgängig** machen.

## Signatur

Die Windows-Dateien sind nicht signiert, deshalb warnt Windows beim ersten Start. Eine vertrauenswürdige Signatur braucht ein
Code-Signing-Zertifikat, das auf deinen Namen ausgestellt ist (z. B. Microsoft Trusted Signing oder ein OV/EV-Zertifikat einer
Zertifizierungsstelle). Mit so einem Zertifikat signiert der Bau (`tools/build.py`) Installer und App selbst, siehe ENTWICKLUNG.md.
Die macOS-App ist nur ad-hoc signiert (ohne Apple-Konto); die Beglaubigung durch Apple (Notarisierung) ist vorbereitet, aber aus.

## Sicherheit

* Die App nimmt nur Anfragen von **diesem PC** an. Andere Geräte im Netz werden abgelehnt.
* Nur die eigenen Seiten dürfen zugreifen, keine Webseiten aus dem Internet.
* **Zugangsschlüssel (ab 2.3):** Die App erzeugt beim ersten Start einen geheimen Schlüssel (im Schlüsselbund). Nur
  Seiten mit diesem Schlüssel – das App-Fenster und die Browserquellen, die die App in OBS anlegt – dürfen etwas ändern,
  die DACH-CS-Seiten öffnen oder sich bei OBS anmelden. Andere Programme auf dem PC kommen nicht heran.
  Browserquellen aus älteren Versionen findet die App beim Verbinden mit OBS und fragt, ob sie sie umstellen soll
  (jede lädt dabei einmal kurz neu – nicht während des Streams bestätigen). Bis dahin zeigen sie alles außer den
  DACH-CS-Seiten und den Kameras (Kamera-Links können Passwörter enthalten und gehen nur an Quellen mit Schlüssel).
  Die Steuerseite im normalen Browser: ⚙ App-Einstellungen → Verbindung zu OBS → „Steuerseite im Browser öffnen“
  (der Link gilt einmal und 2 Minuten – im Browser-Verlauf ist er danach wertlos).
* **Kaputte Dateien halten die App nicht auf:** Ist z. B. nach einem Stromausfall eine Datei im Datenordner beschädigt,
  legt die App sie als `….damaged` beiseite, startet mit Standardwerten und schreibt es ins Log.
* **Vom PC geht nur nach außen:** FACEIT-Abfragen (Match, Turnier, Team-Statistiken – mit deinem API-Key), die
  DACH-CS-Seiten (mit ID und Key), Kameras und Clips, die du selbst einträgst, und die Frage an GitHub, ob es eine
  neuere Version gibt (nur die Versionsliste; abschaltbar unter ⚙ → Update). Updates kommen nur aus den Releases dieses Projekts und nur mit passender Prüfsumme.
* Das **OBS-Passwort** liegt ebenfalls im Schlüsselbund. Die Anmeldung bei OBS rechnet die App selbst aus, das Passwort
  steht nicht im Browser-Speicher der Steuerseite (ein altes wird beim ersten Start umgezogen).
* Der **FACEIT-Schlüssel** sowie **Nutzer-ID und Key für DACH CS** liegen nur im Schlüsselbund des Systems – Windows:
  Anmeldeinformationsverwaltung (an dein Windows-Konto gebunden) · macOS: Schlüsselbund · Linux: Secret Service bzw. KWallet.
  Im Datenordner der App liegt nichts davon. Gibt es keinen Schlüsselbund (manche Linux-Systeme), fragt die App beim Start,
  ob sie die Schlüssel (auch das OBS-Passwort) stattdessen mit einem **eigenen Passwort** geschützt speichern soll (Datei `secrets.vault`,
  ohne das Passwort nicht lesbar; das Passwort wird bei jedem Start abgefragt). Ohne Passwort gelten sie nur bis zum
  Beenden der App. Ohne Fenster (`--no-window`) öffnet die Umgebungsvariable `CASTING_APP_VAULT_PASSWORD` den Tresor. Sie werden nach dem Speichern nie wieder angezeigt –
  nicht in der App, nicht in Sicherungen, Sitzungen, Exporten oder im Log – und keine Schnittstelle gibt sie heraus.
  Die App setzt sie nur intern ein (FACEIT-Abfragen, Weiterleitung zu den DACH-CS-Browserquellen). DACH CS verlangt
  ID und Key in der Adresse seiner Seiten – sie stehen deshalb in der Adresse der DACH-Rahmen in OBS. Zeige die
  Eigenschaften dieser Rahmen oder die OBS-Entwicklerwerkzeuge nicht im Stream.
* Im App-Fenster laufen nur die eigenen Seiten; Links nach draußen öffnet der Standardbrowser. Kamera und Mikrofon dürfen nur
  die eigenen Seiten benutzen.
* Der Netzwerk-Empfang für CS2 (Port 8788) ist aus, bis du ihn einschaltest, und nimmt dann nur CS2-Spielstände mit deinem Schlüssel an.
* Die App liefert nur ihre eigenen Dateien sowie Videos und Schriften aus deinen Ordnern aus.
