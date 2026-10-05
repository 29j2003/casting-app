# Signieren mit SignPath (kostenlos für Open-Source-Projekte)

Die SignPath Foundation stellt Open-Source-Projekten ein echtes Code-Signing-Zertifikat kostenlos zur Verfügung.
Damit verschwindet die SmartScreen-Warnung „Windows hat den PC geschützt“.

## Einmal einrichten (durch den Inhaber des Repositorys)

1. Voraussetzungen: das Repository ist **öffentlich** und hat eine OSI-anerkannte Lizenz (hier: The Unlicense ✓);
   die Dateien werden nur in GitHub Actions aus dem Quellcode gebaut (✓, `.github/workflows/bauen.yml`).
2. Bei <https://signpath.org/apply> bewerben (Projekt: Casting-App, Repository-Link angeben).
3. Nach der Zusage im SignPath-Konto anlegen:
   * Projekt mit dem Kürzel `casting-app`, GitHub als vertrauenswürdige Build-Quelle verbinden
   * zwei Artifact Configurations mit den Kürzeln `app-folder` und `installer` – Inhalt: die Dateien in diesem Ordner
   * eine Signing Policy, z. B. `release-signing`
4. Im GitHub-Repository unter Settings → Secrets and variables → Actions eintragen:
   * Secret `SIGNPATH_API_TOKEN` (API-Token eines CI-Benutzers aus SignPath)
   * Variablen `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG` (`casting-app`), `SIGNPATH_SIGNING_POLICY_SLUG`

Sobald das Secret gesetzt ist, signiert der Windows-Bau automatisch in zwei Runden:
`build.py app` → `Casting-App.exe` signieren → `build.py package` → Installer signieren.
Ohne Secret wird wie bisher unsigniert gebaut.

Laut den Bedingungen der SignPath Foundation muss das Projekt auf seiner Seite angeben:
„Free code signing provided by SignPath.io, certificate by SignPath Foundation“ (steht dann in der Haupt-README).
