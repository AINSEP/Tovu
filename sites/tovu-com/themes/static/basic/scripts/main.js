(function () {
  var header = document.querySelector('.site-header');
  function onScroll() {
    if (!header) return;
    header.classList.toggle('scrolled', window.scrollY > 4);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

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

  // ---------- mobile / compact menu ----------
  // The header is "compact" at <=900px (CSS media query) OR whenever the desktop row simply does
  // not fit (`.nav-compact`, measured below) — so adding menu items collapses the bar into the
  // hamburger instead of overflowing it, at any width. In compact mode the hamburger opens the
  // <dialog class="mnav"> drawer from nav.html, whose list is built here from the rendered
  // `.main-nav` so it always matches the Menus feature, at any depth.

  /** Reads `.main-nav` into `{ label, active, children }` nodes. Handles both the engine's tree
   *  variant (`ul.menu-list > li.menu-item > a|span.menu-item-label + ul`) and the authored flat
   *  fallback (bare `<a>` children), recursively — no depth is assumed. O(n) in menu items. */
  function readMenu(container) {
    var list = container.querySelector(':scope > ul');
    if (!list) {
      return Array.prototype.map.call(container.querySelectorAll(':scope > a'), function (a) {
        return { label: a, active: false, children: [] };
      });
    }
    return Array.prototype.map.call(list.children, function (li) {
      var sub = li.querySelector(':scope > ul');
      return {
        label: li.querySelector(':scope > a, :scope > .menu-item-label'),
        active: li.classList.contains('is-active') || li.classList.contains('is-current'),
        children: sub ? readMenu(li) : [],
      };
    });
  }

  var mnavUid = 0;
  var CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  function buildMenuList(items) {
    var ul = document.createElement('ul');
    ul.className = 'mnav-list';
    items.forEach(function (item) { if (item.label) ul.appendChild(buildMenuItem(item)); });
    return ul;
  }

  /** One drawer row. A linkable parent keeps its link and gets a separate disclosure button; an
   *  inert parent (`span.menu-item-label`) becomes the disclosure button itself. A group starts
   *  open when it holds the current page, so the reader lands where they are. */
  function buildMenuItem(item) {
    var li = document.createElement('li');
    li.className = 'mnav-item';
    var row = document.createElement('div');
    row.className = 'mnav-row';
    li.appendChild(row);
    var isLink = item.label.tagName === 'A';
    var name = item.label.textContent.trim();

    if (!item.children.length) {
      var leaf = item.label.cloneNode(true);
      leaf.className = isLink ? 'mnav-link' : 'mnav-link mnav-inert';
      row.appendChild(leaf);
      return li;
    }

    var sub = buildMenuList(item.children);
    sub.id = 'mnav-sub-' + (++mnavUid);
    var open = item.active || sub.querySelector('[aria-current="page"]') !== null;
    sub.hidden = !open;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mnav-disclose';
    btn.setAttribute('aria-controls', sub.id);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (isLink) {
      var link = item.label.cloneNode(true);
      link.className = 'mnav-link';
      row.appendChild(link);
      btn.setAttribute('aria-label', name + ' submenu');
      btn.innerHTML = CHEVRON;
    } else {
      btn.classList.add('mnav-disclose-label');
      btn.innerHTML = '<span></span>' + CHEVRON;
      btn.firstChild.textContent = name;
    }
    btn.addEventListener('click', function () {
      var nowOpen = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
      sub.hidden = !nowOpen;
    });
    row.appendChild(btn);
    li.appendChild(sub);
    return li;
  }

  /** Does the desktop row (brand + top-level items + actions) fit on one line? Measures the
   *  top-level items' own boxes, not the row's scrollWidth, because the hidden dropdown panels are
   *  absolutely positioned and would inflate any overflow measurement. */
  function desktopNavFits(header) {
    var row = header.querySelector('.nav-row');
    var brand = header.querySelector('.brand');
    var actions = header.querySelector('.nav-actions');
    var nav = header.querySelector('.main-nav');
    var items = (nav.querySelector(':scope > ul') || nav).children;
    if (!row || !brand || !actions || !items.length) return true;
    var first = items[0].getBoundingClientRect();
    var last = items[items.length - 1].getBoundingClientRect();
    var style = getComputedStyle(row);
    var avail = row.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    var MIN_GAP = 32;
    return brand.offsetWidth + (last.right - first.left) + actions.offsetWidth + 2 * MIN_GAP <= avail;
  }

  function setupMobileNav() {
    var header = document.querySelector('.site-header');
    var toggle = header && header.querySelector('.nav-toggle');
    var dialog = document.getElementById('mnav');
    var source = header && header.querySelector('.main-nav');
    if (!toggle || !dialog || !source || typeof dialog.showModal !== 'function') return;
    var root = document.documentElement;
    dialog.querySelector('.mnav-body').appendChild(buildMenuList(readMenu(source)));

    var narrow = window.matchMedia('(max-width: 900px)');
    function updateCompact() {
      header.classList.remove('nav-compact');
      if (!narrow.matches && !desktopNavFits(header)) header.classList.add('nav-compact');
      var compact = narrow.matches || header.classList.contains('nav-compact');
      if (!compact && dialog.open) dialog.close();
    }
    var pending = false;
    window.addEventListener('resize', function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; updateCompact(); });
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(updateCompact);
    updateCompact();

    toggle.addEventListener('click', function () {
      dialog.showModal();
      root.classList.add('mnav-open');
      toggle.setAttribute('aria-expanded', 'true');
    });
    // Escape (native `cancel`), the close button, the backdrop and any link all end up here.
    dialog.addEventListener('close', function () {
      root.classList.remove('mnav-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.focus();
    });
    dialog.addEventListener('click', function (e) {
      // A click on the dialog box itself (not the panel inside it) can only be the ::backdrop.
      if (e.target === dialog || e.target.closest('[data-mnav-close]') || e.target.closest('a')) dialog.close();
    });
  }
  setupMobileNav();
})();
