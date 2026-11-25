(function () {
  // Duplicating a theme already rewrites its /theme-assets/<id>/ URLs, so the id in this script's own
  // URL names the copy. Keying storage by it gives each copy its own saved choice instead of sharing
  // (and overwriting) the original's. Stock ids and the static-export fallback (no such URL segment)
  // resolve to "tovu-theme:relay", so existing visitors keep their saved preference.
  var scriptUrl = document.currentScript && document.currentScript.src ? document.currentScript.src : "";
  var themeIdMatch = /\/theme-assets\/([^/]+)\//.exec(scriptUrl);
  var STORAGE_KEY = (themeIdMatch ? themeIdMatch[1] : "tovu-theme") + ":relay";
  var root = document.documentElement;

  function apply({ mode }, _optional = {}) {
    if (mode === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
  }

  var saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* Storage can be unavailable; the current theme still works. */ }
  if (saved === "light" || saved === "dark") apply({ mode: saved });

  // Every [data-theme-toggle] is wired, not only the first: the header has one and the mobile menu
  // drawer (nav.html's <dialog class="mnav">) has another, and both must stay in step.
  document.addEventListener("DOMContentLoaded", function () {
    var buttons = document.querySelectorAll("[data-theme-toggle]");
    function syncLabels() {
      var label = root.getAttribute("data-theme") === "light" ? "Switch to dark mode" : "Switch to light mode";
      for (var i = 0; i < buttons.length; i++) buttons[i].setAttribute("aria-label", label);
    }
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function () {
        var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
        apply({ mode: next });
        syncLabels();
        try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* Storage can be unavailable; the current theme still works. */ }
      });
    }
    syncLabels();
  });
})();
