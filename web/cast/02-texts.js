/* cast/02-texts.js · Texte aus dem Zustand (data-t) und der Lauftext (Teil von cast.js, siehe cast/01-base.js) */
/* ---------- Texte ---------- */
function texts() {
  $$("[data-t]").forEach(e => {
    const v = pull(e.dataset.t);
    if (e.textContent !== String(v ?? "")) e.textContent = v ?? "";
  });
}
// Text an die Box anpassen: erst verkleinern; müsste ein Teamname stärker als auf 70 % schrumpfen
// und gibt es ein Kürzel, steht stattdessen das Kürzel da (in voller Größe, wenn es passt).
const FIT_SHORT_BELOW = 0.7;
// Gemessen wird nur bei neuem Text, neuer Schrift oder anderer Kastenbreite (jeder Schritt erzwingt ein Layout) –
// force: nach dem Laden einer Schrift (gleiche Texte, andere Breite)
function fit(force) {
  const th = themeData() || {},
    font = [Z.theme, th.font, th.fontFile, th.bold].join("|"); // Schrift ändert die Breite
  $$("[data-matching]").forEach(e => {
    const names = [...e.querySelectorAll("[data-team-name]"), ...(e.matches("[data-team-name]") ? [e] : [])];
    const key =
      (names.length
        ? names.map(n => (n.dataset.full || "") + "\u0001" + (n.dataset.short || "")).join("|")
        : e.textContent) +
      "|" +
      font +
      "|" +
      (e.parentElement ? e.parentElement.clientWidth : 0);
    if (!force && e._fitKey === key) return;
    e._fitKey = key;
    names.forEach(n => {
      if (n.dataset.full !== undefined && n.textContent !== n.dataset.full) n.textContent = n.dataset.full;
    });
    const shrink = () => {
      e.style.fontSize = "";
      const box = e.parentElement,
        start = parseFloat(getComputedStyle(e).fontSize);
      let s = start;
      while (e.scrollWidth > box.clientWidth - 30 && s > 16) {
        s -= 2;
        e.style.fontSize = s + "px";
      }
      return s / start;
    };
    if (shrink() < FIT_SHORT_BELOW && names.some(n => n.dataset.short)) {
      names.forEach(n => {
        if (n.dataset.short) n.textContent = n.dataset.short;
      });
      shrink();
    }
  });
}

/* ---------- Lauftext ---------- */
function ticker() {
  const list = (Z.texts.ticker || []).filter(Boolean);
  const S = Z.sponsors || {};
  if (S.on !== false && S.inTicker)
    sponsorList().forEach(s => {
      if (s.name) list.push(`${Z.texts.sponsorTicker} ${s.name}`);
    });
  const th = themeData(); // Schrift ändert die Breite – dann neu messen
  const keyName = list.join("\u0001") + "|" + Z.texts.tickerTempo + "|" + [th.font, th.fontFile, th.bold].join("|");
  $$(".ticker").forEach(t => {
    if (!newNeeded(t, keyName)) return;
    t.getAnimations({ subtree: true }).forEach(a => a.cancel());
    t.innerHTML = "";
    if (!list.length) return;
    const band = document.createElement("div");
    band.className = "ticker-band";
    const once = list.map(x => `<span>${esc(x)}</span><i></i>`).join("");
    band.innerHTML = once;
    t.appendChild(band);
    // so oft wiederholen, bis das Band doppelt so breit ist wie der Kasten
    const width = band.scrollWidth || 1;
    // für die breiteste mögliche Box reichen (Kästen können beim Szenenwechsel breiter werden)
    const times = Math.max(1, Math.ceil(Math.max(t.clientWidth, 1920) / width));
    band.innerHTML = once.repeat(times * 2);
    const distance = width * times;
    const duration = (distance / Math.max(20, Z.texts.tickerTempo || 90)) * 1000;
    band.animate([{ transform: "translate3d(0,0,0)" }, { transform: `translate3d(${-distance}px,0,0)` }], {
      duration: duration,
      iterations: Infinity,
      easing: "linear",
    });
  });
}
