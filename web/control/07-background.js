/* CASTING-APP · Steuerseite – Hintergrund-Videos über OBS
   Teil 7 von 13; Reihenfolge und Lageplan: control/01-core.js
   (der Server verbindet alle Dateien zu einem Skript – siehe dort) */

/* ---------- Hintergrund-Videos über OBS ---------- */
const BG_NAME = "Cast – Hintergrund";
function bgSourceDraw() {
  const q = (Z.background || {}).source === "obs" || (Z.background || {}).transparent ? "obs" : "overlay";
  document.querySelectorAll("#bgSource button").forEach(b => b.setAttribute("aria-pressed", b.dataset.q === q));
  $("bgObs").hidden = q !== "obs";
}
document.querySelectorAll("#bgSource button").forEach(b => b.onclick = () => {
  Z.background.source = b.dataset.q; Z.background.transparent = false;
  bgSourceDraw(); videoInfoDraw(); send();
  if (b.dataset.q === "obs") obsBackground(true);
});
async function obsBackground(idle) {
  const H = Z.background || {}, st = $("bgStatus");
  if (H.source !== "obs") return;
  if (!channel.obs.isOpen) { if (!idle) st.textContent = "Erst mit OBS verbinden (⚙ App-Einstellungen)."; return; }
  try {
    const info = await (await fetch("/api/videos", { cache: "no-store" })).json();
    const sep = info.folder.includes("\\") ? "\\" : "/";
    const files = (H.videos || []).map(p => info.folder + sep + p.replace(/^(media|medien)\/videos\//, ""));
    if (!files.length) { st.textContent = "Erst unten Videos anhaken."; return; }
    const kinds = (await channel.obs.question("GetInputKindList", { unversioned: true })).inputKinds || [];
    const list = files.length > 1 && kinds.includes("vlc_source");
    const kind = list ? "vlc_source" : "ffmpeg_source";
    const settings = list
      ? { playlist: files.map(f => ({ value: f, hidden: false, selected: false })), loop: true, shuffle: false }
      : { is_local_file: true, local_file: files[0], looping: true, restart_on_activate: false, close_when_inactive: false, hw_decode: true };
    const vid = await channel.obs.question("GetVideoSettings");
    const present = ((await channel.obs.question("GetInputList", {})).inputs || []).find(i => i.inputName === BG_NAME);
    const wrongKind = present && (present.unversionedInputKind || present.inputKind) !== kind;
    if (idle) {                                         // automatisch: nur eine vorhandene Quelle nachziehen
      if (present && !wrongKind) { await channel.obs.question("SetInputSettings", { inputName: BG_NAME, inputSettings: settings, overlay: true }); st.textContent = "✓ Videoauswahl an OBS übergeben"; }
      else st.textContent = "Noch nicht in OBS eingerichtet – „In OBS einrichten“ klicken.";
      return;
    }
    const scenesPlan = onSource() ? ["Cast – Sendung"] : OVERLAY_SCENES.filter(([k]) => k !== "ingame" && sceneCfg().list[k].on && sceneCfg().list[k].obs).map(([k]) => sceneCfg().list[k].obs);
    const ok = await confirmDialog({
      title: "Das passiert jetzt in OBS",
      list: [
        wrongKind ? { text: `Vorhandene Quelle „${BG_NAME}“ wird durch eine ${list ? "VLC-Wiedergabeliste" : "Medienquelle"} ersetzt`, warn: true }
          : present ? { text: `Vorhandene Quelle „${BG_NAME}“ bekommt die ausgewählten Videos`, warn: true } : `${list ? "VLC-Wiedergabeliste" : "Medienquelle"} „${BG_NAME}“ anlegen (${files.length} Video${files.length > 1 ? "s" : ""}, in Schleife)`,
        `In ${scenesPlan.length ? scenesPlan.map(s => "„" + s + "“").join(", ") : "keine Szene (erst Szenen einrichten)"} direkt unter das Overlay legen, bildfüllend`,
        onSource() ? `In der Szene „Ingame“ wird sie automatisch weich ausgeblendet (Filter „${BG_FADE}“)` : "In der Ingame-Szene wird sie nicht eingefügt"
      ], button: "In OBS ausführen"
    });
    if (!ok) { st.textContent = "Abgebrochen – in OBS wurde nichts geändert."; return "cancelled"; }
    if (wrongKind) await channel.obs.question("RemoveInput", { inputName: BG_NAME });
    const givesEs = present && !wrongKind;
    if (givesEs) await channel.obs.question("SetInputSettings", { inputName: BG_NAME, inputSettings: settings, overlay: true });
    await scenesLoad();
    const c = sceneCfg();
    const sceneList = onSource() ? ["Cast – Sendung"] : OVERLAY_SCENES.filter(([k]) => k !== "ingame" && c.list[k].on && c.list[k].obs).map(([k]) => c.list[k].obs);
    let created = givesEs, n = 0;
    for (const scene of sceneList.filter(s => obsScenes.includes(s))) {
      let items = (await channel.obs.question("GetSceneItemList", { sceneName: scene })).sceneItems || [];
      if (!items.some(i => i.sourceName === BG_NAME)) {
        if (!created) { await channel.obs.question("CreateInput", { sceneName: scene, inputName: BG_NAME, inputKind: kind, inputSettings: settings }); created = true; }
        else await channel.obs.question("CreateSceneItem", { sceneName: scene, sourceName: BG_NAME });
        items = (await channel.obs.question("GetSceneItemList", { sceneName: scene })).sceneItems || [];
      }
      const bg = items.find(i => i.sourceName === BG_NAME), ov = items.find(i => /Overlay\)?$/.test(i.sourceName) || i.sourceName === "Cast – Overlay");
      // direkt unter das Overlay legen, bildfüllend
      if (bg && ov && bg.sceneItemIndex > ov.sceneItemIndex) await channel.obs.question("SetSceneItemIndex", { sceneName: scene, sceneItemId: bg.sceneItemId, sceneItemIndex: ov.sceneItemIndex });
      if (bg) await channel.obs.question("SetSceneItemTransform", { sceneName: scene, sceneItemId: bg.sceneItemId, sceneItemTransform: {
        positionX: 0, positionY: 0, boundsType: "OBS_BOUNDS_SCALE_OUTER", boundsWidth: vid.baseWidth || 1920, boundsHeight: vid.baseHeight || 1080, boundsAlignment: 0 } });
      n++;
    }
    st.textContent = n ? `✓ OBS spielt die Videos ab (${list ? "Wiedergabeliste" : "Medienquelle"} „${BG_NAME}“ in ${n} Szene(n))` + (files.length > 1 && !list ? " – für mehrere Videos bitte VLC installieren, sonst läuft nur das erste." : "")
                     : "Keine passende OBS-Szene gefunden – erst „Szenen einrichten“.";
  } catch (err) { st.textContent = "OBS: " + err.message; }
}
$("bgSetup").onclick = () => obsBackground(false);
// in der Ingame-Szene (eine Browserquelle) muss das Hintergrund-Video in OBS unsichtbar sein, in jeder anderen sichtbar.
// Der Zustand richtet sich immer nach der Szene, die beim Ausführen läuft – ein schneller Wechsel zurück lässt das Video
// so nie versteckt zurück. Weich: der Deckkraft-Filter „Cast – Blende“ (Farbkorrektur) an der Quelle blendet in der
// Dauer des Übergangs aus bzw. ein; erst danach wird die Quelle versteckt (Filter wieder auf 100 %). Ohne Filter
// (z. B. ältere OBS-Version) wird hart umgeschaltet.
const BG_FADE = "Cast – Blende";
let bgVisibleTimer = null, bgFadeRun = 0, bgOpacity = 1, bgFilterReady = false;
// delay: ms bis zum Umschalten (Stinger: unter dem Stinger), fade: Dauer der Blende in ms (0 = sofort)
function obsBackgroundVisible(delay, fade) {
  clearTimeout(bgVisibleTimer);
  bgFadeRun++;                                            // eine laufende Blende hört auf – die neue setzt dort an
  bgVisibleTimer = setTimeout(() => obsBackgroundSync(fade || 0), delay || 0);
}
async function bgFadeFilter() {
  if (bgFilterReady) return true;
  try {
    const f = await channel.obs.question("GetSourceFilter", { sourceName: BG_NAME, filterName: BG_FADE });
    bgOpacity = Number((f.filterSettings || {}).opacity ?? 1);
  } catch (err) {
    try {
      await channel.obs.question("CreateSourceFilter", { sourceName: BG_NAME, filterName: BG_FADE, filterKind: "color_filter_v2", filterSettings: { opacity: 1 } });
      bgOpacity = 1;
    } catch (err2) { return false; }
  }
  return (bgFilterReady = true);
}
async function bgOpacitySet(v) {
  bgOpacity = v;
  await channel.obs.question("SetSourceFilterSettings", { sourceName: BG_NAME, filterName: BG_FADE, filterSettings: { opacity: Math.round(v * 1000) / 1000 }, overlay: true });
}
// Deckkraft in Schritten (~30 pro Sekunde, weicher Verlauf) zum Ziel – bricht ab, sobald ein neuer Wechsel kommt
async function bgOpacityTo(target, ms, run) {
  const from = bgOpacity, t0 = performance.now(), span = ms * Math.abs(target - from);
  while (run === bgFadeRun) {
    const p = span > 0 ? Math.min(1, (performance.now() - t0) / span) : 1;
    await bgOpacitySet(from + (target - from) * (p < .5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2));
    if (p >= 1) return true;
    await new Promise(ok => setTimeout(ok, 33));
  }
  return false;
}
async function bgMedia(action) {
  try { await channel.obs.question("TriggerMediaInputAction", { inputName: BG_NAME, mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_" + action }); } catch (err) {}
}
async function obsBackgroundSync(fade) {
  if ((Z.background || {}).source !== "obs" || !onSource() || !channel.obs.isOpen) return;
  // aus: in Ingame (Spielbild) und bei DACH CS – Offiziell (die DACH-Seiten haben einen eigenen Hintergrund)
  const run = bgFadeRun, on = Z.broadcast.scene !== "ingame" && !/^dach-/.test(Z.broadcast.scene || "") && !dachMode(), scene = "Cast – Sendung";
  try {
    const { sceneItemId } = await channel.obs.question("GetSceneItemId", { sceneName: scene, sourceName: BG_NAME });
    const { sceneItemEnabled } = await channel.obs.question("GetSceneItemEnabled", { sceneName: scene, sceneItemId });
    const soft = await bgFadeFilter();
    if (run !== bgFadeRun) return;
    if (!on && !sceneItemEnabled) return;                                       // schon versteckt
    if (on && sceneItemEnabled && (!soft || bgOpacity >= 1)) return;              // schon ganz zu sehen
    if (on) {
      if (!sceneItemEnabled) {
        if (soft && fade) await bgOpacitySet(0);
        await bgMedia("PLAY");                                                   // läuft weiter, wo es angehalten wurde
        await channel.obs.question("SetSceneItemEnabled", { sceneName: scene, sceneItemId, sceneItemEnabled: true });
      }
      if (soft) await bgOpacityTo(1, fade, run);
      return;
    }
    if (soft && fade && !(await bgOpacityTo(0, fade, run))) return;            // abgebrochen: der neue Wechsel übernimmt
    await channel.obs.question("SetSceneItemEnabled", { sceneName: scene, sceneItemId, sceneItemEnabled: false });
    if (soft) await bgOpacitySet(1);                                            // versteckt wieder auf 100 % – nie unsichtbar „an“
    await bgMedia("PAUSE");                                                     // versteckt: anhalten, spart Leistung
  } catch (err) {}
}

// Spielt OBS das Video ab, zeigt die Vorschau im App-Fenster dieselbe Stelle: alle 4 s fragt die Steuerseite OBS nach
// der Position und gibt sie an die Vorschau weiter (nur bei einem einzelnen Video in Schleife – wie es OBS abspielt)
setInterval(async () => {
  const H = Z.background || {};
  if (H.source !== "obs" || !onSource() || !channel.obs.isOpen || document.hidden || (H.videos || []).length !== 1) return;
  try {
    const m = await channel.obs.question("GetMediaInputStatus", { inputName: BG_NAME });
    if (m.mediaState !== "OBS_MEDIA_STATE_PLAYING" || !(m.mediaCursor >= 0)) return;
    const note = { cast: "bg-sync", cursor: m.mediaCursor, at: Date.now() };
    [$("frame"), $("studioFrame")].forEach(f => { try { if (f && f.contentWindow) f.contentWindow.postMessage(note, location.origin); } catch (err) {} });
  } catch (err) {}
}, 4000);

/* ---------- Playlisten ----------
   Z.background.playlists = [{ id, name, kind: "loop"|"list"|"clips", videos: [Pfade], order: "seq"|"shuffle",
     transition: "cut"|"fade"|"black", fade: ms, audio, scenes: [Szenen-Schlüssel] }].
   Je Szene läuft die Playlist, in deren scenes sie steht (Clips nie von selbst); die Ecke in Live kann das für die
   laufende Szene ändern (override, gilt bis zum nächsten Szenenwechsel). bgApply() schreibt das Ergebnis nach
   Z.background.videos/play – das liest das Overlay (cast.js: background()).
   Ton: Standard ist der Haken der Playlist („Ton der Videos abspielen“); je Szene lässt er sich in Live ändern
   (Z.background.sceneAudio[szene] = true|false). Das Ergebnis steht in Z.background.play.audio – das Overlay spielt
   danach mit oder ohne Ton, spielt OBS ab, schaltet die App „Cast – Hintergrund“ in OBS laut bzw. stumm. */
let bgChosen = "";
function bgPlaylists() {
  const H = Z.background;
  if (!Array.isArray(H.playlists)) H.playlists = [];
  if (!H.playlists.length) {                              // bis 2.6: eine Auswahl angehakter Videos → Playlist „Standard"
    const v = (H.videos || []).filter(Boolean);
    H.playlists.push({ id: "p" + Date.now().toString(36), name: "Standard", kind: v.length > 1 ? "list" : "loop", videos: v, order: "seq",
      transition: "fade", fade: 1200, audio: false, scenes: OVERLAY_SCENES.map(([k]) => k).filter(k => k !== "ingame") });
  }
  return H.playlists;
}
const bgList = id => bgPlaylists().find(p => p.id === id) || null;
// Ton des Hintergrunds in Szene k: eigene Wahl der Szene, sonst der Haken ihrer Playlist
function bgAudioFor(k) {
  const own = (Z.background.sceneAudio || {})[k];
  if (typeof own === "boolean") return own;
  const p = bgForScene(k); return !!(p && p.audio);
}
function bgForScene(k) {
  const o = Z.background.override;
  if (o && o.scene === k) return bgList(o.id);
  return bgPlaylists().find(p => p.kind !== "clips" && (p.scenes || []).includes(k)) || null;
}
// was im Programm laufen soll – vor dem Senden aufrufen (Szenenwechsel, Änderung an einer Playlist)
function bgApply(k) {
  const H = Z.background, p = bgForScene(k ?? sceneNow());
  const before = JSON.stringify(H.videos || []);
  H.videos = p ? (p.kind === "loop" ? p.videos.slice(0, 1) : p.videos.slice()) : [];
  // since: Start der Playlist – OBS-Browserquelle und Vorschau rechnen daraus dieselbe Stelle im Video (Gleichlauf)
  const since = JSON.stringify(H.videos) === before && (H.play || {}).since ? H.play.since : Date.now();
  H.play = p ? { order: p.order || "seq", transition: p.transition || "fade", fade: p.fade ?? 1200, since, audio: bgAudioFor(k ?? sceneNow()) } : {};
  H.active = p ? p.id : "";
  setTimeout(obsBackgroundAudio, 0);
  if (JSON.stringify(H.videos) !== before) setTimeout(() => obsBackground(true), 0);
  bgCornerDraw();
}
// Spielt OBS das Video ab: „Cast – Hintergrund“ je nach Szene laut oder stumm (nur bei einer Änderung)
let bgAudioSent = "";
async function obsBackgroundAudio() {
  const H = Z.background || {};
  if (H.source !== "obs" || !channel.obs.isOpen) return;
  const mute = !(H.play || {}).audio || dachMode() || Z.broadcast.scene === "ingame";
  if (bgAudioSent === String(mute)) return;
  try { await channel.obs.question("SetInputMute", { inputName: BG_NAME, inputMuted: mute }); bgAudioSent = String(mute); } catch (err) {}
}
function bgDraw() {
  const lists = bgPlaylists();
  if (!bgList(bgChosen)) bgChosen = lists[0].id;
  const box = $("bgLists"); box.innerHTML = "";
  lists.forEach(p => {
    const b = document.createElement("button"); b.type = "button"; b.className = "bg-list" + (p.id === bgChosen ? " on" : "");
    const n = (p.scenes || []).length, all = OVERLAY_SCENES.length - 1;
    const where = p.kind === "clips" ? "auf Abruf in Live" : !n ? "keine Szene" : n >= all ? "alle Szenen außer Ingame"
      : n > 4 ? `${n} Szenen` : p.scenes.map(k => audioSceneTitle(k)).join(" · ");
    b.innerHTML = `<b>${esc(p.name || "Playlist")}</b>${p.id === Z.background.active ? `<span class="state wait">läuft</span>` : ""}
      <span class="small">${p.videos.length} Video(s) · ${esc(({ loop: "Dauerschleife", list: "nacheinander", clips: "Clips" })[p.kind] || "")}</span><span class="small bg-where">${esc(where)}</span>`;
    b.onclick = () => { bgChosen = p.id; bgDraw(); videoInfoDraw(); };
    box.appendChild(b);
  });
  const p = bgList(bgChosen);
  $("bgName").value = p.name || "";
  $("bgListDelete").disabled = lists.length < 2;
  document.querySelectorAll("#bgKinds button").forEach(b => b.setAttribute("aria-pressed", b.dataset.kind === p.kind));
  document.querySelectorAll("#bgPassage button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === (p.transition || "fade")));
  document.querySelectorAll("#bgOrder button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === (p.order || "seq")));
  $("bgFade").value = ((p.fade ?? 1200) / 1000).toFixed(1);
  $("bgAudio").checked = p.kind === "clips" ? p.audio !== false : !!p.audio;
  $("bgPassageLine").hidden = p.kind !== "list"; $("bgScenesLine").hidden = $("bgAudioHint").hidden = p.kind === "clips";
  $("bgVideosHead").textContent = p.kind === "loop" ? "Video – es läuft das erste" : "Videos – Reihenfolge mit ↑ ↓";
  const vids = $("bgVideos"); vids.innerHTML = p.videos.length ? "" : `<p class="small">Noch keine Videos – unten in der Bibliothek anhaken.</p>`;
  p.videos.forEach((v, i) => {
    const z = document.createElement("div"); z.className = "row bg-video";
    z.innerHTML = `<span class="bg-num">${i + 1}</span><b>${esc(v.replace(/^media\/videos\//, ""))}</b>
      <button class="tool" aria-label="Nach oben" ${i ? "" : "disabled"}>${icon("up")}</button><button class="tool" aria-label="Nach unten" ${i < p.videos.length - 1 ? "" : "disabled"}>${icon("down")}</button>
      <button class="x" aria-label="Aus der Playlist nehmen">${icon("close")}</button>`;
    const [up, down, x] = z.querySelectorAll("button");
    const move = d => { [p.videos[i], p.videos[i + d]] = [p.videos[i + d], p.videos[i]]; bgChanged(); };
    up.onclick = () => move(-1); down.onclick = () => move(1);
    x.onclick = () => { p.videos.splice(i, 1); bgChanged(); videoInfoDraw(); };
    vids.appendChild(z);
  });
  const sc = $("bgScenes"); sc.innerHTML = "";
  OVERLAY_SCENES.filter(([k]) => k !== "ingame").forEach(([k]) => {
    const on = (p.scenes || []).includes(k), b = document.createElement("button"); b.type = "button";
    b.className = "bg-scene" + (on ? " on" : ""); b.textContent = (on ? "✓ " : "+ ") + audioSceneTitle(k);
    b.onclick = () => {
      // eine Szene hat genau eine Playlist: aus den anderen nehmen
      if (!on) bgPlaylists().forEach(o => { if (o !== p) o.scenes = (o.scenes || []).filter(x => x !== k); });
      p.scenes = on ? p.scenes.filter(x => x !== k) : [...(p.scenes || []), k];
      bgChanged();
    };
    sc.appendChild(b);
  });
}
function bgChanged() { bgApply(); bgDraw(); send(); }
const bgNow = () => bgList(bgChosen);
$("bgName").oninput = () => { bgNow().name = $("bgName").value; laterSend(); bgCornerDraw(); };
document.querySelectorAll("#bgKinds button").forEach(b => b.onclick = () => {
  const p = bgNow(); p.kind = b.dataset.kind;
  if (p.kind === "clips") { p.scenes = []; if (p.audio === undefined || p.audio === false) p.audio = true; }
  bgChanged();
});
document.querySelectorAll("#bgPassage button").forEach(b => b.onclick = () => { bgNow().transition = b.dataset.v; bgChanged(); });
document.querySelectorAll("#bgOrder button").forEach(b => b.onclick = () => { bgNow().order = b.dataset.v; bgChanged(); });
$("bgFade").onchange = () => { bgNow().fade = Math.round(Math.min(4, Math.max(0, +$("bgFade").value || 0)) * 1000); bgChanged(); };
$("bgAudio").onchange = () => { bgNow().audio = $("bgAudio").checked; bgChanged(); };
$("bgListNew").onclick = () => {
  const p = { id: "p" + Date.now().toString(36), name: "Neue Playlist", kind: "list", videos: [], order: "seq", transition: "fade", fade: 1200, audio: false, scenes: [] };
  bgPlaylists().push(p); bgChosen = p.id; bgChanged(); videoInfoDraw(); $("bgName").focus(); $("bgName").select();
};
$("bgListDelete").onclick = () => {
  const lists = bgPlaylists(), i = lists.findIndex(p => p.id === bgChosen);
  if (lists.length < 2 || i < 0) return;
  remove(lists, i, `Playlist „${lists[i].name}“`, () => { bgChosen = ""; bgApply(); bgDraw(); videoInfoDraw(); });
};
// Ecke unter der Programm-Vorschau: Playlist der laufenden Szene ändern, Clips abrufen
function bgCornerDraw() {
  if (!$("bgCorner")) return;
  const k = sceneNow(), lists = bgPlaylists(), now = bgForScene(k);
  $("bgCorner").hidden = !k || k === "ingame";
  const keep = lists.filter(p => p.kind !== "clips"), clipLists = lists.filter(p => p.kind === "clips" && p.videos.length);
  const html = keep.map(p => `<option value="${esc(p.id)}"${now && now.id === p.id ? " selected" : ""}>${esc(p.name)}${(p.scenes || []).includes(k) ? " · Standard" : ""}</option>`).join("")
    + `<option value=""${now ? "" : " selected"}>Kein Hintergrund</option>`;
  if ($("bgCornerList")._h !== html) { $("bgCornerList").innerHTML = html; $("bgCornerList")._h = html; }
  $("bgCornerKeep").disabled = !now || (now.scenes || []).includes(k);
  const sound = !!now && bgAudioFor(k), own = typeof (Z.background.sceneAudio || {})[k] === "boolean";
  $("bgCornerAudio").hidden = !now;
  $("bgCornerAudio").setAttribute("aria-pressed", sound);
  $("bgCornerAudio").innerHTML = icon(sound ? "volume" : "volume-off") + (sound ? "Ton an" : "Ton aus");
  const t = CastI18n.t;                                                // Titel aus Teilen: jedes Stück einzeln übersetzen
  $("bgCornerAudio").title = t(sound ? "Hintergrund mit Ton" : "Hintergrund ohne Ton") + " – " + t(own ? "gilt nur in dieser Szene" : "Standard der Playlist") + ". " + t("Klicken zum Umschalten (für diese Szene).");
  const clipHtml = clipLists.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  if ($("bgClipList")._h !== clipHtml) { $("bgClipList").innerHTML = clipHtml; $("bgClipList")._h = clipHtml; }
  $("bgClipList").hidden = $("bgClipPlay").hidden = !clipLists.length;
}
$("bgCornerList").onchange = () => { Z.background.override = { scene: sceneNow(), id: $("bgCornerList").value }; bgApply(); bgDraw(); send(); };
$("bgCornerKeep").onclick = () => {
  const k = sceneNow(), p = bgForScene(k); if (!p) return;
  bgPlaylists().forEach(o => { o.scenes = (o.scenes || []).filter(x => x !== k); });
  p.scenes.push(k); Z.background.override = null; bgApply(); bgDraw(); send();
};
$("bgCornerAudio").onclick = () => {
  const k = sceneNow(), p = bgForScene(k); if (!k || !p) return;
  const next = !bgAudioFor(k), all = Z.background.sceneAudio = Object.assign({}, Z.background.sceneAudio);
  if (next === !!p.audio) delete all[k]; else all[k] = next;          // wie die Playlist: keine eigene Wahl nötig
  bgApply(); send();
};
let bgClipTimer = null;
$("bgClipPlay").onclick = () => {
  const p = bgList($("bgClipList").value); if (!p || !p.videos.length) return;
  Z.background.clip = { id: Date.now(), videos: p.videos.slice(), audio: p.audio !== false };
  $("bgClipStop").hidden = false; clearTimeout(bgClipTimer); bgClipTimer = setTimeout(() => { $("bgClipStop").hidden = true; }, 10 * 60000);
  send();
};
$("bgClipStop").onclick = () => { Z.background.clip = { id: Date.now(), videos: [] }; $("bgClipStop").hidden = true; send(); };

/* ---------- Videos je Theme ----------
   Z.themeVideos[theme] = [Dateinamen]: welche Videos in diesem Theme zur Auswahl stehen (Playlisten, Werbung, Quelle
   „Video“). Hat ein Theme keine zugeordnet, stehen alle zur Auswahl. Zuordnen: Bibliothek (Setup → Hintergrund). */
function themeVideoNames() { const T = (Z.themeVideos || {})[Z.theme]; return Array.isArray(T) && T.length ? T : null; }
function themeVideoFilter(names) { const T = themeVideoNames(); return T ? names.filter(n => T.includes(n)) : names; }
function themeVideoToggle(name) {
  const all = Z.themeVideos = Object.assign({}, Z.themeVideos), T = (all[Z.theme] || []).slice();
  all[Z.theme] = T.includes(name) ? T.filter(n => n !== name) : [...T, name];
  send();
}

/* ---------- Werbung ----------
   Setup → Sponsoren: Werbe-Videos anhaken (Reihenfolge = Reihenfolge des Anhakens). Live → Panel „Werbung“:
   „Alle“ oder einzeln abspielen – die App wechselt in die Szene „Werbung“, die Videos laufen mit Ton nacheinander.
   Danach bleibt das letzte Bild stehen; nach Z.ads.back Sekunden geht es zurück in die Szene, aus der gestartet
   wurde (0 = bleibt). Fortschritt und Ende meldet die Vorschau (overlay.html im App-Fenster). */
var adsLibrary = null, adsProgress = null, adsBack = null, adsEnded = null;   // var: Panel und Szenenwechsel (andere Teile) dürfen schon beim Laden fragen
async function adsLibraryLoad() {
  try { adsLibrary = ((await (await fetch("/api/videos", { cache: "no-store" })).json()).videos || []).filter(v => !v.error).map(v => v.name); }
  catch (err) { adsLibrary = []; }
  adsSetupDraw(); adsDraw();
}
const adsState = () => { Z.ads = Object.assign({ videos: [], badge: true, back: 10, play: null }, Z.ads); return Z.ads; };
const adsName = path => String(path).replace(/^media\/videos\//, "").replace(/\.[a-z0-9]+$/i, "");
function adsSetupDraw() {
  const box = $("adVideos"); if (!box) return;
  if (!adsLibrary) { box.innerHTML = `<p class="small">lädt …</p>`; adsLibraryLoad(); return; }
  const A = adsState(), names = themeVideoFilter(adsLibrary);
  box.innerHTML = names.length ? "" : `<p class="small">Noch keine Videos im Videos-Ordner (Setup → Hintergrund → Videos-Ordner öffnen).</p>`;
  names.forEach(n => {
    const path = "media/videos/" + n, z = document.createElement("label"); z.className = "row vid-row";
    z.innerHTML = `<input type="checkbox"${A.videos.includes(path) ? " checked" : ""}><span><b>${esc(adsName(n))}</b> <span class="small">${esc(n)}</span></span>`;
    z.querySelector("input").onchange = ev => { A.videos = ev.target.checked ? [...A.videos.filter(p => p !== path), path] : A.videos.filter(p => p !== path); send(); adsDraw(); };
    box.appendChild(z);
  });
}
function adsPlay(list) {
  const A = adsState(); list = list.filter(Boolean); if (!list.length) return;
  const from = Z.broadcast.scene !== "ads" ? Z.broadcast.scene : ((A.play || {}).from || "pause");
  A.play = { id: Date.now(), list, from }; adsProgress = null; adsBack = null;
  if (Z.broadcast.scene !== "ads") sceneSwitch("ads"); else send();
  adsDraw();
}
function adsStop() {
  const A = adsState(), from = (A.play || {}).from;
  A.play = null; adsProgress = null; adsBack = null;
  if (Z.broadcast.scene === "ads" && from) sceneSwitch(from); else send();
  adsDraw();
}
function adsDraw() {
  const box = $("pAds"); if (!box) return;
  const A = adsState(), P = A.play, list = A.videos.filter(p => themeVideoFilter([p.replace(/^media\/videos\//, "")]).length);
  const running = P && Z.broadcast.scene === "ads", fromName = P ? audioSceneTitle(P.from) : "";
  const prog = running && adsProgress && adsProgress.id === P.id ? adsProgress : null;
  const status = !running ? "" : adsBack ? `Fertig · zurück zu „${esc(fromName)}“ in ${Math.max(0, Math.ceil((adsBack - Date.now()) / 1000))} s`
    : prog ? `▶ ${esc(adsName(P.list[prog.index] || ""))} (${prog.index + 1}/${prog.count}) · ${K.time(Math.max(0, (prog.d || 0) - (prog.t || 0)) * 1000)}`
    : "▶ läuft …";
  const html = !list.length ? `<p class="small">Noch keine Werbe-Videos – Setup → Sponsoren → Werbung.</p>`
    : `<div class="map-buttons"><button class="button main" data-ads="all">${icon("play")}Alle (${list.length})</button>${list.map((p, i) =>
        `<button class="button" data-ads="${i}">${icon("play")}${esc(adsName(p))}</button>`).join("")}</div>
      ${running ? `<div class="line" style="align-items:center"><span class="small">${status}</span>
        ${adsBack ? `<button class="button" data-ads-now>Jetzt zurück</button><button class="button" data-ads-stay>Bleiben</button>` : ""}
        <button class="button danger" data-ads-stop>Stopp</button></div>` : ""}`;
  if (box._h === html) return;
  box._h = html; box.innerHTML = html;
  box.querySelectorAll("[data-ads]").forEach(b => b.onclick = () => adsPlay(b.dataset.ads === "all" ? list : [list[+b.dataset.ads]]));
  const stop = box.querySelector("[data-ads-stop]"); if (stop) stop.onclick = adsStop;
  const now = box.querySelector("[data-ads-now]"); if (now) now.onclick = adsStop;
  const stay = box.querySelector("[data-ads-stay]"); if (stay) stay.onclick = () => { adsBack = null; adsDraw(); };
}
addEventListener("message", ev => {
  const d = ev.data, P = (Z.ads || {}).play;
  if (!d || !P || d.id !== P.id || !$("frame") || ev.source !== $("frame").contentWindow) return;
  if (d.cast === "ads-progress") { adsProgress = d; adsDraw(); }
  if (d.cast === "ads-ended" && Z.broadcast.scene === "ads" && adsEnded !== P.id) {
    adsEnded = P.id;                                  // je Durchgang nur einmal – „Bleiben“ hält auch bei einer zweiten Meldung
    const s = +((Z.ads || {}).back ?? 10);
    adsBack = s > 0 ? Date.now() + s * 1000 : null; adsDraw();
  }
});
setInterval(() => {                                   // Rückweg nach dem Ende (abbrechbar mit „Bleiben“)
  if (!adsBack) return;
  const P = (Z.ads || {}).play;
  if (!P || Z.broadcast.scene !== "ads") { adsBack = null; adsDraw(); return; }
  if (Date.now() >= adsBack) adsStop(); else adsDraw();
}, 500);
setTimeout(adsSetupDraw, 0);
