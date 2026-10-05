// Baut die Desktop-App mit electron-builder für Windows, Linux und macOS.
//   node tools/bauen.js            → für das System, auf dem gebaut wird
//   node tools/bauen.js win        → Windows: Installer (NSIS) + portable .exe
//   node tools/bauen.js linux      → Linux: AppImage
//   node tools/bauen.js mac        → macOS: dmg + zip für Intel und Apple Silicon (nur auf einem Mac)
// Einstellungen: electron-builder.config.js · Ergebnis: dist/
"use strict";
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");

const WURZEL = path.join(__dirname, "..");
const VERSION = require(path.join(WURZEL, "package.json")).version;

// Version muss in server.js und web/cast-kern.js gleich sein (sonst laden sich die Overlays ständig neu)
for (const f of ["server.js", "web/cast-kern.js"]) {
  const t = fs.readFileSync(path.join(WURZEL, f), "utf8");
  if (!t.includes(`const VERSION = "${VERSION}"`)) { console.error(`✗ ${f}: VERSION passt nicht zu package.json (${VERSION})`); process.exit(1); }
}
console.log(`✓ Version ${VERSION} in package.json, server.js und web/cast-kern.js`);

const ZIELE = { win: "--win", linux: "--linux", mac: "--mac" };
const gewuenscht = process.argv.slice(2);
for (const z of gewuenscht) if (!ZIELE[z]) { console.error("unbekanntes Ziel: " + z + " (win, linux, mac)"); process.exit(1); }
const cli = require.resolve("electron-builder/cli.js", { paths: [WURZEL] });
execFileSync(process.execPath, [cli, "--config", "electron-builder.config.js", "--publish", "never", ...gewuenscht.map(z => ZIELE[z])],
  { cwd: WURZEL, stdio: "inherit" });
for (const f of fs.readdirSync(path.join(WURZEL, "dist")).filter(f => /\.(exe|AppImage|dmg|zip)$/.test(f)))
  console.log(`✓ dist/${f} (${(fs.statSync(path.join(WURZEL, "dist", f)).size / 1048576).toFixed(1)} MB)`);
