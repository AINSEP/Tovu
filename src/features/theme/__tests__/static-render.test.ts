import assert from "node:assert/strict";
import test from "node:test";

import { renderStaticPage, scanMenuEmbedIds, type StaticMenuItem } from "../static-render";
import type { DiscoveredTheme } from "../theme";

/**
 * @file Direct menu-embed wiring — certifies `renderStaticPage`'s `data-embed-type="menu"
 * data-embed-id="<menuId>"` marker handling: a menu id with no entry in `menus` leaves the theme's
 * authored fallback content untouched (INV: zero visible regression for a theme that never passes
 * `menus`), a resolved menu's items replace the marker's inner content keyed by that menu's own id,
 * an unavailable item is omitted rather than rendered as a dead link, and a resolved-but-current item
 * gets `aria-current="page"`. Also certifies `scanMenuEmbedIds`, the pure scan the route layer uses
 * to know which menu ids a theme's markup references before fetching them.
 */

const HEADER_ID = "menu-header-nav";
const FOOTER_ID = "menu-footer-nav";

function makeTheme(): DiscoveredTheme {
  return {
    manifest: { id: "t", name: "T", version: "1.0.0", tier: "static", engine: 1 },
    dir: "/fake",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: {
      index: [
        "<!doctype html><html><head>",
        '<link rel="stylesheet" href="../css/styles.css" />',
        "</head><body>",
        '<div data-tovu-slot="nav" data-nav-current="index"></div>',
        "<main>home</main>",
        '<div data-tovu-slot="footer"></div>',
        "</body></html>",
      ].join(""),
    },
    partials: {
      nav: `<nav class="main-nav" data-embed-type="menu" data-embed-id="${HEADER_ID}"><a href="pricing.html" data-nav-id="pricing">Pricing</a></nav>`,
      footer: `<footer><div class="footer-col" data-embed-type="menu" data-embed-id="${FOOTER_ID}"><h4>Legal</h4><a href="#">Privacy</a><a href="#">Terms</a></div></footer>`,
    },
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  };
}

function items(...entries: Array<Partial<StaticMenuItem> & { label: string }>): StaticMenuItem[] {
  return entries.map((e) => ({ href: null, available: true, isCurrent: false, children: [], ...e }));
}

test("renderStaticPage: no menus passed leaves the theme's own nav/footer content untouched", () => {
  const html = renderStaticPage({ theme: makeTheme(), pageId: "index" });
  assert.ok(html?.includes('<a href="/pricing" data-nav-id="pricing">Pricing</a>'));
  assert.ok(html?.includes("<h4>Legal</h4>"));
  assert.ok(html?.includes('<a href="#">Privacy</a>'));
});

test("renderStaticPage: a menu id with no entry in `menus` is unaffected even when the other id is present", () => {
  const html = renderStaticPage({
    theme: makeTheme(),
    pageId: "index",
    menus: { [HEADER_ID]: items({ label: "About", href: "/about" }) },
  });
  // header replaced
  assert.ok(html?.includes('<a href="/about">About</a>'));
  assert.ok(!html?.includes('data-nav-id="pricing"'));
  // footer untouched (no footer-id key passed)
  assert.ok(html?.includes("<h4>Legal</h4>"));
});

test("renderStaticPage: a resolved menu replaces the marker's content, omits unavailable items, and marks the current one", () => {
  const html = renderStaticPage({
    theme: makeTheme(),
    pageId: "index",
    menus: {
      [HEADER_ID]: items(
        { label: "About", href: "/about" },
        { label: "Deleted", href: null, available: false },
        { label: "Contact", href: "/contact", isCurrent: true }
      ),
      [FOOTER_ID]: items({ label: "Privacy Policy", href: "/privacy" }, { label: "Terms of Service", href: "/terms" }),
    },
  });
  assert.ok(html?.includes('<a href="/about">About</a>'));
  assert.ok(!html?.includes("Deleted"));
  assert.ok(html?.includes('<a href="/contact" aria-current="page">Contact</a>'));
  assert.ok(!html?.includes('data-nav-id="pricing"'), "original hardcoded nav link should be replaced, not duplicated");
  assert.ok(html?.includes('<a href="/privacy">Privacy Policy</a>'));
  assert.ok(html?.includes('<a href="/terms">Terms of Service</a>'));
  assert.ok(!html?.includes("<h4>Legal</h4>"), "footer marker's own fallback content (incl. heading) is replaced wholesale");
});

test("renderStaticPage: a menu that resolves to zero renderable links falls back to authored content", () => {
  const html = renderStaticPage({
    theme: makeTheme(),
    pageId: "index",
    menus: { [HEADER_ID]: items({ label: "Deleted", href: null, available: false }) },
  });
  assert.ok(html?.includes('data-nav-id="pricing"'));
});

test("renderStaticPage: an id in `menus` with no matching marker anywhere in the page is a no-op", () => {
  const html = renderStaticPage({
    theme: makeTheme(),
    pageId: "index",
    menus: { "menu-does-not-exist": items({ label: "Ghost", href: "/ghost" }) },
  });
  assert.ok(!html?.includes("Ghost"));
  assert.ok(html?.includes('data-nav-id="pricing"'));
});

test("renderStaticPage: menu link labels and hrefs are HTML-escaped", () => {
  const html = renderStaticPage({
    theme: makeTheme(),
    pageId: "index",
    menus: { [HEADER_ID]: items({ label: "<script>alert(1)</script>", href: '/x"y' }) },
  });
  assert.ok(!html?.includes("<script>alert(1)</script>"));
  assert.ok(html?.includes("&lt;script&gt;"));
  assert.ok(html?.includes("/x&quot;y"));
});

test("scanMenuEmbedIds: collects every referenced menu id across pages and partials, deduped", () => {
  const theme = makeTheme();
  theme.pages["about"] = `<div>${theme.partials.nav}</div>`; // same header id repeated in a page
  assert.deepEqual(new Set(scanMenuEmbedIds(theme)), new Set([HEADER_ID, FOOTER_ID]));
});

test("scanMenuEmbedIds: a theme with no menu markers returns an empty array", () => {
  const theme = makeTheme();
  theme.partials = {};
  assert.deepEqual(scanMenuEmbedIds(theme), []);
});
