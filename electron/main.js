/* =====================================================================
   CASTING-APP – Desktop-App (Electron-Hauptprozess)
   - startet den Server (server.js) im selben Prozess und zeigt die Steuerseite
     http://localhost:8787/steuerung.html in einem eigenen Fenster
   - OBS lädt die Overlays wie bisher als Browserquelle: http://localhost:8787/overlay.html
   - eine Instanz: ein zweiter Start holt das vorhandene Fenster nach vorn
   - Update-Ablösung: eine neue Version beendet eine ältere laufende (/api/ping + /api/beenden)
   - Klick aufs X fragt zuerst nach (eigener Dialog der App): ganz beenden · nur Fenster schließen · abbrechen
   - „Nur Fenster schließen“: Fenster weg, Symbol im Infobereich (Tray) bleibt, Overlays laufen weiter
   - „--ohne-fenster“: nur der Server, ohne Fenster und Tray
   - „--ohne-gpu“: Grafikbeschleunigung aus (nur falls ein Grafiktreiber Probleme macht)
   ===================================================================== */
"use strict";
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, safeStorage, shell, session, powerMonitor } = require("electron");
const path = require("path"), fs = require("fs");
const server = require("../server.js");

const { VERSION, NAME, BASIS } = server;
const HERKUNFT = new URL(BASIS).origin;
const OHNE_FENSTER = process.argv.includes("--ohne-fenster");
const MAC = process.platform === "darwin", WIN = process.platform === "win32";
const MEDIEN = path.join(__dirname, "..", "web", "medien");

/* ---------- Leistung ----------
   Grafikbeschleunigung bleibt an (Electron-Standard). Die Vorschau soll auch im Hintergrund
   oder verdeckt flüssig weiterlaufen: keine Drosselung von Timern, Renderer und verdeckten Fenstern. */
if (process.argv.includes("--ohne-gpu")) app.disableHardwareAcceleration();
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.setName(NAME);
if (WIN) app.setAppUserModelId("de.casting-app.desktop");

/* ---------- Ordner der Fenster-Daten ----------
   Electron legt seine Browser-Daten (Cache, localStorage …) in einen eigenen Unterordner,
   nicht direkt in den Datenordner der App. */
const FENSTER_DATEN = path.join(server.DATEN, "app-fenster");
app.setPath("userData", FENSTER_DATEN);

// Einstellungen der Steuerseite (localStorage) aus dem Edge-Fenster von Version 1.x einmalig übernehmen
function fensterEinstellungenUebernehmen() {
  try {
    const ziel = path.join(FENSTER_DATEN, "Local Storage");
    const quelle = path.join(server.DATEN, "fenster", "Default", "Local Storage");
    if (fs.existsSync(ziel) || !fs.existsSync(quelle)) return;
    fs.mkdirSync(FENSTER_DATEN, { recursive: true });
    fs.cpSync(quelle, ziel, { recursive: true, filter: q => !/[\\/]LOCK$/.test(q) });
    server.log("Einstellungen des alten App-Fensters (Edge) übernommen");
  } catch (e) { server.log("Alte Fenster-Einstellungen nicht übernommen: " + e.message, "warn"); }
}

/* ---------- Zustand ---------- */
let fenster = null, tray = null, wirdBeendet = false;
const tonStand = { an: false, vol: 60 };             // „Ton im App-Fenster“: Standard aus
const warte = ms => new Promise(r => setTimeout(r, ms));
const eigeneSeite = url => { try { return new URL(url).origin === HERKUNFT; } catch (e) { return false; } };
// IPC nur von der Steuerseite selbst (Hauptrahmen, eigene Adresse) annehmen – nie aus eingebetteten fremden Seiten
const vonSteuerseite = ev => !!fenster && !fenster.isDestroyed() && ev.sender === fenster.webContents
  && ev.senderFrame === fenster.webContents.mainFrame && eigeneSeite(ev.senderFrame.url);

/* ---------- Beenden ---------- */
function ganzBeenden() {
  if (wirdBeendet) return;
  wirdBeendet = true;
  server.beenden();                                    // speichert und ruft dann app.quit() (siehe starten)
  setTimeout(() => app.exit(0), 4000).unref();         // Sicherheitsnetz
}
app.on("before-quit", () => { wirdBeendet = true; server.speichernSofort(); });
app.on("window-all-closed", () => {});                 // Fenster werden nur versteckt – die App läuft weiter

/* ---------- Fenster ---------- */
const fensterDatei = path.join(server.DATEN, "fenster.json");
function fensterLage() {
  try { const j = JSON.parse(fs.readFileSync(fensterDatei, "utf8")); if (j.width > 400 && j.height > 300) return j; } catch (e) {}
  return { width: 1500, height: 950 };
}
let lageTakt = null;
function lageMerken() {
  clearTimeout(lageTakt);
  lageTakt = setTimeout(() => {
    if (!fenster || fenster.isDestroyed()) return;
    const b = fenster.getNormalBounds();
    try { fs.writeFileSync(fensterDatei, JSON.stringify(Object.assign(b, { max: fenster.isMaximized() }))); } catch (e) {}
  }, 800);
}

function fensterAnlegen() {
  const lage = fensterLage();
  fenster = new BrowserWindow({
    x: lage.x, y: lage.y, width: lage.width, height: lage.height, minWidth: 900, minHeight: 560,
    show: false, title: NAME, backgroundColor: "#0E0F12", autoHideMenuBar: true,
    icon: path.join(MEDIEN, "app-logo-192.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      nodeIntegrationInSubFrames: true,                // Preload auch in eingebetteten Seiten: Lautstärke für alles im Fenster
      backgroundThrottling: false,                     // Vorschau läuft auch verdeckt/im Hintergrund flüssig
      spellcheck: false
    }
  });
  if (lage.max) fenster.maximize();
  if (!MAC) fenster.removeMenu();
  const wc = fenster.webContents;
  wc.setAudioMuted(true);                              // bis die Steuerseite ihre Ton-Einstellung meldet

  fenster.once("ready-to-show", () => fenster.show());
  fenster.on("resize", lageMerken); fenster.on("move", lageMerken);

  // Klick aufs X: erst fragen (Dialog der App), nichts verstecken
  fenster.on("close", ev => {
    if (wirdBeendet) return;
    ev.preventDefault();
    schliessenFragen();
  });
  // Windows meldet sich ab / fährt herunter: nicht blockieren
  fenster.on("session-end", () => { wirdBeendet = true; server.speichernSofort(); });

  // Nur die eigenen Seiten im Fenster; Links nach draußen im Standardbrowser
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) && !eigeneSeite(url)) shell.openExternal(url);
    else if (eigeneSeite(url)) return { action: "allow", overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: path.join(MEDIEN, "app-logo-192.png"),
      webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false } } };
    return { action: "deny" };
  });
  wc.on("will-navigate", (ev, url) => {
    if (eigeneSeite(url)) return;
    ev.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });
  wc.on("render-process-gone", (ev, d) => {
    server.log("App-Fenster abgestürzt (" + d.reason + ") – lade neu", "fehler");
    if (!wirdBeendet && d.reason !== "clean-exit") setTimeout(() => { if (fenster && !fenster.isDestroyed()) wc.reload(); }, 500);
  });
  return fenster;
}

function zeigen() {
  if (OHNE_FENSTER) return;
  if (!fenster || fenster.isDestroyed()) { fensterAnlegen(); fenster.loadURL(BASIS + "/steuerung.html"); }
  if (fenster.isMinimized()) fenster.restore();
  fenster.show(); fenster.focus();
  if (MAC && app.dock) app.dock.show();
}

/* ---------- Schließen-Dialog ----------
   Die Steuerseite zeigt ihren eigenen Dialog (im Stil der App). Meldet sie sich nicht sofort
   (Seite lädt noch, hängt oder ist nicht erreichbar), fragt die App mit einem Systemdialog. */
let frage = null, frageNr = 0;
function schliessenFragen() {
  if (!fenster || fenster.isDestroyed()) return;
  if (!fenster.isVisible()) return;
  if (frage && frage.offen) { fenster.webContents.send("schliessen-fragen", frage.nr); return; }   // Dialog ist schon da
  if (frage && !frage.offen && Date.now() - frage.seit < 1500) return;
  frage = { nr: ++frageNr, seit: Date.now(), offen: false };
  const nr = frage.nr;
  fenster.webContents.send("schliessen-fragen", nr);
  setTimeout(() => { if (frage && frage.nr === nr && !frage.offen) systemFrage(nr); }, 1000);
}
async function systemFrage(nr) {
  frage.offen = true;
  const { response } = await dialog.showMessageBox(fenster, {
    type: "question", title: NAME + " schließen?", message: NAME + " schließen?",
    detail: "Bei „Nur Fenster schließen“ laufen die Overlays in OBS weiter.",
    buttons: ["Ganz beenden", "Nur Fenster schließen", "Abbrechen"], defaultId: 1, cancelId: 2, noLink: true
  });
  if (frage && frage.nr === nr) schliessenAntwort(["beenden", "fenster", ""][response]);
}
function schliessenAntwort(wahl) {
  frage = null;
  if (wahl === "beenden") { server.log("Über das Fenster-Kreuz beendet"); ganzBeenden(); }
  else if (wahl === "fenster") fensterVerstecken();
}
function fensterVerstecken() {
  if (!fenster || fenster.isDestroyed()) return;
  fenster.hide();
  trayAnlegen();
  server.log("Nur das Fenster geschlossen – Overlays laufen weiter");
  if (WIN && tray && !fensterVerstecken.gezeigt) {
    fensterVerstecken.gezeigt = true;
    tray.displayBalloon({ iconType: "info", title: NAME + " läuft weiter", content: "Die Overlays in OBS laufen weiter. Über dieses Symbol öffnest du das Fenster wieder oder beendest die App." });
  }
}
ipcMain.on("schliessen-frage-offen", (ev, nr) => { if (vonSteuerseite(ev) && frage && frage.nr === nr) frage.offen = true; });
ipcMain.on("schliessen-antwort", (ev, wahl) => {
  if (!vonSteuerseite(ev) || !["beenden", "fenster", ""].includes(wahl)) return;
  schliessenAntwort(wahl);
});

/* ---------- Tray (Infobereich) ---------- */
function trayBild() {
  const b = nativeImage.createFromPath(path.join(MEDIEN, MAC ? "app-logo-32.png" : (WIN ? "app-logo-32.png" : "app-logo-192.png")));
  return MAC ? b.resize({ width: 18, height: 18 }) : (WIN ? b.resize({ width: 16, height: 16 }) : b.resize({ width: 24, height: 24 }));
}
function trayAnlegen() {
  if (tray || OHNE_FENSTER) return;
  tray = new Tray(trayBild());
  tray.setToolTip(NAME + " " + VERSION + " – Overlays laufen");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Öffnen", click: zeigen },
    { label: "Overlays in OBS neu laden", click: overlaysNeuLaden },
    { type: "separator" },
    { label: "Ganz beenden", click: () => { server.log("Über das Tray-Menü beendet"); ganzBeenden(); } }
  ]));
  if (!MAC) tray.on("click", zeigen);
}

// Erst über OBS (refreshnocache, wie der Knopf in der App); ohne OBS-Verbindung über die Live-Verbindung der Overlays
let neuladenNr = 0;
const neuladenWarten = new Map();
async function overlaysNeuLaden() {
  let perObs = false;
  if (fenster && !fenster.isDestroyed() && eigeneSeite(fenster.webContents.getURL())) {
    const nr = ++neuladenNr;
    perObs = await new Promise(ok => {
      neuladenWarten.set(nr, ok);
      fenster.webContents.send("overlays-neu-laden", nr);
      setTimeout(() => { if (neuladenWarten.delete(nr)) ok(false); }, 4000);
    });
  }
  const n = perObs ? null : server.overlaysNeuLaden();
  if (WIN && tray) tray.displayBalloon({ iconType: "info", title: "Overlays neu laden",
    content: perObs ? "Die Browserquellen in OBS werden neu geladen." : (n ? `${n} Overlay(s) neu geladen.` : "Kein Overlay verbunden.") });
}
ipcMain.on("overlays-neu-geladen", (ev, nr, perObs) => {
  if (!vonSteuerseite(ev)) return;
  const ok = neuladenWarten.get(nr); if (ok) { neuladenWarten.delete(nr); ok(!!perObs); }
});

/* ---------- Ton im App-Fenster ----------
   Stumm: webContents.setAudioMuted – gilt für ALLES im Fenster, auch fremde iframes (VDO.Ninja, Clips, DACH CS).
   Lautstärke: Electron hat dafür keine Schnittstelle. Der Preload (läuft in jedem Rahmen des Fensters)
   regelt deshalb Video/Audio-Elemente und Web Audio in allen Seiten mit einem gemeinsamen Faktor (siehe preload.js). */
function tonAnwenden() {
  if (!fenster || fenster.isDestroyed()) return;
  fenster.webContents.setAudioMuted(!tonStand.an);
  const faktor = Math.max(0, Math.min(1, tonStand.vol / 100));
  for (const f of fenster.webContents.mainFrame.framesInSubtree) { try { f.send("ton-faktor", faktor); } catch (e) {} }
}
ipcMain.on("ton", (ev, t) => {
  if (!vonSteuerseite(ev) || !t || typeof t !== "object") return;
  tonStand.an = t.an === true;
  const v = Number(t.vol); if (Number.isFinite(v)) tonStand.vol = Math.max(0, Math.min(100, v));
  tonAnwenden();
});
ipcMain.handle("ton-faktor-holen", ev => (fenster && ev.sender === fenster.webContents) ? Math.max(0, Math.min(1, tonStand.vol / 100)) : 1);

/* ---------- Rechte: Kamera/Mikro nur für die eigenen Seiten ---------- */
function rechteSetzen() {
  const erlaubt = new Set(["media", "fullscreen", "clipboard-sanitized-write", "speaker-selection"]);
  session.defaultSession.setPermissionRequestHandler((wc, recht, ok, d) => ok(erlaubt.has(recht) && eigeneSeite(d.requestingUrl || wc.getURL())));
  session.defaultSession.setPermissionCheckHandler((wc, recht, herkunft) => erlaubt.has(recht) && eigeneSeite(herkunft));
}

/* ---------- Tresor für Geheimnisse (safeStorage) ---------- */
const tresor = {
  verfuegbar: () => { try { return safeStorage.isEncryptionAvailable(); } catch (e) { return false; } },
  verschluesseln: text => safeStorage.encryptString(text),
  entschluesseln: puffer => safeStorage.decryptString(puffer),
  art: () => { try { return process.platform === "linux" ? safeStorage.getSelectedStorageBackend() : "system"; } catch (e) { return "unbekannt"; } }
};

/* ---------- Menü (macOS braucht es für Kopieren/Einfügen) ---------- */
function menueSetzen() {
  if (!MAC) { Menu.setApplicationMenu(null); return; }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: NAME, submenu: [{ role: "about", label: "Über " + NAME }, { type: "separator" },
      { label: "Fenster schließen …", accelerator: "Cmd+W", click: () => schliessenFragen() },
      { label: NAME + " ganz beenden", accelerator: "Cmd+Q", click: ganzBeenden }] },
    { label: "Bearbeiten", submenu: [{ role: "undo", label: "Widerrufen" }, { role: "redo", label: "Wiederholen" }, { type: "separator" },
      { role: "cut", label: "Ausschneiden" }, { role: "copy", label: "Kopieren" }, { role: "paste", label: "Einfügen" }, { role: "selectAll", label: "Alles auswählen" }] },
    { label: "Fenster", submenu: [{ role: "minimize", label: "Im Dock ablegen" }, { role: "togglefullscreen", label: "Vollbild" }] }
  ]));
}

/* ---------- Start ---------- */
async function eineInstanz() {
  // Läuft schon eine Casting-App? Eine andere Version wird abgelöst, die gleiche bekommt den Fokus.
  const laufend = await server.laeuftSchon();
  if (laufend && laufend !== VERSION) {
    server.log(`Version ${laufend} läuft noch – wird durch ${VERSION} ersetzt`, "warn");
    await server.alteBeenden();
    for (let i = 0; i < 40 && await server.laeuftSchon(); i++) await warte(250);
  }
  if (OHNE_FENSTER) return true;
  // Die Sperre hält die laufende Desktop-App; nach einer Ablösung kann sie noch kurz belegt sein
  for (let i = 0; i < 12; i++) {
    if (app.requestSingleInstanceLock({ version: VERSION })) return true;
    if (!laufend || laufend === VERSION) return false;   // gleiche Version: sie holt ihr Fenster nach vorn
    await warte(250);
  }
  return false;
}

app.on("second-instance", (ev, argv, cwd, daten) => {
  if (daten && daten.version && daten.version !== VERSION) return;   // neuere Version löst uns gleich ab
  zeigen();
});
app.on("activate", () => { if (!OHNE_FENSTER) zeigen(); });   // macOS: Klick aufs Dock-Symbol

(async () => {
  if (!await eineInstanz()) { app.quit(); return; }
  if (!OHNE_FENSTER) fensterEinstellungenUebernehmen();
  await app.whenReady();
  // Linux ohne Schlüsselbund (Secret Service/KWallet): einfache Verschlüsselung statt gar keiner (Hinweis im Log)
  try { if (process.platform === "linux" && !safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend() === "basic_text") safeStorage.setUsePlainTextEncryption(true); } catch (e) {}
  if (OHNE_FENSTER && MAC && app.dock) app.dock.hide();
  menueSetzen();
  rechteSetzen();
  // Fenster schon anlegen, während der Server startet (schnellerer Start)
  if (!OHNE_FENSTER) fensterAnlegen();
  let start;
  try {
    start = await server.starten({
      dokumente: app.getPath("documents"), tresor, konsole: !WIN,
      beenden: () => { wirdBeendet = true; app.quit(); },
      fensterOffen: () => !!fenster && !fenster.isDestroyed() && fenster.isVisible(),
      autoBeenden: !OHNE_FENSTER,
      ordnerOeffnen: p => shell.openPath(p)
    });
  } catch (e) {
    dialog.showErrorBox(NAME, `Der Server konnte nicht starten:\n${e.message}\n\nLäuft ein anderes Programm auf Port ${server.PORT}?`);
    app.exit(1); return;
  }
  if (OHNE_FENSTER) {
    if (start.art === "laeuft-schon") { console.log(`${NAME} ${VERSION} läuft bereits: ${BASIS}`); app.exit(0); }
    else console.log(`${NAME} ${VERSION} läuft ohne Fenster: ${BASIS} · Overlays: ${BASIS}/overlay.html`);
    return;
  }
  powerMonitor.on("shutdown", () => { wirdBeendet = true; server.speichernSofort(); });
  fenster.webContents.on("did-finish-load", tonAnwenden);
  fenster.loadURL(BASIS + "/steuerung.html");
  trayAnlegen();
})();
