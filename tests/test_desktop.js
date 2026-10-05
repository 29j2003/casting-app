// Prüft die Desktop-App (Electron) selbst: Fenster, Schließen-Dialog, Tray-Verhalten, eine Instanz, Ton im App-Fenster,
// Geheimnisse. Startet die App aus dem Quellcode – vorher darf keine Casting-App laufen.
//   npm install            (einmal; bringt electron und playwright-core mit)
//   node tests/test_desktop.js
// Unter Linux ohne Bildschirm:  xvfb-run -a node tests/test_desktop.js
"use strict";
const { _electron: electron } = require("playwright-core");
const { spawn } = require("child_process");
const path = require("path");

const WURZEL = path.join(__dirname, "..");
const EXTRA = process.getuid && process.getuid() === 0 ? ["--no-sandbox"] : [];   // als root (z. B. Container) nötig
const warte = ms => new Promise(r => setTimeout(r, ms));
let fehler = 0;
const pruefe = (ok, text) => { console.log(`${ok ? "✓" : "✗"} ${text}`); if (!ok) fehler++; };
const ping = () => fetch("http://localhost:8787/api/ping").then(r => r.json()).catch(() => null);

// kleine HTTPS-Testseite mit eigenem Zertifikat (fremde Herkunft)
function httpsTestseite() {
  try {
    const os = require("os"), fs = require("fs"), dir = fs.mkdtempSync(path.join(os.tmpdir(), "cast-test-"));
    require("child_process").execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=127.0.0.1", "-days", "1",
      "-keyout", path.join(dir, "k.pem"), "-out", path.join(dir, "c.pem")], { stdio: "ignore" });
    const s = require("https").createServer({ key: fs.readFileSync(path.join(dir, "k.pem")), cert: fs.readFileSync(path.join(dir, "c.pem")) },
      (req, res) => { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<video muted></video><p>fremde Seite</p>"); });
    return new Promise(ok => s.listen(0, "127.0.0.1", () => ok(s)));
  } catch (e) { return null; }
}
let https = null;

(async () => {
  https = await httpsTestseite();
  if (await ping()) { console.error("Es läuft schon eine Casting-App – bitte vorher beenden."); process.exit(2); }
  const t0 = Date.now();
  // nur für den Test: das selbst erzeugte Zertifikat der HTTPS-Testseite annehmen
  const app = await electron.launch({ cwd: WURZEL, args: [WURZEL, ...EXTRA, "--ignore-certificate-errors"] });
  const pg = await app.firstWindow();
  await pg.waitForFunction(() => window.castApp && document.querySelector("#beendenKnopf"), null, { timeout: 30000 });
  pruefe(true, `Fenster mit Steuerseite nach ${Date.now() - t0} ms`);
  const sichtbar = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible());
  const stumm = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.isAudioMuted());
  const kreuz = () => app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].close(); });   // wie Klick aufs X
  const dialogKnoepfe = () => pg.evaluate(() => [...document.querySelectorAll(".frage:not(#frage) button")].map(b => b.textContent));
  pruefe((await ping())?.version === "2.0.0", "Server läuft im Hauptprozess (Version 2.0.0)");
  pruefe(await pg.evaluate(() => location.href) === "http://localhost:8787/steuerung.html", "Fenster zeigt http://localhost:8787/steuerung.html");

  // --- Schließen über das X ---
  await kreuz(); await warte(150);
  pruefe(await sichtbar(), "X: Fenster bleibt sichtbar, solange gefragt wird");
  pruefe(JSON.stringify(await dialogKnoepfe()) === JSON.stringify(["Ganz beenden", "Nur Fenster schließen", "Abbrechen"]), "X: eigener Dialog sofort da (Ganz beenden · Nur Fenster schließen · Abbrechen)");
  await kreuz(); await warte(150);
  pruefe((await dialogKnoepfe()).length === 3, "X doppelt: weiterhin genau ein Dialog");
  await pg.click('.frage:not(#frage) [data-w=""]'); await warte(1300);
  pruefe(await sichtbar() && (await dialogKnoepfe()).length === 0, "Abbrechen: Fenster bleibt offen, kein Systemdialog danach");
  await pg.click("#beendenKnopf"); await warte(100);
  pruefe((await dialogKnoepfe()).length === 3, "⏻ öffnet denselben Dialog");
  await pg.click('.frage:not(#frage) [data-w="fenster"]'); await warte(400);
  pruefe(!(await sichtbar()), "Nur Fenster schließen: Fenster versteckt");
  pruefe(!!(await ping()), "… Server/Overlays laufen weiter");

  // --- zweiter Start holt das Fenster zurück ---
  const zweiter = spawn(require("electron"), [WURZEL, ...EXTRA], { cwd: WURZEL, stdio: "ignore" });
  const ende = await Promise.race([new Promise(r => zweiter.on("exit", c => r(c))), warte(20000).then(() => "läuft noch")]);
  await warte(300);
  pruefe(ende !== "läuft noch", `Zweiter Start beendet sich sofort (Code ${ende})`);
  pruefe(await sichtbar(), "… und das vorhandene Fenster ist wieder sichtbar");

  // --- Ton im App-Fenster ---
  pruefe(await stumm(), "Ton im App-Fenster: Standard aus (Fenster stumm)");
  await pg.evaluate(() => { const f = document.createElement("iframe"); f.id = "fremd"; f.setAttribute("sandbox", "allow-scripts");
    f.srcdoc = "<audio id=a></audio><script>const c = new AudioContext(); const o = c.createOscillator(); o.connect(c.destination); window.c = c;<\/script>"; document.body.appendChild(f); });
  await warte(800);
  const fremd = await (await pg.$("#fremd")).contentFrame();
  pruefe(!!fremd && await fremd.evaluate(() => origin) === "null", "Test-Seite in fremdem (cross-origin) Rahmen geladen");
  await pg.evaluate(() => { if (!ui.appTon) $("appTon").click(); const r = $("appTonVol"); r.value = 40; r.dispatchEvent(new Event("input")); });
  await warte(400);
  pruefe(!(await stumm()), "Ton an: Fenster nicht mehr stumm");
  const messen = () => fremd.evaluate(() => { const a = document.getElementById("a"); a.volume = 0.5; const p = window[Symbol.for("casting-app-ton")].pruefen(a, window.c); return { seite: a.volume, ...p }; });
  let m = await messen();
  pruefe(Math.abs(m.echt - 0.2) < 0.001 && m.seite === 0.5, `Lautstärke 40 % im fremden Rahmen: Seite setzt 0.5 → hörbar ${m.echt.toFixed(2)} (Seite liest weiter ${m.seite})`);
  pruefe(Math.abs(m.regler - 0.4) < 0.001, `… Web Audio der fremden Seite läuft über den Regler (${m.regler.toFixed(2)})`);
  const vorschau = await pg.evaluate(() => { const w = $("frame").contentWindow, a = w.document.createElement("audio"); a.volume = 1; return w[Symbol.for("casting-app-ton")].pruefen(a).echt; });
  pruefe(Math.abs(vorschau - 0.4) < 0.001, `… auch in der Vorschau (eigene Seite): ${vorschau.toFixed(2)}`);
  await pg.evaluate(() => { const r = $("appTonVol"); r.value = 100; r.dispatchEvent(new Event("input")); }); await warte(300);
  m = await messen();
  pruefe(Math.abs(m.echt - 0.5) < 0.001, `Lautstärke 100 %: hörbar ${m.echt.toFixed(2)}`);
  // echte fremde HTTPS-Seite in eigenem Prozess (wie VDO.Ninja, Clips, DACH CS) – in der Vorschau eingebettet
  if (https) {
    await pg.evaluate(u => { const d = $("frame").contentDocument, f = d.createElement("iframe"); f.id = "https"; f.src = u; d.body.appendChild(f); }, `https://127.0.0.1:${https.address().port}/`);
    await warte(1500);
    const hf = pg.frames().find(f => f.url().startsWith("https://127.0.0.1"));
    const oopif = hf && await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0].webContents; const f = w.mainFrame.framesInSubtree.find(x => x.url.startsWith("https://")); return f && f.processId !== w.mainFrame.processId; });
    pruefe(!!hf && oopif, "Fremde HTTPS-Seite läuft in eigenem Prozess (wie VDO.Ninja/DACH CS)");
    const h = hf && await hf.evaluate(() => { const v = document.querySelector("video"); v.volume = 0.8; return window[Symbol.for("casting-app-ton")].pruefen(v).echt; });
    pruefe(h !== undefined && Math.abs(h - 0.8) < 0.001, `… Lautstärke 100 %: Video hörbar ${h}`);
    await pg.evaluate(() => { const r = $("appTonVol"); r.value = 25; r.dispatchEvent(new Event("input")); }); await warte(300);
    const h2 = hf && await hf.evaluate(() => window[Symbol.for("casting-app-ton")].pruefen(document.querySelector("video")).echt);
    pruefe(h2 !== undefined && Math.abs(h2 - 0.2) < 0.001, `… Lautstärke 25 %: Video hörbar ${h2} (0,8 × 0,25)`);
  } else console.log("– HTTPS-Test übersprungen (openssl fehlt)");
  await pg.evaluate(() => $("appTon").click()); await warte(300);
  pruefe(await stumm(), "Ton aus: Fenster wieder stumm (gilt auch für fremde Rahmen)");

  // --- Geheimnisse: nie in Antworten, Log oder Zustand ---
  const geheim = "abcdef12-3456-7890-abcd-ef1234567890";
  await pg.evaluate(k => fetch("/api/faceit-schluessel", { method: "POST", body: JSON.stringify({ schluessel: k }) }), geheim);
  await pg.evaluate(() => fetch("/api/dach-zugang", { method: "POST", body: JSON.stringify({ userid: "4242", key: "dachkey-0815" }) }));
  const texte = await pg.evaluate(async () => [await (await fetch("/api/log")).text(), await (await fetch("/api/dach-zugang")).text(), await (await fetch("/api/faceit-schluessel")).text(), JSON.stringify(Z)].join("\n"));
  pruefe(!texte.includes(geheim) && !texte.includes("dachkey-0815") && !texte.includes("4242"), "Geheimnisse stehen nicht in Log, API-Antworten oder Zustand");
  const datei = require("fs").readFileSync(path.join(require("os").homedir(), process.platform === "win32" ? "" : ".casting-app", "faceit.geheim"));
  pruefe(!datei.toString("latin1").includes(geheim), "FACEIT-Key liegt verschlüsselt auf der Platte (faceit.geheim)");
  await pg.evaluate(() => Promise.all([fetch("/api/faceit-schluessel", { method: "DELETE" }), fetch("/api/dach-zugang", { method: "DELETE" })]));

  // --- Ganz beenden über den Dialog ---
  await kreuz(); await warte(150);
  const zu = new Promise(r => app.process().on("exit", r));
  await pg.click('.frage:not(#frage) [data-w="beenden"]').catch(() => {});
  await Promise.race([zu, warte(8000)]);
  pruefe(!(await ping()), "Ganz beenden: App und Server sind aus");
  console.log(fehler ? `\n${fehler} Fehler` : "\nAlles in Ordnung");
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
