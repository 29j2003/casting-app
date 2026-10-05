/* =====================================================================
   CAST-OVERLAY · Szenen-Logik
   Liest den Zustand (von der Steuerseite) und zeichnet die Szene.
   ===================================================================== */
(function () {
  "use strict";
  const K = window.CastKern;
  const P = new URLSearchParams(location.search);
  const TEST = P.get("test") === "1";
  const VORSCHAU = P.get("vorschau") === "1";
  // eingebettet = Szene läuft in overlay.html (eine Browserquelle für alles)
  const EINGEBETTET = P.get("eingebettet") === "1";
  if (VORSCHAU) document.body.classList.add("still");
  if (EINGEBETTET) document.body.classList.add("eingebettet", "wartet");

  let Zroh = K.laden();                              // Zustand mit Bild-Verweisen (klein)
  let Z = K.aufloesen(Zroh, K.Bilder.mem);         // Zustand mit echten Bildern (zum Zeichnen)
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hol = pfad => pfad.split(".").reduce((o, k) => (o == null ? o : o[k]), Z);

  /* ---------- Theme ---------- */
  function rgb(hex) {
    const m = String(hex).replace("#", "").match(/^([0-9a-f]{6})$/i);
    if (!m) return "255,255,255";
    const n = parseInt(m[1], 16);
    return `${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}`;
  }
  // Jedes Element merkt sich, womit es gezeichnet wurde – so bleiben weiterverwendete Teile
  // beim Szenenwechsel unangetastet (Lauftext läuft weiter, Logos flackern nicht).
  const neuNoetig = (el, schl) => { if (el._schl === schl) return false; el._schl = schl; return true; };
  // Akzentfarbe so weit abdunkeln, bis sie auf dem hellen Feld gut lesbar ist (Kontrast ≥ 3)
  function lesbar(akzent, hell) {
    const hex = h => { const m = String(h).replace("#", ""); const n = parseInt(m.length === 3 ? m.split("").map(x => x + x).join("") : m, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
    const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
    const kontrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    let farbe = hex(akzent); const bg = hex(hell || "#f6f6f6");
    for (let i = 0; i < 40 && kontrast(farbe, bg) < 3; i++) farbe = farbe.map(v => Math.round(v * .9));
    return `rgb(${farbe.join(",")})`;
  }
  const geladeneSchriften = {};
  function themeDaten() {
    const basis = (window.CAST_THEMES || {})[Z.theme] || (Z.eigeneThemes || {})[Z.theme] || Object.values(window.CAST_THEMES || {})[0] || {};
    return Object.assign({}, basis, (Z.themeDaten || {})[Z.theme] || {});
  }
  function schriftSetzen(T) {
    const r = document.documentElement.style;
    const stapel = '"Rajdhani", "Bahnschrift", "Barlow Ersatz", "Arial Narrow", sans-serif';
    r.setProperty("--fett", T.fett === false ? "0px" : ".022em");
    if (T.schriftDatei) {
      const name = "ThemeSchrift-" + T.schriftDatei.replace(/[^a-z0-9]/gi, "");
      r.setProperty("--schrift", `"${name}", ${stapel}`);
      if (!geladeneSchriften[name]) {
        geladeneSchriften[name] = true;
        const f = new FontFace(name, `url("${T.schriftDatei}")`, { weight: "100 900" });
        f.load().then(ff => { document.fonts.add(ff); $$(".ticker").forEach(t => { t._schl = null; }); ticker(); einpassen(); }).catch(() => {});
      }
    } else if (T.schrift) {
      r.setProperty("--schrift", `"${String(T.schrift).replace(/"/g, "")}", ${stapel}`);
    } else r.setProperty("--schrift", stapel);
  }
  const aktSzeneName = () => document.body.dataset.aktszene || document.body.dataset.szene || "";
  function markeZeichnen(m, T, nurIcon) {
    m.classList.toggle("nur-icon", nurIcon);
    m.classList.toggle("mit-bild", !nurIcon && !!T.markeBild && !T.markeBox);
    m.classList.toggle("text-dunkel", T.markeText === "dunkel");
    m.classList.toggle("zeilen-tausch", !!T.zeilenTausch);
    m.classList.toggle("box-an", !nurIcon && !!(T.markeBild && T.markeBox));
    if (nurIcon) { m.classList.remove("ohne-icon"); m.innerHTML = `<div class="marke-icon"><img src="${esc(T.icon)}" alt=""></div>`; return; }
    if (T.markeBild) { m.classList.remove("ohne-icon"); m.innerHTML = `<img class="marke-bild" src="${esc(T.markeBild)}" alt="">`; return; }
    m.classList.toggle("ohne-icon", !T.icon);
    m.innerHTML = `<div class="marke-icon">${T.icon ? `<img src="${esc(T.icon)}" alt="">` : ""}</div><div class="marke-text">` +
      (T.schriftBild ? `<img src="${esc(T.schriftBild)}" alt="">` : `<div class="z1">${esc(T.zeile1)}</div><div class="z2">${esc(T.zeile2)}</div>`) + `</div>`;
  }
  function theme() {
    const T = themeDaten();
    const r = document.documentElement.style;
    r.setProperty("--dunkel", T.dunkel); r.setProperty("--hell", T.hell);
    r.setProperty("--text-dunkel", T.textDunkel); r.setProperty("--akzent", T.akzent);
    r.setProperty("--akzent-rgb", rgb(T.akzent));
    r.setProperty("--akzent-lesbar", lesbar(T.akzent, T.hell));
    r.setProperty("--linie", T.linie ? "5px" : "0px");
    r.setProperty("--icon-platte", T.iconPlatte || T.dunkel);
    r.setProperty("--kopf-text", T.kopfText || T.akzent);
    document.body.dataset.ecken = T.ecken || "aussen";
    document.body.className = document.body.className.replace(/\btheme-\S+/g, "").trim() + " theme-" + Z.theme;
    schriftSetzen(T);
    const modus = (Z.logoModus || {})[aktSzeneName()] || "auto";
    const schluessel = JSON.stringify([Z.theme, T.icon, T.schriftBild, T.markeBild, T.markeBox, T.zeile1, T.zeile2, modus]);
    $$(".marke").forEach(m => {
      if (!neuNoetig(m, schluessel + "|" + (m.dataset.max || ""))) return;
      const max = +m.dataset.max || 0;
      const nurIcon = modus === "icon" && !!T.icon;
      markeZeichnen(m, T, nurIcon);
      // „auto": passt das volle Logo nicht in den freien Platz, nur das Icon zeigen
      if (modus === "auto" && max && T.icon) {
        const pruefen = () => { if (m.offsetWidth > max) markeZeichnen(m, T, true); };
        const bilder = [...m.querySelectorAll("img")].filter(i => !i.complete);
        if (bilder.length) bilder.forEach(i => i.addEventListener("load", pruefen, { once: true })); else pruefen();
      }
    });
    $$(".hg-leer").forEach(h => {
      if (!neuNoetig(h, schluessel + "|" + T.hintergrundBild)) return;
      const i = h.querySelector("img");
      if (i) { if (T.icon) { i.src = T.icon; i.classList.remove("aus"); } else i.classList.add("aus"); }
      h.classList.toggle("mit-bild", !!T.hintergrundBild);
      h.style.backgroundImage = T.hintergrundBild ? K.cssUrl(T.hintergrundBild) : "";
    });
  }

  /* ---------- Texte ---------- */
  function texte() {
    $$("[data-t]").forEach(e => { const v = hol(e.dataset.t); if (e.textContent !== String(v ?? "")) e.textContent = v ?? ""; });
    einpassen();
  }
  function einpassen() {
    $$("[data-passend]").forEach(e => {
      e.style.fontSize = "";
      const box = e.parentElement;
      let s = parseFloat(getComputedStyle(e).fontSize);
      while (e.scrollWidth > box.clientWidth - 30 && s > 16) { s -= 2; e.style.fontSize = s + "px"; }
    });
  }

  /* ---------- Lauftext ---------- */
  function ticker() {
    const liste = (Z.texte.ticker || []).filter(Boolean);
    const S = Z.sponsoren || {};
    if (S.an !== false && S.imTicker) sponsorListe().forEach(s => { if (s.name) liste.push(`${Z.texte.sponsorTicker} ${s.name}`); });
    const schluessel = liste.join("\u0001") + "|" + Z.texte.tickerTempo;
    $$(".ticker").forEach(t => {
      if (!neuNoetig(t, schluessel)) return;
      t.getAnimations({ subtree: true }).forEach(a => a.cancel());
      t.innerHTML = "";
      if (!liste.length) return;
      const band = document.createElement("div");
      band.className = "ticker-band";
      const einmal = liste.map(x => `<span>${esc(x)}</span><i></i>`).join("");
      band.innerHTML = einmal;
      t.appendChild(band);
      // so oft wiederholen, bis das Band doppelt so breit ist wie der Kasten
      const breite = band.scrollWidth || 1;
      // für die breiteste mögliche Box reichen (Kästen können beim Szenenwechsel breiter werden)
      const mal = Math.max(1, Math.ceil(Math.max(t.clientWidth, 1920) / breite));
      band.innerHTML = einmal.repeat(mal * 2);
      const weg = breite * mal;
      const dauer = weg / Math.max(20, Z.texte.tickerTempo || 90) * 1000;
      band.animate([{ transform: "translate3d(0,0,0)" }, { transform: `translate3d(${-weg}px,0,0)` }],
        { duration: dauer, iterations: Infinity, easing: "linear" });
    });
  }

  /* ---------- Teams ---------- */
  function teams() {
    ["a", "b"].forEach(k => {
      const t = Z.teams[k] || {};
      $$(`.team-logo.${k}`).forEach(e => {
        const woerter = String(t.name || k).split(/\s+/).filter(Boolean);
        const kuerzel = (woerter.length > 1 ? woerter.map(w => w[0]).join("") : woerter[0] || k).replace(/[^A-Za-z0-9ÄÖÜäöü]/g, "").slice(0, 3).toUpperCase();
        const neu = t.logo ? `<img src="${esc(t.logo)}" alt="">` : esc(kuerzel);
        if (e.dataset.inhalt !== neu) {
          e.dataset.inhalt = neu; e.innerHTML = neu;
          const img = e.querySelector("img");
          if (img) img.addEventListener("error", () => { e.innerHTML = esc(kuerzel); e.classList.add("kein"); }, { once: true });
        }
        e.classList.toggle("kein", !t.logo);
      });
      $$(`[data-team-name="${k}"]`).forEach(e => { e.textContent = t.name || ""; });
      $$(`[data-team-score="${k}"]`).forEach(e => { e.textContent = t.score ?? 0; });
    });
    $$(".vs").forEach(e => {
      const erg = Z.teams.ergebnis;
      e.classList.toggle("ergebnis", !!erg);
      e.innerHTML = erg ? `${esc(Z.teams.a.score ?? 0)}<span class="dp">:</span>${esc(Z.teams.b.score ?? 0)}` : "vs";
    });
  }

  /* ---------- Map-Veto ---------- */
  const normMap = n => String(n || "").toLowerCase().replace(/^de_/, "").replace(/[^a-z0-9]/g, "").replace(/ii$/, "2");
  function mapBild(name) {
    return (Z.mapPool || []).find(x => normMap(x.name) === normMap(name)) || {};
  }
  function vetoSchritte() {
    const V = Z.veto || {};
    if (V.schritte && V.schritte.length) return V.schritte;
    const p = (Z.vetoPresets || {})[V.format] || K.STANDARD.vetoPresets.bo3;
    return p.schritte.map(([aktion, team]) => ({ aktion, team, map: "" }));
  }
  let vetoMaps = [];
  function veto() {
    $$(".veto").forEach(box => vetoZeichnen(box));
  }
  function vetoZeichnen(box) {
    const s = vetoSchritte();
    const schluessel = JSON.stringify([s, Z.mapPool, Z.texte.ban, Z.texte.pick, Z.texte.decider, Z.texte.amZug, Z.texte.laeuft]);
    if (!neuNoetig(box, schluessel)) return;
    const dran = s.findIndex(x => !x.map);
    const breite = Math.min(262, Math.floor((1806 - (s.length - 1) * 16) / Math.max(1, s.length)));
    box.style.setProperty("--kb", breite + "px");
    const label = { ban: Z.texte.ban, pick: Z.texte.pick, decider: Z.texte.decider };
    box.innerHTML = s.map((x, i) => {
      const pool = x.map ? mapBild(x.map) : {};
      const bild = x.map ? (x.bild || pool.bild || "") : "";
      const ganz = pool.bildModus === "ganz" ? ' class="ganz"' : "";
      const neu = x.map && vetoMaps[i] !== x.map && vetoMaps.length ? " neu" : "";
      const anderes = x.team === "a" ? "b" : "a";
      const seite = x.map && x.aktion === "pick" && x.seite
        ? `<div class="veto-seite"><span><span data-team-name="${anderes}"></span> · ${x.seite.toUpperCase()}</span></div>` : "";
      const team = x.team
        ? `<div class="team-logo ${x.team}"></div><span data-team-name="${x.team}"></span>`
        : `<span>${esc(Z.texte.decider)}</span>`;
      const text = x.map ? esc(x.map) : (i === dran ? esc(Z.texte.amZug) : "?");
      const erg = x.map && x.aktion !== "ban" ? ergebnisBadge(x.ergebnis) : "";
      return `<div class="box veto-karte ${x.aktion}${x.map ? "" : " offen"}${i === dran ? " dran" : ""}${neu}">
        <div class="box-kopf">${esc(label[x.aktion] || x.aktion)}</div>
        <div class="veto-bild">${bild ? `<img${ganz} src="${esc(bild)}" alt="">` : `<div class="initial">${x.map ? esc(x.map[0]) : ""}</div>`}${erg}${seite}<div class="veto-map">${text}</div></div>
        <div class="veto-team">${team}</div></div>`;
    }).join("");
    vetoMaps = s.map(x => x.map);
  }

  /* ---------- Serie ---------- */
  function ergebnisBadge(e) {
    if (!e || !e.status || e.status === "offen") return "";
    if (e.status === "laeuft" && (e.a === "" || e.a == null)) return `<div class="veto-ergebnis laeuft">${esc(Z.texte.laeuft)}</div>`;
    return `<div class="veto-ergebnis${e.status === "laeuft" ? " laeuft" : ""}">${esc(e.a ?? 0)}<span class="dp">:</span>${esc(e.b ?? 0)}</div>`;
  }
  function gespielteMaps() { return vetoSchritte().filter(x => x.aktion !== "ban" && x.map); }
  function serienStand() {
    let a = 0, b = 0;
    gespielteMaps().forEach(x => { const e = x.ergebnis || {}; if (e.status === "fertig") { if (+e.a > +e.b) a++; else if (+e.b > +e.a) b++; } });
    return [a, b];
  }
  function serie() {
    const [sa, sb] = serienStand();
    $$(".serie-stand").forEach(e => { e.innerHTML = `${sa}<span class="dp">:</span>${sb}`; });
    const maps = gespielteMaps();
    const schluessel = JSON.stringify([maps, Z.mapPool, Z.texte.map, Z.texte.laeuft, Z.texte.ausstehend]);
    $$(".serie-karten").forEach(k => { if (neuNoetig(k, schluessel)) serieZeichnen(k, null, maps); });
    $$(".serie-mini").forEach(m => { if (neuNoetig(m, schluessel)) serieZeichnen(null, m, maps); });
  }
  function serieZeichnen(karten, mini, maps) {
    if (karten && !maps.length) karten.innerHTML = `<div class="leer-hinweis">Noch keine gespielten Maps – erst das Map-Veto ausfüllen</div>`;
    if (karten && maps.length) {
      const breite = Math.min(360, Math.floor((1806 - (Math.max(1, maps.length) - 1) * 20) / Math.max(1, maps.length)));
      karten.style.setProperty("--kb", breite + "px");
      karten.innerHTML = maps.map((x, i) => {
        const e = x.ergebnis || {}, pool = mapBild(x.map), bild = x.bild || pool.bild || "";
        const status = e.status || "offen";
        const sieger = status === "fertig" ? (+e.a > +e.b ? "a" : +e.b > +e.a ? "b" : "") : "";
        const score = status === "offen" ? "" : `<div class="serie-score"><span class="${sieger === "b" ? "verloren" : ""}">${esc(e.a ?? 0)}</span><span class="dp">:</span><span class="${sieger === "a" ? "verloren" : ""}">${esc(e.b ?? 0)}</span></div>`;
        const fuss = sieger ? `<div class="team-logo ${sieger}"></div><span data-team-name="${sieger}"></span>`
                   : `<span>${esc(status === "laeuft" ? Z.texte.laeuft : Z.texte.ausstehend)}</span>`;
        return `<div class="box serie-karte ${status}"><div class="box-kopf">${esc(Z.texte.map)} ${i + 1}</div>
          <div class="veto-bild">${bild ? `<img${pool.bildModus === "ganz" ? ' class="ganz"' : ""} src="${esc(bild)}" alt="">` : `<div class="initial">${esc(x.map[0])}</div>`}${score}<div class="veto-map">${esc(x.map)}</div></div>
          <div class="veto-team">${fuss}</div></div>`;
      }).join("");
    }
    if (mini) {
      mini.innerHTML = maps.filter(x => (x.ergebnis || {}).status && x.ergebnis.status !== "offen").map(x =>
        `<div class="serie-chip ${x.ergebnis.status}"><b>${esc(x.map)}</b><span>${esc(x.ergebnis.a ?? 0)}<span class="dp">:</span>${esc(x.ergebnis.b ?? 0)}</span></div>`).join("");
    }
  }

  /* ---------- Sponsoren ---------- */

  function sponsorListe() { return (((Z.sponsoren || {}).listen || {})[Z.theme] || []).filter(s => s && (s.logo || s.name)); }
  const sponsorInhalt = s => s.logo ? `<img src="${esc(s.logo)}" alt="${esc(s.name || "")}">` : `<div class="sponsor-name">${esc(s.name)}</div>`;
  let sponsorTaktSchl = null, sponsorTakt = null, sponsorNr = 0;
  function sponsoren() {
    const S = Z.sponsoren || {}, liste = sponsorListe();
    const boxen = $$(".sponsor");
    const sichtbar = S.an !== false && (S.szenen || {})[aktSzeneName()] !== false && liste.length > 0;
    const schluessel = JSON.stringify([liste, S.sekunden, sichtbar]);
    boxen.forEach(b => {
      b.classList.toggle("an", sichtbar);
      if (!neuNoetig(b, schluessel)) return;
      const feld = b.querySelector(".sponsor-feld");
      feld.innerHTML = liste.map(sponsorInhalt).join("");
      const kinder = [...feld.children];
      if (kinder.length) kinder[sponsorNr % kinder.length].classList.add("an");
    });
    if (schluessel !== sponsorTaktSchl) {
      sponsorTaktSchl = schluessel;
      clearInterval(sponsorTakt); sponsorTakt = null;
      if (sponsorNr >= liste.length) sponsorNr = 0;
      if (sichtbar && liste.length > 1) sponsorTakt = setInterval(() => {
        sponsorNr = (sponsorNr + 1) % liste.length;
        $$(".sponsor").forEach(b => [...b.querySelector(".sponsor-feld").children].forEach((k, i) => k.classList.toggle("an", i === sponsorNr)));
      }, Math.max(3, S.sekunden || 8) * 1000);
    }
    {
      // Raster-Szene
      $$(".sponsor-raster").forEach(r => { if (!neuNoetig(r, schluessel)) return; r.innerHTML = liste.length ? liste.map(s => `<div class="sponsor-kachel">${sponsorInhalt(s)}</div>`).join("") : `<div class="leer-hinweis">Noch keine Sponsoren für dieses Theme</div>`; });
    }
    // große Einblendung (in allen Szenen)
    let gross = document.querySelector(".sponsor-gross");
    if (EINGEBETTET) return;
    if (!gross) {
      gross = document.createElement("div"); gross.className = "box sponsor-gross";
      gross.innerHTML = `<div class="box-kopf"></div><div class="sponsor-feld"></div>`;
      document.body.appendChild(gross);
    }
    const E = S.einblendung || {}, s = liste[E.nr];
    const aktiv = s && E.bis > Date.now();
    if (aktiv) {
      gross.querySelector(".box-kopf").textContent = Z.texte.sponsorLabel;
      const f = gross.querySelector(".sponsor-feld"), neu = sponsorInhalt(s);
      if (f.dataset.inhalt !== neu) { f.dataset.inhalt = neu; f.innerHTML = neu; }
      clearTimeout(gross._aus); gross._aus = setTimeout(sponsoren, E.bis - Date.now() + 50);
    }
    gross.classList.toggle("an", !!aktiv);
  }



  /* ---------- Turnierbaum ---------- */
  function turnierZeichnen() {
    const boxen = $$(".turnier-baum"); if (!boxen.length) return;
    const T = Z.turnier || {}, B = K.turnierAufbauen(T), S = T.sichtbar || {};
    const teamVon = id => (T.teams || []).find(t => t.id === id);
    const zeile = (id, punkte, sieger, verdeckt) => {
      if (id === "BYE") return `<div class="tb-team frei"><div class="tb-logo"></div><span>Freilos</span><b></b></div>`;
      const t = teamVon(id);
      if (!t || verdeckt) return `<div class="tb-team offen"><div class="tb-logo"></div><span>${verdeckt ? "?" : "–"}</span><b></b></div>`;
      const logo = t.logo ? `<img src="${esc(t.logo)}" alt="">` : esc((t.kurz || t.name || "?").slice(0, 3));
      return `<div class="tb-team${sieger ? " sieger" : ""}${T.fokus === id ? " fokus" : ""}"><div class="tb-logo">${logo}</div><span>${esc(t.name || "")}</span><b>${S.ergebnisseAus || punkte == null || punkte === "" ? "" : esc(punkte)}</b></div>`;
    };
    // Sichtbarkeit: „aufdecken“ = nur bis Runde X, „ab“ = erst ab Runde X, sonst alles
    const zeigen = nr => S.modus === "aufdecken" ? nr <= (+S.runde || 1) : S.modus === "ab" ? nr >= (+S.runde || 1) : true;
    const karte = (m, verdeckt) => `<div class="tb-match${m.fertig ? " fertig" : ""}${T.fokus && (m.a === T.fokus || m.b === T.fokus) ? " im-fokus" : ""}">` +
      zeile(m.a, m.sa, m.sieger && m.sieger === m.a, verdeckt) + zeile(m.b, m.sb, m.sieger && m.sieger === m.b, verdeckt) + `</div>`;
    const spalten = (runden, start) => runden.map((r, i) => !zeigen(start + i) && S.modus === "ab" ? "" :
      `<div class="tb-runde"><div class="tb-titel">${esc(r.titel)}</div><div class="tb-spiele">${r.matches.map(m => karte(m, !zeigen(start + i))).join("")}</div></div>`).join("");
    let h = "";
    if (!B.teams || B.teams.length < 2) h = `<div class="live-warten">Noch kein Turnier angelegt</div>`;
    else if (B.format === "tabelle") {
      const wahl = T.zeigeGruppe === undefined || T.zeigeGruppe === "" ? null : +T.zeigeGruppe;
      const gezeigt = B.gruppen.filter((g, i) => wahl === null || i === wahl);
      const spalten = gezeigt.length <= 1 ? 1 : gezeigt.length <= 4 ? 2 : gezeigt.length <= 6 ? 3 : 4;
      h = `<div class="tb-tabellen" style="grid-template-columns:repeat(${spalten}, 860px)">${gezeigt.map(g => `<div class="tb-tab"><div class="tb-titel">${esc(g.name)}</div>
        <div class="tb-tz kopf"><span>#</span><span></span><span>TEAM</span><span>SP</span><span>S</span><span>N</span><span>${g.mitRunden ? "RD" : "+/−"}</span><span>PKT</span></div>` +
        g.tabelle.map((r, i) => { const t = teamVon(r.id) || {};
          return `<div class="tb-tz${i < (+T.weiterPlaetze || 0) ? " weiter" : ""}${T.fokus === r.id ? " fokus" : ""}"><span>${i + 1}</span><div class="tb-logo">${t.logo ? `<img src="${esc(t.logo)}" alt="">` : esc((t.kurz || t.name || "?").slice(0, 3))}</div>` +
            `<span class="tb-tn">${esc(t.name || "")}</span><span>${r.sp}</span><span>${r.s}</span><span>${r.n}</span><span>${r.tb > 0 ? "+" : ""}${r.tb}</span><b>${r.pkt}</b></div>`; }).join("") +
        (T.spieleZeigen ? `<div class="tb-tspiele">${g.matches.filter(m => !m.fertig).slice(0, 4).map(m => karte(m, false)).join("")}</div>` : "") + `</div>`).join("")}</div>`;
    }
    else if (B.format === "gsl") h = `<div class="tb-gruppen">${B.gruppen.map(g => `<div class="tb-gruppe"><div class="tb-titel">${esc(g.name)}</div>${g.matches.map(m => `<div class="tb-gm"><span>${esc(m.titel)}</span>${karte(m, false)}</div>`).join("")}</div>`).join("")}</div>`;
    else if (B.format === "swiss") h = `<div class="tb-zeile">${spalten(B.runden, 1)}</div>` + (B.tabelle.length ? `<div class="tb-swiss">${B.tabelle.map(b => `<div class="tb-sw ${b.status}">${zeile(b.id, `${b.s}–${b.n}`, b.status === "weiter", false)}</div>`).join("")}</div>` : "");
    else {
      h = `<div class="tb-zeile">${spalten(B.runden, 1)}${B.finale && B.unten.length === 0 ? "" : ""}</div>`;
      if (B.unten.length) h = `<div class="tb-de"><div class="tb-zeile">${spalten(B.runden, 1)}</div><div class="tb-zeile unten">${spalten(B.unten, 1)}</div></div>` +
        (B.finale ? `<div class="tb-runde tb-gf"><div class="tb-titel">GRAND FINAL</div><div class="tb-spiele">${karte(B.finale, !zeigen(B.runden.length + 1))}</div></div>` : "");
    }
    // Profil des hervorgehobenen Teams (Klick in der App)
    const f = T.fokus && teamVon(T.fokus);
    let profil = "";
    if (f) {
      const st = f.stats || {};
      profil += `<div class="tb-profil box"><div class="box-kopf">${esc(f.name || "")}</div><div class="box-feld">` +
        (f.spieler && f.spieler.length ? `<div class="tb-spieler">${f.spieler.slice(0, 7).map(n => `<span>${esc(n)}</span>`).join("")}</div>` : "") +
        (st.matches ? `<div class="tb-stats"><div><b>${esc(st.winrate)}%</b><span>SIEGQUOTE</span></div><div><b>${esc(st.matches)}</b><span>SPIELE</span></div><div><b>${esc(st.serie || 0)}</b><span>SERIE</span></div></div>` +
          (st.letzte && st.letzte.length ? `<div class="tb-form">${st.letzte.slice(0, 5).map(x => `<i class="${x === "1" ? "s" : "n"}">${x === "1" ? "S" : "N"}</i>`).join("")}</div>` : "") : "") +
        `</div></div>`;
    }
    boxen.forEach(box => {
      if (!neuNoetig(box, h + profil)) return;
      box.innerHTML = `<div class="tb-innen">${h}</div>${profil}`;
      $$(".turnier-name").forEach(e => { e.textContent = T.name || Z.texte.titel || ""; });
      // auf die verfügbare Fläche einpassen
      requestAnimationFrame(() => { const i = box.querySelector(".tb-innen"); if (!i) return; i.style.transform = "";
        const s = Math.min(1.6, box.clientWidth / i.scrollWidth, box.clientHeight / i.scrollHeight);
        const x = Math.max(0, (box.clientWidth - i.scrollWidth * s) / 2);
        i.style.transform = `translateX(${x}px) scale(${s})`; });
    });
  }

  /* ---------- CS2-Livedaten ---------- */
  let liveDaten = null;
  const MAPNAME = n => { const roh = String(n || "").replace(/^(de|cs|ar)_/, ""); const p = (Z.mapPool || []).find(m => normMapName(m.name) === normMapName(roh)); return p ? p.name : roh.charAt(0).toUpperCase() + roh.slice(1); };
  const normMapName = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^dust2$/, "dustii");
  const seiteVon = team => !liveDaten ? "" : team === "a" ? liveDaten.seiteA : (liveDaten.seiteA === "CT" ? "T" : "CT");
  const staerke = p => p.adr + 2 * (p.k - p.d);                  // „stärkster Spieler“: Schaden pro Runde + 2 × (Kills − Tode)
  const spielerVon = team => !liveDaten ? [] : liveDaten.spieler.filter(p => p.seite === seiteVon(team)).sort((x, y) => y.k - x.k || y.adr - x.adr).slice(0, 5);
  const punkteVon = team => !liveDaten ? 0 : (seiteVon(team) === "CT" ? liveDaten.ct : liveDaten.t).score;
  function h2hPaar() {
    const w = (team) => { const l = spielerVon(team), gewaehlt = ((Z.h2h || {})[team]) || ""; return l.find(p => p.id === gewaehlt) || l.slice().sort((x, y) => staerke(y) - staerke(x))[0]; };
    return [w("a"), w("b")];
  }
  const warten = () => `<div class="live-warten">${esc(Z.texte.warteCs2 || "")}</div>`;
  function tabelleHtml(team, kompakt) {
    const l = spielerVon(team);
    const kopf = `<div class="lt-kopf"><div class="team-logo ${team}"></div><span data-team-name="${team}"></span><b class="lt-punkte">${punkteVon(team)}</b><span class="lt-seite">${seiteVon(team)}</span></div>`;
    const spalten = kompakt ? ["K", "D", "ADR"] : ["K", "D", "A", "ADR", "HS %"];
    const zeilen = l.map(p => `<div class="lt-zeile${p.hp <= 0 ? " tot" : ""}${liveDaten.beobachtet === p.id ? " fokus" : ""}"><span class="lt-name">${esc(p.name)}</span>` +
      (kompakt ? [p.k, p.d, p.adr] : [p.k, p.d, p.a, p.adr, p.hs]).map(v => `<span>${v}</span>`).join("") + `</div>`).join("");
    return kopf + `<div class="lt-zeile lt-titel"><span class="lt-name"></span>${spalten.map(s => `<span>${s}</span>`).join("")}</div>` + zeilen;
  }
  function liveZeichnen() {
    const da = !!liveDaten;
    // ohne CS2-Daten steht der Match-Titel im Kopf (nie ein leeres Feld)
    $$(".live-info").forEach(e => { const t = da ? `${MAPNAME(liveDaten.map)} · ${Z.texte.runde || "RUNDE"} ${liveDaten.runde + 1}` : (Z.texte.titel || ""); if (e.textContent !== t) e.textContent = t; });
    $$(".live-tabelle").forEach(e => {
      const team = e.dataset.team, h = da ? tabelleHtml(team, e.classList.contains("kompakt")) : warten();
      if (neuNoetig(e, h)) e.innerHTML = h;
    });
    $$(".live-team").forEach(e => {
      const team = e.dataset.team;
      const h = !da ? warten() : spielerVon(team).map(p => `<div class="box lt-karte"><div class="box-kopf">${esc(p.name)}</div><div class="box-feld">
          <div class="lt-gross"><b>${p.k}</b><span>/</span><b>${p.d}</b><span>/</span><b>${p.a}</b></div><div class="lt-klein">K / D / A</div>
          <div class="lt-werte"><div><b>${p.adr}</b><span>ADR</span></div><div><b>${p.hs}%</b><span>HS</span></div><div><b>${p.mvps}</b><span>MVP</span></div></div></div></div>`).join("");
      if (neuNoetig(e, h)) e.innerHTML = h;
    });
    $$(".live-h2h").forEach(e => {
      const [pa, pb] = da ? h2hPaar() : [];
      let h = warten();
      if (pa && pb) {
        const zeile = (name, va, vb, mehrBesser = true) => {
          const sum = va + vb, wa = sum ? Math.round(100 * va / sum) : 50;   // beide 0: neutral in der Mitte
          const fuehrt = va === vb ? "" : (va > vb) === mehrBesser ? "a" : "b";
          return `<div class="h2h-zeile"><b class="${fuehrt === "a" ? "vorn" : ""}">${va}</b><div class="h2h-balken"><i style="width:${wa}%"></i></div><span>${name}</span><div class="h2h-balken b"><i style="width:${100 - wa}%"></i></div><b class="${fuehrt === "b" ? "vorn" : ""}">${vb}</b></div>`;
        };
        h = `<div class="h2h-spieler"><div class="box"><div class="box-kopf"><span data-team-name="a"></span></div><div class="box-feld">${esc(pa.name)}</div></div>
             <div class="box"><div class="box-kopf"><span data-team-name="b"></span></div><div class="box-feld">${esc(pb.name)}</div></div></div>
             <div class="h2h-werte">${zeile("KILLS", pa.k, pb.k)}${zeile("DEATHS", pa.d, pb.d, false)}${zeile("ASSISTS", pa.a, pb.a)}${zeile("ADR", pa.adr, pb.adr)}${zeile("HS %", pa.hs, pb.hs)}${zeile("MVPs", pa.mvps, pb.mvps)}</div>`;
      }
      if (neuNoetig(e, h)) e.innerHTML = h;
    });
    teams();                                                    // Teamnamen/Logos in neu gezeichneten Teilen
    if ((Z.einblendungen || []).some(x => x.an && (x.typ === "scoreboard" || x.typ === "spieler"))) einblendungen();
  }

  /* ---------- Einblendungen (über jeder Szene) ---------- */
  let einblendTakt = null, faktTakt = null, faktNr = 0;
  // welche Map läuft gerade, welche kommt als Nächstes (aus Veto & Serie)
  function aktuelleMap() {
    const maps = gespielteMaps();
    let i = maps.findIndex(x => (x.ergebnis || {}).status === "laeuft");
    if (i < 0) i = maps.findIndex(x => (x.ergebnis || {}).status !== "fertig");
    if (i < 0) i = maps.length - 1;
    return { akt: maps[i] || null, next: maps[i + 1] || null };
  }
  function einblendInhalt(e) {
    if (e.typ === "punktestand")
      return `<div class="team-logo a"></div><div class="eb-stand"><span data-team-score="a"></span><span class="dp">:</span><span data-team-score="b"></span></div><div class="team-logo b"></div>`;
    if (e.typ === "caster") {
      const wer = ["c1", "c2"].concat(e.gast ? ["gast"] : []).map(k => Z.caster[k] || {}).filter(c => c.name);
      return `<div class="eb-caster-liste ${e.anordnung === "nebeneinander" ? "neben" : ""}">` +
        wer.map(c => `<div class="box eb-caster"><div class="box-kopf">${esc(c.name)}</div><div class="box-feld">${esc(c.zusatz || "")}</div></div>`).join("") + `</div>`;
    }
    if (e.typ === "mapinfo") {
      const { akt, next } = aktuelleMap();
      if (!akt) return `<div class="eb-mi"><b>${esc(Z.texte.mapVeto)}</b><span class="eb-mi-map">–</span></div>`;
      const wer = akt.aktion === "decider" || !akt.team ? `<b>${esc(Z.texte.decider)}</b>`
        : `<b>${esc(Z.texte.pick)}</b><div class="team-logo ${akt.team}"></div>`;
      return `<div class="eb-mi">${wer}<span class="eb-mi-map">${esc(akt.map)}</span>${next ? `<span class="eb-mi-next">${esc(Z.texte.next)}: ${esc(next.map)}</span>` : ""}</div>`;
    }
    if (e.typ === "scoreboard") {
      if (!liveDaten) return `<div class="box-kopf">${esc(Z.texte.scoreboard)}</div><div class="box-feld">${warten()}</div>`;
      return `<div class="box-kopf">${esc(Z.texte.scoreboard)} · <span>${esc(MAPNAME(liveDaten.map))}</span></div>
        <div class="eb-sb"><div class="live-tabelle kompakt" data-team="a">${tabelleHtml("a", true)}</div><div class="live-tabelle kompakt" data-team="b">${tabelleHtml("b", true)}</div></div>`;
    }
    if (e.typ === "spieler") {
      const p = liveDaten && (liveDaten.spieler.find(x => x.id === (e.spielerId || liveDaten.beobachtet)) || null);
      if (!p) return `<div class="box-kopf">SPIELER</div><div class="box-feld">${warten()}</div>`;
      const team = p.seite === seiteVon("a") ? "a" : "b";
      return `<div class="box-kopf"><div class="team-logo ${team}"></div><span>${esc(p.name)}</span></div>
        <div class="box-feld eb-sp"><div><b>${p.k}/${p.d}/${p.a}</b><span>K/D/A</span></div><div><b>${p.adr}</b><span>ADR</span></div><div><b>${p.hs}%</b><span>HS</span></div><div><b>${p.mvps}</b><span>MVP</span></div></div>`;
    }
    if (e.typ === "mapfakt") {
      const map = e.map || ((aktuelleMap().akt || {}).map) || "";
      const pool = mapBild(map), fakten = (pool.fakten || []).filter(Boolean);
      const nr = e.fakt >= 0 ? e.fakt : faktNr;
      const text = fakten.length ? fakten[nr % fakten.length] : "";
      return `<div class="box-kopf">${esc(Z.texte.mapFakt)}${map ? " · " + esc(map) : ""}</div><div class="box-feld">${esc(text)}</div>`;
    }
    return `<div class="box-kopf">${esc(e.titel || "")}</div><div class="box-feld">${esc(e.text || "")}</div>`;
  }
  const STANDARD_POS = { bauchbinde: "lu", caster: "lu", hinweis: "mo", punktestand: "mo", mapinfo: "lo", mapfakt: "ro", scoreboard: "mu", spieler: "lu" };
  function einblendungen() {
    if (EINGEBETTET) return;
    let ebene = document.querySelector(".einblend-ebene");
    if (!ebene) { ebene = document.createElement("div"); ebene.className = "einblend-ebene"; document.body.appendChild(ebene); }
    const jetzt = Date.now(), liste = Z.einblendungen || [];
    let naechstesEnde = 0, faktSek = 0;
    liste.forEach(e => {
      let d = ebene.querySelector(`[data-id="${CSS.escape(e.id)}"]`);
      if (!d) { d = document.createElement("div"); d.dataset.id = e.id; ebene.appendChild(d); }
      const pos = /^(lu|ru|mu|lo|ro|mo|lm|rm)$/.test(e.pos || "") ? e.pos : (STANDARD_POS[e.typ] || "lu");
      const klasse = `einblendung eb-${e.typ} pos-${pos}` + (e.typ === "caster" ? "" : " box") + (e.titel ? "" : " ohne-titel");
      const inhalt = einblendInhalt(e);
      if (d.dataset.schl !== klasse + inhalt) {
        const war = d.classList.contains("an");
        d.dataset.schl = klasse + inhalt; d.className = klasse + (war ? " an" : ""); d.innerHTML = inhalt;
      }
      const sichtbar = K.ebSichtbar(e, jetzt, aktSzeneName());
      d.classList.toggle("an", sichtbar);
      const wechsel = K.ebNaechsterWechsel(e, jetzt);
      if (wechsel) naechstesEnde = naechstesEnde ? Math.min(naechstesEnde, wechsel) : wechsel;
      if (sichtbar && e.typ === "mapfakt" && !(e.fakt >= 0)) faktSek = Math.max(4, +e.sekunden || 12);
    });
    [...ebene.children].forEach(d => { if (!liste.some(e => e.id === d.dataset.id)) d.remove(); });
    clearTimeout(einblendTakt);
    if (naechstesEnde) einblendTakt = setTimeout(einblendungen, naechstesEnde - jetzt + 30);
    // Map-Fakten nacheinander zeigen
    if (faktSek && !faktTakt) faktTakt = setInterval(() => { faktNr++; einblendungen(); teams(); }, faktSek * 1000);
    if (!faktSek && faktTakt) { clearInterval(faktTakt); faktTakt = null; }
  }

  /* ---------- Spieler ---------- */
  function spieler() {
    const boxen = $$(".lineup[data-team]");
    if (!boxen.length) return;
    const schluessel = JSON.stringify(Z.spieler);
    boxen.forEach(box => {
      if (!neuNoetig(box, schluessel)) return;
      const k = box.dataset.team;
      const liste = ((Z.spieler || {})[k] || []).slice(0, 5);
      while (liste.length < 5) liste.push(null);
      box.innerHTML = `<div class="box lineup-team"><div class="team-logo ${k}"></div><div class="box-feld"><span data-team-name="${k}" data-passend></span></div></div>` +
        liste.map(p => {
          if (!p || !p.name) return `<div class="box spieler-karte leer"><div class="spieler-bild"></div><div class="box-kopf">–</div><div class="box-feld"></div></div>`;
          const bild = p.bild ? `<img${p.bildModus === "ganz" ? ' class="ganz"' : ""} src="${esc(p.bild)}" alt="">` : `<div class="initial">${esc(p.name[0].toUpperCase())}</div>`;
          const level = p.level ? `<div class="spieler-level">${esc(p.level)}</div>` : "";
          return `<div class="box spieler-karte"><div class="spieler-bild">${bild}${level}</div><div class="box-kopf">${esc(p.name)}</div><div class="box-feld">${esc(p.echt || "")}</div></div>`;
        }).join("");
    });
  }


  /* ---------- Ton je Quelle: Lautstärke (bis 300 %), stumm, Verzögerung, Abhören ----------
     Programm (OBS): spielt, wenn nicht stumm und nicht „nur abhören“. Vorschau in der App: spielt, wenn Abhören an ist. */
  let audioKtx = null, monitor = { modus: "aus", vol: 100 };       // Abhören in der App: aus · app · beides (App + OBS)
  const monitorAn = () => monitor.modus === "app" || monitor.modus === "beides";
  const tonKetten = new Set();
  function tonFuerVideo(v, an) {
    if (!an) { v.muted = true; return; }
    const c = ktx(); if (!c) return;
    if (!v._ton) { try { tonKette(c.createMediaElementSource(v), "hintergrund", () => v.isConnected); v._ton = true; } catch (e) { return; } }
    v.muted = false;
  }
  function ktx() {
    if (!audioKtx) { try { audioKtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (audioKtx.state === "suspended") audioKtx.resume().catch(() => {});
    return audioKtx;
  }
  function tonEinst(key) { return Object.assign({ vol: 100, stumm: key === "hintergrund", delay: 0, abhoeren: "beides" }, ((Z.audio || {})[key]) || {}); }
  function tonPegel(key) {
    const T = tonEinst(key);
    if (T.stumm) return 0;
    if (VORSCHAU) return T.abhoeren === "aus" || !monitorAn() ? 0 : (T.vol / 100) * (monitor.vol / 100);
    return T.abhoeren === "nur" ? 0 : T.vol / 100;
  }
  function tonKette(quelle, key, lebt) {
    const c = ktx(); if (!c) return null;
    const d = c.createDelay(5), g = c.createGain();
    quelle.connect(d); d.connect(g); g.connect(c.destination);
    const t = { d, g, key, lebt }; tonKetten.add(t); tonAnwenden(); return t;
  }
  function tonAnwenden() {
    const hgAn = !tonEinst("hintergrund").stumm;
    $$(".hg video").forEach(v => tonFuerVideo(v, hgAn));
    tonKetten.forEach(t => {
      if (!t.lebt()) { try { t.g.disconnect(); } catch (e) {} tonKetten.delete(t); return; }
      t.g.gain.value = tonPegel(t.key); t.d.delayTime.value = Math.min(5, Math.max(0, (+tonEinst(t.key).delay || 0) / 1000));
    });
    // VDO.Ninja: Lautstärke über dessen Iframe-Schnittstelle (höchstens 100 %)
    $$(".kam[data-quelle] iframe").forEach(f => {
      const v = Math.min(1, tonPegel(f.closest(".kam").dataset.quelle));
      if (f._vol !== v) { f._vol = v; try { f.contentWindow.postMessage({ volume: v }, "*"); } catch (e) {} }
    });
  }
  setInterval(() => { $$(".kam[data-quelle] iframe").forEach(f => { f._vol = null; }); tonAnwenden(); }, 3000);
  // App-Fenster: eigene Videos/Audios direkt regeln, fremde Seiten (Clips, VDO, DACH) ohne Freigabe stumm halten
  function vorschauTon() {
    if (!VORSCHAU) return;
    const an = monitorAn(), vol = Math.max(0, Math.min(1, monitor.vol / 100));
    $$("video, audio").forEach(m => { if (m._ton) return; m.muted = !an; m.volume = vol; });
    $$("iframe").forEach(f => {
      const soll = an ? "autoplay" : "autoplay 'none'";
      if (f.getAttribute("allow") !== soll) { f.setAttribute("allow", soll); if (f.src && !/about:blank$/.test(f.src)) f.src = f.src; }
      if (an) try { f.contentWindow.postMessage({ volume: vol }, "*"); } catch (e) {}
    });
  }
  if (VORSCHAU) setInterval(vorschauTon, 1000);

  /* ---------- Quellen in den Kamera-Rahmen ---------- */
  function linkAufbereiten(Q, key) {
    let u = String(Q.url || "").trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) u = "https://vdo.ninja/?view=" + encodeURIComponent(u);   // nur Stream-ID eingegeben
    try {
      const url = new URL(u);
      if (/(^|\.)(vdo|obs)\.ninja$/i.test(url.hostname)) {
        const p = url.searchParams;
        if (!p.has("cleanoutput")) p.set("cleanoutput", "");
        if (Q.anpassen !== "ganz" && !p.has("cover")) p.set("cover", "");
        if (Q.ton === false && !p.has("noaudio")) p.set("noaudio", "");
        if (VORSCHAU && !monitorAn() && !p.has("noaudio")) p.set("noaudio", "");     // Vorschau: nur mit Abhören hörbar
        const verz = +tonEinst(key).delay || 0;
        if (verz > 0) p.set("buffer", String(Math.round(verz)));          // Bild + Ton verzögern (z. B. passend zum Spiel)
        return url.toString().replace(/=(&|$)/g, "$1");
      }
      return url.toString();
    } catch (e) { return u; }
  }
  async function geraetStarten(box, Q) {
    const v = document.createElement("video");
    v.autoplay = true; v.playsInline = true; v.muted = !Q.ton;
    box.appendChild(v);
    try {
      const md = navigator.mediaDevices;
      let geraete = await md.enumerateDevices();
      if (!geraete.some(d => d.label)) {            // ohne Freigabe gibt es keine Gerätenamen
        const s = await md.getUserMedia({ video: true }); s.getTracks().forEach(t => t.stop());
        geraete = await md.enumerateDevices();
      }
      // Geräte-IDs unterscheiden sich zwischen Browser und OBS – deshalb zuerst über den Namen suchen
      const d = geraete.find(x => x.kind === "videoinput" && Q.geraetName && x.label === Q.geraetName)
             || geraete.find(x => x.kind === "videoinput" && x.deviceId === Q.geraet);
      const video = { width: { ideal: 1920 }, height: { ideal: 1080 } };
      if (d) video.deviceId = { exact: d.deviceId };
      const stream = await md.getUserMedia({ video, audio: !!Q.ton || !!(Z.sprecher || {}).an });
      if (!box.isConnected) { stream.getTracks().forEach(t => t.stop()); return; }
      box._stream = stream; v.srcObject = stream; v.muted = true;
      if (stream.getAudioTracks().length) { const c = ktx(); if (c) tonKette(c.createMediaStreamSource(stream), box.closest(".kam").dataset.quelle, () => box.isConnected); }
      pegelMessen(box.closest(".kam"), stream);
    } catch (e) {
      box.innerHTML = `<div class="kam-fehler">Kamera nicht verfügbar<small>${esc(e && (e.name || e.message) || e)}</small></div>`;
    }
  }
  /* Sprecher-Anzeige: Pegel messen und das Schild aufleuchten lassen */
  const pegelHalten = new WeakMap();
  function pegel(k, wert) {
    if (!(Z.sprecher || {}).an) { k.classList.remove("spricht"); return; }
    if (wert > ((Z.sprecher || {}).schwelle || .08)) {
      k.classList.add("spricht");
      clearTimeout(pegelHalten.get(k));
      pegelHalten.set(k, setTimeout(() => k.classList.remove("spricht"), 450));
    }
  }
  let audioKontext = null;
  function pegelMessen(k, stream) {
    const spur = stream.getAudioTracks()[0];
    if (!spur) return;
    try {
      audioKontext = audioKontext || new (window.AudioContext || window.webkitAudioContext)();
      audioKontext.resume().catch(() => {});
      const quelle = audioKontext.createMediaStreamSource(new MediaStream([spur]));
      const analyse = audioKontext.createAnalyser(); analyse.fftSize = 512;
      quelle.connect(analyse);
      const daten = new Float32Array(analyse.fftSize);
      const t = setInterval(() => {
        if (!k.isConnected || spur.readyState === "ended") { clearInterval(t); try { quelle.disconnect(); analyse.disconnect(); } catch (e) {} return; }
        analyse.getFloatTimeDomainData(daten);
        let s = 0; for (const v of daten) s += v * v;
        pegel(k, Math.sqrt(s / daten.length) * 4);
      }, 100);
    } catch (e) {}
  }
  // VDO.Ninja meldet Pegel über seine iframe-Schnittstelle
  addEventListener("message", ev => {
    const d = ev.data;
    if (!d || typeof d !== "object" || d.loudness == null) return;
    const k = $$(".kam[data-quelle]").find(x => { const f = x.querySelector("iframe"); return f && f.contentWindow === ev.source; });
    if (!k) return;
    const werte = typeof d.loudness === "object" ? Object.values(d.loudness) : [d.loudness];
    pegel(k, Math.max(0, ...werte.map(Number).filter(n => !isNaN(n))) / 100);
  });
  setInterval(() => {
    if (!(Z.sprecher || {}).an) return;
    $$(".kam[data-quelle] iframe").forEach(f => { try { f.contentWindow.postMessage({ getLoudness: true }, "*"); } catch (e) {} });
  }, 3000);

  function quellen() {
    $$(".kam[data-quelle]").forEach(k => {
      const Q = ((Z.quellen || {})[k.dataset.quelle]) || { typ: "leer" };
      const schluessel = JSON.stringify([Q, !!(Z.sprecher || {}).an, Q.typ === "link" ? +tonEinst(k.dataset.quelle).delay || 0 : 0, VORSCHAU && Q.typ === "link" ? monitorAn() : 0]);
      if (k._quelle === schluessel) return;
      k._quelle = schluessel;
      const alt = k.querySelector(".kam-quelle");
      if (alt) { if (alt._stream) alt._stream.getTracks().forEach(t => t.stop()); alt.remove(); }
      const aktiv = Q.typ && Q.typ !== "leer" && (Q.typ !== "link" || Q.url) && (Q.typ !== "bild" || Q.bild);
      k.classList.toggle("gefuellt", !!aktiv);
      if (!aktiv) return;
      const box = document.createElement("div");
      box.className = "kam-quelle" + (Q.anpassen === "ganz" ? " ganz" : "") + (Q.spiegeln ? " gespiegelt" : "");
      k.insertBefore(box, k.firstChild);
      if (Q.typ === "link") {
        const f = document.createElement("iframe");
        const ziel = linkAufbereiten(Q, k.dataset.quelle);
        f.onload = () => { f._vol = null; setTimeout(tonAnwenden, 800); };
        if (!/^https?:\/\//i.test(ziel)) return;
        f.allow = "autoplay; camera; microphone; fullscreen; display-capture";
        // darf Skripte ausführen, aber die Overlay-Seite nicht umleiten oder Pop-ups öffnen
        f.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-presentation");
        f.referrerPolicy = "no-referrer";
        f.src = ziel;
        box.appendChild(f);
      } else if (Q.typ === "bild") {
        const i = document.createElement("img"); if (/^(data:image\/|https?:|medien\/)/i.test(Q.bild)) i.src = Q.bild; box.appendChild(i);
      } else if (Q.typ === "geraet") geraetStarten(box, Q);
    });
  }

  /* ---------- Timer ---------- */
  function timer() {
    const rest = K.timerRest(Z.timer);
    const t = K.zeit(rest).replace(":", '<span class="dp">:</span>');
    $$(".timer").forEach(e => { if (e.innerHTML !== t) e.innerHTML = t; e.classList.toggle("null", rest <= 0 && Z.timer.laeuft); });
  }
  setInterval(timer, 250);

  /* ---------- Diagnose (in der Steuerseite einschaltbar) ---------- */
  let empfangenVon = "gespeicherter Stand", empfangenUm = 0;
  function diagnose() {
    if (EINGEBETTET) return;
    let box = document.querySelector(".diagnose");
    if (!Z.diagnose) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement("div"); box.className = "diagnose";
      box.style.cssText = "position:absolute;left:12px;top:12px;z-index:99;max-width:1100px;padding:12px 16px;background:rgba(0,0,0,.88);color:#9f9;font:16px/1.45 Consolas,monospace;white-space:pre-wrap;border:2px solid #9f9";
      document.body.appendChild(box);
      setInterval(diagnose, 1000);
    }
    const H = Z.hintergrund || {}, t = document.createElement("video");
    const zeilen = [
      "DIAGNOSE – " + (document.body.dataset.szene || location.pathname.split("/").pop()) + " · Version " + K.VERSION,
      "Datei:     " + (location.pathname.split("/").pop() || "?") + (location.protocol === "file:" ? " (lokale Datei)" : " (" + location.protocol.replace(":", "") + ")"),
      "Browser:   " + (navigator.userAgent.match(/(OBS|Chrome|Edg|Firefox|Safari)\/[\d.]+/g) || []).join(" "),
      "Zustand:   " + empfangenVon + (empfangenUm ? " · " + new Date(empfangenUm).toLocaleTimeString("de-DE") : "") + " · Stand " + (Z.stand ? new Date(Z.stand).toLocaleTimeString("de-DE") : "–"),
      "Bilder:    " + Object.keys(K.Bilder.mem).length + " gemerkt · Zustand " + Math.round(JSON.stringify(Zroh).length / 1024) + " KB",
      "Videos:    " + ((H.videos || []).length || "keine eingetragen") + (H.durchsichtig ? " (Hintergrund durchsichtig!)" : ""),
      "Formate:   H.264 " + (t.canPlayType('video/mp4; codecs="avc1.640028"') || "nein") + " · H.265 " + (t.canPlayType('video/mp4; codecs="hvc1.1.6.L120.90"') || "nein") + " · VP9 " + (t.canPlayType('video/webm; codecs="vp9"') || "nein")
    ];
    document.querySelectorAll(".hg video").forEach((v, i) => {
      if (!v.getAttribute("src")) return;
      const fehler = v.error ? ["", "abgebrochen", "Netzwerk/Datei", "Dekodierung (Format)", "Format/Datei nicht unterstützt"][v.error.code] + (v.error.message ? " – " + v.error.message : "") : "";
      zeilen.push(`Video ${i + 1}:   ${decodeURIComponent(v.getAttribute("src"))} · bereit ${v.readyState}/4 · ${v.paused ? "pausiert" : "läuft"} · ${v.currentTime.toFixed(1)} s${v.classList.contains("an") ? " · SICHTBAR" : ""}${fehler ? " · FEHLER: " + fehler : ""}`);
    });
    (window.__videoProbleme || []).slice(-3).forEach(p => zeilen.push("Übersprungen: " + p));
    box.textContent = zeilen.join("\n");
  }

  const IN_OBS = !!window.obsstudio || /OBS\//.test(navigator.userAgent);
  let obsAktiv = true;
  addEventListener("obsSourceActiveChanged", ev => {
    obsAktiv = !!(ev.detail && ev.detail.active);
    document.querySelectorAll(".hg video.an").forEach(v => { if (obsAktiv) v.play().catch(() => {}); else v.pause(); });
  });

  /* ---------- Hintergrund-Videos ----------
     Jede Einrichtung bekommt eine eigene „Generation": Zeitgeber und Ereignisse älterer Durchläufe
     werden ignoriert und können den Hintergrund nicht mehr durcheinanderbringen. */
  let videoListe = null, videoWaechter = null, videoGen = 0;
  function hintergrund() {
    const hg = document.querySelector(".hg");
    if (!hg) return;
    const H = Z.hintergrund || {};
    // OBS spielt das Video unter dem Overlay ab – die Vorschau in der App zeigt es trotzdem, damit sie wie das Programm aussieht
    const obsSpielt = (H.quelle === "obs" || !!H.durchsichtig) && !VORSCHAU;
    const liste = obsSpielt ? [] : (H.videos || []).filter(Boolean);
    const dunkel = hg.querySelector(".hg-dunkel"), leer = hg.querySelector(".hg-leer");
    const schluessel = (obsSpielt ? "obs|" : "") + liste.join("|");
    if (hg.classList.contains("video-laeuft") || obsSpielt) { if (dunkel) dunkel.style.opacity = H.abdunkeln ?? .35; }
    if (schluessel === videoListe) return;
    videoListe = schluessel;

    // alles vom vorherigen Durchlauf beenden
    const gen = ++videoGen;
    clearInterval(videoWaechter); videoWaechter = null;
    if (gen > 1 && performance.now() > 8000) meldung(`Hintergrund neu eingerichtet (${obsSpielt ? "OBS spielt ab" : liste.length + " Video(s)"})`);
    hg.querySelectorAll("video").forEach(v => { v.onerror = v.onended = v.oncanplay = null; v.pause(); v.removeAttribute("src"); v.load(); v.classList.remove("an"); });
    hg.classList.toggle("obs-video", obsSpielt);
    const zeigeTheme = () => {
      leer.classList.remove("aus"); hg.classList.remove("video-laeuft"); hg.classList.add("ohne-video");
      if (dunkel) dunkel.style.opacity = 0;
    };
    if (obsSpielt) {                                      // durchsichtig, nur Abdunkeln + Verlauf
      leer.classList.add("aus"); hg.classList.remove("ohne-video", "video-laeuft");
      if (dunkel) dunkel.style.opacity = H.abdunkeln ?? .35;
      return;
    }
    zeigeTheme();
    if (!liste.length) return;

    const vorhanden = [...hg.querySelectorAll("video")];
    const hgTon = !tonEinst("hintergrund").stumm;
    const machen = () => {
      if (vorhanden.length) { const alt = vorhanden.shift(); tonFuerVideo(alt, hgTon); return alt; }
      const v = document.createElement("video"); setTimeout(() => tonFuerVideo(v, hgTon), 0);
      ["muted", "autoplay", "playsinline"].forEach(a => v.setAttribute(a, ""));
      v.muted = true; v.playsInline = true; v.preload = "auto"; v.disablePictureInPicture = true;
      hg.insertBefore(v, leer);
      return v;
    };
    let aktiv = machen(), naechstes = machen();
    let i = Math.floor(Math.random() * liste.length);
    const kaputt = new Set();
    const gueltig = () => gen === videoGen;

    // Ein Video laden und starten – erst „ok", wenn wirklich Bilder kommen (nicht nur „kann abspielen")
    function starten(v, datei) {
      return new Promise(fertig => {
        let erledigt = false;
        const ende = (ok, grund) => {
          if (erledigt) return; erledigt = true; clearTimeout(zeit);
          v.oncanplay = v.onerror = null; v.removeEventListener("timeupdate", fortschritt);
          fertig({ ok, grund });
        };
        const zeit = setTimeout(() => ende(false, v.readyState < 2 ? "lädt nicht" : "kein Bild – Format wird hier nicht dekodiert"), 12000);
        const fortschritt = () => { if (v.currentTime > 0.15 && v.videoWidth > 0) ende(true); };
        v.onerror = () => ende(false, v.error ? `Fehler ${v.error.code}${v.error.message ? ": " + v.error.message : ""}` : "Fehler");
        v.oncanplay = () => { v.oncanplay = null; v.play().catch(e => ende(false, "Abspielen abgelehnt: " + (e && e.name))); };
        v.addEventListener("timeupdate", fortschritt);
        v.loop = liste.length === 1;
        v.src = /^(https?:|file:|data:|blob:)/i.test(datei) ? datei : datei.split("/").map(encodeURIComponent).join("/");
        v.load();
      });
    }
    let laedt = false;
    async function weiter() {
      if (laedt || !gueltig()) return;
      laedt = true;
      for (let n = 0; n < liste.length; n++) {
        const datei = liste[i]; i = (i + 1) % liste.length;
        if (kaputt.has(datei)) continue;
        const r = await starten(naechstes, datei);
        if (!gueltig()) return;                                    // inzwischen neu eingerichtet
        if (r.ok) {
          naechstes.classList.add("an"); aktiv.classList.remove("an");
          const alt = aktiv; setTimeout(() => { if (!alt.classList.contains("an")) alt.pause(); }, 1400);
          [aktiv, naechstes] = [naechstes, aktiv];
          const v = aktiv;
          v.onended = () => { if (gueltig() && v === aktiv) weiter(); };
          // bricht das Video mitten im Abspielen ab: melden und neu anstoßen
          v.onerror = () => {
            if (!gueltig() || v !== aktiv) return;
            meldung(`Video abgebrochen: ${datei}${v.error ? " (Fehler " + v.error.code + ")" : ""}`);
            setTimeout(() => { if (gueltig()) weiter(); }, 1500);
          };
          ["stalled", "emptied", "suspend"].forEach(ereignis => { v["on" + ereignis] = () => { if (gueltig() && v === aktiv && IN_OBS && ereignis !== "suspend") meldung(`Video-Ereignis „${ereignis}“: ${datei}`); }; });
          leer.classList.add("aus"); hg.classList.add("video-laeuft"); hg.classList.remove("ohne-video");
          if (dunkel) dunkel.style.opacity = (Z.hintergrund || {}).abdunkeln ?? .35;
          laedt = false;
          return;
        }
        kaputt.add(datei); setTimeout(() => kaputt.delete(datei), 30000);   // später erneut versuchen
        meldung(`Video lässt sich nicht abspielen: ${datei} (${r.grund})`);
        (window.__videoProbleme = (window.__videoProbleme || []).slice(-9)).push(datei + " – " + r.grund);
      }
      laedt = false;
      if (gueltig() && !hg.classList.contains("video-laeuft")) {
        zeigeTheme();
        meldung("Kein Hintergrund-Video abspielbar – zeige Theme-Hintergrund. Tipp: „OBS spielt ab“ wählen.");
        setTimeout(() => { if (gueltig()) weiter(); }, 30000);
      }
    }
    weiter();

    // Wächter: bleibt das Bild stehen, neu anstoßen bzw. zum nächsten Video wechseln
    let letzte = -1, stillstand = 0;
    videoWaechter = setInterval(() => {
      if (!gueltig() || laedt || !aktiv.classList.contains("an") || !obsAktiv) return;
      if (aktiv.paused && !aktiv.ended) { aktiv.play().catch(() => {}); return; }
      if (aktiv.currentTime === letzte) {
        if (++stillstand >= 3) { stillstand = 0; meldung("Video hängt – starte neu: " + (aktiv.getAttribute("src") || "")); if (liste.length === 1) kaputt.clear(); weiter(); }
      } else stillstand = 0;
      letzte = aktiv.currentTime;
    }, 1500);
  }

  /* ---------- Musik (Tuna) ---------- */
  let musikDaten = null;
  function musikBox(box) {
    if (box._musik) return box._musik;
    box.innerHTML = `<div class="musik-cover"></div>
      <div class="musik-feld"><div class="musik-label"><span class="eq"><i></i><i></i><i></i></span><span data-t="texte.musikLabel"></span></div>
        <div class="musik-text"><div class="musik-titel"></div><div class="musik-kuenstler"></div></div>
        <div class="musik-balken"><i></i></div></div>`;
    box.querySelector("[data-t]").textContent = Z.texte.musikLabel || "";
    return box._musik = { cover: box.querySelector(".musik-cover"), text: box.querySelector(".musik-text"), titel: box.querySelector(".musik-titel"),
      kuenstler: box.querySelector(".musik-kuenstler"), balken: box.querySelector(".musik-balken i"), song: null, nr: 0, aktiv: null };
  }
  function coverLaden(m, url) {
    const n = ++m.nr;
    if (!url) return;
    const img = new Image();
    img.src = url.startsWith("data:") ? url : url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
    img.onload = () => {
      if (n !== m.nr) return;
      m.cover.appendChild(img);
      requestAnimationFrame(() => requestAnimationFrame(() => img.classList.add("an")));
      const alt = m.aktiv; m.aktiv = img;
      if (alt) setTimeout(() => alt.remove(), 900);
    };
  }
  function musikZeigen(d) {
    musikDaten = d;
    const status = d && d.status ? String(d.status).toLowerCase() : "";
    const hat = !!(d && d.title) && Z.musik.anzeigen !== false;
    const spielt = hat && status !== "paused" && status !== "stopped";
    $$(".musik").forEach(box => {
      const m = musikBox(box);
      // erst nach drei Abfragen ohne Musik ausblenden – kurze Aussetzer lassen die Box nicht flackern
      m.ohne = spielt ? 0 : (m.ohne || 0) + 1;
      if (spielt) box.classList.add("an");
      else if (m.ohne >= 3 || Z.musik.anzeigen === false || !box.classList.contains("an")) box.classList.remove("an");
      if (!hat) return;
      const k = (d.artists || []).join(", "), song = d.title + "|" + k;
      if (song !== m.song) {
        const erst = m.song === null; m.song = song;
        const setzen = () => { m.titel.textContent = d.title; m.kuenstler.textContent = k || d.album || ""; m.text.classList.remove("wechsel"); };
        if (erst) setzen(); else { m.text.classList.add("wechsel"); setTimeout(setzen, 400); }
        coverLaden(m, d.cover_url);
        [2000, 5000].forEach(ms => setTimeout(() => { if (m.song === song) coverLaden(m, d.cover_url); }, ms));
        m.balken.style.transition = "none"; m.balken.style.transform = "scaleX(0)"; void m.balken.offsetWidth; m.balken.style.transition = "";
      }
      if (d.duration > 0) m.balken.style.transform = `scaleX(${Math.min(1, (d.progress || 0) / d.duration)})`;
    });
  }
  function musik() {
    if (TEST) {
      const start = Date.now();
      const tick = () => musikZeigen({ title: "Nachtfahrt", artists: ["Beispiel-Band"], cover_url: "medien/themes/dachcs.png", duration: 200000, progress: 50000 + Date.now() - start, status: "playing" });
      tick(); if (!VORSCHAU) setInterval(tick, 1000);
      return;
    }
    let fehlschlaege = 0;
    (function holen() {
      // nur wenn es Musik-Boxen gibt (bzw. in overlay.html jederzeit welche kommen können)
      if (!$$(".musik").length && !document.querySelector(".buehne")) return setTimeout(holen, 3000);
      const adr = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(Z.musik.adresse || "") ? Z.musik.adresse : "http://localhost:1608/";
      fetch(adr, { cache: "no-store" })
        .then(r => r.json()).then(d => { fehlschlaege = 0; musikZeigen(d); }).catch(() => { fehlschlaege++; musikZeigen(null); })
        .finally(() => setTimeout(holen, fehlschlaege > 3 ? 5000 : 1000));
    })();
  }

  /* ---------- Alles zeichnen ---------- */
  function eckenSetzen() {
    $$(".box").forEach(b => {
      if (b.dataset.ecke !== undefined || !b.offsetWidth) return;
      const r = b.getBoundingClientRect(), mitte = r.left + r.width / 2, breite = document.documentElement.clientWidth || 1920;
      b.dataset.ecke = mitte < breite * 0.42 ? "links" : mitte > breite * 0.58 ? "rechts" : "mitte";
    });
  }
  function zeichnen() {
    diagnose(); theme(); einblendungen(); veto(); serie(); spieler(); texte(); teams(); timer(); ticker(); hintergrund(); quellen(); sponsoren();
    if (!(Z.sprecher || {}).an) $$(".kam.spricht").forEach(k => k.classList.remove("spricht"));
    $$(".musik").forEach(m => m.classList.toggle("aus", Z.musik.anzeigen === false));
    if (musikDaten && $$(".musik").some(b => !b._musik)) musikZeigen(musikDaten);
    liveZeichnen();
    turnierZeichnen();
    tonAnwenden();
    document.body.classList.toggle("dach-rahmen-zeigen", !!(Z.dach || {}).rahmenZeigen);
    document.body.classList.toggle("clean", !!(Z.sendung || {}).clean && aktSzeneName() === "ingame");
    requestAnimationFrame(eckenSetzen);
    dispatchEvent(new CustomEvent("cast-gezeichnet", { detail: Z }));
  }

  /* ---------- Verbindung ---------- */
  function bilderAufraeumen(z) {
    const benutzt = new Set((JSON.stringify(z).match(/asset:[a-z0-9]+/g) || []).map(x => x.slice(6)));
    Object.keys(K.Bilder.mem).forEach(id => { if (!benutzt.has(id)) delete K.Bilder.mem[id]; });
  }
  function uebernehmen(z, woher) {
    if (!z || (z.stand || 0) < (Z.stand || 0)) return;
    bilderAufraeumen(z);
    empfangenVon = woher || "Steuerseite"; empfangenUm = Date.now();
    Zroh = K.mischen(K.klon(K.STANDARD), z);
    Z = K.aufloesen(Zroh, K.Bilder.mem);
    K.speichern(Zroh);
    zeichnen();
  }
  // Bilder kamen dazu -> alles mit den echten Bildern neu zeichnen
  function neuZeichnen() {
    Z = K.aufloesen(Zroh, K.Bilder.mem);
    $$(".kam[data-quelle]").forEach(k => { if (k._quelle && /asset:|data:/.test(k._quelle)) k._quelle = null; });
    zeichnen();
  }
  // Meldungen der Overlays landen im Log der App (Reiter „Log") – z. B. Video-Probleme in OBS
  const gemeldet = {};
  function meldung(text) {
    const jetzt = Date.now();
    if (gemeldet[text] && jetzt - gemeldet[text] < 30000) return;
    gemeldet[text] = jetzt;
    const alt = Object.keys(gemeldet); if (alt.length > 50) alt.slice(0, 25).forEach(k => delete gemeldet[k]);
    if (K.SERVER && !VORSCHAU) fetch("/api/meldung", { method: "POST", body: JSON.stringify({ seite: aktSzeneName() + (/OBS\//.test(navigator.userAgent) ? " (OBS)" : ""), text: String(text).slice(0, 300) }) }).catch(() => {});
  }
  if (VORSCHAU) document.documentElement.style.background = "#0b0c10";
  window.CastOverlay = { neuZeichnen, meldung, ecken: eckenSetzen, get Z() { return Z; } };

  /* ---------- OBS: Bildtakt ----------
     Die Browserquelle in OBS übernimmt Änderungen, die nur „im Hintergrund" passieren (laufendes Video,
     durchlaufender Lauftext), nicht zuverlässig in die Aufnahme – dann zeigt OBS ein altes Bild
     (z. B. den Theme-Hintergrund vom Seitenstart) statt des Videos. Eine winzige, unsichtbare Änderung
     in jedem Bild zwingt OBS, jedes Bild frisch zu übernehmen. Läuft nur in OBS und nur, wenn die Quelle aktiv ist. */
  if (IN_OBS && !EINGEBETTET && !VORSCHAU) {
    const takt = document.createElement("div");
    takt.className = "obs-takt"; takt.setAttribute("aria-hidden", "true");
    document.body.appendChild(takt);
    let n = 0, laeuft = true;
    const schritt = () => {
      if (!laeuft) return;
      takt.style.backgroundColor = (n++ & 1) ? "rgba(0,0,0,.004)" : "rgba(0,0,0,.006)";
      requestAnimationFrame(schritt);
    };
    requestAnimationFrame(schritt);
    addEventListener("obsSourceActiveChanged", ev => {
      const an = !!(ev.detail && ev.detail.active);
      if (an && !laeuft) { laeuft = true; requestAnimationFrame(schritt); }
      if (!an) laeuft = false;
    });
    window.__obsTakt = () => laeuft;
    // Zustandsbericht alle 30 s ins Log der App: läuft das Video wirklich? Wie viel Speicher braucht die Seite?
    try { const n = +(sessionStorage.getItem("cast-ladungen") || 0) + 1; sessionStorage.setItem("cast-ladungen", n); setTimeout(() => meldung(`Seite geladen (${n}. Mal in dieser OBS-Sitzung)`), 800); } catch (e) {}
    let letzteZeit = -1;
    setInterval(() => {
      const v = document.querySelector(".hg video.an"), hgEl = document.querySelector(".hg");
      let text;
      if (hgEl && hgEl.classList.contains("obs-video")) text = "Hintergrund: OBS spielt ab";
      else if (!v) text = "Hintergrund: kein Video aktiv (Theme-Hintergrund)";
      else {
        const q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
        const laeuftV = v.currentTime !== letzteZeit && !v.paused; letzteZeit = v.currentTime;
        text = `Video ${laeuftV ? "läuft" : "STEHT"} (${Math.round(v.currentTime)} s, ${v.videoWidth}×${v.videoHeight}${q ? ", verworfen " + q.droppedVideoFrames + "/" + q.totalVideoFrames : ""})`;
      }
      const mem = performance.memory ? ` · Speicher ${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB` : "";
      meldung(`Bericht: ${text}${mem} · Szene ${aktSzeneName()}`);
    }, 30000);
    setTimeout(() => meldung("OBS erkannt – Bildtakt aktiv (hält Video und Lauftext in der Aufnahme aktuell)"), 1500);
  }

  if (!EINGEBETTET && !VORSCHAU) K.kanal({   // Vorschau & eingebettete Szenen bekommen den Stand direkt
    abfragen: true,
    nurServer: true,
    onLive(d) { liveDaten = d; liveZeichnen(); },   // über den Cast-Dienst: Stand regelmäßig abholen
    obs: false,   // Overlays verbinden sich nicht selbst – die Steuerseite schickt über OBS direkt hierher
    onNachricht(d) {
      if (d.cast === "bilder" && d.bilder) K.Bilder.setzen(d.bilder).then(neuZeichnen);
      if (d.cast === "zustand") uebernehmen(d.z, "Steuerseite");
    },
    onSpeicher() { const n = K.laden(); if ((n.stand || 0) > (Z.stand || 0)) { Zroh = n; Z = K.aufloesen(n, K.Bilder.mem); zeichnen(); } }
  });
  if (!K.SERVER && "BroadcastChannel" in window) new BroadcastChannel("cast-overlay").postMessage({ cast: "anfrage" });
  // Sicherheitsnetz ohne App: gespeicherten Stand regelmäßig prüfen (gleicher Browser, andere Tabs)
  if (!K.SERVER || VORSCHAU) setInterval(() => { if (K.gespeicherterStand() > (Z.stand || 0)) { const n = K.laden(); if ((n.stand || 0) > (Z.stand || 0)) { Zroh = n; K.Bilder.laden().then(neuZeichnen); } } }, 1000);
  // Vorschau in der Steuerseite (iframe) bekommt den Zustand direkt
  addEventListener("message", ev => {
    if (window.parent === window || ev.source !== window.parent) return;   // nur die Vorschau der Steuerseite
    const d = ev.data;
    if (d && d.cast === "zeigen") { document.body.classList.remove("wartet"); return; }
    if (d && d.cast === "zustand" && d.z) { Z = Zroh = K.mischen(K.klon(K.STANDARD), d.z); empfangenVon = "Vorschau der Steuerseite"; empfangenUm = Date.now(); zeichnen(); }
    if (d && d.cast === "live") { liveDaten = d.live; liveZeichnen(); }
    if (d && d.cast === "monitor") {
      const vorher = monitorAn(); monitor = { modus: d.modus || "aus", vol: +d.vol || 0 }; ktx(); tonAnwenden(); vorschauTon();
      if (vorher !== monitorAn()) { $$(".kam").forEach(k => { k._schl = null; }); $$(".dach-seite").forEach(f => { f.allow = monitorAn() ? "autoplay" : "autoplay 'none'"; if (f.src && !f.src.endsWith("about:blank")) f.src = f.src; }); neuZeichnen(); }
    }
  });

  musik();
  zeichnen();
  K.Bilder.laden().then(neuZeichnen);             // gemerkte Bilder aus der Datenbank holen
  if (document.fonts) document.fonts.ready.then(() => { $$(".ticker").forEach(t => { t._schl = null; }); ticker(); einpassen(); });
})();
