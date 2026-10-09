/* CASTING-APP · Steuerseite – Themes: Auswahl, verwalten, anpassen
   Teil 2 von 13; Reihenfolge und Lageplan: control/01-core.js
   (der Server verbindet alle Dateien zu einem Skript – siehe dort) */

/* ---------- Themes ---------- */
function themesDraw() {
  $("themes").innerHTML = "";
  Object.entries(T).forEach(([k, t]) => {
    const b = document.createElement("button");
    b.className = "theme-button"; b.setAttribute("aria-pressed", k === Z.theme);
    const m = Object.assign({}, t, (Z.themeData || {})[k] || {});
    const color = v => /^#[0-9a-f]{3,8}$/i.test(v || "") ? v : "#888";
    b.innerHTML = `<span style="background:${color(m.dark)};border:2px solid ${color(m.accent)};color:${color(m.accent)};font-weight:800">${m.icon ? `<img src="${esc(m.icon)}" alt="">` : esc((m.name || k)[0])}</span>${esc(m.name || k)}`;
    b.onclick = () => themeChoose(k);
    $("themes").appendChild(b);
  });
  $("themeDelete").disabled = !isOwn(Z.theme);
  vsHead();
}

/* ---------- Themes verwalten ---------- */
const isOwn = k => !BUNDLED[k] && !!(Z.ownThemes || {})[k];
function themeFull(k) {                                   // Grundwerte + Anpassungen, ohne Auswahllisten
  const d = Object.assign({}, T[k] || {}, (Z.themeData || {})[k] || {});
  delete d.selection;
  return d;
}
function themeCreate(data, name) {
  Z.ownThemes = Z.ownThemes || {};
  const k = "own-" + Date.now().toString(36);
  Z.ownThemes[k] = Object.assign({}, data, { name });
  return k;
}
function themeChoose(k) {
  const wasDach = Z.theme === "dachcs-official"; Z.theme = k;
  if (k === "dachcs-official" && !wasDach) Z.broadcast.scene = "dach-overview";
  if (k !== "dachcs-official" && wasDach) Z.broadcast.scene = "intro";
  if (typeof dachCardShow === "function") { dachCardShow(); dframeDraw(); } localStorage.setItem("cast-theme-chosen", "1"); themesDraw(); themeAdjust(); sponsorsDraw(); scenesDraw(); send();
  if (wasDach !== (k === "dachcs-official")) setTimeout(() => obsBackgroundVisible(0, 0));   // DACH-Seiten: Hintergrund-Video in OBS aus
  setTimeout(() => { adsSetupDraw(); adsDraw(); videoInfoDraw(); });                        // Videos je Theme
}
$("themeNew").onclick = () => {
  const k = themeCreate(themeFull("regular"), "Neues Theme");
  themeChoose(k); $("themeStatus").textContent = "✓ Neues Theme angelegt – unter „Theme anpassen“ einrichten.";
};
$("themeDup").onclick = () => {
  const source = Z.theme, k = themeCreate(themeFull(source), (themeFull(source).name || source) + " (Kopie)");
  const sponsor = ((Z.sponsors || {}).byTheme || {})[source];
  if (sponsor) Z.sponsors.byTheme[k] = K.clone(sponsor);             // Sponsoren gleich mitnehmen
  themeChoose(k); $("themeStatus").textContent = "✓ Kopie angelegt.";
};
$("themeDelete").onclick = async () => {
  const k = Z.theme;
  if (!isOwn(k)) { $("themeStatus").textContent = "Mitgelieferte Themes lassen sich nicht löschen – nur unter „Theme anpassen“ zurücksetzen."; return; }
  const name = themeFull(k).name || k;
  if (!await confirmDialog({ title: `Theme „${name}“ löschen?`, text: "Farben, Logos und Sponsoren dieses Themes gehen verloren. Tipp: vorher exportieren.", button: "Löschen" })) return;
  const safe = { themeDef: Z.ownThemes[k], td: (Z.themeData || {})[k], sponsor: ((Z.sponsors || {}).byTheme || {})[k] };
  delete Z.ownThemes[k]; if (Z.themeData) delete Z.themeData[k]; if (Z.sponsors && Z.sponsors.byTheme) delete Z.sponsors.byTheme[k];
  themeChoose("regular");
  undo(`Theme „${name}“ gelöscht`, () => {
    Z.ownThemes[k] = safe.themeDef; if (safe.td) Z.themeData[k] = safe.td; if (safe.sponsor) Z.sponsors.byTheme[k] = safe.sponsor;
    themeChoose(k);
  });
};
// Bild-Pfade (mitgelieferte Dateien) für den Export in eingebettete Bilder umwandeln
async function asDataUrl(value) {
  if (typeof value !== "string" || !value || value.startsWith("data:")) return value;
  if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(value) && !value.startsWith("/api/image/")) return value;
  try {
    const b = await (await fetch(value)).blob();
    return await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ok(value); r.readAsDataURL(b); });
  } catch (err) { return value; }
}
$("themeExport").onclick = async () => {
  const d = themeFull(Z.theme);
  for (const k of ["icon", "fontImage", "brandImage", "backgroundImage"]) d[k] = await asDataUrl(d[k]);
  const sponsors = K.clone(((Z.sponsors || {}).byTheme || {})[Z.theme] || []);
  for (const s of sponsors) s.logo = await asDataUrl(s.logo);
  const file = new Blob([JSON.stringify({ format: "casting-app-theme", version: 1, theme: d, sponsors }, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file); a.download = (d.name || "theme").replace(/[^\wäöüÄÖÜß -]+/g, "").trim() + ".casting-theme.json";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  $("themeStatus").textContent = `✓ „${d.name}“ exportiert (Download-Ordner).`;
};
$("themeImport").onclick = () => $("themeFile").click();
$("themeFile").onchange = async () => {
  const f = $("themeFile").files[0]; $("themeFile").value = "";
  if (!f) return;
  try {
    if (f.size > 25e6) throw new Error("Datei zu groß");
    const j = CastLegacy.migrateImport(JSON.parse(await f.text()));
    if (j.format !== "casting-app-theme" || !j.theme || typeof j.theme !== "object") throw new Error("keine Theme-Datei der Casting-App");
    // nur bekannte Felder übernehmen – eine fremde Datei kann so nichts anderes verändern
    const allowed = ["name", "dark", "light", "textDark", "accent", "stroke", "bold", "iconDisk", "corners", "boxStyle", "icon", "fontImage", "brandImage", "brandBox",
                     "backgroundImage", "line1", "line2", "font", "fontFile", "headText", "brandText", "rowsSwap"];
    const d = {};
    // nur einfache Werte (Text, Zahl, ja/nein) – ein Objekt oder eine Liste an dieser Stelle brächte Overlay und Steuerseite zum Absturz
    allowed.forEach(k => { const v = j.theme[k]; if (["string", "number", "boolean"].includes(typeof v)) d[k] = v; });
    if (d.fontFile && !/^fonts\/[^"\\/]+\.(ttf|otf|woff2?)$/i.test(String(d.fontFile))) delete d.fontFile;
    if (d.boxStyle && !["light", "dark", "mixed"].includes(d.boxStyle)) delete d.boxStyle;
    for (const k of Object.keys(d)) if (typeof d[k] === "string" && !/Image$|^icon$/.test(k)) d[k] = d[k].slice(0, 200);
    ["icon", "fontImage", "brandImage", "backgroundImage"].forEach(k => { if (d[k] && !/^(data:image\/|medien\/)/.test(d[k])) delete d[k]; });
    ["dark", "light", "textDark", "accent", "iconDisk", "headText"].forEach(k => { if (d[k] && !/^#[0-9a-f]{3,8}$/i.test(d[k])) delete d[k]; });
    const k = themeCreate(d, String(d.name || "Importiertes Theme").slice(0, 60));
    if (Array.isArray(j.sponsors)) {
      Z.sponsors.byTheme = Z.sponsors.byTheme || {};
      Z.sponsors.byTheme[k] = j.sponsors.slice(0, 40).map(s => ({ name: String(s.name || "").slice(0, 80), logo: /^data:image\//.test(s.logo || "") ? s.logo : "" }));
    }
    themeChoose(k);
    $("themeStatus").textContent = `✓ Theme „${Z.ownThemes[k].name}“ importiert.`;
  } catch (err) { $("themeStatus").textContent = "Import fehlgeschlagen: " + err.message; }
};

/* ---------- Theme anpassen ---------- */
function td() { Z.themeData = Z.themeData || {}; return Z.themeData[Z.theme] = Z.themeData[Z.theme] || {}; }
function tw(p) { const d = (Z.themeData || {})[Z.theme] || {}; return p in d ? d[p] : (T[Z.theme] || {})[p]; }
function imageShrink(file, max, jpeg) {
  return new Promise((ok, error) => {
    const r = new FileReader();
    r.onload = () => {
      if (/svg/.test(file.type)) return ok(r.result);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); ok(jpeg ? c.toDataURL("image/jpeg", .85) : c.toDataURL("image/png"));
      };
      img.onerror = error; img.src = r.result;
    };
    r.onerror = error; r.readAsDataURL(file);
  });
}
function themeAdjust() {
  const box = $("themeAdjust"); box.innerHTML = "";
  const fresh = () => { themesDraw(); send(); };
  const text = (p, label, list) => {
    const l = document.createElement("label"); l.textContent = label;
    const i = document.createElement("input"); i.type = "text"; i.value = tw(p) || "";
    if (list) { i.setAttribute("list", "fontList"); }
    i.oninput = () => { td()[p] = i.value; clearTimeout(i._t); i._t = setTimeout(fresh, 200); };
    l.appendChild(i); return l;
  };
  box.appendChild(text("name", "Name des Themes"));
  const f = document.createElement("div"); f.className = "colors";
  [["dark", "Balken"], ["light", "Felder"], ["textDark", "Schrift auf Feldern"], ["accent", "Akzent"], ["headText", "Schrift in Balken"], ["iconDisk", "Logo-Feld"]].forEach(([p, n]) => {
    const l = document.createElement("label"); l.className = "color";
    const i = document.createElement("input"); i.type = "color"; i.value = tw(p) || "#000000";
    i.oninput = () => { td()[p] = i.value; clearTimeout(i._t); i._t = setTimeout(fresh, 120); };
    l.append(i, n); f.appendChild(l);
  });
  box.appendChild(f);

  const templates = (T[Z.theme] || {}).templates;
  if (templates) {
    const v = document.createElement("div"); v.style.cssText = "display:grid;gap:6px";
    v.innerHTML = `<span class="small">Farbvorlagen</span><div class="line"></div>`;
    Object.entries(templates).forEach(([n, colors]) => {
      const b = document.createElement("button"); b.className = "button"; b.type = "button";
      b.innerHTML = `<span style="display:inline-block;width:14px;height:14px;border-radius:3px;vertical-align:-2px;margin-right:6px;background:${esc(colors.dark)};box-shadow:inset 0 -4px 0 ${esc(colors.accent)}"></span>${esc(n)}`;
      b.onclick = () => { Object.assign(td(), colors); themeAdjust(); fresh(); };
      v.querySelector(".line").appendChild(b);
    });
    box.appendChild(v);
  }
  const cornerChoice = document.createElement("label"); cornerChoice.textContent = "Ecken der Kästen";
  const cornerSel = document.createElement("select");
  [["outside", "Außen gespiegelt (empfohlen)"], ["straight", "Gerade"], ["all", "Alle oben rechts"]].forEach(([v, n]) => cornerSel.appendChild(new Option(n, v, false, (tw("corners") || "outside") === v)));
  cornerSel.onchange = () => { td().corners = cornerSel.value; fresh(); };
  cornerChoice.appendChild(cornerSel); box.appendChild(cornerChoice);
  // 3.0: Box-Stil – hell (wie bisher), dunkel oder Mischung (nur Titel hell); Logo-Felder bleiben immer hell
  const styleChoice = document.createElement("label"); styleChoice.textContent = "Box-Stil";
  const styleSel = document.createElement("select");
  [["light", "Hell – weiße Kästen (Standard)"], ["dark", "Dunkel – dunkle Kästen"], ["mixed", "Mischung – dunkel, nur der Titel hell"]]
    .forEach(([v, n]) => styleSel.appendChild(new Option(n, v, false, (tw("boxStyle") || "light") === v)));
  styleSel.onchange = () => { td().boxStyle = styleSel.value; fresh(); };
  styleChoice.appendChild(styleSel); box.appendChild(styleChoice);
  const lin = document.createElement("label"); lin.className = "toggleSwitch";
  const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!tw("stroke");
  cb.onchange = () => { td().stroke = cb.checked; fresh(); };
  lin.append(cb, "Farbige Linie zwischen Balken und Feld"); box.appendChild(lin);
  const fe = document.createElement("label"); fe.className = "toggleSwitch";
  const fcb = document.createElement("input"); fcb.type = "checkbox"; fcb.checked = tw("bold") !== false;
  fcb.onchange = () => { td().bold = fcb.checked; fresh(); };
  fe.append(fcb, "Schrift extra kräftig"); box.appendChild(fe);

  const image = (p, label, max, jpeg) => {
    const w = document.createElement("div"); w.style.cssText = "display:grid;gap:4px";
    w.innerHTML = `<span class="small">${label}</span><div class="image-row"><div class="image-preview"></div>
      <button class="button">Bild wählen …</button><button class="button">Entfernen</button><button class="button">Standard</button>
      <input type="file" accept="image/*" hidden></div>`;
    const v = w.querySelector(".image-preview"), [choice, away, std] = w.querySelectorAll(".button"), inp = w.querySelector("input");
    const value = tw(p); if (value) v.style.backgroundImage = K.cssUrl(value); else v.textContent = "";
    choice.onclick = () => inp.click();
    inp.onchange = async () => { if (!inp.files[0]) return; td()[p] = await imageShrink(inp.files[0], max, jpeg); themeAdjust(); fresh(); };
    const options = ((T[Z.theme] || {}).selection || {})[p];
    if (options) {
      const s = document.createElement("select");
      s.appendChild(new Option("Aus dem Press Kit …", ""));
      Object.entries(options).forEach(([n, path]) => s.appendChild(new Option(n, path, false, path === tw(p))));
      s.onchange = () => { if (s.value) { td()[p] = s.value; themeAdjust(); fresh(); } };
      w.querySelector(".image-row").prepend(s);
    }
    away.onclick = () => { td()[p] = ""; themeAdjust(); fresh(); };
    std.onclick = () => { delete td()[p]; themeAdjust(); fresh(); };
    return w;
  };
  box.appendChild(image("brandImage", "Komplettes Logo oben links (ersetzt Quadrat + Schriftzug)", 1400));
  const mb = document.createElement("label"); mb.className = "toggleSwitch";
  const mbc = document.createElement("input"); mbc.type = "checkbox"; mbc.checked = !!tw("brandBox");
  mbc.onchange = () => { td().brandBox = mbc.checked; fresh(); };
  mb.append(mbc, "Logo-Bild auf dunklem Kasten zeigen"); box.appendChild(mb);
  box.appendChild(image("icon", "Logo-Feld: Org- oder Streamer-Logo (entfernen = kein Logo-Feld)", 256));
  const z = document.createElement("div"); z.className = "line";
  z.append(text("line1", "Schriftzug Zeile 1"), text("line2", "Zeile 2"));
  box.appendChild(z);
  const zp = document.createElement("div"); zp.className = "line";
  const plChoice = document.createElement("label"); plChoice.textContent = "Platte hinter dem Schriftzug";
  const plSel = document.createElement("select");
  [["light", "Hell (Feldfarbe)"], ["dark", "Dunkel (Balkenfarbe)"]].forEach(([v, n]) => plSel.appendChild(new Option(n, v, false, (tw("brandText") || "light") === v)));
  plSel.onchange = () => { td().brandText = plSel.value; fresh(); };
  plChoice.appendChild(plSel);
  const zt = document.createElement("label"); zt.className = "toggleSwitch";
  const ztc = document.createElement("input"); ztc.type = "checkbox"; ztc.checked = !!tw("rowsSwap");
  ztc.onchange = () => { td().rowsSwap = ztc.checked; fresh(); };
  zt.append(ztc, "Zeile 1 groß, Zeile 2 klein in Akzentfarbe");
  zp.append(plChoice, zt); box.appendChild(zp);
  box.appendChild(image("fontImage", "Oder Schriftzug als Bild (ersetzt die zwei Zeilen)", 900));

  box.appendChild(image("backgroundImage", "Hintergrund, wenn keine Videos laufen", 1920, true));
  box.appendChild(text("font", "Schriftart (auf dem PC installiert)", true));
  const sd = document.createElement("div"); sd.style.cssText = "display:grid;gap:4px";
  sd.innerHTML = `<span class="small">Oder eigene Schriftdatei (.ttf/.otf/.woff2) – vorher in den <b>Schriften-Ordner</b> legen</span>
    <div class="image-row"><select style="flex:1"></select><button class="button">Ordner öffnen</button></div>`;
  const choice = sd.querySelector("select"), [openButton] = sd.querySelectorAll(".button");
  const current = tw("fontFile") || "";
  choice.innerHTML = `<option value="">– keine –</option>` + (current ? `<option value="${esc(current)}" selected>${esc(String(current).replace(/^fonts\//, ""))}</option>` : "");
  fetch("/api/fonts", { cache: "no-store" }).then(r => r.json()).then(d => {
    choice.innerHTML = `<option value="">– keine –</option>` + d.fonts.map(f => `<option value="fonts/${esc(f)}"${"fonts/" + f === current ? " selected" : ""}>${esc(f)}</option>`).join("");
  }).catch(() => {});
  choice.onchange = () => { td().fontFile = choice.value; themeAdjust(); fresh(); };
  openButton.onclick = () => openFolder("fonts");
  box.appendChild(sd);

  const lw = document.createElement("div"); lw.style.cssText = "display:grid;gap:6px";
  lw.innerHTML = `<span class="small">Logo in den Szenen (gilt für alle Themes) – „Auto" zeigt nur das Icon, wenn das ganze Logo nicht passt</span>`;
  [...$("scene").options].forEach(o => {
    const z = document.createElement("div"); z.className = "line"; z.style.alignItems = "center";
    const s = document.createElement("select");
    [["auto", "Auto"], ["full", "Ganzes Logo"], ["icon", "Nur Icon"]].forEach(([v, n]) => s.appendChild(new Option(n, v, false, ((Z.logoMode || {})[o.value] || "auto") === v)));
    s.onchange = () => { Z.logoMode = Z.logoMode || {}; Z.logoMode[o.value] = s.value; send(); };
    const l = document.createElement("span"); l.textContent = o.textContent; l.style.cssText = "flex:1;font-size:13px";
    s.style.flex = "0 0 150px"; z.append(l, s); lw.appendChild(z);
  });
  box.appendChild(lw);
  const r = document.createElement("button"); r.className = "button"; r.textContent = "Dieses Theme auf Standard zurücksetzen";
  r.onclick = async () => { if (await confirmDialog({ title: "Theme zurücksetzen?", text: "Alle Anpassungen an diesem Theme (Farben, Logos, Schrift) gehen verloren.", button: "Zurücksetzen" })) { delete Z.themeData[Z.theme]; themeAdjust(); fresh(); } };
  box.appendChild(r);
}
