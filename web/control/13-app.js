/* CASTING-APP · Steuerseite – Statusleiste, Videos, Log, Update, Sichern/Laden, Vorschau, Reiter – und der Start der Seite
   Teil 13 von 13; Reihenfolge und Lageplan: control/01-core.js
   (der Server verbindet alle Dateien zu einem Skript – siehe dort) */

/* ---------- Statusleiste, Verbindung zur App, Erste Schritte ---------- */
function pill(id, text, state) { const p = $(id); p.className = "pill " + (state || ""); p.lastElementChild.textContent = text; }
// zu einem Bereich springen: passenden Reiter öffnen, Bereich aufklappen, hinscrollen, kurz leuchten
// Bereich öffnen: über seinen festen Schlüssel (data-area) – oder über den angezeigten Titel (Befehlspalette)
function goClose(title) {
  if (title === "@einstellungen") return settings(true, "setLinks");
  const byKey = document.querySelector(`details[data-area="${CSS.escape(title)}"]`);
  const s = byKey ? byKey.querySelector(":scope > summary") : [...document.querySelectorAll("details > summary")].find(x => x.textContent.replace(/[⠿⧉]/g, "").trim().startsWith(title));
  if (!s) return;
  const d = s.parentElement, g = d.closest(".group");
  if (g) { const u = belowFrom(g.dataset.group, d.dataset.area); if (u && SUBPAGES[g.dataset.group]) { ui.below = Object.assign({}, ui.below, { [g.dataset.group]: u }); belowApply(); } tabs(g.dataset.group); }
  d.open = true; d.scrollIntoView({ behavior: "smooth", block: "start" });
  d.classList.remove("glow"); void d.offsetWidth; d.classList.add("glow");
}
$("obsStatus").onclick = () => settings(true, "setLinks");
$("helperStatus").onclick = () => { tabs("log"); logDraw(); };
$("musicStatus").onclick = () => settings(true, "setLinks");
async function helperCheck() { overlaysPill(); stepsDraw(); }
async function musicCheck() {
  if (Z.music && Z.music.displayed === false) { pill("musicStatus", "Musik: aus", "off"); return; }
  try {
    const r = await fetch(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(Z.music.address || "") ? Z.music.address : "http://localhost:1608/", { cache: "no-store" });
    const d = await r.json();
    pill("musicStatus", d && d.title ? "Musik: " + d.title.slice(0, 22) : "Musik: bereit", "ok");
  } catch (e) { pill("musicStatus", "Musik: Tuna aus", "off"); }
}
setInterval(helperCheck, 5000); setInterval(musicCheck, 5000);

const STEPS = [
  ["OBS verbinden", "@einstellungen", () => !!(channel && channel.obs && channel.obs.isOpen)],
  ["Szenen in OBS anlegen", "scenes-setup", () => { const l = (Z.sceneList || {}).list || {}; return Object.values(l).some(x => x && x.obs); }],
  ["Theme der Liga wählen", "themes", () => !!localStorage.getItem("cast-theme-chosen")],
  ["Teams eintragen", "teams-result", () => Z.teams.a.name !== K.DEFAULT.teams.a.name || Z.teams.b.name !== K.DEFAULT.teams.b.name],
  ["Caster-Namen eintragen", "caster-guest", () => Z.caster.c1.name !== K.DEFAULT.caster.c1.name]
];
function stepsDraw() {
  const box = $("stepsList"); if (!box) return;
  const off = localStorage.getItem("cast-steps-off") === "1";
  const finished = STEPS.map(s => { try { return s[2](); } catch (e) { return false; } });
  $("firstSteps").hidden = off || finished.every(Boolean);
  box.innerHTML = "";
  STEPS.forEach(([text, target], i) => {
    const z = document.createElement("div"); z.className = "step" + (finished[i] ? " done" : "");
    z.innerHTML = `<b class="num">${finished[i] ? "✓" : i + 1}</b><span>${text}</span>`;
    if (!finished[i]) { const b = document.createElement("button"); b.className = "button"; b.textContent = "Öffnen"; b.onclick = () => goClose(target); z.appendChild(b); }
    box.appendChild(z);
  });
}
$("stepsOff").onclick = () => { localStorage.setItem("cast-steps-off", "1"); stepsDraw(); };

/* ---------- Videos ---------- */
function videoRating(info) {
  if (!info || info.error) return ["✗", "lässt sich nicht lesen"];
  const obs = (Z.background || {}).source === "obs";
  const w = [];
  if (!obs && (info.codec === "H.265" || info.codec === "AV1")) w.push(`${info.codec}: im Overlay nur mit Grafikkarten-Dekodierung – sicherer: „OBS spielt ab“`);
  if (!obs && info.height > 1080) w.push(`${info.width} × ${info.height} – im Overlay lieber 1920 × 1080 (oder „OBS spielt ab“)`);
  if (!obs && info.faststart === false) w.push("nicht fürs Streaming optimiert (HandBrake: „Web Optimized“)");
  const mb = Math.round(info.size / 1048576);
  return w.length ? ["⚠", w.join(" · ")] : ["✓", `${info.codec}${info.height ? " · " + info.width + " × " + info.height : ""} · ${mb} MB`];
}
async function videoInfoDraw() {
  const box = $("videoInfo");
  let d = { videos: [] };
  try { d = await (await fetch("/api/videos", { cache: "no-store" })).json(); } catch (e) {}
  box.innerHTML = "";
  if (!d.videos.length) { box.innerHTML = `<p class="small">Noch keine Videos im Ordner.</p>`; return; }
  const list = typeof bgList === "function" ? bgList(bgChosen) || bgPlaylists()[0] : null;
  const chosen = new Set(list ? list.videos : []);
  d.videos.forEach(v => {
    const path = "media/videos/" + v.name, [chars, text] = videoRating(v);
    const z = document.createElement("label"); z.className = "row vid-row";
    z.innerHTML = `<input type="checkbox"><span><b>${esc(v.name)}</b><br><span class="small" style="color:${chars === "✗" ? "var(--red)" : chars === "⚠" ? "var(--warn)" : "var(--ok)"}">${chars} ${esc(text)}</span></span>`;
    const cb = z.querySelector("input"); cb.checked = chosen.has(path);
    cb.onchange = () => {                                    // Haken = in der gewählten Playlist (neue Videos hinten anhängen)
      if (!list) return;
      list.videos = cb.checked ? [...list.videos.filter(p => p !== path), path] : list.videos.filter(p => p !== path);
      bgChanged();
    };
    box.appendChild(z);
  });
}
$("videosNew").onclick = videoInfoDraw;
// Ordner im Dateimanager zeigen; geht das nicht (nur Server unter Linux/macOS), steht der Pfad im Hinweis
async function openFolder(which) {
  try {
    const d = await (await fetch("/api/folder?which=" + which, { method: "POST" })).json();
    if (d.ok === false && d.folder) alert("Ordner: " + d.folder);
  } catch (err) { /* App beendet */ }
}
document.querySelectorAll("[data-folder]").forEach(b => b.onclick = () => openFolder(b.dataset.folder));

/* ---------- Log-Reiter ---------- */
let clientsList = [];
function bgTipShow() {
  const H = Z.background || {}, inObs = clientsList.some(c => c.obs && c.page !== "control");
  $("bgTip").hidden = !(inObs && H.source !== "obs" && !H.transparent && (H.videos || []).length && sessionStorage.getItem("bg-tip-off") !== "1");
}
$("bgTipNo").onclick = () => { sessionStorage.setItem("bg-tip-off", "1"); bgTipShow(); };
$("bgTipYes").onclick = async () => {
  Z.background.source = "obs"; Z.background.transparent = false;
  bgSourceDraw(); videoInfoDraw(); send(); bgTipShow();
  // zeigt vorher, was in OBS passiert; abgebrochen → zurück aufs Overlay (Rückgabewert, nie den sichtbaren Text vergleichen)
  if (await obsBackground(false) === "cancelled") { Z.background.source = "overlay"; bgSourceDraw(); videoInfoDraw(); send(); bgTipShow(); }
};
function overlaysPill() {
  bgTipShow();
  const ov = clientsList.filter(c => c.page !== "control");
  const obs = ov.filter(c => c.obs).length, outdated = ov.filter(c => c.v !== K.VERSION).length;
  pill("helperStatus", `Overlays: ${ov.length}${obs ? " (OBS " + obs + ")" : ""}${outdated ? " · " + outdated + " veraltet" : ""}`, outdated ? "warn" : ov.length ? "ok" : "off");
  if (ov.some(c => c.obs && c.v !== K.VERSION)) obsOverlaysNewLoad(false);   // nur wenn das Overlay IN OBS alt ist
}
// Browserquellen der App in OBS neu laden (z. B. nach einem Update – sonst läuft dort der alte Code weiter)
let newLoadedUm = 0;
// Tray „Overlays in OBS neu laden“: über OBS, wenn verbunden (sonst lädt die App die Overlays über ihre Live-Verbindung neu)
if (window.castApp) window.castApp.onReloadOverlays(async () => {
  if (!channel || !channel.obs || !channel.obs.isOpen) return false;
  await obsOverlaysNewLoad(true); return true;
});
async function obsOverlaysNewLoad(fromHand) {
  if (!channel || !channel.obs || !channel.obs.isOpen) { if (fromHand) $("obsNewStatus").textContent = "Nicht mit OBS verbunden."; return; }
  if (!fromHand && Date.now() - newLoadedUm < 600000) return;                 // automatisch höchstens alle 10 Minuten
  newLoadedUm = Date.now();
  try {
    const inputs = (await channel.obs.question("GetInputList", { inputKind: "browser_source" })).inputs || [];
    let n = 0;
    for (const i of inputs) {
      const s = (await channel.obs.question("GetInputSettings", { inputName: i.inputName })).inputSettings || {};
      if (!s.is_local_file && String(s.url || "").startsWith(location.origin)) {
        await channel.obs.question("PressInputPropertiesButton", { inputName: i.inputName, propertyName: "refreshnocache" });
        n++;
      }
    }
    const t = n ? `✓ ${n} Browserquelle(n) in OBS neu geladen` : "Keine Browserquelle der App in OBS gefunden.";
    if ($("obsNewStatus")) $("obsNewStatus").textContent = t;
    if (n) fetch("/api/report", { method: "POST", body: JSON.stringify({ page: "control", text: t }) }).catch(() => {});
  } catch (err) { if ($("obsNewStatus")) $("obsNewStatus").textContent = "OBS: " + err.message; }
}
async function logDraw() {
  if (document.querySelector('.group[data-group="log"]').hidden) return;
  let d; try { d = await (await fetch("/api/log", { cache: "no-store" })).json(); } catch (e) { setHtml($("logText"), "App nicht erreichbar."); return; }
  const time = t => new Date(t).toLocaleTimeString("de-DE");
  const since = t => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? s + " s" : Math.round(s / 60) + " min"; };
  const st = [
    ["Version", d.version], ["Läuft seit", since(d.start)],
    ["OBS-Verbindung", channel && channel.obs && channel.obs.isOpen ? "verbunden" : "nicht verbunden"],
    ["CS2-Live-Daten", d.gsi == null ? "keine" : "vor " + Math.round(d.gsi / 1000) + " s"]
  ];
  const ov = d.clients.filter(c => c.page !== "control");
  setHtml($("logStatus"), st.map(([a, b]) => `<div class="st-row"><b>${a}</b><span>${esc(b)}</span></div>`).join("")
    + `<div class="st-row"><b>Verbundene Overlays</b><span>${ov.length ? ov.map(c => esc(c.page + (c.obs ? " (OBS)" : "") + (c.v !== K.VERSION ? " – alte Version " + c.v : ""))).join(", ") : "keine"}</span></div>`);
  setText($("folderPaths"), `Videos: ${d.folder.videos} · Schriften: ${d.folder.fonts} · Daten: ${d.folder.data}`);
  const only = $("logOnlyError").checked;
  const bottom = $("logText").scrollTop + $("logText").clientHeight >= $("logText").scrollHeight - 20;
  setHtml($("logText"), d.log.filter(z => !only || z.kind !== "info").map(z => `<span class="${z.kind}">${time(z.time)}  ${esc(z.text)}</span>`).join("\n"));
  if (bottom) $("logText").scrollTop = $("logText").scrollHeight;
}
setInterval(logDraw, 2000);
$("obsNew2").onclick = () => obsOverlaysNewLoad(true);
$("appVersion").textContent = "v" + K.VERSION;
// App-Einstellungen (Sprache, Update-Suche)
async function appSettingsFetch() {
  if (!K.SERVER) { $("updateArea").hidden = true; return; }
  try {
    const e = await (await fetch("/api/app-settings", { cache: "no-store" })).json();
    $("updateCheck").checked = e.check_for_updates !== false;
    CastI18n.follow(e.app_language);
    updateDraw(e.update);
  } catch (err) {}
}
/* ---------- Update (⚙ App-Einstellungen → Update) ----------
   Der Server fragt GitHub, lädt die passende Datei, prüft sie und installiert (casting_app/updater.py).
   Die Seite zeigt nur den Stand (GET /api/update) und fragt während Suche/Download jede Sekunde nach. */
const UPDATE_STATES = { idle: "noch nicht gesucht", checking: "suche …", current: "✓ aktuell", available: "Neue Version {} verfügbar",
  downloading: "lade Version {} … {} %", installing: "installiere Version {} – die App startet gleich neu", error: "Update fehlgeschlagen: {}" };
let updateTimer = 0;
var lastUpdateState = "";                          // var: schon vor dieser Zeile lesbar (settingsNavDraw); für den Punkt in den App-Einstellungen (settingsNavDraw)
function updateDraw(u) {
  lastUpdateState = u.state || "";
  if (!u) return;
  $("updateCurrent").textContent = "v" + (u.current || K.VERSION);
  $("updateState").textContent = (UPDATE_STATES[u.state] || u.state).replace("{}", u.state === "error" ? u.error : u.version).replace("{}", u.progress);
  $("updateFrom").textContent = u.updatedFrom ? "aktualisiert von v" + u.updatedFrom : "";   // erster Start nach einem Update
  $("updateProgress").hidden = u.state !== "downloading";
  $("updateProgress").querySelector("i").style.width = (u.progress || 0) + "%";
  const found = u.state === "available" || (u.state === "error" && u.version);
  $("updateInstall").hidden = !(found && u.canInstall);
  $("updatePage").hidden = !(found && !u.canInstall && u.url);
  if (u.url) $("updatePage").href = u.url;
  $("updateSearch").disabled = ["checking", "downloading", "installing"].includes(u.state);
  $("appVersion").textContent = "v" + K.VERSION + (u.state === "available" ? " · Update " + u.version : "");
  clearTimeout(updateTimer);
  if (["checking", "downloading", "installing"].includes(u.state)) updateTimer = setTimeout(updatePoll, 1000);
}
async function updatePoll() { try { updateDraw(await (await fetch("/api/update", { cache: "no-store" })).json()); } catch (err) {} }
$("updateSearch").onclick = async () => { try { updateDraw(await (await fetch("/api/update-check", { method: "POST" })).json()); } catch (err) {} };
$("updateInstall").onclick = async () => {
  if (!await confirmDialog({ title: "Jetzt aktualisieren?", text: "Die App lädt die neue Version, beendet sich und startet neu. Overlays in OBS sind dabei kurz weg – nicht während einer laufenden Sendung.", button: "Aktualisieren" })) return;
  try { updateDraw(await (await fetch("/api/update-install", { method: "POST" })).json()); } catch (err) {}
};
// Sprungleiste oben in den App-Einstellungen
if (window.castApp && window.castApp.onShowUpdate) window.castApp.onShowUpdate(() => settings(true, "updateArea"));
// Sprache: App (Steuerseite, Dialoge, Tray) und Overlays unabhängig voneinander
function languageDraw() {
  document.querySelectorAll("#appLanguage button").forEach(b => b.setAttribute("aria-pressed", b.dataset.language === CastI18n.language));
  document.querySelectorAll("#overlayLanguage button").forEach(b => b.setAttribute("aria-pressed", b.dataset.language === (Z.overlayLanguage || "de")));
}
document.querySelectorAll("#appLanguage button").forEach(b => b.onclick = async () => {
  if (K.SERVER) { try { await fetch("/api/app-settings", { method: "POST", body: JSON.stringify({ app_language: b.dataset.language }) }); } catch (e) {} }
  CastI18n.setLanguage(b.dataset.language);
});
document.querySelectorAll("#overlayLanguage button").forEach(b => b.onclick = () => {
  K.overlayLanguageSet(Z, b.dataset.language); languageDraw(); everything(); send();
});
languageDraw();
$("updateCheck").onchange = () => fetch("/api/app-settings", { method: "POST", body: JSON.stringify({ check_for_updates: $("updateCheck").checked }) }).catch(() => {});
appSettingsFetch(); setTimeout(appSettingsFetch, 8000);
$("logCopy").onclick = () => navigator.clipboard.writeText($("logText").innerText).catch(() => {});
$("logOnlyError").onchange = logDraw;

/* ---------- Sichern / Laden ---------- */
// Kamera-Links (VDO.Ninja) können Passwörter enthalten: zum Weitergeben ohne sie sichern
$("export").onclick = async () => {
  const w = await selection({ title: "Sitzung sichern", text: "Kamera-Links und Geräte können Passwörter enthalten. Zum Weitergeben an andere besser ohne sie sichern.",
    buttons: [["share", "Ohne Kamera-Links", "main"], ["own", "Mit Kamera-Links (eigene Sicherung)", ""], ["", "Abbrechen", ""]] });
  if (!w) return;
  const data = K.clone(Z);
  if (w === "share") for (const q of Object.values(data.sources || {})) if (q && typeof q === "object") { q.url = ""; q.device = ""; q.deviceName = ""; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  a.download = "cast-sitzung.json"; a.click();
};
$("import").onclick = () => $("importFile").click();
$("importFile").onchange = () => {
  const f = $("importFile").files[0]; if (!f) return;
  if (f.size > 8 * 1024 * 1024) return alert("Die Datei ist zu groß für eine Sitzung.");
  f.text().then(t => {
    const data = CastLegacy.migrateImport(JSON.parse(t));
    if (data && typeof data === "object") delete data.revision;       // die Stand-Nummer bestimmt diese App, nie die Datei
    Z = K.merge(K.clone(K.DEFAULT), data); everything(); send();
  }).catch(() => alert("Datei konnte nicht gelesen werden."));
};
$("reset").onclick = async () => { if (await confirmDialog({ title: "Alles zurücksetzen?", text: "Teams, Texte, Veto, Spieler, Sponsoren, Themes und Einstellungen gehen auf Standard. Tipp: vorher „Sichern (.json)“.", button: "Alles zurücksetzen" })) { Z = K.clone(K.DEFAULT); everything(); send(); } };

/* ---------- Vorschau ---------- */
function preview() {
  const single = onSource();
  $("scene").disabled = single;
  if (single) $("scene").value = "overlay"; else if ($("scene").value === "overlay") $("scene").value = "intro";
  $("previewText").textContent = single ? "Vorschau = die Sendung, genau so wie in OBS (overlay.html)." : "Die Vorschau zeigt die gewählte Szene. In OBS ändern sich die Overlays gleichzeitig mit.";
  $("frame").src = (single ? "overlay" : $("scene").value) + ".html?preview=1";
}
$("scene").onchange = preview;
$("frame").onload = () => $("frame").contentWindow.postMessage({ cast: "state", z: Z }, location.origin);
// Vorschau so groß wie möglich, ohne Verzerrung (wie in OBS); im Studio-Modus zwei Bilder nebeneinander
function previewSize() {
  const p = $("stageSlot"), studio = p.classList.contains("studio");
  const w = studio ? Math.max(0, (p.clientWidth - $("studioTake").offsetWidth - 24) / 2) : p.clientWidth;
  const h = studio ? p.clientHeight - 22 : p.clientHeight;
  let s = w / 1920;
  if (h > 60 && getComputedStyle(p).display !== "block") s = Math.min(s, h / 1080);
  s = Math.max(0.05, s);
  if (getComputedStyle(p).display !== "block") { $("stage").style.width = Math.floor(1920 * s) + "px"; $("stage").style.height = Math.floor(1080 * s) + "px"; }
  $("frame").style.transform = `scale(${getComputedStyle(p).display === "block" ? $("stage").clientWidth / 1920 : s})`;
  if (studio) {
    $("studioStage").style.width = $("stage").style.width; $("studioStage").style.height = $("stage").style.height;
    $("studioFrame").style.transform = $("frame").style.transform;
  }
}

/* ---------- Studio-Modus (wie in OBS) ----------
   Ein Klick auf eine Szene legt sie nur in die Vorschau (links); „Übergang“ schaltet sie live. Danach liegt die
   vorige Programm-Szene in der Vorschau (wie OBS). Nur mit einer Browserquelle – mit einzelnen OBS-Szenen hat OBS
   seinen eigenen Studio-Modus. Die Vorschau ist eine zweite overlay.html mit ?studio=<Szene>, stumm. */
// var/function: scenesDraw (04) läuft schon beim Laden, bevor diese Zeilen erreicht sind
var studioNext = "";
function studioOn() { return !!ui.studio && onSource(); }
function studioDraw() {
  const on = studioOn();
  $("studioButton").hidden = !onSource();
  $("studioButton").setAttribute("aria-pressed", on);
  $("studioButton").classList.toggle("main", on);
  $("stageSlot").classList.toggle("studio", on);
  $("studioSide").hidden = $("studioTake").hidden = $("programLabel").hidden = !on;
  const f = $("studioFrame");
  if (!on) { if (f._live) { f.src = "about:blank"; f._live = false; f._scene = ""; } previewSize(); return; }   // entladen: spart Leistung
  if (!studioNext) studioNext = Z.broadcast.scene || "intro";
  // einmal laden, danach nur die Szene schicken (kein Neuladen, kein Flackern)
  if (!f._live) { f.src = "overlay.html?preview=1&studio=" + encodeURIComponent(studioNext); f._live = true; }
  else if (f._scene !== studioNext) try { f.contentWindow.postMessage({ cast: "studio", scene: studioNext }, location.origin); } catch (err) {}
  f._scene = studioNext;
  $("studioName").textContent = (OVERLAY_SCENES.find(([k]) => k === studioNext) || DACH_SCENES.find(x => x[1] === studioNext) && [, DACH_SCENES.find(x => x[1] === studioNext)[2]] || [, studioNext])[1];
  $("studioTake").disabled = studioNext === Z.broadcast.scene;
  previewSize();
}
function studioPick(k) { studioNext = k; studioDraw(); scenesDraw(); }
function studioTake() {
  const k = studioNext, before = Z.broadcast.scene;
  if (!k || k === before) return;
  if (K.DACH_PAGES[k]) dachSwitch(k); else sceneSwitch(k);           // DACH CS – Offiziell: eigene Szenen
  studioNext = before || k;                     // wie OBS: die vorige Programm-Szene liegt jetzt in der Vorschau
  studioDraw(); scenesDraw();
}
$("studioButton").onclick = () => { ui.studio = !ui.studio; uiSave(); studioNext = ""; studioDraw(); scenesDraw(); };
$("studioTake").onclick = studioTake;
$("studioFrame").onload = () => { if ($("studioFrame")._live) try { $("studioFrame").contentWindow.postMessage({ cast: "state", z: Z }, location.origin); } catch (err) {} };
new ResizeObserver(previewSize).observe($("stageSlot"));

/* ---------- Reiter ---------- */
function vsHead() {
  const s = (OVERLAY_SCENES.find(([k]) => k === (onSource() ? Z.broadcast.scene : $("scene").value)) || [, ""])[1];
  if ($("vsScene")) $("vsScene").textContent = s || "";
  if ($("vsTheme")) $("vsTheme").textContent = "Theme " + ((T[Z.theme] || {}).name || Object.assign({}, T[Z.theme], (Z.themeData || {})[Z.theme]).name || Z.theme);
}
function tabs(target) {
  document.querySelectorAll(".group").forEach(g => { g.hidden = g.dataset.group !== target; });
  document.body.classList.toggle("pages-mode", target !== "live");
  setTimeout(columnEmptyCheck, 0);
  document.querySelectorAll("#tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.target === target));
  try { localStorage.setItem("cast-tabs", target); } catch (e) {}
}
document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => { tabs(b.dataset.target); if (b.dataset.target === "log") logDraw(); });
tabs((() => { try { return localStorage.getItem("cast-tabs") || "live"; } catch (e) { return "live"; } })());

setTimeout(audioFetch, 1500);
// alles neu zeichnen – jedes Teil für sich: ein Fehler (z. B. aus einer importierten Datei) legt nicht die ganze Seite lahm
function everything() {
  const parts = [bgApply, bgDraw, timerEndDraw, languageDraw, () => { if (typeof dachCardShow === "function") { dachCardShow(); dframeDraw(); } },
    audioDraw, cleanDraw, mbarDraw, tournamentDraw, mdDraw, bgSourceDraw, graphicsDraw, poolComplete, scenesDraw, scenesSetupDraw, sponsorsDraw,
    seriesDraw, videoInfoDraw, sourcesDraw, themesDraw, themeAdjust, fieldsFill, () => teamDraw("a"), () => teamDraw("b"), timerShow, poolDraw,
    vetoDraw, () => playersDraw("a"), () => playersDraw("b")];
  for (const part of parts) {
    try { part(); } catch (err) { console.error("Anzeige-Fehler", part.name || "Teil", err); }
  }
}
everything();
helperCheck(); musicCheck();
(async () => {
  // Mit dem Server: dessen gespeicherten Stand übernehmen, falls er neuer ist
  if (K.SERVER) {
    try {
      const r = await fetch("/api/state?after=0", { cache: "no-store" });
      if (r.status === 200) { const s = await r.json(); if ((s.revision || 0) > (Z.revision || 0)) Z = K.merge(K.clone(K.DEFAULT), s); }
    } catch (e) {}
  }
  const mem = await K.Images.load();
  Z = K.resolve(Z, mem); startDone = true; everything(); preview(); send();
})();
sessionsDraw();
devicesSearch(false);
