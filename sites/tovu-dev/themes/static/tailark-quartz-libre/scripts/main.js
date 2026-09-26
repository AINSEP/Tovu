(function () {
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.main-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  var pricingToggle = document.querySelector('.pricing-toggle');
  if (pricingToggle) {
    var spans = pricingToggle.querySelectorAll('span');
    spans.forEach(function (span) {
      span.addEventListener('click', function () {
        spans.forEach(function (s) { s.classList.remove('active'); });
        span.classList.add('active');
      });
    });
  }
})();
