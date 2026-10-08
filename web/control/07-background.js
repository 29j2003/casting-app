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
        onSource() ? "In der Szene „Ingame“ wird sie automatisch ausgeblendet" : "In der Ingame-Szene wird sie nicht eingefügt"
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
// Der Zustand richtet sich immer nach der Szene, die beim Ausführen läuft – ein schneller Wechsel zurück (während das
// Ausblenden noch auf das Ende der Blende wartet) lässt das Video so nie versteckt zurück (bis 2.14).
let bgVisibleTimer = null;
function obsBackgroundVisible(delay) {
  clearTimeout(bgVisibleTimer);
  bgVisibleTimer = setTimeout(obsBackgroundSync, delay || 0);
}
async function obsBackgroundSync() {
  if ((Z.background || {}).source !== "obs" || !onSource() || !channel.obs.isOpen) return;
  const on = Z.broadcast.scene !== "ingame";
  try {
    const { sceneItemId } = await channel.obs.question("GetSceneItemId", { sceneName: "Cast – Sendung", sourceName: BG_NAME });
    const { sceneItemEnabled } = await channel.obs.question("GetSceneItemEnabled", { sceneName: "Cast – Sendung", sceneItemId });
    if (sceneItemEnabled !== on) await channel.obs.question("SetSceneItemEnabled", { sceneName: "Cast – Sendung", sceneItemId, sceneItemEnabled: on });
  } catch (err) {}
}

/* ---------- Playlisten ----------
   Z.background.playlists = [{ id, name, kind: "loop"|"list"|"clips", videos: [Pfade], order: "seq"|"shuffle",
     transition: "cut"|"fade"|"black", fade: ms, audio, scenes: [Szenen-Schlüssel] }].
   Je Szene läuft die Playlist, in deren scenes sie steht (Clips nie von selbst); die Ecke in Live kann das für die
   laufende Szene ändern (override, gilt bis zum nächsten Szenenwechsel). bgApply() schreibt das Ergebnis nach
   Z.background.videos/play – das liest das Overlay (cast.js: background()). */
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
  H.play = p ? { order: p.order || "seq", transition: p.transition || "fade", fade: p.fade ?? 1200 } : {};
  H.active = p ? p.id : "";
  if (JSON.stringify(H.videos) !== before) setTimeout(() => obsBackground(true), 0);
  bgCornerDraw();
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
  $("bgPassageLine").hidden = p.kind !== "list"; $("bgScenesLine").hidden = p.kind === "clips";
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
let bgClipTimer = null;
$("bgClipPlay").onclick = () => {
  const p = bgList($("bgClipList").value); if (!p || !p.videos.length) return;
  Z.background.clip = { id: Date.now(), videos: p.videos.slice(), audio: p.audio !== false };
  $("bgClipStop").hidden = false; clearTimeout(bgClipTimer); bgClipTimer = setTimeout(() => { $("bgClipStop").hidden = true; }, 10 * 60000);
  send();
};
$("bgClipStop").onclick = () => { Z.background.clip = { id: Date.now(), videos: [] }; $("bgClipStop").hidden = true; send(); };
