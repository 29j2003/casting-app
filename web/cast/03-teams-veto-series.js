/* cast/03-teams-veto-series.js · Teams, Map-Veto und Serie (Teil von cast.js, siehe cast/01-base.js) */
/* ---------- Teams ---------- */
function teams() {
  ["a", "b"].forEach(k => {
    const t = Z.teams[k] || {};
    $$(`.team-logo.${k}`).forEach(e => {
      const words = String(t.name || k)
        .split(/\s+/)
        .filter(Boolean);
      const abbrev = t.short
        ? String(t.short).toUpperCase()
        : (words.length > 1 ? words.map(w => w[0]).join("") : words[0] || k)
            .replace(/[^A-Za-z0-9ÄÖÜäöü]/g, "")
            .slice(0, 3)
            .toUpperCase();
      const fresh = t.logo ? `<img src="${esc(t.logo)}" alt="">` : esc(abbrev);
      if (e.dataset.content !== fresh) {
        e.dataset.content = fresh;
        e.innerHTML = fresh;
        const img = e.querySelector("img");
        if (img)
          img.addEventListener(
            "error",
            () => {
              e.innerHTML = esc(abbrev);
              e.classList.add("noOne");
            },
            { once: true }
          );
      }
      e.classList.toggle("noOne", !t.logo);
    });
    // Text nur bei neuem Namen setzen – fit() entscheidet, ob Name oder Kürzel dasteht
    $$(`[data-team-name="${k}"]`).forEach(e => {
      // Teams-Vorstellung: eigener Anzeigename (nur dort – CS2, Spielstand & Co. behalten den Namen aus dem Match)
      const shown = e.classList.contains("ti-name") && String(((Z.teamIntro || {}).names || {})[k] || "").trim();
      const full = shown || t.name || "",
        short = shown ? "" : t.short || "";
      if (e.dataset.full === full && e.dataset.short === short) return;
      e.dataset.full = full;
      e.dataset.short = short;
      e.textContent = full;
    });
    $$(`[data-team-score="${k}"]`).forEach(e => {
      const v = String(t.score ?? 0);
      if (e.textContent !== v) e.textContent = v;
    });
  });
  $$(".vs").forEach(e => {
    const res = Z.teams.result;
    e.classList.toggle("result", !!res);
    const h = res ? `${esc(Z.teams.a.score ?? 0)}<span class="dp">:</span>${esc(Z.teams.b.score ?? 0)}` : "vs";
    if (e._html !== h) {
      e._html = h;
      e.innerHTML = h;
    } // bis zu 5×/s bei CS2-Daten – nur bei Änderung
  });
}

/* ---------- Map-Veto ---------- */
const normMap = K.normMap;
function mapImage(name) {
  return (Z.mapPool || []).find(x => normMap(x.name) === normMap(name)) || {};
}
function vetoSteps() {
  const V = Z.veto || {};
  if (V.steps && V.steps.length) return V.steps;
  const p = (Z.vetoPresets || {})[V.format] || K.DEFAULT.vetoPresets.bo3;
  return p.steps.map(([action, team]) => ({ action, team, map: "" }));
}
let vetoMaps = [];
function veto() {
  $$(".veto").forEach(box => vetoDraw(box));
}
function vetoDraw(box) {
  const s = vetoSteps();
  const keyName = JSON.stringify([
    s,
    Z.mapPool,
    Z.texts.ban,
    Z.texts.pick,
    Z.texts.decider,
    Z.texts.amTurn,
    Z.texts.running,
  ]);
  if (!newNeeded(box, keyName)) return;
  const upnext = s.findIndex(x => !x.map);
  const width = Math.min(262, Math.floor((1806 - (s.length - 1) * 16) / Math.max(1, s.length)));
  box.style.setProperty("--kb", width + "px");
  const label = { ban: Z.texts.ban, pick: Z.texts.pick, decider: Z.texts.decider };
  box.innerHTML = s
    .map((x, i) => {
      const pool = x.map ? mapImage(x.map) : {};
      const image = x.map ? x.image || pool.image || "" : "";
      const whole = pool.imageMode === "whole" ? ' class="whole"' : "";
      const fresh = x.map && vetoMaps[i] !== x.map && vetoMaps.length ? " fresh" : "";
      const other = x.team === "a" ? "b" : "a";
      const side =
        x.map && x.action === "pick" && x.side
          ? `<div class="veto-side"><span><span data-team-name="${other}"></span> · ${esc(String(x.side).toUpperCase())}</span></div>`
          : "";
      const team = teamKey(x.team)
        ? `<div class="team-logo ${teamKey(x.team)}"></div><span data-team-name="${teamKey(x.team)}"></span>`
        : `<span>${esc(Z.texts.decider)}</span>`;
      const text = x.map ? esc(x.map) : i === upnext ? esc(Z.texts.amTurn) : "?";
      const res = x.map && x.action !== "ban" ? resultBadge(x.result) : "";
      return `<div class="box veto-card ${esc(x.action)}${x.map ? "" : " open"}${i === upnext ? " upnext" : ""}${fresh}">
        <div class="box-head">${esc(label[x.action] || x.action)}</div>
        <div class="veto-image">${image ? `<img${whole} src="${esc(image)}" alt="">` : `<div class="initial">${x.map ? esc(x.map[0]) : ""}</div>`}${res}${side}<div class="veto-map">${text}</div></div>
        <div class="veto-team">${team}</div></div>`;
    })
    .join("");
  vetoMaps = s.map(x => x.map);
}

/* ---------- Serie ---------- */
function resultBadge(e) {
  if (!e || !e.status || e.status === "pending") return "";
  if (e.status === "running" && (e.a === "" || e.a == null))
    return `<div class="veto-result running">${esc(Z.texts.running)}</div>`;
  return `<div class="veto-result${e.status === "running" ? " running" : ""}">${esc(e.a ?? 0)}<span class="dp">:</span>${esc(e.b ?? 0)}</div>`;
}
function playedMaps() {
  return vetoSteps().filter(x => x.action !== "ban" && x.map);
}
function seriesScore() {
  let a = 0,
    b = 0;
  playedMaps().forEach(x => {
    const e = x.result || {};
    if (e.status === "done") {
      if (+e.a > +e.b) a++;
      else if (+e.b > +e.a) b++;
    }
  });
  return [a, b];
}
function series() {
  const [sa, sb] = seriesScore();
  const total = `${sa}<span class="dp">:</span>${sb}`;
  $$(".series-total").forEach(e => {
    if (e._html !== total) {
      e._html = total;
      e.innerHTML = total;
    }
  });
  const maps = playedMaps();
  const keyName = JSON.stringify([maps, Z.mapPool, Z.texts.map, Z.texts.running, Z.texts.pending]);
  $$(".series-cards").forEach(k => {
    if (newNeeded(k, keyName)) seriesDraw(k, null, maps);
  });
  $$(".series-mini").forEach(m => {
    if (newNeeded(m, keyName)) seriesDraw(null, m, maps);
  });
}
function seriesDraw(cards, mini, maps) {
  if (cards && !maps.length) cards.innerHTML = `<div class="empty-hint">${esc(K.word(Z, "noMaps"))}</div>`;
  if (cards && maps.length) {
    const width = Math.min(360, Math.floor((1806 - (Math.max(1, maps.length) - 1) * 20) / Math.max(1, maps.length)));
    cards.style.setProperty("--kb", width + "px");
    cards.innerHTML = maps
      .map((x, i) => {
        const e = x.result || {},
          pool = mapImage(x.map),
          image = x.image || pool.image || "";
        const status = e.status || "pending";
        const winner = status === "done" ? (+e.a > +e.b ? "a" : +e.b > +e.a ? "b" : "") : "";
        const noScore = status === "pending" || (status === "running" && (e.a === "" || e.a == null));
        const score = noScore
          ? ""
          : `<div class="series-score"><span class="${winner === "b" ? "lost" : ""}">${esc(e.a ?? 0)}</span><span class="dp">:</span><span class="${winner === "a" ? "lost" : ""}">${esc(e.b ?? 0)}</span></div>`;
        const foot = winner
          ? `<div class="team-logo ${winner}"></div><span data-team-name="${winner}"></span>`
          : `<span>${esc(status === "running" ? Z.texts.running : Z.texts.pending)}</span>`;
        return `<div class="box series-card ${esc(status)}"><div class="box-head">${esc(Z.texts.map)} ${i + 1}</div>
          <div class="veto-image">${image ? `<img${pool.imageMode === "whole" ? ' class="whole"' : ""} src="${esc(image)}" alt="">` : `<div class="initial">${esc(x.map[0])}</div>`}${score}<div class="veto-map">${esc(x.map)}</div></div>
          <div class="veto-team">${foot}</div></div>`;
      })
      .join("");
  }
  if (mini) {
    mini.innerHTML = maps
      .filter(x => (x.result || {}).status && x.result.status !== "pending")
      .map(
        x =>
          `<div class="series-chip ${esc(x.result.status)}"><b>${esc(x.map)}</b><span>${
            x.result.a === "" || x.result.a == null
              ? esc(Z.texts.running)
              : `${esc(x.result.a)}<span class="dp">:</span>${esc(x.result.b ?? 0)}`
          }</span></div>`
      )
      .join("");
  }
}
