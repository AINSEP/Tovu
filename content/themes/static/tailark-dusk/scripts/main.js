(function () {
  var toggle = document.querySelector('[data-nav-toggle]');
  var nav = document.querySelector('.main-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  document.querySelectorAll('.workflow').forEach(function (workflow) {
    var tabs = Array.prototype.slice.call(workflow.querySelectorAll('.workflow-tablist button'));
    var panels = Array.prototype.slice.call(workflow.querySelectorAll('.workflow-panel'));
    if (!tabs.length || !panels.length) return;
    function activate(index) {
      tabs.forEach(function (tab, i) { tab.setAttribute('aria-selected', i === index ? 'true' : 'false'); });
      panels.forEach(function (panel, i) {
        if (i === index) panel.setAttribute('data-active', '');
        else panel.removeAttribute('data-active');
      });
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { activate(i); });
    });
    activate(0);
  });

  document.querySelectorAll('.faq-item').forEach(function (item) {
    var btn = item.querySelector('button');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var isOpen = item.hasAttribute('data-open');
      item.closest('.faq-list').querySelectorAll('.faq-item[data-open]').forEach(function (other) {
        if (other !== item) other.removeAttribute('data-open');
      });
      if (isOpen) item.removeAttribute('data-open');
      else item.setAttribute('data-open', '');
    });
  });
})();
