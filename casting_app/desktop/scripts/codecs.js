/* Runs in EVERY frame of the app window (also DACH CS, clips), in the page's own world, before its scripts.
 *
 * Qt WebEngine cannot play H.264/AAC (MP4). The app converts such videos on the fly
 * (casting_app/desktop/media.py redirects them to /api/media → WebM). For that to happen the page
 * must actually request the file:
 *   - canPlayType("video/mp4 …") answers "maybe" instead of "" (pages that check first still try)
 *   - <source type="video/mp4"> loses its type, otherwise Chromium skips it without loading
 * Only active when the app has FFmpeg (the placeholder below is replaced by media.py).
 */
(() => {
  "use strict";
  if (!__CASTING_APP_CAN_CONVERT__ || window[Symbol.for("casting-app-codecs")]) return;
  window[Symbol.for("casting-app-codecs")] = true;
  const CONVERTED = /^(video|audio)\/(mp4|x-m4v|quicktime|aac|x-m4a)\b/i;

  const original = HTMLMediaElement.prototype.canPlayType;
  HTMLMediaElement.prototype.canPlayType = function (type) {
    const answer = original.call(this, type);
    return answer || (CONVERTED.test(String(type).trim()) ? "maybe" : "");
  };

  const fix = source => { if (CONVERTED.test(source.getAttribute("type") || "")) source.removeAttribute("type"); };
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.tagName === "SOURCE") fix(node);
      else if (node.querySelectorAll) node.querySelectorAll("source[type]").forEach(fix);
    }
  }).observe(document, { childList: true, subtree: true });
})();
