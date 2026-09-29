// Opts the page into kUInetic's pre-JS cloak (css/kuinetic-cloak.css): entrance elements stay
// hidden until the runtime arms them, instead of painting visible and then snapping to their
// from-state. Loaded from <head>, before <body> parses, so no frame is ever painted uncloaked.
//
// Set from JS on purpose: with scripts off, the attribute never exists and nothing is hidden.
// kUInetic removes it on start; the timer below is the backstop for a runtime that never loads
// (CDN and vendored copy both failing), on top of the CSS-only 2s release in the stylesheet.
(function () {
  var root = document.documentElement;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  root.setAttribute("data-kui-cloak", "");
  setTimeout(function () { root.removeAttribute("data-kui-cloak"); }, 3000);
})();
