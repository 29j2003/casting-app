/* =====================================================================
   CASTING-APP – Server
   Lokaler Server nur auf diesem PC (http://localhost:8787):
     - liefert die Steuerseite (steuerung.html) und die Overlays aus
     - Overlays in OBS:  http://localhost:8787/overlay.html
   Gestartet wird er von der Desktop-App (electron/main.js), die die Steuerseite in ihrem eigenen Fenster zeigt.
   Ohne Fenster:  „Casting-App --ohne-fenster“ oder für Entwicklung/Tests „node server.js“.

   Sicherheit:
     - nur Anfragen von diesem PC an die eigene Adresse (Schutz gegen DNS-Rebinding)
     - nur die eigenen Seiten; Webseiten aus dem Internet werden abgelehnt
     - vom PC geht nichts nach außen – einzige Verbindung nach draußen ist das
       Abholen der FACEIT-Match-Daten (Match-ID + API-Key)
     - ausgeliefert werden nur App-Dateien sowie Videos/Schriften aus den eigenen Ordnern
     - Geheimnisse (FACEIT-Key, DACH-CS-ID/-Key) liegen verschlüsselt (Electron safeStorage) und verlassen den Server nie
   ===================================================================== */
"use strict";
const http = require("http"), https = require("https"), fs = require("fs"), fsp = fs.promises;
const path = require("path"), os = require("os"), { spawn, execFileSync } = require("child_process");
const { promisify } = require("util");
const { pipeline } = require("stream");
const statP = promisify(fs.stat);   // funktioniert auch für die eingebauten App-Dateien
const geheimnisseAnlegen = require("./geheimnisse");

const VERSION = "2.0.0";
const NAME = "Casting-App";
const PORT = 8787;
const BASIS = `http://localhost:${PORT}`;
const WIN = process.platform === "win32";
const WEB = path.join(__dirname, "web");

/* ---------- Einstellungen vom Starter (Desktop-App oder node server.js) ----------
   dokumente:      Ordner „Dokumente“ (die Desktop-App kennt ihn ohne PowerShell – schneller Start)
   tresor:         Verschlüsselung für Geheimnisse (Electron safeStorage); ohne Tresor nur für die laufende Sitzung
   beenden:        wird nach dem Speichern aufgerufen, um das Programm zu beenden
   fensterOffen:   meldet, ob das App-Fenster gerade sichtbar ist (für das automatische Beenden)
   autoBeenden:    beenden, sobald weder Fenster noch Overlays mehr offen sind
   ordnerOeffnen:  Ordner im Dateimanager zeigen */
let OPT = {};

/* ---------- Ordner ---------- */
function dokumente() {
  if (OPT.dokumente) return path.join(OPT.dokumente, NAME);
  if (!WIN) return path.join(os.homedir(), NAME);
  try {
    const d = execFileSync("powershell.exe", ["-NoProfile", "-Command", "[Environment]::GetFolderPath('MyDocuments')"],
      { timeout: 4000, windowsHide: true, encoding: "utf8" }).trim();
    if (d) return path.join(d, NAME);
  } catch (e) {}
  return path.join(os.homedir(), "Documents", NAME);
}
const DATEN = WIN ? path.join(process.env.APPDATA || os.homedir(), NAME) : path.join(os.homedir(), ".casting-app");
let EIGENE = null, ORDNER = { daten: DATEN };
function ordnerAnlegen() {
  EIGENE = dokumente();
  // Ordner der Vorversion („Cast-Overlay") einmalig übernehmen
  for (const [neu, alt] of [[DATEN, DATEN.replace(/Casting-App$/, "Cast-Overlay").replace(/\.casting-app$/, ".cast-overlay")], [EIGENE, EIGENE.replace(/Casting-App$/, "Cast-Overlay")]]) {
    try { if (alt !== neu && fs.existsSync(alt) && !fs.existsSync(neu)) fs.renameSync(alt, neu); } catch (e) {}
  }
  ORDNER = {
    daten: DATEN, bilder: path.join(DATEN, "bilder"), fenster: path.join(DATEN, "fenster"),
    eigene: EIGENE, videos: path.join(EIGENE, "Videos"), schriften: path.join(EIGENE, "Schriften")
  };
  for (const o of ["daten", "bilder", "eigene", "videos", "schriften"]) fs.mkdirSync(ORDNER[o], { recursive: true });
}

/* ---------- Log ---------- */
const LOG = [];
const logDatei = path.join(DATEN, "log.txt");
let logGeprueft = false;
function log(text, art = "info") {
  const z = { zeit: Date.now(), art, text: String(text).slice(0, 500) };
  LOG.push(z); if (LOG.length > 400) LOG.shift();
  if (!logGeprueft) {
    logGeprueft = true;
    try { fs.mkdirSync(DATEN, { recursive: true }); if (fs.existsSync(logDatei) && fs.statSync(logDatei).size > 2e6) fs.renameSync(logDatei, logDatei + ".alt"); } catch (e) {}
  }
  try { fs.appendFileSync(logDatei, `${new Date(z.zeit).toISOString()} [${art}] ${z.text}\n`); } catch (e) {}
  if (!WIN || OPT.konsole) console.log(`[${art}] ${z.text}`);
}

/* ---------- Stand + Bilder ---------- */
const zustandDatei = path.join(DATEN, "zustand.json");
let zustandText = null, zustandStand = 0;
function zustandLaden() {
  try {
    zustandText = fs.readFileSync(zustandDatei, "utf8");
    zustandStand = +(zustandText.match(/"stand"\s*:\s*(\d+)/) || [])[1] || 0;
  } catch (e) { zustandText = null; }
}
let speicherTakt = null;
function zustandSpeichern() {
  clearTimeout(speicherTakt);
  speicherTakt = setTimeout(() => fsp.writeFile(zustandDatei, zustandText, "utf8").catch(e => log("Speichern fehlgeschlagen: " + e.message, "fehler")), 400);
}
let gsiLetzte = null, gsiZeit = 0, meldungen = [];

/* ---------- Aufräumen: ungenutzte Bilder (älter als 7 Tage) ---------- */
async function bilderAufraeumen() {
  try {
    const benutzt = new Set((String(zustandText || "").match(/asset:([a-z0-9]+)/g) || []).map(x => x.slice(6)));
    let weg = 0;
    for (const f of await fsp.readdir(ORDNER.bilder)) {
      const id = f.split(".")[0], voll = path.join(ORDNER.bilder, f);
      if (benutzt.has(id)) continue;
      const st = await fsp.stat(voll);
      if (Date.now() - st.mtimeMs > 7 * 864e5) { await fsp.unlink(voll); weg++; }
    }
    if (weg) log(`${weg} ungenutzte Bilder aufgeräumt`);
  } catch (e) {}
}

/* ---------- Dateitypen ---------- */
const TYPEN = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".md": "text/plain; charset=utf-8"
};
const BILDTYPEN = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif", "image/svg+xml": ".svg" };
const HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`]);
const HERKUNFT = new Set([BASIS, `http://127.0.0.1:${PORT}`, `http://[::1]:${PORT}`]);
const LOKAL = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/* ---------- Verbundene Seiten (Live-Übertragung) ---------- */
const clients = new Set();
function statusSenden() {
  const liste = [...clients].map(c => ({ seite: c.seite, obs: c.obs, seit: c.seit, v: c.v }));
  for (const c of clients) if (c.seite === "steuerung") c.res.write(`event: status\ndata: ${JSON.stringify({ clients: liste })}\n\n`);
}
function zustandAnAlle() {
  if (!zustandText) return;
  const zeilen = zustandText.replace(/\n/g, " ");
  for (const c of clients) if (c.seite !== "steuerung") c.res.write(`event: zustand\ndata: ${zeilen}\n\n`);
}
setInterval(() => { for (const c of clients) c.res.write(": still\n\n"); }, 20000).unref();

/* ---------- Hilfen ---------- */
function antwort(res, code, daten, typ = "application/json; charset=utf-8") {
  const b = Buffer.isBuffer(daten) ? daten : Buffer.from(typeof daten === "string" ? daten : JSON.stringify(daten));
  res.writeHead(code, { "Content-Type": typ, "Content-Length": b.length, "Cache-Control": "no-store" });
  res.end(b);
}
function koerper(req, max) {
  return new Promise((ok, nein) => {
    const teile = []; let n = 0;
    req.on("data", d => { n += d.length; if (n > max) { nein(new Error("zu groß")); req.destroy(); } else teile.push(d); });
    req.on("end", () => ok(Buffer.concat(teile).toString("utf8")));
    req.on("error", nein);
  });
}
async function datei(req, res, voll, typ, zusatz = {}) {
  let st;
  try { st = await statP(voll); } catch (e) { return antwort(res, 404, { fehler: "nicht gefunden" }); }
  if (!st.isFile()) return antwort(res, 404, { fehler: "nicht gefunden" });
  const etag = `"${VERSION}-${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
  const kopf = Object.assign({ "Content-Type": typ, "Accept-Ranges": "bytes", "ETag": etag,
    "Cache-Control": /^(video|image|font)\//.test(typ) ? "max-age=3600" : "no-store" }, zusatz);
  if (req.headers["if-none-match"] === etag && !req.headers.range) { res.writeHead(304, kopf); return res.end(); }
  let von = 0, bis = st.size - 1, code = 200;
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  if (m) {
    if (m[1] === "" && m[2] !== "") { von = Math.max(0, st.size - +m[2]); }
    else { von = +m[1] || 0; if (m[2] !== "") bis = Math.min(+m[2], st.size - 1); }
    if (von >= st.size) { res.writeHead(416, { "Content-Range": `bytes */${st.size}` }); return res.end(); }
    code = 206; kopf["Content-Range"] = `bytes ${von}-${bis}/${st.size}`;
  }
  kopf["Content-Length"] = bis - von + 1;
  res.writeHead(code, kopf);
  if (req.method === "HEAD") return res.end();
  pipeline(fs.createReadStream(voll, { start: von, end: bis, highWaterMark: 256 * 1024 }), res, () => {});
}
// Pfad sicher innerhalb eines Ordners auflösen
function innerhalb(ordner, rel) {
  const voll = path.resolve(ordner, rel);
  return voll.startsWith(path.resolve(ordner) + path.sep) ? voll : null;
}

/* ---------- Geheimnisse: FACEIT-Key, DACH-CS-Nutzer-ID und -Key ----------
   Verschlüsselt mit Electron safeStorage (Windows: DPAPI, macOS: Schlüsselbund, Linux: Secret Service/KWallet),
   siehe geheimnisse.js. Die Steuerseite kann sie nur setzen oder löschen – abrufen kann sie niemand. */
let geheim = null;   // wird in starten() angelegt (braucht den Tresor der Desktop-App)

/* ---------- DACH CS: offizielle Browserquellen ----------
   OBS lädt http://localhost:8787/dach/<seite> – die App leitet dann an DACH CS weiter (mit ID und Key).
   So steht der Key weder in OBS-Szenensammlungen noch in Sicherungen der App. */
const DACH_SEITEN = new Set(["overview", "singlecast", "duocast", "lineup", "mapveto", "ingame", "positions", "tabelle", "playoffs", "last_matches", "current_matches", "next_matches", "last_matches_f1", "last_matches_f2", "next_matches_f1", "next_matches_f2", "mvp", "pause", "pause_content", "pause_own_content", "singleinteraction", "duointeraction", "solo_interview", "duointerview", "endscreen"]);

/* ---------- FACEIT (einzige Verbindung nach draußen) ---------- */
function faceit(rest, auth) {
  return new Promise((ok, nein) => {
    const host = rest.startsWith("data/") ? "open.faceit.com" : "api.faceit.com";
    const headers = { "User-Agent": "casting-app", "Accept": "application/json" };
    const k = geheim.holen("faceit");
    if (k && rest.startsWith("data/")) headers.Authorization = "Bearer " + k;   // nur der Server kennt den Schlüssel
    const r = https.get({ host, path: "/" + rest, headers, timeout: 15000 }, a => {
      const teile = []; let n = 0;
      a.on("data", d => { n += d.length; if (n > 5e6) { r.destroy(); nein(new Error("Antwort zu groß")); } else teile.push(d); });
      a.on("end", () => ok({ code: a.statusCode, text: Buffer.concat(teile).toString("utf8") }));
    });
    r.on("timeout", () => r.destroy(new Error("Zeitüberschreitung")));
    r.on("error", nein);
  });
}

/* ---------- Videos im eigenen Ordner prüfen ---------- */
async function videoInfo(name) {
  const voll = innerhalb(ORDNER.videos, name);
  const st = await fsp.stat(voll);
  const info = { name, groesse: st.size };
  const fh = await fsp.open(voll, "r");
  try {
    const n = Math.min(st.size, 4 * 1024 * 1024);
    const kopf = Buffer.alloc(n); await fh.read(kopf, 0, n, 0);
    let fuss = Buffer.alloc(0);
    if (st.size > n) { fuss = Buffer.alloc(n); await fh.read(fuss, 0, n, st.size - n); }
    const t = kopf.toString("latin1") + fuss.toString("latin1");
    info.codec = /hvc1|hev1|V_MPEGH\/ISO\/HEVC/.test(t) ? "H.265" : /avc1|V_MPEG4\/ISO\/AVC/.test(t) ? "H.264"
      : /vp09|V_VP9/.test(t) ? "VP9" : /V_VP8/.test(t) ? "VP8" : /av01|V_AV1/.test(t) ? "AV1" : "unbekannt";
    if (/\.(mp4|m4v|mov)$/i.test(name)) {
      const k = kopf.toString("latin1"), moov = k.indexOf("moov"), mdat = k.indexOf("mdat");
      info.faststart = moov >= 0 && (mdat < 0 || moov < mdat);
      // Auflösung aus dem Track-Kopf (tkhd) lesen
      let i = -1;
      while ((i = t.indexOf("tkhd", i + 1)) >= 0) {
        const buf = i < kopf.length ? kopf : fuss, o = i < kopf.length ? i : i - kopf.length;
        if (o + 96 > buf.length) continue;
        const v1 = buf[o + 4] === 1, w = buf.readUInt32BE(o + (v1 ? 92 : 80)) / 65536, h = buf.readUInt32BE(o + (v1 ? 96 : 84)) / 65536;
        if (w > 16 && h > 16 && w < 20000) { info.breite = Math.round(w); info.hoehe = Math.round(h); break; }
      }
    }
  } finally { await fh.close(); }
  return info;
}

/* ---------- CS2-Livedaten (GSI) ----------
   CS2 schickt mehrmals pro Sekunde den Spielstand. Auf diesem PC an 127.0.0.1:8787, von einem Observer-PC im Netzwerk
   an Port 8788 – dort nimmt die App NUR diese Daten an, und nur mit dem eigenen Schlüssel (Token). */
const GSI_NETZ_PORT = 8788;
const gsiDatei = path.join(DATEN, "gsi.json");
let gsiCfg = { token: require("crypto").randomBytes(12).toString("hex"), netz: false, seiteA: "CT", teamA: "", teamB: "" };
function gsiLaden() { try { Object.assign(gsiCfg, JSON.parse(fs.readFileSync(gsiDatei, "utf8"))); } catch (e) {} gsiSpeichern(); }
const gsiSpeichern = () => { try { fs.writeFileSync(gsiDatei, JSON.stringify(gsiCfg), { mode: 0o600 }); } catch (e) {} };
let live = null, liveQuelle = null, liveSendenTakt = null, vorherStand = null;
const gsiStats = { map: null, spieler: {} };
function lanAdressen() {
  const l = [];
  for (const liste of Object.values(os.networkInterfaces())) for (const a of liste || []) if (a.family === "IPv4" && !a.internal) l.push(a.address);
  return l;
}
function gsiVerarbeiten(j, quelle) {
  const map = j.map || {}, rnd = j.round || {}, ap = j.allplayers || {}, runde = +map.round || 0;
  // neue Map oder neu gestartet: Statistik zurücksetzen
  if (map.name !== gsiStats.map || runde < (gsiStats.runde || 0)) { gsiStats.map = map.name; gsiStats.spieler = {}; vorherStand = null; }
  gsiStats.runde = runde;
  // Schaden und Kopfschüsse je Runde mitzählen (CS2 liefert nur die laufende Runde)
  for (const [id, p] of Object.entries(ap)) {
    const st = p.state || {};
    const x = gsiStats.spieler[id] = gsiStats.spieler[id] || { dmg: 0, hs: 0, rDmg: 0, rHs: 0, runde, warten: false };
    if (runde !== x.runde) { x.dmg += x.rDmg; x.hs += x.rHs; x.rDmg = 0; x.rHs = 0; x.runde = runde; x.warten = true; }
    const d = +st.round_totaldmg || 0, h = +st.round_killhs || 0;
    if (x.warten) { if (d === 0 && h === 0) x.warten = false; else continue; }   // alte Werte der Vorrunde nicht doppelt zählen
    x.rDmg = Math.max(x.rDmg, d); x.rHs = Math.max(x.rHs, h);
  }
  const ct = map.team_ct || {}, t = map.team_t || {};
  // Seitenwechsel erkennen (Halbzeit/Overtime): die Spielstände tauschen die Spalten
  if (vorherStand && ct.score !== t.score && ct.score === vorherStand.t && t.score === vorherStand.ct) {
    gsiCfg.seiteA = gsiCfg.seiteA === "CT" ? "T" : "CT"; gsiSpeichern(); log("CS2: Seitenwechsel erkannt");
  }
  vorherStand = { ct: ct.score, t: t.score };
  // Teamnamen vom Server (z. B. FACEIT) passen zu Team A/B? Dann automatisch zuordnen
  const passt = (a, b) => a && b && (a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase()));
  if (passt(ct.name, gsiCfg.teamA) || passt(t.name, gsiCfg.teamB)) gsiCfg.seiteA = "CT";
  else if (passt(t.name, gsiCfg.teamA) || passt(ct.name, gsiCfg.teamB)) gsiCfg.seiteA = "T";
  const gespielt = runde + (rnd.phase === "freezetime" || !rnd.phase ? 0 : 1);
  const spieler = Object.entries(ap).map(([id, p]) => {
    const ms = p.match_stats || {}, st = p.state || {}, x = gsiStats.spieler[id] || {};
    const dmg = (x.dmg || 0) + (x.rDmg || 0), hs = (x.hs || 0) + (x.rHs || 0);
    return { id, name: String(p.name || "").slice(0, 32), seite: p.team, k: +ms.kills || 0, d: +ms.deaths || 0, a: +ms.assists || 0, mvps: +ms.mvps || 0,
      adr: Math.round(dmg / Math.max(1, gespielt)), hs: ms.kills ? Math.round(100 * hs / ms.kills) : 0,
      hp: +st.health || 0, geld: +st.money || 0, ausruestung: +st.equip_value || 0, rk: +st.round_kills || 0 };
  });
  live = { zeit: Date.now(), quelle, map: map.name || "", phase: map.phase || "", runde, rundenPhase: rnd.phase || "", bombe: rnd.bomb || "",
    ct: { name: ct.name || "", score: +ct.score || 0 }, t: { name: t.name || "", score: +t.score || 0 },
    seiteA: gsiCfg.seiteA, beobachtet: (j.player || {}).steamid || "", spieler };
  if (!liveQuelle) log(`CS2 sendet Live-Daten (${quelle === "netz" ? "Observer-PC im Netzwerk" : "dieser PC"})`);
  liveQuelle = quelle;
  // höchstens 5× pro Sekunde an Overlays und Steuerseite verteilen
  if (!liveSendenTakt) liveSendenTakt = setTimeout(() => {
    liveSendenTakt = null;
    const daten = `event: live\ndata: ${JSON.stringify(live)}\n\n`;
    for (const c of clients) c.res.write(daten);
  }, 200);
}
async function gsiAnnehmen(req, res, quelle) {
  const t = await koerper(req, 2e6);
  let j; try { j = JSON.parse(t); } catch (e) { return antwort(res, 400, { fehler: "kein JSON" }); }
  const tok = j.auth && j.auth.token;
  if (tok !== gsiCfg.token && !(quelle === "lokal" && tok === "castoverlay")) return antwort(res, 403, { fehler: "falscher Schlüssel" });
  gsiLetzte = t; gsiZeit = Date.now();
  gsiVerarbeiten(j, quelle);
  return antwort(res, 200, { ok: true });
}
// Empfang aus dem Netzwerk: eigener Port, nur POST /api/gsi mit Schlüssel – alles andere wird abgewiesen
let gsiNetzServer = null;
function gsiNetzSetzen(an) {
  if (an && !gsiNetzServer) {
    gsiNetzServer = http.createServer((req, res) => {
      if (req.method !== "POST" || req.url.split("?")[0] !== "/api/gsi") { res.writeHead(403); return res.end(); }
      gsiAnnehmen(req, res, "netz").catch(() => { try { res.writeHead(400); res.end(); } catch (e) {} });
    });
    gsiNetzServer.requestTimeout = 10000; gsiNetzServer.headersTimeout = 5000;
    gsiNetzServer.on("error", e => { log("Netzwerk-Empfang (Port " + GSI_NETZ_PORT + "): " + e.message, "fehler"); gsiNetzServer = null; });
    gsiNetzServer.listen(GSI_NETZ_PORT, "0.0.0.0", () => log("Netzwerk-Empfang für CS2 an (Port " + GSI_NETZ_PORT + ")"));
  }
  if (!an && gsiNetzServer) { gsiNetzServer.close(); gsiNetzServer = null; log("Netzwerk-Empfang für CS2 aus"); }
}
function gsiCfgText(uri) {
  return GSI_CFG.replace(`"uri"        "${BASIS}/api/gsi"`, `"uri"        "${uri}"`).replace('"auth" { "token" "castoverlay" }', `"auth" { "token" "${gsiCfg.token}" }`);
}

/* ---------- CS2-Ordner finden ---------- */
const CS2_TEIL = path.join("steamapps", "common", "Counter-Strike Global Offensive", "game", "csgo", "cfg");
const istCs2Cfg = p => p.toLowerCase().replace(/[\\/]+$/, "").endsWith(path.join("game", "csgo", "cfg").toLowerCase());
// Steam-Bibliotheken + alle Laufwerke bis 3 Ebenen tief nach „…\steamapps\common\Counter-Strike Global Offensive“ absuchen (max. 4 s)
async function cs2Suchen() {
  const funde = new Set(), start = Date.now(), zuPruefen = [];
  const pruefe = async basis => { const z = path.join(basis, CS2_TEIL); try { if ((await fsp.stat(z)).isDirectory()) funde.add(z); } catch (e) {} };
  const wurzeln = [];
  if (WIN) { for (let c = 67; c <= 90; c++) { const l = String.fromCharCode(c) + ":\\"; try { if (fs.existsSync(l)) wurzeln.push(l); } catch (e) {} } }
  else wurzeln.push(os.homedir(), "/");
  for (const s of [process.env["ProgramFiles(x86)"], process.env.ProgramFiles].filter(Boolean)) zuPruefen.push(path.join(s, "Steam"));
  for (const w of wurzeln) zuPruefen.push(w);
  // Ebene für Ebene (Breitensuche), Systemordner auslassen
  let ebene = zuPruefen.map(p => [p, 0]);
  while (ebene.length && Date.now() - start < 4000) {
    const naechste = [];
    for (const [p, tiefe] of ebene) {
      if (Date.now() - start > 4000) break;
      await pruefe(p);
      // libraryfolders.vdf einer Steam-Installation verrät weitere Bibliotheken
      try { const vdf = await fsp.readFile(path.join(p, "steamapps", "libraryfolders.vdf"), "utf8"); for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) await pruefe(m[1].replace(/\\\\/g, "\\")); } catch (e) {}
      if (tiefe >= 3) continue;
      try {
        for (const x of await fsp.readdir(p, { withFileTypes: true })) {
          if (x.isDirectory() && !/^(\$|System Volume Information$|Windows$|WinSxS$|ProgramData$|AppData$|node_modules$|\.)/i.test(x.name)) naechste.push([path.join(p, x.name), tiefe + 1]);
        }
      } catch (e) {}
    }
    ebene = naechste.slice(0, 6000);
  }
  return [...funde];
}

/* ---------- CS2 GSI einrichten ---------- */
const GSI_CFG = `"Casting App"
{
  "uri"        "${BASIS}/api/gsi"
  "timeout"    "1.0"
  "buffer"     "0.1"
  "throttle"   "0.25"
  "heartbeat"  "10.0"
  "auth" { "token" "castoverlay" }
  "data"
  {
    "provider" "1"  "map" "1"  "round" "1"  "phase_countdowns" "1"  "bomb" "1"
    "player_id" "1"  "player_state" "1"  "player_match_stats" "1"  "player_weapons" "1"
    "allplayers_id" "1"  "allplayers_state" "1"  "allplayers_match_stats" "1"  "allplayers_weapons" "1"
  }
}
`;
function cs2Ordner() {
  const steam = [];
  if (WIN) {
    for (const p of [process.env["ProgramFiles(x86)"], process.env.ProgramFiles, "C:\\Program Files (x86)", "C:\\Program Files"]) if (p) steam.push(path.join(p, "Steam"));
  } else steam.push(path.join(os.homedir(), ".steam", "steam"), path.join(os.homedir(), ".local", "share", "Steam"));
  const bibliotheken = new Set(steam);
  for (const s of steam) {
    try {
      const vdf = fs.readFileSync(path.join(s, "steamapps", "libraryfolders.vdf"), "utf8");
      for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) bibliotheken.add(m[1].replace(/\\\\/g, "\\"));
    } catch (e) {}
  }
  for (const b of bibliotheken) {
    const cfg = path.join(b, "steamapps", "common", "Counter-Strike Global Offensive", "game", "csgo", "cfg");
    if (fs.existsSync(cfg)) return cfg;
  }
  return null;
}

/* ---------- Anfragen ---------- */
async function bearbeiten(req, res) {
  // 1) nur dieser PC und nur die eigene Adresse
  if (!LOKAL.has(req.socket.remoteAddress) || !HOSTS.has(req.headers.host || "")) { res.writeHead(403); return res.end(); }
  const url = new URL(req.url, BASIS);
  const pfad = decodeURIComponent(url.pathname);
  const herkunft = req.headers.origin, seite = req.headers["sec-fetch-site"];

  // 2) CS2 schickt Live-Daten (Programm ohne Herkunft, mit Token aus der cfg)
  if (pfad === "/api/gsi" && req.method === "POST") {
    if (herkunft || seite) { res.writeHead(403); return res.end(); }
    return gsiAnnehmen(req, res, "lokal");
  }

  const dachTreffer = /^\/dach\/([a-z0-9_]{2,30})$/.exec(pfad);
  if (dachTreffer && req.method === "GET") {
  const m = dachTreffer;
  const sfs = req.headers["sec-fetch-site"];
  if (sfs && sfs !== "same-origin" && sfs !== "none") { res.writeHead(403); return res.end(); }   // fremde Webseiten bekommen nichts
    // Weiterleitung zur offiziellen DACH-CS-Browserquelle (ID und Key setzt nur die App ein)
    if (!DACH_SEITEN.has(m[1])) return antwort(res, 404, { fehler: "unbekannte DACH-CS-Seite" });
    const dachId = geheim.holen("dachId"), dachKey = geheim.holen("dachKey");
    if (!dachId || !dachKey) {
      res.writeHead(409, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end('<body style="margin:0;background:transparent;font:600 28px Segoe UI,sans-serif;color:#fff;display:grid;place-items:center;height:100vh"><div style="background:rgba(0,0,0,.6);padding:24px 32px;border-radius:12px">DACH-CS-Zugang fehlt – in der Casting-App unter Setup → Aussehen eintragen</div></body>');
    }
    res.writeHead(302, { "Location": `https://user.dachcs.de/castingoverlay/${m[1]}.php?userid=${encodeURIComponent(dachId)}&key=${encodeURIComponent(dachKey)}`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    return res.end();
  }

  // 3) sonst nur die eigenen Seiten – keine fremden Webseiten
  if (seite && seite !== "same-origin" && seite !== "none") { res.writeHead(403); return res.end(); }
  if (herkunft && !HERKUNFT.has(herkunft)) { res.writeHead(403); return res.end(); }
  const sicher = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
  for (const [k, v] of Object.entries(sicher)) res.setHeader(k, v);

  // 4) Schnittstelle
  if (pfad.startsWith("/api/")) {
    let m;
    if (pfad === "/api/ping") return antwort(res, 200, { ok: true, dienst: "cast", version: VERSION });

    if (pfad === "/api/ereignisse") {
      if (clients.size >= 40) return antwort(res, 503, { fehler: "zu viele Verbindungen" });
      res.on("error", () => {});
      const c = { res, seite: (url.searchParams.get("seite") || "?").slice(0, 40), obs: /OBS\//.test(req.headers["user-agent"] || ""), seit: Date.now(),
                  v: (url.searchParams.get("v") || "alt").slice(0, 20) };
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "Connection": "keep-alive" });
      res.write("retry: 1500\n\n");
      clients.add(c); statusSenden();
      if (c.v !== VERSION) { res.write("event: neuladen\ndata: {}\n\n"); log(`${c.seite}${c.obs ? " (OBS)" : ""} läuft mit alter Version ${c.v} – wird neu geladen`, "warn"); }
      if (c.seite !== "steuerung" && zustandText) res.write(`event: zustand\ndata: ${zustandText.replace(/\n/g, " ")}\n\n`);
      log(`verbunden: ${c.seite}${c.obs ? " (OBS)" : ""} · Version ${c.v}`);
      req.on("close", () => { clients.delete(c); statusSenden(); log(`getrennt: ${c.seite}${c.obs ? " (OBS)" : ""}`); letzteAktivitaet = Date.now(); });
      return;
    }
    if (pfad === "/api/zustand") {
      if (req.method === "POST") {
        const t = await koerper(req, 3e6);
        const st = +(t.match(/"stand"\s*:\s*(\d+)/) || [])[1];
        if (!st) return antwort(res, 400, { fehler: "kein Stand" });
        if (st >= zustandStand) { zustandText = t; zustandStand = st; zustandSpeichern(); zustandAnAlle(); }
        return antwort(res, 200, { ok: true });
      }
      const nach = +url.searchParams.get("nach") || 0;
      if (!zustandText || zustandStand <= nach) { res.writeHead(204); return res.end(); }
      return antwort(res, 200, zustandText);
    }
    if ((m = /^\/api\/bild\/([a-z0-9]{4,40})$/.exec(pfad))) {
      const id = m[1];
      if (req.method === "POST") {
        const t = await koerper(req, 12e6);
        const d = /^data:(image\/(?:png|jpeg|webp|gif|svg\+xml));base64,([A-Za-z0-9+/=]+)$/.exec(t);
        if (!d) return antwort(res, 400, { fehler: "kein Bild" });
        for (const f of await fsp.readdir(ORDNER.bilder)) if (f.startsWith(id + ".")) await fsp.unlink(path.join(ORDNER.bilder, f));
        await fsp.writeFile(path.join(ORDNER.bilder, id + BILDTYPEN[d[1]]), Buffer.from(d[2], "base64"));
        return antwort(res, 200, { ok: true });
      }
      const f = (await fsp.readdir(ORDNER.bilder)).find(x => x.startsWith(id + "."));
      if (!f) return antwort(res, 404, { fehler: "nicht gefunden" });
      // Bilder dürfen nie als Seite ausgeführt werden (wichtig für SVG)
      return datei(req, res, path.join(ORDNER.bilder, f), TYPEN[path.extname(f)], { "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'" });
    }
    if (pfad === "/api/gsi-info") {
      return antwort(res, 200, { token: gsiCfg.token, netz: !!gsiNetzServer, netzGewuenscht: gsiCfg.netz, port: GSI_NETZ_PORT, ips: lanAdressen(),
        seiteA: gsiCfg.seiteA, alterMs: gsiZeit ? Date.now() - gsiZeit : null, quelle: liveQuelle, live });
    }
    if (pfad === "/api/gsi-einstellungen" && req.method === "POST") {
      let j = {}; try { j = JSON.parse(await koerper(req, 4000)); } catch (e) {}
      if (typeof j.netz === "boolean") { gsiCfg.netz = j.netz; gsiNetzSetzen(j.netz); }
      if (j.seiteA === "CT" || j.seiteA === "T") gsiCfg.seiteA = j.seiteA;
      if (typeof j.teamA === "string") gsiCfg.teamA = j.teamA.slice(0, 60);
      if (typeof j.teamB === "string") gsiCfg.teamB = j.teamB.slice(0, 60);
      gsiSpeichern();
      if (live) { live.seiteA = gsiCfg.seiteA; for (const c of clients) c.res.write(`event: live\ndata: ${JSON.stringify(live)}\n\n`); }
      return antwort(res, 200, { ok: true, netz: !!gsiNetzServer });
    }
    if (pfad === "/api/gsi-cfg") {
      // Datei für den Observer-PC (zeigt auf diesen PC im Netzwerk)
      const ip = lanAdressen().includes(url.searchParams.get("ip")) ? url.searchParams.get("ip") : lanAdressen()[0] || "127.0.0.1";
      const b = Buffer.from(gsiCfgText(`http://${ip}:${GSI_NETZ_PORT}/api/gsi`));
      res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Disposition": 'attachment; filename="gamestate_integration_castoverlay.cfg"', "Content-Length": b.length, "Cache-Control": "no-store" });
      return res.end(b);
    }
    if (pfad === "/api/ordner-liste") {
      // Unterordner auflisten (für Pfad-Vorschläge und den eingebauten Ordner-Browser) – nur Namen, keine Inhalte
      const roh = String(url.searchParams.get("pfad") || "").trim();
      if (!roh) {
        if (!WIN) return antwort(res, 200, { pfad: "", eltern: null, ordner: ["/"] });
        const lw = []; for (let c = 67; c <= 90; c++) { const l = String.fromCharCode(c) + ":\\"; try { if (fs.existsSync(l)) lw.push(l); } catch (e) {} }
        return antwort(res, 200, { pfad: "", eltern: null, ordner: lw });
      }
      const p = path.resolve(roh);
      try {
        const eintraege = await fsp.readdir(p, { withFileTypes: true });
        const ordner = eintraege.filter(x => x.isDirectory() && !/^(\$|System Volume Information$|\.)/i.test(x.name)).map(x => x.name)
          .sort((x, y) => x.localeCompare(y, "de", { sensitivity: "base" })).slice(0, 800);
        const eltern = path.dirname(p) === p ? "" : path.dirname(p);
        return antwort(res, 200, { pfad: p, eltern, ordner, cs2: istCs2Cfg(p) });
      } catch (e) { return antwort(res, 200, { pfad: p, fehler: "Ordner nicht gefunden oder kein Zugriff", ordner: [] }); }
    }
    if (pfad === "/api/cs2-suchen") {
      return antwort(res, 200, { funde: await cs2Suchen() });
    }
    if (pfad === "/api/gsi-pfad" && req.method === "POST") {
      // Datei in einen eingetippten/gewählten Ordner legen – aber nur in den cfg-Ordner von CS2
      let j = {}; try { j = JSON.parse(await koerper(req, 4000)); } catch (e) {}
      const p = path.resolve(String(j.pfad || "").trim() || ".");
      if (!istCs2Cfg(p)) return antwort(res, 200, { ok: false, fehler: "Das ist nicht der CS2-Ordner. Er endet auf „game\\csgo\\cfg“." });
      try {
        if (!(await fsp.stat(p)).isDirectory()) throw new Error();
        const ziel = path.join(p, "gamestate_integration_castoverlay.cfg");
        await fsp.writeFile(ziel, gsiCfgText(`http://127.0.0.1:${PORT}/api/gsi`));
        log("CS2-Datei abgelegt: " + ziel);
        return antwort(res, 200, { ok: true, datei: ziel });
      } catch (e) { return antwort(res, 200, { ok: false, fehler: "Ordner nicht gefunden oder kein Schreibzugriff." }); }
    }
    if (pfad === "/api/dach-zugang") {
      // Nutzer-ID und Key gelten beide als Geheimnis: die Antwort sagt nur, OB sie gespeichert sind
      const info = () => ({ idGesetzt: geheim.da("dachId"), keyGesetzt: geheim.da("dachKey"), dauerhaft: geheim.dauerhaft() });
      if (req.method === "POST") {
        let j = {}; try { j = JSON.parse(await koerper(req, 1000)); } catch (e) {}
        const id = String(j.userid ?? "").trim(), key = String(j.key || "").trim();
        if (!id && !geheim.da("dachId")) return antwort(res, 400, { fehler: "Bitte die Nutzer-ID eintragen (nur Ziffern, z. B. 123)." });
        if (id && !/^\d{1,9}$/.test(id)) return antwort(res, 400, { fehler: "Die Nutzer-ID besteht nur aus Ziffern (z. B. 123)." });
        if (key && !/^[A-Za-z0-9-]{5,64}$/.test(key)) return antwort(res, 400, { fehler: "Das sieht nicht wie ein DACH-CS-Key aus." });
        try {
          if (id) geheim.setzen("dachId", id);
          if (key) geheim.setzen("dachKey", key);
        } catch (e) { return antwort(res, 500, { fehler: "Speichern fehlgeschlagen" }); }
        log("DACH-CS-Zugang gespeichert" + (geheim.dauerhaft() ? " (verschlüsselt)" : " (nur für diese Sitzung)"));
        return antwort(res, 200, info());
      }
      if (req.method === "DELETE") {
        geheim.loeschen("dachId"); geheim.loeschen("dachKey");
        log("DACH-CS-Zugang gelöscht"); return antwort(res, 200, info());
      }
      return antwort(res, 200, info());
    }
    if (pfad === "/api/faceit-schluessel") {
      // Nur setzen, löschen oder fragen, OB einer gespeichert ist – der Schlüssel selbst verlässt den Server nie
      if (req.method === "POST") {
        let j = {}; try { j = JSON.parse(await koerper(req, 1000)); } catch (e) {}
        const k = String(j.schluessel || "").trim();
        if (!/^[A-Za-z0-9-]{8,100}$/.test(k)) return antwort(res, 400, { fehler: "Das sieht nicht wie ein FACEIT-Schlüssel aus." });
        try { geheim.setzen("faceit", k); } catch (e) { return antwort(res, 500, { fehler: "Speichern fehlgeschlagen" }); }
        log("FACEIT-Schlüssel gespeichert" + (geheim.dauerhaft() ? " (verschlüsselt)" : " (nur für diese Sitzung)"));
        return antwort(res, 200, { gesetzt: true, dauerhaft: geheim.dauerhaft() });
      }
      if (req.method === "DELETE") {
        geheim.loeschen("faceit");
        log("FACEIT-Schlüssel gelöscht");
        return antwort(res, 200, { gesetzt: false });
      }
      return antwort(res, 200, { gesetzt: geheim.da("faceit"), dauerhaft: geheim.dauerhaft() });
    }
    if (pfad === "/api/meldung" && req.method === "POST") {
      // Meldungen der Overlays (z. B. aus OBS) ins Log – kurz und begrenzt
      const jetzt = Date.now();
      meldungen = meldungen.filter(t => jetzt - t < 60000);
      if (meldungen.length >= 30) return antwort(res, 429, { fehler: "zu viele Meldungen" });
      meldungen.push(jetzt);
      let j = {}; try { j = JSON.parse(await koerper(req, 4000)); } catch (e) {}
      const seite = String(j.seite || "?").replace(/[^\w ()äöüÄÖÜ-]/g, "").slice(0, 40), text = String(j.text || "").replace(/[\r\n]+/g, " ").slice(0, 300);
      if (text) log(`${seite}: ${text}`, "overlay");
      return antwort(res, 200, { ok: true });
    }
    if (pfad === "/api/videos") {
      const liste = [];
      for (const f of (await fsp.readdir(ORDNER.videos)).filter(f => /\.(mp4|m4v|webm|mov)$/i.test(f)).sort()) {
        try { liste.push(await videoInfo(f)); } catch (e) { liste.push({ name: f, fehler: true }); }
      }
      return antwort(res, 200, { ordner: ORDNER.videos, videos: liste });
    }
    if (pfad === "/api/schriften") {
      const liste = (await fsp.readdir(ORDNER.schriften)).filter(f => /\.(ttf|otf|woff2?)$/i.test(f)).sort();
      return antwort(res, 200, { ordner: ORDNER.schriften, schriften: liste });
    }
    if (pfad === "/api/ordner" && req.method === "POST") {
      const welcher = url.searchParams.get("welcher");
      const ziel = { videos: ORDNER.videos, schriften: ORDNER.schriften, daten: ORDNER.daten }[welcher];
      if (!ziel) return antwort(res, 400, { fehler: "unbekannt" });
      if (OPT.ordnerOeffnen) OPT.ordnerOeffnen(ziel);
      else if (WIN) spawn("explorer.exe", [ziel], { detached: true, stdio: "ignore", windowsHide: false }).unref();
      return antwort(res, 200, { ok: true, ordner: ziel });
    }
    if (pfad === "/api/log") {
      return antwort(res, 200, {
        version: VERSION, start: START, ordner: ORDNER, log: LOG.slice(-200),
        clients: [...clients].map(c => ({ seite: c.seite, obs: c.obs, seit: c.seit, v: c.v })),
        gsi: gsiLetzte ? Date.now() - gsiZeit : null
      });
    }
    if (pfad === "/api/gsi") {
      return antwort(res, 200, gsiLetzte ? `{"alterMs":${Date.now() - gsiZeit},"daten":${gsiLetzte}}` : '{"daten":null}');
    }
    if (pfad === "/api/gsi-einrichten" && req.method === "POST") {
      const cfg = cs2Ordner() || (await cs2Suchen())[0];
      if (!cfg) {
        const ersatz = path.join(ORDNER.eigene, "gamestate_integration_castoverlay.cfg");
        await fsp.writeFile(ersatz, gsiCfgText(`http://127.0.0.1:${PORT}/api/gsi`));
        log("CS2-Ordner nicht gefunden – cfg in " + ersatz + " gespeichert", "warn");
        return antwort(res, 200, { ok: false, datei: ersatz });
      }
      await fsp.writeFile(path.join(cfg, "gamestate_integration_castoverlay.cfg"), gsiCfgText(`http://127.0.0.1:${PORT}/api/gsi`));
      log("CS2-Live-Daten eingerichtet: " + cfg);
      return antwort(res, 200, { ok: true, datei: path.join(cfg, "gamestate_integration_castoverlay.cfg") });
    }
    if ((m = /^\/api\/faceit\/(data\/v4\/matches\/[A-Za-z0-9-]{8,80}(?:\/stats)?|democracy\/v1\/match\/[A-Za-z0-9-]{8,80}\/history|data\/v4\/championships\/[A-Za-z0-9-]{8,80}(?:\/subscriptions|\/matches)?|data\/v4\/teams\/[A-Za-z0-9-]{8,80}(?:\/stats\/cs2)?)$/.exec(pfad))) {
      // erlaubte Zusatzangaben (Seiten/Art), alles andere wird verworfen
      const q = new URLSearchParams();
      for (const k of ["offset", "limit", "type"]) { const v = url.searchParams.get(k); if (v && /^[a-z0-9]{1,10}$/i.test(v)) q.set(k, v); }
      if ([...q].length) m[1] += "?" + q.toString();
      try {
        if (m[1].startsWith("data/") && !geheim.da("faceit")) return antwort(res, 401, { fehler: "kein FACEIT-Schlüssel gespeichert" });
        const a = await faceit(m[1]);
        log(`FACEIT ${a.code} ${m[1].split("/").slice(0, 2).join("/")}`);
        return antwort(res, a.code, a.text);
      } catch (e) { log("FACEIT: " + e.message, "fehler"); return antwort(res, 502, { fehler: e.message }); }
    }
    if (pfad === "/api/beenden" && req.method === "POST") {
      antwort(res, 200, { ok: true });
      log("Beendet über die Steuerseite");
      return setTimeout(beenden, 200);
    }
    return antwort(res, 404, { fehler: "unbekannt" });
  }

  // 5) Dateien: App-Dateien, eigene Videos und Schriften
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  if (pfad === "/") { res.writeHead(302, { Location: "/steuerung.html" }); return res.end(); }
  const rel = pfad.replace(/^\/+/, "");
  if (/(^|\/)\.|\\|:|\0/.test(rel)) return antwort(res, 404, { fehler: "nicht gefunden" });
  const endung = path.extname(rel).toLowerCase();
  if (!TYPEN[endung]) return antwort(res, 404, { fehler: "nicht gefunden" });
  let voll = null;
  if (rel.startsWith("medien/videos/")) voll = innerhalb(ORDNER.videos, rel.slice(14));
  else if (rel.startsWith("fonts/")) {
    const eigen = innerhalb(ORDNER.schriften, rel.slice(6));
    voll = eigen && fs.existsSync(eigen) ? eigen : innerhalb(WEB, rel);
  } else voll = innerhalb(WEB, rel);
  if (!voll) return antwort(res, 404, { fehler: "nicht gefunden" });
  // Seiten dürfen nur von eigenen Seiten eingebettet werden
  return datei(req, res, voll, TYPEN[endung], endung === ".html" ? { "Content-Security-Policy": "frame-ancestors 'self'" } : {});
}

/* ---------- Overlays neu laden (z. B. aus dem Tray-Menü) ----------
   Schickt allen verbundenen Overlays (OBS-Browserquellen) „neuladen“ – sie laden sich dann selbst neu. */
function overlaysNeuLaden() {
  let n = 0;
  for (const c of clients) if (c.seite !== "steuerung") { c.res.write("event: neuladen\ndata: {}\n\n"); n++; }
  log(n ? `${n} Overlay(s) neu geladen` : "Overlays neu laden: keine Overlays verbunden");
  return n;
}

/* ---------- Beenden ---------- */
let letzteAktivitaet = Date.now();
const START = Date.now();
let beendet = false;
function speichernSofort() {
  clearTimeout(speicherTakt);
  try { if (zustandText) fs.writeFileSync(zustandDatei, zustandText, "utf8"); } catch (e) {}
}
function beenden() {
  if (beendet) return; beendet = true;
  speichernSofort();
  log(NAME + " beendet");
  if (OPT.beenden) OPT.beenden(); else process.exit(0);
}
// Desktop-App: beenden, sobald weder Fenster noch Overlays mehr offen sind (nach 30 s Ruhe)
setInterval(() => {
  if (!OPT.autoBeenden) return;
  const offen = (OPT.fensterOffen && OPT.fensterOffen()) || clients.size > 0;
  if (offen) letzteAktivitaet = Date.now();
  else if (Date.now() - letzteAktivitaet > 30000) { log("Weder Fenster noch Overlays offen – beende"); beenden(); }
}, 5000).unref();

/* ---------- Start ---------- */
// Läuft schon eine Casting-App? Liefert deren Version (oder null)
function laeuftSchon() {
  return new Promise(ok => {
    const r = http.get({ host: "127.0.0.1", port: PORT, path: "/api/ping", headers: { Host: `localhost:${PORT}` }, timeout: 1500 }, a => {
      let t = ""; a.on("data", d => t += d);
      a.on("end", () => { try { const j = JSON.parse(t); ok(j.dienst === "cast" ? (j.version || "alt") : null); } catch (e) { ok(null); } });
    });
    r.on("error", () => ok(null)); r.on("timeout", () => { r.destroy(); ok(null); });
  });
}
function alteBeenden() {
  return new Promise(ok => {
    const r = http.request({ host: "127.0.0.1", port: PORT, path: "/api/beenden", method: "POST", headers: { Host: `localhost:${PORT}`, "Content-Length": 0 }, timeout: 2000 }, a => { a.resume(); a.on("end", ok); });
    r.on("error", ok); r.on("timeout", () => { r.destroy(); ok(); }); r.end();
  });
}
// Ältere/andere Version abloesen: sie wird über /api/beenden beendet, dann warten, bis der Port frei ist
async function abloesen(laufend) {
  log(`Version ${laufend} läuft noch – wird durch ${VERSION} ersetzt`, "warn");
  await alteBeenden();
  for (let i = 0; i < 40 && await laeuftSchon(); i++) await new Promise(r => setTimeout(r, 250));
  await new Promise(r => setTimeout(r, 300));       // altes Programm sauber schließen lassen
}

/* Startet den Server. Ergebnis:
     { art: "gestartet" }       – dieser Server läuft
     { art: "laeuft-schon" }    – die gleiche Version läuft bereits (z. B. ohne Fenster); nichts gestartet
   Ein belegter Port (fremdes Programm) wird als Fehler gemeldet. */
let gestartet = null;
function starten(optionen = {}) {
  if (gestartet) return gestartet;
  OPT = Object.assign({}, optionen);
  gestartet = (async () => {
    const laufend = await laeuftSchon();
    if (laufend === VERSION) return { art: "laeuft-schon" };
    if (laufend) await abloesen(laufend);
    ordnerAnlegen();
    zustandLaden();
    gsiLaden();
    geheim = geheimnisseAnlegen({ ordner: DATEN, tresor: OPT.tresor, log, windows: WIN });
    setTimeout(bilderAufraeumen, 60000).unref(); setInterval(bilderAufraeumen, 6 * 3600000).unref();
    log(`${NAME} ${VERSION} startet · Daten: ${ORDNER.daten} · Videos: ${ORDNER.videos}`);
    const behandeln = (req, res) => bearbeiten(req, res).catch(e => { log("Fehler: " + e.message, "fehler"); try { antwort(res, 500, { fehler: "intern" }); } catch (x) {} });
    await new Promise((ok, nein) => {
      const server4 = http.createServer(behandeln);
      server4.requestTimeout = 60000; server4.headersTimeout = 20000;
      server4.on("error", e => { log("Port " + PORT + " belegt: " + e.message, "fehler"); nein(new Error(`Port ${PORT} ist belegt (${e.code || e.message}).`)); });
      server4.listen(PORT, "127.0.0.1", () => {
        log("Server bereit: " + BASIS);
        if (gsiCfg.netz) gsiNetzSetzen(true);
        ok();
      });
    });
    const server6 = http.createServer(behandeln);
    server6.on("error", () => {});                     // ohne IPv6 egal
    server6.listen({ port: PORT, host: "::1", ipv6Only: true });
    return { art: "gestartet" };
  })();
  return gestartet;
}

process.on("uncaughtException", e => log("Unerwarteter Fehler: " + (e && e.stack || e), "fehler"));

module.exports = { starten, beenden, speichernSofort, overlaysNeuLaden, laeuftSchon, alteBeenden, log, VERSION, NAME, PORT, BASIS, DATEN };

// „node server.js“: nur der Server, ohne Fenster (Entwicklung, Tests)
if (require.main === module) {
  starten({ konsole: true }).then(r => {
    if (r.art === "laeuft-schon") { console.log(`${NAME} ${VERSION} läuft bereits: ${BASIS}`); process.exit(0); }
  }).catch(e => { console.error(e.message); process.exit(1); });
}
