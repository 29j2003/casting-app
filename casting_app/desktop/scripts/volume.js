/* Runs in EVERY frame of the app window (also foreign pages such as VDO.Ninja, clips and DACH CS),
 * in the page's own world and before its scripts.
 *
 * Qt can only mute the whole window; it has no volume. This script therefore multiplies the
 * volume of everything audible in the page by one factor (0 … 1):
 *   - <video>/<audio>: the volume setter is wrapped; the page keeps reading its own value
 *   - Web Audio: everything connected to the speakers goes through one gain node per context
 * The factor: on start each frame asks the control page (the top frame) with postMessage and
 * gets the current factor back; when the user changes it, the app calls
 * window[Symbol.for("casting-app-volume")](factor) in every frame.
 * Not covered: media in a shadow DOM that starts without script and without touching
 * `volume`, and `new MediaElementAudioSourceNode()` – muting still covers those.
 */
(() => {
  "use strict";
  const KEY = Symbol.for("casting-app-volume");
  if (window[KEY]) return;
  let factor = 1;                                // until the control page answers (a few milliseconds)

  const media = HTMLMediaElement.prototype;
  const volumeProperty = Object.getOwnPropertyDescriptor(media, "volume");
  const wantedVolume = new WeakMap();            // volume the page asked for
  const playsThroughWebAudio = new WeakSet();    // regulated by the Web Audio gain instead
  const knownElements = new Set();               // WeakRefs, for factor changes
  const knownContexts = new Set();
  const gainOfContext = new WeakMap();

  const forgetCollected = refs => { for (const ref of refs) if (!ref.deref()) refs.delete(ref); };
  const remember = (refs, object) => { refs.add(new WeakRef(object)); if (refs.size > 300) forgetCollected(refs); };

  function applyVolume(element) {
    const wanted = wantedVolume.get(element);
    try { volumeProperty.set.call(element, playsThroughWebAudio.has(element) ? wanted : wanted * factor); } catch (error) {}
  }
  function track(element) {
    if (!wantedVolume.has(element)) {
      wantedVolume.set(element, volumeProperty.get.call(element));
      remember(knownElements, element);
    }
    applyVolume(element);
  }

  Object.defineProperty(media, "volume", {
    configurable: true, enumerable: volumeProperty.enumerable,
    get() { return wantedVolume.has(this) ? wantedVolume.get(this) : volumeProperty.get.call(this); },
    set(value) {
      const volume = Number(value);
      if (!(volume >= 0 && volume <= 1)) return volumeProperty.set.call(this, value);   // invalid: throw as usual
      if (!wantedVolume.has(this)) remember(knownElements, this);
      wantedVolume.set(this, volume);
      applyVolume(this);
    }
  });
  const play = media.play;
  media.play = function () { try { track(this); } catch (error) {} return play.apply(this, arguments); };
  addEventListener("play", event => { if (event.target instanceof HTMLMediaElement) track(event.target); }, true);
  addEventListener("loadedmetadata", event => { if (event.target instanceof HTMLMediaElement) track(event.target); }, true);

  if (window.AudioNode && window.AudioDestinationNode) {
    const connect = AudioNode.prototype.connect, disconnect = AudioNode.prototype.disconnect;
    const isOffline = context => window.OfflineAudioContext && context instanceof OfflineAudioContext;
    function gainFor(context) {
      let gain = gainOfContext.get(context);
      if (!gain) {
        gain = context.createGain();
        gain.gain.value = factor;
        connect.call(gain, context.destination);
        gainOfContext.set(context, gain);
        remember(knownContexts, context);
      }
      return gain;
    }
    AudioNode.prototype.connect = function (target, ...rest) {
      if (target instanceof AudioDestinationNode && !isOffline(target.context)) { connect.call(this, gainFor(target.context), ...rest); return target; }
      return connect.call(this, target, ...rest);
    };
    AudioNode.prototype.disconnect = function (target, ...rest) {
      if (target instanceof AudioDestinationNode && gainOfContext.has(target.context)) return disconnect.call(this, gainOfContext.get(target.context), ...rest);
      return disconnect.apply(this, arguments);
    };
    if (window.AudioContext && AudioContext.prototype.createMediaElementSource) {
      const createSource = AudioContext.prototype.createMediaElementSource;
      AudioContext.prototype.createMediaElementSource = function (element) {
        const node = createSource.call(this, element);
        try { playsThroughWebAudio.add(element); track(element); } catch (error) {}
        return node;
      };
    }
  }

  const setFactor = newFactor => {
    factor = newFactor;
    forgetCollected(knownElements); forgetCollected(knownContexts);
    for (const ref of knownElements) { const element = ref.deref(); if (element) applyVolume(element); }
    for (const ref of knownContexts) { const gain = gainOfContext.get(ref.deref()); if (gain) gain.gain.value = factor; }
  };
  // for tests: what is really set on an element / a context
  setFactor.inspect = (element, context) => ({
    factor,
    actualVolume: element ? volumeProperty.get.call(element) : null,
    contextGain: context && gainOfContext.has(context) ? gainOfContext.get(context).gain.value : null
  });
  Object.defineProperty(window, KEY, { value: setFactor });

  // ask the control page for the current factor; only its answer is accepted
  addEventListener("message", event => {
    const answer = event.data;
    if (event.source !== window.top || !answer || typeof answer.castingAppVolumeFactor !== "number") return;
    setFactor(Math.max(0, Math.min(1, answer.castingAppVolumeFactor)));
  });
  try { window.top.postMessage({ castingAppVolumeRequest: true }, "*"); } catch (error) {}
})();
