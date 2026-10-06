/* =====================================================================
   CASTING-APP · Steuerseite – Logik (im App-Fenster, läuft auch im normalen Browser)
   Die Steuerseite besteht aus:
     control.html – Aufbau: Kopfzeile, Reiterleiste (#tabs), je Reiter eine Gruppe
                    (.group[data-group=live|match|tournament|setup|log]) mit Karten
                    <details data-area="…">, Vorschau, Docks, Dialoge
     control.css  – Aussehen; Farben als Variablen in :root (hell: data-design=light)
     control/     – die Logik in Dateien nach Themen. Der Server verbindet sie in Namens-Reihenfolge
                    zu EINEM Skript (/control.js, casting_app/server/app_server.py: control_script):
       01-core        Grundlagen (diese Datei): Abfragen, Verbindungsdaten, ui, Senden, Felder
       02-themes      Themes: Auswahl, verwalten, anpassen
       03-match       Timer, Teams, Bilder, Map-Pool, Map-Veto, Spieler, FACEIT, Kameras
       04-obs-scenes  OBS-Szenen zuordnen und anlegen, Zugangsschlüssel der Browserquellen
       05-live        Serie, Sitzungen, Sponsoren, CS2-Livedaten, Szenen, Einblendungen
       06-layout      Unterseiten, Docks, Trennlinien, Zoom, Design
       07-background  Hintergrund-Videos über OBS
       08-navigation  Arbeitsbereiche, Befehlspalette (Strg K)
       09-tournament  Turnier (SE/DE/Swiss/GSL/Tabelle)
       10-header      Kopfzeile, Einblendungs-Favoriten
       11-audio       Ton über OBS, Cleanfeed
       12-dach        DACH CS – Offiziell
       13-app         Statusleiste, Videos, Log, Update, Sichern, Vorschau, Reiter, Start
     Wie in einer großen Datei teilen sich alle einen Namensraum; Funktionen dürfen überall
     benutzt werden. Nur Variablen (const/let) müssen vor ihrer ersten Benutzung beim Laden stehen.
     Neue Datei: einfach mit passender Nummer in control/ anlegen – sie wird automatisch eingebunden.
     Abschnitte in den Dateien: nach „/* ---------- “ suchen.
   Wichtigste Bausteine:
     Z              Zustand der Sendung (Standard und Felder: cast-core.js, DEFAULT)
     send()         Z an Server/Overlays schicken und im Browser sichern;
     laterSend()    dasselbe gebündelt (beim Tippen)
     everything()   alle Bereiche neu aus Z zeichnen (nach Laden, Import, Sprachwechsel)
     ui             Einstellungen der Oberfläche (Docks, Reiter, Zoom) – nicht Teil der Sendung
     $("id")        document.getElementById
     data-field="texts.title" data-kind="number|bool|list" (ohne data-kind: Text)
                    Eingabefeld, das automatisch mit Z verbunden ist (Abschnitt „Felder“)
   Häufige Änderungen:
     · neue Karte: <details data-area="englischer-schluessel"><summary>Titel</summary>
       <div class="content">…</div></details> in die Gruppe des Reiters; der Schlüssel
       bleibt fest (gespeicherte Docks hängen daran)
     · neuer sichtbarer Text: deutsch hier schreiben, Übersetzung in lang-en.js
     · neues Feld der Sendung: Standardwert in cast-core.js (DEFAULT), Eingabe hier
       mit data-field, Anzeige in cast.js
   Mehr dazu: ENTWICKLUNG.md im Projektordner.
   ===================================================================== */
"use strict";
const K = window.CastCore, BUNDLED = window.CAST_THEMES || {};
// ohne Zugangsschlüssel (Adresse von Hand geöffnet) darf die Seite nichts ändern – klar sagen, wie es geht
if (K.SERVER && !K.ACCESS) addEventListener("DOMContentLoaded", () => document.body.insertAdjacentHTML("afterbegin",
  `<div style="background:var(--red,#c33);color:#fff;padding:10px 16px;font-weight:600">Diese Steuerseite hat keinen Zugangsschlüssel und kann nichts ändern. Öffne sie aus der Casting-App (App-Fenster → ⚙ App-Einstellungen → Verbindung zu OBS → „Steuerseite im Browser öffnen“) oder nimm ohne Fenster die Adresse aus der Konsole.</div>`));
// alle Themes: mitgelieferte + eigene (eigene liegen im Stand und wandern mit Sicherung/Sitzung)
const ownThemes = () => { try { return (Z && Z.ownThemes) || {}; } catch (err) { return {}; } };
const T = new Proxy({}, {
  get: (_, k) => BUNDLED[k] || ownThemes()[k],
  ownKeys: () => [...Object.keys(BUNDLED), ...Object.keys(ownThemes())],
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true })
});
/* ---------- Sicherheitsabfrage & Rückgängig ---------- */
// bestaetigen({ titel, text, liste: [text | { text, warn }], knopf }) -> Promise<boolean>
function confirmDialog(o) {
  return new Promise(ok => {
    const f = document.getElementById("question");
    document.getElementById("questionTitle").textContent = o.title || "Bist du sicher?";
    document.getElementById("questionText").textContent = o.text || "";
    const ul = document.getElementById("questionList"); ul.innerHTML = "";
    (o.list || []).forEach(x => { const li = document.createElement("li"); li.textContent = typeof x === "string" ? x : x.text; if (x.warn) li.className = "warn"; ul.appendChild(li); });
    ul.hidden = !(o.list || []).length;
    const yes = document.getElementById("questionYes"), no = document.getElementById("questionNo");
    yes.textContent = o.button || "Ausführen";
    const end = w => { f.hidden = true; yes.onclick = no.onclick = null; document.removeEventListener("keydown", hotkey); ok(w); };
    const hotkey = ev => { if (ev.key === "Escape") end(false); };
    yes.onclick = () => end(true); no.onclick = () => end(false);
    document.addEventListener("keydown", hotkey);
    f.hidden = false; no.focus();
  });
}
let toastTimer = null;
function undo(text, back) {
  const t = document.getElementById("toast");
  document.getElementById("toastText").textContent = text;
  document.getElementById("toastBack").onclick = () => { clearTimeout(toastTimer); t.hidden = true; back(); };
  t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 7000);
}
// Eintrag aus einer Liste entfernen – mit „Rückgängig"
function remove(list, i, name, newDraw) {
  const [away] = list.splice(i, 1);
  newDraw(); send();
  undo(`${name} entfernt`, () => { list.splice(Math.min(i, list.length), 0, away); newDraw(); send(); });
}
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = id => document.getElementById(id);
/* ---------- Icons ----------
   Knöpfe zeigen SVG statt Zeichen wie 🔓 ⧉ ⏻ – Zeichen hängen von den Schriften des Systems ab
   (Linux/Windows sahen unterschiedlich aus). icon("lock") → <svg>; im HTML: data-icon="lock" (wird beim Laden vorangestellt). */
const ICONS = {
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.6-1.8"/>',
  collapse: '<path d="M7 4l5 5 5-5M7 20l5-5 5 5"/>',
  expand: '<path d="M7 9l5-5 5 5M7 15l5 5 5-5"/>',
  "panel-close": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16M8 10l2 2-2 2"/>',
  "panel-open": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16M10 10l-2 2 2 2"/>',
  dock: '<rect x="3" y="3" width="13" height="13" rx="2"/><path d="M8 21h11a2 2 0 0 0 2-2V8"/>',
  grip: '<g fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></g>',
  more: '<g fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></g>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  power: '<path d="M12 3v9"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  swap: '<path d="M7 4L3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  star: '<path fill="currentColor" d="M12 3l2.8 5.8 6.2.8-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.8z"/>',
  "star-empty": '<path d="M12 3l2.8 5.8 6.2.8-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.8z"/>',
  play: '<path fill="currentColor" d="M7 4l13 8-13 8z"/>',
  pause: '<g fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></g>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  left: '<path d="M19 12H5M12 5l-7 7 7 7"/>',
  right: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
document.querySelectorAll("[data-icon]").forEach(e => e.insertAdjacentHTML("afterbegin", icon(e.dataset.icon)));
let Z = K.load();

/* ---------- Verbindungsdaten (hier im Browser gemerkt) ---------- */
const CONN_KEY = "cast-connection";
function connection() {
  try { return Object.assign({}, window.CAST_CONNECTION || {}, JSON.parse(localStorage.getItem(CONN_KEY) || "{}")); }
  catch (e) { return Object.assign({}, window.CAST_CONNECTION || {}); }
}
$("obsPort").value = connection().port || 4455;
// OBS-Passwort: in der App im Schlüsselbund des Systems (nicht im Browser-Speicher); ohne App wie bisher hier gemerkt
$("obsPassword").value = K.SERVER ? "" : (connection().password || "");
async function obsPasswordStatus() {
  if (!K.SERVER) return;
  let isSet = false;
  try { isSet = !!(await (await fetch("/api/obs-password", { cache: "no-store" })).json()).isSet; } catch (err) {}
  $("obsPassword").placeholder = isSet ? "✓ gespeichert" : "";
  $("obsPasswordDelete").hidden = !isSet;
}
async function obsPasswordSave(password) {
  if (!K.SERVER || !password) return;
  try { await fetch("/api/obs-password", { method: "POST", body: JSON.stringify({ password }) }); } catch (err) {}
}
if (K.SERVER && connection().password) {        // Umzug: ein Passwort aus älteren Versionen wandert einmal in den Schlüsselbund
  const oldPassword = connection().password;
  localStorage.setItem(CONN_KEY, JSON.stringify({ port: connection().port || 4455 }));
  obsPasswordSave(oldPassword).then(obsPasswordStatus);
} else obsPasswordStatus();

/* ---------- Grundbausteine: Oberfläche (ui) und letzte CS2-Daten ---------- */
// ui = Einstellungen der Oberfläche (Docks, Reiter, Zoom, Ton im App-Fenster) – nicht Teil der Sendung
const UI_KEY = "casting-app-ui";
const ui = (() => { try { return JSON.parse(localStorage.getItem(UI_KEY) || "{}"); } catch (e) { return {}; } })();
const uiSave = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) {} };
let gsiInfo = {}, liveLast = null, liveTimer = null;     // CS2-Livedaten (Abschnitt „CS2-Livedaten“)

/* ---------- Senden ---------- */
let channel;
const sentImages = new Set();
let currentImages = {}, smallerState = null;
let startDone = false;   // erst senden, wenn der gespeicherte Stand geladen ist
function send() {
  if (!startDone) return;
  Z.revision = K.nextRevision(Z.revision);
  // große Bilder abtrennen: nur neue Bilder werden übertragen, der Zustand bleibt klein
  const { small, images } = K.split(Z);
  currentImages = images; smallerState = small;
  const fresh = {};
  Object.entries(images).forEach(([id, v]) => { if (!sentImages.has(id)) { fresh[id] = v; sentImages.add(id); } });
  if (Object.keys(fresh).length) { K.Images.set(fresh); channel.send({ cast: "images", images: fresh }); }
  const ok = K.save(small);
  $("saved").textContent = ok ? "✓ gespeichert " + new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "⚠ Speichern fehlgeschlagen";
  if (typeof stepsDraw === "function") setTimeout(stepsDraw, 0);
  channel.send({ cast: "state", z: small });
  const f = $("frame").contentWindow; if (f) f.postMessage({ cast: "state", z: Z }, location.origin);
}
// alle Bilder erneut schicken (neu geladene Quellen, neue Verbindung)
function allImagesSend() { if (Object.keys(currentImages).length) channel.send({ cast: "images", images: currentImages }); }
let tipTimer;
function laterSend() { clearTimeout(tipTimer); tipTimer = setTimeout(send, 180); }

const statusTexts = { connecting: ["OBS: verbinde …", "warn"], connected: ["OBS: verbunden", "ok"], disconnected: ["OBS: nicht verbunden", ""], password: ["OBS: Passwort falsch", ""] };
let browsersourcesOk = null;
channel = K.channel({
  obs: true,
  page: "control",
  onStale() { send(); },                 // der Server hatte einen neueren Stand: gleich mit höherer Nummer erneut
  onClients(list) { clientsList = list; overlaysPill(); },
  onLive(d) { liveReceived(d); },
  events: 1 | 4 | 16,   // Allgemein, Szenen, Übergänge
  onEvent(type, d) {
    if (type === "CurrentProgramSceneChanged") { currentScene = d.sceneName; scenesDraw(); }
    else if (/^Scene(ListChanged|Created|Removed|NameChanged)$|^SceneTransition(Created|Removed|NameChanged)$|^CurrentSceneTransitionChanged$/.test(type)) scenesLoad();
  },
  settings: connection,
  onStatus(s) {
    const [t, c] = statusTexts[s] || [s, ""];
    pill("obsStatus", t, c);
    if (s !== "connected") broadcastStatus(null);
    setTimeout(() => { try { scenesDraw(); } catch (err) {} }, 0);   // erst nach dem Laden der Seite
  },
  onOpen() { sentImages.clear(); send(); sourcesCheck(); scenesLoad(); setTimeout(overlaysPill, 1500); setTimeout(accessCheck, 2000); },
  onAnswer(type, ok, hint, data) {
    if (type === "CallVendorRequest") broadcastStatus(ok, hint);
    if (type === "GetInputList") {
      const names = (data.inputs || []).map(i => i.inputName);
      $("obsSources").textContent = names.length ? "Browserquellen in OBS: " + names.join(", ") : "In OBS wurde noch keine Browserquelle gefunden.";
    }
  },
  onMessage(d) { if (d.cast === "request") { allImagesSend(); send(); } }
});
function broadcastStatus(ok, hint) {
  browsersourcesOk = ok;
  const e = $("transmission");
  if (ok === null) { e.textContent = ""; return; }
  e.textContent = ok ? "✓ Änderungen gehen direkt an alle Browserquellen in OBS"
                     : "✗ OBS nimmt die Änderungen nicht an (" + (hint || "obs-browser fehlt – OBS aktualisieren") + ")";
  e.style.color = ok ? "var(--ok)" : "var(--red)";
}
function sourcesCheck() { channel.obs.request("GetInputList", { inputKind: "browser_source" }); }
// Browserquellen der App ohne (aktuellen) Zugangsschlüssel finden – z. B. aus einer älteren Version.
// Ohne Schlüssel zeigen sie alles außer den DACH-CS-Seiten. Umstellen nur nach Rückfrage: die Quelle lädt dabei kurz neu.
const APP_ADDRESS = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):8787\//i;
let accessAsked = false;
async function accessSourcesMissing() {
  const inputs = (await channel.obs.question("GetInputList", { inputKind: "browser_source" })).inputs || [];
  const missing = [];
  for (const i of inputs) {
    const s = (await channel.obs.question("GetInputSettings", { inputName: i.inputName })).inputSettings || {};
    const url = String(s.url || "");
    if (s.is_local_file || !APP_ADDRESS.test(url)) continue;
    let u; try { u = new URL(url); } catch (err) { continue; }
    if (u.searchParams.get("access") !== K.ACCESS) missing.push({ name: i.inputName, u });
  }
  return missing;
}
async function accessCheck(fromHand) {
  if (!K.SERVER || !K.ACCESS || !channel.obs.isOpen) return;
  let missing; try { missing = await accessSourcesMissing(); } catch (err) { return; }
  $("accessNotice").hidden = !missing.length;
  if (!missing.length) { if (fromHand) $("accessStatus").textContent = "✓ Alle Browserquellen der App haben den Zugangsschlüssel."; return; }
  $("accessStatus").textContent = `${missing.length} Browserquelle(n) der App in OBS ohne Zugangsschlüssel: ${missing.map(m => m.name).join(", ")}`;
  if (accessAsked && !fromHand) return;
  accessAsked = true;
  const ok = await confirmDialog({
    title: "Browserquellen in OBS umstellen?",
    text: "Seit Version 2.3 brauchen die Browserquellen der App einen Zugangsschlüssel – sonst fehlen die DACH-CS-Seiten. "
      + "Beim Umstellen lädt jede Quelle einmal kurz neu (nicht während einer laufenden Szene im Stream).",
    list: missing.map(m => ({ text: `„${m.name}“ umstellen` })), button: "Umstellen"
  });
  if (!ok) return;
  for (const m of missing) {
    m.u.searchParams.set("access", K.ACCESS);
    try { await channel.obs.question("SetInputSettings", { inputName: m.name, inputSettings: { url: m.u.toString() }, overlay: true }); } catch (err) {}
  }
  accessCheck(true);
}
$("accessUpdate").onclick = () => { accessAsked = false; accessCheck(true); };
// im Standardbrowser öffnen (das App-Fenster gibt neue Fenster an ihn weiter) – mit Schlüssel, sonst ginge dort nichts
$("openInBrowser").hidden = !(window.castApp && K.ACCESS);
// mit Einmal-Code: der Schlüssel steht so nie in der Adresse oder im Verlauf des Browsers
$("openInBrowser").onclick = async () => {
  try { const { code } = await (await fetch("/api/access-code", { method: "POST" })).json(); window.open(location.origin + "/open?code=" + encodeURIComponent(code), "_blank"); }
  catch (err) { alert("Die App antwortet nicht."); }
};
// regelmäßig den kompletten Stand schicken (falls eine Quelle neu geladen wurde)
if (!K.SERVER) {   // nur ohne App: Stand zusätzlich über OBS an die Browserquellen
  setInterval(() => { if (channel.obs.isOpen && smallerState) channel.obs.onBrowsersources("cast-state", { cast: "state", z: smallerState }); }, 5000);
  setInterval(() => { if (channel.obs.isOpen) channel.obs.onBrowsersources("cast-state", { cast: "images", images: currentImages }); }, 60000);
}
setInterval(() => K.Images.cleanup(new Set(Object.keys(currentImages))), 120000);
$("obsNew").onclick = async () => {
  if (K.SERVER) {
    localStorage.setItem(CONN_KEY, JSON.stringify({ port: +$("obsPort").value || 4455 }));
    await obsPasswordSave($("obsPassword").value);
    $("obsPassword").value = "";                 // Passwort sofort aus der Seite entfernen
    obsPasswordStatus();
  } else localStorage.setItem(CONN_KEY, JSON.stringify({ port: +$("obsPort").value || 4455, password: $("obsPassword").value }));
  channel.obs.fresh();
};
$("obsPasswordDelete").onclick = async () => {
  try { await fetch("/api/obs-password", { method: "DELETE" }); } catch (err) {}
  obsPasswordStatus(); channel.obs.fresh();
};

/* ---------- Felder ---------- */
const pull = p => p.split(".").reduce((o, k) => (o == null ? o : o[k]), Z);
function put(p, v) { const t = p.split("."); let o = Z; t.slice(0, -1).forEach(k => { o = o[k] = o[k] || {}; }); o[t[t.length - 1]] = v; }
$("onSource").addEventListener("change", () => setTimeout(() => { scenesDraw(); scenesSetupDraw(); preview(); }, 0));
function fieldsFill() {
document.querySelectorAll("[data-field]").forEach(e => {
    const v = pull(e.dataset.field), kind = e.dataset.kind;
    if (kind === "bool") e.checked = v !== false;
    else if (kind === "list") e.value = (v || []).join("\n");
    else e.value = v ?? "";
  });
  $("result").checked = !!Z.teams.result;
}
document.querySelectorAll("[data-field]").forEach(e => {
  e.addEventListener(e.type === "checkbox" ? "change" : "input", () => {
    const kind = e.dataset.kind;
    let v = e.value;
    if (kind === "bool") v = e.checked;
    if (kind === "list") v = v.split("\n").map(s => s.trim()).filter(Boolean);
    if (kind === "number") v = parseFloat(v);
    put(e.dataset.field, v);
    // dasselbe Feld kann an zwei Stellen stehen (z. B. Titel im Szenen-Panel und unter Setup) – die andere mitziehen
    document.querySelectorAll(`[data-field="${e.dataset.field}"]`).forEach(o => {
      if (o === e) return;
      if (kind === "bool") o.checked = v !== false; else if (kind === "list") o.value = v.join("\n"); else o.value = v ?? "";
    });
    laterSend();
  });
});
