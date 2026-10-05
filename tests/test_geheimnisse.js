// Prüft geheimnisse.js ohne Electron: Speichern, Laden, Löschen und die einmalige Übernahme der Dateien aus Version 1.x
// (Windows-Weg mit nachgestellter PowerShell/DPAPI, sonst Base64).   node tests/test_geheimnisse.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
let fehler = 0;
const pruefe = (ok, text) => { console.log(`${ok ? "✓" : "✗"} ${text}`); if (!ok) fehler++; };

// Tresor zum Testen: „verschlüsselt“ mit XOR, damit der Klartext nicht in der Datei steht
const tresor = { verfuegbar: () => true, art: () => "test",
  verschluesseln: t => Buffer.from(Buffer.from(t, "utf8").map(b => b ^ 0x5a)), entschluesseln: b => Buffer.from(b.map(x => x ^ 0x5a)).toString("utf8") };
// PowerShell/DPAPI nachstellen: „entschlüsselt“ = Base64 rückwärts gelesen
const echtesSpawnSync = cp.spawnSync;
cp.spawnSync = (cmd, args, opt) => cmd === "powershell.exe"
  ? { status: 0, stdout: Buffer.from(String(opt.input).trim().split("").reverse().join(""), "base64").toString("utf8") }
  : echtesSpawnSync(cmd, args, opt);
const anlegen = require("../geheimnisse.js");

for (const windows of [true, false]) {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "cast-geheim-"));
  const alt = t => windows ? Buffer.from(t).toString("base64").split("").reverse().join("") : Buffer.from(t).toString("base64");
  fs.writeFileSync(path.join(ordner, "faceit.schluessel"), alt("abcdefgh-1234-5678"));
  fs.writeFileSync(path.join(ordner, "dach.schluessel"), alt("dachkey-0815"));
  fs.writeFileSync(path.join(ordner, "dach.json"), JSON.stringify({ userid: "4242" }));
  const log = [];
  const g = anlegen({ ordner, tresor, windows, log: t => log.push(t) });
  const sys = windows ? "Windows/DPAPI" : "Base64";
  pruefe(g.holen("faceit") === "abcdefgh-1234-5678" && g.holen("dachKey") === "dachkey-0815" && g.holen("dachId") === "4242", `${sys}: alte Dateien übernommen`);
  pruefe(!["faceit.schluessel", "dach.schluessel", "dach.json"].some(f => fs.existsSync(path.join(ordner, f))), `${sys}: alte Dateien gelöscht`);
  const roh = ["faceit.geheim", "dach-key.geheim", "dach-id.geheim"].map(f => fs.readFileSync(path.join(ordner, f), "latin1")).join("");
  pruefe(!roh.includes("abcdefgh") && !roh.includes("dachkey") && !roh.includes("4242"), `${sys}: neue Dateien enthalten keinen Klartext`);
  pruefe(!log.join(" ").match(/abcdefgh|dachkey|4242/), `${sys}: nichts Geheimes im Log`);
  const g2 = anlegen({ ordner, tresor, windows });
  pruefe(g2.holen("faceit") === "abcdefgh-1234-5678" && g2.da("dachId"), `${sys}: nach Neustart wieder da`);
  g2.loeschen("faceit");
  pruefe(!anlegen({ ordner, tresor, windows }).da("faceit"), `${sys}: Löschen wirkt dauerhaft`);
  fs.rmSync(ordner, { recursive: true, force: true });
}
// nicht lesbare alte Datei (z. B. anderes Windows-Konto) wird beiseitegelegt, nicht bei jedem Start neu versucht
{
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "cast-geheim-"));
  fs.writeFileSync(path.join(ordner, "faceit.schluessel"), "kaputt");
  cp.spawnSync = () => ({ status: 1, stdout: "" });
  const g = anlegen({ ordner, tresor, windows: true });
  pruefe(!g.da("faceit") && fs.existsSync(path.join(ordner, "faceit.schluessel.nicht-lesbar")), "nicht lesbare alte Datei: beiseitegelegt, App läuft weiter");
  fs.rmSync(ordner, { recursive: true, force: true });
}
// ohne Tresor (node server.js): nur für die Sitzung, keine Datei
{
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "cast-geheim-"));
  const g = anlegen({ ordner });
  g.setzen("faceit", "abcdefgh-9999");
  pruefe(g.da("faceit") && !g.dauerhaft() && fs.readdirSync(ordner).length === 0, "ohne Tresor: nur im Speicher, keine Datei");
  fs.rmSync(ordner, { recursive: true, force: true });
}
console.log(fehler ? `\n${fehler} Fehler` : "\nAlles in Ordnung");
process.exit(fehler ? 1 : 0);
