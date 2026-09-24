import assert from "node:assert/strict";
import test from "node:test";

import { renderStaticPage, type StaticMenuItem } from "../static-render.js";
import type { DiscoveredTheme } from "../theme.js";

/**
 * @file `renderMenuTree`'s tree-variant rendering, plus the malformed-config and label-escaping
 * guarantees `theme-pages-render.canary.test.ts`'s real-theme sweep structurally cannot exercise (a
 * real theme doesn't ship malformed JSON or an XSS payload as a menu label).
 *
 * Deliberately its own file, not restored into `static-render.test.ts` (deleted 2026-08-11): that
 * file's fixtures were written against an intermediate point of the 2026-08-10 marker-spine
 * unification, where a marker carried separate `data-embed-type`/`data-embed-id` attributes plus an
 * optional `data-embed-config` for extras. The design was collapsed further, before this session, to
 * ONE `data-embed-config='{"type":...,"id":...}'` attribute (`src/contracts/core/embeds/marker.ts`'s
 * `MARKER_PATTERN`, confirmed against the real `content/themes/static/basic/nav.html` on disk) without
 * static-render.test.ts being updated to match — every fixture in that file used an attribute shape
 * `scanEmbedMarkers` no longer recognizes at all, so its assertions were failing (or, per two
 * independent handoffs, some path through it hung outright) regardless of what they claimed to
 * certify. Every fixture below uses the CURRENT single-attribute spelling, the same
 * `theme-slot-honors-current-page.test.ts` and `theme-pages-render.canary.test.ts` already use.
 */

const HEADER_ID = "menu-header-nav";

function items(...entries: Array<Partial<StaticMenuItem> & { label: string }>): StaticMenuItem[] {
  return entries.map((e) => ({ href: null, available: true, isCurrent: false, children: [], ...e }));
}

function makeTheme(pageHtml: string): DiscoveredTheme {
  return {
    manifest: { id: "t", name: "T", version: "1.0.0", tier: "static", engine: 1 },
    dir: "/fake",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: { index: pageHtml },
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  };
}

/** A single header-nav marker with no `variant` — the flat-render default. */
function flatTheme(): DiscoveredTheme {
  return makeTheme(`<html><body><nav data-embed-config='{"type":"menu","id":"${HEADER_ID}"}'></nav></body></html>`);
}

/** Same marker, opted into nested rendering via `variant: "tree"`. */
function treeTheme(fallback = ""): DiscoveredTheme {
  return makeTheme(
    `<html><body><nav data-embed-config='{"type":"menu","id":"${HEADER_ID}","variant":"tree"}'>${fallback}</nav></body></html>`
  );
}

test("a marker WITHOUT the tree variant still gets flat <a> output, byte-identical", () => {
  const html = renderStaticPage({
    theme: flatTheme(),
    pageId: "index",
    menus: { [HEADER_ID]: items({ label: "Docs", href: "/docs" }) },
  });
  assert.ok(html?.includes('<a href="/docs">Docs</a>'));
  assert.ok(!html?.includes("<ul"), "no list wrapper — .main-nav's flex layout depends on bare anchors");
});

test("the tree variant emits nested <ul>/<li> with depth classes", () => {
  const html = renderStaticPage({
    theme: treeTheme(),
    pageId: "index",
    menus: {
      [HEADER_ID]: items({
        label: "Themes",
        href: "#themes",
        children: items({ label: "Tokens", href: "#tokens" }),
      }),
    },
  });
  assert.ok(html?.includes('<ul class="menu-list depth-0">'));
  assert.ok(html?.includes('<ul class="menu-list depth-1">'));
  assert.ok(html?.includes('<a href="#tokens">Tokens</a>'));
  assert.match(html ?? "", /class="menu-item depth-0 has-children"/);
});

test("isCurrent and isActive become distinct class hooks", () => {
  const html = renderStaticPage({
    theme: treeTheme(),
    pageId: "index",
    menus: {
      [HEADER_ID]: items({
        label: "Themes",
        href: "#themes",
        isActive: true,
        children: items({ label: "Tokens", href: "#tokens", isCurrent: true, isActive: true }),
      }),
    },
  });
  assert.match(html ?? "", /class="menu-item depth-0 has-children is-active"/);
  assert.match(html ?? "", /class="menu-item depth-1 is-current is-active"/);
  assert.ok(html?.includes('aria-current="page"'));
});

test("an unavailable BRANCH stays as inert text so its children survive", () => {
  const html = renderStaticPage({
    theme: treeTheme(),
    pageId: "index",
    menus: {
      [HEADER_ID]: items({
        label: "Trashed Section",
        href: null,
        available: false,
        children: items({ label: "Still Here", href: "#still-here" }),
      }),
    },
  });
  assert.ok(html?.includes('<span class="menu-item-label">Trashed Section</span>'));
  assert.ok(html?.includes('<a href="#still-here">Still Here</a>'), "the subtree must not be deleted with its parent");
});

test("an unavailable LEAF is omitted entirely, never a dead link", () => {
  const html = renderStaticPage({
    theme: treeTheme(),
    pageId: "index",
    menus: {
      [HEADER_ID]: items({ label: "Gone", href: null, available: false }, { label: "Fine", href: "#fine" }),
    },
  });
  assert.ok(!html?.includes("Gone"));
  assert.ok(html?.includes('<a href="#fine">Fine</a>'));
});

test("authored cssClass, description and icon reach the markup", () => {
  const html = renderStaticPage({
    theme: treeTheme(),
    pageId: "index",
    menus: {
      [HEADER_ID]: items({
        label: "Tokens",
        href: "#tokens",
        attrs: { cssClass: "is-new", description: "Design variables", icon: "swatch" },
      }),
    },
  });
  assert.match(html ?? "", /class="menu-item depth-0 is-new"/);
  assert.ok(html?.includes('<span class="menu-item-desc">Design variables</span>'));
  assert.ok(html?.includes('data-icon="swatch"'));
});

test("authored rel and openInNewTab reach the <a> tag — previously read nowhere despite being declared on NavItemAttrs alongside cssClass/description/icon", () => {
  const html = renderStaticPage({
    theme: treeTheme(),
    pageId: "index",
    menus: {
      [HEADER_ID]: items({
        label: "External",
        href: "https://example.com",
        attrs: { rel: "nofollow", openInNewTab: true },
      }),
    },
  });
  assert.ok(html?.includes('<a href="https://example.com" rel="nofollow" target="_blank">External</a>'));
});

test("the FLAT variant honors authored rel and openInNewTab too — the admin menu editor's 'Open in new tab' must not silently do nothing on a flat nav/footer", () => {
  const html = renderStaticPage({
    theme: flatTheme(),
    pageId: "index",
    menus: {
      [HEADER_ID]: items({
        label: "External",
        href: "https://example.com",
        attrs: { rel: 'nofollow"><script>x</script>', openInNewTab: true },
      }),
    },
  });
  assert.ok(
    html?.includes('<a href="https://example.com" rel="nofollow&quot;&gt;&lt;script&gt;x&lt;/script&gt;" target="_blank">External</a>'),
    html ?? "null"
  );
});

test("an item with no attrs at all still renders the plain <a>, no stray rel/target/class", () => {
  const html = renderStaticPage({
    theme: treeTheme(),
    pageId: "index",
    menus: { [HEADER_ID]: items({ label: "Plain", href: "/plain" }) },
  });
  assert.ok(html?.includes('<a href="/plain">Plain</a>'));
});

test("a tree that renders to nothing leaves the marker's authored fallback alone", () => {
  const html = renderStaticPage({
    theme: treeTheme("FALLBACK"),
    pageId: "index",
    menus: { [HEADER_ID]: items({ label: "Gone", href: null, available: false }) },
  });
  assert.ok(html?.includes("FALLBACK"), "an empty render must never blank the marker");
});

test("menu link labels and hrefs are HTML-escaped", () => {
  const html = renderStaticPage({
    theme: flatTheme(),
    pageId: "index",
    menus: { [HEADER_ID]: items({ label: "<script>alert(1)</script>", href: '/x"y' }) },
  });
  assert.ok(!html?.includes("<script>alert(1)</script>"));
  assert.ok(html?.includes("&lt;script&gt;"));
  assert.ok(html?.includes("/x&quot;y"));
});

/**
 * The above proves escaping only for the FLAT path (`renderMenuLinks`). This proves it for the TREE
 * path (`menuItemBody`/`menuItemInnerHtml`/`menuItemLinkAttrs`) — the functions the batch-G
 * complexity refactor actually split out of the original `menuItemBody`. Every `treeTheme()` test
 * above this point asserts that an AUTHORED value passes through; none used a hostile one, so the
 * tree path's escaping was unproven by any test until this one, even though a source read shows it
 * calls the same `escapeHtml()` (this file's own `static-render.ts:159-166`) the flat path does.
 *
 * `label`/`description` are BODY-context sinks (`>${escapeHtml(x)}<`) — a raw `<`/`>` breaking out of
 * the surrounding element is the risk. `href`/`icon`'s `data-icon`/`rel` are ATTRIBUTE-context sinks
 * (`="${escapeHtml(x)}"`) — a raw `"` closing the attribute early and injecting a new one onto the
 * SAME tag is the risk that a body-only escaping bug could miss, so each attribute-sink payload below
 * leads with `">` specifically to attempt exactly that break-out.
 */
test("tree path (menuItemBody): label/description (body sinks) and href/icon/rel (attribute sinks) are all HTML-escaped — hostile input never breaks out of its sink", () => {
  const label = '<script>alert("label")</script>';
  const description = "<img src=x onerror=alert('description')>";
  const icon = '"><svg onload=alert(1)>';
  const href = '/x"><script>alert("href")</script>';
  const rel = 'noopener"><script>alert("rel")</script>';

  const html = renderStaticPage({
    theme: treeTheme(),
    pageId: "index",
    menus: {
      [HEADER_ID]: items({ label, href, attrs: { description, icon, rel } }),
    },
  });

  // Negative check first, independent of the exact-string assertion below: none of the raw payloads
  // may survive unescaped ANYWHERE on the page — this catches a leak even if the positive assertion
  // below has a typo.
  assert.ok(!html?.includes('<script>alert("label")</script>'), "label must not reach the page as a live <script> tag");
  assert.ok(!html?.includes("<img src=x onerror=alert('description')>"), "description must not reach the page as a live <img> tag");
  assert.ok(!html?.includes("<svg onload=alert(1)>"), "icon's data-icon value must not break out of its attribute into a live <svg> tag");
  assert.ok(!html?.includes('<script>alert("href")</script>'), "href must not break out of its attribute into a live <script> tag");
  assert.ok(!html?.includes('<script>alert("rel")</script>'), "rel must not break out of its attribute into a live <script> tag");

  // Positive check: the exact escaped bytes `escapeHtml()` must produce, reconstructed in place —
  // proves correct encoding, not merely absence of the raw payload.
  const expectedInner =
    '<span class="menu-item-icon" data-icon="&quot;&gt;&lt;svg onload=alert(1)&gt;"></span>' +
    '&lt;script&gt;alert(&quot;label&quot;)&lt;/script&gt;' +
    "<span class=\"menu-item-desc\">&lt;img src=x onerror=alert(&#39;description&#39;)&gt;</span>";
  const expectedHref = '/x&quot;&gt;&lt;script&gt;alert(&quot;href&quot;)&lt;/script&gt;';
  const expectedRel = 'noopener&quot;&gt;&lt;script&gt;alert(&quot;rel&quot;)&lt;/script&gt;';
  const expectedAnchor = `<a href="${expectedHref}" rel="${expectedRel}">${expectedInner}</a>`;

  assert.ok(html?.includes(expectedAnchor), `expected exact escaped anchor markup, got:\n${html}`);
});

/**
 * `attrs.cssClass` is the one authored attribute-context sink the test above does not cover: it lands
 * in the `<li class="...">` list, and the docs-prev-next pager (`pages.ts`) concatenates it onto its
 * own `docs-pager-*` hook — so a `"` in it closed the class attribute and injected a live handler.
 */
test("tree path (menuItemClasses): authored cssClass is HTML-escaped inside the <li> class attribute", () => {
  const html = renderStaticPage({
    theme: treeTheme(),
    pageId: "index",
    menus: {
      [HEADER_ID]: items({ label: "Docs", href: "/docs", attrs: { cssClass: 'x" onmouseover="alert(1)' } }),
    },
  });

  assert.ok(!html?.includes('onmouseover="alert(1)"'), `cssClass must not break out of the class attribute, got:\n${html}`);
  assert.ok(
    html?.includes('<li class="menu-item depth-0 x&quot; onmouseover=&quot;alert(1)">'),
    `expected the exact escaped class list, got:\n${html}`
  );
});

/**
 * The flat and tree paths call the exact same `escapeHtml()` on the two fields they share (label,
 * href) — this proves it end to end rather than trusting the source read, since this repo has THREE
 * render paths that are documented to diverge elsewhere (`reference_tovu_three_render_paths_diverge`)
 * and "the source calls the same function" has already been an unreliable argument on its own today.
 */
test("tree and flat paths escape the SAME label/href value byte-identically — not two independently-drifting copies", () => {
  const label = '<script>alert(1)</script>';
  const href = '/x"y';

  const flatHtml = renderStaticPage({
    theme: flatTheme(),
    pageId: "index",
    menus: { [HEADER_ID]: items({ label, href }) },
  });
  const treeHtml = renderStaticPage({
    theme: treeTheme(),
    pageId: "index",
    menus: { [HEADER_ID]: items({ label, href }) },
  });

  const expectedEscapedLabel = "&lt;script&gt;alert(1)&lt;/script&gt;";
  const expectedEscapedHrefAttr = 'href="/x&quot;y"';

  assert.ok(flatHtml?.includes(expectedEscapedLabel));
  assert.ok(treeHtml?.includes(expectedEscapedLabel));
  assert.ok(flatHtml?.includes(expectedEscapedHrefAttr));
  assert.ok(treeHtml?.includes(expectedEscapedHrefAttr));
});

/**
 * G3 — `escapeHtml` alone never inspects a URL's scheme, so a menu item's `href` (operator-authored,
 * reaches every visitor) could smuggle an executable scheme into public HTML before `safeHref` (this
 * file) existed. Every entry here is exercised against BOTH render paths below, since both were
 * equally exposed before this fix — a scheme guard added to only one path would have just moved the
 * gap, not closed it.
 */
const MALICIOUS_HREF_SCHEMES: readonly string[] = [
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
  "//evil.example",
  "/\\evil.example",
];

/** Every href shape a real menu link legitimately uses — a scheme guard that breaks these is a worse
 *  outcome than the vulnerability it closes (this dispatch's own words). */
const LEGITIMATE_HREFS: readonly string[] = ["/about", "https://example.com", "mailto:hello@example.com", "#anchor"];

test("flat path (renderMenuLinks): every malicious href scheme collapses to '#', never reaches the page", () => {
  for (const hostileHref of MALICIOUS_HREF_SCHEMES) {
    const html = renderStaticPage({
      theme: flatTheme(),
      pageId: "index",
      menus: { [HEADER_ID]: items({ label: "X", href: hostileHref }) },
    });
    assert.ok(html?.includes('<a href="#"'), `expected '${hostileHref}' to collapse to href="#", got:\n${html}`);
    assert.ok(!html?.includes(`href="${hostileHref}"`), `'${hostileHref}' must never reach the page verbatim`);
  }
});

test("flat path (renderMenuLinks): every legitimate href passes through unchanged", () => {
  for (const href of LEGITIMATE_HREFS) {
    const html = renderStaticPage({
      theme: flatTheme(),
      pageId: "index",
      menus: { [HEADER_ID]: items({ label: "X", href }) },
    });
    assert.ok(html?.includes(`href="${href}"`), `expected '${href}' to pass through unchanged, got:\n${html}`);
  }
});

test("tree path (menuItemBody): every malicious href scheme collapses to '#', never reaches the page", () => {
  for (const hostileHref of MALICIOUS_HREF_SCHEMES) {
    const html = renderStaticPage({
      theme: treeTheme(),
      pageId: "index",
      menus: { [HEADER_ID]: items({ label: "X", href: hostileHref }) },
    });
    assert.ok(html?.includes('<a href="#"'), `expected '${hostileHref}' to collapse to href="#", got:\n${html}`);
    assert.ok(!html?.includes(`href="${hostileHref}"`), `'${hostileHref}' must never reach the page verbatim`);
  }
});

test("tree path (menuItemBody): every legitimate href passes through unchanged", () => {
  for (const href of LEGITIMATE_HREFS) {
    const html = renderStaticPage({
      theme: treeTheme(),
      pageId: "index",
      menus: { [HEADER_ID]: items({ label: "X", href }) },
    });
    assert.ok(html?.includes(`href="${href}"`), `expected '${href}' to pass through unchanged, got:\n${html}`);
  }
});

test("a marker with syntactically invalid data-embed-config degrades to its authored fallback, never throws", () => {
  // parseMarkerConfig (src/contracts/core/embeds/marker.ts) reports invalid JSON as a REJECTED marker rather
  // than a match; substituteMarkers only ever touches matched markers, so a rejected one is left
  // exactly as authored — the render-time half of the "never fail the render" contract whose
  // write-time half is `theme.ts`'s lint-before-publish refusing to save markup like this at all.
  const theme = makeTheme(
    `<html><body><nav data-embed-config='{"type":"menu","id":"${HEADER_ID}"'>FALLBACK</nav></body></html>`
  );
  let html: string | null = null;
  assert.doesNotThrow(() => {
    html = renderStaticPage({ theme, pageId: "index", menus: { [HEADER_ID]: items({ label: "X", href: "/x" }) } });
  });
  assert.ok(html?.includes("FALLBACK"), "an unparseable marker is left exactly as authored, not blanked or crashed");
});
