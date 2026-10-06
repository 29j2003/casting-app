/* CASTING-APP · Steuerseite – Live: Serie, Sitzungen, Sponsoren, CS2-Livedaten, Szenen anordnen, eine Browserquelle, Einblendungen
   Teil 5 von 13; Reihenfolge und Lageplan: control/01-core.js
   (der Server verbindet alle Dateien zu einem Skript – siehe dort) */

/* ---------- Serie ---------- */
function seriesScore() {
  let a = 0, b = 0;
  steps().filter(x => x.action !== "ban" && x.map).forEach(x => {
    const e = x.result || {};
    if (e.status === "done") { if (+e.a > +e.b) a++; else if (+e.b > +e.a) b++; }
  });
  return [a, b];
}
function seriesPoints() {
  if (!(Z.series || {}).autoPoints) return;
  const [a, b] = seriesScore();
  if (Z.teams.a.score !== a || Z.teams.b.score !== b) { Z.teams.a.score = a; Z.teams.b.score = b; teamDraw("a"); teamDraw("b"); }
}
// Map entschieden? MR12: 13 Runden mit 2 Vorsprung; Verlängerung je 6 Runden: 16, 19, 22 …
function mapDecided(e) {
  const x = +e.a, y = +e.b; if (e.a === "" || e.b === "" || isNaN(x) || isNaN(y)) return false;
  const hi = Math.max(x, y), lo = Math.min(x, y);
  return (hi === 13 && lo <= 11) || (hi >= 16 && (hi - 16) % 3 === 0 && hi - lo >= 2 && lo >= hi - 4);
}
function seriesDraw() {
  const box = $("series"); box.innerHTML = "";
  const maps = steps().filter(x => x.action !== "ban" && x.map);
  if (!maps.length) { box.innerHTML = `<p class="small">Noch keine gepickten Maps – erst das Map-Veto ausfüllen.</p>`; return; }
  maps.forEach((x, i) => {
    const e = x.result = Object.assign({ a: "", b: "", status: "pending" }, x.result || {});
    const z = document.createElement("div"); z.className = "row se-row";
    z.innerHTML = `<span><b>Map ${i + 1}</b> · ${esc(x.map)}</span>
      <select><option value="pending">Ausstehend</option><option value="running">Läuft</option><option value="done">Fertig</option></select>
      <input type="number" min="0" placeholder="${esc((Z.teams.a.name || "A").slice(0, 6))}"><b>:</b><input type="number" min="0" placeholder="${esc((Z.teams.b.name || "B").slice(0, 6))}">
      <button class="button main map-finish" hidden title="Ein Team hat die Map gewonnen – als „Fertig“ eintragen">✓ Map beenden?</button>`;
    const sel = z.querySelector("select"), [a, b] = z.querySelectorAll("input"), finish = z.querySelector(".map-finish");
    const suggest = () => { finish.hidden = e.status === "done" || !mapDecided(e); };
    sel.value = e.status; a.value = e.a; b.value = e.b; suggest();
    sel.onchange = () => { e.status = sel.value; suggest(); seriesPoints(); send(); };
    finish.onclick = () => { e.status = "done"; sel.value = "done"; suggest(); seriesPoints(); seriesDraw(); mbarDraw(); send(); };
    a.oninput = () => { e.a = a.value === "" ? "" : +a.value; if (e.status === "pending") { e.status = "running"; sel.value = "running"; } suggest(); seriesPoints(); laterSend(); };
    b.oninput = () => { e.b = b.value === "" ? "" : +b.value; if (e.status === "pending") { e.status = "running"; sel.value = "running"; } suggest(); seriesPoints(); laterSend(); };
    box.appendChild(z);
  });
  const [sa, sb] = seriesScore();
  box.insertAdjacentHTML("beforeend", `<p class="small">Serie: <b>${esc(Z.teams.a.name)} ${sa} : ${sb} ${esc(Z.teams.b.name)}</b></p>`);
}

/* ---------- Sitzungen (in der Browser-Datenbank, genug Platz auch für Bilder) ---------- */
const DB = (() => {
  let db;
  const openDb = () => db ? Promise.resolve(db) : (window.CastLegacy ? window.CastLegacy.ready : Promise.resolve()).then(() => new Promise((ok, no) => {
    const r = indexedDB.open("cast-sessions", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("s", { keyPath: "name" });
    r.onsuccess = () => ok(db = r.result); r.onerror = () => no(r.error);
  }));
  const tx = (mode, f) => openDb().then(d => new Promise((ok, no) => {
    const t = d.transaction("s", mode), r = f(t.objectStore("s"));
    t.oncomplete = () => ok(r && r.result); t.onerror = () => no(t.error);
  }));
  return { all: () => tx("readonly", s => s.getAll()), set: (name, z) => tx("readwrite", s => s.put({ name, z, date: Date.now() })), erase: name => tx("readwrite", s => s.delete(name)) };
})();
const activeSession = () => { try { return localStorage.getItem("cast-session-active") || ""; } catch (e) { return ""; } };
async function sessionsDraw(selection) {
  let list = [];
  try { list = await DB.all(); } catch (e) { $("seatStatus").textContent = "Sitzungen können in diesem Browser nicht gespeichert werden."; }
  list.sort((a, b) => b.date - a.date);
  const s = $("seatList"); s.innerHTML = "";
  if (!list.length) s.appendChild(new Option("– noch keine –", ""));
  list.forEach(x => s.appendChild(new Option(`${x.name} · ${new Date(x.date).toLocaleDateString("de-DE")}`, x.name, false, x.name === (selection || activeSession()))));
  if (activeSession()) $("seatStatus").textContent = "Aktuell: " + activeSession();
}
async function sessionSave(name) {
  const copy = K.clone(Z);
  try { await DB.set(name, copy); localStorage.setItem("cast-session-active", name); $("seatStatus").textContent = `✓ „${name}" gespeichert`; }
  catch (e) { $("seatStatus").textContent = "Speichern fehlgeschlagen: " + (e.message || e); }
  sessionsDraw(name);
}
$("seatSave").onclick = () => { const n = $("seatList").value || activeSession(); if (n) sessionSave(n); else $("seatNew").onclick(); };
$("seatNew").onclick = () => { const n = (prompt("Name der Sitzung (z. B. „DACH CS Woche 3“):", activeSession()) || "").trim(); if (n) sessionSave(n); };
$("seatLoad").onclick = async () => {
  const n = $("seatList").value; if (!n) return;
  if (!await confirmDialog({ title: `Sitzung „${n}“ laden?`, text: "Der aktuelle Stand (Teams, Veto, Texte …) wird ersetzt. Die OBS-Einrichtung bleibt.", button: "Laden" })) return;
  const x = (await DB.all()).find(s => s.name === n); if (!x) return;
  const keep = { sceneList: Z.sceneList, live: Z.live };   // OBS-Einrichtung bleibt, wie sie ist
  Z = K.merge(K.clone(K.DEFAULT), x.z); Object.assign(Z, keep);
  localStorage.setItem("cast-session-active", n);
  everything(); send(); $("seatStatus").textContent = `✓ „${n}" geladen`;
};
$("seatDelete").onclick = async () => {
  const n = $("seatList").value; if (!n || !await confirmDialog({ title: `Sitzung „${n}“ löschen?`, button: "Löschen" })) return;
  await DB.erase(n); if (activeSession() === n) localStorage.removeItem("cast-session-active");
  $("seatStatus").textContent = ""; sessionsDraw();
};

/* ---------- Sponsoren ---------- */
function sponsorEntries() {
  Z.sponsors = Z.sponsors || {}; Z.sponsors.byTheme = Z.sponsors.byTheme || {};
  return Z.sponsors.byTheme[Z.theme] = Z.sponsors.byTheme[Z.theme] || [];
}
function sponsorShowgfx(i) {
  Z.sponsors.gfx = { num: i, until: Date.now() + Math.max(3, +$("sponsorDuration").value || 10) * 1000 };
  send();
}
const SPONSOR_SCENES = [["intro", "Intro"], ["pause", "Pause"], ["end", "Ende"], ["cast-duo", "Cast Duo"], ["cast-solo", "Cast Solo"], ["cast-duo-interview", "Duo + Interview"], ["cast-solo-interview", "Solo + Interview"], ["ingame", "Ingame"]];
function sponsorsDraw() {
  const list = sponsorEntries(), box = $("sponsorEntries"); box.innerHTML = "";
  box.insertAdjacentHTML("beforeend", `<b style="font-size:13px">Sponsoren für ${esc((T[Z.theme] || {}).name || Z.theme)}</b>`);
  list.forEach((s, i) => {
    const z = document.createElement("div"); z.className = "row sponsor-row";
    z.innerHTML = `<div class="vb" style="width:90px;height:40px;background-size:contain" title="Logo wählen"></div><input type="text" placeholder="Name">
      <button class="button" title="Groß einblenden" aria-label="Groß einblenden">${icon("play")}</button><button class="x" title="Nach oben" aria-label="Nach oben">${icon("up")}</button><button class="x" title="Entfernen" aria-label="Entfernen">${icon("close")}</button><input type="file" accept="image/*" hidden>`;
    const image = z.querySelector(".vb"), name = z.querySelector("input[type=text]"), [show] = z.querySelectorAll(".button"),
          [up, away] = z.querySelectorAll(".x"), file = z.querySelector("input[type=file]");
    if (s.logo) image.style.backgroundImage = K.cssUrl(s.logo);
    name.value = s.name || "";
    name.oninput = () => { s.name = name.value; laterSend(); };
    image.onclick = () => file.click();
    file.onchange = async () => { if (!file.files[0]) return; s.logo = await imageShrink(file.files[0], 600); sponsorsDraw(); scenesDraw(); send(); };
    show.onclick = () => sponsorShowgfx(i);
    up.onclick = () => { if (i > 0) { list.splice(i - 1, 0, list.splice(i, 1)[0]); sponsorsDraw(); send(); } };
    away.onclick = () => remove(list, i, `Sponsor „${s.name || "?"}“`, () => { sponsorsDraw(); scenesDraw(); });
    box.appendChild(z);
  });
  const scenesBox = $("sponsorScenes"); scenesBox.innerHTML = `<span class="small">Sponsor-Kasten zeigen in:</span>`;
  const r = document.createElement("div"); r.className = "line";
  SPONSOR_SCENES.forEach(([k, n]) => {
    const l = document.createElement("label"); l.className = "toggleSwitch"; l.style.flex = "0 0 auto";
    const c = document.createElement("input"); c.type = "checkbox"; c.checked = (Z.sponsors.sceneList || {})[k] !== false;
    c.onchange = () => { Z.sponsors.sceneList = Z.sponsors.sceneList || {}; Z.sponsors.sceneList[k] = c.checked; send(); };
    l.append(c, n); r.appendChild(l);
  });
  scenesBox.appendChild(r);
}
$("sponsorPlus").onclick = () => { sponsorEntries().push({ name: "", logo: "" }); sponsorsDraw(); };

/* ---------- CS2-Livedaten ---------- */
async function gsiInfoFetch() {
  try { gsiInfo = await (await fetch("/api/gsi-info", { cache: "no-store" })).json(); } catch (err) { return; }
  ui.gsiWhere = ui.gsiWhere || (gsiInfo.networkWanted ? "network" : "local");
  gsiDraw();
  if (gsiInfo.live) liveReceived(gsiInfo.live);
}
function gsiDraw() {
  const where = ui.gsiWhere || "local";
  document.querySelectorAll("#gsiWhere button").forEach(b => b.setAttribute("aria-pressed", b.dataset.where === where));
  document.querySelectorAll("[data-gsi]").forEach(li => { li.hidden = li.dataset.gsi !== where; });
  $("gsiNetworkOn").checked = !!gsiInfo.network;
  $("gsiNetworkInfo").innerHTML = gsiInfo.network
    ? `<span>Diese App ist im Netzwerk erreichbar unter: ${(gsiInfo.ips || []).map(ip => `<b>${esc(ip)}:${esc(gsiInfo.port)}</b>`).join(" · ") || "–"}</span><span class="small">Die Datei zum Herunterladen enthält Adresse und Schlüssel bereits.</span>`
    : `<span class="small">Aus – die App nimmt nur Daten von diesem PC an.</span>`;
  const sideA = (liveLast && liveLast.sideA) || gsiInfo.sideA || "CT";
  document.querySelectorAll("#gsiSide button").forEach(b => b.setAttribute("aria-pressed", b.dataset.side === sideA));
}
document.querySelectorAll("#gsiWhere button").forEach(b => b.onclick = () => { ui.gsiWhere = b.dataset.where; uiSave(); gsiDraw(); });
document.querySelectorAll("#gsiSide button").forEach(b => b.onclick = async () => {
  await fetch("/api/gsi-settings", { method: "POST", body: JSON.stringify({ sideA: b.dataset.side }) });
  gsiInfo.sideA = b.dataset.side; if (liveLast) liveLast.sideA = b.dataset.side; gsiDraw();
});
$("gsiNetworkOn").onchange = async () => {
  const on = $("gsiNetworkOn").checked;
  if (on && !await confirmDialog({ title: "Netzwerk-Empfang einschalten?", text: "Die App öffnet Port 8788 im lokalen Netzwerk – ausschließlich für CS2-Spielstände mit deinem Schlüssel. Alles andere bleibt nur auf diesem PC erreichbar.", button: "Einschalten" })) { $("gsiNetworkOn").checked = false; return; }
  await fetch("/api/gsi-settings", { method: "POST", body: JSON.stringify({ network: on }) });
  setTimeout(gsiInfoFetch, 400);
};
$("gsiCfgLoad").onclick = () => { const a = document.createElement("a"); a.href = "/api/gsi-cfg"; a.download = "gamestate_integration_castoverlay.cfg"; document.body.appendChild(a); a.click(); a.remove(); };
$("gsiSetup").onclick = async () => {
  try {
    const d = await (await fetch("/api/gsi-setup", { method: "POST" })).json();
    $("gsiPath").textContent = d.ok ? "✓ Abgelegt in: " + d.file + " – jetzt CS2 neu starten." : "CS2-Ordner nicht gefunden. „Ordner selbst wählen …“ nutzen. (Kopie liegt in: " + d.file + ")";
  } catch (err) { $("gsiPath").textContent = "Fehlgeschlagen."; }
};
// Pfad direkt eingeben: Vorschläge aus dem jeweiligen Ordner, Prüfung beim Ablegen
const gsiResult = d => { $("gsiPath").textContent = d.ok ? "✓ Abgelegt in: " + d.file + " – jetzt CS2 neu starten." : (d.error || "Fehlgeschlagen."); };
async function gsiPlace(p) {
  try { gsiResult(await (await fetch("/api/gsi-path", { method: "POST", body: JSON.stringify({ path: p }) })).json()); } catch (err) { gsiResult({}); }
}
let suggestionTimer = null;
$("gsiPathInput").addEventListener("input", () => {
  clearTimeout(suggestionTimer);
  suggestionTimer = setTimeout(async () => {
    const v = $("gsiPathInput").value, i = Math.max(v.lastIndexOf("\\"), v.lastIndexOf("/"));
    if (i < 0) return;
    const base = v.slice(0, i + 1);
    try {
      const d = await (await fetch("/api/folder-list?path=" + encodeURIComponent(base))).json();
      $("gsiPathSuggestions").innerHTML = (d.folder || []).slice(0, 60).map(o => `<option value="${esc((d.path.endsWith("\\") || d.path.endsWith("/") ? d.path : d.path + (d.path.includes("\\") ? "\\" : "/")) + o)}">`).join("");
    } catch (err) {}
  }, 150);
});
$("gsiPathInput").addEventListener("keydown", ev => { if (ev.key === "Enter") $("gsiPathSet").click(); });
$("gsiPathSet").onclick = () => { const p = $("gsiPathInput").value.trim(); if (p) gsiPlace(p); else $("gsiPath").textContent = "Bitte einen Pfad eingeben."; };
// Suche über alle Laufwerke
$("gsiSearch").onclick = async () => {
  $("gsiFinds").innerHTML = `<span class="small">Suche läuft (höchstens ein paar Sekunden) …</span>`;
  try {
    const d = await (await fetch("/api/cs2-search")).json();
    $("gsiFinds").innerHTML = d.finds.length ? `<span class="small">Gefunden – zum Ablegen anklicken:</span>` : `<span class="small">Nichts gefunden. Pfad bitte direkt eingeben oder „Ordner durchsuchen …“.</span>`;
    d.finds.forEach(p => { const b = document.createElement("button"); b.type = "button"; b.textContent = p; b.onclick = () => { $("gsiPathInput").value = p; gsiPlace(p); }; $("gsiFinds").appendChild(b); });
  } catch (err) { $("gsiFinds").innerHTML = ""; }
};
// eingebauter Ordner-Browser (statt Windows-Dialog): mit Filter, schließt sich nach 2 Minuten ohne Eingabe von selbst
let fbrowserPath = "", fbrowserData = null, fbrowserTimer = null;
function fbrowserAwake() { clearTimeout(fbrowserTimer); fbrowserTimer = setTimeout(fbrowserShut, 120000); }
function fbrowserShut() { clearTimeout(fbrowserTimer); $("gsiBrowser").hidden = true; }
async function fbrowserLoad(p) {
  fbrowserAwake();
  try { fbrowserData = await (await fetch("/api/folder-list?path=" + encodeURIComponent(p))).json(); } catch (err) { return; }
  fbrowserPath = fbrowserData.path || ""; $("fbrowserPath").textContent = fbrowserPath || "Laufwerke"; $("fbrowserFilter").value = "";
  $("fbrowserHint").textContent = fbrowserData.error ? fbrowserData.error : fbrowserData.cs2 ? "✓ Das ist der CS2-Ordner." : "";
  fbrowserList();
}
function fbrowserList() {
  const f = $("fbrowserFilter").value.trim().toLowerCase(), l = $("fbrowserList"); l.innerHTML = "";
  const names = (fbrowserData.folder || []).filter(o => !f || o.toLowerCase().includes(f));
  if (!names.length) { l.innerHTML = `<div class="empty">${f ? "Kein Ordner passt." : "Keine Unterordner."}</div>`; return; }
  names.forEach(o => {
    const b = document.createElement("button"); b.type = "button";
    if (/^(steamapps|common|counter-strike global offensive|game|csgo|cfg|steam|steamlibrary)$/i.test(o)) b.className = "cs2";
    b.innerHTML = `${icon("folder")}<span>${esc(o)}</span>`;
    b.onclick = () => fbrowserLoad(fbrowserPath ? (fbrowserPath.endsWith("\\") || fbrowserPath.endsWith("/") ? fbrowserPath + o : fbrowserPath + (fbrowserPath.includes("\\") ? "\\" : "/") + o) : o);
    l.appendChild(b);
  });
}
$("gsiBrowserOpen").onclick = () => { $("gsiBrowser").hidden = false; fbrowserLoad($("gsiPathInput").value.trim()); $("fbrowserFilter").focus(); };
$("fbrowserClose").onclick = fbrowserShut;
$("fbrowserUp").onclick = () => fbrowserLoad(fbrowserData && fbrowserData.parent != null ? fbrowserData.parent : "");
$("fbrowserFilter").oninput = () => { fbrowserAwake(); fbrowserList(); };
$("fbrowserFilter").addEventListener("keydown", ev => {
  if (ev.key === "Escape") fbrowserShut();
  if (ev.key === "Enter") { const first = $("fbrowserList").querySelector("button"); if (first) first.click(); }
});
$("fbrowserTake").onclick = () => { if (!fbrowserPath) return; $("gsiPathInput").value = fbrowserPath; fbrowserShut(); gsiPlace(fbrowserPath); };

// Teamnamen an die App geben, damit sie Team A/B selbst zuordnen kann
let gsiNames = "";
function gsiNamesReport() {
  const n = JSON.stringify([Z.teams.a.name, Z.teams.b.name]);
  if (n === gsiNames) return; gsiNames = n;
  fetch("/api/gsi-settings", { method: "POST", body: JSON.stringify({ teamA: Z.teams.a.name || "", teamB: Z.teams.b.name || "" }) }).catch(() => {});
}
function liveReceived(d) {
  liveLast = d;
  try { $("frame").contentWindow.postMessage({ cast: "live", live: d }, location.origin); } catch (err) {}   // Vorschau zeigt die Live-Daten mit
  if (liveTimer) return;                                    // Anzeige hier höchstens 2× pro Sekunde
  liveTimer = setTimeout(() => { liveTimer = null; liveShow(); }, 500);
}
function liveShow() {
  const d = liveLast, on = d && Date.now() - d.time < 15000;
  $("gsiDisplay").classList.toggle("on", !!on);
  $("gsiDisplay").querySelector("span").textContent = !d ? "Noch keine Daten von CS2"
    : (on ? "✓ Live" : "Keine neuen Daten seit " + Math.round((Date.now() - d.time) / 1000) + " s") +
      ` · ${d.map || "?"} · Runde ${d.round + 1} · CT ${d.ct.score} : ${d.t.score} T · ${d.players.length} Spieler` + (d.source === "network" ? " · Observer-PC" : "");
  gsiDraw(); gsiNamesReport();
  const sideB = d && (d.sideA === "CT" ? "T" : "CT");
  const team = (k, side) => {
    const l = d ? d.players.filter(p => p.side === side).sort((x, y) => y.k - x.k) : [];
    return `<div class="gt"><b>${esc(Z.teams[k].name || "Team " + k.toUpperCase())} · ${esc(side || "–")}</b>` +
      `<div class="gz small"><span>Spieler</span><span>K</span><span>D</span><span>ADR</span></div>` +
      (l.map(p => `<div class="gz"><span>${esc(p.name)}</span><span>${p.k}</span><span>${p.d}</span><span>${p.adr}</span></div>`).join("") || `<span class="small">–</span>`) + `</div>`;
  };
  $("gsiTable").innerHTML = d ? team("a", d.sideA) + team("b", sideB) : "";
  // Head-to-Head-Auswahl
  ["a", "b"].forEach(k => {
    const s = $(k === "a" ? "h2hA" : "h2hB"), side = !d ? "" : k === "a" ? d.sideA : sideB;
    const l = d ? d.players.filter(p => p.side === side) : [];
    const value = (Z.h2h || {})[k] || "";
    const html = `<option value="">Automatisch (stärkster Spieler)</option>` + l.map(p => `<option value="${esc(p.id)}"${p.id === value ? " selected" : ""}>${esc(p.name)}</option>`).join("");
    if (s._html !== html) { s.innerHTML = html; s._html = html; }
  });
}
["h2hA", "h2hB"].forEach(id => $(id).onchange = () => { Z.h2h = Z.h2h || { a: "", b: "" }; Z.h2h[id === "h2hA" ? "a" : "b"] = $(id).value; send(); });
setInterval(() => { if (liveLast) liveShow(); }, 5000);
gsiInfoFetch();

/* ---------- Szenen anordnen ---------- */
let sceneTurn = null;
function sceneDragStart(ev, b) {
  if (ev.button !== 0) return;
  sceneTurn = { b, x: ev.clientX, y: ev.clientY, active: false };
  b.setPointerCapture(ev.pointerId);
}
addEventListener("pointermove", ev => {
  if (!sceneTurn) return;
  if (!sceneTurn.active) { if (Math.hypot(ev.clientX - sceneTurn.x, ev.clientY - sceneTurn.y) < 6) return; sceneTurn.active = true; sceneTurn.b._dragged = true; sceneTurn.b.classList.add("becomes-dragged"); }
  const target = [...$("sceneButtons").children].find(x => { if (x === sceneTurn.b) return false; const r = x.getBoundingClientRect(); return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom; });
  if (!target) return;
  const r = target.getBoundingClientRect(), after = target.classList.contains("scene-group") ? ev.clientY > r.top + r.height / 2 : ev.clientX > r.left + r.width / 2;
  $("sceneButtons").insertBefore(sceneTurn.b, after ? target.nextSibling : target);     // live umsortieren
});
addEventListener("pointerup", () => {
  if (!sceneTurn) return;
  const { b, active } = sceneTurn; sceneTurn = null; b.classList.remove("becomes-dragged");
  if (!active) return;
  ui.sceneRow = [...$("sceneButtons").children].map(x => x.dataset.sceneDef).filter(Boolean); uiSave();
  setTimeout(() => { b._dragged = false; }, 0);
});
$("sceneArrange").onclick = () => { sceneArrange = !sceneArrange; scenesDraw(); };
$("sceneDefault").onclick = () => { ui.sceneRow = null; uiSave(); scenesDraw(); };

/* ---------- Eine Browserquelle: Szenen, Übergänge ---------- */
const TRANSITIONS = [["cut", "Schnitt"], ["fade", "Blende"], ["slide", "Schieben"], ["wipe", "Wischen"], ["stinger", "Stinger"]];
const onSource = () => !!(Z.broadcast && Z.broadcast.active);
function transitionChoiceDraw() {
  $("ubDuration").textContent = ((Z.broadcast.duration || 0) / 1000).toFixed(1).replace(".", ",") + " s";
  $("ubSlider").oninput = () => { $("ubDuration").textContent = (+$("ubSlider").value / 1000).toFixed(1).replace(".", ",") + " s"; };
  const box = $("ubChoice"); box.innerHTML = "";
  TRANSITIONS.forEach(([k, n]) => {
    const b = document.createElement("button"); b.textContent = n;
    b.setAttribute("aria-pressed", (Z.broadcast.transition || "stinger") === k);
    b.onclick = () => { Z.broadcast.transition = k; transitionChoiceDraw(); send(); };
    box.appendChild(b);
  });
}

/* ---------- Einblendungen ---------- */
const GFX_NAMES = { caster: "Caster", lowerthird: "Bauchbinde", hint: "Hinweis", score: "Punktestand", mapinfo: "Map-Info", mapfact: "Map-Fakt", scoreboard: "Scoreboard (live)", players: "Spieler (live)" };
const GFX_POS = [["bl", "Links unten"], ["bc", "Mitte unten"], ["br", "Rechts unten"], ["tl", "Links oben"], ["tc", "Mitte oben"], ["tr", "Rechts oben"], ["cl", "Links Mitte"], ["cr", "Rechts Mitte"]];
const GFX_DEFAULT = K.GFX_DEFAULT_POS;            // Standardposition je Art (cast-core.js)
const opts = (list, value) => list.map(([v, n]) => `<option value="${esc(v)}"${String(v) === String(value) ? " selected" : ""}>${esc(n)}</option>`).join("");
const gfxOpen = new Set();
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return s >= 60 ? Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") + " min" : s + " s"; };
function gfxStatus(x) {
  const now = Date.now(), scene = Z.broadcast.scene;
  if (!x.on) return "off";
  const view = K.gfxVisible(x, now, scene), w = K.gfxNextSwitch(x, now);
  if ((x.sceneList || []).length && !x.sceneList.includes(scene)) return "wartet auf Szene";
  if (view) return w ? "sichtbar · noch " + mmss(w - now) : "sichtbar";
  if (w) return "nächste in " + mmss(w - now);
  return "abgelaufen";
}
function gfxShow(x, on) {
  if (!on) { x.on = false; x.until = 0; x.start = 0; }
  else {
    x.on = true; x.start = Date.now();
    const d = +x.duration || 0;
    x.until = d > 0 && !(x.repeat > 0) ? Date.now() + d * 1000 : 0;
  }
  graphicsDraw(); send();
}
function graphicsDraw() {
  const box = document.createElement("div");
  Z.graphics = Z.graphics || [];
  // neue Arten aus späteren Versionen nur EINMAL ergänzen – danach darf man sie löschen
  if ((Z.gfxVersion || 0) < 2) { K.DEFAULT.graphics.forEach(s => { if (!Z.graphics.some(x => x.type === s.type)) Z.graphics.push(Object.assign(K.clone(s), { id: "e" + s.type })); }); Z.gfxVersion = 2; }
  Z.graphics.forEach((x, i) => {
    const visible = K.gfxVisible(x, Date.now(), Z.broadcast.scene), settingsOpen = gfxOpen.has(x.id);
    const z = document.createElement("div"); z.className = "gfx-card" + (visible ? " on" : ""); z.dataset.id = x.id;
    let quick = "", extra = "";
    if (x.type === "lowerthird") quick = `<input type="text" data-f="title" placeholder="Name" aria-label="Name"><input type="text" data-f="text" placeholder="Zusatz" aria-label="Zusatz">`;
    else if (x.type === "hint") quick = `<input type="text" data-f="title" placeholder="Überschrift (optional)" aria-label="Überschrift"><input type="text" data-f="text" placeholder="Text" aria-label="Text">`;
    else if (x.type === "caster") {
      extra = `<label>Anordnung<select data-f="arrangement">${opts([["stacked", "untereinander"], ["sidebyside", "nebeneinander"]], x.arrangement || "stacked")}</select></label>
        <label class="toggleSwitch" style="align-self:end"><input type="checkbox" data-f="guest"${x.guest ? " checked" : ""}> mit Gast</label>`;
    }
    else if (x.type === "scoreboard") quick = `<span class="small">Beide Teams live aus CS2: K / D / ADR</span>`;
    else if (x.type === "players") {
      const l = liveLast ? liveLast.players : [];
      quick = `<select data-f="playersId" aria-label="Spieler">${opts([["", "Beobachteter Spieler (folgt der Kamera)"], ...l.map(p => [p.id, p.name])], x.playersId || "")}</select>`;
    }
    else if (x.type === "mapfact") {
      const maps = [["", "Aktuelle Map (automatisch)"], ...Z.mapPool.map(m => [m.name, m.name])];
      const pool = Z.mapPool.find(m => m.name === x.map) || null, facts = pool ? (pool.facts || []) : [];
      quick = `<select data-f="map" aria-label="Map">${opts(maps, x.map || "")}</select><select data-f="fact" aria-label="Fakt">${opts([[-1, "Fakten wechseln"], ...facts.map((f, n) => [n, f.slice(0, 40)])], x.fact ?? -1)}</select>`;
      extra = `<label>Fakt wechselt alle (Sek.)<input type="number" min="4" data-f="seconds" value="${esc(x.seconds || 12)}"></label>`;
    }
    const scenesChips = OVERLAY_SCENES.map(([k, n]) => `<button type="button" data-scene="${esc(k)}" aria-pressed="${(x.sceneList || []).includes(k)}">${esc(n)}</button>`).join("");
    z.innerHTML = `<div class="gfx-head">
        <button class="gfx-open" aria-label="Einstellungen" aria-expanded="${settingsOpen}">▸</button>
        <div><b>${esc(x.name || GFX_NAMES[x.type] || x.type)}</b>${x.name ? ` <span class="gfx-kind">${esc(GFX_NAMES[x.type] || x.type)}</span>` : ""}</div>
        <span class="gfx-status">${esc(gfxStatus(x))}</span>
        <button class="button ${x.on ? "" : "main"} gfx-show">${x.on ? "Aus" : "Zeigen"}</button>
        <button class="gfx-more" aria-label="Mehr: duplizieren, verschieben, löschen">${icon("more")}</button>
      </div>
      ${quick ? `<div class="gfx-quick">${quick}</div>` : ""}
      <div class="gfx-settings"${settingsOpen ? "" : " hidden"}>
        <label class="wide">Name in der Liste<input type="text" data-f="name" placeholder="${esc(GFX_NAMES[x.type] || "")}"></label>
        <label>Position<select data-f="pos">${opts(GFX_POS, x.pos || GFX_DEFAULT[x.type] || "bl")}</select></label>
        <label>Dauer (Sek., 0 = bleibt)<input type="number" min="0" data-f="duration" value="${esc(x.duration || 0)}"></label>
        <label>Wiederholen alle (Min., 0 = nie)<input type="number" min="0" step="0.5" data-f="repeat" value="${esc(x.repeat || 0)}"></label>
        ${extra}
        <div class="wide"><span class="small">Nur in diesen Szenen (keine gewählt = überall)</span><div class="gfx-chips">${scenesChips}</div></div>
      </div>`;
    z.querySelectorAll("[data-f]").forEach(f => {
      const k = f.dataset.f;
      if (f.type === "text") f.value = x[k] || "";
      const read = () => f.type === "checkbox" ? f.checked : ["fact", "duration", "repeat", "seconds"].includes(k) ? (+f.value || 0) : f.value;
      f.addEventListener(f.type === "text" ? "input" : "change", () => {
        x[k] = read();
        if (k === "map") x.fact = -1;
        if ((k === "duration" || k === "repeat") && x.on) { x.start = Date.now(); x.until = x.duration > 0 && !(x.repeat > 0) ? Date.now() + x.duration * 1000 : 0; }
        if (k === "map") graphicsDraw();
        f.type === "text" ? laterSend() : send();
      });
    });
    z.querySelectorAll("[data-scene]").forEach(c => c.onclick = () => {
      const s = new Set(x.sceneList || []); s.has(c.dataset.scene) ? s.delete(c.dataset.scene) : s.add(c.dataset.scene);
      x.sceneList = OVERLAY_SCENES.map(([k]) => k).filter(k => s.has(k));
      graphicsDraw(); send();
    });
    z.querySelector(".gfx-open").onclick = () => { settingsOpen ? gfxOpen.delete(x.id) : gfxOpen.add(x.id); graphicsDraw(); };
    z.querySelector(".gfx-show").onclick = () => gfxShow(x, !x.on);
    z.querySelector(".gfx-more").onclick = ev => gfxMenu(x, i, ev.currentTarget);
    box.appendChild(z);
  });
  // Seitenleiste: die volle Karte der gewählten Einblendung
  const openGfx = (Z.graphics || []).find(x => x.id === gfxOpenId);
  if (openGfx && !$("gfxDrawer").hidden) {
    const card = box.querySelector(`.gfx-card[data-id="${CSS.escape(openGfx.id)}"]`);
    $("drawerName").textContent = openGfx.name || GFX_NAMES[openGfx.type] || openGfx.type;
    if (document.activeElement && $("drawerContent").contains(document.activeElement) && document.activeElement.type === "text") {} else { $("drawerContent").innerHTML = ""; if (card) $("drawerContent").appendChild(card); }
  }
  // Live-Liste: Favoriten und alles, was gerade an ist (oder alle)
  const list = $("gfxList"); list.innerHTML = "";
  const all = Z.graphics || [];
  const show = all.filter(x => gfxAll || x.favorite !== false || x.on);
  $("gfxAllButton").textContent = gfxAll ? "Nur Favoriten" : `Alle ${all.length}`;
  show.forEach(x => {
    const on = K.gfxVisible(x, Date.now(), Z.broadcast.scene);
    const z = document.createElement("div"); z.className = "gfx-line2" + (x.on ? " on" : ""); z.dataset.id = x.id;
    z.innerHTML = `<button class="gfx-star${x.favorite !== false ? " fav" : ""}" aria-label="Favorit">${icon(x.favorite !== false ? "star" : "star-empty")}</button>
      <div class="gfx-text"><b>${esc(x.name || GFX_NAMES[x.type] || x.type)}</b><span class="gfx-status">${esc(gfxStatus(x))}</span></div>
      <button class="gfx-switch${x.on ? " on" : ""}" role="switch" aria-checked="${!!x.on}" aria-label="Ein- oder ausblenden"><i></i></button>
      <button class="gfx-more" aria-label="Bearbeiten">${icon("more")}</button>`;
    z.querySelector(".gfx-star").onclick = () => { x.favorite = x.favorite === false; graphicsDraw(); send(); };
    z.querySelector(".gfx-switch").onclick = () => gfxShow(x, !x.on);
    z.querySelector(".gfx-more").onclick = () => gfxDrawerOpen(x.id);
    list.appendChild(z);
  });
}
// kleines Menü je Einblendung
const gfxMenuEl = document.createElement("div"); gfxMenuEl.className = "dock-menu"; gfxMenuEl.hidden = true; document.body.appendChild(gfxMenuEl);
document.addEventListener("pointerdown", ev => { if (!gfxMenuEl.hidden && !gfxMenuEl.contains(ev.target) && !ev.target.classList.contains("gfx-more")) gfxMenuEl.hidden = true; });
function gfxMenu(x, i, button) {
  const r = button.getBoundingClientRect(), z = parseFloat(document.body.style.zoom) || 1;
  gfxMenuEl.innerHTML = `<button data-a="dup">Duplizieren</button><button data-a="up">Nach oben</button><button data-a="down">Nach unten</button><button data-a="away">Löschen</button>`;
  gfxMenuEl.style.left = Math.max(8, r.right / z - 210) + "px"; gfxMenuEl.style.top = (r.bottom / z + 4) + "px"; gfxMenuEl.hidden = false;
  menuFit(gfxMenuEl, r, z);
  gfxMenuEl.querySelectorAll("button").forEach(b => b.onclick = () => {
    gfxMenuEl.hidden = true;
    const L = Z.graphics;
    if (b.dataset.a === "dup") {
      const copy = Object.assign(K.clone(x), { id: "e" + Date.now().toString(36), on: false, until: 0, start: 0, name: (x.name || GFX_NAMES[x.type] || "") + " (Kopie)" });
      L.splice(i + 1, 0, copy); gfxOpen.add(copy.id);
    }
    if (b.dataset.a === "up" && i > 0) [L[i - 1], L[i]] = [L[i], L[i - 1]];
    if (b.dataset.a === "down" && i < L.length - 1) [L[i + 1], L[i]] = [L[i], L[i + 1]];
    if (b.dataset.a === "away") return remove(L, i, x.name || GFX_NAMES[x.type] || "Einblendung", graphicsDraw);
    graphicsDraw(); send();
  });
}
// Status (noch X s / nächste in …) einmal pro Sekunde aktualisieren – nur der Text, kein Neuaufbau
setInterval(() => {
  // abgelaufene Einblendungen (feste Dauer, ohne Wiederholung) gelten wieder als „aus“
  const expired = (Z.graphics || []).filter(x => x.on && x.until && x.until <= Date.now() && !(x.repeat > 0));
  if (expired.length) { expired.forEach(x => { x.on = false; x.until = 0; x.start = 0; }); graphicsDraw(); send(); return; }
  (Z.graphics || []).forEach(x => {
    const z2 = document.querySelector(`.gfx-line2[data-id="${CSS.escape(x.id)}"] .gfx-status`);
    if (z2) { const t2 = gfxStatus(x); if (z2.textContent !== t2) z2.textContent = t2; }
    const k = document.querySelector(`.gfx-card[data-id="${CSS.escape(x.id)}"]`);
    if (!k) return;
    const s = k.querySelector(".gfx-status"), t = gfxStatus(x);
    if (s.textContent !== t) s.textContent = t;
    k.classList.toggle("on", K.gfxVisible(x, Date.now(), Z.broadcast.scene));
  });
}, 1000);
document.querySelectorAll("[data-gfx-new]").forEach(b => b.onclick = () => {
  const type = b.dataset.gfxNew, id = "e" + Date.now().toString(36);
  Z.graphics.push({ id, type, pos: GFX_DEFAULT[type], title: type === "lowerthird" ? "NAME" : "", text: type === "hint" ? "Gleich geht's weiter" : "",
    arrangement: "stacked", guest: false, map: "", fact: -1, seconds: 12, duration: +$("gfxDuration").value || 0, repeat: 0, sceneList: [], on: false, until: 0, start: 0 });
  gfxOpen.add(id);
  graphicsDraw(); send();
});

/* ---------- Zur Szene: was die laufende Szene gerade braucht ----------
   Zeigt in Live die Bedienung, die zur Szene im Programm gehört – z. B. bei „Map-Veto" das Veto zum Klicken.
   Dieselben Daten wie unter Match (Z.veto); jede Änderung zeichnet beide Stellen neu (vetoDraw). */
const SCENE_TOOLS = { "map-veto": "veto" };
let sceneToolsShown = "", sceneToolsForced = "";             // forced: „trotzdem zeigen" gilt bis zum nächsten Szenenwechsel
function sceneNow() {
  if (onSource()) return (Z.broadcast || {}).scene || "";
  const list = sceneCfg().list, k = Object.keys(list).find(x => list[x].obs && list[x].obs === currentScene);
  return k || "";
}
function sceneToolsDraw() {
  const k = sceneNow(), tool = SCENE_TOOLS[k] || sceneToolsForced;
  $("sceneToolsName").textContent = k ? audioSceneTitle(k) : "–";
  $("sceneToolsHint").textContent = tool ? "" : "Für diese Szene gibt es hier nichts einzustellen.";
  $("sceneToolsOther").hidden = !!tool;
  const veto = tool === "veto";
  $("sceneToolsVeto").hidden = !veto;
  if (veto) vetoDraw();
}
$("sceneToolsVetoShow").onclick = () => { sceneToolsForced = "veto"; sceneToolsDraw(); };
$("vEditLive").onclick = () => {
  tabs("match"); ui.below = Object.assign({}, ui.below, { match: "veto" }); uiSave(); belowApply();
  const d = document.querySelector('[data-area="map-veto"]'); if (d) { d.open = true; d.scrollIntoView({ block: "start", behavior: "smooth" }); }
};
setInterval(() => {                                           // jeder Weg zählt: Klick, Strg K, OBS, Sitzung laden
  const k = sceneNow(); if (k === sceneToolsShown) return;
  if (sceneToolsShown) sceneToolsForced = "";
  sceneToolsShown = k; sceneToolsDraw();
}, 250);
