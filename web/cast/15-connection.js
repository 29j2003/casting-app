/* cast/15-connection.js · Verbindung zur Steuerseite (SSE, Vorschau-Nachrichten), OBS-Bildtakt, Start (Teil von cast.js, siehe cast/01-base.js) */
/* ---------- Verbindung ---------- */
function imagesCleanup(z) {
  const used = new Set((JSON.stringify(z).match(/asset:[a-z0-9]+/g) || []).map(x => x.slice(6)));
  Object.keys(K.Images.mem).forEach(id => {
    if (!used.has(id)) delete K.Images.mem[id];
  });
}
function adopt(z, originPage) {
  if (!z || (z.revision || 0) < (Z.revision || 0)) return;
  imagesCleanup(z);
  receivedFrom = originPage || "Steuerseite";
  receivedAt = Date.now();
  rawState = K.merge(K.clone(K.DEFAULT), z);
  Z = K.resolve(rawState, K.Images.mem);
  K.save(rawState);
  draw();
}
// Bilder kamen dazu -> alles mit den echten Bildern neu zeichnen
function newDraw() {
  Z = K.resolve(rawState, K.Images.mem);
  $$(".cam[data-source]").forEach(k => {
    if (k._source && /asset:|data:/.test(k._source)) k._source = null;
  });
  draw();
}
// Meldungen der Overlays landen im Log der App (Reiter „Log") – z. B. Video-Probleme in OBS
const reported = {};
function message(text) {
  const now = Date.now();
  if (reported[text] && now - reported[text] < 30000) return;
  reported[text] = now;
  const reportedKeys = Object.keys(reported);
  if (reportedKeys.length > 50) reportedKeys.slice(0, 25).forEach(k => delete reported[k]);
  if (K.SERVER && !PREVIEW)
    fetch("/api/report", {
      method: "POST",
      body: JSON.stringify({
        page: currentSceneName() + (/OBS\//.test(navigator.userAgent) ? " (OBS)" : ""),
        text: String(text).slice(0, 300),
      }),
    }).catch(() => {});
}
if (PREVIEW) document.documentElement.style.background = "#0b0c10";
window.CastOverlay = {
  newDraw,
  message,
  corners: cornersSet,
  get Z() {
    return Z;
  },
};

/* ---------- OBS: Bildtakt ----------
   Die Browserquelle in OBS übernimmt Änderungen, die nur „im Hintergrund" passieren (laufendes Video,
   durchlaufender Lauftext), nicht zuverlässig in die Aufnahme – dann zeigt OBS ein altes Bild
   (z. B. den Theme-Hintergrund vom Seitenstart) statt des Videos. Eine winzige, unsichtbare Änderung
   in jedem Bild zwingt OBS, jedes Bild frisch zu übernehmen. Läuft nur in OBS und nur, wenn die Quelle aktiv ist. */
if (IN_OBS && !EMBEDDED && !PREVIEW) {
  const timerHandle = document.createElement("div");
  timerHandle.className = "obs-timer";
  timerHandle.setAttribute("aria-hidden", "true");
  document.body.appendChild(timerHandle);
  let n = 0,
    running = true;
  const step = () => {
    if (!running) return;
    timerHandle.style.backgroundColor = n++ & 1 ? "rgba(0,0,0,.004)" : "rgba(0,0,0,.006)";
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  addEventListener("obsSourceActiveChanged", ev => {
    const on = !!(ev.detail && ev.detail.active);
    if (on && !running) {
      running = true;
      requestAnimationFrame(step);
    }
    if (!on) running = false;
  });
  window.__obsTimer = () => running;
  // Zustandsbericht alle 30 s ins Log der App: läuft das Video wirklich? Wie viel Speicher braucht die Seite?
  try {
    const n = +(sessionStorage.getItem("cast-loads") || 0) + 1;
    sessionStorage.setItem("cast-loads", n);
    setTimeout(() => message(`Seite geladen (${n}. Mal in dieser OBS-Sitzung)`), 800);
  } catch (e) {}
  let lastTime = -1;
  setInterval(() => {
    const v = document.querySelector(".backdrop video.on"),
      bgEl = document.querySelector(".backdrop");
    let text;
    if (bgEl && bgEl.classList.contains("obs-video")) text = "Hintergrund: OBS spielt ab";
    else if (!v) text = "Hintergrund: kein Video aktiv (Theme-Hintergrund)";
    else {
      const q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
      const runningV = v.currentTime !== lastTime && !v.paused;
      lastTime = v.currentTime;
      text = `Video ${runningV ? "läuft" : "STEHT"} (${Math.round(v.currentTime)} s, ${v.videoWidth}×${v.videoHeight}${q ? ", verworfen " + q.droppedVideoFrames + "/" + q.totalVideoFrames : ""})`;
    }
    const mem = performance.memory ? ` · Speicher ${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB` : "";
    message(`Bericht: ${text}${mem} · Szene ${currentSceneName()}`);
  }, 30000);
  setTimeout(() => message("OBS erkannt – Bildtakt aktiv (hält Video und Lauftext in der Aufnahme aktuell)"), 1500);
}

if (!EMBEDDED && !PREVIEW)
  K.channel({
    // Vorschau & eingebettete Szenen bekommen den Stand direkt
    query: true,
    onlyServer: true,
    onLive(d) {
      liveData = d;
      liveDraw();
    }, // CS2-Livedaten vom Server (Ereignis „live“)
    obs: false, // Overlays verbinden sich nicht selbst – die Steuerseite schickt über OBS direkt hierher
    onMessage(d) {
      if (d.cast === "images" && d.images) K.Images.set(d.images).then(newDraw);
      if (d.cast === "state") adopt(d.z, "Steuerseite");
    },
    onStorage() {
      const n = K.load();
      if ((n.revision || 0) > (Z.revision || 0)) {
        rawState = n;
        Z = K.resolve(n, K.Images.mem);
        draw();
      }
    },
  });
if (!K.SERVER && "BroadcastChannel" in window) new BroadcastChannel("cast-overlay").postMessage({ cast: "request" });
// Sicherheitsnetz ohne App: gespeicherten Stand regelmäßig prüfen (gleicher Browser, andere Tabs)
if (!K.SERVER || PREVIEW)
  setInterval(() => {
    if (K.savedRevision() > (Z.revision || 0)) {
      const n = K.load();
      if ((n.revision || 0) > (Z.revision || 0)) {
        rawState = n;
        K.Images.load().then(newDraw);
      }
    }
  }, 1000);
// Vorschau in der Steuerseite (iframe) bekommt den Zustand direkt
addEventListener("message", ev => {
  if (window.parent === window || ev.source !== window.parent) return; // nur die Vorschau der Steuerseite
  const d = ev.data;
  if (d && d.cast === "show") {
    document.body.classList.remove("waiting");
    return;
  }
  if (d && d.cast === "state" && d.z) {
    Z = rawState = K.merge(K.clone(K.DEFAULT), d.z);
    receivedFrom = "Vorschau der Steuerseite";
    receivedAt = Date.now();
    draw();
  }
  if (d && d.cast === "live") {
    liveData = d.live;
    liveDraw();
  }
  if (d && d.cast === "bg-sync" && +d.cursor >= 0)
    bgSeek(bgActiveVideo(), (+d.cursor + Date.now() - (+d.at || Date.now())) / 1000, 0.35);
  if (d && d.cast === "studio" && STUDIO && studioScene(d.scene)) {
    STUDIO = d.scene;
    draw();
  }
  if (d && d.cast === "monitor") {
    monitor = { mode: d.mode || "off", vol: +d.vol || 0 };
    audioctx();
    audioApply();
    previewAudio(); // nichts neu laden
  }
});

music();
draw();
K.Images.load().then(newDraw); // gemerkte Bilder aus der Datenbank holen
if (document.fonts)
  document.fonts.ready.then(() => {
    $$(".ticker").forEach(t => {
      t._cacheKey = null;
    });
    ticker();
    fit(true);
  });
