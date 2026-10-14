/* cast/12-background.js · Hintergrund-Videos und Clips (Teil von cast.js, siehe cast/01-base.js) */
/* ---------- Hintergrund-Videos ----------
   Jede Einrichtung bekommt eine eigene „Generation": Zeitgeber und Ereignisse älterer Durchläufe
   werden ignoriert und können den Hintergrund nicht mehr durcheinanderbringen. */
let videoList = null,
  videoWatchdog = null,
  videoGen = 0,
  videoLater = null;
// ein Video ganz anhalten und entladen (gibt Speicher und Decoder frei)
const videoUnload = v => {
  v.onerror = v.onended = v.oncanplay = null;
  v.pause();
  v.removeAttribute("src");
  v.load();
};
// Hintergrund im Gleichlauf: ein einzelnes Video (Schleife) steht in OBS und in der Vorschau an derselben Stelle.
// Beide rechnen sie aus dem Start der Playlist (play.since); spielt OBS selbst ab, schickt die Steuerseite dessen
// Position (bg-sync). Gesprungen wird nur bei spürbarer Abweichung.
function bgActiveVideo() {
  return document.querySelector(".backdrop video.on:not(.bg-clip)");
}
function bgSeek(v, seconds, tolerance) {
  if (!v || !v.loop || !(v.duration > 1) || !isFinite(v.duration)) return;
  const d = v.duration,
    t = ((seconds % d) + d) % d;
  let off = v.currentTime - t;
  off = ((((off + d / 2) % d) + d) % d) - d / 2;
  if (Math.abs(off) > tolerance) v.currentTime = t;
}
function bgSince(v, tolerance) {
  const s = +((Z.background || {}).play || {}).since || 0;
  if (s) bgSeek(v, (Date.now() - s) / 1000, tolerance);
}
if (PREVIEW)
  setInterval(() => {
    const H = Z.background || {};
    if (H.source !== "obs" && !H.transparent) bgSince(bgActiveVideo(), 0.5);
  }, 4000);
function background() {
  const backdrop = document.querySelector(".backdrop");
  if (!backdrop) return;
  const H = Z.background || {};
  // OBS spielt das Video unter dem Overlay ab – die Vorschau in der App zeigt es trotzdem, damit sie wie das Programm aussieht
  const obsPlays = (H.source === "obs" || !!H.transparent) && !PREVIEW;
  const list = obsPlays ? [] : (H.videos || []).filter(Boolean);
  const dark = backdrop.querySelector(".bg-dark"),
    empty = backdrop.querySelector(".bg-empty");
  // Playlist (Setup → Hintergrund): Übergang zwischen den Videos, Dauer, Reihenfolge
  const P = H.play || {},
    shuffle = P.order === "shuffle",
    passage = ["cut", "black"].includes(P.transition) ? P.transition : "fade";
  const fade = Math.min(4000, Math.max(0, +P.fade >= 0 ? +P.fade : 1200));
  backdrop.style.setProperty("--bg-fade", (passage === "cut" ? 0 : passage === "black" ? fade / 2 : fade) + "ms");
  const keyName = (obsPlays ? "obs|" : "") + list.join("|") + "|" + [passage, fade, shuffle].join();
  if (backdrop.classList.contains("video-running") || obsPlays) {
    if (dark) dark.style.opacity = H.dim ?? 0.35;
  }
  if (keyName === videoList) return;
  // Wechsel nach Ingame: der Hintergrund blendet gerade mit der Szene aus – erst danach umbauen, nie sichtbar
  clearTimeout(videoLater);
  // Ziel-Szene zählt: die Steuerseite schickt Szene und Playlist zusammen, der Wechsel beginnt erst danach
  const ingame =
    currentSceneName() === "ingame" ||
    (document.body.dataset.scene === "broadcast" && (Z.broadcast || {}).scene === "ingame");
  const look = getComputedStyle(backdrop);
  if (ingame && !obsPlays && look.display !== "none" && parseFloat(look.opacity) > 0.01) {
    videoLater = setTimeout(background, 250);
    return;
  }
  videoList = keyName;

  // alles vom vorherigen Durchlauf beenden
  const gen = ++videoGen;
  clearInterval(videoWatchdog);
  videoWatchdog = null;
  if (gen > 1 && performance.now() > 8000)
    message(`Hintergrund neu eingerichtet (${obsPlays ? "OBS spielt ab" : list.length + " Video(s)"})`);
  // Das gerade sichtbare Video bleibt stehen, bis das neue läuft, und blendet dann weich aus (nie ein harter Schnitt
  // auf den Theme-Hintergrund). Unsichtbare Videos gehen sofort; Clips (bg-clip) laufen unabhängig weiter.
  const old = [...backdrop.querySelectorAll("video:not(.bg-clip)")];
  const shown = old.find(v => v.classList.contains("on"));
  old
    .filter(v => v !== shown)
    .forEach(v => {
      videoUnload(v);
      v.remove();
    });
  let retired = !shown;
  const retire = () => {
    if (retired) return;
    retired = true;
    shown.classList.remove("on");
    setTimeout(() => {
      videoUnload(shown);
      shown.remove();
    }, fade + 300);
  };
  if (shown) shown.onended = shown.onerror = null;
  backdrop.classList.toggle("obs-video", obsPlays);
  const showTheme = () => {
    empty.classList.remove("gone");
    backdrop.classList.remove("video-running");
    backdrop.classList.add("without-video");
    if (dark) dark.style.opacity = 0;
    retire();
  };
  if (obsPlays) {
    // durchsichtig, nur Abdunkeln + Verlauf
    empty.classList.add("gone");
    backdrop.classList.remove("without-video", "video-running");
    if (dark) dark.style.opacity = H.dim ?? 0.35;
    retire();
    return;
  }
  if (!list.length) {
    // in Ingame unsichtbar: nur dunkel lassen – sonst blitzt beim Zurückwechseln erst das Theme auf, dann das Video
    if (ingame) {
      empty.classList.add("gone");
      backdrop.classList.remove("video-running");
      retire();
    } else showTheme();
    return;
  }
  // bis das erste Video Bilder liefert: Theme-Hintergrund – war er dunkel (nach Ingame), kurz warten, ob das Video kommt
  if (!shown && !empty.classList.contains("gone")) showTheme();
  else if (!shown)
    setTimeout(() => {
      if (valid() && !backdrop.classList.contains("video-running")) showTheme();
    }, 1500);

  const bgAudio = (H.play || {}).audio === true; // Ton je Szene (Steuerseite: bgAudioFor)
  const make = () => {
    const v = document.createElement("video");
    setTimeout(() => audioForVideo(v, bgAudio), 0);
    ["muted", "autoplay", "playsinline"].forEach(a => v.setAttribute(a, ""));
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.disablePictureInPicture = true;
    backdrop.insertBefore(v, empty);
    return v;
  };
  let active = make(),
    upcoming = make();
  let i = shuffle ? Math.floor(Math.random() * list.length) : 0;
  const following = n => {
    if (!shuffle || list.length < 3) return (n + 1) % list.length;
    let k;
    do k = Math.floor(Math.random() * list.length);
    while (k === n);
    return k;
  };
  const broken = new Set();
  const valid = () => gen === videoGen;

  // Ein Video laden und starten – erst „ok", wenn wirklich Bilder kommen (nicht nur „kann abspielen")
  function launch(v, file) {
    return new Promise(done => {
      let finished = false;
      const end = (ok, reason) => {
        if (finished) return;
        finished = true;
        clearTimeout(time);
        v.oncanplay = v.onerror = null;
        v.removeEventListener("timeupdate", progress);
        done({ ok, reason });
      };
      const time = setTimeout(
        () => end(false, v.readyState < 2 ? "lädt nicht" : "kein Bild – Format wird hier nicht dekodiert"),
        12000
      );
      const progress = () => {
        if (v.currentTime > 0.15 && v.videoWidth > 0) end(true);
      };
      v.onerror = () =>
        end(false, v.error ? `Fehler ${v.error.code}${v.error.message ? ": " + v.error.message : ""}` : "Fehler");
      v.oncanplay = () => {
        v.oncanplay = null;
        v.play().catch(e => {
          // Ton blockiert (Browser ohne Autoplay mit Ton): wenigstens das Bild – stumm weiter
          if (e && e.name === "NotAllowedError" && !v.muted) {
            v.muted = true;
            v.play().catch(e2 => end(false, "Abspielen abgelehnt: " + (e2 && e2.name)));
          } else end(false, "Abspielen abgelehnt: " + (e && e.name));
        });
      };
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
      const file = list[i];
      i = following(i);
      if (broken.has(file)) continue;
      const r = await launch(upcoming, file);
      if (!valid()) return; // inzwischen neu eingerichtet
      if (r.ok) {
        const incoming = upcoming,
          previous = active;
        if (list.length === 1) bgSince(incoming, 0.3); // gleiche Stelle wie die anderen Overlays
        if (passage === "black" && previous.classList.contains("on")) {
          // erst ausblenden, dann das neue einblenden
          previous.classList.remove("on");
          setTimeout(() => {
            if (valid()) incoming.classList.add("on");
          }, fade / 2);
        } else {
          incoming.classList.add("on");
          previous.classList.remove("on");
        }
        retire(); // das Video der vorherigen Playlist blendet jetzt aus
        setTimeout(
          () => {
            if (!previous.classList.contains("on")) previous.pause();
          },
          Math.max(1400, fade + 200)
        );
        [active, upcoming] = [upcoming, active];
        const v = active;
        v.onended = () => {
          if (valid() && v === active) proceed();
        };
        // bricht das Video mitten im Abspielen ab: melden und neu anstoßen
        v.onerror = () => {
          if (!valid() || v !== active) return;
          message(`Video abgebrochen: ${file}${v.error ? " (Fehler " + v.error.code + ")" : ""}`);
          setTimeout(() => {
            if (valid()) proceed();
          }, 1500);
        };
        ["stalled", "emptied", "suspend"].forEach(occurrence => {
          v["on" + occurrence] = () => {
            if (valid() && v === active && IN_OBS && occurrence !== "suspend")
              message(`Video-Ereignis „${occurrence}“: ${file}`);
          };
        });
        empty.classList.add("gone");
        backdrop.classList.add("video-running");
        backdrop.classList.remove("without-video");
        if (dark) dark.style.opacity = (Z.background || {}).dim ?? 0.35;
        loading = false;
        return;
      }
      broken.add(file);
      setTimeout(() => broken.delete(file), 30000); // später erneut versuchen
      message(`Video lässt sich nicht abspielen: ${file} (${r.reason})`);
      (window.__videoProblems = (window.__videoProblems || []).slice(-9)).push(file + " – " + r.reason);
    }
    loading = false;
    if (valid() && !backdrop.classList.contains("video-running")) {
      showTheme();
      message("Kein Hintergrund-Video abspielbar – zeige Theme-Hintergrund. Tipp: „OBS spielt ab“ wählen.");
      setTimeout(() => {
        if (valid()) proceed();
      }, 30000);
    }
  }
  proceed();

  // Wächter: bleibt das Bild stehen, neu anstoßen bzw. zum nächsten Video wechseln
  let last = -1,
    stall = 0;
  videoWatchdog = setInterval(() => {
    if (!valid() || loading || !active.classList.contains("on") || !obsActive) return;
    if (active.paused && !active.ended) {
      active.play().catch(() => {});
      return;
    }
    if (active.currentTime === last) {
      if (++stall >= 3) {
        stall = 0;
        message("Video hängt – starte neu: " + (active.getAttribute("src") || ""));
        if (list.length === 1) broken.clear();
        proceed();
      }
    } else stall = 0;
    last = active.currentTime;
  }, 1500);
}

/* ---------- Clips (Hintergrund-Playlist der Art „Clips"): einmal mit Ton, danach weg ----------
   Die Steuerseite setzt Z.background.clip = { id: Zeitpunkt, videos, audio }. Jede Seite spielt einen Abruf
   nur einmal und nur, wenn er frisch ist (nach Neuladen nicht noch einmal). Leere Liste = Clip abbrechen. */
let clipSeen = 0;
function clips() {
  const backdrop = document.querySelector(".backdrop");
  const C = (Z.background || {}).clip || {};
  if (!backdrop || !C.id || C.id === clipSeen) return;
  clipSeen = C.id;
  let v = backdrop.querySelector("video.bg-clip");
  const stop = () => {
    if (!v) return;
    v.classList.remove("on");
    const w = v;
    setTimeout(() => {
      if (!w.classList.contains("on")) {
        w.pause();
        w.removeAttribute("src");
        w.load();
      }
    }, 700);
  };
  const list = (C.videos || []).filter(Boolean);
  if (!list.length || Date.now() - C.id > 20000) {
    stop();
    return;
  }
  if (!v) {
    v = document.createElement("video");
    v.className = "bg-clip";
    v.playsInline = true;
    v.preload = "auto";
    v.disablePictureInPicture = true;
    backdrop.appendChild(v);
  }
  const id = C.id;
  let n = 0;
  const next = () => {
    if (id !== clipSeen) return;
    if (n >= list.length) {
      stop();
      return;
    }
    const file = list[n++];
    v.src = /^(https?:|file:|data:|blob:)/i.test(file) ? file : file.split("/").map(encodeURIComponent).join("/");
    audioForVideo(v, C.audio !== false);
    v.play()
      .then(() => v.classList.add("on"))
      .catch(() => next());
  };
  v.onended = next;
  v.onerror = () => {
    message("Clip lässt sich nicht abspielen: " + (v.getAttribute("src") || ""));
    next();
  };
  next();
}
