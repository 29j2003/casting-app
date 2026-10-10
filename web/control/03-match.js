/* CASTING-APP · Steuerseite – Match: Timer, Teams, Bilder, Map-Pool, Map-Veto, Spieler, FACEIT, Kameras & Quellen
   Teil 3 von 13; Reihenfolge und Lageplan: control/01-core.js
   (der Server verbindet alle Dateien zu einem Skript – siehe dort) */

/* ---------- Timer ---------- */
function timerShow() {
  setText($("timerDisplay"), K.time(K.timerRest(Z.timer)));
  if ($("timerDisplay").classList.contains("running") !== !!Z.timer.running) $("timerDisplay").classList.toggle("running", !!Z.timer.running);
}
setInterval(timerShow, 250);
// bei 0:00 einmal in die gewählte Szene wechseln (nur wenn der Timer gerade läuft – nicht nach dem Neuladen eines alten Stands)
let timerEndDone = 0;
function timerEndCheck() {
  const E = (Z.timer || {}).end || {};
  if (!Z.timer.running || !E.scene || K.timerRest(Z.timer) > 0 || timerEndDone === Z.timer.target) return;
  timerEndDone = Z.timer.target;
  if (Date.now() - Z.timer.target < 5000 && sceneNow() !== E.scene) sceneSwitch(E.scene);
}
setInterval(timerEndCheck, 500);
function timerEndDraw() {
  const E = ensure(Z.timer, "end", { text: "", scene: "" });
  const html = `<option value="">– bleiben –</option>` + OVERLAY_SCENES.map(([k, n]) => `<option value="${k}"${k === E.scene ? " selected" : ""}>${esc(n)}</option>`).join("");
  if ($("tEndScene")._h !== html) { $("tEndScene").innerHTML = html; $("tEndScene")._h = html; }
}
$("tEndScene").onchange = () => { Z.timer.end = Object.assign({}, Z.timer.end, { scene: $("tEndScene").value }); send(); };
setTimeout(timerEndDraw, 0);
function mbarDraw() {
  if (!$("mbarNameA")) return;
  ["a", "b"].forEach(k => { const t = Z.teams[k], l = $(k === "a" ? "mbarLogoA" : "mbarLogoB");
    setImage(l, t.logo || ""); setText(l, t.logo ? "" : (t.short || (t.name || "").split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 3) || (k === "a" ? "TA" : "TB")).toUpperCase()); });
  try {
    const maps = steps().filter(x => x.action !== "ban" && x.map);
    setHtml($("mbarSeries"), maps.map(x => { const r = x.result || {}, st = r.status || "pending";
      return `<span class="${st === "running" ? "running" : st === "pending" ? "pending" : ""}">${esc(x.map)}${st === "done" ? ` ${esc(r.a)}:${esc(r.b)}` : st === "running" ? " <span>läuft</span>" : ""}</span>`; }).join(""));
    const run = maps.findIndex(x => (x.result || {}).status === "running");
    setText($("mbarMap"), maps.length ? `Map ${run >= 0 ? run + 1 : Math.min(maps.length, maps.filter(x => (x.result || {}).status === "done").length + 1)} von ${maps.length}${run >= 0 ? " · " + maps[run].map : ""}` : "");
  } catch (err) {}
  setText($("mbarCs2"), typeof liveLast !== "undefined" && liveLast && Date.now() - liveLast.time < 15000 ? `● CS2 · Runde ${liveLast.round + 1}` : "");
  setText($("mbarNameA"), Z.teams.a.name || "Team A"); setText($("mbarNameB"), Z.teams.b.name || "Team B");
  setText($("mbarScoreA"), Z.teams.a.score || 0); setText($("mbarScoreB"), Z.teams.b.score || 0);
  setText($("mbarTimer"), K.time(K.timerRest(Z.timer))); setText($("mbarStart"), Z.timer.running ? "Pause" : "Start");
  panelValues();
  const T = Z.tournament || {}, B = K.tournamentBuild(T, CastI18n.language);
  const groups = `<option value="">Alle Gruppen</option>` + (B.groups || []).map((g, i) => `<option value="${i}"${String(T.showGroup ?? "") === String(i) ? " selected" : ""}>${esc(g.name)}</option>`).join("");
  if ($("mbarGroup")._h !== groups) { $("mbarGroup").innerHTML = groups; $("mbarGroup")._h = groups; }
  $("mbarGroup").hidden = !(B.groups || []).length;
  const focused = tourFocusOptions();
  if ($("mbarFocus")._h !== focused) { $("mbarFocus").innerHTML = focused; $("mbarFocus")._h = focused; }
}
const mbarPoint = (k, d) => { const t = Z.teams[k]; t.score = Math.max(0, (t.score || 0) + d); teamDraw(k); mbarDraw(); send(); };
$("mbarPlusA").onclick = () => mbarPoint("a", 1); $("mbarMinusA").onclick = () => mbarPoint("a", -1);
$("mbarPlusB").onclick = () => mbarPoint("b", 1); $("mbarMinusB").onclick = () => mbarPoint("b", -1);
$("mbarStart").onclick = () => { $(Z.timer.running ? "tPause" : "tStart").click(); mbarDraw(); };
$("mbarPlus1").onclick = () => { $("tPlus").click(); mbarDraw(); }; $("mbarMinus1").onclick = () => { $("tMinus").click(); mbarDraw(); };
$("mbarGroup").onchange = () => { tourGroup($("mbarGroup").value); mbarDraw(); send(); };
$("mbarFocus").onchange = () => { tourFocus($("mbarFocus").value); if (typeof tournamentTreeDraw === "function") tournamentTreeDraw(); mbarDraw(); send(); };
$("mbarTournament").onclick = () => sceneSwitch("bracket");
setInterval(mbarDraw, 3000);
setInterval(() => setText($("mbarTimer"), K.time(K.timerRest(Z.timer))), 250);
$("tStart").onclick = () => { if (Z.timer.running) return; Z.timer.target = Date.now() + K.timerRest(Z.timer); Z.timer.running = true; send(); timerShow(); };
$("tPause").onclick = () => { if (!Z.timer.running) return; Z.timer.rest = K.timerRest(Z.timer); Z.timer.running = false; send(); timerShow(); };
function shift(ms) {
  if (Z.timer.running) Z.timer.target = Math.max(Date.now(), Z.timer.target + ms);
  else Z.timer.rest = Math.max(0, (Z.timer.rest || 0) + ms);
  send(); timerShow();
}
$("tPlus").onclick = () => shift(60000);
$("tMinus").onclick = () => shift(-60000);
$("tSet").onclick = () => {
  const ms = Math.max(0, parseFloat($("tMin").value) || 0) * 60000;
  if (Z.timer.running) Z.timer.target = Date.now() + ms; else Z.timer.rest = ms;
  send(); timerShow();
};
$("tUntilSet").onclick = () => {
  const v = $("tUntil").value; if (!v) return;
  const [h, m] = v.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  Z.timer.target = d.getTime(); Z.timer.running = true; send(); timerShow();
};

/* ---------- Teams ---------- */
function logoShrink(file) {
  return new Promise((ok, error) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 256 / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        ok(c.toDataURL("image/png"));
      };
      img.onerror = error; img.src = r.result;
    };
    r.onerror = error; r.readAsDataURL(file);
  });
}
function teamDraw(k) {
  const t = Z.teams[k], box = $(k === "a" ? "teamA" : "teamB");
  box.className = "team";
  box.innerHTML = `
    <div class="logo-field" title="Logo wählen">${t.logo ? "" : "Logo<br>wählen"}</div>
    <div style="display:grid;gap:8px">
      <div class="line"><label style="flex:1">Team ${k.toUpperCase()}<input type="text" value=""></label>
        <label style="width:96px" title="Kürzel – das Overlay zeigt es, wenn der Name nicht ohne starkes Verkleinern passt">Kürzel<input type="text" class="team-short" maxlength="5" value=""></label></div>
      <div class="line" style="align-items:center">
        <div class="score"><button class="button">−</button><b>${esc(t.score || 0)}</b><button class="button">+</button></div>
        <button class="button">Logo entfernen</button>
      </div>
    </div>
    <input type="file" accept="image/*" hidden>`;
  const field = box.querySelector(".logo-field"), name = box.querySelector("input[type=text]"), file = box.querySelector("input[type=file]");
  const [minus, plus, remove] = box.querySelectorAll(".button");
  if (t.logo) field.style.backgroundImage = K.cssUrl(t.logo);
  const short = box.querySelector(".team-short");
  name.value = t.name || ""; short.value = t.short || "";
  short.oninput = () => { t.short = short.value.trim(); laterSend(); mbarDraw(); };
  name.oninput = () => { t.name = name.value; laterSend(); clearTimeout(name._t); name._t = setTimeout(() => { vetoDraw(); playersDraw("a"); playersDraw("b"); }, 400); };
  field.onclick = () => file.click();
  file.onchange = async () => { if (!file.files[0]) return; t.logo = await logoShrink(file.files[0]); teamDraw(k); send(); };
  remove.onclick = () => { t.logo = ""; teamDraw(k); send(); };
  minus.onclick = () => { t.score = Math.max(0, (t.score || 0) - 1); teamDraw(k); send(); };
  plus.onclick = () => { t.score = (t.score || 0) + 1; teamDraw(k); send(); };
}
$("result").onchange = () => { Z.teams.result = $("result").checked; send(); };
// Teams tauschen: alles, was zu einem Team gehört, wandert mit (Spieler, Werte der Teams-Vorstellung, Head-to-Head, Veto und Serie)
$("swap").onclick = () => {
  const flip = o => { if (o && typeof o === "object") [o.a, o.b] = [o.b, o.a]; };
  flip(Z.teams); flip(Z.players); flip((Z.teamIntro || {}).stats); flip(Z.h2h);
  for (const s of (Z.veto || {}).steps || []) {
    if (s.team === "a" || s.team === "b") s.team = s.team === "a" ? "b" : "a";
    if (s.result) flip(s.result);
  }
  teamDraw("a"); teamDraw("b"); playersDraw("a"); playersDraw("b"); vetoDraw(); seriesDraw(); mbarDraw(); fieldsFill(); send();
};

/* ---------- Bilder in optimaler Größe ---------- */
// So groß werden die Bilder im Overlay angezeigt (1920×1080)
const TARGET = { players: [280, 190], map: [262, 470] };
// Bild so verkleinern, dass es die Fläche genau abdeckt – ohne es abzuschneiden.
// So bleibt beides möglich: „Füllen" (Rand wird im Overlay abgeschnitten) und „Ganz" (komplettes Bild).
function imageForArea(file, [tw, themeDef]) {
  return new Promise((ok, error) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, Math.max(tw / img.width, themeDef / img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        ok({ image: c.toDataURL("image/jpeg", .9), orig: [img.width, img.height] });
      };
      img.onerror = error; img.src = r.result;
    };
    r.onerror = error; r.readAsDataURL(file);
  });
}
function imageHint(entry, [tw, themeDef]) {
  if (!entry.image || !entry.orig) return `Optimal: ${tw} × ${themeDef} px`;
  const [w, h] = entry.orig;
  const small = Math.max(tw / w, themeDef / h) > 1;
  return `${w} × ${h} px` + (small ? ` · ⚠ kleiner als optimal (${tw} × ${themeDef})` : " · ✓ scharf");
}
function previewImage(el, entry) {
  el.style.backgroundImage = entry.image ? K.cssUrl(entry.image) : "";
  el.style.backgroundSize = entry.imageMode === "whole" ? "contain" : "cover";
}
const MODES = [["fill", "Füllen"], ["whole", "Ganz"]];
const modeSelect = value => `<select title="Füllen = passend zugeschnitten, Ganz = komplettes Bild">${MODES.map(([v, n]) => `<option value="${v}"${v === (value || "fill") ? " selected" : ""}>${n}</option>`).join("")}</select>`;

/* ---------- Map-Pool ---------- */
// Standard-Maps samt Bildern ergänzen (auch in älteren Sitzungen)
function poolComplete() {
  K.DEFAULT.mapPool.forEach(s => {
    const m = Z.mapPool.find(x => normMap(x.name) === normMap(s.name));
    if (!m) Z.mapPool.push(K.clone(s));
    else { if (!m.image) m.image = s.image; if (m.active == null) m.active = s.active; }
  });
}
const normMap = n => String(n || "").toLowerCase().replace(/^de_/, "").replace(/[^a-z0-9]/g, "").replace(/ii$/, "2");
// Kacheln wie im Konzept: Bild mit Name, Schalter „im Pool", Füllen/Ganz, Map-Fakten; oben die aktiven, darunter die übrigen
const poolStandard = m => K.DEFAULT.mapPool.some(s => normMap(s.name) === normMap(m.name));
function poolCard(m, i) {
  const z = document.createElement("div"); z.className = "pool-card" + (m.active === false ? " off" : ""); z.dataset.i = i;
  z.innerHTML = `<div class="vb pool-image" title="Bild wählen"><input type="text" class="pool-name" aria-label="Name der Map"></div>
    <div class="pool-bar"><label class="toggleSwitch" title="Map steht im Veto zur Auswahl"><input type="checkbox" class="active"></label>${modeSelect(m.imageMode)}
      ${poolStandard(m) ? "" : `<button class="x" title="Entfernen" aria-label="Entfernen">${icon("close")}</button>`}</div>
    <span class="small hint"></span>
    <details class="facts"><summary class="small">Map-Fakten (${(m.facts || []).filter(Boolean).length})</summary><textarea placeholder="Ein Fakt pro Zeile, z. B. „Die CT-Seite gewinnt hier 54 % der Runden.“"></textarea></details>
    <input type="file" accept="image/*" hidden>`;
  const image = z.querySelector(".vb"), name = z.querySelector(".pool-name"), mode = z.querySelector(".pool-bar select"),
        x = z.querySelector(".x"), file = z.querySelector("input[type=file]");
  previewImage(image, m);
  // Bildgröße als Tooltip am Bild; als Text nur, wenn das Bild zu klein ist (weniger Text in jeder Karte)
  const hint = imageHint(m, TARGET.map); image.title = "Bild wählen · " + hint;
  z.querySelector(".hint").textContent = hint.includes("⚠") ? hint : ""; z.querySelector(".hint").hidden = !hint.includes("⚠");
  name.value = m.name;
  name.onclick = ev => ev.stopPropagation();
  name.oninput = () => { m.name = name.value; vetoDraw(); laterSend(); };
  const fk = z.querySelector(".facts textarea"); fk.value = (m.facts || []).join("\n");
  fk.oninput = () => { m.facts = fk.value.split("\n").map(x => x.trim()).filter(Boolean); z.querySelector(".facts summary").textContent = `Map-Fakten (${m.facts.length})`; laterSend(); };
  const ak = z.querySelector(".active"); ak.checked = m.active !== false;
  ak.onchange = () => { m.active = ak.checked; poolDraw(); vetoDraw(); send(); };
  mode.onchange = () => { m.imageMode = mode.value; previewImage(image, m); send(); };
  image.onclick = () => file.click();
  file.onchange = async () => { if (!file.files[0]) return; Object.assign(m, await imageForArea(file.files[0], TARGET.map)); poolDraw(); send(); };
  if (x) x.onclick = () => remove(Z.mapPool, i, `Map „${m.name}“`, () => { poolDraw(); vetoDraw(); });
  // im Pool: ziehen = Reihenfolge im Veto
  if (m.active !== false) {
    z.draggable = true;
    z.ondragstart = ev => { ev.dataTransfer.setData("text/pool", String(i)); z.classList.add("drags"); };
    z.ondragend = () => z.classList.remove("drags");
    z.ondragover = ev => { if (ev.dataTransfer.types.includes("text/pool")) ev.preventDefault(); };
    z.ondrop = ev => {
      ev.preventDefault(); const from = +ev.dataTransfer.getData("text/pool"); if (from === i || isNaN(from)) return;
      const [moved] = Z.mapPool.splice(from, 1); Z.mapPool.splice(Z.mapPool.indexOf(m) + (from < i ? 1 : 0), 0, moved);
      poolDraw(); vetoDraw(); send();
    };
  }
  return z;
}
function poolDraw() {
  const box = $("pool"), more = $("poolMore"); box.innerHTML = ""; more.innerHTML = "";
  Z.mapPool.forEach((m, i) => (m.active === false ? more : box).appendChild(poolCard(m, i)));
  const active = Z.mapPool.filter(m => m.active !== false), names = active.map(m => normMap(m.name)).sort().join();
  const duty = K.DEFAULT.mapPool.filter(m => m.active).map(m => normMap(m.name)).sort().join();
  $("poolCount").textContent = `· ${active.length} Maps`;
  $("poolState").className = "state " + (names === duty ? "ok" : "next");
  $("poolState").textContent = names === duty ? "entspricht Active Duty (Season 5)" : "eigener Pool – weicht von Active Duty ab";
  // reicht der Pool für die Formate? (so viele Maps wie Schritte im Ablauf)
  $("poolEnough").innerHTML = `<span class="small">Reicht für:</span>` + Object.values(Z.vetoPresets || {}).map(p => {
    const need = (p.steps || []).length, ok = active.length >= need;
    return `<span class="state ${ok ? "ok" : "wait"}" title="${need} Schritte im Ablauf">${esc(p.name || "")}${ok ? "" : ` – ${need - active.length} Map(s) fehlen`}</span>`;
  }).join("");
  more.hidden = !more.children.length; more.previousElementSibling.hidden = more.hidden;
}
// neue Maps landen unter „Weitere Maps“ – der aktive Pool ändert sich nur, wenn du selbst umschaltest (2.15)
$("poolPlus").onclick = () => { Z.mapPool.push({ name: "Neue Map", image: "", active: false }); poolDraw(); vetoDraw(); send(); };
$("poolDefault").onclick = async () => {
  if (!await confirmDialog({ title: "Map-Pool zurücksetzen?", text: "Aktiver CS2-Pool + ältere Maps mit Bildern. Eigene Maps, Bilder und Map-Fakten gehen verloren.", button: "Zurücksetzen" })) return;
  Z.mapPool = K.clone(K.DEFAULT.mapPool); poolDraw(); vetoDraw(); send();
};
function dataUrlBlob(url) {
  const [head, data] = String(url).split(","), type = (head.match(/^data:([^;,]+)/) || [, ""])[1];
  const bytes = Uint8Array.from(atob(data || ""), c => c.charCodeAt(0));
  return new Blob([bytes], { type });
}
// eigene Map aus dem Steam Workshop: Name und Vorschaubild über die App holen (nur die Nummer geht zu Steam)
$("poolWorkshopGo").onclick = async () => {
  const value = $("poolWorkshop").value.trim(); if (!value) { $("poolWorkshop").focus(); return; }
  $("poolWorkshopStatus").textContent = "Frage Steam …"; $("poolWorkshopGo").disabled = true;
  try {
    const r = await fetch("/api/workshop?id=" + encodeURIComponent(value), { cache: "no-store" }), j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Steam antwortet nicht");
    const entry = { name: j.title, image: "", active: false, workshop: j.id };
    // Bild kommt als data:-URL – direkt umwandeln (fetch() darf data: hier nicht laden, CSP connect-src; bis 2.14 brach das ab)
    if (j.image) try { Object.assign(entry, await imageForArea(dataUrlBlob(j.image), TARGET.map)); } catch (err) {}
    Z.mapPool.push(entry); $("poolWorkshop").value = "";
    $("poolWorkshopStatus").textContent = `✓ „${j.title}“ steht unter „Weitere Maps“ – zum Aktivieren dort einschalten.`;
    poolDraw(); vetoDraw(); send();
  } catch (err) { $("poolWorkshopStatus").textContent = err.message; }
  $("poolWorkshopGo").disabled = false;
};
$("poolWorkshop").addEventListener("keydown", ev => { if (ev.key === "Enter") $("poolWorkshopGo").click(); });

/* ---------- Map-Veto ---------- */
function presetSteps(format) {
  const p = Z.vetoPresets[format] || K.DEFAULT.vetoPresets.bo3;
  return p.steps.map(([action, team]) => ({ action, team, map: "", image: "", side: "" }));
}
function steps() {
  if (!Z.veto.steps || !Z.veto.steps.length) Z.veto.steps = presetSteps(Z.veto.format);
  return Z.veto.steps;
}
function freeMaps() {
  const used = steps().filter(s => s.map).map(s => normMap(s.map));
  return Z.mapPool.filter(m => m.active !== false && !used.includes(normMap(m.name)));
}
function deciderAuto() {
  const s = steps(), upnext = s.findIndex(x => !x.map), free = freeMaps();
  if (upnext >= 0 && s[upnext].action === "decider" && free.length === 1) s[upnext].map = free[0].name;
}
const teamName = k => k === "a" ? (Z.teams.a.name || "Team A") : k === "b" ? (Z.teams.b.name || "Team B") : "";
const VETO_WORD = { ban: "bannt", pick: "pickt", decider: "Decider" };
// „Wer ist dran?" mit den freien Maps als Knöpfen – dieselbe Anzeige unter Match und in Live („Zur Szene")
function vetoUpnextDraw(box) {
  const s = steps(), upnext = s.findIndex(x => !x.map);
  box.innerHTML = "";
  if (Z.veto.source === "faceit") box.innerHTML = `<span class="small">Das Veto kommt von FACEIT (Reiter „Match“ → FACEIT → „Daten holen“). Unten kannst du trotzdem korrigieren.</span>`;
  if (upnext < 0) { box.insertAdjacentHTML("beforeend", "<b>✓ Veto abgeschlossen</b>"); return; }
  if (Z.veto.source === "faceit") return;
  const x = s[upnext];
  box.insertAdjacentHTML("beforeend", `<b>Schritt ${upnext + 1}: ${x.team ? esc(teamName(x.team)) + " " + esc(VETO_WORD[x.action] || x.action) : "Decider"}</b><div class="map-buttons"></div>`);
  const k = box.querySelector(".map-buttons");
  freeMaps().forEach(m => {
    const b = document.createElement("button"); b.className = "button" + (x.action === "ban" ? "" : " main"); b.textContent = m.name;
    b.onclick = () => { x.map = m.name; x.image = ""; deciderAuto(); vetoDraw(); send(); };
    k.appendChild(b);
  });
}
// kurze Übersicht für Live: ein Feld je Schritt; bei Picks die Seite direkt wählbar
function vetoSummaryDraw(box) {
  const s = steps(), upnext = s.findIndex(x => !x.map);
  box.innerHTML = "";
  s.forEach((x, i) => {
    const z = document.createElement("div");
    z.className = `veto-chip ${x.action}` + (i === upnext ? " next" : "") + (x.map ? "" : " open");
    const who = x.action === "decider" ? "Decider" : `${x.action === "ban" ? "Ban" : "Pick"} · ${esc(teamName(x.team) || "–")}`;
    z.innerHTML = `<span class="small">${i + 1} · ${who}</span><b>${x.map ? esc(x.map) : "–"}</b>`;
    if (x.action === "pick" && x.map) {
      const side = document.createElement("select"); side.setAttribute("aria-label", "Seite des Gegners");
      [["", "Seite –"], ["ct", "Geg. CT"], ["t", "Geg. T"]].forEach(([v, n]) => side.appendChild(new Option(n, v, false, v === (x.side || ""))));
      side.onchange = () => { x.side = side.value; vetoDraw(); send(); };
      z.appendChild(side);
    }
    box.appendChild(z);
  });
}
function vetoDraw() {
  setTimeout(() => { seriesDraw(); seriesPoints(); }, 0);
  // Format-Auswahl (Match und Live)
  for (const f of [$("vFormat"), $("vFormatLive")]) {
    f.innerHTML = "";
    Object.entries(Z.vetoPresets).forEach(([k, p]) => f.appendChild(new Option(p.name, k, false, k === Z.veto.format)));
  }
  $("vSource").value = Z.veto.source;
  const s = steps();
  vetoUpnextDraw($("vUpnext"));
  if (!$("sceneToolsVeto").hidden) { vetoUpnextDraw($("vUpnextLive")); vetoSummaryDraw($("vSummaryLive")); }
  // Schrittliste
  const l = $("vSteps"); l.innerHTML = "";
  s.forEach((x, i) => {
    const z = document.createElement("div"); z.className = "row v-row";
    const sel = (opts, value) => `<select>${opts.map(([v, n]) => `<option value="${esc(v)}"${v === value ? " selected" : ""}>${esc(n)}</option>`).join("")}</select>`;
    const maps = [["", "– offen –"], ...Z.mapPool.map(m => [m.name, m.name])];
    if (x.map && !Z.mapPool.some(m => m.name === x.map)) maps.push([x.map, x.map]);
    z.innerHTML = `<b>${i + 1}</b>` +
      sel([["ban", "Ban"], ["pick", "Pick"], ["decider", "Decider"]], x.action) +
      sel([["a", "Team A"], ["b", "Team B"], ["", "–"]], x.team) +
      sel(maps, x.map) +
      (x.action === "pick" ? sel([["", "Seite –"], ["ct", "Geg. CT"], ["t", "Geg. T"]], x.side || "") : "<span></span>") +
      `<button class="x" title="Schritt entfernen" aria-label="Schritt entfernen">${icon("close")}</button>`;
    const [action, team, map, side] = z.querySelectorAll("select");
    action.onchange = () => { x.action = action.value; if (x.action === "decider") x.team = ""; vetoDraw(); send(); };
    team.onchange = () => { x.team = team.value; vetoDraw(); send(); };
    map.onchange = () => { x.map = map.value; x.image = ""; vetoDraw(); send(); };
    if (side && x.action === "pick") side.onchange = () => { x.side = side.value; vetoDraw(); send(); };
    z.querySelector(".x").onclick = () => remove(s, i, `Schritt ${i + 1}`, vetoDraw);
    l.appendChild(z);
  });
}
$("vSource").onchange = () => { Z.veto.source = $("vSource").value; vetoDraw(); send(); };
async function vetoFormatSet(format, select) {
  if (vetoHasMaps() && !await confirmDialog({ title: "Format wechseln?", text: "Das Veto beginnt mit dem neuen Format von vorn – eingetragene Bans und Picks werden geleert.", button: "Wechseln" })) { select.value = Z.veto.format; return; }
  Z.veto.format = format; Z.veto.steps = presetSteps(format); vetoDraw(); send();
}
$("vFormat").onchange = () => vetoFormatSet($("vFormat").value, $("vFormat"));
$("vFormatLive").onchange = () => vetoFormatSet($("vFormatLive").value, $("vFormatLive"));
const vetoHasMaps = () => (Z.veto.steps || []).some(x => x.map);
$("vNew").onclick = $("vNewLive").onclick = async () => {
  if (vetoHasMaps() && !await confirmDialog({ title: "Veto neu starten?", text: "Alle eingetragenen Bans, Picks und Ergebnisse werden geleert.", button: "Neu starten" })) return; Z.veto.steps = presetSteps(Z.veto.format); vetoDraw(); send(); };
$("vBack").onclick = $("vBackLive").onclick = () => {
  const s = steps(); for (let i = s.length - 1; i >= 0; i--) if (s[i].map) { s[i].map = ""; s[i].image = ""; s[i].page = ""; s[i].side = ""; break; }
  vetoDraw(); send();
};
$("vClear").onclick = async () => {
  if (vetoHasMaps() && !await confirmDialog({ title: "Alle Maps leeren?", text: "Bans, Picks und Ergebnisse werden entfernt, die Reihenfolge bleibt.", button: "Leeren" })) return; steps().forEach(x => { x.map = ""; x.image = ""; x.side = ""; }); vetoDraw(); send(); };
$("vStepPlus").onclick = () => { steps().push({ action: "ban", team: "a", map: "", image: "", side: "" }); vetoDraw(); send(); };
$("vPresetSave").onclick = () => {
  const name = prompt("Name für das Preset:", "Eigenes Preset"); if (!name) return;
  const key = "own-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  Z.vetoPresets[key] = { name, steps: steps().map(x => [x.action, x.team]) };
  Z.veto.format = key; vetoDraw(); send();
};
$("vPresetDelete").onclick = async () => {
  const k = Z.veto.format;
  if (K.DEFAULT.vetoPresets[k]) return alert("Die Standard-Presets (Bo1–Bo5) bleiben erhalten.");
  if (!await confirmDialog({ title: `Preset „${Z.vetoPresets[k].name}“ löschen?`, button: "Löschen" })) return;
  delete Z.vetoPresets[k]; Z.veto.format = "bo3"; vetoDraw(); send();
};

/* ---------- Spieler ---------- */
function playersDraw(k) {
  const box = $(k === "a" ? "playersA" : "playersB");
  Z.players[k] = Z.players[k] || [];
  box.innerHTML = `<div class="team-title">${esc(teamName(k))}</div><div class="list"></div>`;
  const l = box.querySelector(".list");
  Z.players[k].forEach((p, i) => {
    const z = document.createElement("div"); z.className = "row s-row";
    z.innerHTML = `<div class="vb vb-players" title="Bild wählen"></div>
      <div style="display:grid;gap:4px">
        <div class="line" style="flex-wrap:nowrap"><input type="text" placeholder="Nickname"><input type="text" placeholder="Name / Rolle"><input type="number" min="0" max="10" placeholder="Lvl" style="flex:0 0 58px"></div>
        <div class="line" style="align-items:center;flex-wrap:nowrap">${modeSelect(p.imageMode)}<span class="small hint"></span></div>
      </div>
      <button class="x" title="Entfernen" aria-label="Entfernen">${icon("close")}</button><input type="file" accept="image/*" hidden>`;
    const image = z.querySelector(".vb"), [nick, real] = z.querySelectorAll("input[type=text]"), lvl = z.querySelector("input[type=number]"),
          mode = z.querySelector("select"), x = z.querySelector(".x"), file = z.querySelector("input[type=file]");
    previewImage(image, p);
    z.querySelector(".hint").textContent = imageHint(p, TARGET.players);
    nick.value = p.name || ""; real.value = p.real || ""; lvl.value = p.level || "";
    nick.oninput = () => { p.name = nick.value; laterSend(); };
    real.oninput = () => { p.real = real.value; laterSend(); };
    lvl.oninput = () => { p.level = parseInt(lvl.value, 10) || 0; laterSend(); };
    mode.onchange = () => { p.imageMode = mode.value; previewImage(image, p); send(); };
    image.onclick = () => file.click();
    file.onchange = async () => { if (!file.files[0]) return; Object.assign(p, await imageForArea(file.files[0], TARGET.players)); playersDraw(k); send(); };
    x.onclick = () => remove(Z.players[k], i, `Spieler „${p.name || "?"}“`, () => playersDraw(k));
    l.appendChild(z);
  });
  const plus = document.createElement("button"); plus.className = "button"; plus.textContent = "+ Spieler";
  plus.onclick = () => { Z.players[k].push({ name: "", real: "", image: "", level: 0 }); playersDraw(k); };
  box.appendChild(plus);
}

/* ---------- FACEIT ---------- */
const FACEIT_KEY = "cast-faceit";
const faceit = (() => { try { return JSON.parse(localStorage.getItem(FACEIT_KEY) || "{}"); } catch (e) { return {}; } })();
$("faceitUrl").value = faceit.url || "";
// Der Schlüssel liegt nur noch verschlüsselt in der App – hier bleibt nur der Matchroom-Link
const faceitRemember = () => localStorage.setItem(FACEIT_KEY, JSON.stringify({ url: $("faceitUrl").value.trim() }));
$("faceitUrl").oninput = faceitRemember;
let faceitKeySaved = false;
async function faceitKeyState() {
  try { faceitKeySaved = !!(await (await fetch("/api/faceit-key", { cache: "no-store" })).json()).isSet; } catch (err) {}
  $("faceitKey").placeholder = faceitKeySaved ? "✓ Schlüssel gespeichert – zum Ersetzen neuen einfügen" : "Schlüssel einfügen …";
  $("faceitKeyDelete").disabled = !faceitKeySaved;
}
async function faceitKeySet(k) {
  const r = await fetch("/api/faceit-key", { method: "POST", body: JSON.stringify({ key: k }) });
  const j = await r.json().catch(() => ({}));
  $("faceitKey").value = "";                                  // Feld sofort leeren – der Schlüssel steht nirgends mehr in der Seite
  await faceitKeyState();
  $("faceitKeyStatus").textContent = r.ok ? (j.persistent === false ? "✓ Gespeichert – nur für diese Sitzung (keine Verschlüsselung verfügbar)." : "✓ Verschlüsselt gespeichert. Der Schlüssel wird nicht wieder angezeigt.") : (j.error || "Speichern fehlgeschlagen");
}
$("faceitKeySave").onclick = () => { const k = $("faceitKey").value.trim(); if (k) faceitKeySet(k); };
$("faceitKey").addEventListener("keydown", ev => { if (ev.key === "Enter") $("faceitKeySave").click(); });
$("faceitKeyDelete").onclick = async () => {
  if (!await confirmDialog({ title: "FACEIT-Schlüssel löschen?", text: "Danach funktionieren FACEIT-Abfragen erst wieder mit einem neuen Schlüssel.", button: "Löschen" })) return;
  await fetch("/api/faceit-key", { method: "DELETE" }); await faceitKeyState();
  $("faceitKeyStatus").textContent = "Schlüssel gelöscht.";
};
// Umzug: ein Schlüssel aus älteren Versionen (im Browser gespeichert) wandert einmal in den sicheren Speicher und wird hier gelöscht
if (faceit.key) { const oldKey = faceit.key; delete faceit.key; faceitRemember(); faceitKeySet(oldKey); } else faceitKeyState();
const faceitStatus = (t, color) => { $("faceitStatus").textContent = t; $("faceitStatus").style.color = color || ""; };
function matchId(t) {
  const m = String(t).match(/1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (m) return m[0];
  const u = String(t).trim().match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  return u ? u[0] : "";
}
function vetoOffHistory(json, names, allMaps) {
  const tickets = [];
  (function search(o) {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach(search); return; }
    if (o.entity_type && Array.isArray(o.entities)) tickets.push(o);
    Object.values(o).forEach(search);
  })(json);
  const t = tickets.find(x => /map/i.test(x.entity_type));
  if (!t) return null;
  const chosen = t.entities.filter(x => x.selected_by && /drop|ban|pick/i.test(x.status || ""))
    .sort((a, b) => (a.round || 0) - (b.round || 0));
  if (!chosen.length) return null;
  const s = chosen.map(x => ({
    action: /drop|ban/i.test(x.status) ? "ban" : "pick",
    team: /1/.test(x.selected_by) ? "a" : "b",
    map: (names[x.guid] || {}).name || x.guid || "", image: "", side: ""
  }));
  const rest = allMaps.filter(n => !s.some(x => normMap(x.map) === normMap(n)));
  if (rest.length === 1) s.push({ action: "decider", team: "", map: rest[0], image: "", side: "" });
  return s;
}
let faceitAway = "";
async function faceitFetch(path, key) {
  const opts = {};                                         // den Schlüssel setzt die App selbst ein
  if (K.SERVER) { faceitAway = "service"; return fetch("/api/faceit" + path, opts); }
  faceitAway = "direct";
  return fetch((path.startsWith("/data/") ? "https://open.faceit.com" : "https://api.faceit.com") + path, opts);
}
async function faceitLoad(muted) {
  const id = matchId($("faceitUrl").value), key = faceitKeySaved;
  if (!id) return faceitStatus("Kein gültiger Matchroom-Link.", "var(--red)");
  if (!key) return faceitStatus("Bitte zuerst den FACEIT API-Key eintragen und speichern.", "var(--red)");
  if (!muted) faceitStatus("Lade Daten von FACEIT …");
  let m;
  try {
    const r = await faceitFetch(`/data/v4/matches/${id}`, key);
    if (!r.ok) {
      return faceitStatus(r.status === 401 || r.status === 403 ? "FACEIT lehnt den API-Key ab (" + r.status + ")." + (faceitAway === "service" ? " Bitte einen „Server side“-Key verwenden." : "")
        : r.status === 404 ? "Match nicht gefunden." : "FACEIT-Fehler " + r.status, "var(--red)");
    }
    m = await r.json();
  } catch (e) {
    return faceitStatus("Keine Verbindung zu FACEIT – Internet prüfen (Details im Reiter Log).", "var(--red)");
  }
  const fa = (m.teams || {}).faction1 || {}, fb = (m.teams || {}).faction2 || {};
  if ($("faceitTeams").checked) {
    // Kürzel aus dem Turnier übernehmen, wenn das Team dort bekannt ist – sonst leeren (gehörte zum alten Team)
    const shortOf = f => ((tour().teams || []).find(t => t.faceitId && t.faceitId === f.faction_id) || {}).short || "";
    Z.teams.a.name = fa.name || fa.nickname || Z.teams.a.name; Z.teams.a.logo = fa.avatar || ""; Z.teams.a.short = shortOf(fa);
    Z.teams.b.name = fb.name || fb.nickname || Z.teams.b.name; Z.teams.b.logo = fb.avatar || ""; Z.teams.b.short = shortOf(fb);
  }
  if ($("faceitPlayers").checked) {
    const fromFaceit = p => ({ name: p.nickname || "", real: "", image: p.avatar || "", level: p.game_skill_level || p.skill_level || 0 });
    Z.players.a = (fa.roster || fa.players || []).map(fromFaceit);
    Z.players.b = (fb.roster || fb.players || []).map(fromFaceit);
  }
  if ($("faceitVeto").checked) {
    const ents = (((m.voting || {}).map || {}).entities) || [];
    const names = {};
    ents.forEach(e => { const n = e.name || e.class_name; [e.guid, e.game_map_id, e.class_name, e.name].forEach(k => { if (k) names[k] = { name: n, image: e.image_lg || e.image_sm || "" }; }); });
    ents.forEach(e => {
      const n = e.name || e.class_name;
      let p = Z.mapPool.find(x => normMap(x.name) === normMap(n));
      if (!p) Z.mapPool.push(p = { name: n, image: "" });
      if (!p.image && (e.image_lg || e.image_sm)) p.image = e.image_lg || e.image_sm;
    });
    if (m.best_of && Z.vetoPresets["bo" + m.best_of]) Z.veto.format = "bo" + m.best_of;
    if (Z.veto.source === "faceit") {
      const all = ents.map(e => e.name || e.class_name);
      let s = null;
      try {
        const h = await faceitFetch(`/democracy/v1/match/${id}/history`, "");
        if (h.ok) s = vetoOffHistory(await h.json(), names, all);
      } catch (e) { /* Veto-Verlauf nicht erreichbar – nur Picks */ }
      if (!s) {
        s = presetSteps(Z.veto.format);
        const picks = ((((m.voting || {}).map || {}).pick) || []).map(g => (names[g] || {}).name || g);
        const pickPlaces = s.filter(x => x.action !== "ban");
        picks.forEach((p, i) => { if (pickPlaces[i]) pickPlaces[i].map = p; });
      }
      // Map-Namen wie im eigenen Pool schreiben (z. B. „Dust2" → „Dust II")
      s.forEach(x => { const p = Z.mapPool.find(m => normMap(m.name) === normMap(x.map)); if (p) x.map = p.name; });
      Z.veto.steps = s;
    }
  }
  everything(); send();
  faceitStatus(`✓ ${fa.name || "Team 1"} vs ${fb.name || "Team 2"} · Bo${m.best_of || "?"} · ${m.status || ""} · ${new Date().toLocaleTimeString("de-DE")}`, "var(--ok)");
}
$("faceitLoad").onclick = async () => {
  const custom = [];
  if ($("faceitTeams").checked && (Z.teams.a.name !== K.DEFAULT.teams.a.name || Z.teams.b.name !== K.DEFAULT.teams.b.name)) custom.push(`Teams „${Z.teams.a.name}“ und „${Z.teams.b.name}“ samt Logos`);
  if ($("faceitPlayers").checked && ((Z.players.a || []).length || (Z.players.b || []).length)) custom.push("die eingetragenen Spieler");
  if ($("faceitVeto").checked && Z.veto.source === "faceit" && vetoHasMaps()) custom.push("das aktuelle Map-Veto");
  if (custom.length && !await confirmDialog({ title: "Daten von FACEIT übernehmen?", text: "Diese Einträge werden durch die Daten aus dem Matchroom ersetzt:", list: custom, button: "Übernehmen" })) return;
  faceitLoad(false);
};
setInterval(() => { if ($("faceitAuto").checked) faceitLoad(true); }, 15000);

/* ---------- Kameras & Quellen ---------- */
const SLOTS = [["c1", "Caster 1"], ["c2", "Caster 2"], ["guest", "Interview-Gast"], ["content", "Clips / Browser-Rahmen"],
  ["c3", "Caster 3", "more"], ["p3", "Person 3", "more"], ["p4", "Person 4", "more"],
  ...[1, 2, 3, 4, 5, 6].map(i => ["v" + i, "Zuschauer " + i, "more"])];          // „more“: unter „Weitere Kameras“
let cameras = [];
async function devicesSearch(ask) {
  const md = navigator.mediaDevices;
  if (!md || !md.enumerateDevices) { $("devicesStatus").textContent = "Dieser Browser erlaubt keinen Gerätezugriff."; return; }
  try {
    let g = await md.enumerateDevices();
    if (ask && !g.some(d => d.kind === "videoinput" && d.label)) {
      const s = await md.getUserMedia({ video: true }); s.getTracks().forEach(t => t.stop());
      g = await md.enumerateDevices();
    }
    cameras = g.filter(d => d.kind === "videoinput" && d.label);
    $("devicesStatus").textContent = cameras.length ? `${cameras.length} Gerät(e) gefunden` : (ask ? "Keine Kamera gefunden." : "");
  } catch (e) { $("devicesStatus").textContent = "Kein Zugriff erlaubt (" + (e.name || e) + ")."; }
  sourcesDraw();
}
$("devicesSearch").onclick = () => devicesSearch(true);
// Videos aus dem Videos-Ordner für die Quellenart „Video“ (einmal laden, „Ordner neu lesen“ in Setup → Hintergrund lädt neu)
let sourceVideos = null;
async function sourceVideosLoad() {
  try { sourceVideos = ((await (await fetch("/api/videos", { cache: "no-store" })).json()).videos || []).filter(v => !v.error).map(v => v.name); }
  catch (err) { sourceVideos = []; }
  sourcesDraw();
}
function sourcesDraw() {
  const box = $("sources"); box.innerHTML = "";
  Z.sources = Z.sources || {};
  const more = document.createElement("details"); more.className = "sources-more"; more.open = !!ui.sourcesMore;
  more.innerHTML = `<summary>Weitere Kameras – Caster 3, Person 3/4, Zuschauer 1–6</summary><div class="list"></div>`;
  more.ontoggle = () => { ui.sourcesMore = more.open; uiSave(); };
  SLOTS.forEach(([k, name, group]) => {
    const Q = Z.sources[k] = Object.assign({ type: "empty", url: "", device: "", deviceName: "", audio: true, mirror: false, adjust: k === "content" ? "whole" : "fill", image: "" }, Z.sources[k] || {});
    const d = document.createElement("div"); d.className = "source-box";
    const types = [["empty", "Leer (OBS-Quelle darüber)"], ["link", "VDO.Ninja / Link"], ["device", "Gerät (Webcam/Capture)"], ["image", "Bild"], ["video", "Video (Videos-Ordner)"]];
    d.innerHTML = `<h3>${name}<select>${types.map(([v, n]) => `<option value="${v}"${v === Q.type ? " selected" : ""}>${n}</option>`).join("")}</select></h3><div class="fields" style="display:grid;gap:8px"></div>`;
    d.querySelector("select").onchange = ev => { Q.type = ev.target.value; sourcesDraw(); send(); };
    const f = d.querySelector(".fields");
    const toggleSwitch = (field, text) => {
      const l = document.createElement("label"); l.className = "toggleSwitch";
      const i = document.createElement("input"); i.type = "checkbox"; i.checked = !!Q[field];
      i.onchange = () => { Q[field] = i.checked; send(); };
      l.append(i, text); return l;
    };
    const rendering = () => {
      const l = document.createElement("label"); l.textContent = "Darstellung";
      l.insertAdjacentHTML("beforeend", modeSelect(Q.adjust));
      l.querySelector("select").onchange = ev => { Q.adjust = ev.target.value; send(); };
      return l;
    };
    if (Q.type === "link") {
      const l = document.createElement("label"); l.textContent = "VDO.Ninja-View-Link, Stream-ID oder beliebiger Link";
      const i = document.createElement("input"); i.type = "text"; i.value = Q.url; i.placeholder = "https://vdo.ninja/?view=abc123  oder  abc123";
      i.oninput = () => { Q.url = i.value; clearTimeout(i._t); i._t = setTimeout(send, 500); };
      l.appendChild(i); f.appendChild(l);
      f.insertAdjacentHTML("beforeend", `<p class="small">Bei VDO.Ninja werden <code>&amp;cleanoutput</code>, bei „Füllen" <code>&amp;cover</code> und ohne Ton <code>&amp;noaudio</code> automatisch ergänzt.</p>`);
      const r = document.createElement("div"); r.className = "line"; r.append(toggleSwitch("audio", "Ton"), rendering()); f.appendChild(r);
    }
    if (Q.type === "device") {
      const l = document.createElement("label"); l.textContent = "Gerät";
      const s = document.createElement("select");
      s.appendChild(new Option(cameras.length ? "– wählen –" : "– erst „Geräte suchen“ –", ""));
      cameras.forEach(c => s.appendChild(new Option(c.label, c.deviceId, false, c.label === Q.deviceName)));
      if (Q.deviceName && !cameras.some(c => c.label === Q.deviceName)) s.appendChild(new Option(Q.deviceName, Q.device, false, true));
      s.onchange = () => { const c = cameras.find(x => x.deviceId === s.value); Q.device = s.value; Q.deviceName = c ? c.label : ""; send(); };
      l.appendChild(s); f.appendChild(l);
      const r = document.createElement("div"); r.className = "line"; r.append(toggleSwitch("audio", "Mikrofon-Ton"), toggleSwitch("mirror", "Spiegeln"), rendering()); f.appendChild(r);
      f.insertAdjacentHTML("beforeend", `<p class="small">In OBS muss dafür der Kamerazugriff für Browserquellen erlaubt sein – siehe Anleitung (README).</p>`);
    }
    if (Q.type === "video") {                                // eigenes Video, z. B. für die eigene Contentpause (DACH)
      const l = document.createElement("label"); l.textContent = "Video";
      const s = document.createElement("select");
      s.appendChild(new Option(sourceVideos ? (sourceVideos.length ? "– wählen –" : "– keine Videos im Ordner –") : "lädt …", ""));
      themeVideoFilter(sourceVideos || []).forEach(n => s.appendChild(new Option(n, "media/videos/" + n, false, Q.video === "media/videos/" + n)));
      if (Q.video && !(sourceVideos || []).some(n => Q.video === "media/videos/" + n)) s.appendChild(new Option(Q.video.replace(/^media\/videos\//, ""), Q.video, false, true));
      s.onchange = () => { Q.video = s.value; send(); };
      l.appendChild(s); f.appendChild(l);
      if (Q.loop === undefined) Q.loop = true;
      const r = document.createElement("div"); r.className = "line"; r.append(toggleSwitch("audio", "Ton"), toggleSwitch("loop", "Schleife"), rendering()); f.appendChild(r);
      if (!sourceVideos) sourceVideosLoad();
    }
    if (Q.type === "image") {
      const r = document.createElement("div"); r.className = "image-row";
      r.innerHTML = `<div class="image-preview" style="width:96px"></div><button class="button">Bild wählen …</button><input type="file" accept="image/*" hidden>`;
      const v = r.querySelector(".image-preview"), b = r.querySelector("button"), inp = r.querySelector("input");
      if (Q.image) v.style.backgroundImage = K.cssUrl(Q.image);
      b.onclick = () => inp.click();
      inp.onchange = async () => { if (!inp.files[0]) return; Q.image = (await imageForArea(inp.files[0], [1024, 576])).image; sourcesDraw(); send(); };
      f.append(r, rendering());
    }
    (group === "more" ? more.querySelector(".list") : box).appendChild(d);
  });
  box.appendChild(more);
}
