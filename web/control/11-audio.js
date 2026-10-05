/* CASTING-APP · Steuerseite – Ton über OBS, Cleanfeed
   Teil 11 von 13; Reihenfolge und Lageplan: control/01-core.js
   (der Server verbindet alle Dateien zu einem Skript – siehe dort) */

/* ---------- Ton über OBS ----------
   Wie im OBS-Mixer: jede Tonquelle ist eine eigene OBS-Quelle. Die App regelt Lautstärke (bis 300 %), Stumm,
   Verzögerung (Synchronisation) und Abhören direkt in OBS – live, genau wie die Regler in OBS selbst. */
const AUDIO_OBS = [["Cast – Overlay", "Overlay (Clips, Seiten, Videos im Overlay)"], ["Cast – Hintergrund", "Hintergrund-Video (OBS spielt ab)"],
  ["Cast – Ton Caster 1", "Caster 1"], ["Cast – Ton Caster 2", "Caster 2"], ["Cast – Ton Gast", "Gast"]];
// Abhören wie in OBS (Erweiterte Audioeigenschaften): aus · nur abhören · abhören und ausgeben
const MONITOR = [["OBS_MONITORING_TYPE_NONE", "Abhören aus"], ["OBS_MONITORING_TYPE_MONITOR_ONLY", "Nur abhören"], ["OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT", "Abhören + Ausgabe"]];
const MONITOR_HINT = { OBS_MONITORING_TYPE_NONE: "nur im Stream/der Aufnahme, nicht auf deinem Kopfhörer",
  OBS_MONITORING_TYPE_MONITOR_ONLY: "nur auf deinem Kopfhörer, nicht im Stream",
  OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT: "im Stream und auf deinem Kopfhörer" };
let audioRevision = {}, audioOffen2 = new Set(), audioFetchRunning = false;
// alle Quellen mit Ton in OBS (wie der OBS-Mixer) – die der App zuerst; die Liste wird alle 15 s erneuert
let audioInputs = [], audioInputsAt = 0;
async function audioInputsLoad() {
  if (audioInputs.length && Date.now() - audioInputsAt < 15000) return audioInputs;
  const names = ((await channel.obs.question("GetInputList", {})).inputs || []).map(i => i.inputName);
  const withAudio = [];
  for (const name of names) { try { await channel.obs.question("GetInputVolume", { inputName: name }); withAudio.push(name); } catch (err) {} }
  const own = AUDIO_OBS.map(([n]) => n).filter(n => withAudio.includes(n));
  audioInputs = own.concat(withAudio.filter(n => !own.includes(n))); audioInputsAt = Date.now();
  return audioInputs;
}
async function audioFetch() {
  if (!channel.obs.isOpen || audioFetchRunning) return;
  audioFetchRunning = true;
  try {
    const inputs = await audioInputsLoad();
    const fresh = {};
    for (const name of inputs) {
      const [v, m, o, t] = await Promise.all([channel.obs.question("GetInputVolume", { inputName: name }), channel.obs.question("GetInputMute", { inputName: name }),
        channel.obs.question("GetInputAudioSyncOffset", { inputName: name }), channel.obs.question("GetInputAudioMonitorType", { inputName: name })]).catch(() => [null, null, null, null]);
      if (v) fresh[name] = { vol: Math.round((v.inputVolumeMul || 0) * 100), mute: !!m.inputMuted, delay: o.inputAudioSyncOffset || 0, monitor: t.monitorType };
    }
    if (JSON.stringify(fresh) !== JSON.stringify(audioRevision)) { audioRevision = fresh; audioDraw(); }
  } catch (err) {} finally { audioFetchRunning = false; }
}
setInterval(audioFetch, 2000);                                    // auch Änderungen direkt in OBS erscheinen hier
const audioSet = (name, req, data) => channel.obs.question(req, Object.assign({ inputName: name }, data)).catch(err => { $("audioList").insertAdjacentHTML("afterbegin", `<p class="small" style="color:var(--red)">OBS: ${esc(err.message || String(err))}</p>`); });
function audioDraw() {
  const box = $("audioList"); if (!box) return;
  box.innerHTML = "";
  if (!channel.obs.isOpen) { box.innerHTML = `<p class="small">Ton wird direkt in OBS geregelt (wie im OBS-Mixer) – dafür mit OBS verbinden (⚙ App-Einstellungen).</p>`; return; }
  const titles = Object.fromEntries(AUDIO_OBS);
  audioInputs.forEach(name => {
    const T = audioRevision[name]; if (!T) return;
    const title = titles[name] || name;
    const z = document.createElement("div"); z.className = "audio-z";
    z.innerHTML = `<div class="audio-head"><div class="tname"><b>${esc(title)}</b><span>${esc(name)}</span></div>
        <button class="audio-mute${T.mute ? " off" : ""}" aria-pressed="${T.mute}">${T.mute ? "STUMM" : "Stumm"}</button>
        <button class="gfx-more" aria-label="Mehr Einstellungen">⋯</button></div>
      <div class="audio-slider"><input type="range" min="0" max="300" step="5" value="${Math.min(300, T.vol)}" aria-label="Lautstärke ${esc(title)}"><b class="${T.vol > 100 ? "loud" : ""}">${T.vol} %</b></div>
      <div class="audio-monitoring"><span class="segment" role="group" aria-label="Abhören">${MONITOR.map(([v, n]) => `<button data-monitor="${v}" aria-pressed="${T.monitor === v}">${n}</button>`).join("")}</span>
        <span class="small">${esc(MONITOR_HINT[T.monitor] || "")}</span></div>
      <div class="audio-more"${audioOffen2.has(name) ? "" : " hidden"}>
        <label>Verzögerung (ms)<input type="number" min="-950" max="20000" step="10" value="${T.delay}"></label>
      </div>`;
    const slider = z.querySelector("input[type=range]"), display = z.querySelector(".audio-slider b");
    let timerHandle = null;
    slider.oninput = () => { T.vol = +slider.value; display.textContent = T.vol + " %"; display.classList.toggle("loud", T.vol > 100);
      clearTimeout(timerHandle); timerHandle = setTimeout(() => audioSet(name, "SetInputVolume", { inputVolumeMul: T.vol / 100 }), 40); };       // live, wie der OBS-Regler
    z.querySelector(".audio-mute").onclick = () => { T.mute = !T.mute; audioSet(name, "SetInputMute", { inputMuted: T.mute }); audioDraw(); };
    z.querySelector(".gfx-more").onclick = () => { audioOffen2.has(name) ? audioOffen2.delete(name) : audioOffen2.add(name); audioDraw(); };
    z.querySelector("input[type=number]").onchange = ev => { T.delay = Math.max(-950, Math.min(20000, +ev.target.value || 0)); audioSet(name, "SetInputAudioSyncOffset", { inputAudioSyncOffset: T.delay }); };
    z.querySelectorAll("[data-monitor]").forEach(b => b.onclick = () => { T.monitor = b.dataset.monitor; audioSet(name, "SetInputAudioMonitorType", { monitorType: T.monitor }); audioDraw(); });
    box.appendChild(z);
  });
  // Caster und Gast als eigene OBS-Tonquelle (VDO.Ninja-Ton direkt in OBS statt im Overlay)
  const missing = [["c1", "Caster 1"], ["c2", "Caster 2"], ["guest", "Gast"]].filter(([k, n]) => {
    const Q = (Z.sources || {})[k] || {}; return Q.type === "link" && /vdo\.ninja|obs\.ninja|^[^/:]+$/i.test(Q.url || "") && !audioRevision["Cast – Ton " + n];
  });
  missing.forEach(([k, n]) => {
    const z = document.createElement("div"); z.className = "audio-z";
    z.innerHTML = `<div class="audio-head"><div class="tname"><b>${esc(n)}</b><span>VDO.Ninja – Ton läuft noch im Overlay</span></div><button class="button">Als eigene OBS-Tonquelle</button></div>`;
    z.querySelector("button").onclick = () => audioSourceCreate(k, n);
    box.appendChild(z);
  });
  if (!box.children.length) box.innerHTML = `<p class="small">In OBS gibt es noch keine Quelle mit Ton – Setup → Szenen &amp; OBS → „In OBS anlegen“.</p>`;
}
// VDO.Ninja-Gast als eigene Browserquelle nur für den Ton (unsichtbar klein), im Overlay wird sein Ton dann stumm geschaltet
async function audioSourceCreate(k, n) {
  const Q = (Z.sources || {})[k] || {}; let u = (Q.url || "").trim();
  if (!/^https?:\/\//i.test(u)) u = "https://vdo.ninja/?view=" + encodeURIComponent(u);
  u += (u.includes("?") ? "&" : "?") + "novideo&cleanoutput";
  const scene = onSource() ? "Cast – Sendung" : ((sceneCfg().list["cast-duo"] || {}).obs || "Cast – Sendung"), name = "Cast – Ton " + n;
  if (!await confirmDialog({ title: `${n}: eigene Tonquelle in OBS?`, text: `In „${scene}“ entsteht „${name}“ – nur der Ton von ${n}, regelbar wie jede OBS-Quelle. Im Overlay wird sein Ton stumm, damit nichts doppelt läuft.`, button: "Anlegen" })) return;
  try {
    const fresh = await channel.obs.question("CreateInput", { sceneName: scene, inputName: name, inputKind: "browser_source",
      inputSettings: { url: u, width: 16, height: 16, reroute_audio: true, shutdown: false, restart_when_active: false } });
    try { await channel.obs.question("SetSceneItemIndex", { sceneName: scene, sceneItemId: fresh.sceneItemId, sceneItemIndex: 0 }); } catch (err) {}
    Z.audio = Z.audio || {}; Z.audio[k] = Object.assign({}, Z.audio[k], { obs: true }); send();
    setTimeout(audioFetch, 600);
  } catch (err) { alert("OBS: " + (err.message || err)); }
}

// Ton im App-Fenster (Vorschau): Standard aus – betrifft nur dieses Fenster, nie den Stream.
// Desktop-App: an/aus schaltet das ganze Fenster stumm (auch fremde Seiten wie VDO.Ninja, Clips, DACH CS),
// die Lautstärke regelt die App für alles im Fenster – die Vorschau selbst spielt dann mit 100 %.
function monitorSend() {
  if (window.castApp) window.castApp.audio(!!ui.appAudio, ui.appAudioVol ?? 60);
  try { $("frame").contentWindow.postMessage({ cast: "monitor", mode: ui.appAudio ? "app" : "off", vol: window.castApp ? 100 : (ui.appAudioVol ?? 60) }, location.origin); } catch (err) {}
}
function appAudioDraw() {
  $("appAudio").classList.toggle("on", !!ui.appAudio); $("appAudio").setAttribute("aria-checked", !!ui.appAudio);
  $("appAudioVol").value = ui.appAudioVol ?? 60; $("appAudioVol").disabled = !ui.appAudio; $("appAudioText").textContent = ui.appAudio ? (ui.appAudioVol ?? 60) + " %" : "off";
  $("appAudioHint").textContent = ui.appAudio ? "Du hörst die Vorschau im App-Fenster – Videos, Kameras, Clips und Seiten. Der Stream bleibt unverändert." : "Das App-Fenster ist stumm. Der Stream in OBS ist davon nicht betroffen.";
}
$("appAudio").onclick = () => { ui.appAudio = !ui.appAudio; uiSave(); appAudioDraw(); monitorSend(); };
$("appAudioVol").oninput = () => { ui.appAudioVol = +$("appAudioVol").value; $("appAudioText").textContent = ui.appAudioVol + " %"; uiSave(); monitorSend(); };
$("frame").addEventListener("load", () => setTimeout(monitorSend, 400));
appAudioDraw(); if (window.castApp) monitorSend(); setTimeout(monitorSend, 1200);
/* ---------- Cleanfeed ---------- */
function cleanDraw() {
  const ing = onSource() && Z.broadcast.scene === "ingame";
  $("cleanButton").hidden = !ing;
  $("cleanButton").classList.toggle("on", !!Z.broadcast.clean);
  $("cleanButton").textContent = Z.broadcast.clean ? "Cleanfeed · AN" : "Cleanfeed";
}
$("cleanButton").onclick = () => { Z.broadcast.clean = !Z.broadcast.clean; cleanDraw(); send(); };
// eigene OBS-Szene „Cast – Cleanfeed“: alles aus der Ingame-Szene außer den Grafiken der App
document.querySelector('details[data-area=scenes-setup] .content, #szenenEinrichten')?.insertAdjacentHTML("beforeend", `
  <div class="line" style="margin-top:10px"><button class="button" id="cleanObs">Cleanfeed-Szene in OBS anlegen</button></div>
  <p class="small" id="cleanObsStatus">Legt „Cast – Cleanfeed“ an: dieselben Quellen wie in der Ingame-Szene (z. B. Spielaufnahme, Ton), aber ohne die Grafiken der App.
    Ausgeben z. B. über OBS → Virtuelle Kamera (Ausgabe „Szene“), NDI oder Source Record.</p>`);
const TRANSFORM_FIELDS = ["positionX", "positionY", "rotation", "scaleX", "scaleY", "alignment", "boundsType", "boundsAlignment", "boundsWidth", "boundsHeight", "cropLeft", "cropRight", "cropTop", "cropBottom", "cropToBounds"];
async function cleanfeedCreate() {
  const st = t => { $("cleanObsStatus").textContent = t; };
  if (!channel.obs.isOpen) return st("Erst mit OBS verbinden (⚙ App-Einstellungen).");
  const source = onSource() ? "Cast – Sendung" : ((sceneCfg().list.ingame || {}).obs || "");
  if (!source) return st("Für Ingame ist keine OBS-Szene zugeordnet.");
  try {
    const { sceneItems } = await channel.obs.question("GetSceneItemList", { sceneName: source });
    const take = (sceneItems || []).filter(x => !/^Cast – (Overlay|Hintergrund)/.test(x.sourceName)).sort((a, b) => a.sceneItemIndex - b.sceneItemIndex);
    if (!take.length) return st(`In „${source}“ liegt außer den Grafiken der App nichts – zuerst die Spielaufnahme dort einfügen.`);
    if (!await confirmDialog({ title: "Cleanfeed-Szene anlegen?", text: `In OBS entsteht (oder wird erneuert) „Cast – Cleanfeed“ mit diesen Quellen aus „${source}“:`, list: take.map(x => x.sourceName), button: "Anlegen" })) return;
    const { scenes } = await channel.obs.question("GetSceneList", {});
    if ((scenes || []).some(x => x.sceneName === "Cast – Cleanfeed")) await channel.obs.question("RemoveScene", { sceneName: "Cast – Cleanfeed" });
    await channel.obs.question("CreateScene", { sceneName: "Cast – Cleanfeed" });
    for (const x of take) {
      const fresh = await channel.obs.question("CreateSceneItem", { sceneName: "Cast – Cleanfeed", sourceName: x.sourceName, sceneItemEnabled: x.sceneItemEnabled !== false });
      try {
        const { sceneItemTransform: t } = await channel.obs.question("GetSceneItemTransform", { sceneName: source, sceneItemId: x.sceneItemId });
        const clean = {}; TRANSFORM_FIELDS.forEach(k => { if (t && t[k] !== undefined) clean[k] = t[k]; });
        if (clean.boundsType === "OBS_BOUNDS_NONE") { delete clean.boundsWidth; delete clean.boundsHeight; }
        await channel.obs.question("SetSceneItemTransform", { sceneName: "Cast – Cleanfeed", sceneItemId: fresh.sceneItemId, sceneItemTransform: clean });
      } catch (err) {}
    }
    st(`✓ „Cast – Cleanfeed“ angelegt (${take.length} Quelle${take.length > 1 ? "n" : ""}). Ausgeben z. B. über die virtuelle Kamera mit Ausgabe „Szene“.`);
  } catch (err) { st("OBS: " + (err.message || err)); }
}
if ($("cleanObs")) $("cleanObs").onclick = cleanfeedCreate;
