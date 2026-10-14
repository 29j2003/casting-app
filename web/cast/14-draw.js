/* cast/14-draw.js · Alles zeichnen: draw(), newDraw(), Ecken der Boxen (Teil von cast.js, siehe cast/01-base.js) */
/* ---------- Alles zeichnen ---------- */
function cornersSet() {
  $$(".box").forEach(b => {
    if (b.dataset.corner !== undefined || !b.offsetWidth) return;
    const r = b.getBoundingClientRect(),
      middle = r.left + r.width / 2,
      width = document.documentElement.clientWidth || 1920;
    b.dataset.corner = middle < width * 0.42 ? "left" : middle > width * 0.58 ? "right" : "middle";
  });
}
// jedes Teil für sich: ein Fehler in einem Teil (z. B. unerwartete Daten) hält weder die anderen noch den Szenenwechsel auf
const DRAW_PARTS = [
  diagnose,
  theme,
  graphics,
  veto,
  series,
  players,
  teamIntro,
  texts,
  teams,
  fit,
  timer,
  ticker,
  background,
  clips,
  ads,
  sources,
  sponsors,
  () => {
    if (!(Z.speaker || {}).on) $$(".cam.speaks").forEach(k => k.classList.remove("speaks"));
  },
  () => {
    $$(".music").forEach(m => m.classList.toggle("off", (Z.music || {}).displayed === false));
    if (musicData && $$(".music").some(b => !b._music)) musicShow(musicData);
  },
  liveDraw,
  tournamentDraw,
  audioApply,
  () => {
    document.body.classList.toggle("dach-frame-show", !!(Z.dach || {}).frameShow);
    document.body.classList.toggle("clean", !!(Z.broadcast || {}).clean && currentSceneName() === "ingame");
  },
];
function draw() {
  if (STUDIO) Z.broadcast = Object.assign({}, Z.broadcast, { scene: STUDIO, overGame: null, transition: "cut" });
  for (const part of DRAW_PARTS) {
    try {
      part();
    } catch (err) {
      message(`Overlay: ${part.name || "Teil"} – ${(err && err.message) || err}`);
    }
  }
  requestAnimationFrame(cornersSet);
  dispatchEvent(new CustomEvent("cast-drawn", { detail: Z }));
}
