(function () {
  var STORAGE_KEY = "tovu-theme:relay";
  var root = document.documentElement;

  function apply(mode) {
    if (mode === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
  }

  var saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
  if (saved === "light" || saved === "dark") apply(saved);

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
        apply(next);
        syncLabels();
        try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
      });
    }
    syncLabels();
  });
})();
