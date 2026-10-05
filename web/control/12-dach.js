/* CASTING-APP · Steuerseite – DACH CS – offizielle Browserquellen und Stil
   Teil 12 von 13; Reihenfolge und Lageplan: control/01-core.js
   (der Server verbindet alle Dateien zu einem Skript – siehe dort) */

/* ---------- DACH CS – offizielle Browserquellen ---------- */
const DACH_SCENES = [
  ["pregame", "dach-overview", "Overview", "overview"], ["pregame", "dach-singlecast", "Singlecam", "singlecast"], ["pregame", "dach-duocast", "Duocam", "duocast"],
  ["pregame", "dach-lineup", "Teamlineup", "lineup"], ["pregame", "dach-mapveto", "Mapveto", "mapveto"],
  ["during", "dach-ingame", "Ingame / Bounty", "ingame"],
  ["stats", "dach-positions", "Positions", "positions"], ["stats", "dach-table", "Tabelle", "tabelle"], ["stats", "dach-playoffs", "Playoffs", "playoffs"],
  ["stats", "dach-last", "Letzte 5 Matches", "last_matches"], ["stats", "dach-current", "Spieltag", "current_matches"], ["stats", "dach-next", "Nächste 5 Matches", "next_matches"],
  ["stats", "dach-last-a", "Letzte 5 · Team A", "last_matches_f1"], ["stats", "dach-last-b", "Letzte 5 · Team B", "last_matches_f2"],
  ["stats", "dach-next-a", "Nächste 5 · Team A", "next_matches_f1"], ["stats", "dach-next-b", "Nächste 5 · Team B", "next_matches_f2"], ["stats", "dach-mvp", "MVP", "mvp"],
  ["pause", "dach-pause", "Pausescreen", "pause"], ["pause", "dach-content", "Contentpause", "pause_content"], ["pause", "dach-owncontent", "Eigene Contentpause", "pause_own_content"],
  ["pause", "dach-inter1", "Interaktion Single", "singleinteraction"], ["pause", "dach-inter2", "Interaktion Duo", "duointeraction"],
  ["post", "dach-interview1", "Interview Single", "solo_interview"], ["post", "dach-interview2", "Interview Duo", "duointerview"], ["post", "dach-end", "Endscreen", "endscreen"]
];
const DACH_GROUPS = { pregame: "Vor dem Spiel", during: "Im Spiel", stats: "Stats & Liga", pause: "Pause", post: "Nach dem Spiel" };
let dachMode = () => Z.theme === "dachcs-official";
const dachObsName = n => "DACH – " + n;
// Nutzer-ID und Key verlassen die App nie wieder – die Seite erfährt nur, OB sie gespeichert sind
let dachInfo = { idSet: false, keySet: false };
async function dachInfoFetch() {
  try { dachInfo = await (await fetch("/api/dach-access", { cache: "no-store" })).json(); } catch (err) {}
  $("dachId").value = ""; $("dachId").placeholder = dachInfo.idSet ? "✓ gespeichert" : "z. B. 123";
  $("dachKey").value = ""; $("dachKey").placeholder = dachInfo.keySet ? "✓ Key gespeichert – zum Ersetzen neuen einfügen" : "Key einfügen …";
  $("dachDelete").disabled = !dachInfo.idSet && !dachInfo.keySet;
}
$("dachSave").onclick = async () => {
  const r = await fetch("/api/dach-access", { method: "POST", body: JSON.stringify({ userid: $("dachId").value.trim(), key: $("dachKey").value.trim() }) });
  const j = await r.json().catch(() => ({}));
  $("dachKey").value = ""; if (r.ok) $("dachId").value = "";    // ID und Key sofort aus der Seite entfernen
  $("dachStatus").textContent = r.ok ? `✓ Gespeichert (${j.persistent === false ? "nur für diese Sitzung" : "verschlüsselt"}${j.keySet ? "" : ", Key fehlt noch"}).` : (j.error || "Speichern fehlgeschlagen");
  dachInfoFetch();
};
$("dachKey").addEventListener("keydown", ev => { if (ev.key === "Enter") $("dachSave").click(); });
$("dachDelete").onclick = async () => {
  if (!await confirmDialog({ title: "DACH-CS-Zugang löschen?", text: "Nutzer-ID und Key werden aus der App entfernt. Die DACH-Browserquellen in OBS zeigen dann einen Hinweis statt der Grafiken.", button: "Löschen" })) return;
  await fetch("/api/dach-access", { method: "DELETE" }); dachInfoFetch(); $("dachStatus").textContent = "Zugang gelöscht.";
};


let dachSwitch = async function (k) {
  const e = DACH_SCENES.find(x => x[1] === k); if (!e) return;
  Z.dach = Object.assign({}, Z.dach, { scene: k }); scenesDraw(); send();
  if ($("frame").getAttribute("src") !== K.dachUrl(e[3])) $("frame").src = K.dachUrl(e[3]);   // Vorschau zeigt die DACH-Seite
  if (channel.obs.isOpen) { try { await channel.obs.question("SetCurrentProgramScene", { sceneName: dachObsName(e[2]) }); } catch (err) { toastError && toastError("OBS-Szene „" + dachObsName(e[2]) + "“ fehlt – Setup → Aussehen → „In OBS einrichten“"); } }
};
const toastError = t => { if ($("dachObsStatus")) $("dachObsStatus").textContent = t; };
function dachScenesDraw(box) {
  box.classList.remove("arrange"); box.classList.add("columns");
  const cur = Z.broadcast.scene;
  Object.entries(DACH_GROUPS).forEach(([g, title]) => {
    const sceneColumn = document.createElement("div"); sceneColumn.className = "scene-column";
    sceneColumn.innerHTML = `<div class="scene-group">${esc(title)}</div>`;
    DACH_SCENES.filter(x => x[0] === g).forEach(([, k, n]) => {
      const b = document.createElement("button"); b.textContent = n; b.dataset.sceneDef = k;
      if (k === cur) b.classList.add("active");
      b.onclick = () => dachSwitch(k);
      sceneColumn.appendChild(b);
    });
    box.appendChild(sceneColumn);
  });
  box.style.setProperty("--scene-columns", Object.keys(DACH_GROUPS).length);
}
dachInfoFetch();


/* ---------- DACH CS – Offiziell als Stil (eine Quelle) ---------- */
const DACH_STYLE = "dachcs-official";
dachMode = () => Z.theme === DACH_STYLE;
dachSwitch = function (k) { if (!K.DACH_PAGES[k]) return; Z.broadcast.scene = k; Z.dach = Object.assign({}, Z.dach, { scene: k }); scenesDraw(); send(); };
function dachCardShow() { const card = document.querySelector(".dach-card"); if (card) card.hidden = !dachMode(); }
const DFRAME_NAMES = { c1: "Caster 1", c2: "Caster 2", guest: "Gast", content: "Inhalt" };
function dframeDraw() {
  const sel = $("dframeSide"); if (!sel) return;
  const pages = Object.keys(K.DACH_FRAME);
  if (!sel.options.length) pages.forEach(s => sel.appendChild(new Option(DACH_SCENES.find(x => x[3] === s)[2], s)));
  const page = sel.value || pages[0], r = K.dachFrame(Z, page), box = $("dframeFields"); box.innerHTML = "";
  Object.entries(r).forEach(([q, w]) => {
    const z = document.createElement("div"); z.className = "dframe-row";
    z.innerHTML = `<b>${DFRAME_NAMES[q] || q}</b>` + ["x", "y", "w", "h"].map(f => `<label class="small">${f.toUpperCase()}<input type="number" step="1" data-f="${f}" value="${w[f]}"></label>`).join("");
    z.querySelectorAll("input").forEach(i => i.oninput = () => {
      Z.dachFrame = Z.dachFrame || {}; Z.dachFrame[page] = Z.dachFrame[page] || {};
      Z.dachFrame[page][q] = Object.assign({}, K.dachFrame(Z, page)[q], { [i.dataset.f]: Math.round(+i.value || 0) }); laterSend();
    });
    box.appendChild(z);
  });
  $("dframeShow").checked = !!(Z.dach || {}).frameShow;
}
$("dframeSide") && ($("dframeSide").onchange = () => { dframeDraw(); const k = DACH_SCENES.find(x => x[3] === $("dframeSide").value); if (k && dachMode()) dachSwitch(k[1]); });
$("dframeShow") && ($("dframeShow").onchange = () => { Z.dach = Object.assign({}, Z.dach, { frameShow: $("dframeShow").checked }); send(); });
$("dframeDefault") && ($("dframeDefault").onclick = () => { if (Z.dachFrame) delete Z.dachFrame[$("dframeSide").value]; dframeDraw(); send(); });
