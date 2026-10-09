/* CASTING-APP · Steuerseite – Kopfzeile (Übergang, Verbindungen, Schließen), Einblendungs-Favoriten
   Teil 10 von 13; Reihenfolge und Lageplan: control/01-core.js
   (der Server verbindet alle Dateien zu einem Skript – siehe dort) */

/* ---------- Kopfzeile: Übergang, Verbindungen, Schließen ---------- */
document.body.appendChild($("workspaceMenu")); document.body.appendChild($("statusPop")); document.body.appendChild($("transPop"));
const beside = (button, pop, right) => { const r = button.getBoundingClientRect(), z = parseFloat(document.body.style.zoom) || 1;
  pop.style.top = (r.bottom / z + 6) + "px"; if (right) { pop.style.left = ""; pop.style.right = Math.max(8, innerWidth / z - r.right / z) + "px"; } else { pop.style.right = ""; pop.style.left = (r.left / z) + "px"; } };
const workspaceOpen = () => { workspaceDraw(); beside($("workspaceButton"), $("workspaceMenu")); $("workspaceMenu").hidden = false; };
$("workspaceButton").onclick = ev => { ev.stopPropagation(); if ($("workspaceMenu").hidden) workspaceOpen(); else $("workspaceMenu").hidden = true; };
$("editSave").onclick = () => { workspaceOpen(); $("workspaceNewName").focus(); };
document.addEventListener("pointerdown", ev => {
  if (!$("workspaceMenu").hidden && !ev.target.closest("#workspaceMenu, #workspaceButton")) $("workspaceMenu").hidden = true;
  if (!$("statusPop").hidden && !ev.target.closest("#statusPop, #bracketConnected")) $("statusPop").hidden = true;
  if (!$("transPop").hidden && !ev.target.closest("#transPop, #transButton")) transPopClose();
});
$("layoutButton").onclick = () => layoutEdit(!document.body.classList.contains("layout-edit"));
$("bracketConnected").onclick = ev => { ev.stopPropagation(); beside($("bracketConnected"), $("statusPop"), true); $("statusPop").hidden = !$("statusPop").hidden; };
function connectedDraw() {
  const pills = [...$("statusPop").querySelectorAll(".pill")];
  const ok = pills.filter(p => p.classList.contains("ok")).length;
  $("bracketPoints").innerHTML = pills.map(p => `<i class="${p.classList.contains("ok") ? "ok" : p.classList.contains("warn") ? "warn" : ""}"></i>`).join("");
  $("bracketConnText").textContent = `${ok} von ${pills.length} verbunden`;
}
new MutationObserver(connectedDraw).observe($("statusPop"), { subtree: true, attributes: true, attributeFilter: ["class"] });
connectedDraw();
// Übergang als Auswahl im Kopf der Programm-Karte
function transPopClose() { $("transPop").hidden = true; }
$("transPop").appendChild($("sceneTransition"));
$("transPop").insertAdjacentHTML("beforeend", `<label style="display:grid;gap:4px;font-size:13px">Stats über dem Spiel (während Ingame) ausblenden nach
  <span style="display:flex;gap:6px;align-items:center"><input type="number" id="switchDuration" min="0" max="600" style="width:90px"> Sekunden <span class="small" style="display:inline">(0 = bleibt stehen)</span></span></label>`);
$("switchDuration").value = Z.broadcast.overGameDuration ?? 15;
$("switchDuration").onchange = () => { Z.broadcast.overGameDuration = Math.max(0, +$("switchDuration").value || 0); send(); };
$("transButton").onclick = ev => { ev.stopPropagation(); beside($("transButton"), $("transPop"), true); $("transPop").hidden = !$("transPop").hidden; };
function headDraw() {
  let n = (OVERLAY_SCENES.find(([k]) => k === (onSource() ? Z.broadcast.scene : $("scene").value)) || [, ""])[1];
  if (typeof dachMode === "function" && dachMode()) n = ((DACH_SCENES.find(x => x[1] === (Z.dach || {}).scene) || [])[2]) || "DACH CS";
  $("bracketScene").textContent = n || "–"; $("vsScene").textContent = n || "";
  $("bracketTheme").textContent = "Theme " + (Object.assign({}, T[Z.theme], (Z.themeData || {})[Z.theme]).name || Z.theme);
  const trans = (TRANSITIONS.find(([k]) => k === (Z.broadcast.transition || "fade")) || [, "Blende"])[1];
  const seconds = ((Z.broadcast.duration || 900) / 1000).toFixed(1);
  $("transText").textContent = `${CastI18n.t(trans)} · ${CastI18n.language === "de" ? seconds.replace(".", ",") : seconds} s`;   // ganzer Text wird nicht übersetzt
  document.body.classList.toggle("on-source", onSource());
}

/* ---------- Einblendungen: Favoriten-Liste + Seitenleiste ---------- */
if ($("firstSteps")) document.body.appendChild($("firstSteps"));       // schwebt über allem, belegt keine Spalte
let gfxAll = false, gfxOpenId = null;
document.querySelector('[data-gfx-new]').parentElement.hidden = true;
$("gfxAllButton").onclick = () => { gfxAll = !gfxAll; graphicsDraw(); };
$("gfxNewButton").onclick = () => { const r = document.querySelector('[data-gfx-new]').parentElement; r.hidden = !r.hidden; };
function gfxDrawerOpen(id) { gfxOpenId = id; gfxOpen.add(id); $("gfxDrawer").hidden = false; $("drawerDark").hidden = false; graphicsDraw(); }
function gfxDrawerClose() { gfxOpenId = null; $("gfxDrawer").hidden = true; $("drawerDark").hidden = true; graphicsDraw(); }
$("drawerClose").onclick = gfxDrawerClose; $("drawerDone").onclick = gfxDrawerClose; $("drawerDark").onclick = gfxDrawerClose;
$("drawerDup").onclick = () => { const i = Z.graphics.findIndex(x => x.id === gfxOpenId); if (i < 0) return; const x = Z.graphics[i];
  const k = Object.assign(K.clone(x), { id: "e" + Date.now().toString(36), on: false, until: 0, start: 0, name: (x.name || GFX_NAMES[x.type] || "") + " (Kopie)" });
  Z.graphics.splice(i + 1, 0, k); send(); gfxDrawerOpen(k.id); };
$("drawerAway").onclick = () => { const i = Z.graphics.findIndex(x => x.id === gfxOpenId); if (i < 0) return; const x = Z.graphics[i]; gfxDrawerClose(); remove(Z.graphics, i, x.name || GFX_NAMES[x.type] || "Einblendung", graphicsDraw); };
