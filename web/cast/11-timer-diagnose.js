/* cast/11-timer-diagnose.js · Timer und Diagnose (Teil von cast.js, siehe cast/01-base.js) */
/* ---------- Timer ---------- */
function timer() {
  const rest = K.timerRest(Z.timer),
    endText = ((Z.timer || {}).end || {}).text || "";
  // abgelaufen und ein Text für „bei 0:00" gesetzt (Timer & Texte): Text statt „00:00"
  const over = rest <= 0 && Z.timer.running && endText;
  const t = over
    ? `<span class="timer-end">${esc(endText)}</span>`
    : K.time(rest).replace(":", '<span class="dp">:</span>');
  $$(".timer").forEach(e => {
    if (e.innerHTML !== t) e.innerHTML = t;
    e.classList.toggle("null", rest <= 0 && Z.timer.running && !over);
    e.classList.toggle("ended", !!over);
  });
}
setInterval(timer, 250);

/* ---------- Diagnose (in der Steuerseite einschaltbar) ---------- */
let receivedFrom = "gespeicherter Stand",
  receivedAt = 0,
  diagnoseTimer = 0;
function diagnose() {
  if (EMBEDDED) return;
  let box = document.querySelector(".diagnose");
  if (!Z.diagnose) {
    if (box) box.remove();
    clearInterval(diagnoseTimer);
    diagnoseTimer = 0;
    return;
  }
  if (!box) {
    box = document.createElement("div");
    box.className = "diagnose";
    box.style.cssText =
      "position:absolute;left:12px;top:12px;z-index:99;max-width:1100px;padding:12px 16px;background:rgba(0,0,0,.88);color:#9f9;font:16px/1.45 Consolas,monospace;white-space:pre-wrap;border:2px solid #9f9";
    document.body.appendChild(box);
    if (!diagnoseTimer) diagnoseTimer = setInterval(diagnose, 1000);
  }
  const H = Z.background || {},
    t = document.createElement("video");
  const rows = [
    "DIAGNOSE – " + (document.body.dataset.scene || location.pathname.split("/").pop()) + " · Version " + K.VERSION,
    "Datei:     " +
      (location.pathname.split("/").pop() || "?") +
      (location.protocol === "file:" ? " (lokale Datei)" : " (" + location.protocol.replace(":", "") + ")"),
    "Browser:   " + (navigator.userAgent.match(/(OBS|Chrome|Edg|Firefox|Safari)\/[\d.]+/g) || []).join(" "),
    "Zustand:   " +
      receivedFrom +
      (receivedAt ? " · " + new Date(receivedAt).toLocaleTimeString("de-DE") : "") +
      " · Stand " +
      (Z.revision ? new Date(Z.revision).toLocaleTimeString("de-DE") : "–"),
    "Bilder:    " +
      Object.keys(K.Images.mem).length +
      " gemerkt · Zustand " +
      Math.round(JSON.stringify(rawState).length / 1024) +
      " KB",
    "Videos:    " +
      ((H.videos || []).length || "keine eingetragen") +
      (H.transparent ? " (Hintergrund durchsichtig!)" : ""),
    "Formate:   H.264 " +
      (t.canPlayType('video/mp4; codecs="avc1.640028"') || "nein") +
      " · H.265 " +
      (t.canPlayType('video/mp4; codecs="hvc1.1.6.L120.90"') || "nein") +
      " · VP9 " +
      (t.canPlayType('video/webm; codecs="vp9"') || "nein"),
  ];
  document.querySelectorAll(".backdrop video").forEach((v, i) => {
    if (!v.getAttribute("src")) return;
    const error = v.error
      ? ["", "abgebrochen", "Netzwerk/Datei", "Dekodierung (Format)", "Format/Datei nicht unterstützt"][v.error.code] +
        (v.error.message ? " – " + v.error.message : "")
      : "";
    rows.push(
      `Video ${i + 1}:   ${decodeURIComponent(v.getAttribute("src"))} · bereit ${v.readyState}/4 · ${v.paused ? "pausiert" : "läuft"} · ${v.currentTime.toFixed(1)} s${v.classList.contains("on") ? " · SICHTBAR" : ""}${error ? " · FEHLER: " + error : ""}`
    );
  });
  (window.__videoProblems || []).slice(-3).forEach(p => rows.push("Übersprungen: " + p));
  box.textContent = rows.join("\n");
}

const IN_OBS = !!window.obsstudio || /OBS\//.test(navigator.userAgent);
let obsActive = true;
addEventListener("obsSourceActiveChanged", ev => {
  obsActive = !!(ev.detail && ev.detail.active);
  document.querySelectorAll(".backdrop video.on").forEach(v => {
    if (obsActive) v.play().catch(() => {});
    else v.pause();
  });
});
