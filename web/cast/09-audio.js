/* cast/09-audio.js · Ton je Quelle: Lautstärke, stumm, Verzögerung, Abhören (Teil von cast.js, siehe cast/01-base.js) */
/* ---------- Ton je Quelle: Lautstärke (bis 300 %), stumm, Verzögerung, Abhören ----------
   Programm (OBS): spielt, wenn nicht stumm und nicht „nur abhören“. Vorschau in der App: spielt, wenn Abhören an ist. */
let audioAudioctx = null,
  monitor = { mode: "off", vol: 100 }; // Abhören in der App: aus · app · beides (App + OBS)
const monitorOn = () => monitor.mode === "app" || monitor.mode === "both";
const audioChains = new Set();
function audioForVideo(v, on) {
  if (!on) {
    v.muted = true;
    return;
  }
  const c = audioctx();
  if (!c) return;
  if (!v._audio) {
    try {
      audioChain(c.createMediaElementSource(v), "background", () => v.isConnected);
      v._audio = true;
    } catch (e) {
      return;
    }
  }
  v.muted = false;
}
function audioctx() {
  if (!audioAudioctx) {
    try {
      audioAudioctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      return null;
    }
  }
  if (audioAudioctx.state === "suspended") audioAudioctx.resume().catch(() => {});
  return audioAudioctx;
}
// Hintergrund (Playlisten, Clips, Quellen-Art „Video“): ob Ton läuft, entscheidet die Steuerseite je Szene bzw. Clip –
// hier keine eigene Stummschaltung (ältere Stände hatten background.mute fest an)
function audioSettings(key) {
  const T = { vol: 100, mute: false, delay: 0, monitor: "both" };
  return key === "background" ? T : Object.assign(T, (Z.audio || {})[key] || {});
}
function audioLevel(key) {
  const T = audioSettings(key);
  if (T.mute) return 0;
  if (PREVIEW) return T.monitor === "off" || !monitorOn() ? 0 : (T.vol / 100) * (monitor.vol / 100);
  return T.monitor === "only" ? 0 : T.vol / 100;
}
function audioChain(source, key, alive) {
  const c = audioctx();
  if (!c) return null;
  const d = c.createDelay(5),
    g = c.createGain();
  source.connect(d);
  d.connect(g);
  g.connect(c.destination);
  const t = { d, g, key, alive };
  audioChains.add(t);
  audioApply();
  return t;
}
function audioApply() {
  const H = Z.background || {},
    bgOn = (H.play || {}).audio === true,
    clipOn = (H.clip || {}).audio !== false;
  $$(".backdrop video").forEach(v => audioForVideo(v, v.classList.contains("bg-clip") ? clipOn : bgOn));
  audioChains.forEach(t => {
    if (!t.alive()) {
      try {
        t.g.disconnect();
      } catch (e) {}
      audioChains.delete(t);
      return;
    }
    t.g.gain.value = audioLevel(t.key);
    t.d.delayTime.value = Math.min(5, Math.max(0, (+audioSettings(t.key).delay || 0) / 1000));
  });
  // VDO.Ninja: Lautstärke über dessen Iframe-Schnittstelle (höchstens 100 %)
  $$(".cam[data-source] iframe").forEach(f => {
    const v = Math.min(1, audioLevel(f.closest(".cam").dataset.source));
    if (f._vol !== v) {
      f._vol = v;
      try {
        f.contentWindow.postMessage({ volume: v }, "*");
      } catch (e) {}
    }
  });
}
setInterval(() => {
  $$(".cam[data-source] iframe").forEach(f => {
    f._vol = null;
  });
  audioApply();
}, 3000);
// Vorschau: eigene Videos/Audios direkt regeln, fremde Seiten (Clips, VDO, DACH) über Lautstärke-Nachricht.
// Nie neu laden – Bild und Videos laufen weiter, nur der Ton geht an/aus. Im App-Fenster schaltet die App
// zusätzlich die ganze Seite stumm (wirkt auch in fremden Seiten).
function previewAudio() {
  if (!PREVIEW) return;
  const on = monitorOn(),
    vol = on ? Math.max(0, Math.min(1, monitor.vol / 100)) : 0;
  $$("video, audio").forEach(m => {
    if (m._audio) return;
    m.muted = !on;
    m.volume = vol;
  });
  $$("iframe").forEach(f => {
    if (f.closest(".cam[data-source]")) return;
    try {
      f.contentWindow.postMessage({ volume: vol }, "*");
    } catch (e) {}
  });
}
if (PREVIEW) setInterval(previewAudio, 1000);
