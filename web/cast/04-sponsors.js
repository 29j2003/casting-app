/* cast/04-sponsors.js · Sponsoren (Box, Leiste, Lauftext) (Teil von cast.js, siehe cast/01-base.js) */
/* ---------- Sponsoren ---------- */

function sponsorList() {
  return (((Z.sponsors || {}).byTheme || {})[Z.theme] || []).filter(s => s && (s.logo || s.name));
}
const sponsorContent = s =>
  s.logo ? `<img src="${esc(s.logo)}" alt="${esc(s.name || "")}">` : `<div class="sponsor-name">${esc(s.name)}</div>`;
let sponsorTimerCachekey = null,
  sponsorTimer = null,
  sponsorNum = 0;
function sponsors() {
  const S = Z.sponsors || {},
    list = sponsorList();
  const boxes = $$(".sponsor");
  const visible = S.on !== false && (S.sceneList || {})[currentSceneName()] !== false && list.length > 0;
  const spot = S.spot === "top" ? "top" : "bar"; // Platz: in der unteren Leiste (3.0) oder oben rechts
  const keyName = JSON.stringify([list, S.seconds, visible, S.bar === true, spot]);
  if (document.body.dataset.sponsorspot !== spot) document.body.dataset.sponsorspot = spot;
  const bar = S.bar === true && list.length > 1;
  // kein Sponsor in dieser Szene: die Leiste ohne Lücke (rückt auf die mittigen Plätze ohne Sponsor)
  if (document.body.dataset.sponsorshown !== (visible ? "1" : "0"))
    document.body.dataset.sponsorshown = visible ? "1" : "0";
  boxes.forEach(b => {
    b.classList.toggle("on", visible);
    let line = b.querySelector(".sponsor-bar");
    if (!line) {
      line = document.createElement("i");
      line.className = "sponsor-bar";
      b.appendChild(line);
    }
    line.hidden = !bar;
    if (!newNeeded(b, keyName)) return;
    const field = b.querySelector(".sponsor-field");
    field.innerHTML = list.map(sponsorContent).join("");
    const children = [...field.children];
    if (children.length) children[sponsorNum % children.length].classList.add("on");
    // Name ohne Logo in der Leiste: so groß wie möglich; zu lange Namen schrumpfen, ab halber Größe auf zwei Zeilen
    if (b.classList.contains("in-bar"))
      field.querySelectorAll(".sponsor-name").forEach(e => {
        const start = parseFloat(getComputedStyle(e).fontSize);
        const tooBig = () => e.scrollWidth > e.clientWidth || e.scrollHeight > e.clientHeight;
        let s = start;
        while (e.clientWidth && tooBig() && s > 16) {
          s -= 2;
          e.style.fontSize = s + "px";
          if (s < start * 0.6 && e.style.whiteSpace !== "normal") {
            e.style.whiteSpace = "normal";
            s = start * 0.7;
            e.style.fontSize = s + "px";
          }
        }
      });
  });
  if (keyName !== sponsorTimerCachekey) {
    sponsorTimerCachekey = keyName;
    clearInterval(sponsorTimer);
    sponsorTimer = null;
    if (sponsorNum >= list.length) sponsorNum = 0;
    const seconds = Math.max(3, S.seconds || 8);
    // Restzeit-Balken: läuft einmal je Logo von links nach rechts (nur sichtbar und nur mit mehreren Logos)
    const barRestart = () =>
      $$(".sponsor-bar").forEach(e => {
        e.style.animation = "none";
        void e.offsetWidth;
        e.style.animation = `sponsor-bar ${seconds}s linear forwards`;
      });
    if (visible && list.length > 1) {
      if (bar) barRestart();
      sponsorTimer = setInterval(() => {
        sponsorNum = (sponsorNum + 1) % list.length;
        $$(".sponsor").forEach(b =>
          [...b.querySelector(".sponsor-field").children].forEach((k, i) => k.classList.toggle("on", i === sponsorNum))
        );
        if (bar) barRestart();
      }, seconds * 1000);
    }
  }
  {
    // Raster-Szene
    $$(".sponsor-grid").forEach(r => {
      if (!newNeeded(r, keyName)) return;
      r.innerHTML = list.length
        ? list.map(s => `<div class="sponsor-tile">${sponsorContent(s)}</div>`).join("")
        : `<div class="empty-hint">${esc(K.word(Z, "noSponsors"))}</div>`;
    });
  }
  // große Einblendung (in allen Szenen)
  let large = document.querySelector(".sponsor-large");
  if (EMBEDDED) return;
  if (!large) {
    large = document.createElement("div");
    large.className = "box sponsor-large";
    large.innerHTML = `<div class="box-head"></div><div class="sponsor-field"></div>`;
    document.body.appendChild(large);
  }
  const E = S.gfx || {},
    s = list[E.num];
  const active = s && E.until > Date.now();
  if (active) {
    large.querySelector(".box-head").textContent = Z.texts.sponsorLabel;
    const f = large.querySelector(".sponsor-field"),
      fresh = sponsorContent(s);
    if (f.dataset.content !== fresh) {
      f.dataset.content = fresh;
      f.innerHTML = fresh;
    }
    clearTimeout(large._off);
    large._off = setTimeout(sponsors, E.until - Date.now() + 50);
  }
  large.classList.toggle("on", !!active);
}
