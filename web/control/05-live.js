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
// Team-Bibliothek: Teams mit Logo, Farben und Spielern auf diesem PC (eigene Datenbank, nicht Teil der Sendung)
const TEAM_DB = (() => {
  let db;
  const openDb = () => db ? Promise.resolve(db) : new Promise((ok, no) => {
    const r = indexedDB.open("cast-teams", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("t", { keyPath: "name" });
    r.onsuccess = () => ok(db = r.result); r.onerror = () => no(r.error);
  });
  const tx = (mode, f) => openDb().then(d => new Promise((ok, no) => {
    const t = d.transaction("t", mode), r = f(t.objectStore("t"));
    t.oncomplete = () => ok(r && r.result); t.onerror = () => no(t.error);
  }));
  return { all: () => tx("readonly", s => s.getAll()), set: entry => tx("readwrite", s => s.put(entry)), erase: name => tx("readwrite", s => s.delete(name)) };
})();
async function teamLibDraw(selection) {
  let list = [];
  try { list = await TEAM_DB.all(); } catch (e) { $("teamLibStatus").textContent = "Die Team-Bibliothek ist in diesem Browser nicht verfügbar."; }
  list.sort((a, b) => a.name.localeCompare(b.name));
  const s = $("teamLib"); s.innerHTML = "";
  if (!list.length) s.appendChild(new Option("– noch keine –", ""));
  list.forEach(x => s.appendChild(new Option(x.name, x.name, false, x.name === selection)));
  ["teamLibA", "teamLibB", "teamLibDelete"].forEach(id => $(id).disabled = !list.length);
}
async function teamLibSave(k) {
  const t = Z.teams[k], name = (t.name || "").trim();
  if (!name) { $("teamLibStatus").textContent = "Erst einen Teamnamen eintragen."; return; }
  const team = K.clone(t); delete team.score;
  try { await TEAM_DB.set({ name, team, players: K.clone((Z.players || {})[k] || []), date: Date.now() }); $("teamLibStatus").textContent = `✓ „${name}“ gespeichert`; teamLibDraw(name); }
  catch (e) { $("teamLibStatus").textContent = "Speichern fehlgeschlagen: " + (e.message || e); }
}
async function teamLibLoad(k) {
  const name = $("teamLib").value; if (!name) return;
  const entry = (await TEAM_DB.all()).find(x => x.name === name); if (!entry) return;
  Z.teams[k] = Object.assign({}, entry.team, { score: Z.teams[k].score || 0 });
  Z.players = Z.players || {}; Z.players[k] = K.clone(entry.players || []);
  teamDraw(k); playersDraw(k); mbarDraw(); send();
  $("teamLibStatus").textContent = `✓ „${name}“ ist jetzt Team ${k.toUpperCase()}`;
}
$("teamLibSaveA").onclick = () => teamLibSave("a"); $("teamLibSaveB").onclick = () => teamLibSave("b");
$("teamLibA").onclick = () => teamLibLoad("a"); $("teamLibB").onclick = () => teamLibLoad("b");
$("teamLibDelete").onclick = async () => {
  const name = $("teamLib").value; if (!name) return;
  if (!await confirmDialog({ title: `„${name}“ aus der Bibliothek löschen?`, text: "Die Teams im laufenden Match bleiben, wie sie sind.", button: "Löschen" })) return;
  await TEAM_DB.erase(name); teamLibDraw(); $("teamLibStatus").textContent = `„${name}“ gelöscht.`;
};
teamLibDraw();

/* ---------- Spieltag: Spiele des Tages nacheinander laden ---------- */
function matchday() { const D = ensure(Z, "matchday", { list: [], current: "" }); if (!Array.isArray(D.list)) D.list = []; return D; }
const mdStatus = s => { $("mdStatus").textContent = s; };
const mdId = () => "md" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
// offene Turnierspiele (beide Teams stehen fest, noch nicht fertig)
function mdTourGames() {
  const T = tour(), B = K.tournamentBuild(T, CastI18n.language);
  const named = (list, title) => list.map(m => Object.assign({ caption: m.title || title || "" }, m));
  const all = [...B.rounds.flatMap(r => named(r.matches, r.title)), ...B.bottom.flatMap(r => named(r.matches, r.title)), ...(B.finale ? named([B.finale], "Grand Final") : []), ...B.groups.flatMap(g => named(g.matches, g.name))];
  return all.filter(m => m.a && m.b && m.a !== "BYE" && m.b !== "BYE" && !m.done);
}
function mdFromTour(id) {
  const t = tour().teams.find(x => x.id === id) || {};
  return { name: t.name || "", short: t.short || "", logo: t.logo || "", players: (t.players || []).map(n => ({ name: n, real: "", image: "", level: 0 })) };
}
async function mdDraw() {
  const D = matchday(), box = $("mdList"), T = tour(), name = id => ((T.teams.find(x => x.id === id) || {}).name || "?");
  box.innerHTML = D.list.length ? "" : `<span class="small">Noch keine Spiele – unten aus dem Turnier, der Team-Bibliothek oder dem aktuellen Match hinzufügen.</span>`;
  const next = D.list.find(x => !x.done && x.id !== D.current);
  D.list.forEach((x, i) => {
    const z = document.createElement("div"), live = x.id === D.current;
    const state = live ? ["live", "Läuft"] : x.done ? ["over", "Fertig"] : x === next ? ["next", "Als Nächstes"] : ["", "Geplant"];
    z.className = "md-row" + (live ? " live" : "") + (x.done ? " done" : "");
    const logo = t => `<i class="md-logo"${t.logo ? ` style="background-image:${esc(K.cssUrl(t.logo))}"` : ""}>${t.logo ? "" : esc((t.short || t.name || "?").slice(0, 3).toUpperCase())}</i>`;
    z.innerHTML = `<input type="text" class="md-time" placeholder="Zeit" aria-label="Zeit" value="${esc(x.time || "")}">
      <div class="md-teams">${logo(x.a)}<b>${esc(x.a.name || "?")}</b><span class="small">vs</span><b>${esc(x.b.name || "?")}</b>${logo(x.b)}</div>
      <span class="state ${state[0]}">${state[1]}</span>
      <button class="button${live ? "" : " main"}" data-a="load"${live ? " disabled" : ""}>Laden</button>
      <button class="button" data-a="up" aria-label="nach oben">${icon("up")}</button><button class="button" data-a="down" aria-label="nach unten">${icon("down")}</button>
      <button class="x" data-a="away" aria-label="Entfernen">${icon("close")}</button>`;
    z.querySelector(".md-time").oninput = ev => { x.time = ev.target.value; laterSend(); };
    z.querySelector("[data-a=load]").onclick = () => mdLoad(x.id);
    z.querySelector("[data-a=up]").onclick = () => { if (i > 0) { [D.list[i - 1], D.list[i]] = [D.list[i], D.list[i - 1]]; mdDraw(); send(); } };
    z.querySelector("[data-a=down]").onclick = () => { if (i < D.list.length - 1) { [D.list[i + 1], D.list[i]] = [D.list[i], D.list[i + 1]]; mdDraw(); send(); } };
    z.querySelector("[data-a=away]").onclick = () => remove(D.list, i, `Spiel „${x.a.name} vs ${x.b.name}“`, () => { if (D.current === x.id) D.current = ""; mdDraw(); });
    box.appendChild(z);
  });
  $("mdNext").disabled = !next;
  $("mdNext").textContent = next ? `Nächstes Spiel laden: ${next.a.name} vs ${next.b.name}` : "Nächstes Spiel laden";
  // Auswahl: offene Turnierspiele, die noch nicht auf der Liste stehen
  const used = new Set(D.list.map(x => x.gameId).filter(Boolean)), games = mdTourGames().filter(m => !used.has(m.id));
  $("mdTourGame").innerHTML = games.length ? games.map(m => `<option value="${esc(m.id)}">${esc(m.caption)}: ${esc(name(m.a))} vs ${esc(name(m.b))}</option>`).join("") : `<option value="">– keine offenen Spiele –</option>`;
  $("mdAddTour").disabled = $("mdAddAllTour").disabled = !games.length;
  let lib = [];
  try { lib = await TEAM_DB.all(); } catch (e) {}
  lib.sort((a, b) => a.name.localeCompare(b.name));
  ["mdLibA", "mdLibB"].forEach(id => { const s = $(id), before = s.value; s.innerHTML = lib.length ? lib.map(x => `<option${x.name === before ? " selected" : ""}>${esc(x.name)}</option>`).join("") : `<option value="">– noch keine –</option>`; });
  $("mdAddLib").disabled = lib.length < 1;
}
// Ergebnis des laufenden Spiels ins Turnier (nur selbst eingetragene Turniere – FACEIT liefert seine Ergebnisse selbst)
function mdResultToTour(x) {
  const T = tour(), a = +Z.teams.a.score || 0, b = +Z.teams.b.score || 0;
  if (!x || !x.gameId || T.gamesSource === "faceit" || (!a && !b)) return false;
  T.res[x.gameId] = Object.assign({}, T.res[x.gameId], { a, b, done: a !== b });
  return true;
}
async function mdLoad(id) {
  const D = matchday(), x = D.list.find(e => e.id === id); if (!x) return;
  const started = (+Z.teams.a.score || 0) + (+Z.teams.b.score || 0) > 0 || steps().some(s => s.map);
  if (started && !await confirmDialog({ title: `„${x.a.name} vs ${x.b.name}“ laden?`, text: "Spielstand, Veto und Serie des aktuellen Matches werden geleert. Stammt es aus dem Turnier, geht sein Ergebnis vorher ins Turnier.", button: "Laden" })) return;
  const before = D.list.find(e => e.id === D.current), toTour = mdResultToTour(before);
  if (before) before.done = true;
  ["a", "b"].forEach(k => {
    const t = x[k];
    Z.teams[k] = Object.assign({}, Z.teams[k], { name: t.name || "", short: t.short || "", logo: t.logo || "", score: 0 });
    Z.players = Z.players || {}; Z.players[k] = K.clone(t.players || []);
  });
  Z.teams.result = false;
  Z.veto.steps = presetSteps(Z.veto.format);
  D.current = x.id; x.done = false;
  teamDraw("a"); teamDraw("b"); playersDraw("a"); playersDraw("b"); vetoDraw(); seriesDraw(); mbarDraw(); tournamentDraw(); mdDraw(); send();
  mdStatus(`✓ Jetzt: ${x.a.name} vs ${x.b.name}${toTour ? " · Ergebnis des letzten Spiels steht im Turnier" : ""}`);
}
$("mdNext").onclick = () => { const D = matchday(), next = D.list.find(x => !x.done && x.id !== D.current); if (next) mdLoad(next.id); };
$("mdClear").onclick = async () => { const D = matchday(); if (!D.list.length || !await confirmDialog({ title: "Spieltag leeren?", text: "Die Liste der Spiele wird geleert. Das aktuelle Match bleibt, wie es ist.", button: "Leeren" })) return; D.list = []; D.current = ""; mdDraw(); send(); };
const mdAddGame = m => matchday().list.push({ id: mdId(), time: "", gameId: m.id, a: mdFromTour(m.a), b: mdFromTour(m.b), done: false });
$("mdAddTour").onclick = () => { const m = mdTourGames().find(g => g.id === $("mdTourGame").value); if (!m) return; mdAddGame(m); mdDraw(); send(); mdStatus("✓ Spiel hinzugefügt."); };
$("mdAddAllTour").onclick = () => { const used = new Set(matchday().list.map(x => x.gameId)), l = mdTourGames().filter(m => !used.has(m.id)); l.forEach(mdAddGame); mdDraw(); send(); mdStatus(`✓ ${l.length} Spiele hinzugefügt.`); };
$("mdAddLib").onclick = async () => {
  const lib = await TEAM_DB.all(), pick = n => { const e = lib.find(x => x.name === n); return e ? Object.assign({ name: e.name, short: e.team.short || "", logo: e.team.logo || "" }, { players: K.clone(e.players || []) }) : null; };
  const a = pick($("mdLibA").value), b = pick($("mdLibB").value); if (!a || !b) return;
  if (a.name === b.name) return mdStatus("Bitte zwei verschiedene Teams wählen.");
  matchday().list.push({ id: mdId(), time: "", a, b, done: false }); mdDraw(); send(); mdStatus("✓ Spiel hinzugefügt.");
};
$("mdAddCurrent").onclick = () => {
  const D = matchday(), team = k => ({ name: Z.teams[k].name || "", short: Z.teams[k].short || "", logo: Z.teams[k].logo || "", players: K.clone((Z.players || {})[k] || []) });
  const x = { id: mdId(), time: "", a: team("a"), b: team("b"), done: false };
  D.list.push(x); if (!D.current) D.current = x.id; mdDraw(); send(); mdStatus("✓ Aktuelles Match steht auf dem Spieltag.");
};
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
const SPONSOR_SCENES = [["intro", "Intro"], ["pause", "Pause"], ["end", "Ende"], ["cast-duo", "Cast Duo"], ["cast-solo", "Cast Solo"], ["cast-duo-interview", "Duo + Interview"], ["cast-solo-interview", "Solo + Interview"], ["cast-trio", "Cast Trio"], ["cast-trio-host", "Trio – Moderator groß"], ["cast-quad", "4 Personen"], ["ingame", "Ingame"]];
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
  // Szenen mit Sponsor-Kasten: Kacheln wie bei „Szenen & OBS“ (statt einer Reihe Schalter)
  const scenesBox = $("sponsorScenes"); scenesBox.innerHTML = "";
  const r = document.createElement("div"); r.className = "scene-pick-flat";
  SPONSOR_SCENES.forEach(([k, n]) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "scene-pick-chip"; b.dataset.scene = k;
    const on = () => (Z.sponsors.sceneList || {})[k] !== false;
    b.setAttribute("aria-pressed", on()); b.innerHTML = `${icon("check")}<span>${esc(n)}</span>`;
    b.onclick = () => { Z.sponsors.sceneList = Object.assign({}, Z.sponsors.sceneList, { [k]: !on() }); b.setAttribute("aria-pressed", on()); send(); };
    r.appendChild(b);
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
// über fetch (Schlüssel im Kopf der Anfrage) statt eines Links mit ?access= – der landete sonst im Download-Verlauf des Browsers
$("gsiCfgLoad").onclick = async () => {
  try {
    const r = await fetch("/api/gsi-cfg"); if (!r.ok) throw new Error(r.status);
    const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = "gamestate_integration_castoverlay.cfg";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (err) { $("gsiPath").textContent = "Datei konnte nicht geladen werden."; }
};
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
// Testdaten: ein kurzes Beispiel-Match (Runde für Runde) – geht NUR an die Vorschau dieser Seite, nie an den Server/Stream
let gsiDemoTimer = null;
function gsiDemoStop() { clearInterval(gsiDemoTimer); gsiDemoTimer = null; $("gsiDemo").innerHTML = icon("play") + "Testdaten abspielen"; }
$("gsiDemo").onclick = () => {
  if (gsiDemoTimer) { gsiDemoStop(); return; }
  const names = { a: ["alpha_1", "alpha_2", "alpha_3", "alpha_4", "alpha_5"], b: ["bravo_1", "bravo_2", "bravo_3", "bravo_4", "bravo_5"] };
  let round = 0;
  const step = () => {
    if (round > 24) { gsiDemoStop(); return; }
    const ctScore = Math.round(round * .55), tScore = round - ctScore;
    const line = (n, side, i) => ({ id: side + i, name: n, side, k: Math.round(round * (.9 - i * .12) + i), d: Math.round(round * .6 + (4 - i)), a: i + Math.round(round / 5),
      mvps: Math.round(round / (6 + i)), adr: 92 - i * 11 + (round % 5), hs: 55 - i * 6, hp: (round + i) % 3 ? 100 - i * 13 : 0, money: 4200 + i * 650, equipment: 4700 - i * 300, roundKills: (round + i) % 4 === 0 ? 2 : 0 });
    const live = { time: Date.now(), source: "demo", map: "de_mirage", phase: "live", round, roundPhase: round % 2 ? "live" : "freezetime", bomb: round % 3 === 2 ? "planted" : "",
      ct: { name: Z.teams.a.name || "Team A", score: ctScore }, t: { name: Z.teams.b.name || "Team B", score: tScore }, sideA: "CT", observed: "CT0",
      players: [...names.a.map((n, i) => line(n, "CT", i)), ...names.b.map((n, i) => line(n, "T", i))] };
    try { $("frame").contentWindow.postMessage({ cast: "live", live }, location.origin); } catch (err) {}
    round++;
  };
  step(); gsiDemoTimer = setInterval(step, 1500);
  $("gsiDemo").innerHTML = icon("pause") + "Testdaten stoppen";
};
function liveShow() {
  if (liveFresh() !== liveShow.fresh) { liveShow.fresh = liveFresh(); scenesDraw(); }   // Szenen-Knöpfe: „CS2“-Hinweis an/aus
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
  setHtml($("gsiTable"), d ? team("a", d.sideA) + team("b", sideB) : "");     // bis zu 2×/s – nur bei Änderung
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
  $("ubDuration").textContent = ((Z.broadcast.duration || 0) / 1000).toFixed(1).replace(".", CastI18n.language === "de" ? "," : ".") + " s";
  $("ubSlider").oninput = () => { $("ubDuration").textContent = (+$("ubSlider").value / 1000).toFixed(1).replace(".", CastI18n.language === "de" ? "," : ".") + " s"; };
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
    const on = K.gfxVisible(x, Date.now(), Z.broadcast.scene); if (k.classList.contains("on") !== on) k.classList.toggle("on", on);
  });
}, 1000);
document.querySelectorAll("[data-gfx-new]").forEach(b => b.onclick = () => {
  const type = b.dataset.gfxNew, id = "e" + Date.now().toString(36);
  Z.graphics.push({ id, type, pos: GFX_DEFAULT[type], title: type === "lowerthird" ? "NAME" : "", text: type === "hint" ? "Gleich geht's weiter" : "",
    arrangement: "stacked", guest: false, map: "", fact: -1, seconds: 12, duration: +$("gfxDuration").value || 0, repeat: 0, sceneList: [], on: false, until: 0, start: 0 });
  gfxOpen.add(id);
  graphicsDraw(); send();
});

/* ---------- Panel der Szene: was die laufende Szene gerade braucht ----------
   Zeigt in Live die Felder, die zur Szene im Programm gehören – z. B. bei „Map-Veto" das Veto zum Klicken,
   bei Ingame Spielstand und Serie. Jede Szene hat Vorgaben (PANEL_DEFAULTS); „Felder" ändert sie,
   gemerkt in ui.panels (diese Oberfläche, nicht Teil der Sendung). Die Felder bedienen dieselben Daten wie
   Match und Setup (Z.veto, Z.teams, Z.timer, Z.texts) – jede Änderung zeichnet beide Stellen neu. */
const PANEL_FIELDS = [["veto", "Map-Veto"], ["over", "Über dem Spiel"], ["score", "Spielstand"], ["timer", "Timer"], ["series", "Serie"],
  ["texts", "Texte im Overlay"], ["sponsor", "Sponsoren"], ["ads", "Werbung"], ["slides", "Folien"], ["group", "Gruppe"], ["note", "Notiz"]];
const PANEL_DEFAULTS = {
  "intro": ["timer", "texts", "sponsor"], "cast-duo": ["timer", "texts", "note"], "cast-solo": ["timer", "texts", "note"],
  "cast-duo-clips": ["note"], "cast-solo-clips": ["note"], "cast-duo-interview": ["series", "texts", "note"], "cast-solo-interview": ["series", "texts", "note"],
  "cast-trio": ["timer", "texts", "note"], "cast-trio-host": ["timer", "texts", "note"], "cast-quad": ["series", "texts", "note"], "viewers": ["texts", "note"], "viewers-cast": ["texts", "note"], "teams": ["slides", "note"],
  "map-veto": ["veto", "series"], "players": ["series", "note"], "series": ["series", "score"], "sponsors": ["sponsor", "ads"], "ads": ["ads", "note"],
  "ingame": ["over", "score", "series", "note"], "pause": ["timer", "texts", "sponsor", "ads"], "end": ["series", "texts", "sponsor"],
  "scoreboard": ["score", "series"], "team-a": ["score", "series"], "team-b": ["score", "series"], "h2h": ["score", "series"], "bracket": ["group", "note"],
  "dach-pause": ["ads", "note"], "dach-content": ["ads", "note"], "dach-owncontent": ["ads", "note"]
};
let sceneToolsShown = "";
const panelList = k => (ui.panels && ui.panels[k]) || PANEL_DEFAULTS[k] || [];
const panelChanged = k => !!(ui.panels && ui.panels[k]);
function sceneNow() {
  if (onSource()) return (Z.broadcast || {}).scene || "";
  const list = sceneCfg().list, k = Object.keys(list).find(x => list[x].obs && list[x].obs === currentScene);
  return k || "";
}
function sceneToolsDraw() {
  const k = sceneNow(), list = panelList(k);
  $("sceneToolsName").textContent = k ? audioSceneTitle(k) : "–";
  $("sceneToolsHint").textContent = !k ? "Keine Szene im Programm." : list.length ? (panelChanged(k) ? "angepasst" : "Vorgabe") : "Für diese Szene gibt es hier nichts einzustellen.";
  $("sceneToolsOther").hidden = !k || !!list.length;
  $("panelFieldsButton").hidden = !k;
  const box = $("panelFields");
  PANEL_FIELDS.forEach(([f]) => { const e = box.querySelector(`[data-panel="${f}"]`); e.hidden = !list.includes(f); });
  list.forEach(f => { const e = box.querySelector(`[data-panel="${f}"]`); if (e) box.appendChild(e); });   // Reihenfolge wie gewählt
  if (list.includes("veto")) vetoDraw();
  panelValues();
  $("pNote").value = (ui.notes || {})[k] || "";
}
// Werte der Felder: Spielstand, Timer, Serie, Sponsoren (aufgerufen von mbarDraw und beim Szenenwechsel)
function panelValues() {
  if (!$("pNameA")) return;
  setText($("pNameA"), Z.teams.a.name || "Team A"); setText($("pNameB"), Z.teams.b.name || "Team B");
  setText($("pScoreA"), Z.teams.a.score || 0); setText($("pScoreB"), Z.teams.b.score || 0);
  setText($("pTimer"), K.time(K.timerRest(Z.timer))); setText($("pStart"), Z.timer.running ? "Pause" : "Start");
  const series = $("mbarSeries") ? $("mbarSeries")._h || "" : "";
  setHtml($("pSeries"), series);
  if ($("pSeriesEmpty").hidden !== !!series) $("pSeriesEmpty").hidden = !!series;
  const names = sponsorEntries().map((x, i) => x.name || "Sponsor " + (i + 1)), key = names.join("\n");
  if ($("pSponsors")._k !== key) {
    $("pSponsors")._k = key; $("pSponsors").innerHTML = "";
    names.forEach((n, i) => { const b = document.createElement("button"); b.className = "button"; b.innerHTML = icon("play") + esc(n); b.onclick = () => sponsorShowgfx(i); $("pSponsors").appendChild(b); });
  }
  $("pSponsorsEmpty").hidden = !!names.length;
  slidesDraw(); overDraw(); groupDraw(); adsDraw();
}
/* ---------- Gruppe (Turnierbaum): nur eine Gruppe zeigen – Tabelle oder GSL, in derselben Szene ---------- */
function groupDraw() {
  if (!$("pGroup")) return;
  const T = Z.tournament || {}, B = K.tournamentBuild(T, CastI18n.language), groups = B.groups || [], cur = String(T.showGroup ?? "");
  const html = !groups.length ? `<p class="small">Gruppen gibt es nur bei Tabelle oder GSL (Turnier → Format).</p>`
    : [["", "Alle"], ...groups.map((g, i) => [String(i), g.name])].map(([v, n]) =>
      `<button class="button${v === cur ? " main" : ""}" data-group="${v}" aria-pressed="${v === cur}">${esc(n)}</button>`).join("");
  if ($("pGroup")._h === html) return;
  $("pGroup")._h = html; $("pGroup").innerHTML = html;
  $("pGroup").querySelectorAll("[data-group]").forEach(b => b.onclick = () => {
    tour().showGroup = b.dataset.group; send(); groupDraw(); mbarDraw();
    if ($("tourShowGroup")) $("tourShowGroup").value = b.dataset.group;
  });
}
/* ---------- Über dem Spiel (Ingame): Scoreboard, Team A/B, Head-to-Head … über dem Spielbild, ohne Szenenwechsel ---------- */
function overDraw() {
  if (!$("pOver")) return;
  const U = Z.broadcast.overGame || {}, on = overGameVisible() ? U.scene : "", d = Z.broadcast.overGameDuration ?? 15;
  const ingame = Z.broadcast.scene === "ingame", key = JSON.stringify([on, ingame, d]);
  if ($("pOver")._k === key) return;
  $("pOver")._k = key;
  $("pOver").innerHTML = OVER_GAME.map(k => `<button class="button${k === on ? " main" : ""}" data-over="${k}" aria-pressed="${k === on}">${esc((OVERLAY_SCENES.find(([x]) => x === k) || [, k])[1])}</button>`).join("");
  $("pOver").querySelectorAll("[data-over]").forEach(b => b.onclick = () => {
    if (Z.broadcast.scene !== "ingame") sceneSwitch("ingame");
    overGameToggle(b.dataset.over); overDraw();
  });
  $("pOverHint").textContent = !ingame ? "nur in Ingame" : d > 0 ? `blendet nach ${d} s aus` : "bleibt stehen, bis du es ausschaltest";
}
setInterval(() => { if (Z.broadcast.overGame) overDraw(); }, 1000);       // abgelaufen → Knopf wieder aus
/* ---------- Teams-Vorstellung: Folien wählen, automatisch weiter, Werte aus dem Turnier ---------- */
// als Funktion (nicht const): panelValues kann schon beim Laden laufen, bevor diese Zeile erreicht ist
function tiSlides() { return [["a", tiName("a")], ["b", tiName("b")], ["compare", "Vergleich"]]; }
// fehlende Werte im vorhandenen Objekt ergänzen (nie ersetzen – sonst ändern Aufrufer eine Kopie, die nicht im Zustand hängt)
function teamIntroState() {
  const d = K.DEFAULT.teamIntro, I = Z.teamIntro = Z.teamIntro || K.clone(d);
  for (const k of Object.keys(d)) if (I[k] === undefined) I[k] = K.clone(d[k]);
  for (const k of Object.keys(d.slides)) if (I.slides[k] === undefined) I.slides[k] = true;
  for (const team of ["a", "b"]) { I.stats[team] = I.stats[team] || {}; for (const k of Object.keys(d.stats[team])) if (I.stats[team][k] === undefined) I.stats[team][k] = ""; }
  return I;
}
function tiOrder() { return tiSlides().map(([k]) => k).filter(k => teamIntroState().slides[k] !== false); }
// laufende Folie – dieselbe Rechnung wie im Overlay (cast.js → teamIntroSlide)
function tiCurrent() {
  const I = teamIntroState(), order = tiOrder();
  if (!order.length) return "";
  if (I.auto > 0 && I.started) return order[Math.floor(Math.max(0, Date.now() - I.started) / (I.auto * 1000)) % order.length];
  return order.includes(I.slide) ? I.slide : order[0];
}
function slidesDraw() {
  if (!$("pSlides")) return;
  const I = teamIntroState(), cur = tiCurrent(), order = tiOrder();
  const key = JSON.stringify([order, cur, I.auto, Z.teams.a.name, Z.teams.b.name]);
  if ($("pSlides")._k !== key) {
    $("pSlides")._k = key;
    $("pSlides").innerHTML = tiSlides().filter(([k]) => order.includes(k)).map(([k, n]) => `<button class="button${k === cur ? " main" : ""}" data-slide="${k}" aria-pressed="${k === cur}">${esc(n)}</button>`).join("") ||
      `<span class="small">Alle Folien sind aus – Match → Teams-Vorstellung.</span>`;
    $("pSlides").querySelectorAll("[data-slide]").forEach(b => b.onclick = () => tiShow(b.dataset.slide));
  }
  $("pSlidesAuto").checked = I.auto > 0;
  $("tiAuto").value = String(I.auto || 0);
  tiDraw();
}
// Folie zeigen; läuft „automatisch“, geht es ab dieser Folie weiter
function tiShow(k) {
  const I = teamIntroState(), i = tiOrder().indexOf(k);
  I.slide = k;
  if (I.auto > 0 && i >= 0) I.started = Date.now() - i * I.auto * 1000;
  send(); slidesDraw();
}
function tiAuto(seconds) {
  const I = teamIntroState(), i = Math.max(0, tiOrder().indexOf(tiCurrent()));
  I.auto = seconds; I.started = seconds > 0 ? Date.now() - i * seconds * 1000 : 0;
  if (seconds > 0) ui.tiAuto = seconds;
  uiSave(); send(); slidesDraw();
}
$("pSlidesAuto").onchange = () => tiAuto($("pSlidesAuto").checked ? (ui.tiAuto || 12) : 0);
$("tiAuto").onchange = () => tiAuto(+$("tiAuto").value || 0);
document.querySelectorAll(".ti-slide-on").forEach(c => c.addEventListener("change", () => setTimeout(slidesDraw, 0)));
setInterval(() => { if ((Z.teamIntro || {}).auto > 0) slidesDraw(); }, 1000);     // laufende Folie im Panel mitzeigen
/* ---------- Teams-Vorstellung (Match): Reiter Team A · Team B · Vergleich (2.16) ---------- */
// (Funktionen statt const: slidesDraw → tiDraw läuft schon beim Laden, bevor diese Zeilen erreicht sind)
function tiFields() { return [["seed", "Setzplatz"], ["winrate", "Siegquote"], ["matches", "Spiele"], ["streak", "Serie"], ["last", "Letzte 5"]]; }
function tiName(k) { return String(((teamIntroState().names) || {})[k] || "").trim() || Z.teams[k].name || (k === "a" ? "Team A" : "Team B"); }
// Werte desselben Teams im Turnier (Name oder Kürzel passt): Setzplatz = Reihenfolge der Teams, Statistik von FACEIT
function tiTourValues(k) {
  const T = tour(), norm = s => String(s || "").trim().toLowerCase();
  const name = norm(Z.teams[k].name), short = norm(Z.teams[k].short);
  const i = (T.teams || []).findIndex(t => norm(t.name) === name || (short && norm(t.short) === short));
  if (i < 0) return null;
  const t = T.teams[i], st = t.stats || {};
  return { name: t.name, seed: String(i + 1), winrate: st.winrate ? String(st.winrate) : "", matches: st.matches ? String(st.matches) : "",
           streak: st.series !== undefined && st.series !== "" ? String(st.series) : "", last: (st.last || []).slice(0, 5).map(x => x === "1" ? "S" : "N").join("") };
}
// Turnierwerte übernehmen – leere Turnierwerte lassen deine Eingabe stehen
function tiTake(k) {
  const v = tiTourValues(k); if (!v) return false;
  const S = teamIntroState().stats[k];
  tiFields().forEach(([f]) => { if (v[f]) S[f] = v[f]; });
  fieldsFill(); send(); tiDraw();
  return true;
}
function tiDraw() {
  if (!$("tiCompare")) return;
  const I = teamIntroState(), tab = ["a", "b", "compare"].includes(ui.tiTab) ? ui.tiTab : "a";
  document.querySelectorAll("[data-ti-tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.tiTab === tab));
  document.querySelectorAll("[data-ti-page]").forEach(p => { p.hidden = p.dataset.tiPage !== tab; });
  ["a", "b"].forEach(k => {
    const K2 = k.toUpperCase(), t = Z.teams[k], filled = tiFields().some(([f]) => String(I.stats[k][f] || "").trim());
    setText($("tiTab" + K2), tiName(k)); setText($("tiName" + K2), tiName(k)); setText($("tiCmp" + K2), tiName(k));
    const logo = $("tiLogo" + K2); setImage(logo, t.logo || ""); const words = tiName(k).split(/\s+/).filter(Boolean);
    setText(logo, t.logo ? "" : (t.short || (words.length > 1 ? words.map(w => w[0]).join("") : words[0] || "")).toUpperCase().slice(0, 3));
    const dot = document.querySelector(`[data-ti-tab="${k}"] .sub-dot`); dot.className = "sub-dot " + (I.slides[k] === false ? "" : filled ? "ok" : "wait");
    const rename = document.querySelector(`[data-ti-page="${k}"] .ti-rename`); if (I.names[k]) rename.hidden = false;
    // Letzte 5: fünf Felder, Klick = Sieg → Niederlage → leer (neuestes links)
    const form = [...String(I.stats[k].last || "").toUpperCase().replace(/W/g, "S").replace(/L/g, "N")].concat(["", "", "", "", ""]).slice(0, 5);
    const box = document.querySelector(`[data-ti-form="${k}"]`), html = form.map((c, i) =>
      `<button type="button" data-i="${i}" class="${c === "S" ? "s" : c === "N" ? "n" : ""}" aria-label="Spiel ${i + 1}: ${c === "S" ? "Sieg" : c === "N" ? "Niederlage" : "leer"}">${c === "S" ? "S" : c === "N" ? "N" : "–"}</button>`).join("");
    if (box._h !== html) {
      box._h = html; box.innerHTML = html;
      box.querySelectorAll("button").forEach(b => b.onclick = () => {
        const next = { "": "S", "-": "S", S: "N", N: "-" }, f = form.map(c => c || "-"); f[+b.dataset.i] = next[f[+b.dataset.i]];
        I.stats[k].last = f.join("").replace(/-+$/, ""); fieldsFill(); send(); tiDraw();
      });
    }
    // Turnier: eine Zeile mit den Werten von dort – abweichende gelb, „Übernehmen“ nur wenn etwas abweicht
    const line = document.querySelector(`[data-ti-tour="${k}"]`), v = (tour().teams || []).length ? tiTourValues(k) : null;
    let tourHtml = "";
    if ((tour().teams || []).length && !v) tourHtml = `<span class="state">Nicht im Turnier</span><span class="small">Name oder Kürzel passt zu keinem Team dort.</span>`;
    else if (v) {
      const diff = tiFields().filter(([f]) => v[f] && v[f] !== String(I.stats[k][f] || ""));
      tourHtml = `<span class="state ok">Turnier</span>` + tiFields().filter(([f]) => v[f]).map(([f, n]) => `<span>${esc(n)} <b class="${diff.some(([g]) => g === f) ? "diff" : ""}">${esc(v[f])}${f === "winrate" ? " %" : ""}</b></span>`).join("") +
        `<span class="grow"></span>` + (diff.length ? `<button type="button" class="button" data-ti-take="${k}">Übernehmen</button>` : `<span class="small">✓ übernommen</span>`);
    }
    line.classList.toggle("none", !v);
    if (line._h !== tourHtml) { line._h = tourHtml; line.innerHTML = tourHtml; line.hidden = !tourHtml; const b = line.querySelector("[data-ti-take]"); if (b) b.onclick = () => tiTake(k); }
  });
  document.querySelector('[data-ti-tab="compare"] .sub-dot').className = "sub-dot " + (I.slides.compare === false ? "" : "ok");
  const show = (k, f) => { const x = String(I.stats[k][f] || "").trim(); return !x ? "–" : f === "winrate" ? x.replace(/\s*%$/, "") + " %" : f === "seed" && !x.startsWith("#") ? "#" + x : x; };
  document.querySelectorAll("[data-ti-cmp]").forEach(e => { const [k, f] = e.dataset.tiCmp.split("."); setText(e, show(k, f)); });
  document.querySelectorAll(".ti-cmp-row[data-row]").forEach(r => r.classList.toggle("off", (I.rows || {})[r.dataset.row] === false));
}
document.querySelectorAll("[data-ti-tab]").forEach(b => b.onclick = () => { ui.tiTab = b.dataset.tiTab; uiSave(); tiDraw(); });
document.querySelectorAll("[data-ti-rename]").forEach(b => b.onclick = () => { const i = b.parentElement.querySelector(".ti-rename"); i.hidden = false; i.focus(); });
document.querySelectorAll('[data-area="team-intro"] [data-field]').forEach(e => e.addEventListener(e.type === "checkbox" ? "change" : "input", () => setTimeout(tiDraw, 0)));
setTimeout(tiDraw, 0);
$("pPlusA").onclick = () => mbarPoint("a", 1); $("pMinusA").onclick = () => mbarPoint("a", -1);
$("pPlusB").onclick = () => mbarPoint("b", 1); $("pMinusB").onclick = () => mbarPoint("b", -1);
$("pStart").onclick = () => $("mbarStart").click();
$("pPlus1").onclick = () => $("mbarPlus1").click(); $("pMinus1").onclick = () => $("mbarMinus1").click();
$("pNote").oninput = () => { const k = sceneNow(); if (!k) return; ui.notes = Object.assign({}, ui.notes, { [k]: $("pNote").value }); uiSave(); };
// „Felder": an/aus je Feld für die Szene im Programm, oder zurück auf die Vorgabe
function panelMenuDraw() {
  const k = sceneNow(), list = panelList(k), m = $("panelMenu");
  m.innerHTML = `<div class="small">Felder für „${esc(audioSceneTitle(k))}“</div>` +
    PANEL_FIELDS.map(([f, n]) => `<label class="toggleSwitch"><input type="checkbox" data-f="${f}"${list.includes(f) ? " checked" : ""}> ${esc(n)}</label>`).join("") +
    `<label class="toggleSwitch"><input type="checkbox" id="panelAuto"${ui.panelAuto !== false ? " checked" : ""}> Panel öffnet sich beim Szenenwechsel</label>` +
    `<button class="button" id="panelDefault"${panelChanged(k) ? "" : " disabled"}>Auf Vorgabe zurück</button>`;
  m.querySelectorAll("[data-f]").forEach(c => c.onchange = () => {
    const now = panelList(k).filter(f => f !== c.dataset.f);
    if (c.checked) now.push(c.dataset.f);
    ui.panels = Object.assign({}, ui.panels, { [k]: PANEL_FIELDS.map(([f]) => f).filter(f => now.includes(f)) });
    uiSave(); sceneToolsDraw(); panelMenuDraw(); panelTableDraw();
  });
  $("panelAuto").onchange = () => { ui.panelAuto = $("panelAuto").checked; uiSave(); panelTableDraw(); };
  $("panelDefault").onclick = () => { const p = Object.assign({}, ui.panels); delete p[k]; ui.panels = p; uiSave(); sceneToolsDraw(); panelMenuDraw(); panelTableDraw(); };
}
document.body.appendChild($("panelMenu"));                    // liegt über allem, egal in welchem Dock das Panel steckt
// Setup → Szenen-Panels: alle Szenen auf einen Blick (Zeile = Szene, Spalte = Feld)
function panelTableDraw() {
  const t = $("panelTable"); if (!t) return;
  t.innerHTML = `<thead><tr><th>Szene</th>${PANEL_FIELDS.map(([, n]) => `<th>${esc(n)}</th>`).join("")}<th></th></tr></thead><tbody></tbody>`;
  const body = t.querySelector("tbody");
  OVERLAY_SCENES.forEach(([k]) => {
    const list = panelList(k), tr = document.createElement("tr");
    tr.innerHTML = `<th class="${panelChanged(k) ? "changed" : ""}">${esc(audioSceneTitle(k))}</th>` +
      PANEL_FIELDS.map(([f, n]) => `<td><input type="checkbox" class="cell-check" data-f="${f}"${list.includes(f) ? " checked" : ""} title="${esc(n)}" aria-label="${esc(n)}"></td>`).join("") +
      `<td><button class="tool" title="Auf Vorgabe" aria-label="Auf Vorgabe"${panelChanged(k) ? "" : " hidden"}>${icon("undo")}</button></td>`;
    tr.querySelectorAll("[data-f]").forEach(c => c.onchange = () => {
      const now = panelList(k).filter(f => f !== c.dataset.f); if (c.checked) now.push(c.dataset.f);
      ui.panels = Object.assign({}, ui.panels, { [k]: PANEL_FIELDS.map(([f]) => f).filter(f => now.includes(f)) });
      uiSave(); panelTableDraw(); if (k === sceneNow()) sceneToolsDraw();
    });
    tr.querySelector("button").onclick = () => { const p = Object.assign({}, ui.panels); delete p[k]; ui.panels = p; uiSave(); panelTableDraw(); if (k === sceneNow()) sceneToolsDraw(); };
    body.appendChild(tr);
  });
  $("panelAutoSetup").checked = ui.panelAuto !== false;
}
$("panelAutoSetup").onchange = () => { ui.panelAuto = $("panelAutoSetup").checked; uiSave(); };
setTimeout(panelTableDraw, 0);                               // nach dem Laden aller Teile (Szenennamen kommen auch aus 12-dach)
const panelMenuToggle = (open, button) => {
  $("panelMenu").hidden = !open;
  if (open) { panelMenuDraw(); beside(button || $("panelFieldsButton"), $("panelMenu"), true); }
};
$("panelFieldsButton").onclick = ev => { ev.stopPropagation(); panelMenuToggle($("panelMenu").hidden); };
$("panelFieldsAdd").onclick = ev => { ev.stopPropagation(); panelMenuToggle(true, $("panelFieldsAdd")); };
$("panelMenu").addEventListener("click", ev => ev.stopPropagation());
document.addEventListener("click", () => { if (!$("panelMenu").hidden) panelMenuToggle(false); });
addEventListener("keydown", ev => { if (ev.key === "Escape" && !$("panelMenu").hidden) panelMenuToggle(false); });
// beim Szenenwechsel: Panel öffnen (zugeklappt oder als Tab hinten) – außer der Schalter ist aus
function panelReveal() {
  const d = document.querySelector('[data-area="scene-tools"]'); if (!d || ui.panelAuto === false || !panelList(sceneNow()).length) return;
  d.open = true;
  const g = d.parentElement && d.parentElement.classList.contains("tabgroup") ? d.parentElement : null;
  if (g && g.dataset.active !== "scene-tools") { g.dataset.active = "scene-tools"; tabsDraw(g); }
}
$("vEditLive").onclick = () => {
  tabs("match"); ui.below = Object.assign({}, ui.below, { match: "veto" }); uiSave(); belowApply();
  const d = document.querySelector('[data-area="map-veto"]'); if (d) { d.open = true; d.scrollIntoView({ block: "start", behavior: "smooth" }); }
};
setInterval(() => {                                           // jeder Weg zählt: Klick, Strg K, OBS, Sitzung laden
  if (!$("panelFields").querySelector('[data-panel="timer"]').hidden) setText($("pTimer"), K.time(K.timerRest(Z.timer)));
  const k = sceneNow(); if (k === sceneToolsShown) return;
  const first = !sceneToolsShown; sceneToolsShown = k; sceneToolsDraw();
  if (!first) panelReveal();
  // Hintergrund der neuen Szene (auch wenn in OBS umgeschaltet wurde)
  const before = JSON.stringify([Z.background.videos, Z.background.play]);
  bgApply(k); if (JSON.stringify([Z.background.videos, Z.background.play]) !== before) send();
}, 250);
