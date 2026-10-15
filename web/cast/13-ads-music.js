/* cast/13-ads-music.js · Werbung und Musik (Tuna) (Teil von cast.js, siehe cast/01-base.js) */
/* ---------- Werbung (Szene „Werbung“) ----------
   Z.ads.play = { id, list: [Videos] } – die Steuerseite startet „Alle“ oder einzelne Werbe-Videos. Sie laufen
   nacheinander bildfüllend mit Ton; danach bleibt das letzte Bild stehen (die Steuerseite wechselt zurück).
   Die Vorschau in der App meldet Fortschritt und Ende an die Steuerseite (ads-progress / ads-ended). */
function ads() {
  const stage = document.querySelector('[data-part="ads"]');
  if (!stage) return;
  const A = Z.ads || {},
    P = A.play || null,
    label = stage.querySelector(".ads-label");
  if (label) {
    label.textContent = K.word(Z, "ad");
    label.hidden = A.badge === false || !(P && (P.list || []).length);
  } // nur während Werbung läuft
  const key = P && P.id ? String(P.id) : "";
  if (stage._key === key) return;
  stage._key = key;
  stage.querySelectorAll("video").forEach(v => {
    videoUnload(v);
    v.remove();
  });
  const list = ((P || {}).list || []).filter(f => /^media\/videos\/[^/]+$/.test(f));
  if (!list.length) return;
  const report = d => {
    if (PREVIEW && window.parent !== window)
      try {
        window.parent.postMessage(Object.assign({ id: P.id }, d), location.origin);
      } catch (e) {}
  };
  let n = 0,
    lastReport = 0;
  const next = () => {
    if (stage._key !== key) return;
    if (n >= list.length) {
      report({ cast: "ads-ended" });
      return;
    } // letztes Bild bleibt stehen
    const index = n,
      v = document.createElement("video");
    v.className = "ads-video";
    v.playsInline = true;
    v.preload = "auto";
    v.disablePictureInPicture = true;
    v.src = list[n++].split("/").map(encodeURIComponent).join("/");
    stage.insertBefore(v, label);
    v.ontimeupdate = () => {
      const t = Date.now();
      if (t - lastReport > 900) {
        lastReport = t;
        report({ cast: "ads-progress", index, count: list.length, t: v.currentTime, d: v.duration });
      }
    };
    // nächstes Video legt sich darüber, das alte geht kurz danach; das letzte bleibt mit seinem letzten Bild stehen
    v.onended = () => {
      const more = n < list.length;
      next();
      if (more)
        setTimeout(() => {
          videoUnload(v);
          v.remove();
        }, 400);
    };
    v.onerror = () => {
      message("Werbung lässt sich nicht abspielen: " + v.getAttribute("src"));
      v.remove();
      next();
    };
    v.muted = false; // Werbung mit Ton – blockiert der Browser das, wenigstens das Bild
    v.play().catch(() => {
      v.muted = true;
      v.play().catch(() => {});
    });
  };
  next();
}

/* ---------- Musik (Tuna) ---------- */
let musicData = null;
function musicBox(box) {
  if (box._music) return box._music;
  box.innerHTML = `<div class="music-cover"></div>
      <div class="music-field"><div class="music-label"><span class="eq"><i></i><i></i><i></i></span><span data-t="texts.musicLabel"></span></div>
        <div class="music-text"><div class="music-title"></div><div class="music-artist"></div></div>
        <div class="music-bar"><i></i></div></div>`;
  box.querySelector("[data-t]").textContent = Z.texts.musicLabel || "";
  return (box._music = {
    cover: box.querySelector(".music-cover"),
    text: box.querySelector(".music-text"),
    title: box.querySelector(".music-title"),
    artist: box.querySelector(".music-artist"),
    bar: box.querySelector(".music-bar i"),
    song: null,
    num: 0,
    active: null,
  });
}
function coverLoad(m, url) {
  const n = ++m.num;
  if (!url) return;
  const img = new Image();
  img.src = url.startsWith("data:") ? url : url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
  img.onload = () => {
    if (n !== m.num) return;
    m.cover.appendChild(img);
    requestAnimationFrame(() => requestAnimationFrame(() => img.classList.add("on")));
    const previous = m.active;
    m.active = img;
    if (previous) setTimeout(() => previous.remove(), 900);
  };
}
function musicShow(d) {
  musicData = d;
  const status = d && d.status ? String(d.status).toLowerCase() : "";
  const has = !!(d && d.title) && Z.music.displayed !== false;
  const plays = has && status !== "paused" && status !== "stopped";
  $$(".music").forEach(box => {
    const m = musicBox(box);
    // erst nach drei Abfragen ohne Musik ausblenden – kurze Aussetzer lassen die Box nicht flackern
    m.without = plays ? 0 : (m.without || 0) + 1;
    if (plays) box.classList.add("on");
    else if (m.without >= 3 || Z.music.displayed === false || !box.classList.contains("on")) box.classList.remove("on");
    if (!has) return;
    const k = (d.artists || []).join(", "),
      song = d.title + "|" + k;
    if (song !== m.song) {
      const initially = m.song === null;
      m.song = song;
      const set = () => {
        m.title.textContent = d.title;
        m.artist.textContent = k || d.album || "";
        m.text.classList.remove("switchTo");
      };
      if (initially) set();
      else {
        m.text.classList.add("switchTo");
        setTimeout(set, 400);
      }
      coverLoad(m, d.cover_url);
      [2000, 5000].forEach(ms =>
        setTimeout(() => {
          if (m.song === song) coverLoad(m, d.cover_url);
        }, ms)
      );
      m.bar.style.transition = "none";
      m.bar.style.transform = "scaleX(0)";
      void m.bar.offsetWidth;
      m.bar.style.transition = "";
    }
    if (d.duration > 0) m.bar.style.transform = `scaleX(${Math.min(1, (d.progress || 0) / d.duration)})`;
  });
}
function music() {
  if (TEST) {
    const start = Date.now();
    const tick = () =>
      musicShow({
        title: "Nachtfahrt",
        artists: ["Beispiel-Band"],
        cover_url: "media/themes/dachcs.png",
        duration: 200000,
        progress: 50000 + Date.now() - start,
        status: "playing",
      });
    tick();
    if (!PREVIEW) setInterval(tick, 1000);
    return;
  }
  let failures = 0;
  (function retrieve() {
    // nur wenn es Musik-Boxen gibt (bzw. in overlay.html jederzeit welche kommen können)
    if (!$$(".music").length && !document.querySelector(".stage")) return setTimeout(retrieve, 3000);
    if ((Z.music || {}).displayed === false) return setTimeout(retrieve, 3000); // Musik-Anzeige aus: Tuna nicht fragen
    const adr = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(Z.music.address || "")
      ? Z.music.address
      : "http://localhost:1608/";
    fetch(adr, { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        failures = 0;
        musicShow(d);
      })
      .catch(() => {
        failures++;
        musicShow(null);
      })
      .finally(() => setTimeout(retrieve, failures > 3 ? 5000 : 1000));
  })();
}
