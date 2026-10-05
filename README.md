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

In OBS eine Browserquelle mit `http://localhost:8787/overlay.html` (1920 × 1080) anlegen – oder in der App
Setup → Szenen & OBS → „In OBS anlegen“.

Zugangsdaten (FACEIT-Key, DACH-CS-Zugang, OBS-Passwort) speichert die App nur im Schlüsselbund des Systems –
nie in Dateien, Exporten oder im Log. Der Server ist nur von diesem PC aus erreichbar.

Lizenz: The Unlicense.
