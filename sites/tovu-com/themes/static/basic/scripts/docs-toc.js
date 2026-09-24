/**
 * Docs "On this page" — auto-built table of contents + scroll-spy.
 *
 * Why this exists: `posts-sidebar.html`'s `.docs-toc-nav` ships empty. Unlike `.docs-sidebar`
 * (server-resolved from the `docs-section` reserved marker, `pages.ts`), there is no per-page
 * authored menu for "the headings on THIS page" anymore — the 2026-09-24 docs IA restructure
 * retired that convention (`docs-current-page-sidebar`, one hand-authored menu per doc page) in
 * favor of reading the page's own `h2`/`h3` at render time. One page = one template = zero authored
 * TOC menus to keep in sync as headings are added, reordered, or renamed.
 *
 * Scroll-spy logic below (`setActive`/the `IntersectionObserver`/the click-lock) is carried over
 * unchanged from the retired `docs-sidebar.js`, which solved the exact same "highlight the heading
 * currently in view" problem for a hand-authored anchor menu — see that file's own comments for the
 * two-pass-clear and click-lock reasoning. The only new work here is building the list this drives.
 */
(function () {
  "use strict";

  var toggle = document.querySelector(".docs-toc-toggle");
  var nav = document.querySelector(".docs-toc-nav");
  var content = document.querySelector(".docs-content");
  if (!toggle || !nav || !content) return;

  var headings = Array.prototype.filter.call(content.querySelectorAll("h2, h3"), function (h) {
    // A heading with no visible text (an empty/whitespace-only heading some editor left behind)
    // has nothing to link to or label a link with — skip it rather than emit a blank TOC entry.
    return h.textContent.trim().length > 0;
  });

  // No headings at all: nothing to show "on this page." Remove the whole disclosure rather than
  // leave an empty one — an empty toggle that opens onto nothing is worse than no toggle.
  if (headings.length === 0) {
    toggle.remove();
    return;
  }

  var usedIds = {};
  Array.prototype.forEach.call(document.querySelectorAll("[id]"), function (el) {
    usedIds[el.id] = true;
  });

  /** Kebab-case a heading's own text into an id candidate; strips everything but
   *  letters/digits/spaces/hyphens first so punctuation in a title (e.g. "Config file (advanced)")
   *  does not leak stray characters into the anchor. */
  function slugify(text) {
    var base = text
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return base || "section";
  }

  /** Resolves a heading's id, assigning one derived from its text (de-duplicated against every id
   *  already on the page, including ids this same pass has just assigned) when it has none. Never
   *  overwrites an author-set id — an existing id is some other part of the page's own contract
   *  (an in-body anchor link may already point at it) and must survive untouched. */
  function ensureId(heading) {
    if (heading.id) return heading.id;
    var slug = slugify(heading.textContent);
    var candidate = slug;
    var n = 2;
    while (usedIds[candidate]) {
      candidate = slug + "-" + n;
      n += 1;
    }
    usedIds[candidate] = true;
    heading.id = candidate;
    return candidate;
  }

  /**
   * Groups the flat heading list into a two-level tree: each `h2` starts a new top-level entry, and
   * a run of `h3`s belongs to the most recently seen `h2`. `h3`s appearing before any `h2` (malformed
   * content, not a case the theme forbids) attach to a synthetic top-level group with no link of its
   * own, so they still render rather than being silently dropped.
   */
  function buildTree(items) {
    var roots = [];
    var currentGroup = null;
    items.forEach(function (heading) {
      var entry = { heading: heading, children: [] };
      if (heading.tagName === "H2") {
        roots.push(entry);
        currentGroup = entry;
      } else if (currentGroup) {
        currentGroup.children.push(entry);
      } else {
        roots.push(entry);
      }
    });
    return roots;
  }

  function renderList(entries, depth) {
    var ul = document.createElement("ul");
    ul.className = "toc-list depth-" + depth;
    entries.forEach(function (entry) {
      var li = document.createElement("li");
      li.className = "toc-item depth-" + depth;
      var a = document.createElement("a");
      a.href = "#" + ensureId(entry.heading);
      a.textContent = entry.heading.textContent.trim();
      li.appendChild(a);
      if (entry.children.length > 0) {
        li.appendChild(renderList(entry.children, depth + 1));
      }
      ul.appendChild(li);
    });
    return ul;
  }

  nav.appendChild(renderList(buildTree(headings), 0));

  // ---- scroll-spy: highlights the link for whichever heading is currently in view ----
  // Carried over from the retired docs-sidebar.js (2026-08-31) — same observer shape, same
  // two-pass-clear, same click-lock. Re-queries against the list this function just built, not the
  // now-removed per-page authored menu.
  var links = Array.prototype.slice.call(nav.querySelectorAll("a[href^='#']"));
  var targets = links
    .map(function (link) {
      var el = document.getElementById(link.getAttribute("href").slice(1));
      return el ? { link: link, el: el } : null;
    })
    .filter(Boolean);
  if (targets.length === 0) return;

  function setActive(entry) {
    nav.querySelectorAll(".toc-item.is-current").forEach(function (li) {
      li.classList.remove("is-current");
    });
    nav.querySelectorAll("a[aria-current]").forEach(function (a) {
      a.removeAttribute("aria-current");
    });
    if (!entry) return;
    entry.link.setAttribute("aria-current", "page");
    var li = entry.link.closest(".toc-item");
    if (li) li.classList.add("is-current");
  }

  var lockedUntil = 0;

  var observer = new IntersectionObserver(
    function (entries) {
      if (Date.now() < lockedUntil) return;
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

  targets.forEach(function (t) {
    t.link.addEventListener("click", function () {
      lockedUntil = Date.now() + 700;
      setActive(t);
      // On mobile the TOC lives inside a <details> disclosure; a reader who taps a link inside it
      // almost certainly wants to read that section next, not keep the disclosure open over it.
      if (toggle.hasAttribute("open") && window.matchMedia("(max-width: 900px)").matches) {
        toggle.removeAttribute("open");
      }
    });
  });
})();
