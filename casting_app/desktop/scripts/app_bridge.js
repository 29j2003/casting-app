/* Runs in an isolated world of the control page (top frame only), after qwebchannel.js.
 *
 * Connects the page bridge (page_bridge.js) with Python: DOM events from the page become
 * calls on the "app" object of the QWebChannel, and Python sends messages to the page
 * through window.castAppSend(). Web pages – including embedded ones – cannot reach this world.
 * It also tells every frame of the window the current volume factor (see volume.js).
 */
(() => {
  "use strict";
  if (window.top !== window || !["http://localhost:8787", "http://127.0.0.1:8787"].includes(location.origin)) return;

  const TO_APP = "casting-app:to-app";
  const TO_PAGE = "casting-app:to-page";
  let app = null;
  const waiting = [];

  new QWebChannel(qt.webChannelTransport, channel => {
    app = channel.objects.app;
    waiting.splice(0).forEach(text => app.receive(text));
  });

  document.addEventListener(TO_APP, event => {
    if (typeof event.detail !== "string" || event.detail.length > 2000) return;
    if (app) app.receive(event.detail); else waiting.push(event.detail);
  });

  // called by Python (runJavaScript in this world)
  window.castAppSend = message => document.dispatchEvent(new CustomEvent(TO_PAGE, { detail: JSON.stringify(message) }));

  // "Ton im App-Fenster": every frame of the window asks for the volume factor when it starts (see volume.js)
  let volumeFactor = 1;
  window.castAppSetVolumeFactor = factor => { volumeFactor = factor; };
  addEventListener("message", event => {
    if (!event.data || event.data.castingAppVolumeRequest !== true || !event.source) return;
    try { event.source.postMessage({ castingAppVolumeFactor: volumeFactor }, "*"); } catch (error) {}
  });
})();
