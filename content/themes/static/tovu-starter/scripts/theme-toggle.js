(function () {
  var STORAGE_KEY = "tovu-starter:mode";
  var root = document.documentElement;
  var buttons = [];

  function apply(mode) {
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
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
  var chosen = saved === "light" || saved === "dark";
  apply(chosen ? saved : byClock());

  // A page left open across 6 am or 6 pm flips by itself until the visitor picks a mode.
  setInterval(function () {
    if (!chosen) apply(byClock());
  }, 60000);

  // Every [data-theme-toggle] is wired, not only the first: the header has one and the mobile menu
  // drawer (nav.html's <dialog class="mnav">) has another, and both must stay in step.
  document.addEventListener("DOMContentLoaded", function () {
    buttons = document.querySelectorAll("[data-theme-toggle]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function () {
        var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
        chosen = true;
        apply(next);
        try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
      });
    }
    apply(root.getAttribute("data-theme") === "light" ? "light" : "dark");
  });
})();
