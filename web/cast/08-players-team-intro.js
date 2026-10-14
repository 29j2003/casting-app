/* cast/08-players-team-intro.js · Spielerkarten und die Teams-Vorstellung (Folien) (Teil von cast.js, siehe cast/01-base.js) */
/* ---------- Spieler ---------- */
/* Fünf Spielerkarten eines Teams (Aufstellung, Teams-Vorstellung); leere Plätze als „–“ */
function playerCards(k) {
  const list = ((Z.players || {})[k] || []).slice(0, 5);
  while (list.length < 5) list.push(null);
  return list
    .map(p => {
      if (!p || !p.name)
        return `<div class="box players-card empty"><div class="players-image"></div><div class="box-head">–</div><div class="box-field"></div></div>`;
      const image = p.image
        ? `<img${p.imageMode === "whole" ? ' class="whole"' : ""} src="${esc(p.image)}" alt="">`
        : `<div class="initial">${esc(p.name[0].toUpperCase())}</div>`;
      const level = p.level ? `<div class="players-level">${esc(p.level)}</div>` : "";
      return `<div class="box players-card"><div class="players-image">${image}${level}</div><div class="box-head">${esc(p.name)}</div><div class="box-field">${esc(p.real || "")}</div></div>`;
    })
    .join("");
}
function players() {
  const boxes = $$(".lineup[data-team]");
  if (!boxes.length) return;
  const keyName = JSON.stringify(Z.players);
  boxes.forEach(box => {
    if (!newNeeded(box, keyName)) return;
    const k = box.dataset.team;
    box.innerHTML =
      `<div class="box lineup-team"><div class="team-logo ${k}"></div><div class="box-field"><span data-team-name="${k}" data-matching></span></div></div>` +
      playerCards(k);
  });
}

/* ---------- Teams-Vorstellung: Folien Team A · Team B · Vergleich ----------
   Welche Folie läuft: von Hand (slide) oder automatisch alle `auto` s ab `started` – jeder Browser rechnet gleich. */
function teamIntroSlide() {
  const I = Z.teamIntro || {},
    on = I.slides || {};
  const order = ["a", "b", "compare"].filter(k => on[k] !== false);
  if (!order.length) return "a";
  if (I.auto > 0 && I.started)
    return order[Math.floor(Math.max(0, Date.now() - I.started) / (I.auto * 1000)) % order.length];
  return order.includes(I.slide) ? I.slide : order[0];
}
function teamIntro() {
  const boxes = $$(".ti-slides");
  if (!boxes.length) return;
  const I = Z.teamIntro || {},
    S = I.stats || {},
    W = key => esc(K.word(Z, key)),
    slide = teamIntroSlide();
  boxes.forEach(b => {
    const root = b.parentElement;
    if (root.dataset.tislide === slide) return;
    const first = !root.dataset.tislide;
    root.dataset.tislide = slide;
    if (first) return;
    // Folienwechsel wie ein Szenenwechsel: die alte Folie blendet aus, die Kästen der neuen kommen nacheinander
    const s = b.querySelector(`.ti-slide[data-slide="${slide}"]`);
    if (s) {
      s.classList.remove("ti-in");
      void s.offsetWidth;
      s.classList.add("ti-in");
    }
  });
  const keyName = JSON.stringify([I.stats, I.rows, I.h2h, Z.players, Z.overlayLanguage]);
  const fresh = boxes.filter(b => newNeeded(b, keyName));
  if (!fresh.length) return;
  const value = (k, f) => {
    const v = String((S[k] || {})[f] ?? "").trim();
    if (!v) return "–";
    if (f === "winrate") return esc(v.replace(/\s*%$/, "")) + " %";
    if (f === "last")
      return `<span class="ti-form">${[...v.toUpperCase().replace(/[^WLSN]/g, "")]
        .slice(0, 5)
        .map(c => (/[WS]/.test(c) ? `<i class="s">${W("formWin")}</i>` : `<i class="n">${W("formLoss")}</i>`))
        .join("")}</span>`;
    return esc(v);
  };
  const head = k => {
    const seed = String((S[k] || {}).seed || "").trim();
    return seed
      ? `${W("seed")} ${esc(seed.startsWith("#") ? seed : "#" + seed)}`
      : `${W("tableTeam")} ${k.toUpperCase()}`;
  };
  fresh.forEach(b => {
    b.querySelectorAll("[data-ti-word]").forEach(e => {
      e.innerHTML = W(e.dataset.tiWord);
    });
    b.querySelectorAll("[data-ti]").forEach(e => {
      const [k, f] = e.dataset.ti.split(".");
      e.innerHTML = f === "head" ? head(k) : value(k, f);
    });
    b.querySelectorAll("[data-ti-players]").forEach(box => {
      box.innerHTML = playerCards(box.dataset.tiPlayers);
    });
    // Vergleich: nur die eingeschalteten Zeilen (I.rows, fehlt = an); „Direkter Vergleich“ nur mit Bilanz (I.h2h)
    const rows = I.rows || {},
      h2h = I.h2h || {};
    b.querySelectorAll("[data-ti-tape]").forEach(e => {
      const list = [
        ["seed", "seed"],
        ["winRate", "winrate"],
        ["matches", "matches"],
        ["streak", "streak"],
        ["lastFive", "last"],
      ]
        .filter(([, f]) => rows[f] !== false)
        .map(
          ([w, f]) =>
            `<div>${f === "seed" ? value("a", f).replace(/^(?!–|#)/, "#") : value("a", f)}</div><div class="lab">${W(w)}</div><div>${f === "seed" ? value("b", f).replace(/^(?!–|#)/, "#") : value("b", f)}</div>`
        );
      const ha = String(h2h.a ?? "").trim(),
        hb = String(h2h.b ?? "").trim();
      if (rows.h2h !== false && (ha || hb))
        list.push(`<div>${esc(ha || "0")}</div><div class="lab">${W("headToHead")}</div><div>${esc(hb || "0")}</div>`);
      e.innerHTML = list.join("");
      e.style.setProperty("--ti-rows", Math.max(1, list.length));
    });
  });
}
// automatisch weiter: nur nachsehen, solange die Szene da ist und „automatisch“ an ist
setInterval(() => {
  if ((Z.teamIntro || {}).auto > 0 && document.querySelector(".ti-slides")) teamIntro();
}, 500);
