/* CASTING-APP · Steuerseite – Oberfläche: Unterseiten, Docks, Trennlinien, Einklappen, Zoom, Design
   Teil 6 von 13; Reihenfolge und Lageplan: control/01-core.js
   (der Server verbindet alle Dateien zu einem Skript – siehe dort) */

/* ---------- Unterseiten in Match und Setup ---------- */
const SUBPAGES = {
  match: [["import", "Import & Sitzungen", ["sessions", "faceit"]], ["teams", "Teams & Spieler", ["teams-result", "players"]],
          ["veto", "Map-Veto & Serie", ["map-veto", "series-map-results"]], ["caster", "Caster & Kameras", ["caster-guest", "cameras-sources"]], ["texts", "Timer & Texte", ["timer", "tickers-title"]]],
  setup: [["appearance", "Aussehen", ["themes", "theme-adjust", "headings"]], ["sponsors", "Sponsoren", ["sponsors"]], ["maps", "Map-Pool", ["map-pool"]],
          ["background", "Hintergrund", ["background-clips-dronefootage"]], ["sceneList", "Szenen & OBS", ["scenes-setup"]], ["cs2", "CS2-Livedaten", ["cs2-livedata"]]]
};
function belowFrom(group, slug) { const u = (SUBPAGES[group] || []).find(([, , l]) => l.includes(slug)); return u ? u[0] : null; }
function belowApply() {
  for (const group of Object.keys(SUBPAGES)) {
    const g = document.querySelector(`.group[data-group="${group}"]`), nav = g.querySelector(".subnav");
    const cur = (ui.below || {})[group] || SUBPAGES[group][0][0];
    nav.innerHTML = [...SUBPAGES[group], ["all", "Alle", []]].map(([k, n]) => `<button data-below="${k}" aria-pressed="${k === cur}">${esc(n)}</button>`).join("");
    nav.querySelectorAll("button").forEach(b => b.onclick = () => { ui.below = Object.assign({}, ui.below, { [group]: b.dataset.below }); uiSave(); belowApply(); });
    [...g.children].filter(x => x.tagName === "DETAILS").forEach(d => { d.hidden = cur !== "all" && belowFrom(group, d.dataset.area) !== cur; if (!d.hidden && cur !== "all") d.open = true; });
  }
}

/* ---------- Oberfläche: Docks wie in OBS, Trennlinien, Einklappen, Zoom, Design ---------- */
// Spalte ohne sichtbare Karte (z. B. alle Karten in Docks): Seite schmaler machen
function columnEmptyCheck() {
  const g = document.querySelector(".group:not([hidden])"), s = document.querySelector(".page");
  if (!g || !s) return;
  const empty = ![...g.children].some(x => x.tagName === "DETAILS" && !x.hidden);
  if (s.classList.contains("column-empty") !== empty) { s.classList.toggle("column-empty", empty); if (typeof widths === "function") try { widths(); } catch (err) {} }
}
const pageEl = document.querySelector(".page");
const DOCKS = { bottom: $("dockBottom"), right: $("dockRight") };
if (Array.isArray(ui.dock)) ui.dock = { right: ui.dock, bottom: [] };      // ältere Version
ui.dock = Object.assign({ bottom: [], right: [] }, ui.dock || {});
function widths() {
  if (ui.b1) pageEl.style.setProperty("--b1", ui.b1 + "px");
  if (ui.b2) pageEl.style.setProperty("--b2", ui.b2 + "px");
  if (ui.hU) pageEl.style.setProperty("--hU", ui.hU + "px");
  pageEl.classList.toggle("preview-close", !!ui.previewClose);
  $("previewFold").innerHTML = icon(ui.previewClose ? "panel-open" : "panel-close");
}
function draggable(divider, field, element, direction, reversedValue) {
  divider.addEventListener("pointerdown", ev => {
    if (divider.dataset.locked || !document.body.classList.contains("layout-edit")) return;   // gesperrt oder nicht im Bearbeiten-Modus
    const reversed = typeof reversedValue === "function" ? reversedValue() : reversedValue;
    ev.preventDefault(); divider.setPointerCapture(ev.pointerId); divider.classList.add("drags");
    const vertical = direction === "y", start = vertical ? ev.clientY : ev.clientX;
    const r = element.getBoundingClientRect(), startSize = vertical ? r.height : r.width, zoom = parseFloat(document.body.style.zoom) || 1;
    const move = m => { const d = ((vertical ? m.clientY : m.clientX) - start) / zoom; ui[field] = Math.max(vertical ? 120 : 260, Math.round(startSize + (reversed ? -d : d))); widths(); };
    const end = () => { divider.classList.remove("drags"); divider.removeEventListener("pointermove", move); uiSave(); };
    divider.addEventListener("pointermove", move);
    divider.addEventListener("pointerup", end, { once: true });
  });
}
draggable($("divider1"), "b1", document.querySelector(".column"), "x", () => placement().tabs === "right");
draggable($("divider2"), "b2", $("dockRight"), "x", () => placement().page !== "left");
draggable($("dividerH"), "hU", $("dockBottom"), "y", () => placement().preview !== "upper");
function bottomFit() {
  const cards = cardsIn($("dockBottom")); if (!cards.length) return;
  const full = Math.max(...cards.map(k => { const previousMax = k.style.maxHeight; k.style.maxHeight = "none"; const h = k.scrollHeight; k.style.maxHeight = previousMax; return h; })) + 16;
  const max = $("middle").clientHeight * 0.6;
  ui.hU = Math.round(Math.min(full, max)); pageEl.style.setProperty("--hU", ui.hU + "px"); uiSave();
}
$("dividerH").addEventListener("dblclick", () => { if (!locked("bottom")) bottomFit(); });
$("dividerH").title = "Ziehen = Höhe ändern · Doppelklick = Höhe passend zum Inhalt";
// Lage der Bereiche frei wählbar – nur die Reihenfolge ändert sich, nichts wird neu aufgebaut
function placement() { return Object.assign({ tabs: "left", side: "right", preview: "bottom" }, ui.placement || {}); }
function placementSet() {
  const L = placement(), columnEl = document.querySelector(".column"), middleEl = $("middle"), dockRightEl = $("dockRight"), t1 = $("divider1"), t2 = $("divider2");
  const middlePart = L.side === "left" ? [dockRightEl, t2, middleEl] : [middleEl, t2, dockRightEl];
  const sequence = L.tabs === "right" ? [...middlePart, t1, columnEl] : [columnEl, t1, ...middlePart];
  sequence.forEach((el, i) => { el.style.order = i + 1; });
  const upper = L.preview === "upper";
  $("dockBottom").style.order = upper ? 0 : 3; $("dividerH").style.order = upper ? 1 : 2; middleEl.querySelector(".preview").style.order = upper ? 2 : 0;
  document.querySelectorAll("[data-placement]").forEach(g => g.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.value === L[g.dataset.placement])));
  zones.bottom.textContent = upper ? "Über der Vorschau" : "Unter der Vorschau";
  zones.right.textContent = L.side === "left" ? "Links neben der Vorschau" : "Rechts neben der Vorschau";
  DOCKS.bottom.querySelector(".dock-target").textContent = upper ? "Über der Vorschau andocken" : "Unter der Vorschau andocken";
  DOCKS.right.querySelector(".dock-target").textContent = L.side === "left" ? "Links neben der Vorschau andocken" : "Rechts neben der Vorschau andocken";
}
document.querySelectorAll("[data-placement] button").forEach(b => b.onclick = () => {
  ui.placement = Object.assign(placement(), { [b.parentElement.dataset.placement]: b.dataset.value }); uiSave(); placementSet();
});
$("previewFold").onclick = () => { ui.previewClose = !ui.previewClose; widths(); uiSave(); };
// Zoom: „auto" wächst mit der Fensterbreite (1920 px = 100 %, 2560 px = 130 %) – große Bildschirme bleiben lesbar
const zoomAuto = () => Math.min(1.5, Math.max(0.8, Math.round(innerWidth / 1920 * 10) / 10));
function zoomSet(f) {
  ui.zoom = f === "auto" ? "auto" : Math.min(1.5, Math.max(0.6, Math.round(f * 10) / 10));
  const z = ui.zoom === "auto" ? zoomAuto() : ui.zoom;
  document.body.style.zoom = z; document.body.style.setProperty("--zoom", z);
  $("zoomValue").textContent = ui.zoom === "auto" ? "Auto" : Math.round(z * 100) + " %";
  $("zoomValue").title = ui.zoom === "auto" ? "Größe passt sich dem Fenster an" : "Zurück auf automatische Größe";
  $("zoomSlider").value = z; $("zoomDisplay").textContent = Math.round(z * 100) + " %";
  if ($("zoomAutoOn")) $("zoomAutoOn").checked = ui.zoom === "auto";
  uiSave();
}
const zoomNow = () => parseFloat(document.body.style.zoom) || 1;
$("zoomSmall").onclick = () => zoomSet(zoomNow() - 0.1);
$("zoomLarge").onclick = () => zoomSet(zoomNow() + 0.1);
$("zoomValue").onclick = () => zoomSet("auto");
addEventListener("resize", () => { if (ui.zoom === "auto") zoomSet("auto"); });
$("zoomSlider").oninput = () => zoomSet(+$("zoomSlider").value);
// Design der App: dunkel / hell / wie Windows
const systemLight = matchMedia("(prefers-color-scheme: light)");
function designSet(d) {
  ui.design = d || "dark";
  const light = ui.design === "light" || (ui.design === "system" && systemLight.matches);
  document.documentElement.dataset.design = light ? "light" : "dark";
  document.querySelectorAll("#appDesign button").forEach(b => b.setAttribute("aria-pressed", b.dataset.design === ui.design));
  uiSave();
}
document.querySelectorAll("#appDesign button").forEach(b => b.onclick = () => designSet(b.dataset.design));
systemLight.addEventListener("change", () => { if (ui.design === "system") designSet("system"); });
// App-Einstellungen: eigene Seite mit Liste links (je Bereich ein Status), rechts ein Bereich auf einmal
function settings(unfolded, section) {
  $("appDialog").hidden = !unfolded;
  if (unfolded) { settingsShow(section || ui.settingsSection || "setLinks"); settingsNavDraw(); }
}
function settingsShow(id) {
  if (!$(id) || $(id).closest(".dialog-content") !== document.querySelector(".dialog-content")) id = "setLinks";
  document.querySelectorAll(".dialog-content > section").forEach(x => x.hidden = x.id !== id);
  document.querySelectorAll(".settings-nav [data-jump]").forEach(b => b.setAttribute("aria-current", b.dataset.jump === id));
  const b = document.querySelector(`.settings-nav [data-jump="${id}"]`);
  $("settingsTitle").textContent = b ? b.querySelector("span").firstChild.textContent.trim() : "";
  document.querySelector(".dialog-content").scrollTop = 0;
  ui.settingsSection = id; uiSave();
}
// Status je Bereich: Grün = verbunden/gespeichert, Gelb = fehlt/wartet, Grau = aus – nur Anzeige
function settingsNavDraw() {
  const obsOn = $("obsStatus").classList.contains("ok"), dachOn = typeof dachInfo !== "undefined" && dachInfo.idSet && dachInfo.keySet;
  const faceitOn = typeof faceitKeyDa !== "undefined" && faceitKeyDa, musicOn = !(Z.music && Z.music.displayed === false);
  const state = (id, on, text, off) => { const e = $(id); e.className = "state " + (on ? "ok" : off || ""); e.textContent = text; };
  state("setObsState", obsOn, obsOn ? "verbunden" : "nicht verbunden", "wait");
  state("setFaceitState", faceitOn, faceitOn ? "Schlüssel gespeichert" : "kein Schlüssel");
  state("setDachState", dachOn, dachOn ? "Zugang gespeichert" : "nicht eingerichtet");
  state("setMusicState", musicOn, musicOn ? "an" : "aus");
  $("navLinksDot").className = obsOn ? "ok" : "wait";
  $("navLanguage").textContent = `App ${CastI18n.language === "en" ? "English" : "Deutsch"} · Overlays ${(Z.overlayLanguage || "de") === "en" ? "English" : "Deutsch"}`;
  $("navLook").innerHTML = `<span>${({ dark: "Dunkel", light: "Hell", system: "Wie das System" })[ui.design || "dark"]}</span> · <span>${ui.zoom === "auto" ? "Größe automatisch" : Math.round((ui.zoom || 1) * 100) + " %"}</span>`;
  $("navUpdate").textContent = $("updateState").textContent;
  $("aboutVersion").textContent = $("appVersion").textContent;
}
document.querySelectorAll(".settings-nav [data-jump]").forEach(b => b.onclick = () => settingsShow(b.dataset.jump));
document.querySelectorAll("[data-settings]").forEach(b => b.onclick = () => settings(true, b.dataset.settings));
$("setExport").onclick = () => $("export").click();
$("setImport").onclick = () => $("import").click();
$("aboutSteps").onclick = () => $("stepsAgain").click();
$("zoomAutoOn").onchange = () => { zoomSet($("zoomAutoOn").checked ? "auto" : zoomNow()); settingsNavDraw(); };
$("dialogOpen").onclick = () => settings(true);
$("dialogClose").onclick = () => settings(false);
$("appDialog").addEventListener("click", ev => { if (ev.target === $("appDialog")) settings(false); });
addEventListener("keydown", ev => { if (ev.key === "Escape" && !$("appDialog").hidden) settings(false); });
$("stepsAgain").onclick = () => { localStorage.removeItem("cast-steps-off"); stepsDraw(); settings(false); tabs("live"); };
// Alle Bereiche ein-/ausklappen (sichtbarer Reiter + Docks)
function allAreas(unfolded) {
  document.querySelectorAll('.group:not([hidden]) > details, .dock details').forEach(d => { if (d.id !== "firstSteps" && !(d.dataset.locked && placeFrom(d) !== "left")) d.open = unfolded; });
}
$("allClose").onclick = () => allAreas(false);
$("allOpen").onclick = () => allAreas(true);
// Bereiche andocken: links (Reiter) · unter der Vorschau · rechts daneben
const slug = t => t.toLowerCase().replace(/[^a-z0-9äöüß]+/g, "-").replace(/^-|-$/g, "");
const areas = [...document.querySelectorAll(".group > details")];
const placeFrom = d => { const k = d.closest("#dockBottom, #dockRight"); return !k ? "left" : k.id === "dockBottom" ? "bottom" : "right"; };
const cardsIn = dock => [...dock.children].filter(x => x.tagName === "DETAILS" || x.classList.contains("tabgroup"));
const groupFrom = d => d.parentElement && d.parentElement.classList.contains("tabgroup") ? d.parentElement : null;
// Tab-Leiste einer Gruppe neu aufbauen; die Tabs lassen sich anklicken und wieder herausziehen
function tabsDraw(g) {
  const cards = [...g.querySelectorAll(":scope > details")];
  if (!cards.some(x => x.dataset.area === g.dataset.active)) g.dataset.active = cards[0] ? cards[0].dataset.area : "";
  const strip = g.querySelector(".tab-bar"); strip.innerHTML = "";
  cards.forEach(d => {
    const on = d.dataset.area === g.dataset.active;
    d.classList.toggle("tab-active", on); if (on) d.open = true;
    const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", on);
    b.textContent = d.querySelector("summary").textContent.replace(/[⠿⧉]/g, "").trim();
    b.addEventListener("pointerdown", ev => dragStart(ev, d));
    b.addEventListener("click", () => { if (d._dragged) { d._dragged = false; return; } g.dataset.active = d.dataset.area; tabsDraw(g); dockRemember(); });
    strip.appendChild(b);
  });
}
function groupCleanup(g) {
  if (!g || !g.isConnected) return;
  const cards = [...g.querySelectorAll(":scope > details")];
  if (cards.length <= 1) { if (cards[0]) { cards[0].classList.remove("tab-active"); g.replaceWith(cards[0]); } else g.remove(); }
  else tabsDraw(g);
}
function groupNew(dock, before, active) {
  const g = document.createElement("div"); g.className = "tabgroup"; g.dataset.active = active || "";
  g.innerHTML = `<div class="tab-bar" role="tablist"></div>`;
  dock.insertBefore(g, before || dock.querySelector(".dock-target"));
  return g;
}
function asTab(d, target) {
  if (target === d || target === groupFrom(d)) return;
  const previousGroup = groupFrom(d);
  let g = target.classList.contains("tabgroup") ? target : null;
  if (!g) { g = groupNew(target.parentElement, target, d.dataset.area); g.appendChild(target); target.open = true; }
  g.appendChild(d); g.dataset.active = d.dataset.area; d.open = true;
  tabsDraw(g); groupCleanup(previousGroup); dockRemember();
}
// eigene Reihenfolge der Bereiche je Reiter (Ziehen in der linken Spalte)
function rowRemember(g) {
  const cards = [...g.children].filter(x => x.tagName === "DETAILS");
  const numbering = cards.map(x => +x.dataset.num).sort((a, b) => a - b);
  cards.forEach((x, i) => { x.dataset.num = numbering[i]; });
  ui.line = ui.line || {}; ui.line[g.dataset.group] = cards.map(x => x.dataset.area); uiSave();
}
function afterHome(d) {
  const previousGroup = groupFrom(d);
  const g = document.querySelector(`.group[data-group="${d.dataset.home}"]`);
  const after = [...g.children].find(x => x.tagName === "DETAILS" && +x.dataset.num > +d.dataset.num);
  d.classList.remove("tab-active");
  g.insertBefore(d, after || null);
  groupCleanup(previousGroup);
}
function dockPanel(d, place, before) {
  const previousGroup = groupFrom(d);
  if (place === "left") afterHome(d);
  else {
    const dock = DOCKS[place];
    d.classList.remove("tab-active");
    dock.insertBefore(d, before && before.parentElement === dock && before !== d ? before : dock.querySelector(".dock-target"));
    groupCleanup(previousGroup);
  }
  if (place !== "left") d.open = true;
  dockRemember();
}
function dockRemember() {
  for (const [place, dock] of Object.entries(DOCKS)) {
    ui.dock[place] = cardsIn(dock).map(k => k.classList.contains("tabgroup")
      ? { tabs: [...k.querySelectorAll(":scope > details")].map(d => d.dataset.area), active: k.dataset.active }
      : k.dataset.area);
    dock.classList.toggle("empty", !ui.dock[place].length);
  }
  uiSave();
  if (typeof lockDraw === "function" && typeof areas !== "undefined") try { lockDraw(); belowApply(); } catch (err) {}
  columnEmptyCheck();
}
// Menüs am unteren Rand nach oben klappen, damit sie immer ganz zu sehen sind
function menuFit(el, r, z) {
  const h = el.offsetHeight, bottom = window.innerHeight / z;
  if (r.bottom / z + 4 + h > bottom - 8) el.style.top = Math.max(8, r.top / z - h - 4) + "px";
}
// kleines Menü am Bereich
const menu = document.createElement("div"); menu.className = "dock-menu"; menu.hidden = true; document.body.appendChild(menu);
function menuShow(d, button) {
  const place = placeFrom(d), r = button.getBoundingClientRect(), z = parseFloat(document.body.style.zoom) || 1;
  const L = placement();
  menu.innerHTML = [["left", "In den Reiter"], ["bottom", L.preview === "upper" ? "Über der Vorschau" : "Unter der Vorschau"], ["right", L.side === "left" ? "Links neben der Vorschau" : "Rechts neben der Vorschau"]]
    .map(([o, t]) => `<button data-place="${o}"${o === place ? ' aria-current="true"' : ""}${locked(o) ? " disabled" : ""}>${t}${locked(o) ? icon("lock") : ""}</button>`).join("");
  menu.style.left = Math.max(8, r.right / z - 220) + "px"; menu.style.top = (r.bottom / z + 4) + "px";
  menu.hidden = false; menuFit(menu, r, z);
  menu.querySelectorAll("button").forEach(b => b.onclick = () => { menu.hidden = true; dockPanel(d, b.dataset.place); });
}
document.addEventListener("pointerdown", ev => { if (!menu.hidden && !menu.contains(ev.target) && !ev.target.classList.contains("pin")) menu.hidden = true; });
areas.forEach((d, n) => {
  const s = d.querySelector("summary");
  if (!d.dataset.area) d.dataset.area = slug(s.textContent);    // fixed keys in the HTML (stored in docks/workspaces)
  d.dataset.home = d.parentElement.dataset.group; d.dataset.num = n;
  const handle = document.createElement("span"); handle.className = "handle"; handle.innerHTML = icon("grip"); handle.title = "Ziehen: links, unter oder neben die Vorschau";
  s.prepend(handle);
  const pin = document.createElement("button"); pin.className = "pin"; pin.type = "button"; pin.title = "Andocken: links, unter oder neben der Vorschau"; pin.innerHTML = icon("dock"); pin.setAttribute("aria-label", "Andocken");
  pin.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); if (locked(placeFrom(d))) return; if (menu.hidden) menuShow(d, pin); else menu.hidden = true; };
  s.appendChild(pin);
  s.addEventListener("pointerdown", ev => dragStart(ev, d));
  s.addEventListener("click", ev => { if (d._dragged) { ev.preventDefault(); d._dragged = false; return; } if (d.dataset.locked && placeFrom(d) !== "left") ev.preventDefault(); });
});
// Ziehen mit der Maus: Geist folgt dem Zeiger, Ablageflächen und Einfügelinie zeigen, wo es landet
const ghost = document.createElement("div"); ghost.className = "drag-ghost"; ghost.hidden = true;
const stroke = document.createElement("div"); stroke.className = "insert-line"; stroke.hidden = true;
const zones = { left: document.createElement("div"), bottom: document.createElement("div"), right: document.createElement("div") };
zones.left.textContent = "Zurück in den Reiter"; zones.bottom.textContent = "Unter der Vorschau"; zones.right.textContent = "Rechts neben der Vorschau";
Object.values(zones).forEach(z => { z.className = "zone"; document.documentElement.appendChild(z); });
document.documentElement.append(ghost, stroke);
let dragState = null;
function dragStart(ev, d) {
  if (!document.body.classList.contains("layout-edit")) return;     // im Normalbetrieb bleibt alles, wo es ist
  if (ev.button !== 0 || ev.target.closest(".pin")) return;
  if (locked(placeFrom(d))) return;                            // aus gesperrten Bereichen lässt sich nichts herausziehen
  dragState = { d, x: ev.clientX, y: ev.clientY, active: false, target: null };
  const move = m => dragMove(m), release = m => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", release); dragEnd(m); };
  document.addEventListener("pointermove", move); document.addEventListener("pointerup", release);
}
function surface(el) { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
function zoneSet(z, r) { Object.assign(z.style, { left: r.x + 6 + "px", top: r.y + 6 + "px", width: Math.max(0, r.w - 12) + "px", height: Math.max(0, r.h - 12) + "px" }); }
const compass = document.createElement("div"); compass.className = "compass"; compass.hidden = true;
compass.innerHTML = ["", "up", "", "left", "dock", "right", "", "down", ""].map(z => `<i class="${z ? "" : "empty"}">${z ? icon(z) : ""}</i>`).join("");
const tabTarget = document.createElement("div"); tabTarget.className = "tab-target"; tabTarget.hidden = true; tabTarget.innerHTML = "<span></span>";
document.documentElement.append(compass, tabTarget);
function compassShow(r, field) {
  compass.hidden = false; compass.style.left = (r.left + r.width / 2) + "px"; compass.style.top = (r.top + Math.min(r.height / 2, 120)) + "px";
  [...compass.children].forEach((z, i) => z.classList.toggle("on", i === field));
}
function dragMove(m) {
  if (!dragState) return;
  if (!dragState.active) {
    if (Math.hypot(m.clientX - dragState.x, m.clientY - dragState.y) < 7) return;     // kleiner Ruck = Klick, kein Ziehen
    dragState.active = true; dragState.d._dragged = true; menu.hidden = true;
    document.body.classList.add("is-dragging"); dragState.d.classList.add("becomes-dragged");
    ghost.textContent = dragState.d.querySelector("summary").textContent.trim(); ghost.hidden = false;
    DOCKS.bottom.classList.remove("empty"); DOCKS.right.classList.remove("empty");
    requestAnimationFrame(() => { zoneSet(zones.left, surface(document.querySelector(".column"))); zoneSet(zones.bottom, surface(DOCKS.bottom)); zoneSet(zones.right, surface(DOCKS.right)); });
  }
  ghost.style.left = m.clientX + 14 + "px"; ghost.style.top = m.clientY + 10 + "px";
  const below = document.elementFromPoint(m.clientX, m.clientY);
  const dock = below && below.closest("#dockBottom, #dockRight");
  const left = below && below.closest(".column");
  let place = dock ? (dock.id === "dockBottom" ? "bottom" : "right") : left ? "left" : null;
  if (place && locked(place)) place = null;                         // gesperrt: hier landet nichts
  Object.entries(zones).forEach(([o, z]) => z.classList.toggle("on", o === place && (o === "left" || !cardsIn(DOCKS[o]).some(k => k !== dragState.d))));
  Object.entries(DOCKS).forEach(([o, dk]) => dk.classList.toggle("over-zone", o === place));
  dragState.target = place ? { place } : null;
  stroke.hidden = true; compass.hidden = true; tabTarget.hidden = true;
  // über einer angedockten Karte: Kompass – Mitte = als Tab, Rand = davor/danach
  const card = dock && below.closest("#dockBottom > details, #dockRight > details, .tabgroup");
  if (card && card !== dragState.d && card !== groupFrom(dragState.d)) {
    const r = card.getBoundingClientRect(), fx = (m.clientX - r.left) / r.width, fy = (m.clientY - r.top) / Math.min(r.height, 240);
    const across = place === "bottom";
    if (Math.abs(fx - 0.5) < 0.22 && Math.abs(fy - 0.5) < 0.3) {
      dragState.target = { place, tab: card };
      compassShow(r, 4);
      tabTarget.hidden = false; Object.assign(tabTarget.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: Math.min(r.height, 240) + "px" });
      const name = card.classList.contains("tabgroup") ? "der Gruppe" : "„" + card.querySelector("summary").textContent.replace(/[⠿⧉]/g, "").trim() + "“";
      tabTarget.firstChild.textContent = "Als Tab zu " + name;
      return;
    }
    compassShow(r, across ? (fx < 0.5 ? 3 : 5) : (fy < 0.5 ? 1 : 7));
  }
  // linke Spalte: im eigenen Reiter an die Stelle unter dem Zeiger einsortieren
  if (place === "left") {
    const g = document.querySelector(`.group[data-group="${dragState.d.dataset.home}"]`);
    if (g && !g.hidden) {
      const cards = [...g.children].filter(x => x.tagName === "DETAILS" && x !== dragState.d && !x.hidden);
      let before = null;
      for (const k of cards) { const r = k.getBoundingClientRect(); if (m.clientY < r.top + r.height / 2) { before = k; break; } }
      dragState.target = { place: "left", before, group: g };
      zones.left.classList.remove("on");
      if (cards.length) {
        const ref = before || cards[cards.length - 1], r = ref.getBoundingClientRect();
        Object.assign(stroke.style, { left: r.left + "px", top: (before ? r.top - 5 : r.bottom + 2) + "px", width: r.width + "px", height: "4px" });
        stroke.hidden = false;
      }
      return;
    }
  }
  if (place && dock) {
    const cards = cardsIn(dock).filter(x => x !== dragState.d);
    const across = place === "bottom";
    let before = null;
    for (const k of cards) { const r = k.getBoundingClientRect(); if (across ? m.clientX < r.left + r.width / 2 : m.clientY < r.top + r.height / 2) { before = k; break; } }
    dragState.target.before = before;
    if (cards.length) {
      const ref = before || cards[cards.length - 1], r = ref.getBoundingClientRect(), post = !before;
      Object.assign(stroke.style, across
        ? { left: (post ? r.right + 2 : r.left - 4) + "px", top: r.top + "px", width: "4px", height: r.height + "px" }
        : { left: r.left + "px", top: (post ? r.bottom + 2 : r.top - 4) + "px", width: r.width + "px", height: "4px" });
      stroke.hidden = false;
    }
  }
}
function dragEnd() {
  if (!dragState) return;
  const { d, active, target } = dragState; dragState = null;
  ghost.hidden = true; stroke.hidden = true; compass.hidden = true; tabTarget.hidden = true; Object.values(zones).forEach(z => z.classList.remove("on"));
  document.body.classList.remove("is-dragging"); d.classList.remove("becomes-dragged"); Object.values(DOCKS).forEach(dk => dk.classList.remove("over-zone"));
  if (active && target && target.tab) asTab(d, target.tab);
  else if (active && target && target.group) { const previousGroup = groupFrom(d); d.classList.remove("tab-active"); target.group.insertBefore(d, target.before || null); groupCleanup(previousGroup); rowRemember(target.group); dockRemember(); }
  else if (active && target) dockPanel(d, target.place, target.before);
  else dockRemember();
}
addEventListener("keydown", ev => { if (ev.key === "Escape" && dragState) { dragState.active = false; dragEnd(); } });
$("docksBack").onclick = () => {
  areas.forEach(d => { if (placeFrom(d) !== "left") afterHome(d); });
  ui.b1 = ui.b2 = ui.hU = null; ["--b1", "--b2", "--hU"].forEach(v => pageEl.style.removeProperty(v));
  ui.previewClose = false; ui.placement = null; dockRemember(); widths(); placementSet();
};
const areaAfter = b => areas.find(x => x.dataset.area === b);
// gespeicherte Reihenfolge in den Reitern wiederherstellen
Object.entries(ui.line || {}).forEach(([group, list]) => {
  const g = document.querySelector(`.group[data-group="${group}"]`); if (!g) return;
  const present = [...g.children].filter(x => x.tagName === "DETAILS");
  const numbering = present.map(x => +x.dataset.num).sort((a, b) => a - b);
  const sorted = [...list.map(areaAfter).filter(x => x && x.parentElement === g), ...present.filter(x => !list.includes(x.dataset.area))];
  sorted.forEach((x, i) => { g.appendChild(x); x.dataset.num = numbering[i]; });
});
function locked(place) { return !!((ui.locked || {})[place]); }
[["left", "divider1"], ["bottom", "dividerH"], ["right", "divider2"]].forEach(([place, t]) => {
  const b = document.querySelector(`[data-lock="${place}"]`); if (!b) return;
  $(t).appendChild(b);
  b.addEventListener("pointerdown", ev => ev.stopPropagation());     // Klick aufs Schloss zieht nicht an der Linie
});
function lockDraw() {
  document.querySelectorAll("[data-lock]").forEach(b => {
    const on = locked(b.dataset.lock);
    b.setAttribute("aria-pressed", on); b.innerHTML = icon(on ? "lock" : "unlock");
    b.title = (on ? "Entsperren" : "Sperren") + " – " + { left: "Reiter-Spalte", bottom: "Vorschau-Dock", right: "Seiten-Dock" }[b.dataset.lock];
  });
  const flag = (el, on) => { if (on) el.dataset.locked = "1"; else delete el.dataset.locked; };
  flag($("divider1"), locked("left")); flag($("divider2"), locked("right")); flag($("dividerH"), locked("bottom"));
  areas.forEach(d => flag(d, locked(placeFrom(d))));
}
document.querySelectorAll("[data-lock]").forEach(b => b.onclick = ev => {
  ev.stopPropagation();
  ui.locked = Object.assign({}, ui.locked, { [b.dataset.lock]: !locked(b.dataset.lock) }); uiSave(); lockDraw();
});
for (const place of ["bottom", "right"]) (ui.dock[place] || []).forEach(entry => {
  if (typeof entry === "string") { const d = areaAfter(entry); if (d) DOCKS[place].insertBefore(d, DOCKS[place].querySelector(".dock-target")); return; }
  const cards = (entry.tabs || []).map(areaAfter).filter(Boolean);
  if (cards.length < 2) { cards.forEach(d => DOCKS[place].insertBefore(d, DOCKS[place].querySelector(".dock-target"))); return; }
  const g = groupNew(DOCKS[place], null, entry.active);
  cards.forEach(d => g.appendChild(d)); tabsDraw(g);
});
if (!ui.zoom3) { if (!ui.zoom || ui.zoom === 1) ui.zoom = "auto"; ui.zoom3 = true; }   // 3.0: wer nie gezoomt hat, bekommt die automatische Größe
dockRemember(); widths(); zoomSet(ui.zoom || "auto"); designSet(ui.design || "dark"); placementSet(); lockDraw();
// Start: alles in den Reitern zu; angedockte Bereiche so, wie du sie zuletzt hattest
ui.isOpen = ui.isOpen || {};
areas.forEach(d => {
  d.open = placeFrom(d) !== "left" && d.id !== "firstSteps" ? ui.isOpen[d.dataset.area] !== false : d.id === "firstSteps";
  d.addEventListener("toggle", () => { if (placeFrom(d) !== "left") { ui.isOpen[d.dataset.area] = d.open; uiSave(); } });
});
