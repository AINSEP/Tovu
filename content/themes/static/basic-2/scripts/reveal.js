(function () {
  if (!window.Motion) return; // vendor/motion.js failed to load — content stays visible, no-op
  var animate = window.Motion.animate;
  var inView = window.Motion.inView;
  var stagger = window.Motion.stagger;

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return; // elements are visible by default in markup; nothing to animate

  var GROUPS = [".feature-grid", ".pricing-grid", ".values-grid", ".changelog-list", ".photo-grid", ".blog-grid"];

  GROUPS.forEach(function (sel) {
    document.querySelectorAll(sel).forEach(function (group) {
      var items = Array.prototype.slice.call(group.children);
      if (!items.length) return;
      inView(
        group,
        function () {
          animate(
            items,
            { opacity: [0, 1], transform: ["translateY(18px)", "translateY(0px)"] },
            { duration: 0.6, delay: stagger(0.07), easing: [0.16, 1, 0.3, 1] }
          );
        },
        { amount: 0.15 }
      );
    });
  });

  document.querySelectorAll("[data-reveal]").forEach(function (el) {
    inView(
      el,
      function () {
        animate(
          el,
          { opacity: [0, 1], transform: ["translateY(18px)", "translateY(0px)"] },
          { duration: 0.6, easing: [0.16, 1, 0.3, 1] }
        );
      },
      { amount: 0.15 }
    );
  });
})();
