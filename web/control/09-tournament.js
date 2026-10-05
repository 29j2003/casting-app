/* CASTING-APP · Steuerseite – Turnier: Formate, Baum, FACEIT-Ergebnisse
   Teil 9 von 13; Reihenfolge und Lageplan: control/01-core.js
   (der Server verbindet alle Dateien zu einem Skript – siehe dort) */

/* ---------- Turnier ---------- */
function tour() {
  Z.tournament = Object.assign({ name: "", format: "se", teams: [], res: {}, swiss: { wins: 3, losses: 3, rounds: [] }, visible: { mode: "all", round: 1, resultsOff: false }, focused: "" }, Z.tournament || {});
  Z.tournament.swiss = Object.assign({ wins: 3, losses: 3, rounds: [] }, Z.tournament.swiss || {});
  Z.tournament.visible = Object.assign({ mode: "all", round: 1, resultsOff: false }, Z.tournament.visible || {});
  return Z.tournament;
}
const tourStatus = t => { $("tourStatus").textContent = t; };
function tournamentDraw() {
  const T = tour();
  $("tourName").value = T.name || ""; $("tourFormat").value = T.format; $("tourSwissSettings").hidden = T.format !== "swiss";
  $("tourTabSettings").hidden = T.format !== "table"; $("tourGroups").value = T.groupsCount || 1; $("tourNext").value = T.nextPlaces ?? 2; $("tourGamesShow").checked = !!T.gamesShow;
  $("tourPointsBox").hidden = T.format !== "table"; pointsDraw();
  $("tourWins").value = T.swiss.wins; $("tourLosses").value = T.swiss.losses;
  $("tourMode").value = T.visible.mode; $("tourRound").value = T.visible.round; $("tourResultOff").checked = !!T.visible.resultsOff;
  // Teams
  const box = $("tourTeams"); box.innerHTML = "";
  T.teams.forEach((t, i) => {
    const z = document.createElement("div"); z.className = "tour-team";
    z.innerHTML = `<span class="num">${i + 1}</span><input type="text" data-f="name" placeholder="Teamname" aria-label="Teamname"><input type="text" data-f="short" maxlength="4" placeholder="Kürzel" aria-label="Kürzel">
      <button type="button" class="tour-logo" title="Logo wählen" aria-label="Logo wählen">${t.logo ? "" : "Logo"}</button>
      <div class="wide"><input type="text" data-f="players" placeholder="Spieler, mit Komma getrennt" aria-label="Spieler"><input type="text" data-f="faceitId" placeholder="FACEIT-Team-ID (optional)" aria-label="FACEIT-Team-ID">
        <button class="button" data-a="up" aria-label="nach oben">↑</button><button class="button" data-a="down" aria-label="nach unten">↓</button><button class="x" data-a="away" aria-label="Entfernen">✕</button></div>
      <input type="file" accept="image/*" hidden>`;
    if (t.logo) z.querySelector(".tour-logo").style.backgroundImage = K.cssUrl(t.logo);
    z.querySelectorAll("[data-f]").forEach(f => {
      const k = f.dataset.f; f.value = k === "players" ? (t.players || []).join(", ") : (t[k] || "");
      f.oninput = () => { t[k] = k === "players" ? f.value.split(",").map(s => s.trim()).filter(Boolean) : f.value; if (k === "name") tournamentTreeDraw(); laterSend(); };
    });
    const file = z.querySelector("input[type=file]");
    z.querySelector(".tour-logo").onclick = () => file.click();
    file.onchange = async () => { if (!file.files[0]) return; t.logo = await imageShrink(file.files[0], 256); tournamentDraw(); send(); };
    z.querySelector("[data-a=up]").onclick = () => { if (i > 0) { [T.teams[i - 1], T.teams[i]] = [T.teams[i], T.teams[i - 1]]; tournamentDraw(); send(); } };
    z.querySelector("[data-a=down]").onclick = () => { if (i < T.teams.length - 1) { [T.teams[i + 1], T.teams[i]] = [T.teams[i], T.teams[i + 1]]; tournamentDraw(); send(); } };
    z.querySelector("[data-a=away]").onclick = () => remove(T.teams, i, `Team „${t.name || "?"}“`, tournamentDraw);
    box.appendChild(z);
  });
  tournamentTreeDraw();
}
function tournamentTreeDraw() {
  const T = tour(), B = K.tournamentBuild(T, CastI18n.language), box = $("tourTree"); box.innerHTML = "";
  const name = id => id === "BYE" ? "Freilos" : ((T.teams.find(t => t.id === id) || {}).name || (id ? "?" : "–"));
  const card = (m, title) => {
    const d = document.createElement("div"); d.className = "tour-m" + (m.done ? " done" : "");
    const e2 = T.res[m.id] || {};
    const undecided = !m.a || !m.b || m.a === "BYE" || m.b === "BYE";
    d.innerHTML = [["a", m.a], ["b", m.b]].map(([s, id]) => `<div class="tour-z"><button type="button" data-team="${esc(id || "")}" class="${id && id === T.focused ? "focused" : ""}"${!id || id === "BYE" ? " disabled" : ""}>${esc(name(id))}</button>
      <input type="number" min="0" data-s="${s}" value="${e2[s] ?? ""}"${undecided ? " disabled" : ""} aria-label="Ergebnis"></div>`).join("") +
      `<div class="tour-foot"><span>${esc(title || m.title || m.id)}</span><label class="toggleSwitch"><input type="checkbox"${m.done ? " checked" : ""}${undecided ? " disabled" : ""}> fertig</label></div>`;
    d.querySelectorAll("input[data-s]").forEach(f => f.oninput = () => { T.res[m.id] = Object.assign({}, T.res[m.id], { [f.dataset.s]: f.value === "" ? "" : +f.value }); laterSend(); });
    d.querySelector("input[type=checkbox]").onchange = ev => { T.res[m.id] = Object.assign({}, T.res[m.id], { done: ev.target.checked }); tournamentTreeDraw(); send(); };
    d.querySelectorAll("button[data-team]").forEach(b => b.onclick = () => { T.focused = T.focused === b.dataset.team ? "" : b.dataset.team; tournamentTreeDraw(); send(); });
    return d;
  };
  const column = (title, matches, addition) => { const s = document.createElement("div"); s.className = "tour-round"; s.innerHTML = `<div class="tour-title">${esc(title)}</div>`; matches.forEach(m => s.appendChild(card(m, addition && addition(m)))); box.appendChild(s); };
  if (T.teams.length < 2) { box.innerHTML = `<span class="small">Mindestens 2 Teams eintragen.</span>`; return; }
  if (B.format === "gsl" || B.format === "table") B.groups.forEach(g => column(g.name, g.matches, m => m.title));
  else {
    B.rounds.forEach(r => column(r.title, r.matches, B.format === "swiss" ? (m => "Bilanz " + m.record) : null));
    B.bottom.forEach(r => column(r.title, r.matches));
    if (B.finale) column("Grand Final", [B.finale]);
  }
}
$("tourName").oninput = () => { tour().name = $("tourName").value; laterSend(); };
$("tourFormat").onchange = async () => {
  const T = tour();
  if (Object.keys(T.res).length && !await confirmDialog({ title: "Format wechseln?", text: "Eingetragene Ergebnisse passen danach meist nicht mehr und werden gelöscht.", button: "Wechseln" })) { $("tourFormat").value = T.format; return; }
  T.format = $("tourFormat").value; T.res = {}; T.swiss.rounds = [];
  if (T.format !== "import" && T.format !== "table") T.games = [];
  if (T.format === "table" && T.games && T.games.some(x => x.group === undefined)) T.games = [];
  tournamentDraw(); send();
};
$("tourGroups").onchange = () => { const T = tour(); T.groupsCount = Math.max(1, Math.min(8, +$("tourGroups").value || 1)); if (!T.gamesSource) T.games = []; T.teams.forEach(t => { if (!T.gamesSource) delete t.group; }); tournamentTreeDraw(); send(); };
// Punkteregeln
const POINTS_DEFAULT = { win: 3, winClose: 3, lossClose: 1, loss: 0, draws: 1 };
function pointsDraw() {
  const T = tour(), P = Object.assign({}, POINTS_DEFAULT, T.points || {});
  const cacheKey = `${P.win}-${P.winClose}-${P.lossClose}-${P.loss}`;
  const template = [...$("tourPointsTemplate").options].some(o => o.value === cacheKey) && P.draws === 1 ? cacheKey : "own";
  $("tourPointsTemplate").value = template; $("tourPointsOwn").hidden = template !== "own";
  document.querySelectorAll("#tourPointsOwn [data-p]").forEach(f => { f.value = P[f.dataset.p]; });
  const B = K.tournamentBuild(T, CastI18n.language), s = $("tourShowGroup"), value = T.showGroup ?? "";
  s.innerHTML = `<option value="">Alle Gruppen</option>` + B.groups.map((g, i) => `<option value="${i}"${String(i) === String(value) ? " selected" : ""}>${esc(g.name)}</option>`).join("");
}
$("tourPointsTemplate").onchange = () => {
  const v = $("tourPointsTemplate").value, T = tour();
  if (v !== "own") { const [win, winClose, lossClose, loss] = v.split("-").map(Number); T.points = { win, winClose, lossClose, loss, draws: 1 }; }
  else T.points = Object.assign({}, POINTS_DEFAULT, T.points || {});
  pointsDraw(); if (v === "own") $("tourPointsOwn").hidden = false; send();
};
document.querySelectorAll("#tourPointsOwn [data-p]").forEach(f => f.onchange = () => { const T = tour(); T.points = Object.assign({}, POINTS_DEFAULT, T.points || {}, { [f.dataset.p]: Math.max(0, +f.value || 0) }); send(); });
$("tourShowGroup").onchange = () => { tour().showGroup = $("tourShowGroup").value; send(); };
$("tourNext").onchange = () => { tour().nextPlaces = Math.max(0, +$("tourNext").value || 0); send(); };
$("tourGamesShow").onchange = () => { tour().gamesShow = $("tourGamesShow").checked; send(); };
$("tourWins").onchange = () => { tour().swiss.wins = +$("tourWins").value || 3; tournamentTreeDraw(); send(); };
$("tourLosses").onchange = () => { tour().swiss.losses = +$("tourLosses").value || 3; tournamentTreeDraw(); send(); };
$("tourDraw").onclick = () => {
  const T = tour(), last = T.swiss.rounds[T.swiss.rounds.length - 1];
  if (last && last.some(m => m.b !== "BYE" && !(T.res[m.id] || {}).done)) return tourStatus("Erst alle Spiele der aktuellen Runde als fertig markieren.");
  const fresh = K.swissDraw(T);
  if (!fresh.length) return tourStatus("Alle Teams sind fertig – keine weitere Runde nötig.");
  T.swiss.rounds.push(fresh); tournamentTreeDraw(); send(); tourStatus(fresh.length === 1 ? `✓ Runde ${T.swiss.rounds.length} ausgelost (1 Spiel).` : `✓ Runde ${T.swiss.rounds.length} ausgelost (${fresh.length} Spiele).`);
};
$("tourNewTeam").onclick = () => {
  const T = tour(); if (T.teams.length >= 32) return tourStatus("Höchstens 32 Teams.");
  T.teams.push({ id: "t" + Date.now().toString(36), name: "Team " + (T.teams.length + 1), short: "", logo: "", players: [], faceitId: "" }); tournamentDraw(); send();
};
["tourMode", "tourRound", "tourResultOff"].forEach(id => $(id).onchange = () => {
  const S = tour().visible; S.mode = $("tourMode").value; S.round = +$("tourRound").value || 1; S.resultsOff = $("tourResultOff").checked; send();
});
$("tourFocusOff").onclick = () => { tour().focused = ""; tournamentTreeDraw(); send(); };
$("tourReset").onclick = async () => {
  if (!await confirmDialog({ title: "Alle Ergebnisse löschen?", text: "Teams und Format bleiben, alle Spielstände (und Swiss-Runden) werden geleert.", button: "Löschen" })) return;
  const T = tour(); T.res = {}; T.swiss.rounds = []; tournamentTreeDraw(); send();
};
// FACEIT: Teams eines Turniers, Team-Statistiken, Ergebnisse
const tournamentId = s => (String(s || "").match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || [])[0] || "";
async function faceitJson(path) { const r = await fetch("/api/faceit/" + path); if (!r.ok) throw new Error(r.status === 401 ? "kein FACEIT-Schlüssel gespeichert (Match → FACEIT)" : "FACEIT antwortet mit " + r.status); return r.json(); }
// Turnier komplett übernehmen: Teams (mit Logos und Spielern), Aufbau (Gruppen-Tabelle oder Baum), Ergebnisse, Team-Statistiken
async function faceitGames(id) {
  const games = [];
  for (let off = 0; off < 600; off += 100) { const d = await faceitJson(`data/v4/championships/${id}/matches?type=all&offset=${off}&limit=100`); games.push(...(d.items || [])); if ((d.items || []).length < 100) break; }
  return games;
}
// Runden je Map (für RD) – nur für fertige Spiele, die noch keine Runden haben
async function faceitRounds(T, games) {
  const pendingGames = games.filter(x => x.status === "FINISHED" && T.res["F" + x.match_id] && T.res["F" + x.match_id].rdA === undefined);
  let n = 0;
  for (const x of pendingGames) {
    n++; tourStatus(`Lade Runden für die Rundendifferenz (${n} von ${pendingGames.length}) …`);
    try {
      const d = await faceitJson(`data/v4/matches/${x.match_id}/stats`), f1 = ((x.teams || {}).faction1 || {}).faction_id;
      let a = 0, b = 0;
      (d.rounds || []).forEach(r => (r.teams || []).forEach(t => { const pts = +((t.team_stats || {})["Final Score"]) || 0; if (t.team_id === f1) a += pts; else b += pts; }));
      if (a || b) Object.assign(T.res["F" + x.match_id], { rdA: a, rdB: b });
    } catch (err) {}
  }
}
function faceitResults(T, games) {
  const tid = fid => (T.teams.find(t => t.faceitId && t.faceitId === fid) || {}).id || null;
  let n = 0;
  games.forEach(x => {
    const f = x.teams || {}, a = tid((f.faction1 || {}).faction_id), b = tid((f.faction2 || {}).faction_id), sc = (x.results || {}).score || {};
    const id = "F" + x.match_id; if (!a || !b) return;
    if (x.results) { const previous = T.res[id] || {}; T.res[id] = Object.assign({ a: sc.faction1 ?? "", b: sc.faction2 ?? "", done: x.status === "FINISHED" }, previous.rdA !== undefined ? { rdA: previous.rdA, rdB: previous.rdB } : {}); n++; }
  });
  return n;
}
$("tourFaceitAll").onclick = async () => {
  const id = tournamentId($("tourFaceit").value); if (!id) return tourStatus("Bitte einen FACEIT-Turnier-Link einfügen.");
  const T = tour();
  if (T.teams.length && !await confirmDialog({ title: "Turnier aus FACEIT übernehmen?", text: "Teams, Aufbau und Ergebnisse werden durch die Daten von FACEIT ersetzt.", button: "Übernehmen" })) return;
  try {
    tourStatus("Lade Turnier …");
    const info = await faceitJson(`data/v4/championships/${id}`).catch(() => ({}));
    const subs = [];
    for (let off = 0; off < 300; off += 100) { const d = await faceitJson(`data/v4/championships/${id}/subscriptions?offset=${off}&limit=100`); subs.push(...(d.items || [])); if ((d.items || []).length < 100) break; }
    const games = await faceitGames(id);
    // Teams: aus der Anmeldeliste, ergänzt um alle, die in Spielen vorkommen
    const teams = new Map();
    subs.forEach(x => { const t = x.team || x; if (t.team_id) teams.set(t.team_id, { faceitId: t.team_id, name: t.name || t.nickname || "", logo: t.avatar || "", players: (x.roster || t.members || []).map(p => p.nickname || "").filter(Boolean) }); });
    games.forEach(x => ["faction1", "faction2"].forEach(f => { const t = (x.teams || {})[f]; if (t && t.faction_id && !teams.has(t.faction_id) && t.faction_id !== "bye") teams.set(t.faction_id, { faceitId: t.faction_id, name: t.name || t.nickname || "", logo: t.avatar || "", players: (t.roster || []).map(p => p.nickname || "").filter(Boolean) }); }));
    // Logos, Spieler und Statistiken je Team direkt bei FACEIT nachladen (die Anmeldeliste enthält oft keine Logos)
    let i = 0;
    for (const t of teams.values()) {
      i++; tourStatus(`Lade Team ${i} von ${teams.size} (Logo, Spieler, Statistik) …`);
      try { const d = await faceitJson(`data/v4/teams/${t.faceitId}`); t.name = d.name || d.nickname || t.name; t.logo = d.avatar || t.logo; if (!t.players.length) t.players = (d.members || []).map(p => p.nickname).filter(Boolean); } catch (err) {}
      try { const L = ((await faceitJson(`data/v4/teams/${t.faceitId}/stats/cs2`)).lifetime) || {}; t.stats = { winrate: L["Win Rate %"] || "", matches: L["Matches"] || "", series: L["Current Win Streak"] || "0", last: (L["Recent Results"] || []).map(String) }; } catch (err) {}
    }
    T.teams = [...teams.values()].slice(0, 32).map((t, n) => Object.assign({ id: "t" + Date.now().toString(36) + n, short: (t.name || "").slice(0, 3).toUpperCase() }, t, { players: t.players.slice(0, 7) }));
    const tid = fid => (T.teams.find(t => t.faceitId === fid) || {}).id || null;
    // Aufbau erkennen: Spiele mit Gruppen-Nummer und ohne K.-o.-Runden = Gruppen mit Tabelle, sonst der Baum genau wie bei FACEIT
    const groupsNum = [...new Set(games.map(x => x.group).filter(g => g !== undefined && g !== null))];
    // Liga-Muster: in jeder Runde spielt (fast) jedes Team – bei K.-o. halbiert sich die Zahl der Spiele je Runde
    const proRound = {}; games.forEach(x => { proRound[x.round] = (proRound[x.round] || 0) + 1; });
    const numbers = Object.values(proRound), teamsPerGroup = teams.size / Math.max(1, groupsNum.length);
    const leaguePattern = numbers.length >= 3 && numbers.every(z => z >= Math.floor(teamsPerGroup * Math.max(1, groupsNum.length) / 2) - 1);
    const tablesKind = /round|robin|league|group/i.test(String(info.type || "")) || groupsNum.length > 1 || leaguePattern;
    T.games = games.filter(x => x.teams).map(x => ({ id: "F" + x.match_id, round: +x.round || 0, group: groupsNum.length ? Math.max(0, groupsNum.indexOf(x.group)) : 0,
      a: tid(((x.teams || {}).faction1 || {}).faction_id), b: tid(((x.teams || {}).faction2 || {}).faction_id) }));
    T.gamesSource = "faceit";
    if (tablesKind) {
      T.format = "table"; T.groupsCount = Math.max(1, groupsNum.length);
      T.teams.forEach(t => { const s = T.games.find(x => x.a === t.id || x.b === t.id); t.group = s ? s.group : 0; });
    } else T.format = "import";
    T.res = {}; T.swiss.rounds = [];
    const n = faceitResults(T, games);
    if (T.format === "table") await faceitRounds(T, games);
    if (info.name) T.name = info.name;
    tournamentDraw(); send();
    tourStatus(`✓ Übernommen: ${T.teams.length} Teams · ${T.format === "table" ? T.groupsCount + " Gruppe(n) mit Tabelle" : "Baum wie bei FACEIT"} · ${n} Ergebnisse.`);
  } catch (err) { tourStatus("FACEIT: " + err.message); }
};
$("tourStats").onclick = async () => {
  const T = tour(), including = T.teams.filter(t => t.faceitId); if (!including.length) return tourStatus("Kein Team hat eine FACEIT-Team-ID.");
  let ok = 0; tourStatus("Lade Statistiken …");
  for (const t of including) {
    try {
      const d = await faceitJson(`data/v4/teams/${t.faceitId}/stats/cs2`), L = d.lifetime || {};
      t.stats = { winrate: L["Win Rate %"] || "", matches: L["Matches"] || "", series: L["Current Win Streak"] || "0", last: (L["Recent Results"] || []).map(String) };
      ok++;
    } catch (err) {}
  }
  send(); tourStatus(`✓ Statistiken für ${ok} von ${including.length} Teams geladen.`);
};
$("tourFaceitResult").onclick = async () => {
  const id = tournamentId($("tourFaceit").value), T = tour(); if (!id) return tourStatus("Bitte einen FACEIT-Turnier-Link einfügen.");
  if (T.gamesSource === "faceit" && (T.format === "import" || T.format === "table")) {
    try { tourStatus("Lade Ergebnisse …"); const games = await faceitGames(id), n = faceitResults(T, games); if (T.format === "table") await faceitRounds(T, games); tournamentTreeDraw(); send(); return tourStatus(`✓ ${n} Ergebnisse aktualisiert.`); }
    catch (err) { return tourStatus("FACEIT: " + err.message); }
  }
  try {
    tourStatus("Lade Spiele …");
    const games = [];
    for (let off = 0; off < 400; off += 100) { const d = await faceitJson(`data/v4/championships/${id}/matches?type=all&offset=${off}&limit=100`); games.push(...(d.items || [])); if ((d.items || []).length < 100) break; }
    const fid = tid => (T.teams.find(t => t.id === tid) || {}).faceitId;
    let n = 0;
    for (let round = 0; round < 10; round++) {                   // mehrfach: jedes Ergebnis legt die nächsten Paarungen fest
      const B = K.tournamentBuild(T, CastI18n.language), all = [...B.rounds.flatMap(r => r.matches), ...B.bottom.flatMap(r => r.matches), ...(B.finale ? [B.finale] : []), ...B.groups.flatMap(g => g.matches)];
      let fresh = 0;
      all.forEach(m => {
        const fa = fid(m.a), fb = fid(m.b); if (!fa || !fb || (T.res[m.id] || {}).done) return;
        const s = games.find(x => { const f = x.teams || {}; const i1 = (f.faction1 || {}).faction_id, i2 = (f.faction2 || {}).faction_id; return (i1 === fa && i2 === fb) || (i1 === fb && i2 === fa); });
        if (!s) return;
        const sc = (s.results || {}).score || {}, one = ((s.teams || {}).faction1 || {}).faction_id === fa;
        T.res[m.id] = { a: one ? sc.faction1 : sc.faction2, b: one ? sc.faction2 : sc.faction1, done: s.status === "FINISHED" };
        fresh++; n++;
      });
      if (!fresh) break;
    }
    tournamentTreeDraw(); send(); tourStatus(n ? `✓ ${n} Ergebnisse von FACEIT übernommen.` : "Keine passenden Spiele gefunden – stimmen die FACEIT-Team-IDs?");
  } catch (err) { tourStatus("FACEIT: " + err.message); }
};

// Schließen: Klick aufs X (Desktop-App) oder auf ⏻ – die App fragt zuerst, versteckt wird erst nach der Wahl.
//   Ganz beenden · Nur Fenster schließen (Overlays laufen weiter, Symbol im Infobereich) · Abbrechen
let closeOpen = null;
async function quitAsk() {
  if (closeOpen) { closeOpen.querySelector('[data-w=window]')?.focus(); return; }   // Dialog ist schon offen
  const w = await selection({ title: "Casting-App schließen?", text: "Bei „Nur Fenster schließen“ laufen die Overlays in OBS weiter.",
    buttons: [["quit", "Ganz beenden", "red"], ["window", "Nur Fenster schließen", "main"], ["", "Abbrechen", ""]], whenShown: d => { closeOpen = d; } });
  closeOpen = null;
  if (window.castApp) { window.castApp.closeAnswer(w); return; }
  // ohne Desktop-App (Steuerseite im normalen Browser)
  if (w === "quit") { fetch("/api/quit", { method: "POST" }).catch(() => {}); setTimeout(() => window.close(), 300); }
  if (w === "window") window.close();
}
if (window.castApp) window.castApp.onCloseRequested(quitAsk);
// kleine Auswahl mit mehreren Knöpfen (wie die Sicherheitsabfrage)
function selection({ title, text, buttons, whenShown }) {
  return new Promise(ok => {
    const d = document.createElement("div"); d.className = "question";
    d.innerHTML = `<div class="question-box" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><p>${esc(text)}</p><div class="line" style="justify-content:flex-end">${buttons.map(([w, n, kind]) => `<button class="button ${kind === "main" ? "main" : ""}" data-w="${w}"${kind === "red" ? ' style="background:var(--red);color:#fff;border-color:var(--red)"' : ""}>${esc(n)}</button>`).join("")}</div></div>`;
    document.body.appendChild(d); if (whenShown) whenShown(d);
    const close = w => { d.remove(); removeEventListener("keydown", hotkey); ok(w); };
    const hotkey = ev => { if (ev.key === "Escape") close(""); };
    addEventListener("keydown", hotkey);
    d.querySelectorAll("button").forEach(b => b.onclick = () => close(b.dataset.w));
    d.querySelector('[data-w=window]')?.focus();
  });
}
$("workspaceButton") && document.querySelector(".topbar .tools").insertAdjacentHTML("beforeend", `<button class="tool" id="quitButton" title="Schließen oder ganz beenden" aria-label="Schließen oder beenden">⏻</button>`);
$("quitButton").onclick = quitAsk;
