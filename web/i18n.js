/* =====================================================================
   CASTING-APP · Sprache der Steuerseite (Deutsch / English)
   Die Texte im Code sind deutsch. Ist als App-Sprache Englisch gewählt,
   übersetzt diese Datei alles Sichtbare, sobald es im Fenster erscheint:
   Textknoten, die Attribute title/placeholder/aria-label und die Meldungen
   von alert/confirm/prompt – auch alles, was später per Skript entsteht
   (MutationObserver). Wörterbuch: lang-en.js (deutscher Text → englischer).
     · "{}" im Wörterbuch steht für einen eingesetzten Wert (Name, Zahl …)
     · Texte, die aus Stücken zusammengesetzt sind, findet die Übersetzung
       auch über ihren Anfang oder ihr Ende.
   Auf Deutsch läuft hier nichts mit – keine Kosten.
   Gewählt wird die Sprache in ⚙ App-Einstellungen; sie liegt in den
   Einstellungen der App und zusätzlich hier im Browser (damit schon der
   erste Bildaufbau stimmt).
   ===================================================================== */
(function () {
  "use strict";
  const STORAGE_KEY = "casting-app-language";
  const LANGUAGES = ["de", "en"];
  let language = "de";
  try { const stored = localStorage.getItem(STORAGE_KEY); if (LANGUAGES.includes(stored)) language = stored; } catch (e) {}

  const api = {
    language,
    /** Text in the app language (German source text in, translation out). */
    t: text => text,
    /** Switch the app language: remember it and reload the page. */
    setLanguage(next) {
      if (!LANGUAGES.includes(next) || next === language) return;
      try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
      let stored = null;
      try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
      if (stored === next) location.reload();          // without storage a reload would not help (and could repeat)
    },
    /** The app settings (server) know the language: follow them if the browser remembered another one. */
    follow(serverLanguage) {
      if (LANGUAGES.includes(serverLanguage) && serverLanguage !== language) api.setLanguage(serverLanguage);
    }
  };
  window.CastI18n = api;
  document.documentElement.lang = language;
  if (language === "de") return;

  const dictionary = (window.CastLanguages || {})[language] || {};
  const exact = new Map(), patterns = [], pieces = [];
  for (const [german, translated] of Object.entries(dictionary)) {
    if (german.includes("{}")) {
      const source = german.split("{}").map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("(.*?)");
      patterns.push({ re: new RegExp("^" + source + "$", "s"), translated });
    } else {
      exact.set(german, translated);
      if (german.length >= 8) pieces.push([german, translated]);
    }
  }
  pieces.sort((a, b) => b[0].length - a[0].length);
  const cache = new Map();

  function translateCore(core) {
    if (exact.has(core)) return exact.get(core);
    for (const p of patterns) {
      const m = p.re.exec(core);
      if (m) { let i = 1; return p.translated.replace(/\{\}/g, () => { const v = m[i++] ?? ""; return (v && translateCore(v)) ?? v; }); }
    }
    // pieces of composed texts: "Fehler: " + text, text + " – jetzt CS2 neu starten."
    for (const [german, translated] of pieces) {
      if (core.startsWith(german)) return translated + core.slice(german.length);
      if (core.endsWith(german)) return core.slice(0, -german.length) + translated;
    }
    return null;
  }

  /** Translation of a text, or the text itself when the dictionary does not know it. */
  function t(text) {
    if (typeof text !== "string" || !/[A-Za-zÄÖÜäöüß]/.test(text)) return text;
    if (cache.has(text)) return cache.get(text);
    const core = text.trim().replace(/\s+/g, " ");
    const translated = translateCore(core);
    const result = translated === null ? text : text.match(/^\s*/)[0] + translated + text.match(/\s*$/)[0];
    if (cache.size > 5000) cache.clear();
    cache.set(text, result);
    return result;
  }
  api.t = t;

  const ATTRIBUTES = ["title", "placeholder", "aria-label"];
  const SKIPPED = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE"]);
  const skipped = element => !element || SKIPPED.has(element.nodeName) || element.isContentEditable || !!element.closest("[data-no-translate]");

  function translateText(node) {
    if (skipped(node.parentElement)) return;
    const translated = t(node.nodeValue);
    if (translated !== node.nodeValue) node.nodeValue = translated;
  }
  function translateAttributes(element) {
    if (element.closest("[data-no-translate]")) return;
    for (const name of ATTRIBUTES) {
      const value = element.getAttribute(name);
      if (value) { const translated = t(value); if (translated !== value) element.setAttribute(name, translated); }
    }
  }
  function translateTree(root) {
    if (root.nodeType === Node.TEXT_NODE) return translateText(root);
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) { translateAttributes(root); if (skipped(root)) return; }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) translateText(node);
      else translateAttributes(node);
    }
  }

  new MutationObserver(records => {
    for (const r of records) {
      if (r.type === "characterData") translateText(r.target);
      else if (r.type === "attributes") translateAttributes(r.target);
      else r.addedNodes.forEach(translateTree);
    }
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });

  const show = { alert: window.alert, confirm: window.confirm, prompt: window.prompt };
  window.alert = message => show.alert.call(window, t(String(message)));
  window.confirm = message => show.confirm.call(window, t(String(message)));
  window.prompt = (message, value) => show.prompt.call(window, t(String(message)), value);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => translateTree(document.body));
  else translateTree(document.body);
})();
