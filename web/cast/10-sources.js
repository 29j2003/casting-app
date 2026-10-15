/* cast/10-sources.js · Quellen in den Kamera-Rahmen (Links, Videos, Bilder) (Teil von cast.js, siehe cast/01-base.js) */
/* ---------- Quellen in den Kamera-Rahmen ---------- */
function linkPrepare(Q, key) {
  let u = String(Q.url || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://vdo.ninja/?view=" + encodeURIComponent(u); // nur Stream-ID eingegeben
  try {
    const url = new URL(u);
    if (/(^|\.)(vdo|obs)\.ninja$/i.test(url.hostname)) {
      const p = url.searchParams;
      if (!p.has("cleanoutput")) p.set("cleanoutput", "");
      if (Q.adjust !== "whole" && !p.has("cover")) p.set("cover", "");
      if (Q.audio === false && !p.has("noaudio")) p.set("noaudio", "");
      const delayMs = +audioSettings(key).delay || 0;
      if (delayMs > 0) p.set("buffer", String(Math.round(delayMs))); // Bild + Ton verzögern (z. B. passend zum Spiel)
      return url.toString().replace(/=(&|$)/g, "$1");
    }
    return url.toString();
  } catch (e) {
    return u;
  }
}
async function deviceStart(box, Q) {
  const v = document.createElement("video");
  v.autoplay = true;
  v.playsInline = true;
  v.muted = !Q.audio;
  box.appendChild(v);
  try {
    const md = navigator.mediaDevices;
    let devices = await md.enumerateDevices();
    if (!devices.some(d => d.label)) {
      // ohne Freigabe gibt es keine Gerätenamen
      const s = await md.getUserMedia({ video: true });
      s.getTracks().forEach(t => t.stop());
      devices = await md.enumerateDevices();
    }
    // Geräte-IDs unterscheiden sich zwischen Browser und OBS – deshalb zuerst über den Namen suchen
    const d =
      devices.find(x => x.kind === "videoinput" && Q.deviceName && x.label === Q.deviceName) ||
      devices.find(x => x.kind === "videoinput" && x.deviceId === Q.device);
    const video = { width: { ideal: 1920 }, height: { ideal: 1080 } };
    if (d) video.deviceId = { exact: d.deviceId };
    const stream = await md.getUserMedia({ video, audio: !!Q.audio || !!(Z.speaker || {}).on });
    if (!box.isConnected) {
      stream.getTracks().forEach(t => t.stop());
      return;
    }
    box._stream = stream;
    v.srcObject = stream;
    v.muted = true;
    if (stream.getAudioTracks().length) {
      const c = audioctx();
      if (c) audioChain(c.createMediaStreamSource(stream), box.closest(".cam").dataset.source, () => box.isConnected);
    }
    levelMeasure(box.closest(".cam"), stream);
  } catch (e) {
    // im Stream nur ein neutrales schwarzes Feld – der Hinweis mit Grund steht nur in der Vorschau (body.idle)
    box.innerHTML = `<div class="cam-error preview-only">${esc(K.word(Z, "cameraMissing"))}<small>${esc((e && (e.name || e.message)) || e)}</small></div>`;
  }
}
/* Sprecher-Anzeige: Pegel messen und das Schild aufleuchten lassen */
const levelHold = new WeakMap();
function meterLevel(k, value) {
  if (!(Z.speaker || {}).on) {
    k.classList.remove("speaks");
    return;
  }
  if (value > ((Z.speaker || {}).threshold || 0.08)) {
    k.classList.add("speaks");
    clearTimeout(levelHold.get(k));
    levelHold.set(
      k,
      setTimeout(() => k.classList.remove("speaks"), 450)
    );
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
    const analyse = audioContext.createAnalyser();
    analyse.fftSize = 512;
    source.connect(analyse);
    const data = new Float32Array(analyse.fftSize);
    const t = setInterval(() => {
      if (!k.isConnected || track.readyState === "ended") {
        clearInterval(t);
        try {
          source.disconnect();
          analyse.disconnect();
        } catch (e) {}
        return;
      }
      analyse.getFloatTimeDomainData(data);
      let s = 0;
      for (const v of data) s += v * v;
      meterLevel(k, Math.sqrt(s / data.length) * 4);
    }, 100);
  } catch (e) {}
}
// VDO.Ninja meldet Pegel über seine iframe-Schnittstelle
addEventListener("message", ev => {
  const d = ev.data;
  if (!d || typeof d !== "object" || d.loudness == null) return;
  const k = $$(".cam[data-source]").find(x => {
    const f = x.querySelector("iframe");
    return f && f.contentWindow === ev.source;
  });
  if (!k) return;
  const values = typeof d.loudness === "object" ? Object.values(d.loudness) : [d.loudness];
  meterLevel(k, Math.max(0, ...values.map(Number).filter(n => !isNaN(n))) / 100);
});
setInterval(() => {
  if (!(Z.speaker || {}).on) return;
  $$(".cam[data-source] iframe").forEach(f => {
    try {
      f.contentWindow.postMessage({ getLoudness: true }, "*");
    } catch (e) {}
  });
}, 3000);

function sources() {
  $$(".cam[data-source]").forEach(k => {
    const Q = (Z.sources || {})[k.dataset.source] || { type: "empty" };
    const keyName = JSON.stringify([
      Q,
      !!(Z.speaker || {}).on,
      Q.type === "link" ? +audioSettings(k.dataset.source).delay || 0 : 0,
    ]);
    if (k._source === keyName) return;
    k._source = keyName;
    const oldSource = k.querySelector(".cam-source");
    if (oldSource) {
      if (oldSource._stream) oldSource._stream.getTracks().forEach(t => t.stop());
      oldSource.remove();
    }
    const active =
      Q.type &&
      Q.type !== "empty" &&
      (Q.type !== "link" || Q.url) &&
      (Q.type !== "image" || Q.image) &&
      (Q.type !== "video" || Q.video);
    k.classList.toggle("filled", !!active);
    if (!active) return;
    const box = document.createElement("div");
    box.className = "cam-source" + (Q.adjust === "whole" ? " whole" : "") + (Q.mirror ? " mirrored" : "");
    k.insertBefore(box, k.firstChild);
    if (Q.type === "link") {
      const f = document.createElement("iframe");
      const target = linkPrepare(Q, k.dataset.source);
      f.onload = () => {
        f._vol = null;
        setTimeout(audioApply, 800);
      };
      if (!/^https?:\/\//i.test(target)) return;
      try {
        if (new URL(target).origin === location.origin) return;
      } catch (e) {
        return;
      } // nie eigene Seiten (Sandbox wäre wirkungslos)
      // nur abspielen: Kamera, Mikrofon und Bildschirm braucht ein Link zum Ansehen (VDO.Ninja „view“) nicht
      f.allow = "autoplay; fullscreen";
      // darf Skripte ausführen, aber die Overlay-Seite nicht umleiten oder Pop-ups öffnen
      f.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-presentation");
      f.referrerPolicy = "no-referrer";
      f.src = target;
      box.appendChild(f);
    } else if (Q.type === "image") {
      // in OBS kommen große Bilder als /api/image/<id> (siehe K.resolve)
      const i = document.createElement("img");
      if (/^(data:image\/|https?:|\/api\/image\/[a-z0-9]+$|media\/|medien\/)/i.test(Q.image)) i.src = Q.image;
      box.appendChild(i);
    } else if (Q.type === "video") {
      // eigenes Video aus dem Videos-Ordner (z. B. DACH: eigene Contentpause) – nur eigene Dateien
      if (!/^media\/videos\/[^/]+$/.test(Q.video)) return;
      const v = document.createElement("video");
      ["autoplay", "playsinline", "muted"].forEach(a => v.setAttribute(a, ""));
      v.muted = true;
      v.loop = Q.loop !== false;
      v.preload = "auto";
      v.disablePictureInPicture = true;
      v.src = Q.video.split("/").map(encodeURIComponent).join("/");
      box.appendChild(v);
      if (Q.audio) setTimeout(() => audioForVideo(v, true), 0);
      v.play().catch(() => {});
    } else if (Q.type === "device") deviceStart(box, Q);
  });
}
