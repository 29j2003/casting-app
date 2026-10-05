/* =====================================================================
   CAST-OVERLAY · Szenen-Logik
   Liest den Zustand (von der Steuerseite) und zeichnet die Szene.
   ===================================================================== */
(function () {
  "use strict";
  const K = window.CastCore;
  const P = new URLSearchParams(location.search);
  const TEST = P.get("test") === "1";
  const PREVIEW = P.get("preview") === "1";
  // eingebettet = Szene läuft in overlay.html (eine Browserquelle für alles)
  const EMBEDDED = P.get("embedded") === "1";
  if (PREVIEW) document.body.classList.add("idle");
  if (EMBEDDED) document.body.classList.add("embedded", "waiting");

  let rawState = K.load();                              // Zustand mit Bild-Verweisen (klein)
  let Z = K.resolve(rawState, K.Images.mem);         // Zustand mit echten Bildern (zum Zeichnen)
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pull = path => path.split(".").reduce((o, k) => (o == null ? o : o[k]), Z);

  /* ---------- Theme ---------- */
  function rgb(hex) {
    const m = String(hex).replace("#", "").match(/^([0-9a-f]{6})$/i);
    if (!m) return "255,255,255";
    const n = parseInt(m[1], 16);
    return `${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}`;
  }
  // Jedes Element merkt sich, womit es gezeichnet wurde – so bleiben weiterverwendete Teile
  // beim Szenenwechsel unangetastet (Lauftext läuft weiter, Logos flackern nicht).
  const newNeeded = (el, cacheKey) => { if (el._cacheKey === cacheKey) return false; el._cacheKey = cacheKey; return true; };
  // Akzentfarbe so weit abdunkeln, bis sie auf dem hellen Feld gut lesbar ist (Kontrast ≥ 3)
  function readable(accent, light) {
    const hex = h => { const m = String(h).replace("#", ""); const n = parseInt(m.length === 3 ? m.split("").map(x => x + x).join("") : m, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
    const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
    const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    let color = hex(accent); const bg = hex(light || "#f6f6f6");
    for (let i = 0; i < 40 && contrast(color, bg) < 3; i++) color = color.map(v => Math.round(v * .9));
    return `rgb(${color.join(",")})`;
  }
  const loadedFonts = {};
  function themeData() {
    const base = (window.CAST_THEMES || {})[Z.theme] || (Z.ownThemes || {})[Z.theme] || Object.values(window.CAST_THEMES || {})[0] || {};
    return Object.assign({}, base, (Z.themeData || {})[Z.theme] || {});
  }
  function fontSet(T) {
    const r = document.documentElement.style;
    const stack = '"Rajdhani", "Bahnschrift", "Barlow Ersatz", "Arial Narrow", sans-serif';
    r.setProperty("--bold", T.bold === false ? "0px" : ".022em");
    if (T.fontFile) {
      const name = "ThemeSchrift-" + T.fontFile.replace(/[^a-z0-9]/gi, "");
      r.setProperty("--font", `"${name}", ${stack}`);
      if (!loadedFonts[name]) {
        loadedFonts[name] = true;
        const f = new FontFace(name, `url("${T.fontFile}")`, { weight: "100 900" });
        f.load().then(ff => { document.fonts.add(ff); $$(".ticker").forEach(t => { t._cacheKey = null; }); ticker(); fit(); }).catch(() => {});
      }
    } else if (T.font) {
      r.setProperty("--font", `"${String(T.font).replace(/"/g, "")}", ${stack}`);
    } else r.setProperty("--font", stack);
  }
  const currentSceneName = () => document.body.dataset.currentscene || document.body.dataset.scene || "";
  function brandDraw(m, T, onlyIcon) {
    m.classList.toggle("only-icon", onlyIcon);
    m.classList.toggle("with-image", !onlyIcon && !!T.brandImage && !T.brandBox);
    m.classList.toggle("text-dark", T.brandText === "dark");
    m.classList.toggle("rows-swap", !!T.rowsSwap);
    m.classList.toggle("box-on", !onlyIcon && !!(T.brandImage && T.brandBox));
    if (onlyIcon) { m.classList.remove("without-icon"); m.innerHTML = `<div class="brand-icon"><img src="${esc(T.icon)}" alt=""></div>`; return; }
    if (T.brandImage) { m.classList.remove("without-icon"); m.innerHTML = `<img class="brand-image" src="${esc(T.brandImage)}" alt="">`; return; }
    m.classList.toggle("without-icon", !T.icon);
    m.innerHTML = `<div class="brand-icon">${T.icon ? `<img src="${esc(T.icon)}" alt="">` : ""}</div><div class="brand-text">` +
      (T.fontImage ? `<img src="${esc(T.fontImage)}" alt="">` : `<div class="z1">${esc(T.line1)}</div><div class="z2">${esc(T.line2)}</div>`) + `</div>`;
  }
  function theme() {
    const T = themeData();
    const r = document.documentElement.style;
    r.setProperty("--dark", T.dark); r.setProperty("--light", T.light);
    r.setProperty("--text-dark", T.textDark); r.setProperty("--accent", T.accent);
    r.setProperty("--accent-rgb", rgb(T.accent));
    r.setProperty("--accent-readable", readable(T.accent, T.light));
    r.setProperty("--line", T.stroke ? "5px" : "0px");
    r.setProperty("--icon-disk", T.iconDisk || T.dark);
    r.setProperty("--head-text", T.headText || T.accent);
    document.body.dataset.corners = T.corners || "outside";
    document.body.className = document.body.className.replace(/\btheme-\S+/g, "").trim() + " theme-" + Z.theme;
    fontSet(T);
    const mode = (Z.logoMode || {})[currentSceneName()] || "auto";
    const keyName = JSON.stringify([Z.theme, T.icon, T.fontImage, T.brandImage, T.brandBox, T.line1, T.line2, mode]);
    $$(".brand").forEach(m => {
      if (!newNeeded(m, keyName + "|" + (m.dataset.max || ""))) return;
      const max = +m.dataset.max || 0;
      const onlyIcon = mode === "icon" && !!T.icon;
      brandDraw(m, T, onlyIcon);
      // „auto": passt das volle Logo nicht in den freien Platz, nur das Icon zeigen
      if (mode === "auto" && max && T.icon) {
        const check = () => { if (m.offsetWidth > max) brandDraw(m, T, true); };
        const images = [...m.querySelectorAll("img")].filter(i => !i.complete);
        if (images.length) images.forEach(i => i.addEventListener("load", check, { once: true })); else check();
      }
    });
    $$(".bg-empty").forEach(h => {
      if (!newNeeded(h, keyName + "|" + T.backgroundImage)) return;
      const i = h.querySelector("img");
      if (i) { if (T.icon) { i.src = T.icon; i.classList.remove("off"); } else i.classList.add("off"); }
      h.classList.toggle("with-image", !!T.backgroundImage);
      h.style.backgroundImage = T.backgroundImage ? K.cssUrl(T.backgroundImage) : "";
    });
  }

  /* ---------- Texte ---------- */
  function texts() {
    $$("[data-t]").forEach(e => { const v = pull(e.dataset.t); if (e.textContent !== String(v ?? "")) e.textContent = v ?? ""; });
    fit();
  }
  function fit() {
    $$("[data-matching]").forEach(e => {
      e.style.fontSize = "";
      const box = e.parentElement;
      let s = parseFloat(getComputedStyle(e).fontSize);
      while (e.scrollWidth > box.clientWidth - 30 && s > 16) { s -= 2; e.style.fontSize = s + "px"; }
    });
  }

  /* ---------- Lauftext ---------- */
  function ticker() {
    const list = (Z.texts.ticker || []).filter(Boolean);
    const S = Z.sponsors || {};
    if (S.on !== false && S.inTicker) sponsorList().forEach(s => { if (s.name) list.push(`${Z.texts.sponsorTicker} ${s.name}`); });
    const keyName = list.join("\u0001") + "|" + Z.texts.tickerTempo;
    $$(".ticker").forEach(t => {
      if (!newNeeded(t, keyName)) return;
      t.getAnimations({ subtree: true }).forEach(a => a.cancel());
      t.innerHTML = "";
      if (!list.length) return;
      const band = document.createElement("div");
      band.className = "ticker-band";
      const once = list.map(x => `<span>${esc(x)}</span><i></i>`).join("");
      band.innerHTML = once;
      t.appendChild(band);
      // so oft wiederholen, bis das Band doppelt so breit ist wie der Kasten
      const width = band.scrollWidth || 1;
      // für die breiteste mögliche Box reichen (Kästen können beim Szenenwechsel breiter werden)
      const times = Math.max(1, Math.ceil(Math.max(t.clientWidth, 1920) / width));
      band.innerHTML = once.repeat(times * 2);
      const distance = width * times;
      const duration = distance / Math.max(20, Z.texts.tickerTempo || 90) * 1000;
      band.animate([{ transform: "translate3d(0,0,0)" }, { transform: `translate3d(${-distance}px,0,0)` }],
        { duration: duration, iterations: Infinity, easing: "linear" });
    });
  }

  /* ---------- Teams ---------- */
  function teams() {
    ["a", "b"].forEach(k => {
      const t = Z.teams[k] || {};
      $$(`.team-logo.${k}`).forEach(e => {
        const words = String(t.name || k).split(/\s+/).filter(Boolean);
        const abbrev = (words.length > 1 ? words.map(w => w[0]).join("") : words[0] || k).replace(/[^A-Za-z0-9ÄÖÜäöü]/g, "").slice(0, 3).toUpperCase();
        const fresh = t.logo ? `<img src="${esc(t.logo)}" alt="">` : esc(abbrev);
        if (e.dataset.content !== fresh) {
          e.dataset.content = fresh; e.innerHTML = fresh;
          const img = e.querySelector("img");
          if (img) img.addEventListener("error", () => { e.innerHTML = esc(abbrev); e.classList.add("noOne"); }, { once: true });
        }
        e.classList.toggle("noOne", !t.logo);
      });
      $$(`[data-team-name="${k}"]`).forEach(e => { e.textContent = t.name || ""; });
      $$(`[data-team-score="${k}"]`).forEach(e => { e.textContent = t.score ?? 0; });
    });
    $$(".vs").forEach(e => {
      const res = Z.teams.result;
      e.classList.toggle("result", !!res);
      e.innerHTML = res ? `${esc(Z.teams.a.score ?? 0)}<span class="dp">:</span>${esc(Z.teams.b.score ?? 0)}` : "vs";
    });
  }

  /* ---------- Map-Veto ---------- */
  const normMap = n => String(n || "").toLowerCase().replace(/^de_/, "").replace(/[^a-z0-9]/g, "").replace(/ii$/, "2");
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
    const keyName = JSON.stringify([s, Z.mapPool, Z.texts.ban, Z.texts.pick, Z.texts.decider, Z.texts.amTurn, Z.texts.running]);
    if (!newNeeded(box, keyName)) return;
    const upnext = s.findIndex(x => !x.map);
    const width = Math.min(262, Math.floor((1806 - (s.length - 1) * 16) / Math.max(1, s.length)));
    box.style.setProperty("--kb", width + "px");
    const label = { ban: Z.texts.ban, pick: Z.texts.pick, decider: Z.texts.decider };
    box.innerHTML = s.map((x, i) => {
      const pool = x.map ? mapImage(x.map) : {};
      const image = x.map ? (x.image || pool.image || "") : "";
      const whole = pool.imageMode === "whole" ? ' class="whole"' : "";
      const fresh = x.map && vetoMaps[i] !== x.map && vetoMaps.length ? " fresh" : "";
      const other = x.team === "a" ? "b" : "a";
      const side = x.map && x.action === "pick" && x.side
        ? `<div class="veto-side"><span><span data-team-name="${other}"></span> · ${x.side.toUpperCase()}</span></div>` : "";
      const team = x.team
        ? `<div class="team-logo ${x.team}"></div><span data-team-name="${x.team}"></span>`
        : `<span>${esc(Z.texts.decider)}</span>`;
      const text = x.map ? esc(x.map) : (i === upnext ? esc(Z.texts.amTurn) : "?");
      const res = x.map && x.action !== "ban" ? resultBadge(x.result) : "";
      return `<div class="box veto-card ${x.action}${x.map ? "" : " open"}${i === upnext ? " upnext" : ""}${fresh}">
        <div class="box-head">${esc(label[x.action] || x.action)}</div>
        <div class="veto-image">${image ? `<img${whole} src="${esc(image)}" alt="">` : `<div class="initial">${x.map ? esc(x.map[0]) : ""}</div>`}${res}${side}<div class="veto-map">${text}</div></div>
        <div class="veto-team">${team}</div></div>`;
    }).join("");
    vetoMaps = s.map(x => x.map);
  }

  /* ---------- Serie ---------- */
  function resultBadge(e) {
    if (!e || !e.status || e.status === "pending") return "";
    if (e.status === "running" && (e.a === "" || e.a == null)) return `<div class="veto-result running">${esc(Z.texts.running)}</div>`;
    return `<div class="veto-result${e.status === "running" ? " running" : ""}">${esc(e.a ?? 0)}<span class="dp">:</span>${esc(e.b ?? 0)}</div>`;
  }
  function playedMaps() { return vetoSteps().filter(x => x.action !== "ban" && x.map); }
  function seriesScore() {
    let a = 0, b = 0;
    playedMaps().forEach(x => { const e = x.result || {}; if (e.status === "done") { if (+e.a > +e.b) a++; else if (+e.b > +e.a) b++; } });
    return [a, b];
  }
  function series() {
    const [sa, sb] = seriesScore();
    $$(".series-score").forEach(e => { e.innerHTML = `${sa}<span class="dp">:</span>${sb}`; });
    const maps = playedMaps();
    const keyName = JSON.stringify([maps, Z.mapPool, Z.texts.map, Z.texts.running, Z.texts.pending]);
    $$(".series-cards").forEach(k => { if (newNeeded(k, keyName)) seriesDraw(k, null, maps); });
    $$(".series-mini").forEach(m => { if (newNeeded(m, keyName)) seriesDraw(null, m, maps); });
  }
  function seriesDraw(cards, mini, maps) {
    if (cards && !maps.length) cards.innerHTML = `<div class="empty-hint">${esc(K.word(Z, "noMaps"))}</div>`;
    if (cards && maps.length) {
      const width = Math.min(360, Math.floor((1806 - (Math.max(1, maps.length) - 1) * 20) / Math.max(1, maps.length)));
      cards.style.setProperty("--kb", width + "px");
      cards.innerHTML = maps.map((x, i) => {
        const e = x.result || {}, pool = mapImage(x.map), image = x.image || pool.image || "";
        const status = e.status || "pending";
        const winner = status === "done" ? (+e.a > +e.b ? "a" : +e.b > +e.a ? "b" : "") : "";
        const score = status === "pending" ? "" : `<div class="series-score"><span class="${winner === "b" ? "lost" : ""}">${esc(e.a ?? 0)}</span><span class="dp">:</span><span class="${winner === "a" ? "lost" : ""}">${esc(e.b ?? 0)}</span></div>`;
        const foot = winner ? `<div class="team-logo ${winner}"></div><span data-team-name="${winner}"></span>`
                   : `<span>${esc(status === "running" ? Z.texts.running : Z.texts.pending)}</span>`;
        return `<div class="box series-card ${status}"><div class="box-head">${esc(Z.texts.map)} ${i + 1}</div>
          <div class="veto-image">${image ? `<img${pool.imageMode === "whole" ? ' class="whole"' : ""} src="${esc(image)}" alt="">` : `<div class="initial">${esc(x.map[0])}</div>`}${score}<div class="veto-map">${esc(x.map)}</div></div>
          <div class="veto-team">${foot}</div></div>`;
      }).join("");
    }
    if (mini) {
      mini.innerHTML = maps.filter(x => (x.result || {}).status && x.result.status !== "pending").map(x =>
        `<div class="series-chip ${x.result.status}"><b>${esc(x.map)}</b><span>${esc(x.result.a ?? 0)}<span class="dp">:</span>${esc(x.result.b ?? 0)}</span></div>`).join("");
    }
  }

  /* ---------- Sponsoren ---------- */

  function sponsorList() { return (((Z.sponsors || {}).listen || {})[Z.theme] || []).filter(s => s && (s.logo || s.name)); }
  const sponsorContent = s => s.logo ? `<img src="${esc(s.logo)}" alt="${esc(s.name || "")}">` : `<div class="sponsor-name">${esc(s.name)}</div>`;
  let sponsorTimerCachekey = null, sponsorTimer = null, sponsorNum = 0;
  function sponsors() {
    const S = Z.sponsors || {}, list = sponsorList();
    const boxes = $$(".sponsor");
    const visible = S.on !== false && (S.sceneList || {})[currentSceneName()] !== false && list.length > 0;
    const keyName = JSON.stringify([list, S.seconds, visible]);
    boxes.forEach(b => {
      b.classList.toggle("on", visible);
      if (!newNeeded(b, keyName)) return;
      const field = b.querySelector(".sponsor-field");
      field.innerHTML = list.map(sponsorContent).join("");
      const children = [...field.children];
      if (children.length) children[sponsorNum % children.length].classList.add("on");
    });
    if (keyName !== sponsorTimerCachekey) {
      sponsorTimerCachekey = keyName;
      clearInterval(sponsorTimer); sponsorTimer = null;
      if (sponsorNum >= list.length) sponsorNum = 0;
      if (visible && list.length > 1) sponsorTimer = setInterval(() => {
        sponsorNum = (sponsorNum + 1) % list.length;
        $$(".sponsor").forEach(b => [...b.querySelector(".sponsor-field").children].forEach((k, i) => k.classList.toggle("on", i === sponsorNum)));
      }, Math.max(3, S.seconds || 8) * 1000);
    }
    {
      // Raster-Szene
      $$(".sponsor-grid").forEach(r => { if (!newNeeded(r, keyName)) return; r.innerHTML = list.length ? list.map(s => `<div class="sponsor-tile">${sponsorContent(s)}</div>`).join("") : `<div class="empty-hint">${esc(K.word(Z, "noSponsors"))}</div>`; });
    }
    // große Einblendung (in allen Szenen)
    let large = document.querySelector(".sponsor-large");
    if (EMBEDDED) return;
    if (!large) {
      large = document.createElement("div"); large.className = "box sponsor-large";
      large.innerHTML = `<div class="box-head"></div><div class="sponsor-field"></div>`;
      document.body.appendChild(large);
    }
    const E = S.gfx || {}, s = list[E.num];
    const active = s && E.until > Date.now();
    if (active) {
      large.querySelector(".box-head").textContent = Z.texts.sponsorLabel;
      const f = large.querySelector(".sponsor-field"), fresh = sponsorContent(s);
      if (f.dataset.content !== fresh) { f.dataset.content = fresh; f.innerHTML = fresh; }
      clearTimeout(large._off); large._off = setTimeout(sponsors, E.until - Date.now() + 50);
    }
    large.classList.toggle("on", !!active);
  }



  /* ---------- Turnierbaum ---------- */
  function tournamentDraw() {
    const boxes = $$(".tournament-tree"); if (!boxes.length) return;
    const T = Z.tournament || {}, B = K.tournamentBuild(T, Z.overlayLanguage), S = T.visible || {};
    const teamFrom = id => (T.teams || []).find(t => t.id === id);
    const row = (id, points, winner, hidden) => {
      if (id === "BYE") return `<div class="bracket-team free"><div class="bracket-logo"></div><span>${esc(K.word(Z, "bye"))}</span><b></b></div>`;
      const t = teamFrom(id);
      if (!t || hidden) return `<div class="bracket-team open"><div class="bracket-logo"></div><span>${hidden ? "?" : "–"}</span><b></b></div>`;
      const logo = t.logo ? `<img src="${esc(t.logo)}" alt="">` : esc((t.short || t.name || "?").slice(0, 3));
      return `<div class="bracket-team${winner ? " winner" : ""}${T.focused === id ? " focused" : ""}"><div class="bracket-logo">${logo}</div><span>${esc(t.name || "")}</span><b>${S.resultsOff || points == null || points === "" ? "" : esc(points)}</b></div>`;
    };
    // Sichtbarkeit: „aufdecken“ = nur bis Runde X, „ab“ = erst ab Runde X, sonst alles
    const show = num => S.mode === "reveal" ? num <= (+S.round || 1) : S.mode === "fromRound" ? num >= (+S.round || 1) : true;
    const card = (m, hidden) => `<div class="bracket-match${m.done ? " done" : ""}${T.focused && (m.a === T.focused || m.b === T.focused) ? " in-focus" : ""}">` +
      row(m.a, m.sa, m.winner && m.winner === m.a, hidden) + row(m.b, m.sb, m.winner && m.winner === m.b, hidden) + `</div>`;
    const columns = (rounds, start) => rounds.map((r, i) => !show(start + i) && S.mode === "fromRound" ? "" :
      `<div class="bracket-round"><div class="bracket-title">${esc(r.title)}</div><div class="bracket-games">${r.matches.map(m => card(m, !show(start + i))).join("")}</div></div>`).join("");
    let h = "";
    if (!B.teams || B.teams.length < 2) h = `<div class="live-wait">${esc(K.word(Z, "noTournament"))}</div>`;
    else if (B.format === "table") {
      const choice = T.showGroup === undefined || T.showGroup === "" ? null : +T.showGroup;
      const shown = B.groups.filter((g, i) => choice === null || i === choice);
      const columns = shown.length <= 1 ? 1 : shown.length <= 4 ? 2 : shown.length <= 6 ? 3 : 4;
      h = `<div class="bracket-tables" style="grid-template-columns:repeat(${columns}, 860px)">${shown.map(g => `<div class="bracket-tab"><div class="bracket-title">${esc(g.name)}</div>
        <div class="bracket-tz head"><span>#</span><span></span><span>TEAM</span><span>SP</span><span>S</span><span>N</span><span>${g.withRounds ? "RD" : "+/−"}</span><span>PKT</span></div>` +
        g.table.map((r, i) => { const t = teamFrom(r.id) || {};
          return `<div class="bracket-tz${i < (+T.nextPlaces || 0) ? " proceed" : ""}${T.focused === r.id ? " focused" : ""}"><span>${i + 1}</span><div class="bracket-logo">${t.logo ? `<img src="${esc(t.logo)}" alt="">` : esc((t.short || t.name || "?").slice(0, 3))}</div>` +
            `<span class="bracket-tname">${esc(t.name || "")}</span><span>${r.sponsor}</span><span>${r.s}</span><span>${r.n}</span><span>${r.bracket > 0 ? "+" : ""}${r.bracket}</span><b>${r.pts}</b></div>`; }).join("") +
        (T.gamesShow ? `<div class="bracket-tspiele">${g.matches.filter(m => !m.done).slice(0, 4).map(m => card(m, false)).join("")}</div>` : "") + `</div>`).join("")}</div>`;
    }
    else if (B.format === "gsl") h = `<div class="bracket-groups">${B.groups.map(g => `<div class="bracket-group"><div class="bracket-title">${esc(g.name)}</div>${g.matches.map(m => `<div class="bracket-gm"><span>${esc(m.title)}</span>${card(m, false)}</div>`).join("")}</div>`).join("")}</div>`;
    else if (B.format === "swiss") h = `<div class="bracket-row">${columns(B.rounds, 1)}</div>` + (B.table.length ? `<div class="bracket-swiss">${B.table.map(b => `<div class="bracket-sw ${b.status}">${row(b.id, `${b.s}–${b.n}`, b.status === "proceed", false)}</div>`).join("")}</div>` : "");
    else {
      h = `<div class="bracket-row">${columns(B.rounds, 1)}${B.finale && B.bottom.length === 0 ? "" : ""}</div>`;
      if (B.bottom.length) h = `<div class="bracket-de"><div class="bracket-row">${columns(B.rounds, 1)}</div><div class="bracket-row bottom">${columns(B.bottom, 1)}</div></div>` +
        (B.finale ? `<div class="bracket-round bracket-gf"><div class="bracket-title">GRAND FINAL</div><div class="bracket-games">${card(B.finale, !show(B.rounds.length + 1))}</div></div>` : "");
    }
    // Profil des hervorgehobenen Teams (Klick in der App)
    const f = T.focused && teamFrom(T.focused);
    let profile = "";
    if (f) {
      const st = f.stats || {};
      profile += `<div class="bracket-profile box"><div class="box-head">${esc(f.name || "")}</div><div class="box-field">` +
        (f.players && f.players.length ? `<div class="bracket-players">${f.players.slice(0, 7).map(n => `<span>${esc(n)}</span>`).join("")}</div>` : "") +
        (st.matches ? `<div class="bracket-stats"><div><b>${esc(st.winrate)}%</b><span>SIEGQUOTE</span></div><div><b>${esc(st.matches)}</b><span>SPIELE</span></div><div><b>${esc(st.series || 0)}</b><span>SERIE</span></div></div>` +
          (st.last && st.last.length ? `<div class="bracket-form">${st.last.slice(0, 5).map(x => `<i class="${x === "1" ? "s" : "n"}">${x === "1" ? "S" : "N"}</i>`).join("")}</div>` : "") : "") +
        `</div></div>`;
    }
    boxes.forEach(box => {
      if (!newNeeded(box, h + profile)) return;
      box.innerHTML = `<div class="bracket-inner">${h}</div>${profile}`;
      $$(".tournament-name").forEach(e => { e.textContent = T.name || Z.texts.title || ""; });
      // auf die verfügbare Fläche einpassen
      requestAnimationFrame(() => { const i = box.querySelector(".bracket-inner"); if (!i) return; i.style.transform = "";
        const s = Math.min(1.6, box.clientWidth / i.scrollWidth, box.clientHeight / i.scrollHeight);
        const x = Math.max(0, (box.clientWidth - i.scrollWidth * s) / 2);
        i.style.transform = `translateX(${x}px) scale(${s})`; });
    });
  }

  /* ---------- CS2-Livedaten ---------- */
  let liveData = null;
  const MAPNAME = n => { const raw = String(n || "").replace(/^(de|cs|ar)_/, ""); const p = (Z.mapPool || []).find(m => normMapName(m.name) === normMapName(raw)); return p ? p.name : raw.charAt(0).toUpperCase() + raw.slice(1); };
  const normMapName = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^dust2$/, "dustii");
  const sideFrom = team => !liveData ? "" : team === "a" ? liveData.sideA : (liveData.sideA === "CT" ? "T" : "CT");
  const strength = p => p.adr + 2 * (p.k - p.d);                  // „stärkster Spieler“: Schaden pro Runde + 2 × (Kills − Tode)
  const playersFrom = team => !liveData ? [] : liveData.players.filter(p => p.side === sideFrom(team)).sort((x, y) => y.k - x.k || y.adr - x.adr).slice(0, 5);
  const pointsFrom = team => !liveData ? 0 : (sideFrom(team) === "CT" ? liveData.ct : liveData.t).score;
  function h2hPair() {
    const w = (team) => { const l = playersFrom(team), chosen = ((Z.h2h || {})[team]) || ""; return l.find(p => p.id === chosen) || l.slice().sort((x, y) => strength(y) - strength(x))[0]; };
    return [w("a"), w("b")];
  }
  const wait = () => `<div class="live-wait">${esc(Z.texts.waitCs2 || "")}</div>`;
  function tableHtml(team, compact) {
    const l = playersFrom(team);
    const head = `<div class="stat-head"><div class="team-logo ${team}"></div><span data-team-name="${team}"></span><b class="stat-points">${pointsFrom(team)}</b><span class="stat-side">${sideFrom(team)}</span></div>`;
    const columns = compact ? ["K", "D", "ADR"] : ["K", "D", "A", "ADR", "HS %"];
    const rows = l.map(p => `<div class="stat-row${p.hp <= 0 ? " dead" : ""}${liveData.observed === p.id ? " focused" : ""}"><span class="stat-name">${esc(p.name)}</span>` +
      (compact ? [p.k, p.d, p.adr] : [p.k, p.d, p.a, p.adr, p.hs]).map(v => `<span>${v}</span>`).join("") + `</div>`).join("");
    return head + `<div class="stat-row stat-title"><span class="stat-name"></span>${columns.map(s => `<span>${s}</span>`).join("")}</div>` + rows;
  }
  function liveDraw() {
    const da = !!liveData;
    // ohne CS2-Daten steht der Match-Titel im Kopf (nie ein leeres Feld)
    $$(".live-info").forEach(e => { const t = da ? `${MAPNAME(liveData.map)} · ${Z.texts.round || K.word(Z, "round")} ${liveData.round + 1}` : (Z.texts.title || ""); if (e.textContent !== t) e.textContent = t; });
    $$(".live-table").forEach(e => {
      const team = e.dataset.team, h = da ? tableHtml(team, e.classList.contains("compact")) : wait();
      if (newNeeded(e, h)) e.innerHTML = h;
    });
    $$(".live-team").forEach(e => {
      const team = e.dataset.team;
      const h = !da ? wait() : playersFrom(team).map(p => `<div class="box stat-card"><div class="box-head">${esc(p.name)}</div><div class="box-field">
          <div class="stat-large"><b>${p.k}</b><span>/</span><b>${p.d}</b><span>/</span><b>${p.a}</b></div><div class="stat-small">K / D / A</div>
          <div class="stat-values"><div><b>${p.adr}</b><span>ADR</span></div><div><b>${p.hs}%</b><span>HS</span></div><div><b>${p.mvps}</b><span>MVP</span></div></div></div></div>`).join("");
      if (newNeeded(e, h)) e.innerHTML = h;
    });
    $$(".live-h2h").forEach(e => {
      const [pa, pb] = da ? h2hPair() : [];
      let h = wait();
      if (pa && pb) {
        const row = (name, va, vb, moreBetter = true) => {
          const sum = va + vb, wa = sum ? Math.round(100 * va / sum) : 50;   // beide 0: neutral in der Mitte
          const leads = va === vb ? "" : (va > vb) === moreBetter ? "a" : "b";
          return `<div class="h2h-row"><b class="${leads === "a" ? "front" : ""}">${va}</b><div class="h2h-bar"><i style="width:${wa}%"></i></div><span>${name}</span><div class="h2h-bar b"><i style="width:${100 - wa}%"></i></div><b class="${leads === "b" ? "front" : ""}">${vb}</b></div>`;
        };
        h = `<div class="h2h-players"><div class="box"><div class="box-head"><span data-team-name="a"></span></div><div class="box-field">${esc(pa.name)}</div></div>
             <div class="box"><div class="box-head"><span data-team-name="b"></span></div><div class="box-field">${esc(pb.name)}</div></div></div>
             <div class="h2h-values">${row("KILLS", pa.k, pb.k)}${row("DEATHS", pa.d, pb.d, false)}${row("ASSISTS", pa.a, pb.a)}${row("ADR", pa.adr, pb.adr)}${row("HS %", pa.hs, pb.hs)}${row("MVPs", pa.mvps, pb.mvps)}</div>`;
      }
      if (newNeeded(e, h)) e.innerHTML = h;
    });
    teams();                                                    // Teamnamen/Logos in neu gezeichneten Teilen
    if ((Z.graphics || []).some(x => x.on && (x.type === "scoreboard" || x.type === "players"))) graphics();
  }

  /* ---------- Einblendungen (über jeder Szene) ---------- */
  let gfxTimer = null, factTimer = null, factNum = 0;
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
      return `<div class="team-logo a"></div><div class="gfx-score"><span data-team-score="a"></span><span class="dp">:</span><span data-team-score="b"></span></div><div class="team-logo b"></div>`;
    if (e.type === "caster") {
      const who = ["c1", "c2"].concat(e.guest ? ["guest"] : []).map(k => Z.caster[k] || {}).filter(c => c.name);
      return `<div class="gfx-caster-list ${e.arrangement === "sidebyside" ? "beside" : ""}">` +
        who.map(c => `<div class="box gfx-caster"><div class="box-head">${esc(c.name)}</div><div class="box-field">${esc(c.addition || "")}</div></div>`).join("") + `</div>`;
    }
    if (e.type === "mapinfo") {
      const { cur, next } = currentMap();
      if (!cur) return `<div class="gfx-mapinfo"><b>${esc(Z.texts.mapVeto)}</b><span class="gfx-mapinfo-map">–</span></div>`;
      const who = cur.action === "decider" || !cur.team ? `<b>${esc(Z.texts.decider)}</b>`
        : `<b>${esc(Z.texts.pick)}</b><div class="team-logo ${cur.team}"></div>`;
      return `<div class="gfx-mapinfo">${who}<span class="gfx-mapinfo-map">${esc(cur.map)}</span>${next ? `<span class="gfx-mapinfo-next">${esc(Z.texts.next)}: ${esc(next.map)}</span>` : ""}</div>`;
    }
    if (e.type === "scoreboard") {
      if (!liveData) return `<div class="box-head">${esc(Z.texts.scoreboard)}</div><div class="box-field">${wait()}</div>`;
      return `<div class="box-head">${esc(Z.texts.scoreboard)} · <span>${esc(MAPNAME(liveData.map))}</span></div>
        <div class="gfx-sb"><div class="live-table compact" data-team="a">${tableHtml("a", true)}</div><div class="live-table compact" data-team="b">${tableHtml("b", true)}</div></div>`;
    }
    if (e.type === "players") {
      const p = liveData && (liveData.players.find(x => x.id === (e.playersId || liveData.observed)) || null);
      if (!p) return `<div class="box-head">${esc(Z.texts.players || "")}</div><div class="box-field">${wait()}</div>`;
      const team = p.side === sideFrom("a") ? "a" : "b";
      return `<div class="box-head"><div class="team-logo ${team}"></div><span>${esc(p.name)}</span></div>
        <div class="box-field gfx-sponsor"><div><b>${p.k}/${p.d}/${p.a}</b><span>K/D/A</span></div><div><b>${p.adr}</b><span>ADR</span></div><div><b>${p.hs}%</b><span>HS</span></div><div><b>${p.mvps}</b><span>MVP</span></div></div>`;
    }
    if (e.type === "mapfact") {
      const map = e.map || ((currentMap().cur || {}).map) || "";
      const pool = mapImage(map), facts = (pool.facts || []).filter(Boolean);
      const num = e.fact >= 0 ? e.fact : factNum;
      const text = facts.length ? facts[num % facts.length] : "";
      return `<div class="box-head">${esc(Z.texts.mapFact)}${map ? " · " + esc(map) : ""}</div><div class="box-field">${esc(text)}</div>`;
    }
    return `<div class="box-head">${esc(e.title || "")}</div><div class="box-field">${esc(e.text || "")}</div>`;
  }
  const DEFAULT_POS = { lowerthird: "bl", caster: "bl", hint: "tc", score: "tc", mapinfo: "tl", mapfact: "tr", scoreboard: "bc", players: "bl" };
  function graphics() {
    if (EMBEDDED) return;
    let stageLayer = document.querySelector(".gfx-layer");
    if (!stageLayer) { stageLayer = document.createElement("div"); stageLayer.className = "gfx-layer"; document.body.appendChild(stageLayer); }
    const now = Date.now(), list = Z.graphics || [];
    let nextEnd = 0, factSec = 0;
    list.forEach(e => {
      let d = stageLayer.querySelector(`[data-id="${CSS.escape(e.id)}"]`);
      if (!d) { d = document.createElement("div"); d.dataset.id = e.id; stageLayer.appendChild(d); }
      const pos = /^(bl|br|bc|tl|tr|tc|cl|cr)$/.test(e.pos || "") ? e.pos : (DEFAULT_POS[e.type] || "bl");
      const cssClass = `gfx gfx-${e.type} pos-${pos}` + (e.type === "caster" ? "" : " box") + (e.title ? "" : " without-title");
      const content = gfxContent(e);
      if (d.dataset.cacheKey !== cssClass + content) {
        const had = d.classList.contains("on");
        d.dataset.cacheKey = cssClass + content; d.className = cssClass + (had ? " on" : ""); d.innerHTML = content;
      }
      const visible = K.gfxVisible(e, now, currentSceneName());
      d.classList.toggle("on", visible);
      const switchTo = K.gfxNextSwitch(e, now);
      if (switchTo) nextEnd = nextEnd ? Math.min(nextEnd, switchTo) : switchTo;
      if (visible && e.type === "mapfact" && !(e.fact >= 0)) factSec = Math.max(4, +e.seconds || 12);
    });
    [...stageLayer.children].forEach(d => { if (!list.some(e => e.id === d.dataset.id)) d.remove(); });
    clearTimeout(gfxTimer);
    if (nextEnd) gfxTimer = setTimeout(graphics, nextEnd - now + 30);
    // Map-Fakten nacheinander zeigen
    if (factSec && !factTimer) factTimer = setInterval(() => { factNum++; graphics(); teams(); }, factSec * 1000);
    if (!factSec && factTimer) { clearInterval(factTimer); factTimer = null; }
  }

  /* ---------- Spieler ---------- */
  function players() {
    const boxes = $$(".lineup[data-team]");
    if (!boxes.length) return;
    const keyName = JSON.stringify(Z.players);
    boxes.forEach(box => {
      if (!newNeeded(box, keyName)) return;
      const k = box.dataset.team;
      const list = ((Z.players || {})[k] || []).slice(0, 5);
      while (list.length < 5) list.push(null);
      box.innerHTML = `<div class="box lineup-team"><div class="team-logo ${k}"></div><div class="box-field"><span data-team-name="${k}" data-matching></span></div></div>` +
        list.map(p => {
          if (!p || !p.name) return `<div class="box players-card empty"><div class="players-image"></div><div class="box-head">–</div><div class="box-field"></div></div>`;
          const image = p.image ? `<img${p.imageMode === "whole" ? ' class="whole"' : ""} src="${esc(p.image)}" alt="">` : `<div class="initial">${esc(p.name[0].toUpperCase())}</div>`;
          const level = p.level ? `<div class="players-level">${esc(p.level)}</div>` : "";
          return `<div class="box players-card"><div class="players-image">${image}${level}</div><div class="box-head">${esc(p.name)}</div><div class="box-field">${esc(p.real || "")}</div></div>`;
        }).join("");
    });
  }


  /* ---------- Ton je Quelle: Lautstärke (bis 300 %), stumm, Verzögerung, Abhören ----------
     Programm (OBS): spielt, wenn nicht stumm und nicht „nur abhören“. Vorschau in der App: spielt, wenn Abhören an ist. */
  let audioAudioctx = null, monitor = { mode: "off", vol: 100 };       // Abhören in der App: aus · app · beides (App + OBS)
  const monitorOn = () => monitor.mode === "app" || monitor.mode === "both";
  const audioChains = new Set();
  function audioForVideo(v, on) {
    if (!on) { v.muted = true; return; }
    const c = audioctx(); if (!c) return;
    if (!v._audio) { try { audioChain(c.createMediaElementSource(v), "background", () => v.isConnected); v._audio = true; } catch (e) { return; } }
    v.muted = false;
  }
  function audioctx() {
    if (!audioAudioctx) { try { audioAudioctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (audioAudioctx.state === "suspended") audioAudioctx.resume().catch(() => {});
    return audioAudioctx;
  }
  function audioSettings(key) { return Object.assign({ vol: 100, mute: key === "background", delay: 0, monitor: "both" }, ((Z.audio || {})[key]) || {}); }
  function audioLevel(key) {
    const T = audioSettings(key);
    if (T.mute) return 0;
    if (PREVIEW) return T.monitor === "off" || !monitorOn() ? 0 : (T.vol / 100) * (monitor.vol / 100);
    return T.monitor === "only" ? 0 : T.vol / 100;
  }
  function audioChain(source, key, alive) {
    const c = audioctx(); if (!c) return null;
    const d = c.createDelay(5), g = c.createGain();
    source.connect(d); d.connect(g); g.connect(c.destination);
    const t = { d, g, key, alive }; audioChains.add(t); audioApply(); return t;
  }
  function audioApply() {
    const bgOn = !audioSettings("background").mute;
    $$(".backdrop video").forEach(v => audioForVideo(v, bgOn));
    audioChains.forEach(t => {
      if (!t.alive()) { try { t.g.disconnect(); } catch (e) {} audioChains.delete(t); return; }
      t.g.gain.value = audioLevel(t.key); t.d.delayTime.value = Math.min(5, Math.max(0, (+audioSettings(t.key).delay || 0) / 1000));
    });
    // VDO.Ninja: Lautstärke über dessen Iframe-Schnittstelle (höchstens 100 %)
    $$(".cam[data-source] iframe").forEach(f => {
      const v = Math.min(1, audioLevel(f.closest(".cam").dataset.source));
      if (f._vol !== v) { f._vol = v; try { f.contentWindow.postMessage({ volume: v }, "*"); } catch (e) {} }
    });
  }
  setInterval(() => { $$(".cam[data-source] iframe").forEach(f => { f._vol = null; }); audioApply(); }, 3000);
  // App-Fenster: eigene Videos/Audios direkt regeln, fremde Seiten (Clips, VDO, DACH) ohne Freigabe stumm halten
  function previewAudio() {
    if (!PREVIEW) return;
    const on = monitorOn(), vol = Math.max(0, Math.min(1, monitor.vol / 100));
    $$("video, audio").forEach(m => { if (m._audio) return; m.muted = !on; m.volume = vol; });
    $$("iframe").forEach(f => {
      const should = on ? "autoplay" : "autoplay 'none'";
      if (f.getAttribute("allow") !== should) { f.setAttribute("allow", should); if (f.src && !/about:blank$/.test(f.src)) f.src = f.src; }
      if (on) try { f.contentWindow.postMessage({ volume: vol }, "*"); } catch (e) {}
    });
  }
  if (PREVIEW) setInterval(previewAudio, 1000);

  /* ---------- Quellen in den Kamera-Rahmen ---------- */
  function linkPrepare(Q, key) {
    let u = String(Q.url || "").trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) u = "https://vdo.ninja/?view=" + encodeURIComponent(u);   // nur Stream-ID eingegeben
    try {
      const url = new URL(u);
      if (/(^|\.)(vdo|obs)\.ninja$/i.test(url.hostname)) {
        const p = url.searchParams;
        if (!p.has("cleanoutput")) p.set("cleanoutput", "");
        if (Q.adjust !== "whole" && !p.has("cover")) p.set("cover", "");
        if (Q.audio === false && !p.has("noaudio")) p.set("noaudio", "");
        if (PREVIEW && !monitorOn() && !p.has("noaudio")) p.set("noaudio", "");     // Vorschau: nur mit Abhören hörbar
        const delayMs = +audioSettings(key).delay || 0;
        if (delayMs > 0) p.set("buffer", String(Math.round(delayMs)));          // Bild + Ton verzögern (z. B. passend zum Spiel)
        return url.toString().replace(/=(&|$)/g, "$1");
      }
      return url.toString();
    } catch (e) { return u; }
  }
  async function deviceStart(box, Q) {
    const v = document.createElement("video");
    v.autoplay = true; v.playsInline = true; v.muted = !Q.audio;
    box.appendChild(v);
    try {
      const md = navigator.mediaDevices;
      let devices = await md.enumerateDevices();
      if (!devices.some(d => d.label)) {            // ohne Freigabe gibt es keine Gerätenamen
        const s = await md.getUserMedia({ video: true }); s.getTracks().forEach(t => t.stop());
        devices = await md.enumerateDevices();
      }
      // Geräte-IDs unterscheiden sich zwischen Browser und OBS – deshalb zuerst über den Namen suchen
      const d = devices.find(x => x.kind === "videoinput" && Q.deviceName && x.label === Q.deviceName)
             || devices.find(x => x.kind === "videoinput" && x.deviceId === Q.device);
      const video = { width: { ideal: 1920 }, height: { ideal: 1080 } };
      if (d) video.deviceId = { exact: d.deviceId };
      const stream = await md.getUserMedia({ video, audio: !!Q.audio || !!(Z.speaker || {}).on });
      if (!box.isConnected) { stream.getTracks().forEach(t => t.stop()); return; }
      box._stream = stream; v.srcObject = stream; v.muted = true;
      if (stream.getAudioTracks().length) { const c = audioctx(); if (c) audioChain(c.createMediaStreamSource(stream), box.closest(".cam").dataset.source, () => box.isConnected); }
      levelMeasure(box.closest(".cam"), stream);
    } catch (e) {
      box.innerHTML = `<div class="cam-error">${esc(K.word(Z, "cameraMissing"))}<small>${esc(e && (e.name || e.message) || e)}</small></div>`;
    }
  }
  /* Sprecher-Anzeige: Pegel messen und das Schild aufleuchten lassen */
  const levelHold = new WeakMap();
  function meterLevel(k, value) {
    if (!(Z.speaker || {}).on) { k.classList.remove("speaks"); return; }
    if (value > ((Z.speaker || {}).threshold || .08)) {
      k.classList.add("speaks");
      clearTimeout(levelHold.get(k));
      levelHold.set(k, setTimeout(() => k.classList.remove("speaks"), 450));
    }
  }
  let audioContext = null;
  function levelMeasure(k, stream) {
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      audioContext.resume().catch(() => {});
      const source = audioContext.createMediaStreamSource(new MediaStream([track]));
      const analyse = audioContext.createAnalyser(); analyse.fftSize = 512;
      source.connect(analyse);
      const data = new Float32Array(analyse.fftSize);
      const t = setInterval(() => {
        if (!k.isConnected || track.readyState === "ended") { clearInterval(t); try { source.disconnect(); analyse.disconnect(); } catch (e) {} return; }
        analyse.getFloatTimeDomainData(data);
        let s = 0; for (const v of data) s += v * v;
        meterLevel(k, Math.sqrt(s / data.length) * 4);
      }, 100);
    } catch (e) {}
  }
  // VDO.Ninja meldet Pegel über seine iframe-Schnittstelle
  addEventListener("message", ev => {
    const d = ev.data;
    if (!d || typeof d !== "object" || d.loudness == null) return;
    const k = $$(".cam[data-source]").find(x => { const f = x.querySelector("iframe"); return f && f.contentWindow === ev.source; });
    if (!k) return;
    const values = typeof d.loudness === "object" ? Object.values(d.loudness) : [d.loudness];
    meterLevel(k, Math.max(0, ...values.map(Number).filter(n => !isNaN(n))) / 100);
  });
  setInterval(() => {
    if (!(Z.speaker || {}).on) return;
    $$(".cam[data-source] iframe").forEach(f => { try { f.contentWindow.postMessage({ getLoudness: true }, "*"); } catch (e) {} });
  }, 3000);

  function sources() {
    $$(".cam[data-source]").forEach(k => {
      const Q = ((Z.sources || {})[k.dataset.source]) || { type: "empty" };
      const keyName = JSON.stringify([Q, !!(Z.speaker || {}).on, Q.type === "link" ? +audioSettings(k.dataset.source).delay || 0 : 0, PREVIEW && Q.type === "link" ? monitorOn() : 0]);
      if (k._source === keyName) return;
      k._source = keyName;
      const oldSource = k.querySelector(".cam-source");
      if (oldSource) { if (oldSource._stream) oldSource._stream.getTracks().forEach(t => t.stop()); oldSource.remove(); }
      const active = Q.type && Q.type !== "empty" && (Q.type !== "link" || Q.url) && (Q.type !== "image" || Q.image);
      k.classList.toggle("filled", !!active);
      if (!active) return;
      const box = document.createElement("div");
      box.className = "cam-source" + (Q.adjust === "whole" ? " whole" : "") + (Q.mirror ? " mirrored" : "");
      k.insertBefore(box, k.firstChild);
      if (Q.type === "link") {
        const f = document.createElement("iframe");
        const target = linkPrepare(Q, k.dataset.source);
        f.onload = () => { f._vol = null; setTimeout(audioApply, 800); };
        if (!/^https?:\/\//i.test(target)) return;
        f.allow = "autoplay; camera; microphone; fullscreen; display-capture";
        // darf Skripte ausführen, aber die Overlay-Seite nicht umleiten oder Pop-ups öffnen
        f.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-presentation");
        f.referrerPolicy = "no-referrer";
        f.src = target;
        box.appendChild(f);
      } else if (Q.type === "image") {
        const i = document.createElement("img"); if (/^(data:image\/|https?:|medien\/)/i.test(Q.image)) i.src = Q.image; box.appendChild(i);
      } else if (Q.type === "device") deviceStart(box, Q);
    });
  }

  /* ---------- Timer ---------- */
  function timer() {
    const rest = K.timerRest(Z.timer);
    const t = K.time(rest).replace(":", '<span class="dp">:</span>');
    $$(".timer").forEach(e => { if (e.innerHTML !== t) e.innerHTML = t; e.classList.toggle("null", rest <= 0 && Z.timer.running); });
  }
  setInterval(timer, 250);

  /* ---------- Diagnose (in der Steuerseite einschaltbar) ---------- */
  let receivedFrom = "gespeicherter Stand", receivedUm = 0;
  function diagnose() {
    if (EMBEDDED) return;
    let box = document.querySelector(".diagnose");
    if (!Z.diagnose) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement("div"); box.className = "diagnose";
      box.style.cssText = "position:absolute;left:12px;top:12px;z-index:99;max-width:1100px;padding:12px 16px;background:rgba(0,0,0,.88);color:#9f9;font:16px/1.45 Consolas,monospace;white-space:pre-wrap;border:2px solid #9f9";
      document.body.appendChild(box);
      setInterval(diagnose, 1000);
    }
    const H = Z.background || {}, t = document.createElement("video");
    const rows = [
      "DIAGNOSE – " + (document.body.dataset.scene || location.pathname.split("/").pop()) + " · Version " + K.VERSION,
      "Datei:     " + (location.pathname.split("/").pop() || "?") + (location.protocol === "file:" ? " (lokale Datei)" : " (" + location.protocol.replace(":", "") + ")"),
      "Browser:   " + (navigator.userAgent.match(/(OBS|Chrome|Edg|Firefox|Safari)\/[\d.]+/g) || []).join(" "),
      "Zustand:   " + receivedFrom + (receivedUm ? " · " + new Date(receivedUm).toLocaleTimeString("de-DE") : "") + " · Stand " + (Z.revision ? new Date(Z.revision).toLocaleTimeString("de-DE") : "–"),
      "Bilder:    " + Object.keys(K.Images.mem).length + " gemerkt · Zustand " + Math.round(JSON.stringify(rawState).length / 1024) + " KB",
      "Videos:    " + ((H.videos || []).length || "keine eingetragen") + (H.transparent ? " (Hintergrund durchsichtig!)" : ""),
      "Formate:   H.264 " + (t.canPlayType('video/mp4; codecs="avc1.640028"') || "nein") + " · H.265 " + (t.canPlayType('video/mp4; codecs="hvc1.1.6.L120.90"') || "nein") + " · VP9 " + (t.canPlayType('video/webm; codecs="vp9"') || "nein")
    ];
    document.querySelectorAll(".backdrop video").forEach((v, i) => {
      if (!v.getAttribute("src")) return;
      const error = v.error ? ["", "abgebrochen", "Netzwerk/Datei", "Dekodierung (Format)", "Format/Datei nicht unterstützt"][v.error.code] + (v.error.message ? " – " + v.error.message : "") : "";
      rows.push(`Video ${i + 1}:   ${decodeURIComponent(v.getAttribute("src"))} · bereit ${v.readyState}/4 · ${v.paused ? "pausiert" : "läuft"} · ${v.currentTime.toFixed(1)} s${v.classList.contains("on") ? " · SICHTBAR" : ""}${error ? " · FEHLER: " + error : ""}`);
    });
    (window.__videoProblems || []).slice(-3).forEach(p => rows.push("Übersprungen: " + p));
    box.textContent = rows.join("\n");
  }

  const IN_OBS = !!window.obsstudio || /OBS\//.test(navigator.userAgent);
  let obsActive = true;
  addEventListener("obsSourceActiveChanged", ev => {
    obsActive = !!(ev.detail && ev.detail.active);
    document.querySelectorAll(".backdrop video.on").forEach(v => { if (obsActive) v.play().catch(() => {}); else v.pause(); });
  });

  /* ---------- Hintergrund-Videos ----------
     Jede Einrichtung bekommt eine eigene „Generation": Zeitgeber und Ereignisse älterer Durchläufe
     werden ignoriert und können den Hintergrund nicht mehr durcheinanderbringen. */
  let videoList = null, videoWatchdog = null, videoGen = 0;
  function background() {
    const backdrop = document.querySelector(".backdrop");
    if (!backdrop) return;
    const H = Z.background || {};
    // OBS spielt das Video unter dem Overlay ab – die Vorschau in der App zeigt es trotzdem, damit sie wie das Programm aussieht
    const obsPlays = (H.source === "obs" || !!H.transparent) && !PREVIEW;
    const list = obsPlays ? [] : (H.videos || []).filter(Boolean);
    const dark = backdrop.querySelector(".bg-dark"), empty = backdrop.querySelector(".bg-empty");
    const keyName = (obsPlays ? "obs|" : "") + list.join("|");
    if (backdrop.classList.contains("video-running") || obsPlays) { if (dark) dark.style.opacity = H.dim ?? .35; }
    if (keyName === videoList) return;
    videoList = keyName;

    // alles vom vorherigen Durchlauf beenden
    const gen = ++videoGen;
    clearInterval(videoWatchdog); videoWatchdog = null;
    if (gen > 1 && performance.now() > 8000) message(`Hintergrund neu eingerichtet (${obsPlays ? "OBS spielt ab" : list.length + " Video(s)"})`);
    backdrop.querySelectorAll("video").forEach(v => { v.onerror = v.onended = v.oncanplay = null; v.pause(); v.removeAttribute("src"); v.load(); v.classList.remove("on"); });
    backdrop.classList.toggle("obs-video", obsPlays);
    const showTheme = () => {
      empty.classList.remove("off"); backdrop.classList.remove("video-running"); backdrop.classList.add("without-video");
      if (dark) dark.style.opacity = 0;
    };
    if (obsPlays) {                                      // durchsichtig, nur Abdunkeln + Verlauf
      empty.classList.add("off"); backdrop.classList.remove("without-video", "video-running");
      if (dark) dark.style.opacity = H.dim ?? .35;
      return;
    }
    showTheme();
    if (!list.length) return;

    const present = [...backdrop.querySelectorAll("video")];
    const bgAudio = !audioSettings("background").mute;
    const make = () => {
      if (present.length) { const firstVideo = present.shift(); audioForVideo(firstVideo, bgAudio); return firstVideo; }
      const v = document.createElement("video"); setTimeout(() => audioForVideo(v, bgAudio), 0);
      ["muted", "autoplay", "playsinline"].forEach(a => v.setAttribute(a, ""));
      v.muted = true; v.playsInline = true; v.preload = "auto"; v.disablePictureInPicture = true;
      backdrop.insertBefore(v, empty);
      return v;
    };
    let active = make(), upcoming = make();
    let i = Math.floor(Math.random() * list.length);
    const broken = new Set();
    const valid = () => gen === videoGen;

    // Ein Video laden und starten – erst „ok", wenn wirklich Bilder kommen (nicht nur „kann abspielen")
    function launch(v, file) {
      return new Promise(done => {
        let finished = false;
        const end = (ok, reason) => {
          if (finished) return; finished = true; clearTimeout(time);
          v.oncanplay = v.onerror = null; v.removeEventListener("timeupdate", progress);
          done({ ok, reason });
        };
        const time = setTimeout(() => end(false, v.readyState < 2 ? "lädt nicht" : "kein Bild – Format wird hier nicht dekodiert"), 12000);
        const progress = () => { if (v.currentTime > 0.15 && v.videoWidth > 0) end(true); };
        v.onerror = () => end(false, v.error ? `Fehler ${v.error.code}${v.error.message ? ": " + v.error.message : ""}` : "Fehler");
        v.oncanplay = () => { v.oncanplay = null; v.play().catch(e => end(false, "Abspielen abgelehnt: " + (e && e.name))); };
        v.addEventListener("timeupdate", progress);
        v.loop = list.length === 1;
        v.src = /^(https?:|file:|data:|blob:)/i.test(file) ? file : file.split("/").map(encodeURIComponent).join("/");
        v.load();
      });
    }
    let loading = false;
    async function proceed() {
      if (loading || !valid()) return;
      loading = true;
      for (let n = 0; n < list.length; n++) {
        const file = list[i]; i = (i + 1) % list.length;
        if (broken.has(file)) continue;
        const r = await launch(upcoming, file);
        if (!valid()) return;                                    // inzwischen neu eingerichtet
        if (r.ok) {
          upcoming.classList.add("on"); active.classList.remove("on");
          const previous = active; setTimeout(() => { if (!previous.classList.contains("on")) previous.pause(); }, 1400);
          [active, upcoming] = [upcoming, active];
          const v = active;
          v.onended = () => { if (valid() && v === active) proceed(); };
          // bricht das Video mitten im Abspielen ab: melden und neu anstoßen
          v.onerror = () => {
            if (!valid() || v !== active) return;
            message(`Video abgebrochen: ${file}${v.error ? " (Fehler " + v.error.code + ")" : ""}`);
            setTimeout(() => { if (valid()) proceed(); }, 1500);
          };
          ["stalled", "emptied", "suspend"].forEach(occurrence => { v["on" + occurrence] = () => { if (valid() && v === active && IN_OBS && occurrence !== "suspend") message(`Video-Ereignis „${occurrence}“: ${file}`); }; });
          empty.classList.add("off"); backdrop.classList.add("video-running"); backdrop.classList.remove("without-video");
          if (dark) dark.style.opacity = (Z.background || {}).dim ?? .35;
          loading = false;
          return;
        }
        broken.add(file); setTimeout(() => broken.delete(file), 30000);   // später erneut versuchen
        message(`Video lässt sich nicht abspielen: ${file} (${r.reason})`);
        (window.__videoProblems = (window.__videoProblems || []).slice(-9)).push(file + " – " + r.reason);
      }
      loading = false;
      if (valid() && !backdrop.classList.contains("video-running")) {
        showTheme();
        message("Kein Hintergrund-Video abspielbar – zeige Theme-Hintergrund. Tipp: „OBS spielt ab“ wählen.");
        setTimeout(() => { if (valid()) proceed(); }, 30000);
      }
    }
    proceed();

    // Wächter: bleibt das Bild stehen, neu anstoßen bzw. zum nächsten Video wechseln
    let last = -1, stall = 0;
    videoWatchdog = setInterval(() => {
      if (!valid() || loading || !active.classList.contains("on") || !obsActive) return;
      if (active.paused && !active.ended) { active.play().catch(() => {}); return; }
      if (active.currentTime === last) {
        if (++stall >= 3) { stall = 0; message("Video hängt – starte neu: " + (active.getAttribute("src") || "")); if (list.length === 1) broken.clear(); proceed(); }
      } else stall = 0;
      last = active.currentTime;
    }, 1500);
  }

  /* ---------- Musik (Tuna) ---------- */
  let musicData = null;
  function musicBox(box) {
    if (box._music) return box._music;
    box.innerHTML = `<div class="music-cover"></div>
      <div class="music-field"><div class="music-label"><span class="eq"><i></i><i></i><i></i></span><span data-t="texts.musicLabel"></span></div>
        <div class="music-text"><div class="music-title"></div><div class="music-artist"></div></div>
        <div class="music-bar"><i></i></div></div>`;
    box.querySelector("[data-t]").textContent = Z.texts.musicLabel || "";
    return box._music = { cover: box.querySelector(".music-cover"), text: box.querySelector(".music-text"), title: box.querySelector(".music-title"),
      artist: box.querySelector(".music-artist"), bar: box.querySelector(".music-bar i"), song: null, num: 0, active: null };
  }
  function coverLoad(m, url) {
    const n = ++m.num;
    if (!url) return;
    const img = new Image();
    img.src = url.startsWith("data:") ? url : url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
    img.onload = () => {
      if (n !== m.num) return;
      m.cover.appendChild(img);
      requestAnimationFrame(() => requestAnimationFrame(() => img.classList.add("on")));
      const previous = m.active; m.active = img;
      if (previous) setTimeout(() => previous.remove(), 900);
    };
  }
  function musicShow(d) {
    musicData = d;
    const status = d && d.status ? String(d.status).toLowerCase() : "";
    const has = !!(d && d.title) && Z.music.displayed !== false;
    const plays = has && status !== "paused" && status !== "stopped";
    $$(".music").forEach(box => {
      const m = musicBox(box);
      // erst nach drei Abfragen ohne Musik ausblenden – kurze Aussetzer lassen die Box nicht flackern
      m.without = plays ? 0 : (m.without || 0) + 1;
      if (plays) box.classList.add("on");
      else if (m.without >= 3 || Z.music.displayed === false || !box.classList.contains("on")) box.classList.remove("on");
      if (!has) return;
      const k = (d.artists || []).join(", "), song = d.title + "|" + k;
      if (song !== m.song) {
        const initially = m.song === null; m.song = song;
        const set = () => { m.title.textContent = d.title; m.artist.textContent = k || d.album || ""; m.text.classList.remove("switchTo"); };
        if (initially) set(); else { m.text.classList.add("switchTo"); setTimeout(set, 400); }
        coverLoad(m, d.cover_url);
        [2000, 5000].forEach(ms => setTimeout(() => { if (m.song === song) coverLoad(m, d.cover_url); }, ms));
        m.bar.style.transition = "none"; m.bar.style.transform = "scaleX(0)"; void m.bar.offsetWidth; m.bar.style.transition = "";
      }
      if (d.duration > 0) m.bar.style.transform = `scaleX(${Math.min(1, (d.progress || 0) / d.duration)})`;
    });
  }
  function music() {
    if (TEST) {
      const start = Date.now();
      const tick = () => musicShow({ title: "Nachtfahrt", artists: ["Beispiel-Band"], cover_url: "media/themes/dachcs.png", duration: 200000, progress: 50000 + Date.now() - start, status: "playing" });
      tick(); if (!PREVIEW) setInterval(tick, 1000);
      return;
    }
    let failures = 0;
    (function retrieve() {
      // nur wenn es Musik-Boxen gibt (bzw. in overlay.html jederzeit welche kommen können)
      if (!$$(".music").length && !document.querySelector(".stage")) return setTimeout(retrieve, 3000);
      const adr = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(Z.music.address || "") ? Z.music.address : "http://localhost:1608/";
      fetch(adr, { cache: "no-store" })
        .then(r => r.json()).then(d => { failures = 0; musicShow(d); }).catch(() => { failures++; musicShow(null); })
        .finally(() => setTimeout(retrieve, failures > 3 ? 5000 : 1000));
    })();
  }

  /* ---------- Alles zeichnen ---------- */
  function cornersSet() {
    $$(".box").forEach(b => {
      if (b.dataset.corner !== undefined || !b.offsetWidth) return;
      const r = b.getBoundingClientRect(), middle = r.left + r.width / 2, width = document.documentElement.clientWidth || 1920;
      b.dataset.corner = middle < width * 0.42 ? "left" : middle > width * 0.58 ? "right" : "middle";
    });
  }
  function draw() {
    diagnose(); theme(); graphics(); veto(); series(); players(); texts(); teams(); timer(); ticker(); background(); sources(); sponsors();
    if (!(Z.speaker || {}).on) $$(".cam.speaks").forEach(k => k.classList.remove("speaks"));
    $$(".music").forEach(m => m.classList.toggle("off", Z.music.displayed === false));
    if (musicData && $$(".music").some(b => !b._music)) musicShow(musicData);
    liveDraw();
    tournamentDraw();
    audioApply();
    document.body.classList.toggle("dach-frame-show", !!(Z.dach || {}).frameShow);
    document.body.classList.toggle("clean", !!(Z.broadcast || {}).clean && currentSceneName() === "ingame");
    requestAnimationFrame(cornersSet);
    dispatchEvent(new CustomEvent("cast-drawn", { detail: Z }));
  }

  /* ---------- Verbindung ---------- */
  function imagesCleanup(z) {
    const used = new Set((JSON.stringify(z).match(/asset:[a-z0-9]+/g) || []).map(x => x.slice(6)));
    Object.keys(K.Images.mem).forEach(id => { if (!used.has(id)) delete K.Images.mem[id]; });
  }
  function adopt(z, originPage) {
    if (!z || (z.revision || 0) < (Z.revision || 0)) return;
    imagesCleanup(z);
    receivedFrom = originPage || "Steuerseite"; receivedUm = Date.now();
    rawState = K.merge(K.clone(K.DEFAULT), z);
    Z = K.resolve(rawState, K.Images.mem);
    K.save(rawState);
    draw();
  }
  // Bilder kamen dazu -> alles mit den echten Bildern neu zeichnen
  function newDraw() {
    Z = K.resolve(rawState, K.Images.mem);
    $$(".cam[data-source]").forEach(k => { if (k._source && /asset:|data:/.test(k._source)) k._source = null; });
    draw();
  }
  // Meldungen der Overlays landen im Log der App (Reiter „Log") – z. B. Video-Probleme in OBS
  const reported = {};
  function message(text) {
    const now = Date.now();
    if (reported[text] && now - reported[text] < 30000) return;
    reported[text] = now;
    const reportedKeys = Object.keys(reported); if (reportedKeys.length > 50) reportedKeys.slice(0, 25).forEach(k => delete reported[k]);
    if (K.SERVER && !PREVIEW) fetch("/api/report", { method: "POST", body: JSON.stringify({ page: currentSceneName() + (/OBS\//.test(navigator.userAgent) ? " (OBS)" : ""), text: String(text).slice(0, 300) }) }).catch(() => {});
  }
  if (PREVIEW) document.documentElement.style.background = "#0b0c10";
  window.CastOverlay = { newDraw, message, corners: cornersSet, get Z() { return Z; } };

  /* ---------- OBS: Bildtakt ----------
     Die Browserquelle in OBS übernimmt Änderungen, die nur „im Hintergrund" passieren (laufendes Video,
     durchlaufender Lauftext), nicht zuverlässig in die Aufnahme – dann zeigt OBS ein altes Bild
     (z. B. den Theme-Hintergrund vom Seitenstart) statt des Videos. Eine winzige, unsichtbare Änderung
     in jedem Bild zwingt OBS, jedes Bild frisch zu übernehmen. Läuft nur in OBS und nur, wenn die Quelle aktiv ist. */
  if (IN_OBS && !EMBEDDED && !PREVIEW) {
    const timerHandle = document.createElement("div");
    timerHandle.className = "obs-timer"; timerHandle.setAttribute("aria-hidden", "true");
    document.body.appendChild(timerHandle);
    let n = 0, running = true;
    const step = () => {
      if (!running) return;
      timerHandle.style.backgroundColor = (n++ & 1) ? "rgba(0,0,0,.004)" : "rgba(0,0,0,.006)";
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    addEventListener("obsSourceActiveChanged", ev => {
      const on = !!(ev.detail && ev.detail.active);
      if (on && !running) { running = true; requestAnimationFrame(step); }
      if (!on) running = false;
    });
    window.__obsTimer = () => running;
    // Zustandsbericht alle 30 s ins Log der App: läuft das Video wirklich? Wie viel Speicher braucht die Seite?
    try { const n = +(sessionStorage.getItem("cast-loads") || 0) + 1; sessionStorage.setItem("cast-loads", n); setTimeout(() => message(`Seite geladen (${n}. Mal in dieser OBS-Sitzung)`), 800); } catch (e) {}
    let lastTime = -1;
    setInterval(() => {
      const v = document.querySelector(".backdrop video.on"), bgEl = document.querySelector(".backdrop");
      let text;
      if (bgEl && bgEl.classList.contains("obs-video")) text = "Hintergrund: OBS spielt ab";
      else if (!v) text = "Hintergrund: kein Video aktiv (Theme-Hintergrund)";
      else {
        const q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
        const runningV = v.currentTime !== lastTime && !v.paused; lastTime = v.currentTime;
        text = `Video ${runningV ? "läuft" : "STEHT"} (${Math.round(v.currentTime)} s, ${v.videoWidth}×${v.videoHeight}${q ? ", verworfen " + q.droppedVideoFrames + "/" + q.totalVideoFrames : ""})`;
      }
      const mem = performance.memory ? ` · Speicher ${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB` : "";
      message(`Bericht: ${text}${mem} · Szene ${currentSceneName()}`);
    }, 30000);
    setTimeout(() => message("OBS erkannt – Bildtakt aktiv (hält Video und Lauftext in der Aufnahme aktuell)"), 1500);
  }

  if (!EMBEDDED && !PREVIEW) K.channel({   // Vorschau & eingebettete Szenen bekommen den Stand direkt
    query: true,
    onlyServer: true,
    onLive(d) { liveData = d; liveDraw(); },   // über den Cast-Dienst: Stand regelmäßig abholen
    obs: false,   // Overlays verbinden sich nicht selbst – die Steuerseite schickt über OBS direkt hierher
    onMessage(d) {
      if (d.cast === "images" && d.images) K.Images.set(d.images).then(newDraw);
      if (d.cast === "state") adopt(d.z, "Steuerseite");
    },
    onStorage() { const n = K.load(); if ((n.revision || 0) > (Z.revision || 0)) { rawState = n; Z = K.resolve(n, K.Images.mem); draw(); } }
  });
  if (!K.SERVER && "BroadcastChannel" in window) new BroadcastChannel("cast-overlay").postMessage({ cast: "request" });
  // Sicherheitsnetz ohne App: gespeicherten Stand regelmäßig prüfen (gleicher Browser, andere Tabs)
  if (!K.SERVER || PREVIEW) setInterval(() => { if (K.savedRevision() > (Z.revision || 0)) { const n = K.load(); if ((n.revision || 0) > (Z.revision || 0)) { rawState = n; K.Images.load().then(newDraw); } } }, 1000);
  // Vorschau in der Steuerseite (iframe) bekommt den Zustand direkt
  addEventListener("message", ev => {
    if (window.parent === window || ev.source !== window.parent) return;   // nur die Vorschau der Steuerseite
    const d = ev.data;
    if (d && d.cast === "show") { document.body.classList.remove("waiting"); return; }
    if (d && d.cast === "state" && d.z) { Z = rawState = K.merge(K.clone(K.DEFAULT), d.z); receivedFrom = "Vorschau der Steuerseite"; receivedUm = Date.now(); draw(); }
    if (d && d.cast === "live") { liveData = d.live; liveDraw(); }
    if (d && d.cast === "monitor") {
      const before = monitorOn(); monitor = { mode: d.mode || "off", vol: +d.vol || 0 }; audioctx(); audioApply(); previewAudio();
      if (before !== monitorOn()) { $$(".cam").forEach(k => { k._cacheKey = null; }); $$(".dach-page").forEach(f => { f.allow = monitorOn() ? "autoplay" : "autoplay 'none'"; if (f.src && !f.src.endsWith("about:blank")) f.src = f.src; }); newDraw(); }
    }
  });

  music();
  draw();
  K.Images.load().then(newDraw);             // gemerkte Bilder aus der Datenbank holen
  if (document.fonts) document.fonts.ready.then(() => { $$(".ticker").forEach(t => { t._cacheKey = null; }); ticker(); fit(); });
})();
