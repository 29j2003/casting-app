/* cast/05-tournament.js · Turnier im Overlay: Turnierbaum, Tabellen, Profil, weiche Wechsel (Teil von cast.js, siehe cast/01-base.js) */
/* ---------- Turnierbaum ---------- */
function tournamentDraw() {
  const boxes = $$(".tournament-tree");
  if (!boxes.length) return;
  const T = Z.tournament || {},
    B = K.tournamentBuild(T, Z.overlayLanguage),
    S = T.visible || {};
  const W = key => esc(K.word(Z, key)); // feste Wörter in der Sprache der Overlays
  const teamFrom = id => (T.teams || []).find(t => t.id === id);
  const focus = T.focused && teamShown(B, T, T.focused) ? T.focused : "";
  const row = (id, points, winner, hidden) => {
    if (id === "BYE")
      return `<div class="bracket-team free"><div class="bracket-logo"></div><span>${esc(K.word(Z, "bye"))}</span><b></b></div>`;
    const t = teamFrom(id);
    if (!t || hidden)
      return `<div class="bracket-team open"><div class="bracket-logo"></div><span>${hidden ? "?" : "–"}</span><b></b></div>`;
    const logo = t.logo ? `<img src="${esc(t.logo)}" alt="">` : esc((t.short || t.name || "?").slice(0, 3));
    return `<div class="bracket-team${winner ? " winner" : ""}${focus === id ? " focused" : ""}"><div class="bracket-logo">${logo}</div><span>${esc(t.name || "")}</span><b>${S.resultsOff || points == null || points === "" ? "" : esc(points)}</b></div>`;
  };
  // Sichtbarkeit: „aufdecken“ = nur bis Runde X, „ab“ = erst ab Runde X, sonst alles
  const show = num =>
    S.mode === "reveal" ? num <= (+S.round || 1) : S.mode === "fromRound" ? num >= (+S.round || 1) : true;
  const card = (m, hidden) =>
    `<div class="bracket-match${m.done ? " done" : ""}${focus && (m.a === focus || m.b === focus) ? " in-focus" : ""}">` +
    row(m.a, m.sa, m.winner && m.winner === m.a, hidden) +
    row(m.b, m.sb, m.winner && m.winner === m.b, hidden) +
    `</div>`;
  const columns = (rounds, start) =>
    rounds
      .map((r, i) =>
        !show(start + i) && S.mode === "fromRound"
          ? ""
          : `<div class="bracket-round"><div class="bracket-title">${esc(r.title)}</div><div class="bracket-games">${r.matches.map(m => card(m, !show(start + i))).join("")}</div></div>`
      )
      .join("");
  // Profil des hervorgehobenen Teams (Klick in der App) – nur, wenn das Team gerade zu sehen ist (eine andere Gruppe:
  // weder Profil noch Markierung). Es steht nie über dem Turnier: in einem freien Feld des Gruppen-Rasters (die Tabellen
  // bleiben, wo sie sind), sonst daneben (das Turnier wird schmaler).
  const f = focus && teamFrom(focus);
  let profile = "";
  if (f) {
    const st = f.stats || {};
    profile +=
      `<div class="bracket-profile box"><div class="box-head">${esc(f.name || "")}</div><div class="box-field">` +
      (f.players && f.players.length
        ? `<div class="bracket-players">${f.players
            .slice(0, 7)
            .map(n => `<span>${esc(n)}</span>`)
            .join("")}</div>`
        : "") +
      (st.matches
        ? `<div class="bracket-stats"><div><b>${esc(st.winrate)}%</b><span>${W("winRate")}</span></div><div><b>${esc(st.matches)}</b><span>${W("matches")}</span></div><div><b>${esc(st.series || 0)}</b><span>${W("streak")}</span></div></div>` +
          (st.last && st.last.length
            ? `<div class="bracket-form">${st.last
                .slice(0, 5)
                .map(x => `<i class="${x === "1" ? "s" : "n"}">${x === "1" ? W("formWin") : W("formLoss")}</i>`)
                .join("")}</div>`
            : "")
        : "") +
      `</div></div>`;
  }
  let h = "",
    inCell = false;
  if (!B.teams || B.teams.length < 2) h = `<div class="live-wait">${esc(K.word(Z, "noTournament"))}</div>`;
  else if (B.format === "table") {
    const choice = T.showGroup === undefined || T.showGroup === "" ? null : +T.showGroup;
    const shown = B.groups.filter((g, i) => choice === null || i === choice);
    const columns = shown.length <= 1 ? 1 : shown.length <= 4 ? 2 : shown.length <= 6 ? 3 : 4;
    inCell = shown.length > 1 && shown.length % columns !== 0; // freies Feld im Raster (z. B. 5 Gruppen in 3 Spalten)
    h =
      `<div class="bracket-tables" style="grid-template-columns:repeat(${columns}, 860px)">${shown
        .map(
          g =>
            `<div class="bracket-tab"><div class="bracket-title">${esc(g.name)}</div>
        <div class="bracket-tz head"><span>#</span><span></span><span>${W("tableTeam")}</span><span>${W("tableGames")}</span><span>${W("tableWins")}</span><span>${W("tableLosses")}</span><span>${g.withRounds ? "RD" : "+/−"}</span><span>${W("tablePoints")}</span></div>` +
            g.table
              .map((r, i) => {
                const t = teamFrom(r.id) || {};
                return (
                  `<div class="bracket-tz${i < (+T.nextPlaces || 0) ? " proceed" : ""}${focus === r.id ? " focused" : ""}"><span>${i + 1}</span><div class="bracket-logo">${t.logo ? `<img src="${esc(t.logo)}" alt="">` : esc((t.short || t.name || "?").slice(0, 3))}</div>` +
                  `<span class="bracket-tname">${esc(t.name || "")}</span><span>${esc(r.played)}</span><span>${esc(r.wins)}</span><span>${esc(r.losses)}</span><span>${r.tiebreak > 0 ? "+" : ""}${esc(r.tiebreak)}</span><b>${esc(r.pts)}</b></div>`
                );
              })
              .join("") +
            (T.gamesShow
              ? `<div class="bracket-tspiele">${g.matches
                  .filter(m => !m.done)
                  .slice(0, 4)
                  .map(m => card(m, false))
                  .join("")}</div>`
              : "") +
            `</div>`
        )
        .join("")}` +
      (inCell && profile ? `<div class="bracket-cell">${profile}</div>` : "") +
      `</div>`;
  } else if (B.format === "gsl")
    h = `<div class="bracket-groups">${B.groups
      .filter((g, i) => T.showGroup === undefined || T.showGroup === "" || i === +T.showGroup)
      .map(
        g =>
          `<div class="bracket-group"><div class="bracket-title">${esc(g.name)}</div>${g.matches.map(m => `<div class="bracket-gm"><span>${esc(m.title)}</span>${card(m, false)}</div>`).join("")}</div>`
      )
      .join("")}</div>`;
  else if (B.format === "swiss")
    h =
      `<div class="bracket-row">${columns(B.rounds, 1)}</div>` +
      (B.table.length
        ? `<div class="bracket-swiss">${B.table.map(b => `<div class="bracket-sw ${b.status}">${row(b.id, `${b.wins}–${b.losses}`, b.status === "proceed", false)}</div>`).join("")}</div>`
        : "");
  else {
    h = `<div class="bracket-row">${columns(B.rounds, 1)}</div>`;
    if (B.bottom.length)
      h =
        `<div class="bracket-de"><div class="bracket-row">${columns(B.rounds, 1)}</div><div class="bracket-row bottom">${columns(B.bottom, 1)}</div></div>` +
        (B.finale
          ? `<div class="bracket-round bracket-gf"><div class="bracket-title">GRAND FINAL</div><div class="bracket-games">${card(B.finale, !show(B.rounds.length + 1))}</div></div>`
          : "");
  }
  const side = profile && !inCell ? profile : "";
  const group = `${B.format}|${T.showGroup ?? ""}`;
  $$(".tournament-name").forEach(e => {
    const n = T.name || Z.texts.title || "";
    if (e.textContent !== n) e.textContent = n;
  });
  boxes.forEach(box => {
    if (!newNeeded(box, h + profile + inCell)) return;
    box.querySelectorAll(".bracket-stage.leaving").forEach(e => e.remove()); // ein noch laufender Wechsel ist sofort fertig
    const old = box.querySelector(".bracket-stage");
    const stage = document.createElement("div");
    stage.className = "bracket-stage" + (side ? " with-profile" : "");
    stage.dataset.group = group;
    stage.innerHTML = `<div class="bracket-main"><div class="bracket-inner">${h}</div></div>${side}`;
    box.appendChild(stage);
    // auf die verfügbare Fläche einpassen (neben dem Profil entsprechend schmaler)
    bracketFit(stage);
    if (!old) {
      if (!stage.querySelector(".bracket-main").clientWidth) requestAnimationFrame(() => bracketFit(stage));
      return;
    }
    bracketChange(
      old,
      stage,
      old.dataset.group !== group ? "switch" : old.classList.contains("with-profile") !== !!side ? "glide" : "blend"
    );
  });
}
// Wechsel im Turnier wie bei einem Szenenwechsel, nie als harter Schnitt:
//  switch – andere Gruppe/Ansicht: das Alte blendet aus, danach kommt das Neue (nie zwei Tabellen übereinander)
//  glide  – Profil neben dem Turnier kommt/geht: das Turnier gleitet an seine neue Größe, das Profil blendet
//  blend  – gleiche Ansicht (Team im freien Feld, neue Ergebnisse): das Neue blendet über dem Alten ein, was bleibt, steht still
const BRACKET_EASE = "cubic-bezier(.65,0,.35,1)";
function bracketFit(stage) {
  const m = stage.querySelector(".bracket-main"),
    i = stage.querySelector(".bracket-inner");
  if (!m.clientWidth || !i.scrollWidth) return; // noch ohne Lage (Schicht nicht im Bild) – nächstes Bild
  const s = Math.min(1.6, m.clientWidth / i.scrollWidth, m.clientHeight / i.scrollHeight);
  const x = Math.max(0, (m.clientWidth - i.scrollWidth * s) / 2);
  i.style.transform = `translateX(${x}px) scale(${s})`;
}
function bracketChange(old, stage, kind) {
  old.classList.add("leaving");
  const gone = () => old.remove();
  const ms = 450;
  if (kind === "switch") {
    old
      .animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms * 0.5, easing: BRACKET_EASE, fill: "forwards" })
      .finished.then(gone, gone);
    stage.animate(
      [
        { opacity: 0, transform: "translateY(16px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: ms, delay: ms * 0.45, easing: BRACKET_EASE, fill: "backwards" }
    );
    return;
  }
  if (kind === "glide") {
    const from = old.querySelector(".bracket-inner").style.transform,
      i = stage.querySelector(".bracket-inner");
    i.animate([{ transform: from }, { transform: i.style.transform }], { duration: ms, easing: BRACKET_EASE });
    const card = stage.querySelector(":scope > .bracket-profile");
    if (card)
      card.animate(
        [
          { opacity: 0, transform: "translateX(40px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: ms, delay: ms * 0.3, easing: BRACKET_EASE, fill: "backwards" }
      );
    // das alte Profil (falls es geht) blendet an seinem Platz aus, das alte Turnier ist sofort weg (das neue gleitet von dort)
    old.querySelector(".bracket-main").style.visibility = "hidden";
    old
      .animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms * 0.6, easing: BRACKET_EASE, fill: "forwards" })
      .finished.then(gone, gone);
    return;
  }
  stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms * 0.65, easing: BRACKET_EASE, fill: "backwards" });
  old
    .animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: ms * 0.55,
      delay: ms * 0.35,
      easing: BRACKET_EASE,
      fill: "forwards",
    })
    .finished.then(gone, gone);
}
// Ist das Team im Overlay gerade zu sehen? Bei Tabelle/GSL mit gewählter Gruppe nur die Teams dieser Gruppe
function teamShown(B, T, id) {
  if (!(B.groups || []).length || T.showGroup === undefined || T.showGroup === "") return true;
  const g = B.groups[+T.showGroup];
  if (!g) return true;
  return (g.table || []).some(r => r.id === id) || (g.matches || []).some(m => m.a === id || m.b === id);
}
