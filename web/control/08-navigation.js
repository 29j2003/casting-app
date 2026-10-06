/* CASTING-APP · Steuerseite – Arbeitsbereiche, Unterseiten anwenden, Befehlspalette (Strg K)
   Teil 8 von 13; Reihenfolge und Lageplan: control/01-core.js
   (der Server verbindet alle Dateien zu einem Skript – siehe dort) */

/* ---------- Arbeitsbereiche: Vorlagen + eigene gespeicherte Anordnungen ---------- */
const TEMPLATES = {
  "Operator": { dock: { bottom: ["sceneList", "audio"], right: ["scene-tools", "match", "graphics", "tournament-live"] }, b2: 450, hU: 320, previewClose: false, tabs: "live", large: false },
  "Caster – große Knöpfe": { dock: { bottom: ["sceneList"], right: ["scene-tools", "match", "graphics"] }, b2: 470, hU: 330, previewClose: false, tabs: "live", large: true },
  "Laptop / neben OBS": { dock: { bottom: [], right: [] }, previewClose: true, tabs: "live", large: false },
  "Vorbereitung": { dock: { bottom: [], right: [] }, previewClose: false, tabs: "match", large: false }
};
function arrangementNow() {
  return { dock: K.clone(ui.dock || {}), b1: ui.b1, b2: ui.b2, hU: ui.hU, previewClose: !!ui.previewClose, placement: ui.placement || null,
           locked: Object.assign({}, ui.locked), large: document.body.classList.contains("large"), tabs: localStorage.getItem("cast-tabs") || "live" };
}
function arrangementApply(A) {
  areas.forEach(d => { if (placeFrom(d) !== "left") afterHome(d); });
  for (const place of ["bottom", "right"]) ((A.dock || {})[place] || []).forEach(entry => {
    if (typeof entry === "string") { const d = areaAfter(entry); if (d) { DOCKS[place].insertBefore(d, DOCKS[place].querySelector(".dock-target")); d.open = true; } return; }
    const cards = (entry.tabs || []).map(areaAfter).filter(Boolean);
    if (cards.length < 2) { cards.forEach(d => DOCKS[place].insertBefore(d, DOCKS[place].querySelector(".dock-target"))); return; }
    const g = groupNew(DOCKS[place], null, entry.active); cards.forEach(d => g.appendChild(d)); tabsDraw(g);
  });
  ["b1", "b2", "hU"].forEach(k => { ui[k] = A[k] ?? null; if (ui[k] == null) pageEl.style.removeProperty("--" + k); });
  ui.previewClose = !!A.previewClose; ui.placement = A.placement || null; ui.locked = Object.assign({}, A.locked);
  document.body.classList.toggle("large", !!A.large); ui.large = !!A.large;
  dockRemember(); widths(); placementSet(); lockDraw(); belowApply();
  if (A.tabs) tabs(A.tabs);
}
function workspaceChoose(name) {
  const own = (ui.workspaces || []).find(x => x.name === name);
  const A = own ? own.data : TEMPLATES[name]; if (!A) return;
  ui.workspace = name; arrangementApply(A); uiSave(); workspaceDraw();
}
function workspaceDraw() {
  $("workspaceName").textContent = ui.workspace || "Operator";
  const m = $("workspaceMenu"), cur = ui.workspace || "Operator";
  const entry = (name, info, own) => `<button role="menuitem" data-workspace="${esc(name)}" class="${name === cur ? "active" : ""}"><span class="tick">${name === cur ? icon("check") : ""}</span><span class="name">${esc(name)}</span><span class="info">${info}</span>${own ? `<span class="away" data-away="${esc(name)}" title="Löschen" aria-label="Löschen">${icon("close")}</span>` : ""}</button>`;
  m.innerHTML = `<div class="workspace-title">VORLAGEN</div>` + Object.keys(TEMPLATES).map(n => entry(n, "", false)).join("") +
    ((ui.workspaces || []).length ? `<div class="workspace-title">EIGENE</div>` + ui.workspaces.map(x => entry(x.name, "", true)).join("") : "") +
    `<hr><div class="workspace-new"><input type="text" id="workspaceNewName" placeholder="Aktuelle Anordnung speichern als …" aria-label="Name"><button class="button" id="workspaceNewSave" style="height:34px">Speichern</button></div>
     <button role="menuitem" data-action="edit"><span class="tick"></span><span class="name">${document.body.classList.contains("layout-edit") ? "Layout bearbeiten beenden" : "Layout bearbeiten"}</span></button>`;
  m.querySelectorAll("[data-workspace]").forEach(b => b.onclick = ev => {
    if (ev.target.dataset.away) return;
    m.hidden = true; workspaceChoose(b.dataset.workspace);
  });
  m.querySelectorAll("[data-away]").forEach(x => x.onclick = async ev => {
    ev.stopPropagation(); const n = x.dataset.away;
    if (!await confirmDialog({ title: `Arbeitsbereich „${n}“ löschen?`, text: "Nur die gespeicherte Anordnung wird gelöscht.", button: "Löschen" })) return;
    ui.workspaces = ui.workspaces.filter(a => a.name !== n); if (ui.workspace === n) ui.workspace = "Operator"; uiSave(); workspaceDraw();
  });
  const save = () => {
    const n = $("workspaceNewName").value.trim().slice(0, 40); if (!n) return $("workspaceNewName").focus();
    ui.workspaces = (ui.workspaces || []).filter(a => a.name !== n); ui.workspaces.push({ name: n, data: arrangementNow() });
    ui.workspace = n; uiSave(); m.hidden = true; workspaceDraw();
  };
  $("workspaceNewSave").onclick = save;
  $("workspaceNewName").onkeydown = ev => { if (ev.key === "Enter") save(); };
  m.querySelector('[data-action=edit]').onclick = () => { m.hidden = true; layoutEdit(!document.body.classList.contains("layout-edit")); };
}
function layoutEdit(on) {
  document.body.classList.toggle("layout-edit", on); $("editBar").hidden = !on; workspaceDraw();
}


$("editDone").onclick = () => layoutEdit(false);

// Umzug: das bisherige Layout wird einmal als eigener Arbeitsbereich übernommen
if (!ui.workspaces) {
  ui.workspaces = [];
  const hadBefore = ["bottom", "right"].some(o => ((ui.dock || {})[o] || []).length);
  if (hadBefore) { ui.workspaces.push({ name: "Mein bisheriges Layout", data: arrangementNow() }); ui.workspace = "Mein bisheriges Layout"; }
  else ui.workspace = "Operator";
  uiSave();
}
document.body.classList.toggle("large", !!ui.large);
if (!ui.konzept3) { ui.konzept3 = true; uiSave(); setTimeout(() => workspaceChoose("Operator"), 0); }
// neue Karte „Zur Szene" (2.5): wer schon ein Layout mit rechtem Dock hat, bekommt sie dort oben dazu
if (!ui.sceneTools) {
  ui.sceneTools = true; uiSave();
  setTimeout(() => {
    const d = areaAfter("scene-tools");
    if (d && placeFrom(d) === "left" && cardsIn(DOCKS.right).length) { DOCKS.right.insertBefore(d, cardsIn(DOCKS.right)[0]); d.open = true; dockRemember(); uiSave(); }
  }, 0);
}
workspaceDraw();

/* ---------- Unterseiten in Match und Setup anwenden (Deklarationen: Abschnitt „Unterseiten“ vor der Oberfläche) ---------- */
belowApply();

/* ---------- Befehlspalette (Strg K) ---------- */
const normal = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function commands() {
  const l = [];
  const single = onSource();
  OVER_GAME.forEach(k => { const n = (OVERLAY_SCENES.find(([x]) => x === k) || [, k])[1]; l.push({ kind: "ÜBER SPIEL", text: n + " über dem Spiel (Ingame)", execute: () => { if (Z.broadcast.scene !== "ingame") sceneSwitch("ingame"); overGameToggle(k); } }); });
  scenesRow().filter(([k]) => !SCENE_GROUPS[k]).forEach(([k, n]) => l.push({ kind: "SZENE", text: (single ? "Wechseln zu: " : "Vorschau: ") + n, execute: () => single ? sceneSwitch(k) : ($("scene").value = k, preview()) }));
  (Z.graphics || []).forEach(x => {
    const n = x.name || GFX_NAMES[x.type] || x.type;
    l.push({ kind: "EINBLENDUNG", text: (x.on ? "Ausblenden: " : "Zeigen: ") + n, execute: () => gfxShow(x, !x.on) });
  });
  l.push({ kind: "EINBLENDUNG", text: "Alle Einblendungen ausblenden", execute: () => { (Z.graphics || []).forEach(x => { x.on = false; x.until = 0; x.start = 0; }); graphicsDraw(); send(); } });
  l.push({ kind: "TIMER", text: Z.timer.running ? "Timer pausieren" : "Timer starten", execute: () => $(Z.timer.running ? "tPause" : "tStart").click() });
  areas.forEach(d => {
    const t = d.querySelector("summary").textContent.replace(/[⠿⧉]/g, "").trim();
    l.push({ kind: "BEREICH", text: "Öffnen: " + t, execute: () => { if (placeFrom(d) === "left") goClose(t); else { d.open = true; d.scrollIntoView({ block: "nearest" }); } } });
    if (placeFrom(d) === "left") l.push({ kind: "PANEL", text: t + " rechts andocken", execute: () => dockPanel(d, "right") });
  });
  [["live", "Live"], ["match", "Match"], ["tournament", "Turnier"], ["setup", "Setup"], ["log", "Log"]].forEach(([k, n]) => l.push({ kind: "REITER", text: n, execute: () => tabs(k) }));
  [...Object.keys(TEMPLATES), ...(ui.workspaces || []).map(x => x.name)].forEach(n => l.push({ kind: "ARBEITSBEREICH", text: n, execute: () => workspaceChoose(n) }));
  l.push({ kind: "ARBEITSBEREICH", text: "Layout bearbeiten", execute: () => layoutEdit(!document.body.classList.contains("layout-edit")) });
  l.push({ kind: "APP", text: "App-Einstellungen öffnen", execute: () => settings(true) });
  l.push({ kind: "ANORDNUNG", text: "Seiten-Dock auf die andere Seite", execute: () => { ui.placement = Object.assign(placement(), { side: placement().page === "left" ? "right" : "left" }); uiSave(); placementSet(); } });
  l.push({ kind: "ANORDNUNG", text: "Vorschau-Dock oben/unten tauschen", execute: () => { ui.placement = Object.assign(placement(), { preview: placement().preview === "upper" ? "bottom" : "upper" }); uiSave(); placementSet(); } });
  l.push({ kind: "ANORDNUNG", text: "Reiter-Spalte auf die andere Seite", execute: () => { ui.placement = Object.assign(placement(), { tabs: placement().tabs === "right" ? "left" : "right" }); uiSave(); placementSet(); } });
  l.push({ kind: "APP", text: "Hell / Dunkel umschalten", execute: () => designSet(document.documentElement.dataset.design === "light" ? "dark" : "light") });
  return l;
}
let paletteHits = [], paletteNum = 0;
function paletteDraw() {
  const q = normal($("paletteInput").value).trim(), terms = q.split(/\s+/).filter(Boolean);
  paletteHits = commands().map(b => {
    const t = normal(b.kind + " " + b.text);
    if (terms.some(w => !t.includes(w))) return null;
    return { b, rank: q && normal(b.text).startsWith(q) ? 0 : q && normal(b.text).includes(q) ? 1 : 2 };
  }).filter(Boolean).sort((a, c) => a.rank - c.rank).slice(0, 9).map(x => x.b);
  paletteNum = Math.min(paletteNum, Math.max(0, paletteHits.length - 1));
  const list = $("paletteList"); list.innerHTML = "";
  if (!paletteHits.length) { list.innerHTML = `<div class="empty">Nichts gefunden.</div>`; return; }
  paletteHits.forEach((b, i) => {
    const k = document.createElement("button"); k.type = "button"; k.className = i === paletteNum ? "chosen" : ""; k.setAttribute("role", "option");
    k.innerHTML = `<span class="kind">${esc(b.kind)}</span><span class="tx">${esc(b.text)}</span>${i === paletteNum ? "<kbd>Enter</kbd>" : ""}`;
    k.onclick = () => paletteRun(i);
    list.appendChild(k);
  });
}
function paletteOpen() { $("palette").hidden = false; $("paletteInput").value = ""; paletteNum = 0; paletteDraw(); $("paletteInput").focus(); }
function paletteClose() { $("palette").hidden = true; }
function paletteRun(i) { const b = paletteHits[i]; paletteClose(); if (b) b.execute(); }
$("searchOpen").onclick = paletteOpen;
$("paletteInput").oninput = () => { paletteNum = 0; paletteDraw(); };
$("palette").addEventListener("click", ev => { if (ev.target === $("palette")) paletteClose(); });
addEventListener("keydown", ev => {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "k") { ev.preventDefault(); $("palette").hidden ? paletteOpen() : paletteClose(); return; }
  if ((ev.ctrlKey || ev.metaKey) && /^[1-4]$/.test(ev.key) && $("palette").hidden) { ev.preventDefault(); tabs(["live", "match", "tournament", "setup"][+ev.key - 1]); return; }
  if ($("palette").hidden) return;
  if (ev.key === "Escape") { ev.preventDefault(); paletteClose(); }
  if (ev.key === "ArrowDown") { ev.preventDefault(); paletteNum = Math.min(paletteHits.length - 1, paletteNum + 1); paletteDraw(); }
  if (ev.key === "ArrowUp") { ev.preventDefault(); paletteNum = Math.max(0, paletteNum - 1); paletteDraw(); }
  if (ev.key === "Enter") { ev.preventDefault(); paletteRun(paletteNum); }
});
