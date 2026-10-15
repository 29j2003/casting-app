/* =====================================================================
   CASTING-APP · Zeichnen der Overlays (läuft in jeder Szene und in overlay.html)
   Liest den Zustand Z (von der Steuerseite) und zeichnet alles, was eine
   Szene zeigt: Theme und Marke, Teams, Veto, Serie, Sponsoren, Turnierbaum,
   CS2-Livedaten, Einblendungen, Kameras/Quellen, Hintergrund-Videos, Musik.
   Grundregeln:
     · newNeeded(el, key): ein Teil wird nur neu gezeichnet, wenn sich sein
       Schlüssel geändert hat – das hält die Last in OBS klein.
     · data-t="texts.title" auf einem Element = Text aus dem Zustand (Pfad).
     · Hinweise für den Bediener nur in der Vorschau (body.idle), nie im Stream.
     · Feste Wörter im Overlay kommen aus K.word(Z, …) (Sprache der Overlays).
   URL-Schalter: ?preview=1 (Vorschau der Steuerseite), ?embedded=1 (in
   overlay.html eingebettet), ?test=1 (Beispiel-Musik zum Testen).

   Aufbau: Die Dateien web/cast/NN-*.js sind EIN Skript. Der Server hängt sie
   in Namensreihenfolge aneinander und liefert sie als /cast.js aus, verpackt in
   (function () { "use strict"; … })() – alles hier ist also nur innerhalb des
   Overlays sichtbar, nicht global. Eine Funktion darf in einer späteren Datei
   stehen als ihr Aufruf; `const`/`let` müssen aber vor ihrer ersten Nutzung
   beim Laden stehen (Start passiert erst ganz am Ende, cast/15-connection.js).
     01 Grundlagen & Theme   02 Texte & Lauftext   03 Teams, Veto, Serie
     04 Sponsoren            05 Turnier            06 CS2-Livedaten
     07 Einblendungen        08 Spieler & Teams-Vorstellung    09 Ton
     10 Quellen (Kameras)    11 Timer & Diagnose   12 Hintergrund & Clips
     13 Werbung & Musik      14 Alles zeichnen     15 Verbindung & Start
   Neues Overlay-Teil: eigene Datei (oder passende Datei), Zeichnen-Funktion
   in DRAW_PARTS (cast/14-draw.js) eintragen – siehe docs/ENTWICKLUNG.md.
   ===================================================================== */
const K = window.CastCore;
const P = new URLSearchParams(location.search);
const TEST = P.get("test") === "1";
const PREVIEW = P.get("preview") === "1";
// eingebettet = Szene läuft in overlay.html (eine Browserquelle für alles)
const EMBEDDED = P.get("embedded") === "1";
// Studio-Modus der Steuerseite: diese Vorschau zeigt die als Nächstes gewählte Szene statt der laufenden (nur Vorschau)
const studioScene = k => (/^[a-z0-9-]{2,40}$/.test(k || "") ? k : "");
let STUDIO = PREVIEW ? studioScene(P.get("studio")) : ""; // wechselt per Nachricht (cast: "studio"), ohne Neuladen
if (PREVIEW) document.body.classList.add("idle");
if (EMBEDDED) document.body.classList.add("embedded", "waiting");

let rawState = K.load(); // Zustand mit Bild-Verweisen (klein)
let Z = K.resolve(rawState, K.Images.mem); // Zustand mit echten Bildern (zum Zeichnen)
const $$ = s => [...document.querySelectorAll(s)];
const esc = K.esc;
const teamKey = v => (v === "a" || v === "b" ? v : ""); // Team-Schlüssel aus dem Zustand: nur "a"/"b" (Klassen, Attribute)
const pull = path => path.split(".").reduce((o, k) => (o == null ? o : o[k]), Z);

/* ---------- Theme ---------- */
function rgb(hex) {
  const m = String(hex)
    .replace("#", "")
    .match(/^([0-9a-f]{6})$/i);
  if (!m) return "255,255,255";
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
// Jedes Element merkt sich, womit es gezeichnet wurde – so bleiben weiterverwendete Teile
// beim Szenenwechsel unangetastet (Lauftext läuft weiter, Logos flackern nicht).
const newNeeded = (el, cacheKey) => {
  if (el._cacheKey === cacheKey) return false;
  el._cacheKey = cacheKey;
  return true;
};
// Akzentfarbe so weit abdunkeln, bis sie auf dem hellen Feld gut lesbar ist (Kontrast ≥ 3)
function readable(accent, light) {
  const hex = h => {
    const m = String(h).replace("#", "");
    const n = parseInt(
      m.length === 3
        ? m
            .split("")
            .map(x => x + x)
            .join("")
        : m,
      16
    );
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const lum = ([r, g, b]) => {
    const f = v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (a, b) => {
    const x = lum(a),
      y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  let color = hex(accent);
  const bg = hex(light || "#f6f6f6");
  for (let i = 0; i < 40 && contrast(color, bg) < 3; i++) color = color.map(v => Math.round(v * 0.9));
  return `rgb(${color.join(",")})`;
}
const loadedFonts = {};
function themeData() {
  const base =
    (window.CAST_THEMES || {})[Z.theme] ||
    (Z.ownThemes || {})[Z.theme] ||
    Object.values(window.CAST_THEMES || {})[0] ||
    {};
  return Object.assign({}, base, (Z.themeData || {})[Z.theme] || {});
}
function fontSet(T) {
  const r = document.documentElement.style;
  const stack = '"Rajdhani", "Bahnschrift", "Barlow Ersatz", "Arial Narrow", sans-serif';
  r.setProperty("--bold", T.bold === false ? "0px" : ".022em");
  if (T.fontFile) {
    const name = "ThemeSchrift-" + String(T.fontFile).replace(/[^a-z0-9]/gi, "");
    r.setProperty("--font", `"${name}", ${stack}`);
    if (!loadedFonts[name]) {
      loadedFonts[name] = true;
      const f = new FontFace(name, K.cssUrl(T.fontFile), { weight: "100 900" });
      f.load()
        .then(ff => {
          document.fonts.add(ff);
          $$(".ticker").forEach(t => {
            t._cacheKey = null;
          });
          ticker();
          fit(true);
        })
        .catch(() => {});
    }
  } else if (T.font) {
    r.setProperty("--font", `"${String(T.font).replace(/"/g, "")}", ${stack}`);
  } else r.setProperty("--font", stack);
}
const currentSceneName = () => document.body.dataset.currentscene || document.body.dataset.scene || "";
function brandDraw(m, T, onlyIcon) {
  m.classList.toggle("only-icon", onlyIcon);
  m.classList.toggle("with-image", !onlyIcon && !!T.brandImage && !T.brandBox);
  m.classList.toggle("text-dark", T.brandText === "dark");
  m.classList.toggle("rows-swap", !!T.rowsSwap);
  m.classList.toggle("box-on", !onlyIcon && !!(T.brandImage && T.brandBox));
  if (onlyIcon) {
    m.classList.remove("without-icon");
    m.innerHTML = `<div class="brand-icon"><img src="${esc(T.icon)}" alt=""></div>`;
    return;
  }
  if (T.brandImage) {
    m.classList.remove("without-icon");
    m.innerHTML = `<img class="brand-image" src="${esc(T.brandImage)}" alt="">`;
    return;
  }
  m.classList.toggle("without-icon", !T.icon);
  m.innerHTML =
    `<div class="brand-icon">${T.icon ? `<img src="${esc(T.icon)}" alt="">` : ""}</div><div class="brand-text">` +
    (T.fontImage
      ? `<img src="${esc(T.fontImage)}" alt="">`
      : `<div class="z1">${esc(T.line1)}</div><div class="z2">${esc(T.line2)}</div>`) +
    `</div>`;
}
function theme() {
  const T = themeData();
  const r = document.documentElement.style;
  r.setProperty("--dark", T.dark);
  r.setProperty("--light", T.light);
  r.setProperty("--text-dark", T.textDark);
  r.setProperty("--accent", T.accent);
  r.setProperty("--paper", T.light);
  r.setProperty("--paper-text", T.textDark); // Logo-Felder bleiben hell (Box-Stil)
  const boxStyle = ["dark", "mixed"].includes(T.boxStyle) ? T.boxStyle : "";
  if ((document.body.dataset.boxstyle || "") !== boxStyle) {
    if (boxStyle) document.body.dataset.boxstyle = boxStyle;
    else delete document.body.dataset.boxstyle;
  }
  r.setProperty("--accent-rgb", rgb(T.accent));
  r.setProperty("--accent-readable", readable(T.accent, T.light));
  r.setProperty("--line", T.stroke ? "5px" : "0px");
  r.setProperty("--icon-disk", T.iconDisk || T.dark);
  r.setProperty("--head-text", T.headText || T.accent);
  document.body.dataset.corners = T.corners || "outside";
  document.body.className = document.body.className.replace(/\btheme-\S+/g, "").trim() + " theme-" + Z.theme;
  fontSet(T);
  const mode = (Z.logoMode || {})[currentSceneName()] || "auto";
  const keyName = JSON.stringify([Z.theme, T.icon, T.fontImage, T.brandImage, T.brandBox, T.line1, T.line2, mode]);
  $$(".brand").forEach(m => {
    if (!newNeeded(m, keyName + "|" + (m.dataset.max || ""))) return;
    const max = +m.dataset.max || 0;
    const onlyIcon = mode === "icon" && !!T.icon;
    brandDraw(m, T, onlyIcon);
    // Passt das volle Logo nicht in den freien Platz (data-max), wird es kleiner (--brand-scale, gleitet beim Szenenwechsel);
    // nur wenn es dafür zu stark schrumpfen müsste (unter 55 %), zeigt „auto" das Icon allein
    m.style.removeProperty("--brand-scale");
    if (max) {
      const check = () => {
        const w = m.offsetWidth,
          s = w > max ? max / w : 1;
        if (s < 0.55 && mode === "auto" && T.icon) brandDraw(m, T, true);
        else if (s < 1) m.style.setProperty("--brand-scale", s.toFixed(3));
      };
      const images = [...m.querySelectorAll("img")].filter(i => !i.complete);
      if (images.length) images.forEach(i => i.addEventListener("load", check, { once: true }));
      else check();
    }
  });
  $$(".bg-empty").forEach(h => {
    if (!newNeeded(h, keyName + "|" + T.backgroundImage)) return;
    const i = h.querySelector("img");
    if (i) {
      if (T.icon) {
        i.src = T.icon;
        i.classList.remove("off");
      } else i.classList.add("off");
    }
    h.classList.toggle("with-image", !!T.backgroundImage);
    h.style.backgroundImage = T.backgroundImage ? K.cssUrl(T.backgroundImage) : "";
  });
}
