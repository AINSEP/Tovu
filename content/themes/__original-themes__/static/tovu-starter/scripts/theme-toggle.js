(function () {
  // The key is per THEME, taken from this script's own URL (`/theme-assets/<id>/scripts/...`, which
  // theme duplication already rewrites to the copy's id), so a duplicated theme remembers light/dark
  // on its own instead of sharing one entry with Tovu Starter. `tovu-starter` keeps its historical
  // key, so existing visitors keep their choice. A static download flattens the URL to
  // `scripts/theme-toggle.js` with no id; one theme per site there, so the historical key is safe.
  var themeId = /\/theme-assets\/([^/]+)\//.exec((document.currentScript && document.currentScript.src) || "");
  var STORAGE_KEY = (themeId ? themeId[1] : "tovu-starter") + ":mode";
  var root = document.documentElement;
  var buttons = [];

  function apply({ mode }, _optional = {}) {
    if (mode === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
    var label = mode === "light" ? "Switch to dark mode" : "Switch to light mode";
    for (var i = 0; i < buttons.length; i++) buttons[i].setAttribute("aria-label", label);
  }

  // No saved choice: light from 6 am to 6 pm on the visitor's own clock, dark otherwise.
  function byClock() {
    var hour = new Date().getHours();
    return hour >= 6 && hour < 18 ? "light" : "dark";
  }

  var saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* Storage can be unavailable; the current theme still works. */ }
  var chosen = saved === "light" || saved === "dark";
  apply({ mode: chosen ? saved : byClock() });

  // A page left open across 6 am or 6 pm flips by itself until the visitor picks a mode.
  setInterval(function () {
    if (!chosen) apply({ mode: byClock() });
  }, 60000);

  // Every [data-theme-toggle] is wired, not only the first: the header has one and the mobile menu
  // drawer (nav.html's <dialog class="mnav">) has another, and both must stay in step.
  document.addEventListener("DOMContentLoaded", function () {
    buttons = document.querySelectorAll("[data-theme-toggle]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function () {
        var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
        chosen = true;
        apply({ mode: next });
        try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* Storage can be unavailable; the current theme still works. */ }
      });
    }
    apply({ mode: root.getAttribute("data-theme") === "light" ? "light" : "dark" });
  });
})();
