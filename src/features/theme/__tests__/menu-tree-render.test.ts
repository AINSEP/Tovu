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
