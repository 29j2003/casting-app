/* cast/07-graphics.js · Einblendungen über jeder Szene (Teil von cast.js, siehe cast/01-base.js) */
/* ---------- Einblendungen (über jeder Szene) ---------- */
let gfxTimer = null,
  factTimer = null,
  factNum = 0;
// welche Map läuft gerade, welche kommt als Nächstes (aus Veto & Serie)
function currentMap() {
  const maps = playedMaps();
  let i = maps.findIndex(x => (x.result || {}).status === "running");
  if (i < 0) i = maps.findIndex(x => (x.result || {}).status !== "done");
  if (i < 0) i = maps.length - 1;
  return { cur: maps[i] || null, next: maps[i + 1] || null };
}
function gfxContent(e) {
  if (e.type === "score")
    return `<div class="team-logo a"></div><div class="gfx-score-value"><span data-team-score="a"></span><span class="dp">:</span><span data-team-score="b"></span></div><div class="team-logo b"></div>`;
  if (e.type === "caster") {
    const who = ["c1", "c2"]
      .concat(e.guest ? ["guest"] : [])
      .map(k => Z.caster[k] || {})
      .filter(c => c.name);
    return (
      `<div class="gfx-caster-list ${e.arrangement === "sidebyside" ? "beside" : ""}">` +
      who
        .map(
          c =>
            `<div class="box gfx-caster"><div class="box-head">${esc(c.name)}</div><div class="box-field">${esc(c.addition || "")}</div></div>`
        )
        .join("") +
      `</div>`
    );
  }
  if (e.type === "mapinfo") {
    const { cur, next } = currentMap();
    if (!cur)
      return `<div class="gfx-mapinfo-bar"><b>${esc(Z.texts.mapVeto)}</b><span class="gfx-mapinfo-map">–</span></div>`;
    const who =
      cur.action === "decider" || !cur.team
        ? `<b>${esc(Z.texts.decider)}</b>`
        : `<b>${esc(Z.texts.pick)}</b><div class="team-logo ${teamKey(cur.team)}"></div>`;
    return `<div class="gfx-mapinfo-bar">${who}<span class="gfx-mapinfo-map">${esc(cur.map)}</span>${next ? `<span class="gfx-mapinfo-next">${esc(Z.texts.next)}: ${esc(next.map)}</span>` : ""}</div>`;
  }
  if (e.type === "scoreboard") {
    if (!liveData)
      return `<div class="box-head">${esc(Z.texts.scoreboard)}</div><div class="box-field">${wait()}</div>`;
    return `<div class="box-head">${esc(Z.texts.scoreboard)} · <span>${esc(MAPNAME(liveData.map))}</span></div>
        <div class="gfx-sb"><div class="live-table compact" data-team="a">${tableHtml("a", true)}</div><div class="live-table compact" data-team="b">${tableHtml("b", true)}</div></div>`;
  }
  if (e.type === "players") {
    const p = liveData && (liveData.players.find(x => x.id === (e.playersId || liveData.observed)) || null);
    if (!p) return `<div class="box-head">${esc(Z.texts.players || "")}</div><div class="box-field">${wait()}</div>`;
    const team = p.side === sideFrom("a") ? "a" : "b";
    return `<div class="box-head"><div class="team-logo ${team}"></div><span>${esc(p.name)}</span></div>
        <div class="box-field gfx-player-stats"><div><b>${p.k}/${p.d}/${p.a}</b><span>K/D/A</span></div><div><b>${p.adr}</b><span>ADR</span></div><div><b>${p.hs}%</b><span>HS</span></div><div><b>${p.mvps}</b><span>MVP</span></div></div>`;
  }
  if (e.type === "mapfact") {
    const map = e.map || (currentMap().cur || {}).map || "";
    const pool = mapImage(map),
      facts = (pool.facts || []).filter(Boolean);
    const num = e.fact >= 0 ? e.fact : factNum;
    const text = facts.length ? facts[num % facts.length] : "";
    return `<div class="box-head">${esc(Z.texts.mapFact)}${map ? " · " + esc(map) : ""}</div><div class="box-field">${esc(text)}</div>`;
  }
  return `<div class="box-head">${esc(e.title || "")}</div><div class="box-field">${esc(e.text || "")}</div>`;
}
function graphics() {
  if (EMBEDDED) return;
  let stageLayer = document.querySelector(".gfx-layer");
  if (!stageLayer) {
    stageLayer = document.createElement("div");
    stageLayer.className = "gfx-layer";
    document.body.appendChild(stageLayer);
  }
  const now = Date.now(),
    list = Z.graphics || [];
  let nextEnd = 0,
    factSec = 0;
  list.forEach(e => {
    let d = stageLayer.querySelector(`[data-id="${CSS.escape(e.id)}"]`);
    if (!d) {
      d = document.createElement("div");
      d.dataset.id = e.id;
      stageLayer.appendChild(d);
    }
    const pos = K.GFX_POSITIONS.includes(e.pos) ? e.pos : K.GFX_DEFAULT_POS[e.type] || "bl";
    const cssClass =
      `gfx gfx-${e.type} pos-${pos}` + (e.type === "caster" ? "" : " box") + (e.title ? "" : " without-title");
    const content = gfxContent(e);
    if (d.dataset.cacheKey !== cssClass + content) {
      const had = d.classList.contains("on");
      d.dataset.cacheKey = cssClass + content;
      d.className = cssClass + (had ? " on" : "");
      d.innerHTML = content;
    }
    const visible = K.gfxVisible(e, now, currentSceneName());
    d.classList.toggle("on", visible);
    const switchTo = K.gfxNextSwitch(e, now);
    if (switchTo) nextEnd = nextEnd ? Math.min(nextEnd, switchTo) : switchTo;
    if (visible && e.type === "mapfact" && !(e.fact >= 0)) factSec = Math.max(4, +e.seconds || 12);
  });
  [...stageLayer.children].forEach(d => {
    if (!list.some(e => e.id === d.dataset.id)) d.remove();
  });
  clearTimeout(gfxTimer);
  if (nextEnd) gfxTimer = setTimeout(graphics, nextEnd - now + 30);
  // Map-Fakten nacheinander zeigen
  if (factSec && !factTimer)
    factTimer = setInterval(() => {
      factNum++;
      graphics();
      teams();
    }, factSec * 1000);
  if (!factSec && factTimer) {
    clearInterval(factTimer);
    factTimer = null;
  }
}
