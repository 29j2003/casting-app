/* CASTING-APP · Steuerseite – OBS-Szenen: zuordnen, in OBS anlegen, Zugangsschlüssel der Browserquellen
   Teil 4 von 13; Reihenfolge und Lageplan: control/01-core.js
   (der Server verbindet alle Dateien zu einem Skript – siehe dort) */

/* ---------- OBS-Szenen (einfach) ---------- */
// Alle Overlay-Szenen sind vorgegeben – du wählst nur aus, welche du benutzt.
const OVERLAY_SCENES = [
  ["intro", "Intro"], ["cast-duo", "Cast Duo"], ["cast-solo", "Cast Solo"],
  ["cast-duo-clips", "Duo + Clips"], ["cast-solo-clips", "Solo + Clips"],
  ["cast-duo-interview", "Duo + Interview"], ["cast-solo-interview", "Solo + Interview"],
  ["cast-trio", "Cast Trio"], ["cast-trio-host", "Trio – Moderator groß"], ["cast-quad", "4 Personen"],
  ["viewers", "Zuschauer-Cams"], ["viewers-cast", "Zuschauer + Caster"],
  ["map-veto", "Map-Veto"], ["players", "Line-ups"], ["teams", "Teams-Vorstellung"], ["series", "Serie"],
  ["sponsors", "Sponsoren"], ["ads", "Werbung"], ["ingame", "Ingame"], ["pause", "Pause"], ["end", "Ende"],
  ["scoreboard", "Scoreboard"], ["team-a", "Team A"], ["team-b", "Team B"], ["h2h", "Head-to-Head"], ["bracket", "Turnierbaum"]
];
// Varianten, die erst nach Einschalten (Setup → Szenen & OBS) als Knopf erscheinen
const SCENES_OFF = ["cast-trio-host", "viewers"];
let obsScenes = [], currentScene = "", transitions = [], obsTransition = "";
function sceneCfg() {
  const c = ensure(Z, "sceneList", { on: true, defaultChoice: "" });
  ensure(c, "list", {});
  OVERLAY_SCENES.forEach(([k]) => ensure(c.list, k, { on: !SCENES_OFF.includes(k), obs: "", transition: "" }));
  return c;
}
const obsName = label => "Cast – " + label;
// passende OBS-Szene automatisch finden (gleicher Name, „Cast – …" oder ähnlich)
function obsAssign() {
  const c = sceneCfg(), norm = s => String(s).toLowerCase().replace(/[^a-z0-9äöü]/g, "");
  OVERLAY_SCENES.forEach(([k, n]) => {
    const e = c.list[k];
    if (e.obs && obsScenes.includes(e.obs)) return;
    e.obs = obsScenes.find(s => s === obsName(n)) || obsScenes.find(s => norm(s) === norm(n) || norm(s) === norm(k) || norm(s).endsWith(norm(n))) || "";
  });
}
async function scenesLoad() {
  if (channel.obs && channel.obs.isOpen) {
    try {
      const s = await channel.obs.question("GetSceneList");
      obsScenes = (s.scenes || []).slice().sort((a, b) => b.sceneIndex - a.sceneIndex).map(x => x.sceneName);
      currentScene = s.currentProgramSceneName || currentScene;
      const t = await channel.obs.question("GetSceneTransitionList");
      transitions = (t.transitions || []).map(x => x.transitionName);
      if (!obsTransition) obsTransition = t.currentSceneTransitionName || "";
      obsAssign();
    } catch (e) { /* OBS antwortet nicht */ }
  }
  scenesDraw(); scenesSetupDraw();
}
function overGameQuit() { if (Z.broadcast.overGame) Z.broadcast.overGame = null; }
async function sceneSwitch(k) {
  if (/^dach-/.test(k) && dachMode()) return dachSwitch(k);            // DACH-Seite (z. B. zurück nach der Werbung)
  overGameQuit(); if (k !== "ingame") Z.broadcast.clean = false;
  const c = sceneCfg(), e = c.list[k];
  if (onSource()) {                                                   // alles in overlay.html
    if (!c.on) return;
    const before = Z.broadcast.scene;
    Z.broadcast.scene = k; Z.broadcast.num = (Z.broadcast.num || 0) + 1;
    if (before !== k) Z.background.override = null;                   // eine Änderung in der Live-Ecke gilt bis zum Szenenwechsel
    if (before === "ads" && k !== "ads" && Z.ads) { Z.ads.play = null; adsBack = null; }   // Werbung verlassen: sie endet
    bgApply(k); scenesDraw(); send();
    // Hintergrund-Video in OBS: blendet mit der Szene (wie das Overlay: zu Ingame 55 %, aus Ingame 60 % der Dauer),
    // beim Stinger schaltet es unter dem Stinger um, bei Schnitt sofort
    const t = Z.broadcast.transition, d = Z.broadcast.duration || 0, toIngame = k === "ingame";
    if (before !== k && (toIngame || before === "ingame")) {
      if (t === "cut" || !d) obsBackgroundVisible(0, 0);
      else if (t === "stinger") obsBackgroundVisible(d * .5, 0);
      else obsBackgroundVisible(0, d * (toIngame ? .55 : .6));
    } else obsBackgroundVisible(0, 0);
    return;
  }
  $("scene").value = k; preview();                                  // Vorschau folgt
  if (!c.on || !channel.obs.isOpen || !e.obs) return;
  const transitionTo = e.transition || c.defaultChoice || obsTransition;
  try {
    if (transitionTo) await channel.obs.question("SetCurrentSceneTransition", { transitionName: transitionTo }).catch(() => {});
    await channel.obs.question("SetCurrentProgramScene", { sceneName: e.obs });
    currentScene = e.obs; Z.background.override = null; bgApply(k); send(); scenesDraw();
  } catch (err) { $("sceneHint").textContent = "Wechsel fehlgeschlagen: " + err.message; }
}
// Stats während Ingame über dem Spiel
const OVER_GAME = ["scoreboard", "team-a", "team-b", "h2h", "bracket", "series"];
// Szenen, die ohne CS2-Livedaten nur „Warte auf CS2-Daten …“ zeigen – ihre Knöpfe sagen das vorher
const LIVE_SCENES = ["scoreboard", "team-a", "team-b", "h2h"];
function liveFresh() { return !!(liveLast && Date.now() - liveLast.time < 15000); }
// Szene braucht Daten, die gerade fehlen (CS2-Szenen ohne Livedaten) – DACH-Seiten ohne Match: 12-dach.js
function sceneNeedsData(k) { return LIVE_SCENES.includes(k) && !liveFresh(); }
function overSubDraw() {
  const U = Z.broadcast.overGame || {}, on = overGameVisible() ? U.scene : "", d = Z.broadcast.overGameDuration ?? 15;
  const sub = document.createElement("div"); sub.className = "scene-sub";
  sub.innerHTML = `<b>ÜBER DEM SPIEL <span>${d > 0 ? `blendet nach ${d} s aus` : "bleibt stehen"}</span></b>` + OVER_GAME.map(k =>
    `<button type="button" data-over="${k}" class="${k === on ? "on" : ""}${LIVE_SCENES.includes(k) && !liveFresh() ? " needs-data" : ""}" aria-pressed="${k === on}"${LIVE_SCENES.includes(k) && !liveFresh() && k !== on ? ' aria-disabled="true"' : ""}>${esc((OVERLAY_SCENES.find(([x]) => x === k) || [, k])[1])}</button>`).join("");
  sub.querySelectorAll("[data-over]").forEach(b => b.onclick = () => { if (b.getAttribute("aria-disabled")) return; overGameToggle(b.dataset.over); if (typeof overDraw === "function") overDraw(); });
  return sub;
}
function overGameVisible() { const U = Z.broadcast.overGame || {}; return !!U.scene && (!U.until || U.until > Date.now()); }
function overGameToggle(k) {
  const U = Z.broadcast.overGame || {};
  if (U.scene === k && overGameVisible()) Z.broadcast.overGame = null;
  else { const d = Z.broadcast.overGameDuration ?? 15; Z.broadcast.overGame = { scene: k, until: d > 0 ? Date.now() + d * 1000 : 0 }; }
  scenesDraw(); send();
}
setInterval(() => { const U = Z.broadcast.overGame; if (U && U.until && U.until <= Date.now()) { Z.broadcast.overGame = null; scenesDraw(); } }, 1000);
// Reihenfolge wie eine Sendung abläuft – eigene Reihenfolge per Ziehen („Anordnen“)
const SCENE_DEFAULT = ["#pregame", "intro", "cast-solo", "cast-duo", "cast-trio", "cast-trio-host", "cast-quad", "players", "teams", "map-veto",
  "#during", "ingame",
  "#stats", "scoreboard", "team-a", "team-b", "h2h", "bracket", "series",
  "#pause", "pause", "sponsors", "ads", "cast-duo-clips", "cast-solo-clips", "viewers-cast", "viewers",
  "#post", "cast-duo-interview", "cast-solo-interview", "end"];
const SCENE_GROUPS = { "#pregame": "Vor dem Spiel", "#during": "Im Spiel", "#stats": "Stats & Turnier", "#pause": "Pause", "#post": "Nach dem Spiel", "#between": "Zwischen den Maps" };
let sceneArrange = false;
function scenesRow() {
  const custom = (typeof ui !== "undefined" && ui.sceneRow) || SCENE_DEFAULT;
  const all = OVERLAY_SCENES.map(([k]) => k);
  return [...custom.filter(k => all.includes(k) || SCENE_GROUPS[k]), ...all.filter(k => !custom.includes(k))]
    .map(k => SCENE_GROUPS[k] ? [k, SCENE_GROUPS[k]] : OVERLAY_SCENES.find(([x]) => x === k));
}
function scenesDraw() {
  if (typeof vsHead === "function") vsHead();
  if (typeof cleanDraw === "function") try { cleanDraw(); } catch (err) {}
  if (typeof headDraw === "function") try { headDraw(); } catch (err) {}
  try { studioDraw(); } catch (err) {}                                  // Studio-Modus: Vorschau und „Übergang“ aktuell halten
  const c = sceneCfg(), box = $("sceneButtons"); box.innerHTML = "";
  $("sceneOn").checked = !!c.on;
  const connected = !!(channel && channel.obs && channel.obs.isOpen);
  const single = onSource();
  $("sceneTransition").hidden = !single;
  if (single) transitionChoiceDraw();
  if (typeof dachMode === "function" && dachMode()) { box.innerHTML = ""; dachScenesDraw(box); return; }
  box.classList.toggle("arrange", sceneArrange);
  box.classList.toggle("columns", !sceneArrange);
  // sagen, warum die Knöpfe grau sind – statt still nichts zu tun
  const why = sceneArrange ? "" : !c.on ? "Szenenwechsel ist aus – oben den Haken setzen."
    : !single && !connected ? "Mehrere OBS-Szenen: erst mit OBS verbinden (⚙ App-Einstellungen) – oder unter Setup → Szenen & OBS „eine Browserquelle“ nutzen." : "";
  if (why) box.insertAdjacentHTML("beforeend", `<p class="small scene-why">${esc(why)}</p>`);
  let column = null;
  $("sceneArrange").innerHTML = sceneArrange ? icon("check") + "Fertig" : icon("edit") + "Anordnen"; $("sceneDefault").hidden = !sceneArrange;
  const line = scenesRow();
  line.filter(([k], i) => {
    if (!SCENE_GROUPS[k]) return sceneArrange || c.list[k].on;
    if (sceneArrange) return true;                                   // Überschrift nur, wenn darunter etwas sichtbar ist
    for (let j = i + 1; j < line.length && !SCENE_GROUPS[line[j][0]]; j++) if (c.list[line[j][0]].on) return true;
    return false;
  }).forEach(([k, n]) => {
    if (SCENE_GROUPS[k]) { const h = document.createElement("div"); h.className = "scene-group"; h.dataset.sceneDef = k; h.textContent = n;
      if (!sceneArrange) { column = document.createElement("div"); column.className = "scene-column"; column.appendChild(h); box.appendChild(column); } else box.appendChild(h); return; }
    const e = c.list[k], b = document.createElement("button");
    b.textContent = n; b.dataset.sceneDef = k;
    if (sceneArrange) {
      // Anordnen: Klick = Haken an/aus, Ziehen = verschieben (kein Szenenwechsel)
      b.classList.toggle("off", !e.on);
      b.insertAdjacentHTML("beforeend", `<span class="tick">${e.on ? icon("check") : ""}</span>`);
      b.onclick = () => { if (b._dragged) { b._dragged = false; return; } e.on = !e.on; scenesDraw(); send(); };
      b.addEventListener("pointerdown", ev => sceneDragStart(ev, b));
      box.appendChild(b); return;
    }
    b.className = (single ? Z.broadcast.scene === k : e.obs && e.obs === currentScene) ? "active" : "";
    b.disabled = !c.on || (!single && (!connected || !e.obs));
    b.title = e.obs ? "OBS-Szene: " + e.obs : "Keine OBS-Szene zugeordnet (Setup → Szenen einrichten)";
    // ohne Daten nicht wählbar (sie zeigte sonst nur „Warte auf CS2-Daten …“) – läuft sie schon, bleibt sie bedienbar
    if (sceneNeedsData(k) && Z.broadcast.scene !== k) { b.classList.add("needs-data"); b.setAttribute("aria-disabled", "true"); b.title = "Braucht CS2-Livedaten – erst CS2 verbinden (Setup → CS2-Livedaten)."; }
    if (studioOn() && k === studioNext) b.classList.add("studio-next");
    b.onclick = () => b.getAttribute("aria-disabled") ? null : studioOn() ? studioPick(k) : sceneSwitch(k);
    (column && !sceneArrange ? column : box).appendChild(b);
    // läuft Ingame: direkt darunter „Über dem Spiel“ – Scoreboard, Team A … über dem Spielbild, ohne die Szene zu wechseln
    if (k === "ingame" && single && Z.broadcast.scene === "ingame") (column || box).appendChild(overSubDraw());
  });
  box.style.setProperty("--scene-columns", Math.max(1, box.querySelectorAll(".scene-column").length));
  const without = OVERLAY_SCENES.filter(([k]) => c.list[k].on && !c.list[k].obs).length;
  $("sceneHint").textContent = single ? "Wechselt in overlay.html (eine Browserquelle). Rot = läuft gerade."
    : !connected ? "Nicht mit OBS verbunden – ⚙ App-Einstellungen → Verbindung zu OBS."
    : without ? `${without} Szene(n) ohne OBS-Szene – Setup → Szenen einrichten → „In OBS anlegen".` : "";
  // Sponsor schnell einblenden
  const sponsor = $("sponsorQuick"); sponsor.innerHTML = "";
  const list = sponsorEntries();
  if (list.length) {
    sponsor.innerHTML = `<span class="small">Sponsor groß einblenden:</span><div class="map-buttons"></div>`;
    list.forEach((s, i) => { const b = document.createElement("button"); b.className = "button"; b.innerHTML = icon("play") + esc(s.name || "Sponsor " + (i + 1)); b.onclick = () => sponsorShowgfx(i); sponsor.lastChild.appendChild(b); });
  }
}
$("sceneOn").onchange = () => { sceneCfg().on = $("sceneOn").checked; scenesDraw(); send(); };
function scenesSetupDraw() {
  const c = sceneCfg(), box = $("sceneSetup"); box.innerHTML = "";
  const single = onSource();
  $("sceneCreate").textContent = single ? "Szene „Cast – Sendung“ in OBS anlegen" : "In OBS anlegen";
  $("sceneOneText").hidden = true; $("sceneManyText").hidden = single; $("sceneDefaultField").hidden = single;
  $("onSourceText").hidden = false;
  const opt = (list, value, empty) => `<option value="">${empty}</option>` + list.map(x => `<option value="${esc(x)}"${x === value ? " selected" : ""}>${esc(x)}</option>`).join("")
    + (value && !list.includes(value) ? `<option value="${esc(value)}" selected>${esc(value)} (fehlt in OBS)</option>` : "");
  $("sceneDefault").innerHTML = opt(transitions, c.defaultChoice, obsTransition ? `wie in OBS (${esc(obsTransition)})` : "wie in OBS");
  $("sceneDefault").onchange = () => { c.defaultChoice = $("sceneDefault").value; send(); };
  if (single) {
    // eine Browserquelle: nur „in Live zeigen“ – kompakte Kacheln je Gruppe (wie in Live)
    box.insertAdjacentHTML("beforeend", `<p class="small">Angehakte Szenen erscheinen in Live als Knopf.</p>`);
    const grid = document.createElement("div"); grid.className = "scene-pick";
    let column = null;
    scenesRow().forEach(([k, n]) => {
      if (SCENE_GROUPS[k]) { column = document.createElement("div"); column.className = "scene-pick-group"; column.innerHTML = `<b>${esc(n)}</b>`; grid.appendChild(column); return; }
      const e = c.list[k]; if (!e) return;
      if (!column) { column = document.createElement("div"); column.className = "scene-pick-group"; grid.appendChild(column); }
      const b = document.createElement("button"); b.type = "button"; b.className = "scene-pick-chip"; b.dataset.scene = k;
      b.setAttribute("aria-pressed", !!e.on); b.innerHTML = `${icon("check")}<span>${esc(n)}</span>`;
      b.onclick = () => { e.on = !e.on; scenesDraw(); scenesSetupDraw(); send(); };
      column.appendChild(b);
    });
    box.appendChild(grid);
    return;
  }
  box.insertAdjacentHTML("beforeend", `<div class="row scene-row small" style="background:none"><span></span><b>Szene</b><b>OBS-Szene</b><b>Übergang</b></div>`);
  OVERLAY_SCENES.forEach(([k, n]) => {
    const e = c.list[k], z = document.createElement("div"); z.className = "row scene-row";
    z.innerHTML = `<input type="checkbox" title="Im Reiter Live anzeigen"><span>${esc(n)}</span>
      <select>${opt(obsScenes, e.obs, "– nicht zugeordnet –")}</select>
      <select>${opt(transitions, e.transition, "Standard")}</select>`;
    const cb = z.querySelector("input"), [obs, transitionTo] = z.querySelectorAll("select");
    cb.checked = !!e.on;
    cb.onchange = () => { e.on = cb.checked; scenesDraw(); send(); };
    obs.onchange = () => { e.obs = obs.value; scenesDraw(); send(); };
    transitionTo.onchange = () => { e.transition = transitionTo.value; send(); };
    box.appendChild(z);
  });
}
// Fehlende Szenen in OBS anlegen – jeweils mit der passenden Browserquelle
// Browserquelle anlegen – oder eine vorhandene (z. B. aus einer älteren Version) auf die App umstellen
async function sourceEnsure(scene, name, settings) {
  const inputs = ((await channel.obs.question("GetInputList", {})).inputs || []).map(i => i.inputName);
  if (inputs.includes(name)) {
    await channel.obs.question("SetInputSettings", { inputName: name, inputSettings: settings, overlay: true });
    const items = ((await channel.obs.question("GetSceneItemList", { sceneName: scene })).sceneItems || []).map(i => i.sourceName);
    if (!items.includes(name)) await channel.obs.question("CreateSceneItem", { sceneName: scene, sourceName: name });
    return "updated";
  }
  await channel.obs.question("CreateInput", { sceneName: scene, inputName: name, inputKind: "browser_source", inputSettings: settings });
  return "fresh";
}
// Plan erstellen: was würde in OBS passieren? (noch nichts ändern)
async function obsPlan() {
  await scenesLoad();
  const inputs = ((await channel.obs.question("GetInputList", {})).inputs || []).map(i => i.inputName);
  const url = file => location.origin + "/" + file;
  const plan = [];
  const single = async (scene, source, file) => {
    const newScene = !obsScenes.includes(scene), da = inputs.includes(source);
    let inScene = false;
    if (!newScene) inScene = ((await channel.obs.question("GetSceneItemList", { sceneName: scene })).sceneItems || []).some(i => i.sourceName === source);
    if (newScene) plan.push({ text: `Szene „${scene}“ anlegen` });
    if (!da) plan.push({ text: `Browserquelle „${source}“ anlegen (${url(file)}, 1920 × 1080, 60 fps)` });
    else plan.push({ text: `Vorhandene Browserquelle „${source}“ auf die App umstellen (${url(file)})`, warn: true });
    if (da && !inScene) plan.push({ text: `„${source}“ zusätzlich in „${scene}“ einfügen` });
    return { scene, source, file };
  };
  const tasks = [];
  if (onSource()) tasks.push(await single("Cast – Sendung", "Cast – Overlay", "overlay.html"));
  else {
    const c = sceneCfg();
    for (const [k, n] of OVERLAY_SCENES) {
      if (!c.list[k].on) continue;
      const scene = c.list[k].obs && obsScenes.includes(c.list[k].obs) ? c.list[k].obs : obsName(n);
      tasks.push(Object.assign(await single(scene, obsName(n) + " (Overlay)", k + ".html"), { k }));
    }
  }
  if (onSource()) plan.push({ text: "Zur Szene „Cast – Sendung“ wechseln" });
  return { plan, tasks };
}
$("sceneCreate").onclick = async () => {
  if (!channel.obs.isOpen) { $("sceneStatus").textContent = "Erst mit OBS verbinden (⚙ App-Einstellungen)."; return; }
  let p;
  try { p = await obsPlan(); } catch (err) { $("sceneStatus").textContent = "OBS antwortet nicht: " + err.message; return; }
  const ok = await confirmDialog({
    title: "Das passiert jetzt in OBS",
    text: "Bitte kurz prüfen. Gelöscht wird nichts – vorhandene Quellen werden nur auf die App umgestellt.",
    list: p.plan, button: "In OBS ausführen"
  });
  if (!ok) { $("sceneStatus").textContent = "Abgebrochen – in OBS wurde nichts geändert."; return; }
  const base = { width: 1920, height: 1080, fps_custom: true, fps: 60, reroute_audio: true, restart_when_active: false, shutdown: false };
  const result = [];
  $("sceneStatus").textContent = "Richte OBS ein …";
  for (const a of p.tasks) {
    try {
      if (!obsScenes.includes(a.scene)) { await channel.obs.question("CreateScene", { sceneName: a.scene }); obsScenes.push(a.scene); }
      result.push([a.scene, await sourceEnsure(a.scene, a.source, Object.assign({}, base, { is_local_file: false, url: location.origin + K.withAccess("/" + a.file) }))]);
      if (a.k) sceneCfg().list[a.k].obs = a.scene;
    } catch (err) { result.push([a.scene, "Fehler: " + err.message]); }
  }
  if (onSource()) { try { await channel.obs.question("SetCurrentProgramScene", { sceneName: "Cast – Sendung" }); } catch (err) {} } else send();
  await scenesLoad();
  const error = result.filter(x => x[1].startsWith("Fehler"));
  $("sceneStatus").innerHTML = (error.length ? `⚠ ${error.length} Problem(e): ` + error.map(x => esc(x[0] + " – " + x[1])).join(" · ") + "<br>" : "✓ ")
    + esc(result.filter(x => !x[1].startsWith("Fehler")).map(x => `${x[0]}: ${x[1] === "fresh" ? "angelegt" : "auf die App umgestellt"}`).join(" · "))
    + (onSource() ? "<br>Spielbild: in OBS die Spielaufnahme in „Cast – Sendung“ unter die Browserquelle legen." : "");
};

// Browserquelle von Hand anlegen: Adresse mit Zugangsschlüssel in die Zwischenablage (nie anzeigen – sie ist geheim)
$("overlayAddressCopy").hidden = !(K.SERVER && K.ACCESS);
$("overlayAddressCopy").onclick = async () => {
  try {
    await navigator.clipboard.writeText(location.origin + K.withAccess("/overlay.html"));
    $("sceneStatus").textContent = "✓ Adresse kopiert – in OBS als Browserquelle (1920 × 1080) einfügen. Sie enthält den Zugangsschlüssel: nicht weitergeben.";
  } catch (err) { $("sceneStatus").textContent = "Kopieren nicht möglich – „In OBS anlegen“ nutzen."; }
};
