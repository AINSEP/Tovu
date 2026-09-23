(function () {
  var header = document.querySelector('.site-header');
  function onScroll() {
    if (!header) return;
    header.classList.toggle('scrolled', window.scrollY > 4);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.main-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  var copyBtn = document.querySelector('.install-cmd button');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var cmd = document.querySelector('.install-cmd code');
      if (!cmd) return;
      navigator.clipboard.writeText(cmd.textContent.trim()).then(function () {
        var original = copyBtn.textContent;
        copyBtn.textContent = 'Copied';
        setTimeout(function () { copyBtn.textContent = original; }, 1500);
      });
    });
  }

  // Adds a small "Copy code" button to every `pre` block on the page (docs articles and post/page
  // body content both render `<pre><code>…</code></pre>` — see `.docs-main pre`/`.post-detail-body
  // pre` in theme.css). Runs once at load, same as the header/nav wiring above: this script tag
  // sits at the end of `<body>` in every page template, so the DOM is already parsed when it runs.
  // Deliberately skips inline `<code>` that is not inside a `pre` — those are short, in-line
  // snippets a reader can select directly, not a whole block worth a dedicated control.
  function setupCodeCopyButtons() {
    var blocks = document.querySelectorAll('pre');
    for (var i = 0; i < blocks.length; i++) {
      (function (pre) {
        if (!navigator.clipboard || pre.querySelector('.code-copy-btn')) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'code-copy-btn';
        btn.setAttribute('aria-label', 'Copy code');
        btn.innerHTML =
          '<svg class="icon-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>' +
          '<svg class="icon-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L19 7"/></svg>';
        var resetTimer = null;
        btn.addEventListener('click', function () {
          navigator.clipboard.writeText(pre.textContent).then(function () {
            btn.classList.add('copied');
            btn.setAttribute('aria-label', 'Copied');
            if (resetTimer) clearTimeout(resetTimer);
            resetTimer = setTimeout(function () {
              btn.classList.remove('copied');
              btn.setAttribute('aria-label', 'Copy code');
            }, 1500);
          });
        });
        pre.appendChild(btn);
        pre.classList.add('has-copy-btn');
      })(blocks[i]);
    }
  }
  setupCodeCopyButtons();
})();
