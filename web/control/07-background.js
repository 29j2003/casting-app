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
    const files = (H.videos || []).map(p => info.folder + sep + p.replace(/^medien\/videos\//, ""));
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
// in der Ingame-Szene (eine Browserquelle) muss das Hintergrund-Video in OBS unsichtbar sein
async function obsBackgroundVisible(on, delay) {
  if ((Z.background || {}).source !== "obs" || !onSource() || !channel.obs.isOpen) return;
  if (delay) await new Promise(ok => setTimeout(ok, delay));
  try {
    const { sceneItemId } = await channel.obs.question("GetSceneItemId", { sceneName: "Cast – Sendung", sourceName: BG_NAME });
    await channel.obs.question("SetSceneItemEnabled", { sceneName: "Cast – Sendung", sceneItemId, sceneItemEnabled: on });
  } catch (err) {}
}
