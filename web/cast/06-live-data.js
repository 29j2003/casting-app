/* cast/06-live-data.js · CS2-Livedaten (GSI): Scoreboard, Live-Tabelle (Teil von cast.js, siehe cast/01-base.js) */
/* ---------- CS2-Livedaten ---------- */
let liveData = null;
const MAPNAME = n => {
  const raw = String(n || "").replace(/^(de|cs|ar)_/, "");
  const p = (Z.mapPool || []).find(m => normMap(m.name) === normMap(raw));
  return p ? p.name : raw.charAt(0).toUpperCase() + raw.slice(1);
};
const sideFrom = team => (!liveData ? "" : team === "a" ? liveData.sideA : liveData.sideA === "CT" ? "T" : "CT");
const strength = p => p.adr + 2 * (p.k - p.d); // „stärkster Spieler“: Schaden pro Runde + 2 × (Kills − Tode)
const playersFrom = team =>
  !liveData
    ? []
    : liveData.players
        .filter(p => p.side === sideFrom(team))
        .sort((x, y) => y.k - x.k || y.adr - x.adr)
        .slice(0, 5);
const pointsFrom = team => (!liveData ? 0 : (sideFrom(team) === "CT" ? liveData.ct : liveData.t).score);
function h2hPair() {
  const w = team => {
    const l = playersFrom(team),
      chosen = (Z.h2h || {})[team] || "";
    return l.find(p => p.id === chosen) || l.slice().sort((x, y) => strength(y) - strength(x))[0];
  };
  return [w("a"), w("b")];
}
const wait = () => `<div class="live-wait">${esc(Z.texts.waitCs2 || "")}</div>`;
function tableHtml(team, compact) {
  const l = playersFrom(team);
  const head = `<div class="stat-head"><div class="team-logo ${team}"></div><span data-team-name="${team}"></span><b class="stat-points">${pointsFrom(team)}</b><span class="stat-side">${sideFrom(team)}</span></div>`;
  const columns = compact ? ["K", "D", "ADR"] : ["K", "D", "A", "ADR", "HS %"];
  const rows = l
    .map(
      p =>
        `<div class="stat-row${p.hp <= 0 ? " dead" : ""}${liveData.observed === p.id ? " focused" : ""}"><span class="stat-name">${esc(p.name)}</span>` +
        (compact ? [p.k, p.d, p.adr] : [p.k, p.d, p.a, p.adr, p.hs]).map(v => `<span>${v}</span>`).join("") +
        `</div>`
    )
    .join("");
  return (
    head +
    `<div class="stat-row stat-title"><span class="stat-name"></span>${columns.map(s => `<span>${s}</span>`).join("")}</div>` +
    rows
  );
}
function liveDraw() {
  const da = !!liveData;
  let changed = false; // CS2 schickt bis zu 5×/s – nur Neues weiterreichen
  // ohne CS2-Daten steht der Match-Titel im Kopf (nie ein leeres Feld)
  $$(".live-info").forEach(e => {
    const t = da
      ? `${MAPNAME(liveData.map)} · ${Z.texts.round || K.word(Z, "round")} ${liveData.round + 1}`
      : Z.texts.title || "";
    if (e.textContent !== t) e.textContent = t;
  });
  $$(".live-table").forEach(e => {
    const team = e.dataset.team,
      h = da ? tableHtml(team, e.classList.contains("compact")) : wait();
    if (newNeeded(e, h)) {
      e.innerHTML = h;
      changed = true;
    }
  });
  $$(".live-team").forEach(e => {
    const team = e.dataset.team;
    const h = !da
      ? wait()
      : playersFrom(team)
          .map(
            p => `<div class="box stat-card"><div class="box-head">${esc(p.name)}</div><div class="box-field">
          <div class="stat-large"><b>${p.k}</b><span>/</span><b>${p.d}</b><span>/</span><b>${p.a}</b></div><div class="stat-small">K / D / A</div>
          <div class="stat-values"><div><b>${p.adr}</b><span>ADR</span></div><div><b>${p.hs}%</b><span>HS</span></div><div><b>${p.mvps}</b><span>MVP</span></div></div></div></div>`
          )
          .join("");
    if (newNeeded(e, h)) {
      e.innerHTML = h;
      changed = true;
    }
  });
  $$(".live-h2h").forEach(e => {
    const [pa, pb] = da ? h2hPair() : [];
    let h = wait();
    if (pa && pb) {
      const row = (name, va, vb, moreBetter = true) => {
        const sum = va + vb,
          wa = sum ? Math.round((100 * va) / sum) : 50; // beide 0: neutral in der Mitte
        const leads = va === vb ? "" : va > vb === moreBetter ? "a" : "b";
        return `<div class="h2h-row"><b class="${leads === "a" ? "front" : ""}">${va}</b><div class="h2h-bar"><i style="width:${wa}%"></i></div><span>${name}</span><div class="h2h-bar b"><i style="width:${100 - wa}%"></i></div><b class="${leads === "b" ? "front" : ""}">${vb}</b></div>`;
      };
      h = `<div class="h2h-players"><div class="box"><div class="box-head"><span data-team-name="a"></span></div><div class="box-field">${esc(pa.name)}</div></div>
             <div class="box"><div class="box-head"><span data-team-name="b"></span></div><div class="box-field">${esc(pb.name)}</div></div></div>
             <div class="h2h-values">${row("KILLS", pa.k, pb.k)}${row("DEATHS", pa.d, pb.d, false)}${row("ASSISTS", pa.a, pb.a)}${row("ADR", pa.adr, pb.adr)}${row("HS %", pa.hs, pb.hs)}${row("MVPs", pa.mvps, pb.mvps)}</div>`;
    }
    if (newNeeded(e, h)) {
      e.innerHTML = h;
      changed = true;
    }
  });
  if (changed) teams(); // Teamnamen/Logos in neu gezeichneten Teilen
  if ((Z.graphics || []).some(x => x.on && (x.type === "scoreboard" || x.type === "players"))) graphics();
}
