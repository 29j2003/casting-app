# Casting-App

Steuerung und Overlays für CS2-Casts in OBS – eine Desktop-App für Windows, Linux und macOS, eine Browserquelle.
Szenen mit Übergängen, Einblendungen, Themes (u. a. DACH CS – Offiziell), FACEIT-Import, CS2-Livedaten (GSI),
Turnierbaum/Tabellen, Ton-Steuerung über OBS. Oberfläche und Overlays auf Deutsch oder Englisch.

**Herunterladen:** [neueste Version](https://github.com/29j2003/casting-app/releases/latest) –
Windows `…-Setup.exe`, Linux `…-linux-x86_64.AppImage`, macOS `…-mac-arm64.dmg` (Apple Silicon) bzw. `…-mac-x64.dmg` (Intel).

| Dokument | Für wen |
|---|---|
| [LIESMICH.md](LIESMICH.md) | **Nutzer:** installieren, einrichten, alle Funktionen |
| [ENTWICKLUNG.md](ENTWICKLUNG.md) | **Entwickler:** Aufbau, Rezepte für Änderungen, Tests, Bauen, Signieren, Release |
| [CLAUDE.md](CLAUDE.md) | Arbeitsanweisungen für den KI-Assistenten Claude Code (Kurzfassung der Regeln) |

Schnellstart aus dem Quellcode (Python 3.11+):

```
pip install -e ".[test]"
python -m casting_app
```

Die Browserquelle in OBS legt die App selbst an: Setup → Szenen & OBS → „In OBS anlegen“ (sie bekommt dabei den
Zugangsschlüssel der App, siehe [LIESMICH.md](LIESMICH.md#sicherheit)).

Zugangsdaten (FACEIT-Key, DACH-CS-Zugang, OBS-Passwort) speichert die App nur im Schlüsselbund des Systems –
nie in Dateien, Exporten oder im Log. Der Server ist nur von diesem PC aus erreichbar.

## Über dieses Projekt

Die Casting-App war eine Idee und ein Konzept: Ich wollte ausprobieren, wie weit man mit Claude kommt – in einem
Bereich, den ich gerne mache, dem Casten. Alles hier ist komplett mit Claude entstanden; ich selbst habe ehrlich gesagt
keine Ahnung vom Programmieren. Sieh es als eine Art Kunstprojekt.

Nutze es, wie du willst: verändern, weiterbauen, auseinandernehmen, in eigene Projekte übernehmen – alles erlaubt,
ohne Nachfrage. Mir ist das egal, Hauptsache, du hast Spaß damit.

*In English:* This app started as an idea – a test of how far you can get with Claude, in something I enjoy doing:
casting. Everything here was built entirely with Claude; I honestly have no idea how to program. Think of it as an
art project. Use it however you like – change it, build on it, take it apart. No need to ask. Have fun.

Lizenz: [The Unlicense](LICENSE) – gemeinfrei, ohne Bedingungen.
