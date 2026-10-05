// Baut die Casting-App als einzelne Programmdatei für Windows, Linux und macOS.
//   node tools/bauen.js            → alle Systeme
//   node tools/bauen.js win        → nur Windows (auch linux, mac-x64, mac-arm64)
// Windows bekommt das 29-Symbol, Versionsinfos und startet ohne Konsolenfenster.
const { execSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");

const WURZEL = path.join(__dirname, "..");
const VERSION = require(path.join(WURZEL, "package.json")).version;
const ZIELE = { win: "node20-win-x64", linux: "node20-linux-x64", "mac-x64": "node20-macos-x64", "mac-arm64": "node20-macos-arm64" };
const DATEI = { win: "Casting-App.exe", linux: "casting-app-linux", "mac-x64": "casting-app-macos-intel", "mac-arm64": "casting-app-macos-apple" };
const gewuenscht = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ZIELE);

// Version muss in server.js und web/cast-kern.js gleich sein (sonst laden sich die Overlays ständig neu)
for (const f of ["server.js", "web/cast-kern.js"]) {
  const t = fs.readFileSync(path.join(WURZEL, f), "utf8");
  if (!t.includes(`const VERSION = "${VERSION}"`)) { console.error(`✗ ${f}: VERSION passt nicht zu package.json (${VERSION})`); process.exit(1); }
}
const sh = (cmd, env) => execSync(cmd, { cwd: WURZEL, stdio: "inherit", env: Object.assign({}, process.env, env || {}) });
fs.mkdirSync(path.join(WURZEL, "dist"), { recursive: true });

for (const art of gewuenscht) {
  const ziel = ZIELE[art]; if (!ziel) { console.error("unbekanntes Ziel: " + art); process.exit(1); }
  const aus = path.join(WURZEL, "dist", DATEI[art]);
  console.log(`\n▶ ${art} (${ziel})`);
  if (art === "win") {
    // 1) Node-Basis für Windows holen, 2) Symbol + Versionsinfo hineinsetzen, 3) damit packen
    sh(`npx --yes @yao-pkg/pkg-fetch -n node20 -p win -a x64`);
    const cache = path.join(os.homedir(), ".pkg-cache");
    const basis = fs.readdirSync(cache).flatMap(d => { try { return fs.readdirSync(path.join(cache, d)).map(f => path.join(cache, d, f)); } catch (e) { return []; } })
      .filter(f => /fetched-v20[\d.]*-win-x64$/.test(f)).sort().pop();
    if (!basis) { console.error("✗ Windows-Basis nicht gefunden"); process.exit(1); }
    const mitSymbol = path.join(WURZEL, "dist", "node-win-casting.exe");
    sh(`node icon.js "${basis}" "${mitSymbol}" app.ico ${VERSION}`);
    sh(`npx --yes @yao-pkg/pkg . --targets ${ziel} --compress Brotli --fallback-to-source --output "${aus}"`, { PKG_NODE_PATH: mitSymbol });
    // 4) Subsystem auf „Windows-GUI“ setzen: kein schwarzes Konsolenfenster beim Start
    const b = fs.readFileSync(aus), pe = b.readUInt32LE(0x3c);
    b.writeUInt16LE(2, pe + 24 + 68); fs.writeFileSync(aus, b);
    fs.unlinkSync(mitSymbol);
  } else {
    sh(`npx --yes @yao-pkg/pkg . --targets ${ziel} --compress Brotli --fallback-to-source --output "${aus}"`);
  }
  console.log(`✓ ${path.relative(WURZEL, aus)} (${(fs.statSync(aus).size / 1048576).toFixed(1)} MB)`);
}
