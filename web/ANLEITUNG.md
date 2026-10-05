# Casting-App

Eine Datei, ein Fenster: **Casting-App.exe** doppelklicken, fertig.

## Beim ersten Start

1. **Casting-App.exe** starten. Windows fragt beim ersten Mal evtl. „Windows hat den PC geschützt":
   **Weitere Informationen → Trotzdem ausführen** (die Datei ist nicht signiert).
2. Es öffnet sich das Fenster **Casting-App**. Die Karte **„Erste Schritte"** führt durch alles Weitere:
   * **OBS verbinden:** OBS → Werkzeuge → WebSocket-Server-Einstellungen → „WebSocket-Server aktivieren".
     Port und Passwort („Verbindungsinformationen anzeigen") in der App unter **Setup → Verbindung** eintragen.
   * **Szenen einrichten:** Setup → **Szenen einrichten** → „Eine Browserquelle für alles" →
     **„Szene ‚Cast – Sendung' in OBS anlegen"**. In OBS gibt es dann eine Szene mit einer Browserquelle.
   * Theme, Teams und Caster eintragen.
   * **Spielbild:** In OBS die Spielaufnahme in der Szene „Cast – Sendung" **unter** die Browserquelle legen.
     In der Szene **Ingame** ist das Overlay durchsichtig, nur Sponsor und Einblendungen sind zu sehen.
3. Im Reiter **Live** Szenen per Klick wechseln, Übergang wählen, Einblendungen zeigen.

## Aufbau (ab 1.8)

* **Live** – nur, was du in der Sendung brauchst: Programm-Vorschau, Szenen, Einblendungen, **Match-Leiste**
  (Punkte, Timer, Turnier-Gruppe/Team hervorheben, „Turnier zeigen“) und Serie.
* **Match** – Unterseiten: Import & Sitzungen · Teams & Spieler · Map-Veto · Caster & Kameras · Timer & Texte.
* **Turnier** – eigener Bereich für Baum, Tabelle und FACEIT-Abgleich.
* **Setup** – Unterseiten: Aussehen · Sponsoren · Map-Pool · Hintergrund · Szenen & OBS · CS2-Livedaten.
* **Arbeitsbereiche** (oben links): Vorlagen *Operator*, *Caster – große Knöpfe*, *Laptop / neben OBS*, *Vorbereitung*
  und eigene („Aktuelle Anordnung speichern als …“). Ein Arbeitsbereich merkt sich Docks, Größen, Lage, Schlösser und Knopfgröße.
  Dein bisheriges Layout wurde als „Mein bisheriges Layout“ übernommen.
* **Layout bearbeiten** (im selben Menü oder Strg K): nur dann lassen sich Bereiche ziehen, andocken und in der Größe ändern –
  im Normalbetrieb verschiebt sich nichts aus Versehen. Leere Reiter-Spalten blenden sich aus.

## DACH CS – Offiziell (fünfter Stil)

Setup → Aussehen → Stil **„DACH CS – Offiziell“** wählen, **Nutzer-ID** und **Key** aus dem DACH-CS-Nutzerbereich
(Casting → Browserquellen) eintragen. Der Key wird verschlüsselt gespeichert und nie wieder angezeigt.

* Alles läuft in **einer** Browserquelle („Cast – Overlay“): Live → Szenen zeigt die 25 DACH-Seiten (Overview, Single-/Duocam,
  Lineup, Mapveto, Ingame, Tabelle, Playoffs, Matches, MVP, Pausen, Interaktion, Interviews, Endscreen). Die neue Seite wird
  vorgeladen und dann mit dem gewählten Übergang gewechselt (Schnitt, Blende, Schieben, Wischen, Stinger – wie bei den eigenen
  Szenen); Kameras gleiten dabei in ihre neuen Rahmen, das Bild läuft weiter. Ohne Scrollbalken, exakt 1920 × 1080.
* **Kameras und Inhalt** (Caster, Gast, Clip) setzt die App automatisch in die Rahmen der jeweiligen Seite.
  „Kamera- und Inhalts-Rahmen anpassen“ zeigt die Rahmen in der Vorschau und lässt sie pixelgenau verschieben.
* Die Inhalte der Grafiken (Teams, Ergebnisse, Tabelle …) kommen aus dem DACH-CS-Live-Dashboard. Einblendungen der App liegen darüber.
* „DACH CS – eigener Stil“ bleibt als freies Design erhalten.

## Ton (Live → Ton) – geregelt direkt in OBS

Wie im OBS-Mixer: jede Tonquelle ist eine OBS-Quelle, die App regelt sie live über OBS – **Lautstärke** (bis 300 %),
**Stumm**, **Verzögerung** (Synchronisation, −950 bis 20 000 ms) und **Abhören**: *Nur Stream* · *Stream + Abhören* · *Nur Abhören*.
Zeilen: „Cast – Overlay“ (alles, was im Overlay klingt: Clips, DACH-Seiten, Videos), „Cast – Hintergrund“ (wenn OBS das Video
abspielt) und je Caster/Gast eine eigene Quelle: bei VDO.Ninja-Gästen „Als eigene OBS-Tonquelle“ anklicken – dann ist ihr Ton
einzeln regelbar und läuft nicht mehr doppelt im Overlay. Änderungen direkt in OBS erscheinen hier ebenfalls.

**Ton im App-Fenster** (oben im Bereich Ton, Standard: aus): schaltet alles stumm oder hörbar, was in der Vorschau klingt –
Videos, Kameras, Clips, VDO.Ninja und DACH-Seiten – mit eigener Lautstärke. Der Stream bleibt davon unberührt.

## Fenster schließen

Klick aufs **X**: sofort fragt Edge „Seite verlassen?“ – **Verlassen** schließt nur das Fenster (Overlays laufen weiter),
**Abbrechen** zeigt die Auswahl **Ganz beenden · Nur Fenster schließen · Abbrechen**. Dieselbe Auswahl öffnet ⏻ oben rechts.

## Cleanfeed

In **Ingame** erscheint oben in der Programm-Karte **Cleanfeed**: blendet alle Grafiken der App aus, im Programm bleibt nur das Spielbild
(beim Szenenwechsel automatisch wieder aus). Für einen dauerhaften zweiten Ausgang: Setup → Szenen & OBS → **„Cleanfeed-Szene in OBS
anlegen“** – „Cast – Cleanfeed“ mit denselben Quellen wie die Ingame-Szene, aber ohne Grafiken (ausgeben z. B. über die virtuelle Kamera
mit Ausgabe „Szene“, NDI oder Source Record).

## Stats über dem Spiel

Läuft **Ingame**, tragen Scoreboard, Team A/B, Head-to-Head, Turnierbaum und Serie den Hinweis „ÜBER SPIEL“: ein Klick zeigt die
Ansicht über dem Spielbild (leicht abgedunkelt), ein zweiter blendet sie aus – Ingame läuft weiter. Nach der eingestellten Zeit
(Übergang ▾ → „ausblenden nach … Sekunden“, Standard 15 s, 0 = bleibt) verschwindet sie von selbst. **Umschalt-Klick** wechselt
trotzdem in die ganze Szene. In jeder anderen Szene wechseln die Knöpfe ganz normal.

## Reiter

* **Live** – alles, was du während der Sendung tust: Szenen, Einblendungen, Timer, Ergebnis, Serie, Lauftexte.
* **Match** – das aktuelle Spiel: Sitzungen, FACEIT, Map-Veto, Spieler, Caster, Kameras.
* **Setup** – Turnier & Overlay: Themes, Überschriften, Sponsoren, Map-Pool, Hintergrund, OBS-Szenen, CS2-Daten.

## Turnierbaum (Setup → Turnier, Szene „Turnierbaum“)

* **„Turnier übernehmen“** (FACEIT-Link): holt Teams mit Logos, Spielern und Statistiken und übernimmt den **genauen Aufbau** –
  Gruppen mit Tabelle (jeder gegen jeden) oder den Baum genau so, wie FACEIT ihn führt. „Ergebnisse aktualisieren“ holt neue Spielstände.
* **Punkteregel je Turnier** (Gruppen mit Tabelle): Vorlagen wie „Sieg 3 · Niederlage mit Map-Gewinn 1 · Niederlage 0“ oder eigene Werte
  für Sieg 2:0, Sieg 2:1, Niederlage 1:2, Niederlage 0:2 und Unentschieden. Bei Punktgleichheit zählt der direkte Vergleich, dann die
  Rundendifferenz (RD, holt die App von FACEIT), dann die Siege. **„Gruppe im Overlay“** zeigt alle Gruppen oder nur eine –
  die Tabellen passen sich der Fläche an (eine Gruppe groß, mehrere nebeneinander).
* Formate von Hand: **Gruppen mit Tabelle** (Gruppenzahl, Plätze die weiterkommen, offene Spiele unter der Tabelle), **Single Elimination**, **Double Elimination** (oben/unten + Grand Final), **Swiss** (Siege/Niederlagen einstellbar,
  „Nächste Runde auslosen“) und **Gruppen (GSL)** – bis 32 Teams. Reihenfolge der Teams = Setzliste, Freilose werden automatisch vergeben.
* Teams mit Kürzel, Logo, Spielern und optionaler FACEIT-Team-ID. **Teams aus einem FACEIT-Turnier laden**, **Ergebnisse übernehmen**
  und **Team-Statistiken** (Siegquote, Spiele, Serie, letzte Ergebnisse) von FACEIT holen – oder alles von Hand.
* **Klick auf ein Team** im Baum hebt es im Overlay hervor und zeigt sein Profil.
* Sichtbarkeit: alles, **Runde für Runde aufdecken** (bis Runde X), **erst ab Runde X**, Ergebnisse ausblenden (nur, wer weiterkommt).

## Themes (Setup → Themes)

Neue Themes anlegen, **duplizieren**, **löschen** (mit Rückgängig), **exportieren** und **importieren**.
Ein Export ist eine Datei mit allen Farben, Logos, Bildern und Sponsoren – zum Teilen mit anderen Castern oder als Sicherung.
Mitgelieferte Themes lassen sich nicht löschen, nur zurücksetzen. „Regulär“ ist jetzt Nachtviolett mit neutralem Logo-Feld
für dein Org- oder Streamer-Logo (Theme anpassen → Logo-Feld).

## Einblendungen

Jede Einblendung hat eigene Einstellungen (Pfeil links an der Karte): **Name**, **Position**, **Dauer** (danach automatisch aus),
**Wiederholen alle X Minuten** (z. B. Sponsor-Hinweis alle 10 min für 15 s) und **nur in bestimmten Szenen**.
Über „⋯“ duplizieren, nach oben/unten schieben oder löschen (mit Rückgängig). Arten:
* **Caster:** alle Caster auf einmal, untereinander oder nebeneinander, auf Wunsch mit Gast.
* **Bauchbinde:** Name + Zusatz.
* **Hinweis:** z. B. „Gleich geht's weiter".
* **Punktestand:** Logos + Stand.
* **Map-Info:** Pick · Map · Next, automatisch aus Veto & Serie.
* **Map-Fakt:** Fakten zur aktuellen Map. Du trägst sie im Map-Pool ein (ein Fakt pro Zeile). Sie wechseln automatisch.

In der Szene **Ingame** weichen alle Positionen dem Spiel-HUD aus (Minimap, Scoreboard, Killfeed, Spielerkarten).

## Die Oberfläche (wie in OBS)

* **Oben** wählst du die Anordnung: **Live** (Szenen und Einblendungen unter der Vorschau, Timer und Teams rechts),
  **Vorbereitung** (alles in den Reitern, große Vorschau) oder **Kompakt** (kleines Fenster, Vorschau eingeklappt).
* **Strg K** öffnet „Suchen & Befehle“: Szene wechseln, Einblendung zeigen, Bereich öffnen oder andocken – alles per Tastatur.
  **Strg 1–4** springt zu Live, Match, Setup und Log.

* **Links** die Reiter, **in der Mitte** die Vorschau. Bereiche lassen sich **unter die Vorschau** oder **rechts daneben** andocken:
  am Titel (⠿) greifen und ziehen – die möglichen Ablageflächen leuchten auf, eine Linie zeigt, wo der Bereich landet.
  Zurück in den Reiter: auf die linke Spalte ziehen. Alternativ **⧉** am Bereich → Ort wählen.
* Über einer angedockten Karte erscheint ein **Kompass**: Rand = davor/danach einsortieren, **Mitte = als Tab** stapeln.
  Tabs anklicken zum Wechseln, an der Tab-Leiste wieder herausziehen.
* Beim Start sind alle Bereiche in den Reitern **eingeklappt**; angedockte Bereiche bleiben so, wie du sie zuletzt hattest.
* **Umsortieren:** Bereiche im Reiter einfach nach oben/unten ziehen – die Reihenfolge bleibt gespeichert.
* **Szenen anordnen:** im Bereich „Szenen“ auf **✎ Anordnen** – Knöpfe an die gewünschte Stelle ziehen, Haken = Szene wird angezeigt.
  Standard ist der Sendungsablauf in vier Gruppen: **Vor dem Spiel** (Intro, Turnierbaum, Line-ups, Cast, Map-Veto) · **Im Spiel**
  (Ingame, Scoreboard, Team A/B, Head-to-Head) · **Zwischen den Maps** (Pause, Serie, Clips, Sponsoren) · **Nach dem Spiel** (Interviews, Ende).
* **Docks zeigen immer alles:** reicht der Platz nicht, scrollt jede Karte für sich. Doppelklick auf die Trennlinie über dem
  Vorschau-Dock passt die Höhe an den Inhalt an.
* **🔒 Schloss** mittig auf der Trennlinie von Reiter-Spalte, Vorschau-Dock und Seiten-Dock: gesperrt ändert sich dort nichts mehr –
  nichts hinein- oder herausziehen, keine Größenänderung, Anordnungen (Live/Vorbereitung/Kompakt) lassen den Bereich in Ruhe.
* **Lage frei wählbar** (⚙ → Oberfläche oder Strg K): Reiter-Spalte links/rechts, Seiten-Dock links/rechts der Vorschau,
  Vorschau-Dock unter oder über der Vorschau.
* **Trennlinien** ziehen, um Breite bzw. Höhe zu ändern. **⇥** klappt die Vorschau ein.
* Oben: **⚙** App-Einstellungen, **⊟ / ⊞** alle Bereiche ein/aus, **− / +** alles kleiner/größer.

## App-Einstellungen (⚙)

Alles, was nur die App betrifft: **Verbindung zu OBS**, **Musik (Tuna)**, **Aussehen** (Dunkel, Hell, wie Windows),
Größe der Oberfläche, Anordnung zurücksetzen und App beenden. Alles rund um CS bleibt in den Reitern.

## Szenenwechsel

Was in beiden Szenen vorkommt (Logo, Lauftext, Match-Up, Sponsor, Kameras …), **bleibt stehen oder gleitet an seinen neuen Platz**.
Nur was sich ändert, blendet aus bzw. ein – je nach gewähltem Übergang (Blende, Schieben, Wischen, Schnitt, Stinger).
Kameras laufen dabei ohne Neuladen weiter.

## Gut zu wissen

* **Fenster offen lassen**, solange du streamst (minimieren geht). Schließt du es, laufen verbundene OBS-Overlays weiter.
  Die App beendet sich von selbst, sobald auch OBS zu ist. Fenster wieder öffnen: die exe noch mal starten.
* **Videos** (Hintergrund) und **eigene Schriften** liegen in *Dokumente → Casting-App*. Die App öffnet die Ordner per Knopf.
* **Wer spielt die Videos ab?** (Setup → Hintergrund)
  * **OBS** (empfohlen): alle Formate, die OBS kann, auch H.265 und 4K, mit Hardware-Dekodierung. Die App legt die Medienquelle
    „Cast – Hintergrund" direkt unter das Overlay (über die Spielaufnahme) und blendet sie in der Ingame-Szene automatisch aus.
  * **Das Overlay**: am sichersten MP4 (H.264) oder WebM (VP9). Die App prüft jedes Video.
* **Einstellungen, Bilder und Log** liegen in *%APPDATA%\Casting-App*. Der Reiter **Log** zeigt, was gerade passiert,
  welche Overlays verbunden sind (auch die in OBS) und öffnet alle Ordner.
* **FACEIT:** Server-side-Key von developers.faceit.com eintragen, Matchroom-Link einfügen, „Daten holen".
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
* „Szenen in OBS anlegen" stellt auch **vorhandene** Browserquellen aus älteren Versionen auf die App um.
* Die App braucht **Microsoft Edge oder Google Chrome** (Edge ist bei Windows 10/11 dabei).
* Einstellungen der Vorversion („Cast-Overlay") übernimmt die App beim ersten Start automatisch.

## Sicherheitsabfragen

* **Alles, was OBS verändert** (Szenen anlegen, Hintergrund-Quelle einrichten), zeigt vorher eine Liste, was genau passiert –
  erst „In OBS ausführen" ändert etwas. Gelöscht wird in OBS nichts.
* **Veto neu starten / leeren, Sitzung laden, FACEIT-Daten übernehmen, alles zurücksetzen, App beenden** fragen nach,
  wenn dabei Eingetragenes verloren ginge.
* **Entfernen** (Einblendung, Map, Sponsor, Spieler, Veto-Schritt) lässt sich ein paar Sekunden lang **rückgängig** machen.

## Signatur

Die exe ist nicht signiert, deshalb warnt Windows beim ersten Start. Eine vertrauenswürdige Signatur braucht ein
Code-Signing-Zertifikat, das auf deinen Namen ausgestellt ist (z. B. Microsoft Trusted Signing oder ein OV/EV-Zertifikat einer Zertifizierungsstelle).
Mit so einem Zertifikat signiert `signieren.ps1` (im Quellcode) die exe in einem Schritt.

## Sicherheit

* Die App nimmt nur Anfragen von **diesem PC** an. Andere Geräte im Netz werden abgelehnt.
* Nur die eigenen Seiten dürfen zugreifen, keine Webseiten aus dem Internet.
* **Vom PC geht nichts nach außen.** Die einzige Verbindung nach draußen ist das Abholen der FACEIT-Match-Daten
  (nur Match-ID und dein API-Key).
* Der **FACEIT-Schlüssel** liegt verschlüsselt in der App (Windows-DPAPI, an dein Windows-Konto gebunden). Er wird nach dem
  Speichern nie wieder angezeigt – nicht in der App, nicht in Sicherungen, Sitzungen, Exporten oder im Log – und keine Schnittstelle
  gibt ihn heraus. Die App setzt ihn nur intern für FACEIT-Abfragen ein.
* Der Netzwerk-Empfang für CS2 (Port 8788) ist aus, bis du ihn einschaltest, und nimmt dann nur CS2-Spielstände mit deinem Schlüssel an.
* Die App liefert nur ihre eigenen Dateien sowie Videos und Schriften aus deinen Ordnern aus.
