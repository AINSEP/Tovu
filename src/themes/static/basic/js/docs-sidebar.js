/**
 * Docs sidebar scroll-spy.
 *
 * Why this exists at all: the engine computes `isCurrent`/`isActive` server-side by comparing each
 * item's resolved href against the request's ROUTE PATH. That is exactly right for a menu of links
 * to other pages, and useless for a menu of `#anchor` links into the page you are already on —
 * every one of them shares the same path, and the server cannot know how far you have scrolled.
 * So in-page section highlighting is necessarily client work; this only ever touches items whose
 * href starts with `#`, leaving server-decided state on real page links untouched.
 *
 * Applies the same `is-current`/`is-active` classes the tree renderer emits, so the CSS is shared
 * and there is no second visual vocabulary to keep in sync.
 */
(function () {
  "use strict";

  var nav = document.querySelector(".docs-nav");
  if (!nav) return;

  var links = Array.prototype.filter.call(nav.querySelectorAll("a[href^='#']"), function (a) {
    return a.getAttribute("href").length > 1;
  });
  if (links.length === 0) return;

  var targets = links
    .map(function (link) {
      var el = document.getElementById(decodeURIComponent(link.getAttribute("href").slice(1)));
      return el ? { link: link, el: el } : null;
    })
    .filter(Boolean);
  if (targets.length === 0) return;

  function setActive(entry) {
    targets.forEach(function (t) {
      var li = t.link.closest(".menu-item");
      var on = t === entry;
      t.link.toggleAttribute("aria-current", on);
      if (li) li.classList.toggle("is-current", on);
      // Mark the enclosing section too, so a collapsed/styled parent stays visibly open.
      var parentLi = li && li.parentElement ? li.parentElement.closest(".menu-item") : null;
      if (parentLi) parentLi.classList.toggle("is-active", on);
    });
  }

  // `rootMargin`'s large negative bottom means a heading counts as "current" once it reaches the
  // upper band of the viewport, rather than the moment it appears at the very bottom.
  var observer = new IntersectionObserver(
    function (entries) {
      var visible = entries.filter(function (e) {
        return e.isIntersecting;
      });
      if (visible.length === 0) return;
      var top = visible.reduce(function (a, b) {
        return a.boundingClientRect.top < b.boundingClientRect.top ? a : b;
      });
      var match = targets.filter(function (t) {
        return t.el === top.target;
      })[0];
      if (match) setActive(match);
    },
    { rootMargin: "-88px 0px -70% 0px", threshold: 0 }
  );

  targets.forEach(function (t) {
    observer.observe(t.el);
  });
})();
