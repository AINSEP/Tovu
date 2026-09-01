(function () {
  var els = document.querySelectorAll("[data-slide-in]");
  if (!els.length) return;

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || !window.Motion) return; // visible by default in markup; nothing to animate

  var animate = window.Motion.animate;
  var DISTANCE = 48;
  var STAGGER_STEP = 0.12;

  Array.prototype.forEach.call(els, function (el, i) {
    var fromX = el.getAttribute("data-slide-in") === "right" ? DISTANCE : -DISTANCE;
    animate(
      el,
      { opacity: [0, 1], transform: [`translateX(${fromX}px)`, "translateX(0px)"] },
      { duration: 0.7, delay: i * STAGGER_STEP, easing: [0.16, 1, 0.3, 1] }
    );
  });
})();
