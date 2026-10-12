// Auto-Observer – Steuerseite. Holt viermal pro Sekunde den Zustand (/api/state) und schickt Änderungen.
"use strict";

const $ = (id) => document.getElementById(id);
const REASONS = {
  kill: () => "Kill", multi_kill: (d) => `${d} Kills`, fight: (d) => (d ? `Im Gefecht mit ${d}` : "Im Gefecht"), shots: (d) => (d ? `Schießt auf ${d}` : "Schießt"),
  clutch: (d) => `Clutch ${d}`, duel: (d) => `Duell gegen ${d}`, flank: (d) => `Flanke auf ${d}`, contact: (d) => `Läuft auf ${d} zu`,
  angle: (d) => `Hält den Winkel auf ${d}`, plant: () => "Legt die Bombe", defuse: () => "Entschärft",
  stop_defuse: () => "Kann das Entschärfen stoppen", push: () => "Push", proximity: () => "Gegner in der Nähe",
  nade: (d) => `Wirft ${NADES[d] || "eine Granate"}`,
  trade_try: (d) => `Will ${d} traden`, swing: (d) => `Swingt auf ${d} (lädt nach)`,
  flash_peek: (d) => `Peekt den geblendeten ${d}`, sneak: (d) => `Schleicht auf ${d} zu`,
  retake: () => "Retake", execute: () => "Angriff mit Smokes/Molotovs",
  hotspot: (d) => `Typische Duell-Stelle gegen ${d}`,
  importance: () => "Wichtigkeit", killer: (d) => `Hat ${d} getötet`, rotation: () => "Abwechslung",
};
const NADES = { smoke: "eine Smoke", flashbang: "eine Flash", frag: "eine HE", firebomb: "einen Molotov", decoy: "ein Decoy" };
const ROLE_NAMES = { entry: "Entry", awp: "AWP", lurker: "Lurker", support: "Support", anchor: "Anker" };
const reasonText = (code, detail) => (REASONS[code] ? REASONS[code](detail || "") : code || "");

let state = null;
const touched = new Map();           // Eingabefeld → Zeitpunkt der letzten Änderung (nicht überschreiben)
const timers = new Map();

async function post(path, body) {
  const response = await fetch(path, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Auto-Observer": "1" },
    body: JSON.stringify(body || {}),
  });
  let data = {};
  try { data = await response.json(); } catch { /* leer */ }
  return { ok: response.ok, data };
}

function sendSettings(changes) { post("/api/settings", changes); }

// eine Einstellung nach kurzer Pause schicken (Regler ziehen erzeugt viele Werte)
function later(key, fn, ms = 150) {
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(fn, ms));
}

function busy(input) {
  return document.activeElement === input || Date.now() - (touched.get(input) || 0) < 1500;
}

function setValue(input, value) {
  if (busy(input)) return;
  if (input.type === "checkbox") input.checked = !!value;
  else if (String(input.value) !== String(value)) input.value = value;
}

function mark(input) { touched.set(input, Date.now()); }

// --- feste Bedienelemente ---

$("enabled").addEventListener("click", () => sendSettings({ enabled: !(state && state.settings.enabled) }));
$("resume").addEventListener("click", () => post("/api/resume"));
for (const id of ["xray", "return_timer", "pause_on_manual"]) {
  $(id).addEventListener("change", (e) => { mark(e.target); sendSettings({ [id]: e.target.checked }); });
}
$("return_seconds").addEventListener("change", (e) => {
  mark(e.target);
  const value = Math.round(Number(e.target.value));
  if (value >= 1 && value <= 600) sendSettings({ return_seconds: value });
});
$("data_mix").addEventListener("input", (e) => {
  mark(e.target);
  $("data_mix_value").textContent = `${e.target.value} %`;
  later("data_mix", () => sendSettings({ data_mix: Number(e.target.value) / 100 }));
});
for (const id of ["camera_mode", "spec_command"]) {
  $(id).addEventListener("change", (e) => { mark(e.target); sendSettings({ [id]: e.target.value }); });
}
$("netcon_host").addEventListener("change", (e) => { mark(e.target); sendSettings({ netcon_host: e.target.value.trim() }); });
$("netcon_port").addEventListener("change", (e) => {
  mark(e.target);
  const port = Math.round(Number(e.target.value));
  if (port >= 1 && port <= 65535) sendSettings({ netcon_port: port });
});
$("leetify-save").addEventListener("click", async () => {
  const { ok, data } = await post("/api/leetify/key", { key: $("leetify-key").value });
  $("leetify-key").value = "";
  if (!ok) flash(data.message || "Key nicht übernommen");
});
$("steam_exe").addEventListener("change", (e) => { mark(e.target); sendSettings({ steam_exe: e.target.value.trim() }); });
$("launch_extra").addEventListener("change", (e) => { mark(e.target); sendSettings({ launch_extra: e.target.value }); });
$("cfg_folder").addEventListener("change", (e) => {
  mark(e.target);
  post("/api/cfg/write", { folder: e.target.value }).then(({ ok, data }) => showCfgStatus(ok, data.message));
});
$("launch-cs2").addEventListener("click", async () => {
  $("launch-cs2").disabled = true;
  const { ok, data } = await post("/api/launch");
  if (!ok) flash(data.message || "CS2 konnte nicht gestartet werden");
  launchClicked = ok ? Date.now() : 0;
  $("launch-cs2").disabled = false;
});
let launchClicked = 0;
let setupShown = false;          // Einrichtung einmal aufklappen, wenn etwas fehlt
function showCfgStatus(ok, message) {
  $("cfg-status").textContent = ok ? "✓ eingerichtet" : message || "Fehler";
  $("cfg-status").className = ok ? "ok" : "bad";
}
$("cfg-find").addEventListener("click", async () => {
  $("cfg-status").textContent = "suche …";
  const { data } = await post("/api/cfg/find");
  const list = $("cfg-list");
  list.replaceChildren();
  for (const folder of data.folders || []) {
    const item = document.createElement("li");
    item.textContent = folder;
    list.append(item);
  }
  $("cfg-status").textContent = (data.folders || []).length ? "anklicken zum Übernehmen" : "nichts gefunden – Pfad selbst eintragen";
  $("cfg-status").className = "";
});
$("cfg-list").addEventListener("click", (e) => {
  if (e.target.tagName !== "LI") return;
  $("cfg-list").replaceChildren();
  post("/api/cfg/write", { folder: e.target.textContent }).then(({ ok, data }) => showCfgStatus(ok, data.message));
});
$("cfg-write").addEventListener("click", async () => {
  const { ok, data } = await post("/api/cfg/write", { folder: $("cfg_folder").value });
  showCfgStatus(ok, data.message);
});
$("record").addEventListener("click", () => post("/api/record", { on: !(state && state.recording.on) }));
$("open-recordings").addEventListener("click", () => post("/api/open-recordings"));

// --- Teams und Spieler ---

function weightControl(className, onChange) {
  const box = document.createElement("span");
  box.className = className;
  const range = Object.assign(document.createElement("input"), { type: "range", min: 0, max: 200, step: 5 });
  const number = Object.assign(document.createElement("input"), { type: "number", min: 0, max: 200, className: "pct" });
  range.addEventListener("input", () => { mark(range); mark(number); number.value = range.value; onChange(Number(range.value)); });
  number.addEventListener("change", () => {
    mark(range); mark(number);
    const value = Math.max(0, Math.min(200, Math.round(Number(number.value) || 0)));
    number.value = value; range.value = value; onChange(value);
  });
  box.append(range, number, " %");
  return { box, set(value) { setValue(range, value); setValue(number, value); } };
}

const teamCards = {};
const playerRows = new Map();

function teamCard(side) {
  if (teamCards[side]) return teamCards[side];
  const card = document.createElement("div");
  card.className = "card team";
  card.dataset.side = side;
  const head = document.createElement("div");
  head.className = "team-head";
  const name = Object.assign(document.createElement("span"), { className: "team-name" });
  const score = Object.assign(document.createElement("span"), { className: "team-score" });
  const label = Object.assign(document.createElement("span"), { textContent: "Team" });
  const card_ = { card, name, score, key: "", players: document.createElement("div") };
  card_.weight = weightControl("team-weight-box", (value) => later(`team-${side}`, () => sendSettings({
    team_weights: { [card_.key]: { weight: value / 100, name: card_.name.textContent } },
  })));
  card_.weight.box.prepend(label, " ");
  head.append(name, score, card_.weight.box);
  card.append(head, card_.players);
  $("teams").append(card);
  teamCards[side] = card_;
  return card_;
}

function playerRow(player) {
  let row = playerRows.get(player.steamid);
  if (row) return row;
  const el = document.createElement("div");
  el.className = "player";
  const key = Object.assign(document.createElement("button"), { type: "button", className: "key", title: "Kamera auf diesen Spieler" });
  const name = Object.assign(document.createElement("span"), { className: "name", title: "Kamera auf diesen Spieler" });
  const hp = Object.assign(document.createElement("span"), { className: "bar hp", title: "Leben" });
  hp.append(document.createElement("i"));
  const form = Object.assign(document.createElement("span"), { className: "form", title: "Form aus den Matchdaten (1,00 = Durchschnitt)" });
  const role = Object.assign(document.createElement("select"), { className: "role", title: "Rolle – „auto“ lernt sie aus dem Match" });
  role.append(new Option("auto", ""), ...Object.entries(ROLE_NAMES).map(([value, text]) => new Option(text, value)));
  role.addEventListener("change", () => {
    mark(role);
    sendSettings({ player_roles: { [player.steamid]: { role: role.value, name: row.current.name } } });
  });
  const kd = Object.assign(document.createElement("span"), { className: "form", title: "Kills / Tode" });
  const interest = Object.assign(document.createElement("span"), { className: "interest" });
  const bar = Object.assign(document.createElement("span"), { className: "bar" });
  bar.append(document.createElement("i"));
  const why = document.createElement("em");
  interest.append(bar, why);
  row = { el, key, name, role, hp, form, kd, bar, why, current: player };
  row.weight = weightControl("weight", (value) => later(`player-${player.steamid}`, () => sendSettings({
    player_weights: { [player.steamid]: { weight: value / 100, name: row.current.name } },
  })));
  const show = async () => {
    const { ok, data } = await post("/api/show", { steamid: player.steamid });
    if (!ok) flash(data.message || "Wechsel nicht möglich");
  };
  key.addEventListener("click", show);
  name.addEventListener("click", show);
  el.append(key, name, role, hp, row.weight.box, form, kd, interest);
  playerRows.set(player.steamid, row);
  return row;
}

let flashUntil = 0;
function flash(text) {
  $("problem-band").textContent = text;
  $("problem-band").hidden = false;
  flashUntil = Date.now() + 3000;
}

function renderTeams() {
  const seen = new Set();
  const maxScore = Math.max(1, ...state.teams.flatMap((t) => t.players.map((p) => p.score)));
  for (const team of state.teams) {
    const card = teamCard(team.side);
    card.key = team.key;
    card.name.textContent = team.name;
    card.score.textContent = `${team.score}`;
    card.weight.set(Math.round(team.weight * 100));
    const rows = [];
    for (const player of team.players) {
      const row = playerRow(player);
      row.current = player;
      seen.add(player.steamid);
      row.el.classList.toggle("observed", player.observed);
      row.el.classList.toggle("dead", !player.alive);
      row.key.textContent = player.slot >= 0 ? String((player.slot + 1) % 10) : "–";
      row.name.textContent = player.name;
      setValue(row.role, player.role);
      row.role.options[0].text = !player.role && player.role_used ? `auto: ${ROLE_NAMES[player.role_used] || player.role_used}` : "auto";
      row.hp.firstChild.style.width = `${player.health}%`;
      row.weight.set(Math.round(player.weight * 100));
      row.form.textContent = player.form.toFixed(2).replace(".", ",");
      const l = player.leetify || {};
      row.form.title = "Form (1,00 = Durchschnitt) – am Anfang aus Leetify, dann aus dem Match"
        + (Object.keys(l).length ? `\nLeetify: Aim ${l.aim ?? "–"}, Positioning ${l.positioning ?? "–"}, Utility ${l.utility ?? "–"}, Opening ${l.opening ?? "–"}, Clutch ${l.clutch ?? "–"}` : "");
      row.kd.textContent = `${player.kills}/${player.deaths}`;
      row.bar.firstChild.style.width = `${Math.round((100 * player.score) / maxScore)}%`;
      row.why.textContent = player.alive && player.score ? `${player.score} · ${reasonText(player.reason, player.detail)}` : "";
      rows.push(row.el);
    }
    // Reihenfolge nur ändern, wenn nötig (sonst springt ein gezogener Regler)
    const children = [...card.players.children];
    if (rows.length !== children.length || rows.some((el, i) => el !== children[i])) card.players.replaceChildren(...rows);
  }
  for (const [id, row] of playerRows) {
    if (!seen.has(id)) { row.el.remove(); playerRows.delete(id); }
  }
}

function render() {
  if (!state) return;
  const s = state.settings;
  $("version").textContent = `Test ${state.version}`;
  $("lamp-gsi").className = `lamp ${state.receiving ? "on" : ""}`;
  $("lamp-gsi").textContent = state.receiving ? "CS2-Daten kommen an" : "Keine CS2-Daten";
  const mode = state.camera.mode;
  $("lamp-camera").className = `lamp ${mode === "netcon" ? "on" : mode === "keys" ? "mid" : ""}`;
  $("lamp-camera").textContent = `Kamera: ${state.camera_name}`;
  $("map").textContent = state.map ? `${state.map}${state.map_known ? " (Kartenwissen ✓)" : ""} · Runde ${state.round} · ${state.phase || "–"}` : "";

  $("keys-band").hidden = mode !== "keys";
  $("keys-foreground").textContent = mode === "keys" ? (state.camera.foreground ? "(CS2 ist im Vordergrund ✓)" : "(CS2 ist NICHT im Vordergrund!)") : "";
  if (Date.now() > flashUntil) {
    const problem = state.camera_problem
      || (mode === "none" ? "Keine Verbindung zu CS2 – CS2 über „CS2 starten“ starten" : "");
    $("problem-band").hidden = !(s.enabled && problem);
    $("problem-band").textContent = problem;
  }

  $("enabled").textContent = `Auto-Observer: ${s.enabled ? "AN" : "AUS"}`;
  $("enabled").classList.toggle("on", s.enabled);
  setValue($("xray"), s.xray);
  setValue($("return_timer"), s.return_timer);
  setValue($("return_seconds"), s.return_seconds);
  setValue($("pause_on_manual"), s.pause_on_manual);
  setValue($("data_mix"), Math.round(s.data_mix * 100));
  if (!busy($("data_mix"))) $("data_mix_value").textContent = `${Math.round(s.data_mix * 100)} %`;
  setValue($("camera_mode"), s.camera_mode);
  setValue($("spec_command"), s.spec_command);
  setValue($("netcon_host"), s.netcon_host);
  setValue($("netcon_port"), s.netcon_port);
  const setup = state.setup;
  setValue($("cfg_folder"), setup.cfg_folder);
  setValue($("launch_extra"), s.launch_extra);
  if (!busy($("steam_exe"))) {
    $("steam_exe").value = setup.steam_auto ? "" : setup.steam;
    $("steam_exe").placeholder = setup.steam_auto && setup.steam ? `gefunden: ${setup.steam}` : "wird gesucht – sonst Pfad zu steam.exe";
  }
  $("steam-status").textContent = setup.steam ? "✓" : "nicht gefunden";
  $("steam-status").className = setup.steam ? "ok" : "bad";
  $("cfg-installed").textContent = setup.installed ? "✓ GSI-Datei eingerichtet" : "nicht eingerichtet";
  $("cfg-installed").className = setup.installed ? "ok" : "bad";
  $("launch-preview").textContent = setup.command;
  const leetify = state.leetify || {};
  $("leetify-status").textContent = !leetify.key ? "kein Key" : leetify.error ? leetify.error
    : `✓ ${leetify.loaded}/${leetify.players} Spieler geladen${leetify.busy ? " …" : ""}${leetify.stored ? "" : " (nur bis zum Beenden)"}`;
  $("leetify-status").className = leetify.key && !leetify.error ? "ok" : "bad";
  const ready = setup.steam && setup.installed;
  $("setup-summary").textContent = ready ? "– alles gefunden" : "– bitte prüfen";
  if (!ready && !setupShown) $("setup").open = true;
  setupShown = true;

  const connected = state.camera.netcon;
  $("launch-cs2").textContent = connected ? "CS2 läuft ✓" : Date.now() - launchClicked < 60000 ? "CS2 startet …" : "CS2 starten";
  $("launch-cs2").disabled = connected;

  const players = state.teams.flatMap((t) => t.players);
  const shown = players.find((p) => p.observed);
  $("now-name").textContent = shown ? shown.name : "–";
  const last = state.last && shown && state.last.steamid === shown.steamid ? state.last : null;
  $("now-reason").textContent = last ? reasonText(last.reason, last.detail) : shown ? reasonText(shown.reason, shown.detail) : "";
  $("next-name").textContent = state.next ? state.next.name : "–";
  $("next-reason").textContent = state.next ? reasonText(state.next.reason, state.next.detail) : "";

  $("pause-box").hidden = !state.paused.on;
  $("pause-reason").textContent = state.paused.reason ? `(${state.paused.reason})` : "";
  $("pause-seconds").textContent = state.paused.seconds != null ? `– zurück in ${state.paused.seconds} s` : "– zurück per Knopf";

  $("record").textContent = state.recording.on ? "Mitschnitt stoppen" : "Mitschnitt starten";
  $("record-status").textContent = state.recording.on ? `läuft (${state.recording.lines} Zeilen)` : state.recording.path ? `zuletzt: ${state.recording.path}` : "";

  renderTeams();
  renderDemo(state.demo);

  const log = $("log");
  const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 4;
  log.replaceChildren(...state.log.map((line) => {
    const item = document.createElement("li");
    item.className = line.level;
    const time = document.createElement("time");
    time.textContent = line.time;
    item.append(time, line.text);
    return item;
  }));
  if (atBottom) log.scrollTop = log.scrollHeight;
}

// --- Demo → Rohdaten ---

$("demo-choose").addEventListener("click", () => post("/api/demo/choose"));
$("demo-open").addEventListener("click", () => post("/api/demo/open"));
$("faceit-load").addEventListener("click", async () => {
  const { ok, data } = await post("/api/demo/faceit", { link: $("faceit-link").value, key: $("faceit-key").value });
  if (!ok) flash(data.message || "FACEIT-Demo nicht geladen");
});
// Dateien dürfen irgendwo auf die Seite fallen (sonst öffnet der Browser die Datei)
const drop = $("demo-drop");
for (const type of ["dragenter", "dragover"]) {
  document.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add("over"); $("demo").open = true; });
}
document.addEventListener("dragleave", (e) => { if (!e.relatedTarget) drop.classList.remove("over"); });
document.addEventListener("drop", async (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  for (const file of e.dataTransfer.files) {
    const response = await fetch(`/api/demo/upload?name=${encodeURIComponent(file.name)}`, {
      method: "POST", headers: { "X-Auto-Observer": "1" }, body: file,
    });
    if (!response.ok) flash(`${file.name} nicht übernommen`);
  }
});
$("demo-copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("demo-output").textContent);
  $("demo-copied").textContent = "kopiert ✓";
  setTimeout(() => { $("demo-copied").textContent = ""; }, 2000);
});

async function demoText(path, body) {
  $("demo-output-box").hidden = false;
  $("demo-output").textContent = "arbeite …";
  const { ok, data } = await post(path, body);
  $("demo-output").textContent = ok ? data.text : data.message || "Fehler";
}

let demoResultsKey = "";
function renderDemo(demo) {
  if (!demo) { $("demo").hidden = true; return; }
  $("demo-summary").textContent = demo.running ? `– exportiert ${demo.current}${demo.queued ? ` (+${demo.queued})` : ""}`
    : demo.results.length ? `– ${demo.results.length} Datei(en)` : "";
  $("faceit-key").hidden = demo.faceit_key;
  $("demo-log").replaceChildren(...demo.log.map((line) => Object.assign(document.createElement("li"), { textContent: line })));
  const key = JSON.stringify(demo.results);
  if (key === demoResultsKey) return;                    // Eingaben in der Tabelle nicht überschreiben
  demoResultsKey = key;
  const table = $("demo-results");
  table.replaceChildren();
  if (!demo.results.length) return;
  const head = table.insertRow();
  for (const title of ["Datei", "Map", "Runden", "Kills", "MB", ""]) head.append(Object.assign(document.createElement("th"), { textContent: title }));
  for (const result of demo.results) {
    const row = table.insertRow();
    for (const value of [result.file, result.map || "", result.rounds ?? "", result.kills ?? "", (result.size / 1e6).toFixed(1)]) {
      row.insertCell().textContent = value;
    }
    const actions = row.insertCell();
    const round = Object.assign(document.createElement("input"), { type: "number", min: 1, value: 1, className: "round", title: "Runde" });
    const asText = Object.assign(document.createElement("button"), { type: "button", textContent: "Runde als Text" });
    asText.addEventListener("click", () => demoText("/api/demo/round", { file: result.file, round: Number(round.value) }));
    const check = Object.assign(document.createElement("button"), { type: "button", textContent: "Regie prüfen" });
    check.addEventListener("click", () => demoText("/api/demo/evaluate", { file: result.file }));
    actions.append(round, " ", asText, " ", check);
  }
}

async function poll() {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    state = await response.json();
    $("offline-band").hidden = true;
    render();
  } catch {
    $("offline-band").hidden = false;
  }
  setTimeout(poll, 250);
}

poll();
