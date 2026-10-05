/* =====================================================================
   CASTING-APP · Sendung (overlay.html – eine Browserquelle für alles)
   Alle Szenen laufen in EINEM Dokument. Beim Wechsel bleiben Teile, die es
   in beiden Szenen gibt (Logo, Lauftext, Match-Up, Kameras …), stehen oder
   gleiten an ihre neue Position – nur was sich ändert, blendet aus bzw. ein.
   Kameras bleiben dieselben Elemente, VDO.Ninja & Co. laufen ohne Neuladen weiter.
   ===================================================================== */
(function () {
  "use strict";
  const buehne = document.querySelector(".buehne");
  const stinger = document.querySelector(".stinger");
  const C = () => window.CastOverlay;
  let aktSzene = null, aktSchicht = null, kette = Promise.resolve(), geplant = null;
  const vorlagen = {}, stile = new Set();
  const warte = ms => new Promise(ok => setTimeout(ok, ms));
  const WEICH = "cubic-bezier(.65,0,.35,1)";
  const anim = (el, frames, dauer, extra) =>
    el.animate(frames, Object.assign({ duration: Math.max(1, dauer), easing: WEICH, fill: "both" }, extra || {})).finished.catch(() => {});

  /* ---------- Szenen-Vorlagen (eigene Dateien, gleiche Herkunft) ---------- */
  async function vorlage(szene) {
    if (vorlagen[szene]) return vorlagen[szene];
    const r = await fetch(encodeURIComponent(szene) + ".html", { cache: "no-cache" });
    if (!r.ok) throw new Error("Szene „" + szene + "“ nicht gefunden");
    const doc = new DOMParser().parseFromString(await r.text(), "text/html");
    if (!stile.has(szene)) {
      stile.add(szene);
      doc.querySelectorAll("head style").forEach(s => { const st = document.createElement("style"); st.textContent = s.textContent; document.head.appendChild(st); });
    }
    vorlagen[szene] = [...doc.body.children].filter(e => e.tagName !== "SCRIPT" && !e.classList.contains("hg")).map(e => e.outerHTML).join("\n");
    return vorlagen[szene];
  }
  // „Bauart" eines Teils: gleiches Innenleben = dasselbe Element kann weiterverwendet werden
  function bauart(el) { const c = el.cloneNode(true); c.removeAttribute("style"); c.classList.remove("rein"); return c.outerHTML; }
  async function schicht(szene) {
    const s = document.createElement("div");
    s.className = "schicht"; s.dataset.szene = szene;
    s.innerHTML = await vorlage(szene);
    [...s.children].forEach(e => { e._bau = bauart(e); });
    return s;
  }
  // Lage aus dem style-Attribut lesen
  function lage(styleText) {
    const t = document.createElement("div"); t.setAttribute("style", styleText || "");
    const o = {};
    ["left", "top", "right", "bottom", "width", "height"].forEach(k => { if (t.style[k]) o[k] = t.style[k]; });
    return o;
  }

  /* ---------- Übergänge ---------- */
  // Deckkraft, die ein Teil gerade von sich aus hat (Musik ohne Song, Sponsor ohne Logos … sind 0).
  // Übergänge gehen immer von bzw. zu diesem Wert – so blitzt nichts auf, was gar nicht zu sehen ist.
  const deckkraft = e => { const cs = getComputedStyle(e); return cs.display === "none" ? 0 : parseFloat(cs.opacity) || 0; };
  const RAUS = {
    blende: o => [{ opacity: o }, { opacity: 0 }],
    schieben: o => [{ opacity: o, translate: "0 0" }, { opacity: 0, translate: "-80px 0" }],
    wischen: () => [{ clipPath: "inset(0 0 0 0)" }, { clipPath: "inset(0 0 0 100%)" }]
  };
  const REIN = {
    blende: o => [{ opacity: 0 }, { opacity: o }],
    schieben: o => [{ opacity: 0, translate: "80px 0" }, { opacity: o, translate: "0 0" }],
    wischen: () => [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }]
  };
  function logo() {
    const Z = C().Z;
    const T = Object.assign({}, (window.CAST_THEMES || {})[Z.theme] || (Z.eigeneThemes || {})[Z.theme] || {}, (Z.themeDaten || {})[Z.theme] || {});
    return T.icon || "";
  }
  async function stingerRein(dauer) {
    const [a, b] = stinger.querySelectorAll("i"), l = stinger.querySelector("b");
    l.innerHTML = logo() ? `<img src="${String(logo()).replace(/"/g, "&quot;")}" alt="">` : "";
    stinger.style.visibility = "visible";
    const h = dauer / 2;
    await Promise.all([
      anim(a, [{ transform: "skewX(-18deg) translateX(-130%)" }, { transform: "skewX(-18deg) translateX(0%)" }], h * .85),
      warte(h * .15).then(() => anim(b, [{ transform: "skewX(-18deg) translateX(-130%)" }, { transform: "skewX(-18deg) translateX(0%)" }], h * .85)),
      warte(h * .45).then(() => anim(l, [{ opacity: 0, transform: "scale(.8)" }, { opacity: 1, transform: "scale(1)" }], h * .55))
    ]);
  }
  async function stingerRaus(dauer) {
    const [a, b] = stinger.querySelectorAll("i"), l = stinger.querySelector("b"), h = dauer / 2;
    await Promise.all([
      anim(l, [{ opacity: 1 }, { opacity: 0 }], h * .4),
      anim(b, [{ transform: "skewX(-18deg) translateX(0%)" }, { transform: "skewX(-18deg) translateX(130%)" }], h * .85),
      warte(h * .15).then(() => anim(a, [{ transform: "skewX(-18deg) translateX(0%)" }, { transform: "skewX(-18deg) translateX(130%)" }], h * .85))
    ]);
    stinger.style.visibility = "hidden";
    stinger.getAnimations({ subtree: true }).forEach(x => x.cancel());
  }

  async function wechsel(szene, art, dauer) {
    if (szene === aktSzene) return;
    const neu = await schicht(szene);
    const alt = aktSchicht;
    document.body.dataset.aktszene = szene;
    aktSzene = szene;

    // erste Szene: ganz normal mit Einblend-Animationen
    if (!alt) { buehne.appendChild(neu); aktSchicht = neu; C().neuZeichnen(); return; }

    // bereits sichtbare Teile: Einblend-Animation beenden (sonst startet sie beim Umhängen neu)
    alt.querySelectorAll(".rein").forEach(e => e.classList.remove("rein"));
    // Teile paaren
    const altTeile = new Map([...alt.children].filter(e => e.dataset.teil).map(e => [e.dataset.teil, e]));
    const weiter = [], kreuz = [], kommen = [];
    [...neu.children].forEach(n => {
      const a = n.dataset.teil && altTeile.get(n.dataset.teil);
      if (!a) { kommen.push(n); return; }
      altTeile.delete(n.dataset.teil);
      if (a.classList.contains("kam") || a._bau === n._bau) {
        // dasselbe Element weiterverwenden: gleitet an die neue Stelle, Inhalt (Lauftext, Stream) läuft weiter
        const info = n.querySelector(".kam-info"), ai = a.querySelector(".kam-info");
        if (info && ai) ai.innerHTML = info.innerHTML;
        weiter.push({ el: a, von: lage(a.getAttribute("style")), nach: lage(n.getAttribute("style")), ziel: n.getAttribute("style") });
        n.replaceWith(a);
      } else kreuz.push([a, n]);
    });
    const gehen = [...alt.children].filter(e => !kreuz.some(p => p[0] === e));
    window.__letzterWechsel = { weiter: weiter.map(w => w.el.dataset.teil), kreuz: kreuz.map(p => p[1].dataset.teil), kommen: kommen.map(e => e.dataset.teil || e.className), gehen: gehen.map(e => e.dataset.teil || e.className) };
    neu.querySelectorAll(".rein").forEach(e => e.classList.remove("rein"));
    // Nur die NEUEN Teile verstecken, bis sie gefüllt sind. Weiterverwendete Teile bleiben die ganze Zeit sichtbar
    // (früher war die ganze neue Schicht kurz versteckt – dadurch verschwanden Logo, Titel & Co. für 1–2 Bilder).
    const neueTeile = [...kommen, ...kreuz.map(p => p[1])];
    neueTeile.forEach(e => { e.style.visibility = "hidden"; });
    buehne.appendChild(neu);
    C().neuZeichnen();                                   // neue Teile mit Inhalt füllen
    await warte(50);
    const zeigen = () => neueTeile.forEach(e => { e.style.visibility = ""; });

    const fertig = () => {
      weiter.forEach(w => { w.el.getAnimations().forEach(x => { if (!(x instanceof CSSAnimation)) x.cancel(); }); w.el.setAttribute("style", w.ziel); delete w.el.dataset.ecke; });
      [...neu.children].forEach(e => e.getAnimations().forEach(x => { if (!(x instanceof CSSAnimation)) x.cancel(); }));
      zeigen(); alt.remove(); aktSchicht = neu; ueberSpiel(C().Z);
      if (C().ecken) C().ecken();                         // Ecken passend zur neuen Lage
    };

    if (art === "stinger" && dauer > 0) {
      await stingerRein(dauer);
      alt.style.visibility = "hidden";
      weiter.forEach(w => w.el.setAttribute("style", w.ziel));
      fertig();
      await stingerRaus(dauer);
      return;
    }
    if (art === "schnitt" || dauer <= 0) { fertig(); return; }

    // weiche Übergänge: nur was sich ändert, bewegt sich
    const jobs = [];
    const raus = RAUS[art] || RAUS.blende, rein = REIN[art] || REIN.blende;
    // 1) weiterverwendete Teile gleiten an ihre neue Position
    weiter.forEach(w => {
      const keys = Object.keys(w.nach).filter(k => k in w.von && w.von[k] !== w.nach[k]);
      if (!keys.length) return;
      const a = {}, b = {}; keys.forEach(k => { a[k] = w.von[k]; b[k] = w.nach[k]; });
      jobs.push(anim(w.el, [a, b], dauer));
    });
    // 2) Teile mit anderem Inhalt: an der Stelle überblenden (und dabei mitgleiten)
    kreuz.forEach(([a, n]) => {
      const va = lage(a.getAttribute("style")), vn = lage(n.getAttribute("style"));
      const keys = Object.keys(vn).filter(k => k in va && va[k] !== vn[k]);
      const ga = {}, gn = {}; keys.forEach(k => { ga[k] = va[k]; gn[k] = vn[k]; });
      const oa = deckkraft(a), on = deckkraft(n);
      jobs.push(anim(a, [Object.assign({ opacity: oa }, ga), Object.assign({ opacity: 0 }, gn)], dauer));
      jobs.push(anim(n, [Object.assign({ opacity: 0 }, ga), Object.assign({ opacity: on }, gn)], dauer));
    });
    // 3) was wegfällt, geht – was neu ist, kommt (leicht versetzt); Unsichtbares bleibt unsichtbar
    gehen.forEach((e, i) => { const o = deckkraft(e); if (o > .02) jobs.push(anim(e, raus(o), dauer * .55, { delay: i * 25 })); else e.style.visibility = "hidden"; });
    const kommenDeck = kommen.map(deckkraft);
    kommen.forEach((e, i) => { if (kommenDeck[i] > .02) jobs.push(anim(e, rein(kommenDeck[i]), dauer * .6, { delay: dauer * .4 + i * 45 })); });
    zeigen();                                             // Animationen stehen – jetzt dürfen die neuen Teile sichtbar werden
    await Promise.all(jobs);
    fertig();
  }

  // nur die jeweils letzte Wahl ausführen (schnelles Klicken überspringt Zwischenschritte)
  function pruefen(Z) {
    const S = (Z || {}).sendung || {};
    if (dachOffiziell(Z)) { dachZeigen(Z); return; }
    else if (dachEbene) dachAus();
    const ziel = /^[a-z0-9-]{2,40}$/.test(S.szene || "") && !/^dach-/.test(S.szene) ? S.szene : "intro";
    if (ziel === aktSzene && !geplant) return;
    if (geplant) { geplant.ziel = ziel; geplant.art = S.uebergang; geplant.dauer = S.dauer; return; }
    geplant = { ziel, art: S.uebergang, dauer: S.dauer };
    kette = kette.then(() => {
      const g = geplant; geplant = null;
      if (g.ziel === aktSzene) return;
      return wechsel(g.ziel, g.art || "blende", aktSchicht ? Math.max(0, +g.dauer || 0) : 0);
    }).catch(err => { console.error("Szenenwechsel:", err); if (C().meldung) C().meldung("Szenenwechsel fehlgeschlagen: " + err.message); });
  }
  /* ---------- Stats über dem Spiel ----------
     Während Ingame zeigen Scoreboard, Team A/B, Head-to-Head, Turnier und Serie ihren Inhalt über dem Spielbild,
     statt die Szene zu wechseln. Abgedunkelter Hintergrund für die Lesbarkeit, blendet nach der eingestellten Zeit aus. */
  const UEBER = ["scoreboard", "team-a", "team-b", "h2h", "bracket", "serie"];
  let ueberEbene = null, ueberSzene = null, ueberTakt = null;
  async function ueberSpiel(Z) {
    const U = ((Z || {}).sendung || {}).ueberSpiel || {};
    const soll = aktSzene === "ingame" && UEBER.includes(U.szene) && (!U.bis || U.bis > Date.now()) ? U.szene : null;
    clearTimeout(ueberTakt);
    if (soll && U.bis) ueberTakt = setTimeout(() => ueberSpiel(C().Z), U.bis - Date.now() + 30);
    if (soll === ueberSzene) return;
    ueberSzene = soll;
    if (!ueberEbene) { ueberEbene = document.createElement("div"); ueberEbene.className = "ueber-spiel"; document.body.appendChild(ueberEbene); }
    if (!soll) { ueberEbene.classList.remove("an"); return; }
    try {
      const html = await vorlage(soll);
      if (ueberSzene !== soll) return;
      ueberEbene.innerHTML = `<div class="us-dunkel"></div>` + html;
      ueberEbene.querySelectorAll('[data-teil="marke"], [data-teil="sponsor"], [data-teil="musik"]').forEach(x => x.remove());
      ueberEbene.querySelectorAll(".rein").forEach(x => x.classList.remove("rein"));
      C().neuZeichnen();
      requestAnimationFrame(() => ueberEbene.classList.add("an"));
    } catch (err) { if (C().meldung) C().meldung("Über dem Spiel: " + err.message); }
  }
  /* ---------- DACH CS – Offiziell: Seite als Vollbild-Rahmen, vorgeladen und hart umgeschaltet (DACH nutzt keine bewegten Übergänge) ---------- */
  const dachOffiziell = Z => !!((window.CAST_THEMES || {})[(Z || {}).theme] || {}).offiziell;
  let dachEbene = null, dachAktiv = null, dachLaufend = null, dachSeite = null, dachSchluessel = "", dachKette = Promise.resolve();
  function dachAus() { if (dachEbene) { dachEbene.remove(); dachEbene = null; dachAktiv = null; dachLaufend = null; dachSeite = null; dachSchluessel = ""; } document.body.classList.remove("dach-offiziell"); aktSzene = null; }
  function dachZeigen(Z) {
    document.body.classList.add("dach-offiziell");
    if (!dachEbene) {
      dachEbene = document.createElement("div"); dachEbene.className = "dach-ebene";
      dachEbene.innerHTML = '<iframe class="dach-seite" scrolling="no" tabindex="-1"></iframe>'.repeat(3) + '<div class="dach-kams"></div>';
      const vorschau = /[?&]vorschau=1/.test(location.search);
      dachEbene.querySelectorAll("iframe").forEach(f => { f.setAttribute("sandbox", "allow-scripts allow-same-origin"); f.referrerPolicy = "no-referrer"; f.allow = vorschau ? "autoplay 'none'" : "autoplay"; });
      document.body.insertBefore(dachEbene, document.body.firstChild);
      if (aktSchicht) { aktSchicht.remove(); aktSchicht = null; }
    }
    const k = (Z.sendung || {}).szene, seite = (window.CastKern.DACH_SEITEN || {})[k] || "overview";
    if (seite !== dachSeite) {
      dachSeite = seite; aktSzene = k;
      // drei Rahmen im Wechsel: einer zeigt, einer lädt, einer ist frei – schnelle Klicks können nie die sichtbare Seite treffen
      const alle = [...dachEbene.querySelectorAll("iframe")];
      const neu = alle.find(x => x !== dachAktiv && x !== dachLaufend) || alle[0];
      clearTimeout(neu._leeren); neu._marke = (neu._marke || 0) + 1;
      let fertig = false;
      const umschalten = () => { dachKette = dachKette.then(async () => {   // Übergänge laufen nacheinander, nie gleichzeitig
        if (fertig || dachSeite !== seite || neu.getAttribute("src") !== "/dach/" + seite) return; fertig = true;
        const S = (C().Z || Z).sendung || {}, alt = dachAktiv, art = alt ? (S.uebergang || "blende") : "schnitt", d = Math.max(0, +S.dauer || 0);
        dachLaufend = neu;
        await dachUebergang(alt, neu, art, d, () => dachRahmenSetzen(C().Z || Z, seite, art === "schnitt" ? 0 : d));
        alle.forEach(x => { if (x !== neu) { x.classList.remove("an"); x.style.zIndex = ""; } });
        neu.style.zIndex = ""; dachAktiv = neu; dachLaufend = null;
        alle.forEach(x => { if (x === neu) return; const m = x._marke;
          x._leeren = setTimeout(() => { if (x._marke === m && x !== dachAktiv && x.getAttribute("src") !== "/dach/" + dachSeite) x.src = "about:blank"; }, 300); });
      }).catch(() => {}); };
      neu.onload = () => { if (neu.getAttribute("src") === "/dach/" + seite) setTimeout(umschalten, 600); };   // erst zeigen, wenn DIESE Seite geladen ist
      setTimeout(umschalten, 6000);                                 // spätestens nach 6 s
      neu.src = "/dach/" + seite;
    }
    // Rahmen von Hand verschoben (gleiche Seite): sofort übernehmen
    else dachRahmenSetzen(Z, seite, 0);
  }
  // Übergänge wie bei den eigenen Szenen: Schnitt · Blende · Schieben · Wischen · Stinger
  async function dachUebergang(alt, neu, art, d, mitte) {
    neu.style.zIndex = 2; if (alt) alt.style.zIndex = 1;
    const opt = { duration: d, easing: "cubic-bezier(.4,0,.2,1)", fill: "both" };
    if (!alt || art === "schnitt" || d === 0) { neu.classList.add("an"); mitte(); return; }
    if (art === "stinger") {
      await stingerRein(d); neu.classList.add("an"); alt.classList.remove("an"); mitte(); await stingerRaus(d); return;
    }
    neu.classList.add("an"); mitte();
    const k = art === "wischen" ? [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }]
            : art === "schieben" ? [{ opacity: 0, transform: "translateX(6%)" }, { opacity: 1, transform: "none" }]
            : [{ opacity: 0 }, { opacity: 1 }];
    const a = neu.animate(k, opt);
    const b = art === "schieben" ? alt.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(-6%)" }], opt) : null;
    try { await a.finished; } catch (e) {}
    a.cancel(); if (b) b.cancel();
  }
  // Kameras und Inhalt in die Rahmen der Seite – vorhandene gleiten an ihren neuen Platz (das Bild läuft dabei weiter)
  function dachRahmenSetzen(Z, seite, d) {
    if (!dachEbene) return;
    const rahmen = window.CastKern.dachRahmen(Z, seite), schl = seite + JSON.stringify(rahmen);
    if (schl === dachSchluessel) return;
    dachSchluessel = schl;
    const box = dachEbene.querySelector(".dach-kams"), da = {};
    box.querySelectorAll(".dach-kam").forEach(k => { da[k.dataset.quelle] = k; });
    const opt = { duration: d, easing: "cubic-bezier(.4,0,.2,1)" };
    Object.entries(rahmen).forEach(([quelle, r]) => {
      const ziel = { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" };
      let k = da[quelle];
      if (k) {
        delete da[quelle];
        const von = { left: k.style.left, top: k.style.top, width: k.style.width, height: k.style.height };
        Object.assign(k.style, ziel); if (d) k.animate([von, ziel], opt);
      } else {
        k = document.createElement("div"); k.className = "kam dach-kam"; k.dataset.quelle = quelle; Object.assign(k.style, ziel);
        k.innerHTML = `<div class="dach-rahmen-name">${{ c1: "Caster 1", c2: "Caster 2", gast: "Gast", inhalt: "Inhalt" }[quelle] || quelle}</div>`;
        box.appendChild(k); if (d) k.animate([{ opacity: 0 }, { opacity: 1 }], opt);
      }
    });
    Object.values(da).forEach(k => { if (d) k.animate([{ opacity: 1 }, { opacity: 0 }], opt).finished.then(() => k.remove(), () => k.remove()); else k.remove(); });
    C().neuZeichnen();                                              // Quellen in neue Rahmen (vorhandene laufen weiter)
  }
  addEventListener("cast-gezeichnet", ev => { pruefen(ev.detail); ueberSpiel(ev.detail); });
  // Stand, der schon vor diesem Skript ankam, gleich übernehmen
  if (C()) pruefen(C().Z);
})();
