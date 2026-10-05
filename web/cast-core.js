/* =====================================================================
   CASTING-APP · Kern (Steuerseite und alle Overlays laden diese Datei)
   Inhalt (Abschnitte mit „/* ---------- Name“ suchen):
     · Feste Overlay-Texte in beiden Sprachen (OVERLAY_TEXTS, OVERLAY_WORDS)
     · DEFAULT – der Standardzustand „Z“: alles, was eine Sendung ausmacht
       (Texte, Teams, Szenen, Einblendungen, Turnier …). Neues Feld → hier
       mit Standardwert eintragen; ältere Stände bekommen es beim Laden (merge).
     · Laden/Speichern im Browser, Bilder (IndexedDB), Timer, Turnier-Logik
       (SE/DE/Swiss/GSL/Tabelle), DACH-CS-Seiten und -Rahmen
     · channel() – wie der Zustand von der Steuerseite zu den Overlays kommt:
         1. App (Normalfall): Steuerseite schickt ihn an den Server
            (POST /api/state), Overlays bekommen ihn live per Server-Sent
            Events (/api/events: state, live, reload, status)
         2. ohne App: BroadcastChannel + localStorage (gleicher Browser) bzw.
            OBS-WebSocket an die Browserquellen in OBS
   ===================================================================== */
window.CastCore = (function () {
  "use strict";

  const KEY = "cast-state-v1";
  const VERSION = "2.2.1";                     // muss zur App passen – sonst lädt sich die Seite neu
  // Läuft die Seite über den Server der App (http://localhost:8787)?
  const SERVER = /^https?:$/.test(location.protocol) && location.port === "8787" && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);


  // Feste Texte der Overlays in beiden Sprachen (⚙ App-Einstellungen → Sprache der Overlays).
  //   texts: Standardwerte für Z.texts – in der Steuerseite änderbar; beim Sprachwechsel werden nur
  //          Texte ersetzt, die noch dem Standard der alten Sprache entsprechen.
  //   words: Wörter, die das Overlay selbst schreibt (Turnierbaum, Hinweise in der Vorschau …).
  const OVERLAY_TEXTS = {
    de: {
      title: "GRAND FINAL",
      ticker: ["Willkommen zum Cast", "Folgt uns auf Twitch", "Best of 3 – los geht's"],
      startIn: "START IN",
      matchUp: "MATCH UP",
      nextIn: "WEITER IN",
      pauseTitle: "PAUSE",
      pauseBelow: "GLEICH GEHT'S WEITER",
      endTitle: "DANKE FÜRS ZUSCHAUEN",
      endBelow: "BIS ZUM NÄCHSTEN MAL",
      finalscore: "ENDSTAND",
      interview: "INTERVIEW",
      musicLabel: "JETZT LÄUFT",
      mapVeto: "MAP VETO",
      lineups: "LINE-UPS",
      ban: "BAN",
      pick: "PICK",
      decider: "DECIDER",
      amTurn: "AM ZUG",
      series: "SERIE",
      map: "MAP",
      running: "LÄUFT",
      pending: "AUSSTEHEND",
      sponsorLabel: "PRÄSENTIERT VON",
      sponsorsTitle: "UNSERE PARTNER",
      sponsorTicker: "Präsentiert von",
      scoreboard: "SCOREBOARD",
      teamStats: "TEAM-STATISTIK",
      h2h: "HEAD TO HEAD",
      waitCs2: "Warte auf CS2-Daten …",
      tournament: "TURNIER",
      next: "NEXT",
      mapFact: "MAP-FAKT",
      round: "RUNDE",
      players: "SPIELER"
    },
    en: {
      title: "GRAND FINAL",
      ticker: ["Welcome to the cast", "Follow us on Twitch", "Best of 3 – let's go"],
      startIn: "STARTING IN",
      matchUp: "MATCH UP",
      nextIn: "BACK IN",
      pauseTitle: "BREAK",
      pauseBelow: "BACK IN A MOMENT",
      endTitle: "THANKS FOR WATCHING",
      endBelow: "SEE YOU NEXT TIME",
      finalscore: "FINAL SCORE",
      interview: "INTERVIEW",
      musicLabel: "NOW PLAYING",
      mapVeto: "MAP VETO",
      lineups: "LINE-UPS",
      ban: "BAN",
      pick: "PICK",
      decider: "DECIDER",
      amTurn: "UP NEXT",
      series: "SERIES",
      map: "MAP",
      running: "LIVE",
      pending: "UPCOMING",
      sponsorLabel: "PRESENTED BY",
      sponsorsTitle: "OUR PARTNERS",
      sponsorTicker: "Presented by",
      scoreboard: "SCOREBOARD",
      teamStats: "TEAM STATS",
      h2h: "HEAD TO HEAD",
      waitCs2: "Waiting for CS2 data …",
      tournament: "TOURNAMENT",
      next: "NEXT",
      mapFact: "MAP FACT",
      round: "ROUND",
      players: "PLAYERS"
    }
  };
  const OVERLAY_WORDS = {
    de: { final: "FINALE", upperFinal: "OBEN-FINALE", lowerFinal: "UNTEN-FINALE", semifinal: "HALBFINALE", quarterfinal: "VIERTELFINALE",
          roundOf16: "ACHTELFINALE", round: "RUNDE", upperRound: "OBEN R", lowerRound: "UNTEN R", group: "GRUPPE", table: "TABELLE",
          opening: "ERÖFFNUNG", winners: "GEWINNER", elimination: "AUSSCHEIDUNG", decider: "ENTSCHEIDUNG", bye: "Freilos",
          noMaps: "Noch keine gespielten Maps – erst das Map-Veto ausfüllen", noSponsors: "Noch keine Sponsoren für dieses Theme",
          noTournament: "Noch kein Turnier angelegt", cameraMissing: "Kamera nicht verfügbar" },
    en: { final: "FINAL", upperFinal: "UPPER FINAL", lowerFinal: "LOWER FINAL", semifinal: "SEMIFINAL", quarterfinal: "QUARTERFINAL",
          roundOf16: "ROUND OF 16", round: "ROUND", upperRound: "UPPER R", lowerRound: "LOWER R", group: "GROUP", table: "TABLE",
          opening: "OPENING", winners: "WINNERS", elimination: "ELIMINATION", decider: "DECIDER", bye: "Bye",
          noMaps: "No maps played yet – fill in the map veto first", noSponsors: "No sponsors for this theme yet",
          noTournament: "No tournament set up yet", cameraMissing: "Camera not available" }
  };
  /** A fixed overlay word in the overlay language of the state. */
  const word = (Z, key) => (OVERLAY_WORDS[(Z || {}).overlayLanguage] || OVERLAY_WORDS.de)[key];
  /** Switch the overlay language: texts still at the old default get the new default, own texts stay. */
  function overlayLanguageSet(Z, language) {
    if (!OVERLAY_TEXTS[language]) return;
    const before = OVERLAY_TEXTS[Z.overlayLanguage] || OVERLAY_TEXTS.de, after = OVERLAY_TEXTS[language];
    Z.texts = Z.texts || {};
    for (const key of Object.keys(after)) {
      if (Z.texts[key] === undefined || JSON.stringify(Z.texts[key]) === JSON.stringify(before[key])) Z.texts[key] = clone(after[key]);
    }
    Z.overlayLanguage = language;
  }

  // Einblendungen: Arten und wo sie stehen, wenn nichts anderes gewählt ist
  // (Positionen: t/c/b = oben/Mitte/unten, l/c/r = links/Mitte/rechts; CSS-Klassen .pos-… in cast.css)
  const GFX_POSITIONS = ["bl", "bc", "br", "tl", "tc", "tr", "cl", "cr"];
  const GFX_DEFAULT_POS = { lowerthird: "bl", caster: "bl", hint: "tc", score: "tc", mapinfo: "tl", mapfact: "tr", scoreboard: "bc", players: "bl" };

  const DEFAULT = {
    theme: "regular",                             // neutral für den ersten Start – Liga-Themes per Klick
    themeData: {},          // eigene Anpassungen pro Theme (überschreiben themes.js)
    overlayLanguage: "de",                        // Sprache der festen Overlay-Texte: "de" | "en" (⚙ App-Einstellungen)
    texts: Object.assign({}, OVERLAY_TEXTS.de, { tickerTempo: 90 }),
    // Logo pro Szene: "auto" (Icon, wenn der Platz fehlt) | "voll" | "icon"
    logoMode: {},
    teams: {
      a: { name: "TEAM A", logo: "", score: 0 },
      b: { name: "TEAM B", logo: "", score: 0 },
      result: false
    },
    caster: {
      c1:   { name: "CASTER 1", addition: "@caster1" },
      c2:   { name: "CASTER 2", addition: "@caster2" },
      guest: { name: "GAST", addition: "Spieler · Team A" }
    },
    timer: { running: false, target: 0, rest: 10 * 60000 },

    // Aktive-Duty-Pool CS2 (Stand 2026) – in der Steuerseite erweiterbar
    mapPool: [
      { name: "Ancient",  image: "media/maps/de_ancient.jpg",  active: true },
      { name: "Anubis",   image: "media/maps/de_anubis.jpg",   active: true },
      { name: "Dust II",  image: "media/maps/de_dust2.jpg",    active: true },
      { name: "Inferno",  image: "media/maps/de_inferno.jpg",  active: true },
      { name: "Mirage",   image: "media/maps/de_mirage.jpg",   active: true },
      { name: "Nuke",     image: "media/maps/de_nuke.jpg",     active: true },
      { name: "Overpass", image: "media/maps/de_overpass.jpg", active: true },
      { name: "Train",    image: "media/maps/de_train.jpg",    active: false },
      { name: "Vertigo",  image: "media/maps/de_vertigo.jpg",  active: false },
      { name: "Cache",    image: "media/maps/de_cache.jpg",    active: false },
      { name: "Office",   image: "media/maps/cs_office.jpg",   active: false },
      { name: "Italy",    image: "media/maps/cs_italy.jpg",    active: false }
    ],
    vetoPresets: {
      bo1: { name: "Best of 1", steps: [["ban","a"],["ban","b"],["ban","a"],["ban","b"],["ban","a"],["ban","b"],["decider",""]] },
      bo2: { name: "Best of 2", steps: [["ban","a"],["ban","b"],["pick","a"],["pick","b"]] },
      bo3: { name: "Best of 3", steps: [["ban","a"],["ban","b"],["pick","a"],["pick","b"],["ban","a"],["ban","b"],["decider",""]] },
      bo5: { name: "Best of 5", steps: [["ban","a"],["ban","b"],["pick","a"],["pick","b"],["pick","a"],["pick","b"],["decider",""]] }
    },
    // Schritte: { aktion: "ban"|"pick"|"decider", team: "a"|"b"|"", map: "", bild: "", seite: ""|"ct"|"t" }
    veto: { source: "manual", format: "bo3", steps: [] },
    players: { a: [], b: [] },   // { name, echt, bild, level }
    // Serie: Ergebnisse stehen direkt an den Pick-/Decider-Schritten des Vetos (schritt.ergebnis)
    series: { autoPoints: true },
    // Sprecher-Anzeige: Namensschild leuchtet, wenn jemand spricht
    speaker: { on: false, threshold: 0.08 },
    // Sponsoren pro Theme
    sponsors: {
      on: true, seconds: 8, inTicker: false,
      sceneList: { intro: true, pause: true, end: true, "cast-duo": true, "cast-solo": true, "cast-duo-interview": true, "cast-solo-interview": true },
      listen: {},                 // { themeKey: [ { name, logo } ] }
      gfx: { num: -1, until: 0 }
    },
    // Szenenwechsel über OBS (nur Steuerseite)
    // pro Overlay-Szene: anzeigen?, welche OBS-Szene, welcher Übergang ("" = Standard)
    sceneList: { on: true, defaultChoice: "", list: {} },
    diagnose: false,
    // Alles in einer Browserquelle (overlay.html): welche Szene läuft, wie wird gewechselt
    broadcast: { active: true, scene: "intro", transition: "stinger", duration: 900, num: 0 },
    // Einblendungen über jeder Szene
    h2h: { a: "", b: "" },
    // Turnier: Teams in Setz-Reihenfolge, Format, Ergebnisse je Spiel-ID, Sichtbarkeit, hervorgehobenes Team
    tournament: { name: "", format: "se", teams: [], res: {}, swiss: { wins: 3, losses: 3, rounds: [] },
               visible: { mode: "all", round: 1, resultsOff: false }, focused: "" },                        // Head-to-Head: Steam-ID oder leer = automatisch der stärkste Spieler je Team
    graphics: [
      { id: "e1", type: "caster", pos: "bl", arrangement: "stacked", guest: false, on: false, until: 0 },
      { id: "e2", type: "lowerthird", pos: "bl", title: "NAME", text: "Zusatz", on: false, until: 0 },
      { id: "e3", type: "hint", pos: "tc", title: "", text: "Gleich geht's weiter", on: false, until: 0 },
      { id: "e4", type: "score", pos: "tc", on: false, until: 0 },
      { id: "e5", type: "mapinfo", pos: "tl", on: false, until: 0 },
      { id: "e6", type: "mapfact", pos: "tr", map: "", fact: -1, seconds: 12, on: false, until: 0 }
    ],
    // Live-Spieldaten aus CS2 (Vorbereitung)
    live: { on: false },
    // Was in den Kamera-Rahmen gezeigt wird (sonst leer für eine OBS-Quelle darüber)
    //   typ: "leer" | "link" (VDO.Ninja o. ä.) | "geraet" (Webcam/Capture) | "bild"
    sources: {
      c1:     { type: "empty", url: "", device: "", deviceName: "", audio: true, mirror: false, adjust: "fill", image: "" },
      c2:     { type: "empty", url: "", device: "", deviceName: "", audio: true, mirror: false, adjust: "fill", image: "" },
      guest:   { type: "empty", url: "", device: "", deviceName: "", audio: true, mirror: false, adjust: "fill", image: "" },
      content: { type: "empty", url: "", device: "", deviceName: "", audio: true, mirror: false, adjust: "whole", image: "" }
    },
    background: { videos: [], dim: 0.35, transparent: false, source: "overlay" },   // quelle: "overlay" | "obs"
    music: { displayed: true, address: "http://localhost:1608/" },
    revision: 0
  };

  const isObj = v => v && typeof v === "object" && !Array.isArray(v);
  const clone = o => JSON.parse(JSON.stringify(o));
  const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
  function merge(target, source) {
    if (!isObj(source)) return target;
    for (const k of Object.keys(source)) {
      if (FORBIDDEN.has(k)) continue;
      const v = source[k];
      if (isObj(v)) target[k] = merge(isObj(target[k]) ? target[k] : {}, v);
      else if (v !== undefined) target[k] = Array.isArray(v) ? clone(v) : v;
    }
    return target;
  }
  function savedRevision() { try { return +localStorage.getItem(KEY + "-revision") || 0; } catch (e) { return 0; } }
  function load() {
    try { return merge(clone(DEFAULT), JSON.parse(localStorage.getItem(KEY) || "{}")); }
    catch (e) { return clone(DEFAULT); }
  }
  function save(z) {
    try { localStorage.setItem(KEY, JSON.stringify(z)); localStorage.setItem(KEY + "-revision", String(z.revision || 0)); return true; }
    catch (e) { return false; }
  }

  /* ---------- OBS-WebSocket (v5) ---------- */
  async function sha256b64(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }
  function obsConnection(opt) {
    let ws = null, isOpen = false, num = 0, attempts = 0, stop = false;
    const wait = new Map();   // offene Anfragen mit Antwort (Promise)
    const status = s => opt.onStatus && opt.onStatus(s);
    function connect() {
      if (stop) return;
      const e = opt.settings ? opt.settings() : (window.CAST_CONNECTION || {});
      status("connecting");
      try { ws = new WebSocket(`ws://127.0.0.1:${e.port || 4455}`); }
      catch (err) { return later(); }
      ws.onmessage = async ev => {
        let m; try { m = JSON.parse(ev.data); } catch (err) { return; }
        if (m.op === 0) {
          const d = { rpcVersion: 1, eventSubscriptions: opt.events || 1 };
          if (m.d.authentication) {
            const { salt, challenge } = m.d.authentication;
            if (e.password || !SERVER) {
              const secret = await sha256b64((e.password || "") + salt);
              d.authentication = await sha256b64(secret + challenge);
            } else {
              // App: das Passwort liegt im Schlüsselbund – der Server rechnet die Anmeldung aus, das Passwort bleibt dort
              try {
                const r = await fetch("/api/obs-auth", { method: "POST", body: JSON.stringify({ salt, challenge }) });
                if (r.ok) d.authentication = (await r.json()).authentication;
              } catch (err) {}
            }
          }
          ws.send(JSON.stringify({ op: 1, d }));
        } else if (m.op === 2) {
          isOpen = true; attempts = 0; status("connected");
          opt.onOpen && opt.onOpen();
        } else if (m.op === 5 && m.d && m.d.eventType === "CustomEvent") {
          opt.onMessage && opt.onMessage(m.d.eventData || {});
        } else if (m.op === 5 && m.d) {
          opt.onEvent && opt.onEvent(m.d.eventType, m.d.eventData || {});
        } else if (m.op === 7 && m.d) {
          const r = m.d.requestStatus || {};
          const w = wait.get(m.d.requestId);
          if (w) { wait.delete(m.d.requestId); clearTimeout(w.t); r.result ? w.ok(m.d.responseData || {}) : w.no(new Error(r.comment || ("Fehler " + r.code))); }
          opt.onAnswer && opt.onAnswer(m.d.requestType, !!r.result, r.comment || "", m.d.responseData || {});
        }
      };
      ws.onclose = ev => {
        isOpen = false;
        status(ev.code === 4009 ? "password" : "disconnected");
        later();
      };
      ws.onerror = () => {};
    }
    function later() { if (!stop) setTimeout(connect, Math.min(15000, 1500 * (++attempts))); }
    function request(type, data) {
      if (!isOpen || !ws) return false;
      ws.send(JSON.stringify({ op: 6, d: { requestType: type, requestId: "cast" + (++num), requestData: data || {} } }));
      return true;
    }
    // Anfrage mit Antwort: frage("GetSceneList").then(daten => …)
    function question(type, data) {
      return new Promise((ok, no) => {
        if (!isOpen || !ws) return no(new Error("OBS nicht verbunden"));
        const id = "cast" + (++num);
        const t = setTimeout(() => { wait.delete(id); no(new Error("Keine Antwort von OBS")); }, 6000);
        wait.set(id, { ok, no, t });
        ws.send(JSON.stringify({ op: 6, d: { requestType: type, requestId: id, requestData: data || {} } }));
      });
    }
    // an andere WebSocket-Clients (z. B. zweite Steuerseite)
    function send(data) { return request("BroadcastCustomEvent", { eventData: data }); }
    // direkt in alle Browserquellen von OBS (obs-browser) – Overlays brauchen dafür KEIN Passwort
    function onBrowsersources(name, data) {
      return request("CallVendorRequest", { vendorName: "obs-browser", requestType: "emit_event", requestData: { event_name: name, event_data: data } });
    }
    function fresh() { stop = false; attempts = 0; try { ws && ws.close(); } catch (e) {} }
    connect();
    return { send, request, question, onBrowsersources, fresh, get isOpen() { return isOpen; } };
  }

  /* ---------- Kanal: alle Wege zusammen ---------- */
  function channel(opt) {
    // In der App bekommen Overlays ihren Stand ausschließlich über die Live-Verbindung zur App.
    // Andere Wege (andere Tabs, OBS-Docks, gespeicherte Stände) können dann nichts mehr dazwischenfunken.
    const onlyServer = SERVER && opt.onlyServer;
    const bc = !onlyServer && "BroadcastChannel" in window ? new BroadcastChannel("cast-overlay") : null;
    const received = d => {
      if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { return; } }
      if (d && d.cast) opt.onMessage && opt.onMessage(d);
    };
    if (bc) bc.onmessage = ev => received(ev.data);
    // Nachrichten, die OBS über obs-browser direkt in die Browserquelle schickt
    if (!onlyServer) addEventListener("cast-state", ev => received(ev.detail));
    const obs = opt.obs ? obsConnection({
      settings: opt.settings,
      onStatus: opt.onStatus,
      onOpen: opt.onOpen,
      onAnswer: opt.onAnswer,
      onEvent: opt.onEvent,
      events: opt.events,
      onClients: opt.onClients,
      onMessage: received
    }) : null;
    if (!onlyServer) addEventListener("storage", ev => { if (ev.key === KEY && opt.onStorage) opt.onStorage(); });

    // App: Änderungen kommen sofort per Live-Verbindung (Server-Sent Events)
    if (SERVER && (opt.query || opt.onClients)) {
      const page = opt.page || document.body.dataset.scene || "page";
      const es = new EventSource("/api/events?page=" + encodeURIComponent(page) + "&v=" + VERSION);
      // App wurde aktualisiert: Seite neu laden (höchstens 3× pro Minute, falls etwas klemmt)
      es.addEventListener("reload", () => {
        try {
          const now = Date.now(), n = JSON.parse(sessionStorage.getItem("cast-reload") || "[undefined]").filter(t => now - t < 60000);
          if (n.length >= 3) return;
          n.push(now); sessionStorage.setItem("cast-reload", JSON.stringify(n));
        } catch (e) {}
        window.__newLoad = true; location.reload();
      });
      es.addEventListener("state", ev => { try { const z = JSON.parse(ev.data); opt.onMessage && opt.onMessage({ cast: "state", z }); } catch (e) {} });
      es.addEventListener("live", ev => { try { opt.onLive && opt.onLive(JSON.parse(ev.data)); } catch (e) {} });
      es.addEventListener("status", ev => { try { opt.onClients && opt.onClients(JSON.parse(ev.data).clients || []); } catch (e) {} });
      es.onopen = () => opt.onService && opt.onService(true);
      es.onerror = () => opt.onService && opt.onService(false);
    }
    const serviceSend = d => {
      if (!SERVER) return;
      if (d.cast === "state") fetch("/api/state", { method: "POST", body: JSON.stringify(d.z) }).catch(() => {});
      if (d.cast === "images") Object.entries(d.images || {}).forEach(([id, v]) => fetch("/api/image/" + id, { method: "POST", body: v }).catch(() => {}));
    };
    return {
      send(d) {
        if (bc) bc.postMessage(d);
        serviceSend(d);
        // mit dem Server holen sich die Overlays den Stand selbst – der Umweg über OBS nur ohne Server
        if (obs && !SERVER) { obs.onBrowsersources("cast-state", d); obs.send(d); }
      },
      obs
    };
  }

  /* ---------- Timer ---------- */
  function timerRest(t) {
    if (!t) return 0;
    return t.running ? Math.max(0, t.target - Date.now()) : Math.max(0, t.rest || 0);
  }
  function time(ms) {
    const s = Math.ceil(ms / 1000), m = Math.floor(s / 60), r = s % 60;
    const h = Math.floor(m / 60);
    const p = n => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${p(m % 60)}:${p(r)}` : `${p(m)}:${p(r)}`;
  }

  /* ---------- Große Bilder getrennt übertragen ----------
     Logos, Spielerbilder usw. (data:-Adressen) werden aus dem Zustand herausgelöst,
     einmal übertragen und in jedem Browser in einer Datenbank gemerkt.
     So bleibt der Zustand klein – der Speicher läuft nicht über und OBS bekommt jede Änderung. */
  function imageId(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i += 5) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(36) + s.length.toString(36);
  }
  function split(z) {
    const images = {};
    const small = JSON.parse(JSON.stringify(z), (cacheKey, v) => {
      if (typeof v === "string" && v.length > 2000 && v.startsWith("data:")) { const id = imageId(v); images[id] = v; return "asset:" + id; }
      return v;
    });
    return { small, images };
  }
  function resolve(z, images) {
    // Mit dem Server lädt der Browser fehlende Bilder direkt von /api/image/…
    return JSON.parse(JSON.stringify(z), (cacheKey, v) => (typeof v === "string" && v.startsWith("asset:"))
      ? (images[v.slice(6)] || (SERVER ? "/api/image/" + v.slice(6) : "")) : v);
  }
  const Images = (() => {
    const mem = {};
    let db = null;
    const openDb = () => db ? Promise.resolve(db) : (window.CastLegacy ? window.CastLegacy.ready : Promise.resolve()).then(() => new Promise(ok => {
      try {
        const r = indexedDB.open("cast-images", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("b");
        r.onsuccess = () => ok(db = r.result); r.onerror = () => ok(null);
      } catch (e) { ok(null); }
    }));
    return {
      mem,
      async load() {
        const d = await openDb(); if (!d) return mem;
        await new Promise(ok => {
          try {
            const r = d.transaction("b").objectStore("b").openCursor();
            r.onsuccess = () => { const c = r.result; if (c) { mem[c.key] = c.value; c.continue(); } else ok(); };
            r.onerror = () => ok();
          } catch (e) { ok(); }
        });
        return mem;
      },
      async set(fresh) {
        Object.assign(mem, fresh);
        const d = await openDb(); if (!d) return;
        await new Promise(ok => {
          try { const t = d.transaction("b", "readwrite"), s = t.objectStore("b"); for (const [id, v] of Object.entries(fresh)) s.put(v, id); t.oncomplete = ok; t.onerror = ok; }
          catch (e) { ok(); }
        });
      },
      async cleanup(keep) {
        const d = await openDb(); if (!d) return;
        Object.keys(mem).forEach(id => { if (!keep.has(id)) delete mem[id]; });
        try { const t = d.transaction("b", "readwrite"), s = t.objectStore("b"), r = s.openCursor();
          r.onsuccess = () => { const c = r.result; if (c) { if (!keep.has(c.key)) c.delete(); c.continue(); } }; } catch (e) {}
      }
    };
  })();

  // Adresse sicher in CSS url("…") einsetzen
  function cssUrl(u) { return `url("${String(u || "").replace(/["\\\n\r]/g, c => "\\" + c.charCodeAt(0).toString(16) + " ")}")`; }


  /* ---------- Turnierbaum: Single/Double Elimination, Swiss, GSL-Gruppen ----------
     Teilnehmer je Spiel: Team-ID, null (steht noch nicht fest) oder "BYE" (Freilos). */
  function setOrder(P) { let o = [1]; while (o.length < P) { const n = o.length * 2; o = o.flatMap(x => [x, n + 1 - x]); } return o; }
  function tournamentBuild(T, language) {
    const W = OVERLAY_WORDS[language] || OVERLAY_WORDS.de;     // round and group names in the overlay language
    T = T || {}; const teams = (T.teams || []).filter(t => t && t.id), res = T.res || {}, M = {};
    const fresh = (id, a, b, qa, qb) => (M[id] = { id, a, b, qa, qb });
    const who = q => !q ? null : q.team !== undefined ? q.team : (M[q.id] || {})[q.kind] ?? null;
    function resolve(m) {
      if (m.qa) m.a = who(m.qa); if (m.qb) m.b = who(m.qb);
      const e = res[m.id] || {}; m.sa = e.a; m.sb = e.b; m.done = !!e.done; m.winner = m.loser = null;
      if (m.a === "BYE" && m.b === "BYE") m.winner = m.loser = "BYE";
      else if (m.a === "BYE" && m.b) { m.winner = m.b; m.loser = "BYE"; }
      else if (m.b === "BYE" && m.a) { m.winner = m.a; m.loser = "BYE"; }
      else if (m.a && m.b && m.done && +m.sa === +m.sb) m.draws = true;
      else if (m.a && m.b && m.done && +m.sa !== +m.sb) { const aWon = +m.sa > +m.sb; m.winner = aWon ? m.a : m.b; m.loser = aWon ? m.b : m.a; }
      return m;
    }
    const title = (rest, upper) => rest === 1 ? (upper ? W.upperFinal : W.final) : rest === 2 ? W.semifinal : rest === 3 ? W.quarterfinal : rest === 4 ? W.roundOf16 : "";
    const result = { format: T.format || "se", rounds: [], bottom: [], finale: null, groups: [], table: [], teams };
    if (teams.length < 2) return result;
    const fmt = T.format || "se";
    if (fmt === "se" || fmt === "de") {
      const P = Math.pow(2, Math.ceil(Math.log2(teams.length))), k = Math.log2(P), ord = setOrder(P), pre = fmt === "de" ? "O" : "W";
      const assign = s => s <= teams.length ? teams[s - 1].id : "BYE";
      for (let r = 1; r <= k; r++) {
        const round = { title: (fmt === "de" && r === k) ? W.upperFinal : title(k - r + 1, false) || W.round + " " + r, matches: [] };
        for (let i = 0; i < P / Math.pow(2, r); i++) {
          const m = r === 1 ? fresh(`${pre}1-${i + 1}`, null, null, { team: assign(ord[2 * i]) }, { team: assign(ord[2 * i + 1]) })
                            : fresh(`${pre}${r}-${i + 1}`, null, null, { id: `${pre}${r - 1}-${2 * i + 1}`, kind: "winner" }, { id: `${pre}${r - 1}-${2 * i + 2}`, kind: "winner" });
          round.matches.push(resolve(m));
        }
        if (fmt === "de" && r < k) round.title = W.upperRound + r;
        result.rounds.push(round);
      }
      if (fmt === "de" && k >= 2) {
        const count = j => P / Math.pow(2, Math.ceil(j / 2) + 1), J = 2 * (k - 1);
        for (let j = 1; j <= J; j++) {
          const round = { title: j === J ? W.lowerFinal : W.lowerRound + j, matches: [] }, n = count(j);
          for (let i = 0; i < n; i++) {
            let qa, qb;
            if (j === 1) { qa = { id: `O1-${2 * i + 1}`, kind: "loser" }; qb = { id: `O1-${2 * i + 2}`, kind: "loser" }; }
            else if (j % 2 === 0) { qa = { id: `U${j - 1}-${i + 1}`, kind: "winner" }; qb = { id: `O${j / 2 + 1}-${n - i}`, kind: "loser" }; }   // gespiegelt: weniger Wiederholungen
            else { qa = { id: `U${j - 1}-${2 * i + 1}`, kind: "winner" }; qb = { id: `U${j - 1}-${2 * i + 2}`, kind: "winner" }; }
            round.matches.push(resolve(fresh(`U${j}-${i + 1}`, null, null, qa, qb)));
          }
          result.bottom.push(round);
        }
        result.finale = resolve(fresh("GF", null, null, { id: `O${k}-1`, kind: "winner" }, { id: `U${J}-1`, kind: "winner" }));
      }
    }
    if (fmt === "gsl") {
      const G = Math.ceil(teams.length / 4), groups = Array.from({ length: G }, () => []);
      teams.forEach((t, i) => { const line = Math.floor(i / G), pos = i % G; groups[line % 2 ? G - 1 - pos : pos].push(t.id); });   // Schlangen-Setzung
      groups.forEach((g, gi) => {
        const n = String.fromCharCode(65 + gi), t = i => g[i] || "BYE", p = id => `G${n}-${id}`;
        const ms = [
          resolve(fresh(p(1), null, null, { team: t(0) }, { team: t(3) })), resolve(fresh(p(2), null, null, { team: t(1) }, { team: t(2) })),
          resolve(fresh(p(3), null, null, { id: p(1), kind: "winner" }, { id: p(2), kind: "winner" })),
          resolve(fresh(p(4), null, null, { id: p(1), kind: "loser" }, { id: p(2), kind: "loser" })),
          resolve(fresh(p(5), null, null, { id: p(3), kind: "loser" }, { id: p(4), kind: "winner" }))
        ];
        [W.opening, W.opening, W.winners, W.elimination, W.decider].forEach((x, i) => { ms[i].title = x; });
        result.groups.push({ name: W.group + " " + n, matches: ms, proceed: [ms[2].winner, ms[4].winner] });
      });
    }
    // Gruppen mit Tabelle (jeder gegen jeden) – Spiele selbst erzeugt oder exakt aus FACEIT übernommen
    if (fmt === "table") {
      const G = Math.max(1, Math.min(8, +T.groupsCount || 1)), groups = Array.from({ length: G }, () => []);
      teams.forEach((t, i) => {
        let g = t.group !== undefined && t.group !== "" && t.group !== null ? (+t.group % G) : null;
        if (g === null) { const line = Math.floor(i / G), pos = i % G; g = line % 2 ? G - 1 - pos : pos; }
        groups[g].push(t.id);
      });
      const eachVsEach = ids => { const l = ids.length % 2 ? [...ids, "BYE"] : ids.slice(), n = l.length, p = [];
        for (let r = 0; r < n - 1; r++) { for (let i = 0; i < n / 2; i++) { const a = l[i], b = l[n - 1 - i]; if (a !== "BYE" && b !== "BYE") p.push({ round: r + 1, a, b }); } l.splice(1, 0, l.pop()); }
        return p; };
      const games = (T.games && T.games.length) ? T.games : groups.flatMap((g, gi) => eachVsEach(g).map((x, i) => ({ id: `R${gi + 1}-${i + 1}`, group: gi, round: x.round, a: x.a, b: x.b })));
      groups.forEach((ids, gi) => {
        const ms = games.filter(x => (+x.group || 0) === gi).map(x => Object.assign(resolve(fresh(x.id, null, null, { team: x.a }, { team: x.b })), { round: x.round, title: x.round ? W.round + " " + x.round : "" }));
        // Punkte je Turnier einstellbar: Sieg ohne/mit Map-Verlust, Niederlage mit/ohne Map-Gewinn, Unentschieden
        const P = Object.assign({ win: 3, winClose: 3, lossClose: 1, loss: 0, draws: 1 }, T.points || {});
        const pointsFor = (own, opponent) => own > opponent ? (opponent > 0 ? P.winClose : P.win) : own < opponent ? (own > 0 ? P.lossClose : P.loss) : P.draws;
        const row = {}; ids.forEach(id => { row[id] = { id, sponsor: 0, s: 0, n: 0, u: 0, diff: 0, rd: 0, pts: 0 }; });
        let withRounds = false;
        ms.forEach(m => {
          if (!m.done || !row[m.a] || !row[m.b]) return;
          const a = row[m.a], b = row[m.b], sa = +m.sa || 0, sb = +m.sb || 0, e = res[m.id] || {};
          a.sponsor++; b.sponsor++; a.diff += sa - sb; b.diff += sb - sa;
          if (e.rdA !== undefined && e.rdB !== undefined) { withRounds = true; a.rd += e.rdA - e.rdB; b.rd += e.rdB - e.rdA; }
          a.pts += pointsFor(sa, sb); b.pts += pointsFor(sb, sa);
          if (sa === sb) { a.u++; b.u++; } else if (sa > sb) { a.s++; b.n++; } else { b.s++; a.n++; }
        });
        // Reihenfolge: Punkte → direkter Vergleich (Punkte untereinander) → Rundendifferenz (sonst Map-Differenz) → Siege
        const direct = (group) => {
          const pts = {}; group.forEach(r => { pts[r.id] = 0; });
          ms.forEach(m => { if (m.done && m.a in pts && m.b in pts) { pts[m.a] += pointsFor(+m.sa || 0, +m.sb || 0); pts[m.b] += pointsFor(+m.sb || 0, +m.sa || 0); } });
          return pts;
        };
        const table = Object.values(row);
        const afterPoints = {}; table.forEach(r => { (afterPoints[r.pts] = afterPoints[r.pts] || []).push(r); });
        Object.values(afterPoints).forEach(g => { if (g.length > 1) { const d = direct(g); g.forEach(r => { r.dv = d[r.id]; }); } else g[0].dv = 0; });
        table.forEach(r => { r.bracket = withRounds ? r.rd : r.diff; });
        table.sort((x, y) => y.pts - x.pts || y.dv - x.dv || y.bracket - x.bracket || y.s - x.s);
        result.groups.push({ name: G > 1 ? W.group + " " + String.fromCharCode(65 + gi) : W.table, matches: ms, table, withRounds });
      });
    }
    // Baum genau so, wie FACEIT ihn liefert (Runden als Spalten, negative Runden = unterer Baum)
    if (fmt === "import") {
      const rounds = {};
      (T.games || []).forEach(x => { (rounds[x.round] = rounds[x.round] || []).push(x); });
      const numbering = Object.keys(rounds).map(Number);
      const upper = numbering.filter(r => r >= 0).sort((a, b) => a - b), bottom = numbering.filter(r => r < 0).sort((a, b) => b - a);
      const column = (r, title) => ({ title, matches: rounds[r].map(x => resolve(fresh(x.id, null, null, { team: x.a || null }, { team: x.b || null }))) });
      upper.forEach((r, i) => result.rounds.push(column(r, title(upper.length - i, false) || W.round + " " + r)));
      bottom.forEach((r, i) => result.bottom.push(column(r, i === bottom.length - 1 ? W.lowerFinal : W.lowerRound + (i + 1))));
    }
    if (fmt === "swiss") {
      const S = T.swiss || {}, record = {};
      teams.forEach(t => { record[t.id] = { id: t.id, s: 0, n: 0, opponent: [] }; });
      (S.rounds || []).forEach((round, ri) => {
        const r = { title: W.round + " " + (ri + 1), matches: [] };
        round.forEach(x => {
          const m = resolve(fresh(x.id, null, null, { team: x.a }, { team: x.b }));
          // Bilanz VOR dem Spiel für die Anzeige („1–0“-Gruppe)
          m.record = record[x.a] ? `${record[x.a].s}–${record[x.a].n}` : "";
          if (m.winner && m.winner !== "BYE" && record[m.winner]) record[m.winner].s++;
          if (m.loser && m.loser !== "BYE" && record[m.loser]) record[m.loser].n++;
          [x.a, x.b].forEach((t, i) => { if (record[t]) record[t].opponent.push(i ? x.a : x.b); });
          r.matches.push(m);
        });
        r.matches.sort((x, y) => String(y.record).localeCompare(String(x.record)));
        result.rounds.push(r);
      });
      result.table = Object.values(record).map(b => Object.assign(b, {
        status: b.s >= (S.wins || 3) ? "proceed" : b.n >= (S.losses || 3) ? "out" : "" })).sort((a, b) => (b.s - b.n) - (a.s - a.n));
    }
    return result;
  }
  // Swiss: nächste Runde auslosen (gleiche Bilanz gegeneinander, keine Wiederholungen, Freilos bei ungerader Zahl)
  function swissDraw(T) {
    const B = tournamentBuild(Object.assign({}, T, { format: "swiss" }), "en");   // names are not shown here
    const S = T.swiss || {}, num = (S.rounds || []).length + 1;
    const active = B.table.filter(b => !b.status).map(b => Object.assign({}, b, { seed: T.teams.findIndex(t => t.id === b.id) }));
    if (num === 1) { const h = Math.ceil(active.length / 2); active.sort((a, b) => a.seed - b.seed); }
    else active.sort((a, b) => (b.s - b.n) - (a.s - a.n) || a.seed - b.seed);
    const isOpen = active.slice(), round = [];
    if (num === 1) { const h = Math.floor(isOpen.length / 2); for (let i = 0; i < h; i++) round.push([isOpen[i].id, isOpen[i + h].id]); if (isOpen.length % 2) round.push([isOpen[isOpen.length - 1].id, "BYE"]); }
    else {
      while (isOpen.length) {
        const a = isOpen.shift();
        let j = isOpen.findIndex(b => b.s === a.s && b.n === a.n && !a.opponent.includes(b.id));
        if (j < 0) j = isOpen.findIndex(b => !a.opponent.includes(b.id));
        if (j < 0) j = isOpen.length ? 0 : -1;
        if (j < 0) { round.push([a.id, "BYE"]); break; }
        round.push([a.id, isOpen.splice(j, 1)[0].id]);
      }
    }
    return round.map(([a, b], i) => ({ id: `S${num}-${i + 1}`, a, b }));
  }

  /* ---------- DACH CS – Offiziell: Seiten und Kamera-Rahmen (1920 × 1080) ---------- */
  const DACH_PAGES = {
    "dach-overview": "overview", "dach-singlecast": "singlecast", "dach-duocast": "duocast", "dach-lineup": "lineup", "dach-mapveto": "mapveto",
    "dach-ingame": "ingame", "dach-positions": "positions", "dach-table": "tabelle", "dach-playoffs": "playoffs", "dach-last": "last_matches",
    "dach-current": "current_matches", "dach-next": "next_matches", "dach-last-a": "last_matches_f1", "dach-last-b": "last_matches_f2",
    "dach-next-a": "next_matches_f1", "dach-next-b": "next_matches_f2", "dach-mvp": "mvp", "dach-pause": "pause", "dach-content": "pause_content",
    "dach-owncontent": "pause_own_content", "dach-inter1": "singleinteraction", "dach-inter2": "duointeraction",
    "dach-interview1": "solo_interview", "dach-interview2": "duointerview", "dach-end": "endscreen"
  };
  // Wo Kameras (c1, c2, gast) und Inhalt (inhalt) sitzen – Singlecam aus dem echten Layout gemessen, der Rest Startwerte zum Anpassen
  const DACH_FRAME = {
    singlecast: { c1: { x: 512, y: 37, w: 910, h: 690 } },
    duocast: { c1: { x: 100, y: 120, w: 840, h: 630 }, c2: { x: 980, y: 120, w: 840, h: 630 } },
    singleinteraction: { content: { x: 60, y: 60, w: 1280, h: 720 }, c1: { x: 1370, y: 60, w: 490, h: 368 } },
    duointeraction: { content: { x: 60, y: 60, w: 1280, h: 720 }, c1: { x: 1370, y: 60, w: 490, h: 368 }, c2: { x: 1370, y: 448, w: 490, h: 368 } },
    solo_interview: { c1: { x: 100, y: 120, w: 840, h: 630 }, guest: { x: 980, y: 120, w: 840, h: 630 } },
    duointerview: { c1: { x: 60, y: 140, w: 580, h: 435 }, c2: { x: 670, y: 140, w: 580, h: 435 }, guest: { x: 1280, y: 140, w: 580, h: 435 } }
  };
  function dachFrame(Z, page) {
    const own = ((Z || {}).dachFrame || {})[page] || {};
    const std = DACH_FRAME[page] || {};
    const r = {}; Object.keys(std).forEach(k => { r[k] = Object.assign({}, std[k], own[k] || {}); });
    return r;
  }

  // Einblendung sichtbar?  an · Dauer (bis) · nur in bestimmten Szenen · Wiederholung (alle X min für Y s)
  function gfxVisible(e, now, scene) {
    if (!e || !e.on) return false;
    if (e.until && e.until <= now) return false;
    if ((e.sceneList || []).length && !e.sceneList.includes(scene)) return false;
    if (e.repeat > 0 && e.duration > 0 && e.start) return (now - e.start) % (e.repeat * 60000) < e.duration * 1000;
    return true;
  }
  // Zeitpunkt, an dem sich die Sichtbarkeit das nächste Mal ändert (0 = nie von selbst)
  function gfxNextSwitch(e, now) {
    if (!e || !e.on) return 0;
    if (e.repeat > 0 && e.duration > 0 && e.start) {
      const W = e.repeat * 60000, D = e.duration * 1000, t = (now - e.start) % W;
      return now + (t < D ? D - t : W - t);
    }
    return e.until && e.until > now ? e.until : 0;
  }

  return { VERSION, SERVER, GFX_POSITIONS, GFX_DEFAULT_POS, OVERLAY_TEXTS, OVERLAY_WORDS, word, overlayLanguageSet, split, gfxVisible, gfxNextSwitch, DACH_PAGES, DACH_FRAME, dachFrame, tournamentBuild, swissDraw, resolve, Images, cssUrl, DEFAULT, KEY, clone, merge, load, save, savedRevision, channel, timerRest, time };
})();
