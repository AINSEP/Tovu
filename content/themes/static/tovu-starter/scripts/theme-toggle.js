(function () {
  // Duplicating a theme already rewrites its /theme-assets/<id>/ URLs, so the id in this script's own
  // URL names the copy. Keying storage by it gives each copy its own saved choice instead of sharing
  // (and overwriting) the original's. Stock ids and the static-export fallback (no such URL segment)
  // resolve to "tovu-starter:mode", so existing visitors keep their saved preference.
  var scriptUrl = document.currentScript && document.currentScript.src ? document.currentScript.src : "";
  var themeIdMatch = /\/theme-assets\/([^/]+)\//.exec(scriptUrl);
  var STORAGE_KEY = (themeIdMatch ? themeIdMatch[1] : "tovu-starter") + ":mode";
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
