/* =====================================================================
   CAST-OVERLAY · Kern
   Zustand (Texte, Teams, Timer …) und die Übertragung zwischen
   Steuerseite und Overlays:
     1. OBS-WebSocket   (Steuerseite im Browser/Dock  ->  Browserquellen in OBS)
     2. BroadcastChannel + localStorage (alles im selben Browser, z. B. Vorschau)
   ===================================================================== */
window.CastKern = (function () {
  "use strict";

  const SCHLUESSEL = "cast-zustand-v1";
  const VERSION = "2.0.0";                     // muss zur App passen – sonst lädt sich die Seite neu
  // Läuft die Seite über den Cast-Dienst (http://localhost:8787)?
  const SERVER = /^https?:$/.test(location.protocol) && location.port === "8787" && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  const STANDARD = {
    theme: "regulaer",                             // neutral für den ersten Start – Liga-Themes per Klick
    themeDaten: {},          // eigene Anpassungen pro Theme (überschreiben themes.js)
    texte: {
      titel: "GRAND FINAL",
      ticker: ["Willkommen zum Cast", "Folgt uns auf Twitch", "Best of 3 – los geht's"],
      tickerTempo: 90,
      startIn: "START IN",
      matchUp: "MATCH UP",
      weiterIn: "WEITER IN",
      pauseTitel: "PAUSE",
      pauseUnter: "GLEICH GEHT'S WEITER",
      endeTitel: "DANKE FÜRS ZUSCHAUEN",
      endeUnter: "BIS ZUM NÄCHSTEN MAL",
      endstand: "ENDSTAND",
      interview: "INTERVIEW",
      musikLabel: "JETZT LÄUFT",
      mapVeto: "MAP VETO",
      lineups: "LINE-UPS",
      ban: "BAN",
      pick: "PICK",
      decider: "DECIDER",
      amZug: "AM ZUG",
      serie: "SERIE",
      map: "MAP",
      laeuft: "LÄUFT",
      ausstehend: "AUSSTEHEND",
      sponsorLabel: "PRÄSENTIERT VON",
      sponsorenTitel: "UNSERE PARTNER",
      sponsorTicker: "Präsentiert von",
      scoreboard: "SCOREBOARD",
      teamStats: "TEAM-STATISTIK",
      h2h: "HEAD TO HEAD",
      warteCs2: "Warte auf CS2-Daten …",
      turnier: "TURNIER",
      next: "NEXT",
      mapFakt: "MAP-FAKT"
    },
    // Logo pro Szene: "auto" (Icon, wenn der Platz fehlt) | "voll" | "icon"
    logoModus: {},
    teams: {
      a: { name: "TEAM A", logo: "", score: 0 },
      b: { name: "TEAM B", logo: "", score: 0 },
      ergebnis: false
    },
    caster: {
      c1:   { name: "CASTER 1", zusatz: "@caster1" },
      c2:   { name: "CASTER 2", zusatz: "@caster2" },
      gast: { name: "GAST", zusatz: "Spieler · Team A" }
    },
    timer: { laeuft: false, ziel: 0, rest: 10 * 60000 },

    // Aktive-Duty-Pool CS2 (Stand 2026) – in der Steuerseite erweiterbar
    mapPool: [
      { name: "Ancient",  bild: "medien/maps/de_ancient.jpg",  aktiv: true },
      { name: "Anubis",   bild: "medien/maps/de_anubis.jpg",   aktiv: true },
      { name: "Dust II",  bild: "medien/maps/de_dust2.jpg",    aktiv: true },
      { name: "Inferno",  bild: "medien/maps/de_inferno.jpg",  aktiv: true },
      { name: "Mirage",   bild: "medien/maps/de_mirage.jpg",   aktiv: true },
      { name: "Nuke",     bild: "medien/maps/de_nuke.jpg",     aktiv: true },
      { name: "Overpass", bild: "medien/maps/de_overpass.jpg", aktiv: true },
      { name: "Train",    bild: "medien/maps/de_train.jpg",    aktiv: false },
      { name: "Vertigo",  bild: "medien/maps/de_vertigo.jpg",  aktiv: false },
      { name: "Cache",    bild: "medien/maps/de_cache.jpg",    aktiv: false },
      { name: "Office",   bild: "medien/maps/cs_office.jpg",   aktiv: false },
      { name: "Italy",    bild: "medien/maps/cs_italy.jpg",    aktiv: false }
    ],
    vetoPresets: {
      bo1: { name: "Best of 1", schritte: [["ban","a"],["ban","b"],["ban","a"],["ban","b"],["ban","a"],["ban","b"],["decider",""]] },
      bo2: { name: "Best of 2", schritte: [["ban","a"],["ban","b"],["pick","a"],["pick","b"]] },
      bo3: { name: "Best of 3", schritte: [["ban","a"],["ban","b"],["pick","a"],["pick","b"],["ban","a"],["ban","b"],["decider",""]] },
      bo5: { name: "Best of 5", schritte: [["ban","a"],["ban","b"],["pick","a"],["pick","b"],["pick","a"],["pick","b"],["decider",""]] }
    },
    // Schritte: { aktion: "ban"|"pick"|"decider", team: "a"|"b"|"", map: "", bild: "", seite: ""|"ct"|"t" }
    veto: { quelle: "manuell", format: "bo3", schritte: [] },
    spieler: { a: [], b: [] },   // { name, echt, bild, level }
    // Serie: Ergebnisse stehen direkt an den Pick-/Decider-Schritten des Vetos (schritt.ergebnis)
    serie: { autoPunkte: true },
    // Sprecher-Anzeige: Namensschild leuchtet, wenn jemand spricht
    sprecher: { an: false, schwelle: 0.08 },
    // Sponsoren pro Theme
    sponsoren: {
      an: true, sekunden: 8, imTicker: false,
      szenen: { intro: true, pause: true, ende: true, "cast-duo": true, "cast-solo": true, "cast-duo-interview": true, "cast-solo-interview": true },
      listen: {},                 // { themeKey: [ { name, logo } ] }
      einblendung: { nr: -1, bis: 0 }
    },
    // Szenenwechsel über OBS (nur Steuerseite)
    // pro Overlay-Szene: anzeigen?, welche OBS-Szene, welcher Übergang ("" = Standard)
    szenen: { an: true, standard: "", liste: {} },
    diagnose: false,
    // Alles in einer Browserquelle (overlay.html): welche Szene läuft, wie wird gewechselt
    sendung: { aktiv: true, szene: "intro", uebergang: "stinger", dauer: 900, nr: 0 },
    // Einblendungen über jeder Szene
    h2h: { a: "", b: "" },
    // Turnier: Teams in Setz-Reihenfolge, Format, Ergebnisse je Spiel-ID, Sichtbarkeit, hervorgehobenes Team
    turnier: { name: "", format: "se", teams: [], erg: {}, swiss: { siege: 3, niederlagen: 3, runden: [] },
               sichtbar: { modus: "alle", runde: 1, ergebnisseAus: false }, fokus: "" },                        // Head-to-Head: Steam-ID oder leer = automatisch der stärkste Spieler je Team
    einblendungen: [
      { id: "e1", typ: "caster", pos: "lu", anordnung: "untereinander", gast: false, an: false, bis: 0 },
      { id: "e2", typ: "bauchbinde", pos: "lu", titel: "NAME", text: "Zusatz", an: false, bis: 0 },
      { id: "e3", typ: "hinweis", pos: "mo", titel: "", text: "Gleich geht's weiter", an: false, bis: 0 },
      { id: "e4", typ: "punktestand", pos: "mo", an: false, bis: 0 },
      { id: "e5", typ: "mapinfo", pos: "lo", an: false, bis: 0 },
      { id: "e6", typ: "mapfakt", pos: "ro", map: "", fakt: -1, sekunden: 12, an: false, bis: 0 }
    ],
    // Live-Spieldaten aus CS2 (Vorbereitung)
    live: { an: false },
    // Was in den Kamera-Rahmen gezeigt wird (sonst leer für eine OBS-Quelle darüber)
    //   typ: "leer" | "link" (VDO.Ninja o. ä.) | "geraet" (Webcam/Capture) | "bild"
    quellen: {
      c1:     { typ: "leer", url: "", geraet: "", geraetName: "", ton: true, spiegeln: false, anpassen: "fuellen", bild: "" },
      c2:     { typ: "leer", url: "", geraet: "", geraetName: "", ton: true, spiegeln: false, anpassen: "fuellen", bild: "" },
      gast:   { typ: "leer", url: "", geraet: "", geraetName: "", ton: true, spiegeln: false, anpassen: "fuellen", bild: "" },
      inhalt: { typ: "leer", url: "", geraet: "", geraetName: "", ton: true, spiegeln: false, anpassen: "ganz", bild: "" }
    },
    hintergrund: { videos: [], abdunkeln: 0.35, durchsichtig: false, quelle: "overlay" },   // quelle: "overlay" | "obs"
    musik: { anzeigen: true, adresse: "http://localhost:1608/" },
    stand: 0
  };

  const istObj = v => v && typeof v === "object" && !Array.isArray(v);
  const klon = o => JSON.parse(JSON.stringify(o));
  const VERBOTEN = new Set(["__proto__", "constructor", "prototype"]);
  function mischen(ziel, quelle) {
    if (!istObj(quelle)) return ziel;
    for (const k of Object.keys(quelle)) {
      if (VERBOTEN.has(k)) continue;
      const v = quelle[k];
      if (istObj(v)) ziel[k] = mischen(istObj(ziel[k]) ? ziel[k] : {}, v);
      else if (v !== undefined) ziel[k] = Array.isArray(v) ? klon(v) : v;
    }
    return ziel;
  }
  function gespeicherterStand() { try { return +localStorage.getItem(SCHLUESSEL + "-stand") || 0; } catch (e) { return 0; } }
  function laden() {
    try { return mischen(klon(STANDARD), JSON.parse(localStorage.getItem(SCHLUESSEL) || "{}")); }
    catch (e) { return klon(STANDARD); }
  }
  function speichern(z) {
    try { localStorage.setItem(SCHLUESSEL, JSON.stringify(z)); localStorage.setItem(SCHLUESSEL + "-stand", String(z.stand || 0)); return true; }
    catch (e) { return false; }
  }

  /* ---------- OBS-WebSocket (v5) ---------- */
  async function sha256b64(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }
  function obsVerbindung(opt) {
    let ws = null, offen = false, nr = 0, versuche = 0, stop = false;
    const warten = new Map();   // offene Anfragen mit Antwort (Promise)
    const status = s => opt.onStatus && opt.onStatus(s);
    function verbinden() {
      if (stop) return;
      const e = opt.einstellungen ? opt.einstellungen() : (window.CAST_VERBINDUNG || {});
      status("verbinde");
      try { ws = new WebSocket(`ws://127.0.0.1:${e.port || 4455}`); }
      catch (err) { return spaeter(); }
      ws.onmessage = async ev => {
        let m; try { m = JSON.parse(ev.data); } catch (err) { return; }
        if (m.op === 0) {
          const d = { rpcVersion: 1, eventSubscriptions: opt.ereignisse || 1 };
          if (m.d.authentication) {
            const { salt, challenge } = m.d.authentication;
            if (e.passwort || !SERVER) {
              const geheim = await sha256b64((e.passwort || "") + salt);
              d.authentication = await sha256b64(geheim + challenge);
            } else {
              // App: das Passwort liegt im Schlüsselbund – der Server rechnet die Anmeldung aus, das Passwort bleibt dort
              try {
                const r = await fetch("/api/obs-anmeldung", { method: "POST", body: JSON.stringify({ salt, challenge }) });
                if (r.ok) d.authentication = (await r.json()).authentication;
              } catch (err) {}
            }
          }
          ws.send(JSON.stringify({ op: 1, d }));
        } else if (m.op === 2) {
          offen = true; versuche = 0; status("verbunden");
          opt.onOffen && opt.onOffen();
        } else if (m.op === 5 && m.d && m.d.eventType === "CustomEvent") {
          opt.onNachricht && opt.onNachricht(m.d.eventData || {});
        } else if (m.op === 5 && m.d) {
          opt.onEreignis && opt.onEreignis(m.d.eventType, m.d.eventData || {});
        } else if (m.op === 7 && m.d) {
          const r = m.d.requestStatus || {};
          const w = warten.get(m.d.requestId);
          if (w) { warten.delete(m.d.requestId); clearTimeout(w.t); r.result ? w.ok(m.d.responseData || {}) : w.nein(new Error(r.comment || ("Fehler " + r.code))); }
          opt.onAntwort && opt.onAntwort(m.d.requestType, !!r.result, r.comment || "", m.d.responseData || {});
        }
      };
      ws.onclose = ev => {
        offen = false;
        status(ev.code === 4009 ? "passwort" : "getrennt");
        spaeter();
      };
      ws.onerror = () => {};
    }
    function spaeter() { if (!stop) setTimeout(verbinden, Math.min(15000, 1500 * (++versuche))); }
    function anfrage(typ, daten) {
      if (!offen || !ws) return false;
      ws.send(JSON.stringify({ op: 6, d: { requestType: typ, requestId: "cast" + (++nr), requestData: daten || {} } }));
      return true;
    }
    // Anfrage mit Antwort: frage("GetSceneList").then(daten => …)
    function frage(typ, daten) {
      return new Promise((ok, nein) => {
        if (!offen || !ws) return nein(new Error("OBS nicht verbunden"));
        const id = "cast" + (++nr);
        const t = setTimeout(() => { warten.delete(id); nein(new Error("Keine Antwort von OBS")); }, 6000);
        warten.set(id, { ok, nein, t });
        ws.send(JSON.stringify({ op: 6, d: { requestType: typ, requestId: id, requestData: daten || {} } }));
      });
    }
    // an andere WebSocket-Clients (z. B. zweite Steuerseite)
    function senden(daten) { return anfrage("BroadcastCustomEvent", { eventData: daten }); }
    // direkt in alle Browserquellen von OBS (obs-browser) – Overlays brauchen dafür KEIN Passwort
    function anBrowserquellen(name, daten) {
      return anfrage("CallVendorRequest", { vendorName: "obs-browser", requestType: "emit_event", requestData: { event_name: name, event_data: daten } });
    }
    function neu() { stop = false; versuche = 0; try { ws && ws.close(); } catch (e) {} }
    verbinden();
    return { senden, anfrage, frage, anBrowserquellen, neu, get offen() { return offen; } };
  }

  /* ---------- Kanal: alle Wege zusammen ---------- */
  function kanal(opt) {
    // In der App bekommen Overlays ihren Stand ausschließlich über die Live-Verbindung zur App.
    // Andere Wege (andere Tabs, OBS-Docks, gespeicherte Stände) können dann nichts mehr dazwischenfunken.
    const nurServer = SERVER && opt.nurServer;
    const bc = !nurServer && "BroadcastChannel" in window ? new BroadcastChannel("cast-overlay") : null;
    const empfangen = d => {
      if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { return; } }
      if (d && d.cast) opt.onNachricht && opt.onNachricht(d);
    };
    if (bc) bc.onmessage = ev => empfangen(ev.data);
    // Nachrichten, die OBS über obs-browser direkt in die Browserquelle schickt
    if (!nurServer) addEventListener("cast-zustand", ev => empfangen(ev.detail));
    const obs = opt.obs ? obsVerbindung({
      einstellungen: opt.einstellungen,
      onStatus: opt.onStatus,
      onOffen: opt.onOffen,
      onAntwort: opt.onAntwort,
      onEreignis: opt.onEreignis,
      ereignisse: opt.ereignisse,
      onClients: opt.onClients,
      onNachricht: empfangen
    }) : null;
    if (!nurServer) addEventListener("storage", ev => { if (ev.key === SCHLUESSEL && opt.onSpeicher) opt.onSpeicher(); });

    // App: Änderungen kommen sofort per Live-Verbindung (Server-Sent Events)
    if (SERVER && (opt.abfragen || opt.onClients)) {
      const seite = opt.seite || document.body.dataset.szene || "seite";
      const es = new EventSource("/api/ereignisse?seite=" + encodeURIComponent(seite) + "&v=" + VERSION);
      // App wurde aktualisiert: Seite neu laden (höchstens 3× pro Minute, falls etwas klemmt)
      es.addEventListener("neuladen", () => {
        try {
          const jetzt = Date.now(), n = JSON.parse(sessionStorage.getItem("cast-neuladen") || "[]").filter(t => jetzt - t < 60000);
          if (n.length >= 3) return;
          n.push(jetzt); sessionStorage.setItem("cast-neuladen", JSON.stringify(n));
        } catch (e) {}
        window.__neuLaden = true; location.reload();
      });
      es.addEventListener("zustand", ev => { try { const z = JSON.parse(ev.data); opt.onNachricht && opt.onNachricht({ cast: "zustand", z }); } catch (e) {} });
      es.addEventListener("live", ev => { try { opt.onLive && opt.onLive(JSON.parse(ev.data)); } catch (e) {} });
      es.addEventListener("status", ev => { try { opt.onClients && opt.onClients(JSON.parse(ev.data).clients || []); } catch (e) {} });
      es.onopen = () => opt.onDienst && opt.onDienst(true);
      es.onerror = () => opt.onDienst && opt.onDienst(false);
    }
    const dienstSenden = d => {
      if (!SERVER) return;
      if (d.cast === "zustand") fetch("/api/zustand", { method: "POST", body: JSON.stringify(d.z) }).catch(() => {});
      if (d.cast === "bilder") Object.entries(d.bilder || {}).forEach(([id, v]) => fetch("/api/bild/" + id, { method: "POST", body: v }).catch(() => {}));
    };
    return {
      senden(d) {
        if (bc) bc.postMessage(d);
        dienstSenden(d);
        // über den Dienst holen sich die Overlays den Stand selbst – OBS-Umweg nur ohne Dienst
        if (obs && !SERVER) { obs.anBrowserquellen("cast-zustand", d); obs.senden(d); }
      },
      obs
    };
  }

  /* ---------- Timer ---------- */
  function timerRest(t) {
    if (!t) return 0;
    return t.laeuft ? Math.max(0, t.ziel - Date.now()) : Math.max(0, t.rest || 0);
  }
  function zeit(ms) {
    const s = Math.ceil(ms / 1000), m = Math.floor(s / 60), r = s % 60;
    const h = Math.floor(m / 60);
    const p = n => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${p(m % 60)}:${p(r)}` : `${p(m)}:${p(r)}`;
  }

  /* ---------- Große Bilder getrennt übertragen ----------
     Logos, Spielerbilder usw. (data:-Adressen) werden aus dem Zustand herausgelöst,
     einmal übertragen und in jedem Browser in einer Datenbank gemerkt.
     So bleibt der Zustand klein – der Speicher läuft nicht über und OBS bekommt jede Änderung. */
  function bildId(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i += 5) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(36) + s.length.toString(36);
  }
  function zerlegen(z) {
    const bilder = {};
    const klein = JSON.parse(JSON.stringify(z), (schl, v) => {
      if (typeof v === "string" && v.length > 2000 && v.startsWith("data:")) { const id = bildId(v); bilder[id] = v; return "asset:" + id; }
      return v;
    });
    return { klein, bilder };
  }
  function aufloesen(z, bilder) {
    // Über den Cast-Dienst lädt der Browser fehlende Bilder direkt von /api/bild/…
    return JSON.parse(JSON.stringify(z), (schl, v) => (typeof v === "string" && v.startsWith("asset:"))
      ? (bilder[v.slice(6)] || (SERVER ? "/api/bild/" + v.slice(6) : "")) : v);
  }
  const Bilder = (() => {
    const mem = {};
    let db = null;
    const oeffnen = () => db ? Promise.resolve(db) : new Promise(ok => {
      try {
        const r = indexedDB.open("cast-bilder", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("b");
        r.onsuccess = () => ok(db = r.result); r.onerror = () => ok(null);
      } catch (e) { ok(null); }
    });
    return {
      mem,
      async laden() {
        const d = await oeffnen(); if (!d) return mem;
        await new Promise(ok => {
          try {
            const r = d.transaction("b").objectStore("b").openCursor();
            r.onsuccess = () => { const c = r.result; if (c) { mem[c.key] = c.value; c.continue(); } else ok(); };
            r.onerror = () => ok();
          } catch (e) { ok(); }
        });
        return mem;
      },
      async setzen(neu) {
        Object.assign(mem, neu);
        const d = await oeffnen(); if (!d) return;
        await new Promise(ok => {
          try { const t = d.transaction("b", "readwrite"), s = t.objectStore("b"); for (const [id, v] of Object.entries(neu)) s.put(v, id); t.oncomplete = ok; t.onerror = ok; }
          catch (e) { ok(); }
        });
      },
      async aufraeumen(behalten) {
        const d = await oeffnen(); if (!d) return;
        Object.keys(mem).forEach(id => { if (!behalten.has(id)) delete mem[id]; });
        try { const t = d.transaction("b", "readwrite"), s = t.objectStore("b"), r = s.openCursor();
          r.onsuccess = () => { const c = r.result; if (c) { if (!behalten.has(c.key)) c.delete(); c.continue(); } }; } catch (e) {}
      }
    };
  })();

  // Adresse sicher in CSS url("…") einsetzen
  function cssUrl(u) { return `url("${String(u || "").replace(/["\\\n\r]/g, c => "\\" + c.charCodeAt(0).toString(16) + " ")}")`; }


  /* ---------- Turnierbaum: Single/Double Elimination, Swiss, GSL-Gruppen ----------
     Teilnehmer je Spiel: Team-ID, null (steht noch nicht fest) oder "BYE" (Freilos). */
  function setzOrdnung(P) { let o = [1]; while (o.length < P) { const n = o.length * 2; o = o.flatMap(x => [x, n + 1 - x]); } return o; }
  function turnierAufbauen(T) {
    T = T || {}; const teams = (T.teams || []).filter(t => t && t.id), erg = T.erg || {}, M = {};
    const neu = (id, a, b, qa, qb) => (M[id] = { id, a, b, qa, qb });
    const wer = q => !q ? null : q.team !== undefined ? q.team : (M[q.id] || {})[q.art] ?? null;
    function aufloesen(m) {
      if (m.qa) m.a = wer(m.qa); if (m.qb) m.b = wer(m.qb);
      const e = erg[m.id] || {}; m.sa = e.a; m.sb = e.b; m.fertig = !!e.fertig; m.sieger = m.verlierer = null;
      if (m.a === "BYE" && m.b === "BYE") m.sieger = m.verlierer = "BYE";
      else if (m.a === "BYE" && m.b) { m.sieger = m.b; m.verlierer = "BYE"; }
      else if (m.b === "BYE" && m.a) { m.sieger = m.a; m.verlierer = "BYE"; }
      else if (m.a && m.b && m.fertig && +m.sa === +m.sb) m.unentschieden = true;
      else if (m.a && m.b && m.fertig && +m.sa !== +m.sb) { const aGew = +m.sa > +m.sb; m.sieger = aGew ? m.a : m.b; m.verlierer = aGew ? m.b : m.a; }
      return m;
    }
    const titel = (rest, oben) => rest === 1 ? (oben ? "OBEN-FINALE" : "FINALE") : rest === 2 ? "HALBFINALE" : rest === 3 ? "VIERTELFINALE" : rest === 4 ? "ACHTELFINALE" : "";
    const ergebnis = { format: T.format || "se", runden: [], unten: [], finale: null, gruppen: [], tabelle: [], teams };
    if (teams.length < 2) return ergebnis;
    const fmt = T.format || "se";
    if (fmt === "se" || fmt === "de") {
      const P = Math.pow(2, Math.ceil(Math.log2(teams.length))), k = Math.log2(P), ord = setzOrdnung(P), pre = fmt === "de" ? "O" : "W";
      const setz = s => s <= teams.length ? teams[s - 1].id : "BYE";
      for (let r = 1; r <= k; r++) {
        const runde = { titel: (fmt === "de" && r === k) ? "OBEN-FINALE" : titel(k - r + 1, false) || "RUNDE " + r, matches: [] };
        for (let i = 0; i < P / Math.pow(2, r); i++) {
          const m = r === 1 ? neu(`${pre}1-${i + 1}`, null, null, { team: setz(ord[2 * i]) }, { team: setz(ord[2 * i + 1]) })
                            : neu(`${pre}${r}-${i + 1}`, null, null, { id: `${pre}${r - 1}-${2 * i + 1}`, art: "sieger" }, { id: `${pre}${r - 1}-${2 * i + 2}`, art: "sieger" });
          runde.matches.push(aufloesen(m));
        }
        if (fmt === "de" && r < k) runde.titel = "OBEN R" + r;
        ergebnis.runden.push(runde);
      }
      if (fmt === "de" && k >= 2) {
        const anzahl = j => P / Math.pow(2, Math.ceil(j / 2) + 1), J = 2 * (k - 1);
        for (let j = 1; j <= J; j++) {
          const runde = { titel: j === J ? "UNTEN-FINALE" : "UNTEN R" + j, matches: [] }, n = anzahl(j);
          for (let i = 0; i < n; i++) {
            let qa, qb;
            if (j === 1) { qa = { id: `O1-${2 * i + 1}`, art: "verlierer" }; qb = { id: `O1-${2 * i + 2}`, art: "verlierer" }; }
            else if (j % 2 === 0) { qa = { id: `U${j - 1}-${i + 1}`, art: "sieger" }; qb = { id: `O${j / 2 + 1}-${n - i}`, art: "verlierer" }; }   // gespiegelt: weniger Wiederholungen
            else { qa = { id: `U${j - 1}-${2 * i + 1}`, art: "sieger" }; qb = { id: `U${j - 1}-${2 * i + 2}`, art: "sieger" }; }
            runde.matches.push(aufloesen(neu(`U${j}-${i + 1}`, null, null, qa, qb)));
          }
          ergebnis.unten.push(runde);
        }
        ergebnis.finale = aufloesen(neu("GF", null, null, { id: `O${k}-1`, art: "sieger" }, { id: `U${J}-1`, art: "sieger" }));
      }
    }
    if (fmt === "gsl") {
      const G = Math.ceil(teams.length / 4), gruppen = Array.from({ length: G }, () => []);
      teams.forEach((t, i) => { const reihe = Math.floor(i / G), pos = i % G; gruppen[reihe % 2 ? G - 1 - pos : pos].push(t.id); });   // Schlangen-Setzung
      gruppen.forEach((g, gi) => {
        const n = String.fromCharCode(65 + gi), t = i => g[i] || "BYE", p = id => `G${n}-${id}`;
        const ms = [
          aufloesen(neu(p(1), null, null, { team: t(0) }, { team: t(3) })), aufloesen(neu(p(2), null, null, { team: t(1) }, { team: t(2) })),
          aufloesen(neu(p(3), null, null, { id: p(1), art: "sieger" }, { id: p(2), art: "sieger" })),
          aufloesen(neu(p(4), null, null, { id: p(1), art: "verlierer" }, { id: p(2), art: "verlierer" })),
          aufloesen(neu(p(5), null, null, { id: p(3), art: "verlierer" }, { id: p(4), art: "sieger" }))
        ];
        ["ERÖFFNUNG", "ERÖFFNUNG", "GEWINNER", "AUSSCHEIDUNG", "ENTSCHEIDUNG"].forEach((x, i) => { ms[i].titel = x; });
        ergebnis.gruppen.push({ name: "GRUPPE " + n, matches: ms, weiter: [ms[2].sieger, ms[4].sieger] });
      });
    }
    // Gruppen mit Tabelle (jeder gegen jeden) – Spiele selbst erzeugt oder exakt aus FACEIT übernommen
    if (fmt === "tabelle") {
      const G = Math.max(1, Math.min(8, +T.gruppenAnzahl || 1)), gruppen = Array.from({ length: G }, () => []);
      teams.forEach((t, i) => {
        let g = t.gruppe !== undefined && t.gruppe !== "" && t.gruppe !== null ? (+t.gruppe % G) : null;
        if (g === null) { const reihe = Math.floor(i / G), pos = i % G; g = reihe % 2 ? G - 1 - pos : pos; }
        gruppen[g].push(t.id);
      });
      const jederGegenJeden = ids => { const l = ids.length % 2 ? [...ids, "BYE"] : ids.slice(), n = l.length, p = [];
        for (let r = 0; r < n - 1; r++) { for (let i = 0; i < n / 2; i++) { const a = l[i], b = l[n - 1 - i]; if (a !== "BYE" && b !== "BYE") p.push({ runde: r + 1, a, b }); } l.splice(1, 0, l.pop()); }
        return p; };
      const spiele = (T.spiele && T.spiele.length) ? T.spiele : gruppen.flatMap((g, gi) => jederGegenJeden(g).map((x, i) => ({ id: `R${gi + 1}-${i + 1}`, gruppe: gi, runde: x.runde, a: x.a, b: x.b })));
      gruppen.forEach((ids, gi) => {
        const ms = spiele.filter(x => (+x.gruppe || 0) === gi).map(x => Object.assign(aufloesen(neu(x.id, null, null, { team: x.a }, { team: x.b })), { runde: x.runde, titel: x.runde ? "RUNDE " + x.runde : "" }));
        // Punkte je Turnier einstellbar: Sieg ohne/mit Map-Verlust, Niederlage mit/ohne Map-Gewinn, Unentschieden
        const P = Object.assign({ sieg: 3, siegKnapp: 3, niederlageKnapp: 1, niederlage: 0, unentschieden: 1 }, T.punkte || {});
        const punkteFuer = (eigen, gegner) => eigen > gegner ? (gegner > 0 ? P.siegKnapp : P.sieg) : eigen < gegner ? (eigen > 0 ? P.niederlageKnapp : P.niederlage) : P.unentschieden;
        const zeile = {}; ids.forEach(id => { zeile[id] = { id, sp: 0, s: 0, n: 0, u: 0, diff: 0, rd: 0, pkt: 0 }; });
        let mitRunden = false;
        ms.forEach(m => {
          if (!m.fertig || !zeile[m.a] || !zeile[m.b]) return;
          const a = zeile[m.a], b = zeile[m.b], sa = +m.sa || 0, sb = +m.sb || 0, e = erg[m.id] || {};
          a.sp++; b.sp++; a.diff += sa - sb; b.diff += sb - sa;
          if (e.rdA !== undefined && e.rdB !== undefined) { mitRunden = true; a.rd += e.rdA - e.rdB; b.rd += e.rdB - e.rdA; }
          a.pkt += punkteFuer(sa, sb); b.pkt += punkteFuer(sb, sa);
          if (sa === sb) { a.u++; b.u++; } else if (sa > sb) { a.s++; b.n++; } else { b.s++; a.n++; }
        });
        // Reihenfolge: Punkte → direkter Vergleich (Punkte untereinander) → Rundendifferenz (sonst Map-Differenz) → Siege
        const direkt = (gruppe) => {
          const pkt = {}; gruppe.forEach(r => { pkt[r.id] = 0; });
          ms.forEach(m => { if (m.fertig && m.a in pkt && m.b in pkt) { pkt[m.a] += punkteFuer(+m.sa || 0, +m.sb || 0); pkt[m.b] += punkteFuer(+m.sb || 0, +m.sa || 0); } });
          return pkt;
        };
        const tabelle = Object.values(zeile);
        const nachPunkten = {}; tabelle.forEach(r => { (nachPunkten[r.pkt] = nachPunkten[r.pkt] || []).push(r); });
        Object.values(nachPunkten).forEach(g => { if (g.length > 1) { const d = direkt(g); g.forEach(r => { r.dv = d[r.id]; }); } else g[0].dv = 0; });
        tabelle.forEach(r => { r.tb = mitRunden ? r.rd : r.diff; });
        tabelle.sort((x, y) => y.pkt - x.pkt || y.dv - x.dv || y.tb - x.tb || y.s - x.s);
        ergebnis.gruppen.push({ name: G > 1 ? "GRUPPE " + String.fromCharCode(65 + gi) : "TABELLE", matches: ms, tabelle, mitRunden });
      });
    }
    // Baum genau so, wie FACEIT ihn liefert (Runden als Spalten, negative Runden = unterer Baum)
    if (fmt === "import") {
      const runden = {};
      (T.spiele || []).forEach(x => { (runden[x.runde] = runden[x.runde] || []).push(x); });
      const nummern = Object.keys(runden).map(Number);
      const oben = nummern.filter(r => r >= 0).sort((a, b) => a - b), unten = nummern.filter(r => r < 0).sort((a, b) => b - a);
      const spalte = (r, titel) => ({ titel, matches: runden[r].map(x => aufloesen(neu(x.id, null, null, { team: x.a || null }, { team: x.b || null }))) });
      oben.forEach((r, i) => ergebnis.runden.push(spalte(r, titel(oben.length - i, false) || "RUNDE " + r)));
      unten.forEach((r, i) => ergebnis.unten.push(spalte(r, i === unten.length - 1 ? "UNTEN-FINALE" : "UNTEN R" + (i + 1))));
    }
    if (fmt === "swiss") {
      const S = T.swiss || {}, bilanz = {};
      teams.forEach(t => { bilanz[t.id] = { id: t.id, s: 0, n: 0, gegner: [] }; });
      (S.runden || []).forEach((runde, ri) => {
        const r = { titel: "RUNDE " + (ri + 1), matches: [] };
        runde.forEach(x => {
          const m = aufloesen(neu(x.id, null, null, { team: x.a }, { team: x.b }));
          // Bilanz VOR dem Spiel für die Anzeige („1–0“-Gruppe)
          m.bilanz = bilanz[x.a] ? `${bilanz[x.a].s}–${bilanz[x.a].n}` : "";
          if (m.sieger && m.sieger !== "BYE" && bilanz[m.sieger]) bilanz[m.sieger].s++;
          if (m.verlierer && m.verlierer !== "BYE" && bilanz[m.verlierer]) bilanz[m.verlierer].n++;
          [x.a, x.b].forEach((t, i) => { if (bilanz[t]) bilanz[t].gegner.push(i ? x.a : x.b); });
          r.matches.push(m);
        });
        r.matches.sort((x, y) => String(y.bilanz).localeCompare(String(x.bilanz)));
        ergebnis.runden.push(r);
      });
      ergebnis.tabelle = Object.values(bilanz).map(b => Object.assign(b, {
        status: b.s >= (S.siege || 3) ? "weiter" : b.n >= (S.niederlagen || 3) ? "raus" : "" })).sort((a, b) => (b.s - b.n) - (a.s - a.n));
    }
    return ergebnis;
  }
  // Swiss: nächste Runde auslosen (gleiche Bilanz gegeneinander, keine Wiederholungen, Freilos bei ungerader Zahl)
  function swissAuslosen(T) {
    const B = turnierAufbauen(Object.assign({}, T, { format: "swiss" }));
    const S = T.swiss || {}, nr = (S.runden || []).length + 1;
    const aktiv = B.tabelle.filter(b => !b.status).map(b => Object.assign({}, b, { seed: T.teams.findIndex(t => t.id === b.id) }));
    if (nr === 1) { const h = Math.ceil(aktiv.length / 2); aktiv.sort((a, b) => a.seed - b.seed); }
    else aktiv.sort((a, b) => (b.s - b.n) - (a.s - a.n) || a.seed - b.seed);
    const offen = aktiv.slice(), runde = [];
    if (nr === 1) { const h = Math.floor(offen.length / 2); for (let i = 0; i < h; i++) runde.push([offen[i].id, offen[i + h].id]); if (offen.length % 2) runde.push([offen[offen.length - 1].id, "BYE"]); }
    else {
      while (offen.length) {
        const a = offen.shift();
        let j = offen.findIndex(b => b.s === a.s && b.n === a.n && !a.gegner.includes(b.id));
        if (j < 0) j = offen.findIndex(b => !a.gegner.includes(b.id));
        if (j < 0) j = offen.length ? 0 : -1;
        if (j < 0) { runde.push([a.id, "BYE"]); break; }
        runde.push([a.id, offen.splice(j, 1)[0].id]);
      }
    }
    return runde.map(([a, b], i) => ({ id: `S${nr}-${i + 1}`, a, b }));
  }

  /* ---------- DACH CS – Offiziell: Seiten und Kamera-Rahmen (1920 × 1080) ---------- */
  const DACH_SEITEN = {
    "dach-overview": "overview", "dach-singlecast": "singlecast", "dach-duocast": "duocast", "dach-lineup": "lineup", "dach-mapveto": "mapveto",
    "dach-ingame": "ingame", "dach-positions": "positions", "dach-tabelle": "tabelle", "dach-playoffs": "playoffs", "dach-last": "last_matches",
    "dach-current": "current_matches", "dach-next": "next_matches", "dach-last-a": "last_matches_f1", "dach-last-b": "last_matches_f2",
    "dach-next-a": "next_matches_f1", "dach-next-b": "next_matches_f2", "dach-mvp": "mvp", "dach-pause": "pause", "dach-content": "pause_content",
    "dach-owncontent": "pause_own_content", "dach-inter1": "singleinteraction", "dach-inter2": "duointeraction",
    "dach-interview1": "solo_interview", "dach-interview2": "duointerview", "dach-ende": "endscreen"
  };
  // Wo Kameras (c1, c2, gast) und Inhalt (inhalt) sitzen – Singlecam aus dem echten Layout gemessen, der Rest Startwerte zum Anpassen
  const DACH_RAHMEN = {
    singlecast: { c1: { x: 512, y: 37, w: 910, h: 690 } },
    duocast: { c1: { x: 100, y: 120, w: 840, h: 630 }, c2: { x: 980, y: 120, w: 840, h: 630 } },
    singleinteraction: { inhalt: { x: 60, y: 60, w: 1280, h: 720 }, c1: { x: 1370, y: 60, w: 490, h: 368 } },
    duointeraction: { inhalt: { x: 60, y: 60, w: 1280, h: 720 }, c1: { x: 1370, y: 60, w: 490, h: 368 }, c2: { x: 1370, y: 448, w: 490, h: 368 } },
    solo_interview: { c1: { x: 100, y: 120, w: 840, h: 630 }, gast: { x: 980, y: 120, w: 840, h: 630 } },
    duointerview: { c1: { x: 60, y: 140, w: 580, h: 435 }, c2: { x: 670, y: 140, w: 580, h: 435 }, gast: { x: 1280, y: 140, w: 580, h: 435 } }
  };
  function dachRahmen(Z, seite) {
    const eigen = ((Z || {}).dachRahmen || {})[seite] || {};
    const std = DACH_RAHMEN[seite] || {};
    const r = {}; Object.keys(std).forEach(k => { r[k] = Object.assign({}, std[k], eigen[k] || {}); });
    return r;
  }

  // Einblendung sichtbar?  an · Dauer (bis) · nur in bestimmten Szenen · Wiederholung (alle X min für Y s)
  function ebSichtbar(e, jetzt, szene) {
    if (!e || !e.an) return false;
    if (e.bis && e.bis <= jetzt) return false;
    if ((e.szenen || []).length && !e.szenen.includes(szene)) return false;
    if (e.wiederholen > 0 && e.dauer > 0 && e.start) return (jetzt - e.start) % (e.wiederholen * 60000) < e.dauer * 1000;
    return true;
  }
  // Zeitpunkt, an dem sich die Sichtbarkeit das nächste Mal ändert (0 = nie von selbst)
  function ebNaechsterWechsel(e, jetzt) {
    if (!e || !e.an) return 0;
    if (e.wiederholen > 0 && e.dauer > 0 && e.start) {
      const W = e.wiederholen * 60000, D = e.dauer * 1000, t = (jetzt - e.start) % W;
      return jetzt + (t < D ? D - t : W - t);
    }
    return e.bis && e.bis > jetzt ? e.bis : 0;
  }

  return { VERSION, SERVER, zerlegen, ebSichtbar, ebNaechsterWechsel, DACH_SEITEN, DACH_RAHMEN, dachRahmen, turnierAufbauen, swissAuslosen, aufloesen, Bilder, cssUrl, STANDARD, SCHLUESSEL, klon, mischen, laden, speichern, gespeicherterStand, kanal, timerRest, zeit };
})();
