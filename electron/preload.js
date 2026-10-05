/* =====================================================================
   CASTING-APP – Preload für das App-Fenster
   Läuft in JEDEM Rahmen des Fensters (Steuerseite, Vorschau, VDO.Ninja, Clips, DACH-CS-Seiten).

   1) Nur in der Steuerseite selbst (oberster Rahmen, eigene Adresse): kleine Brücke „window.castApp“
      für Schließen-Dialog, Ton im App-Fenster und „Overlays neu laden“ aus dem Tray.
      Fremde Seiten bekommen keine Brücke.
   2) In allen Rahmen: Lautstärke für „Ton im App-Fenster“. Electron kann ein Fenster nur ganz stumm
      schalten (das macht der Hauptprozess), aber keine Lautstärke setzen. Darum wird hier in jeder Seite
      die Lautstärke aller Video-/Audio-Elemente und aller Web-Audio-Ausgaben mit einem Faktor
      (0 … 1) multipliziert. Die Seite selbst sieht weiter ihre eigenen Werte (z. B. VDO.Ninja,
      YouTube- oder Twitch-Player) – die App skaliert nur, was am Ende hörbar ist.
   ===================================================================== */
"use strict";
const { contextBridge, ipcRenderer, webFrame } = require("electron");

const EIGEN = ["http://localhost:8787", "http://127.0.0.1:8787"].includes(location.origin);
let oben = false;
try { oben = window.top === window; } catch (e) {}

/* ---------- 1) Brücke für die Steuerseite ---------- */
if (oben && EIGEN) {
  let schliessenRuf = null, neuladenRuf = null;
  ipcRenderer.on("schliessen-fragen", (ev, nr) => {
    if (!schliessenRuf) return;                         // Seite noch nicht so weit: der Hauptprozess fragt dann selbst
    ipcRenderer.send("schliessen-frage-offen", nr);
    try { schliessenRuf(); } catch (e) {}
  });
  ipcRenderer.on("overlays-neu-laden", async (ev, nr) => {
    let perObs = false;
    try { perObs = neuladenRuf ? !!(await neuladenRuf()) : false; } catch (e) {}
    ipcRenderer.send("overlays-neu-geladen", nr, perObs);
  });
  contextBridge.exposeInMainWorld("castApp", {
    desktop: true,
    // Dialog „Casting-App schließen?“ – die Seite meldet ihre Wahl mit schliessenAntwort()
    beiSchliessen: fn => { if (typeof fn === "function") schliessenRuf = fn; },
    schliessenAntwort: wahl => ipcRenderer.send("schliessen-antwort", ["beenden", "fenster"].includes(wahl) ? wahl : ""),
    // Ton im App-Fenster: an/aus und Lautstärke 0–100
    ton: (an, vol) => ipcRenderer.send("ton", { an: an === true, vol: Number(vol) }),
    // Tray „Overlays in OBS neu laden“: true = über OBS erledigt
    beiOverlaysNeuLaden: fn => { if (typeof fn === "function") neuladenRuf = fn; }
  });
}

/* ---------- 2) Lautstärke in allen Rahmen ----------
   Diese Funktion läuft in der Welt der Seite (nicht im isolierten Preload), damit sie deren
   Video/Audio und Web Audio erreicht. Sie wird vor den Skripten der Seite ausgeführt. */
function tonEinrichten(startFaktor) {
  const K = Symbol.for("casting-app-ton");
  if (window[K]) return;
  let faktor = startFaktor;
  const M = HTMLMediaElement.prototype;
  const vol = Object.getOwnPropertyDescriptor(M, "volume");
  const wunsch = new WeakMap();                         // Lautstärke, die die Seite gesetzt hat
  const ueberWebAudio = new WeakSet();                  // Ton läuft über Web Audio → dort geregelt
  const elemente = new Set(), kontexte = new Set();     // schwache Verweise für Faktor-Änderungen
  const regler = new WeakMap();                         // Web Audio: eigener Lautstärke-Regler je Kontext
  const echt = el => ueberWebAudio.has(el) ? wunsch.get(el) : wunsch.get(el) * faktor;
  function anwenden(el) { try { vol.set.call(el, echt(el)); } catch (e) {} }
  function aufraeumen(liste) { for (const r of liste) if (!r.deref()) liste.delete(r); }
  function merken(el) {
    if (!wunsch.has(el)) {
      wunsch.set(el, vol.get.call(el));
      elemente.add(new WeakRef(el));
      if (elemente.size > 300) aufraeumen(elemente);
    }
    anwenden(el);
  }
  Object.defineProperty(M, "volume", {
    configurable: true, enumerable: vol.enumerable,
    get() { return wunsch.has(this) ? wunsch.get(this) : vol.get.call(this); },
    set(v) {
      const n = Number(v);
      if (!(n >= 0 && n <= 1)) return vol.set.call(this, v);   // ungültig: Fehler wie gewohnt
      if (!wunsch.has(this)) { elemente.add(new WeakRef(this)); if (elemente.size > 300) aufraeumen(elemente); }
      wunsch.set(this, n); anwenden(this);
    }
  });
  const play = M.play;
  M.play = function () { try { merken(this); } catch (e) {} return play.apply(this, arguments); };
  addEventListener("play", ev => { if (ev.target instanceof HTMLMediaElement) merken(ev.target); }, true);
  addEventListener("loadedmetadata", ev => { if (ev.target instanceof HTMLMediaElement) merken(ev.target); }, true);

  // Web Audio: alles, was an den Lautsprecher (destination) geht, läuft über einen eigenen Regler je Kontext
  if (window.AudioNode && window.AudioDestinationNode) {
    const verbinden = AudioNode.prototype.connect, trennen = AudioNode.prototype.disconnect;
    const offline = c => window.OfflineAudioContext && c instanceof OfflineAudioContext;
    function reglerVon(ctx) {
      let g = regler.get(ctx);
      if (!g) {
        g = ctx.createGain(); g.gain.value = faktor;
        verbinden.call(g, ctx.destination);
        regler.set(ctx, g); kontexte.add(new WeakRef(ctx));
        if (kontexte.size > 100) aufraeumen(kontexte);
      }
      return g;
    }
    AudioNode.prototype.connect = function (ziel, ...rest) {
      if (ziel instanceof AudioDestinationNode && !offline(ziel.context)) { verbinden.call(this, reglerVon(ziel.context), ...rest); return ziel; }
      return verbinden.call(this, ziel, ...rest);
    };
    AudioNode.prototype.disconnect = function (ziel, ...rest) {
      if (ziel instanceof AudioDestinationNode && regler.has(ziel.context)) return trennen.call(this, regler.get(ziel.context), ...rest);
      return trennen.apply(this, arguments);
    };
    if (window.AudioContext && AudioContext.prototype.createMediaElementSource) {
      const quelle = AudioContext.prototype.createMediaElementSource;
      AudioContext.prototype.createMediaElementSource = function (el) {
        const n = quelle.call(this, el);
        try { ueberWebAudio.add(el); if (!wunsch.has(el)) merken(el); else anwenden(el); } catch (e) {}
        return n;
      };
    }
  }
  // Faktor setzen (vom Preload); .pruefen() zeigt für Tests, was wirklich eingestellt ist
  const setzen = f => {
    faktor = f;
    aufraeumen(elemente); aufraeumen(kontexte);
    for (const r of elemente) { const el = r.deref(); if (el) anwenden(el); }
    for (const r of kontexte) { const c = r.deref(); const g = c && regler.get(c); if (g) g.gain.value = f; }
  };
  setzen.pruefen = (el, ctx) => ({ faktor, echt: el ? vol.get.call(el) : null, regler: ctx && regler.has(ctx) ? regler.get(ctx).gain.value : null });
  Object.defineProperty(window, K, { value: setzen });
}
function faktorSetzen(f) {
  const code = `(function(){ var s = window[Symbol.for("casting-app-ton")]; if (s) s(${f}); })()`;
  if (contextBridge.executeInMainWorld) {
    try { contextBridge.executeInMainWorld({ func: g => { const s = window[Symbol.for("casting-app-ton")]; if (s) s(g); }, args: [f] }); return; } catch (e) {}
  }
  webFrame.executeJavaScript(code).catch(() => {});
}
const zahl = f => { const n = Number(f); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1; };

// Startwert: der zuletzt gewählte Faktor (bis zur Antwort: unverändert = 1)
try {
  if (contextBridge.executeInMainWorld) contextBridge.executeInMainWorld({ func: tonEinrichten, args: [1] });
  else webFrame.executeJavaScript(`(${tonEinrichten.toString()})(1)`).catch(() => {});
} catch (e) {}
ipcRenderer.invoke("ton-faktor-holen").then(f => faktorSetzen(zahl(f))).catch(() => {});
ipcRenderer.on("ton-faktor", (ev, f) => faktorSetzen(zahl(f)));
