/* Runs in the control page itself (main world, top frame only, before the page's scripts).
 *
 * Provides window.castApp – the API control.html uses in the desktop app. It talks to the app only through DOM events; the connection to
 * Python (QWebChannel) lives in an isolated world (app_bridge.js) that no web page can reach.
 */
(() => {
  "use strict";
  if (window.top !== window || !["http://localhost:8787", "http://127.0.0.1:8787"].includes(location.origin)) return;

  const TO_APP = "casting-app:to-app";
  const TO_PAGE = "casting-app:to-page";
  const toApp = message => document.dispatchEvent(new CustomEvent(TO_APP, { detail: JSON.stringify(message) }));

  let onCloseRequested = null;     // the page's close dialog
  let onReloadOverlays = null;     // the page's "reload browser sources in OBS"

  document.addEventListener(TO_PAGE, async event => {
    let message;
    try { message = JSON.parse(event.detail); } catch (error) { return; }
    if (message.type === "ask-close") {
      if (!onCloseRequested) return;                          // page not ready: the app asks itself
      toApp({ type: "close-dialog-shown", requestId: message.requestId });
      try { onCloseRequested(); } catch (error) {}
    }
    if (message.type === "reload-overlays") {
      let viaObs = false;
      try { viaObs = onReloadOverlays ? !!(await onReloadOverlays()) : false; } catch (error) {}
      toApp({ type: "overlays-reloaded", requestId: message.requestId, viaObs });
    }
  });

  Object.defineProperty(window, "castApp", { value: Object.freeze({
    desktop: true,
    // close dialog: the page registers its dialog and reports the choice ("quit", "window" or "")
    onCloseRequested: handler => { if (typeof handler === "function") onCloseRequested = handler; },
    closeAnswer: choice => toApp({ type: "close-answer", choice: ["quit", "window"].includes(choice) ? choice : "" }),
    // "Ton im App-Fenster": on/off and volume 0–100
    audio: (on, volume) => toApp({ type: "audio", on: on === true, volume: Number(volume) }),
    // tray "Overlays in OBS neu laden": the handler returns true when OBS did it
    onReloadOverlays: handler => { if (typeof handler === "function") onReloadOverlays = handler; }
  }) });
})();
