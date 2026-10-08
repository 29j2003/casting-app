/* =====================================================================
   CASTING-APP · Sendung (overlay.html – eine Browserquelle für alles)
   Alle Szenen laufen in EINEM Dokument. Beim Wechsel bleiben Teile, die es
   in beiden Szenen gibt (Logo, Lauftext, Match-Up, Kameras …), stehen oder
   gleiten an ihre neue Position – nur was sich ändert, blendet aus bzw. ein.
   Kameras bleiben dieselben Elemente, VDO.Ninja & Co. laufen ohne Neuladen weiter.
   ===================================================================== */
(function () {
  "use strict";
  const stage = document.querySelector(".stage");
  const stinger = document.querySelector(".stinger");
  const C = () => window.CastOverlay;
  let currentScene = null, currentLayer = null, chain = Promise.resolve(), planned = null;
  const templates = {}, styles = new Set();
  const awaiting = ms => new Promise(ok => setTimeout(ok, ms));
  const SOFT = "cubic-bezier(.65,0,.35,1)";
  const anim = (el, frames, duration, extra) =>
    el.animate(frames, Object.assign({ duration: Math.max(1, duration), easing: SOFT, fill: "both" }, extra || {})).finished.catch(() => {});

  /* ---------- Szenen-Vorlagen (eigene Dateien, gleiche Herkunft) ---------- */
  async function template(scene) {
    if (templates[scene]) return templates[scene];
    const r = await fetch(encodeURIComponent(scene) + ".html", { cache: "no-cache" });
    if (!r.ok) throw new Error("Szene „" + scene + "“ nicht gefunden");
    const doc = new DOMParser().parseFromString(await r.text(), "text/html");
    if (!styles.has(scene)) {
      styles.add(scene);
      doc.querySelectorAll("head style").forEach(s => { const st = document.createElement("style"); st.textContent = s.textContent; document.head.appendChild(st); });
    }
    templates[scene] = [...doc.body.children].filter(e => e.tagName !== "SCRIPT" && !e.classList.contains("backdrop")).map(e => e.outerHTML).join("\n");
    return templates[scene];
  }
  // „Bauart" eines Teils: gleiches Innenleben = dasselbe Element kann weiterverwendet werden
  function build(el) { const c = el.cloneNode(true); c.removeAttribute("style"); c.classList.remove("enter"); return c.outerHTML; }
  async function layer(scene) {
    const s = document.createElement("div");
    s.className = "layer"; s.dataset.scene = scene;
    s.innerHTML = await template(scene);
    [...s.children].forEach(e => { e._build = build(e); });
    return s;
  }
  // Lage aus dem style-Attribut lesen
  // tatsächliche Lage auf dem Bild – Regeln mit !important (z. B. „ohne Sponsor rückt die Leiste auf“) eingeschlossen
  function where(e) {
    const cs = getComputedStyle(e), o = {};
    ["left", "top", "width", "height"].forEach(k => { o[k] = cs[k]; });
    return o;
  }
  // bis das Gleiten beginnt, an der echten Lage festhalten (in der neuen Schicht gelten sonst kurz andere Regeln)
  function pin(e, at) { e.classList.add("gliding"); Object.assign(e.style, at); }
  function placement(styleText) {
    const t = document.createElement("div"); t.setAttribute("style", styleText || "");
    const o = {};
    ["left", "top", "right", "bottom", "width", "height"].forEach(k => { if (t.style[k]) o[k] = t.style[k]; });
    return o;
  }

  /* ---------- Übergänge ---------- */
  // Deckkraft, die ein Teil gerade von sich aus hat (Musik ohne Song, Sponsor ohne Logos … sind 0).
  // Übergänge gehen immer von bzw. zu diesem Wert – so blitzt nichts auf, was gar nicht zu sehen ist.
  const opacity = e => { const cs = getComputedStyle(e); return cs.display === "none" ? 0 : parseFloat(cs.opacity) || 0; };
  const OUT = {
    fade: o => [{ opacity: o }, { opacity: 0 }],
    slide: o => [{ opacity: o, translate: "0 0" }, { opacity: 0, translate: "-80px 0" }],
    wipe: () => [{ clipPath: "inset(0 0 0 0)" }, { clipPath: "inset(0 0 0 100%)" }]
  };
  const IN = {
    fade: o => [{ opacity: 0 }, { opacity: o }],
    slide: o => [{ opacity: 0, translate: "80px 0" }, { opacity: o, translate: "0 0" }],
    wipe: () => [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }]
  };
  function logo() {
    const Z = C().Z;
    const T = Object.assign({}, (window.CAST_THEMES || {})[Z.theme] || (Z.ownThemes || {})[Z.theme] || {}, (Z.themeData || {})[Z.theme] || {});
    return T.icon || "";
  }
  async function stingerIn(duration) {
    const [a, b] = stinger.querySelectorAll("i"), l = stinger.querySelector("b");
    l.innerHTML = logo() ? `<img src="${String(logo()).replace(/"/g, "&quot;")}" alt="">` : "";
    stinger.style.visibility = "visible";
    const h = duration / 2;
    await Promise.all([
      anim(a, [{ transform: "skewX(-18deg) translateX(-130%)" }, { transform: "skewX(-18deg) translateX(0%)" }], h * .85),
      awaiting(h * .15).then(() => anim(b, [{ transform: "skewX(-18deg) translateX(-130%)" }, { transform: "skewX(-18deg) translateX(0%)" }], h * .85)),
      awaiting(h * .45).then(() => anim(l, [{ opacity: 0, transform: "scale(.8)" }, { opacity: 1, transform: "scale(1)" }], h * .55))
    ]);
  }
  async function stingerOut(duration) {
    const [a, b] = stinger.querySelectorAll("i"), l = stinger.querySelector("b"), h = duration / 2;
    await Promise.all([
      anim(l, [{ opacity: 1 }, { opacity: 0 }], h * .4),
      anim(b, [{ transform: "skewX(-18deg) translateX(0%)" }, { transform: "skewX(-18deg) translateX(130%)" }], h * .85),
      awaiting(h * .15).then(() => anim(a, [{ transform: "skewX(-18deg) translateX(0%)" }, { transform: "skewX(-18deg) translateX(130%)" }], h * .85))
    ]);
    stinger.style.visibility = "hidden";
    stinger.getAnimations({ subtree: true }).forEach(x => x.cancel());
  }

  // Lage der neuen Szene übernehmen – Werte, die das Zeichnen gesetzt hat (Logo-Größe), bleiben
  function restyle(w) {
    const scale = w.el.style.getPropertyValue("--brand-scale");
    w.el.setAttribute("style", w.target);
    if (scale) w.el.style.setProperty("--brand-scale", scale);
  }
  async function switchTo(scene, kind, duration) {
    if (scene === currentScene) return;
    const fresh = await layer(scene);
    const previous = currentLayer;
    // Hintergrund (bei Ingame aus) blendet genauso lange wie die Teile der Szene – nie vorher weg, nie hinterher
    const fadeMs = !previous || kind === "cut" || duration <= 0 ? 0 : kind === "stinger" ? duration / 2 : duration * (scene === "ingame" ? .55 : .6);
    document.body.style.setProperty("--scene-fade", Math.round(fadeMs) + "ms");
    document.body.dataset.currentscene = scene;
    currentScene = scene;

    // erste Szene: ganz normal mit Einblend-Animationen
    if (!previous) { stage.appendChild(fresh); currentLayer = fresh; C().newDraw(); return; }

    // bereits sichtbare Teile: Einblend-Animation beenden (sonst startet sie beim Umhängen neu)
    previous.querySelectorAll(".enter").forEach(e => e.classList.remove("enter"));
    // Teile paaren
    const previousParts = new Map([...previous.children].filter(e => e.dataset.part).map(e => [e.dataset.part, e]));
    const proceed = [], cross = [], come = [];
    [...fresh.children].forEach(n => {
      const a = n.dataset.part && previousParts.get(n.dataset.part);
      if (!a) { come.push(n); return; }
      previousParts.delete(n.dataset.part);
      if (a.classList.contains("cam") || a._build === n._build) {
        // dasselbe Element weiterverwenden: gleitet an die neue Stelle, Inhalt (Lauftext, Stream) läuft weiter
        const info = n.querySelector(".cam-info"), ai = a.querySelector(".cam-info");
        if (info && ai) ai.innerHTML = info.innerHTML;
        proceed.push({ el: a, from: where(a), target: n.getAttribute("style") });
        n.replaceWith(a); pin(a, proceed[proceed.length - 1].from);
      } else cross.push([a, n]);
    });
    fresh.querySelectorAll(".enter").forEach(e => e.classList.remove("enter"));
    // Nur die NEUEN Teile verstecken, bis sie gefüllt sind. Weiterverwendete Teile bleiben die ganze Zeit sichtbar
    // (früher war die ganze neue Schicht kurz versteckt – dadurch verschwanden Logo, Titel & Co. für 1–2 Bilder).
    const newParts = [...come, ...cross.map(p => p[1])];
    newParts.forEach(e => e.classList.add("pending"));   // .pending versteckt auch Kinder, die selbst visibility: visible haben (Folien)
    stage.appendChild(fresh);
    C().newDraw();                                   // neue Teile mit Inhalt füllen
    await awaiting(50);
    // Teile, die nach dem Zeichnen genau gleich aussehen (z. B. das Logo – nur seine Größengrenze data-max ist je Szene
    // anders), bleiben stehen statt überzublenden: zwei halb durchsichtige gleiche Bilder übereinander flackern sichtbar
    for (let i = cross.length - 1; i >= 0; i--) {
      const [a, n] = cross[i];
      const look = e => [...e.classList].filter(c => c !== "pending").sort().join(" ");
      if (look(a) !== look(n) || a.innerHTML !== n.innerHTML) continue;
      [...n.attributes].forEach(x => { if (x.name.startsWith("data-")) a.setAttribute(x.name, x.value); });
      a._cacheKey = n._cacheKey;                       // schon passend gezeichnet – nicht neu zeichnen (Bild würde neu laden)
      const scale = n.style.getPropertyValue("--brand-scale");   // Logo-Größe der neuen Szene: gleitet per CSS-Übergang
      if (scale) a.style.setProperty("--brand-scale", scale); else a.style.removeProperty("--brand-scale");
      n.classList.remove("pending");                   // (nur zum Füllen versteckt – die Lage übernimmt a)
      proceed.push({ el: a, from: where(a), target: n.getAttribute("style") });
      newParts.splice(newParts.indexOf(n), 1);
      n.replaceWith(a); pin(a, proceed[proceed.length - 1].from); cross.splice(i, 1);
    }
    const go = [...previous.children].filter(e => !cross.some(p => p[0] === e));
    window.__lastSwitch = { proceed: proceed.map(w => w.el.dataset.part), cross: cross.map(p => p[1].dataset.part), come: come.map(e => e.dataset.part || e.className), go: go.map(e => e.dataset.part || e.className) };
    const show = () => newParts.forEach(e => e.classList.remove("pending"));

    const done = () => {
      proceed.forEach(w => { w.el.getAnimations().forEach(x => { if (!(x instanceof CSSAnimation) && !(x instanceof CSSTransition)) x.cancel(); }); restyle(w); w.el.classList.remove("gliding"); delete w.el.dataset.corner; });
      [...fresh.children].forEach(e => e.getAnimations().forEach(x => { if (!(x instanceof CSSAnimation)) x.cancel(); }));
      show(); previous.remove(); currentLayer = fresh; overGame(C().Z);
      if (C().corners) C().corners();                         // Ecken passend zur neuen Lage
    };

    if (kind === "stinger" && duration > 0) {
      await stingerIn(duration);
      previous.classList.add("pending");
      proceed.forEach(restyle);
      done();
      await stingerOut(duration);
      return;
    }
    if (kind === "cut" || duration <= 0) { done(); return; }

    // weiche Übergänge: nur was sich ändert, bewegt sich
    const jobs = [];
    const out = OUT[kind] || OUT.fade, enter = IN[kind] || IN.fade;
    // 1) weiterverwendete Teile gleiten von ihrer echten Lage an ihre echte neue Lage. Bis 2.14 galten die Werte der
    //    Vorlage – rückte die Leiste ohne Sponsor auf (CSS mit !important), sprang sie kurz an die Vorlagen-Stelle.
    //    .gliding schaltet solche Regeln für die Dauer des Gleitens ab, damit die Animation die Lage bestimmt.
    proceed.forEach(w => {
      restyle(w); w.el.classList.remove("gliding");
      const post = where(w.el);
      if (["left", "top", "width", "height"].every(k => w.from[k] === post[k])) return;
      w.el.classList.add("gliding");
      jobs.push(anim(w.el, [w.from, post], duration));
    });
    // 2) Teile mit anderem Inhalt: an der Stelle überblenden (und dabei mitgleiten)
    cross.forEach(([a, n]) => {
      const va = placement(a.getAttribute("style")), vn = placement(n.getAttribute("style"));
      const keys = Object.keys(vn).filter(k => k in va && va[k] !== vn[k]);
      const ga = {}, gn = {}; keys.forEach(k => { ga[k] = va[k]; gn[k] = vn[k]; });
      const oa = opacity(a), on = opacity(n);
      jobs.push(anim(a, [Object.assign({ opacity: oa }, ga), Object.assign({ opacity: 0 }, gn)], duration));
      jobs.push(anim(n, [Object.assign({ opacity: 0 }, ga), Object.assign({ opacity: on }, gn)], duration));
    });
    // 3) was wegfällt, geht – was neu ist, kommt (leicht versetzt); Unsichtbares bleibt unsichtbar
    go.forEach((e, i) => { const o = opacity(e); if (o > .02) jobs.push(anim(e, out(o), duration * .55, { delay: i * 25 })); else e.classList.add("pending"); });
    const comeDeck = come.map(opacity);
    come.forEach((e, i) => { if (comeDeck[i] > .02) jobs.push(anim(e, enter(comeDeck[i]), duration * .6, { delay: duration * .4 + i * 45 })); });
    show();                                             // Animationen stehen – jetzt dürfen die neuen Teile sichtbar werden
    await Promise.all(jobs);
    done();
  }

  // nur die jeweils letzte Wahl ausführen (schnelles Klicken überspringt Zwischenschritte)
  function check(Z) {
    const S = (Z || {}).broadcast || {};
    if (dachOfficial(Z)) { dachShow(Z); return; }
    else if (dachLayer) dachOff();
    // nur Szenen-Seiten – nie die Steuerseite oder diese Seite selbst auf Sendung
    const target = /^[a-z0-9-]{2,40}$/.test(S.scene || "") && !/^(dach-|control$|overlay$)/.test(S.scene) ? S.scene : "intro";
    if (target === currentScene && !planned) return;
    if (planned) { planned.target = target; planned.kind = S.transition; planned.duration = S.duration; return; }
    planned = { target, kind: S.transition, duration: S.duration };
    chain = chain.then(() => {
      const g = planned; planned = null;
      if (g.target === currentScene) return;
      return switchTo(g.target, g.kind || "fade", currentLayer ? Math.max(0, +g.duration || 0) : 0);
    }).catch(err => { console.error("Szenenwechsel:", err); if (C().message) C().message("Szenenwechsel fehlgeschlagen: " + err.message); });
  }
  /* ---------- Stats über dem Spiel ----------
     Während Ingame zeigen Scoreboard, Team A/B, Head-to-Head, Turnier und Serie ihren Inhalt über dem Spielbild,
     statt die Szene zu wechseln. Abgedunkelter Hintergrund für die Lesbarkeit, blendet nach der eingestellten Zeit aus. */
  const OVER = ["scoreboard", "team-a", "team-b", "h2h", "bracket", "series"];
  let overLayer = null, overScene = null, overTimer = null;
  async function overGame(Z) {
    const U = ((Z || {}).broadcast || {}).overGame || {};
    const should = currentScene === "ingame" && OVER.includes(U.scene) && (!U.until || U.until > Date.now()) ? U.scene : null;
    clearTimeout(overTimer);
    if (should && U.until) overTimer = setTimeout(() => overGame(C().Z), U.until - Date.now() + 30);
    if (should === overScene) return;
    overScene = should;
    if (!overLayer) { overLayer = document.createElement("div"); overLayer.className = "over-game"; document.body.appendChild(overLayer); }
    if (!should) { overLayer.classList.remove("on"); return; }
    try {
      const html = await template(should);
      if (overScene !== should) return;
      overLayer.innerHTML = `<div class="switch-dark"></div>` + html;
      overLayer.querySelectorAll('[data-part=brand], [data-part="sponsor"], [data-part=music]').forEach(x => x.remove());
      overLayer.querySelectorAll(".enter").forEach(x => x.classList.remove("enter"));
      C().newDraw();
      requestAnimationFrame(() => overLayer.classList.add("on"));
    } catch (err) { if (C().message) C().message("Über dem Spiel: " + err.message); }
  }
  /* ---------- DACH CS – Offiziell: Seite als Vollbild-Rahmen, vorgeladen und hart umgeschaltet (DACH nutzt keine bewegten Übergänge) ---------- */
  const dachOfficial = Z => !!((window.CAST_THEMES || {})[(Z || {}).theme] || {}).official;
  let dachLayer = null, dachActive = null, dachRunning = null, dachPage = null, dachKey = "", dachChain = Promise.resolve();
  function dachOff() { if (dachLayer) { dachLayer.remove(); dachLayer = null; dachActive = null; dachRunning = null; dachPage = null; dachKey = ""; } document.body.classList.remove("dach-official"); currentScene = null; }
  function dachShow(Z) {
    document.body.classList.add("dach-official");
    if (!dachLayer) {
      dachLayer = document.createElement("div"); dachLayer.className = "dach-layer";
      dachLayer.innerHTML = '<iframe class="dach-page" scrolling="no" tabindex="-1"></iframe>'.repeat(3) + '<div class="dach-cams"></div>';
      // Videos der DACH-Seiten laufen immer; den Ton im App-Fenster regelt die App (stumm/Lautstärke), nie ein Neuladen
      dachLayer.querySelectorAll("iframe").forEach(f => { f.setAttribute("sandbox", "allow-scripts allow-same-origin"); f.referrerPolicy = "no-referrer"; f.allow = "autoplay"; });
      document.body.insertBefore(dachLayer, document.body.firstChild);
      if (currentLayer) { currentLayer.remove(); currentLayer = null; }
    }
    const k = (Z.broadcast || {}).scene, page = (window.CastCore.DACH_PAGES || {})[k] || "overview";
    if (page !== dachPage) {
      dachPage = page; currentScene = k;
      // drei Rahmen im Wechsel: einer zeigt, einer lädt, einer ist frei – schnelle Klicks können nie die sichtbare Seite treffen
      const all = [...dachLayer.querySelectorAll("iframe")];
      const fresh = all.find(x => x !== dachActive && x !== dachRunning) || all[0];
      clearTimeout(fresh._clear); fresh._brand = (fresh._brand || 0) + 1;
      const brand = fresh._brand;                              // nur der neueste Auftrag für diesen Rahmen zählt
      let done = false;
      const toggle = () => { dachChain = dachChain.then(async () => {   // Übergänge laufen nacheinander, nie gleichzeitig
        if (done || fresh._brand !== brand || dachPage !== page || fresh.getAttribute("src") !== window.CastCore.dachUrl(page)) return;
        done = true;
        if (fresh === dachActive) return;                      // zeigt diese Seite schon – kein Übergang auf sich selbst
        const S = (C().Z || Z).broadcast || {}, previous = dachActive, kind = previous ? (S.transition || "fade") : "cut", d = Math.max(0, +S.duration || 0);
        const before = previous ? dachUnderlay(C().Z || Z, previous, page) : null;   // Löcher beider Seiten bleiben schwarz
        dachRunning = fresh;
        await dachTransition(previous, fresh, kind, d, () => { dachFrameSet(C().Z || Z, page, 0); dachNote(C().Z || Z, page); }, before);
        if (before) before.remove();
        all.forEach(x => { if (x !== fresh) { x.classList.remove("on"); x.style.zIndex = ""; } });
        fresh.style.zIndex = 3; dachActive = fresh; dachRunning = null;
        all.forEach(x => { if (x === fresh) return; const m = x._brand;
          x._clear = setTimeout(() => { if (x._brand === m && x !== dachActive && x.getAttribute("src") !== window.CastCore.dachUrl(dachPage)) x.src = "about:blank"; }, 300); });
      }).catch(() => {}); };
      fresh.onload = () => { if (fresh.getAttribute("src") === window.CastCore.dachUrl(page)) setTimeout(toggle, 600); };   // erst zeigen, wenn DIESE Seite geladen ist
      setTimeout(toggle, 6000);                                 // spätestens nach 6 s
      fresh.src = window.CastCore.dachUrl(page);
    }
    // Rahmen von Hand verschoben (gleiche Seite): sofort übernehmen
    else dachFrameSet(Z, page, 0);
  }
  // Das App-Fenster (Qt WebEngine) spielt kein H.264 – Seiten mit DACH-Video bekommen dort einen Hinweis (nur Vorschau, nie in OBS)
  const DACH_VIDEO_PAGES = ["pause_content"];
  const canH264 = (() => { try { return !!(window.top.castApp && window.top.castApp.canPlayH264)
    || !!document.createElement("video").canPlayType('video/mp4; codecs="avc1.42E01E"'); } catch (e) { return true; } })();
  function dachNote(Z, page) {
    let note = dachLayer && dachLayer.querySelector(".dach-note");
    const show = !canH264 && DACH_VIDEO_PAGES.includes(page);
    if (!show) { if (note) note.remove(); return; }
    if (!note) { note = document.createElement("div"); note.className = "dach-note preview-only"; dachLayer.appendChild(note); }
    note.textContent = window.CastCore.word(Z, "previewNoH264");
  }
  // Übergänge wie bei den eigenen Szenen: Schnitt · Blende · Schieben · Wischen · Stinger
  // Die Kameras gehören zur neuen Seite: sie sitzen sofort in deren Löchern und erscheinen mit ihr (gleiche Animation).
  // Unter der alten Seite liegen solange schwarze Flächen in deren Löchern (before) – nie scheint etwas anderes durch.
  async function dachTransition(previous, fresh, kind, d, middle, before) {
    fresh.style.zIndex = 3; if (previous) previous.style.zIndex = 1;      // Kameras (2) liegen dazwischen
    const opt = { duration: d, easing: "cubic-bezier(.4,0,.2,1)", fill: "both" };
    if (!previous || kind === "cut" || d === 0) { fresh.classList.add("on"); middle(); return; }
    if (kind === "stinger") {
      await stingerIn(d); fresh.classList.add("on"); previous.classList.remove("on"); middle(); await stingerOut(d); return;
    }
    fresh.classList.add("on"); middle();
    const cams = dachLayer.querySelector(".dach-cams");
    if (kind === "fade") {
      // Blende über den DACH-Hintergrund: die alte Seite geht in dessen Dunkelblau, dann kommt die neue Seite. Zwei
      // halb durchsichtige Seiten übereinander (Kamera-Löcher, Logos doppelt) sehen sonst unruhig aus (2.15).
      const dip = document.createElement("div"); dip.className = "dach-dip";
      dachLayer.insertBefore(dip, cams);                                  // über der alten Seite, unter Kameras und neuer Seite
      const half = Object.assign({}, opt, { duration: d / 2 });
      const hidden = [fresh.animate([{ opacity: 0 }, { opacity: 0 }], half), cams.animate([{ opacity: 0 }, { opacity: 0 }], half)];
      try { await dip.animate([{ opacity: 0 }, { opacity: 1 }], half).finished; } catch (e) {}
      const runs = [fresh.animate([{ opacity: 0 }, { opacity: 1 }], half), cams.animate([{ opacity: 0 }, { opacity: 1 }], half)];
      hidden.forEach(r => r.cancel());
      try { await runs[0].finished; } catch (e) {}
      runs.forEach(r => r.cancel()); dip.remove();
      return;
    }
    const k = kind === "wipe" ? [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }]
            : kind === "slide" ? [{ opacity: 0, transform: "translateX(6%)" }, { opacity: 1, transform: "none" }]
            : [{ opacity: 0 }, { opacity: 1 }];
    const out = [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(-6%)" }];
    // Schieben: die alte Seite geht in der ersten Hälfte, die neue kommt leicht versetzt (wie bei den eigenen Szenen) –
    // sonst stehen beide lange halb durchsichtig übereinander
    const inOpt = kind === "slide" ? Object.assign({}, opt, { duration: d * .65, delay: d * .35 }) : opt;
    const outOpt = Object.assign({}, opt, { duration: d * .55 });
    const runs = [fresh.animate(k, inOpt), cams.animate(k, inOpt)];
    if (kind === "slide") runs.push(previous.animate(out, outOpt), ...(before ? [before.animate(out, outOpt)] : []));
    try { await runs[0].finished; } catch (e) {}
    runs.forEach(r => r.cancel());
  }
  function dachUnderlay(Z, previous, next) {
    const old = Object.keys(window.CastCore.DACH_FRAME).find(p => previous.getAttribute("src") === window.CastCore.dachUrl(p));
    const frames = [old, next].filter(Boolean).flatMap(p => Object.values(window.CastCore.dachFrame(Z, p)));
    if (!frames.length) return null;
    const under = document.createElement("div"); under.className = "dach-under";
    under.innerHTML = frames.map(r => `<div style="left:${+r.x || 0}px;top:${+r.y || 0}px;width:${+r.w || 0}px;height:${+r.h || 0}px"></div>`).join("");
    dachLayer.insertBefore(under, dachLayer.firstChild);
    return under;
  }
  // Kameras und Inhalt in die Rahmen der Seite – vorhandene gleiten an ihren neuen Platz (das Bild läuft dabei weiter)
  function dachFrameSet(Z, page, d) {
    if (!dachLayer) return;
    const frame = window.CastCore.dachFrame(Z, page), cacheKey = page + JSON.stringify(frame);
    if (cacheKey === dachKey) return;
    dachKey = cacheKey;
    const box = dachLayer.querySelector(".dach-cams"), da = {};
    box.querySelectorAll(".dach-cam").forEach(k => { da[k.dataset.source] = k; });
    const opt = { duration: d, easing: "cubic-bezier(.4,0,.2,1)" };
    Object.entries(frame).forEach(([source, r]) => {
      const target = { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" };
      let k = da[source];
      if (k) {
        delete da[source];
        const from = { left: k.style.left, top: k.style.top, width: k.style.width, height: k.style.height };
        Object.assign(k.style, target); if (d) k.animate([from, target], opt);
      } else {
        k = document.createElement("div"); k.className = "cam dach-cam"; k.dataset.source = source; Object.assign(k.style, target);
        k.innerHTML = `<div class="dach-frame-name">${{ c1: "Caster 1", c2: "Caster 2", guest: "Gast", content: "Inhalt" }[source] || source}</div>`;
        box.appendChild(k); if (d) k.animate([{ opacity: 0 }, { opacity: 1 }], opt);
      }
    });
    Object.values(da).forEach(k => { if (d) k.animate([{ opacity: 1 }, { opacity: 0 }], opt).finished.then(() => k.remove(), () => k.remove()); else k.remove(); });
    C().newDraw();                                              // Quellen in neue Rahmen (vorhandene laufen weiter)
  }
  addEventListener("cast-drawn", ev => { check(ev.detail); overGame(ev.detail); });
  // Stand, der schon vor diesem Skript ankam, gleich übernehmen
  if (C()) check(C().Z);
})();
