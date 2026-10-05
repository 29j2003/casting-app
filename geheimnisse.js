/* =====================================================================
   Geheimnisse der Casting-App: FACEIT-Key, DACH-CS-Nutzer-ID und DACH-CS-Key
   - verschlüsselt mit dem „Tresor“ der Desktop-App (Electron safeStorage):
       Windows: DPAPI (an dein Windows-Konto gebunden) · macOS: Schlüsselbund · Linux: Secret Service / KWallet
   - je Geheimnis eine Datei im Datenordner (*.geheim, nur für dein Konto lesbar)
   - die Werte bleiben im Server: kein Zustand, kein Log, kein Export, keine API-Antwort enthält sie
   - ohne Tresor (z. B. „node server.js“ zum Entwickeln) gelten sie nur für die laufende Sitzung

   Übernahme alter Dateien (einmalig, danach werden sie gelöscht):
     faceit.schluessel, dach.schluessel – Windows: DPAPI über PowerShell, sonst Base64
     dach.json                          – Nutzer-ID im Klartext
   ===================================================================== */
"use strict";
const fs = require("fs"), path = require("path");

const PRUEFEN = {
  faceit: k => /^[A-Za-z0-9-]{8,100}$/.test(k),
  dachId: k => /^\d{1,9}$/.test(k),
  dachKey: k => /^[A-Za-z0-9-]{5,64}$/.test(k)
};
const DATEI = { faceit: "faceit.geheim", dachId: "dach-id.geheim", dachKey: "dach-key.geheim" };

// Alte Windows-Dateien: mit DPAPI (CurrentUser) über PowerShell entschlüsseln – nur für die einmalige Übernahme
const PS_AUF = "Add-Type -AssemblyName System.Security; $i=[Console]::In.ReadToEnd(); $b=[Convert]::FromBase64String($i.Trim()); [Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser')))";
function dpapiAuf(inhalt) {
  const enc = Buffer.from(PS_AUF, "utf16le").toString("base64");
  const r = require("child_process").spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", enc],
    { input: inhalt, encoding: "utf8", timeout: 15000, windowsHide: true });
  if (r.status !== 0) throw new Error("DPAPI fehlgeschlagen");
  return r.stdout;
}

module.exports = function geheimnisseAnlegen({ ordner, tresor, log = () => {}, windows = process.platform === "win32" }) {
  const werte = {};
  const pfad = name => path.join(ordner, DATEI[name]);
  const dauerhaft = () => !!(tresor && tresor.verfuegbar());

  function schreiben(name, wert) {
    if (!dauerhaft()) return false;
    fs.writeFileSync(pfad(name), tresor.verschluesseln(wert), { mode: 0o600 });
    return true;
  }
  function lesen(name) {
    if (!dauerhaft() || !fs.existsSync(pfad(name))) return;
    try {
      const k = tresor.entschluesseln(fs.readFileSync(pfad(name)));
      if (PRUEFEN[name](k)) werte[name] = k;
    } catch (e) { log(`Gespeichertes Geheimnis (${name === "faceit" ? "FACEIT-Key" : "DACH-CS-Zugang"}) nicht lesbar – bitte neu eintragen`, "warn"); }
  }

  // Einmalige Übernahme aus den Dateien von Version 1.x
  function uebernehmen() {
    if (!dauerhaft()) return;
    const alt = [["faceit", "faceit.schluessel", "dpapi"], ["dachKey", "dach.schluessel", "dpapi"], ["dachId", "dach.json", "json"]];
    for (const [name, datei, art] of alt) {
      const voll = path.join(ordner, datei);
      if (!fs.existsSync(voll)) continue;
      if (fs.existsSync(pfad(name))) { try { fs.unlinkSync(voll); } catch (e) {} continue; }   // schon übernommen
      try {
        const inhalt = fs.readFileSync(voll, "utf8");
        let k;
        if (art === "json") k = String(JSON.parse(inhalt).userid || "");
        else k = windows ? dpapiAuf(inhalt) : Buffer.from(inhalt, "base64").toString("utf8");
        k = k.trim();
        if (PRUEFEN[name](k)) { schreiben(name, k); log(`Altes Geheimnis übernommen (${datei} → ${DATEI[name]})`); }
        fs.unlinkSync(voll);
      } catch (e) {
        // nicht lesbar (z. B. anderes Windows-Konto): beiseitelegen, damit nicht bei jedem Start erneut versucht wird
        try { fs.renameSync(voll, voll + ".nicht-lesbar"); } catch (x) {}
        log(`Alte Datei ${datei} nicht lesbar – bitte den Wert neu eintragen`, "warn");
      }
    }
  }

  if (tresor && !tresor.verfuegbar()) log("Verschlüsselung nicht verfügbar – Schlüssel gelten nur für diese Sitzung", "warn");
  else if (tresor && tresor.art && tresor.art() === "basic_text")
    log("Kein Schlüsselbund gefunden (Linux: Secret Service/KWallet) – Schlüssel nur einfach verschlüsselt", "warn");
  uebernehmen();
  for (const name of Object.keys(DATEI)) lesen(name);

  return {
    da: name => !!werte[name],
    holen: name => werte[name] || null,              // nur intern im Server benutzen
    dauerhaft,
    setzen(name, wert) {
      if (!PRUEFEN[name](wert)) throw new Error("ungültig");
      schreiben(name, wert);
      werte[name] = wert;
    },
    loeschen(name) { delete werte[name]; try { fs.unlinkSync(pfad(name)); } catch (e) {} }
  };
};
