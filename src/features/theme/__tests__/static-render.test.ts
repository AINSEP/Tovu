import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { renderStaticPage, scanMenuEmbedIds, type StaticMenuItem } from "../static-render";
import { loadTheme, type DiscoveredTheme } from "../theme";

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
      // Marker sits on an inner wrapper, NOT on the same element as the `<h4>` heading — the
      // heading is a sibling outside the marker so `injectMenuEmbed`'s wholesale content replace
      // can never delete it (regression, 2026-08-10: 5 of 6 static themes shipped the heading
      // *inside* the marker div, so binding a footer menu silently deleted the heading; see the
      // "heading survives a resolved footer menu" test below).
      footer: `<footer><div class="footer-col"><h4>Legal</h4><div data-embed-type="menu" data-embed-id="${FOOTER_ID}"><a href="#">Privacy</a><a href="#">Terms</a></div></div></footer>`,
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
  assert.ok(!html?.includes('<a href="#">Privacy</a>'), "original hardcoded footer link should be replaced, not duplicated");
  assert.ok(
    html?.includes("<h4>Legal</h4>"),
    "the footer heading lives outside the menu marker, so a resolved footer menu must not delete it",
  );
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

test("renderStaticPage: tailark-quartz-libre's mobile Sign in/Get started survive a bound header menu", () => {
  // Regression, 2026-08-10: the real theme's nav.html originally put the `.nav-auth-link` mobile
  // Sign in/Get started actions INSIDE the `data-embed-type="menu"` marker `<nav>`, alongside the
  // real nav links — so a bound header menu wiped them out along with the placeholder links, exactly
  // like the footer heading bug above. Fix: they're now siblings of a `main-nav-links` wrapper that
  // alone carries the marker, kept visually identical via `.main-nav-links { display: contents }`.
  const theme = loadTheme({
    themeDir: path.join(process.cwd(), "src/themes/static/tailark-quartz-libre"),
    id: "tailark-quartz-libre",
    source: "built-in",
  });
  assert.equal(theme.status, "valid");

  const withoutMenu = renderStaticPage({ theme, pageId: "index" });
  assert.ok(withoutMenu?.includes(">Sign in<"));
  assert.ok(withoutMenu?.includes(">Get started<"));

  const withMenu = renderStaticPage({
    theme,
    pageId: "index",
    menus: {
      "menu-header-nav": items({ label: "Features", href: "/features" }, { label: "Docs", href: "/docs" }),
    },
  });
  assert.ok(withMenu?.includes('<a href="/features">Features</a>'));
  assert.ok(withMenu?.includes('<a href="/docs">Docs</a>'));
  assert.ok(withMenu?.includes(">Sign in<"), "mobile Sign in action must survive a bound header menu");
  assert.ok(withMenu?.includes(">Get started<"), "mobile Get started action must survive a bound header menu");
});

/**
 * Tree-variant menu rendering (docs sidebar, 2026-08-10). The back-compat floor is the point of the
 * first test here: every static theme's nav CSS targets direct `<a>` children of a flex container,
 * so the tree is opt-in per marker and the default output stays byte-identical.
 */

const TREE_MARKER = `<nav data-embed-type="menu" data-embed-id="${HEADER_ID}" data-embed-variant="tree"></nav>`;

function treeTheme(): DiscoveredTheme {
  const theme = makeTheme();
  theme.partials = {};
  theme.pages["index"] = `<html><body>${TREE_MARKER}</body></html>`;
  return theme;
}

test("renderMenuTree: a marker WITHOUT the tree variant still gets flat <a> output, byte-identical", () => {
  const theme = makeTheme();
  theme.partials = { nav: `<nav data-embed-type="menu" data-embed-id="${HEADER_ID}"></nav>` };
  const html = renderStaticPage({
    theme,
    pageId: "index",
    menus: { [HEADER_ID]: items({ label: "Docs", href: "/docs" }) },
  });
  assert.ok(html?.includes('<a href="/docs">Docs</a>'));
  assert.ok(!html?.includes("<ul"), "no list wrapper — .main-nav's flex layout depends on bare anchors");
});

test("renderMenuTree: the tree variant emits nested <ul>/<li> with depth classes", () => {
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

test("renderMenuTree: isCurrent and isActive become distinct class hooks", () => {
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

test("renderMenuTree: an unavailable BRANCH stays as inert text so its children survive", () => {
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

test("renderMenuTree: an unavailable LEAF is omitted entirely, never a dead link", () => {
  const html = renderStaticPage({
    theme: treeTheme(),
    pageId: "index",
    menus: {
      [HEADER_ID]: items(
        { label: "Gone", href: null, available: false },
        { label: "Fine", href: "#fine" }
      ),
    },
  });
  assert.ok(!html?.includes("Gone"));
  assert.ok(html?.includes('<a href="#fine">Fine</a>'));
});

test("renderMenuTree: authored cssClass, description and icon reach the markup", () => {
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

test("renderMenuTree: a tree that renders to nothing leaves the marker's authored fallback alone", () => {
  const theme = treeTheme();
  theme.pages["index"] =
    `<html><body><nav data-embed-type="menu" data-embed-id="${HEADER_ID}" data-embed-variant="tree">FALLBACK</nav></body></html>`;
  const html = renderStaticPage({
    theme,
    pageId: "index",
    menus: { [HEADER_ID]: items({ label: "Gone", href: null, available: false }) },
  });
  assert.ok(html?.includes("FALLBACK"), "an empty render must never blank the marker");
});

test("the real `basic` theme ships blog-sidebar-template.html and declares it as a post template", () => {
  const theme = loadTheme({
    themeDir: path.join(process.cwd(), "src/themes/static/basic"),
    id: "basic",
    source: "built-in",
  });
  assert.equal(theme.status, "valid");
  assert.ok(theme.manifest.postTemplate?.includes("blog-sidebar-template.html"));
  assert.ok(theme.pages["blog-sidebar-template"] !== undefined, "the template must be discovered off disk");
  assert.ok(
    theme.pages["blog-sidebar-template"].includes('data-embed-variant="tree"'),
    "the docs sidebar marker must opt into tree rendering"
  );
});

/**
 * `theme.json`'s `modes`/`defaultMode`/`slots` were authored by every static theme on disk but read
 * by nothing until 2026-08-10 — `resolveSlots` hardcoded the nav/footer pair, and no code ever set
 * the `data-theme` attribute the light-token block keys off, so `tokens.light.json` was unreachable.
 * These certify the wiring AND its back-compat floor: a theme declaring none of the three renders
 * exactly as it did before (the `makeTheme()` fixture below declares no `slots` and no `defaultMode`,
 * and every test above it still passes unchanged).
 */

test("resolveSlots: a theme declaring no slots still resolves nav/footer under the legacy default pair", () => {
  const html = renderStaticPage({ theme: makeTheme(), pageId: "index" });
  assert.ok(html?.includes('class="main-nav"'), "nav partial must still resolve with no manifest slots");
  assert.ok(html?.includes("<h4>Legal</h4>"), "footer partial must still resolve with no manifest slots");
  assert.ok(!html?.includes('data-tovu-slot="nav"'), "the marker itself must be consumed, not left in the page");
});

test("resolveSlots: activeAttr marks the matching data-nav-id anchor aria-current", () => {
  const theme = makeTheme();
  theme.pages["index"] = '<html><body><div data-tovu-slot="nav" data-nav-current="pricing"></div></body></html>';
  const html = renderStaticPage({ theme, pageId: "index" });
  assert.ok(html?.includes('data-nav-id="pricing" aria-current="page"'));
});

test("resolveSlots: a marker with no activeAttr value still resolves (it used to be left as a literal div)", () => {
  const theme = makeTheme();
  theme.pages["index"] = '<html><body><div data-tovu-slot="nav"></div></body></html>';
  const html = renderStaticPage({ theme, pageId: "index" });
  assert.ok(html?.includes('class="main-nav"'));
  assert.ok(!html?.includes("data-tovu-slot"));
  assert.ok(!html?.includes('aria-current="page"'), "no current page declared, so nothing is marked current");
});

test("resolveSlots: manifest slots drive arbitrary keys, not just the hardcoded nav/footer", () => {
  const theme = makeTheme();
  theme.manifest = { ...theme.manifest, slots: { sidebar: { source: "sidebar.html" } } };
  theme.partials = { sidebar: "<aside>docs sidebar</aside>" };
  theme.pages["index"] = '<html><body><div data-tovu-slot="sidebar"></div></body></html>';
  const html = renderStaticPage({ theme, pageId: "index" });
  assert.ok(html?.includes("<aside>docs sidebar</aside>"));
});

test("resolveSlots: an explicit variants map wins, and an undeclared variant falls back to the filename convention", () => {
  const theme = makeTheme();
  theme.manifest = {
    ...theme.manifest,
    slots: { footer: { source: "footer.html", variants: { minimal: "footer-tiny.html" } } },
  };
  theme.partials = { "footer-tiny": "<footer>tiny</footer>", "footer-bare": "<footer>bare</footer>" };
  theme.pages["index"] = [
    '<html><body><div data-tovu-slot="footer" data-slot-variant="minimal"></div>',
    '<div data-tovu-slot="footer" data-slot-variant="bare"></div></body></html>',
  ].join("");
  const html = renderStaticPage({ theme, pageId: "index" });
  assert.ok(html?.includes("<footer>tiny</footer>"), "declared variant resolves through the map");
  assert.ok(html?.includes("<footer>bare</footer>"), "undeclared variant falls back to footer-<variant>.html");
});

test("renderStaticPage: defaultMode is stamped onto <html> as data-theme, making the light token block reachable", () => {
  const theme = makeTheme();
  theme.manifest = { ...theme.manifest, modes: ["dark", "light"], defaultMode: "light" };
  theme.tokensLight = { "--bg": "#fff" };
  const html = renderStaticPage({ theme, pageId: "index" });
  assert.ok(html?.includes('<html data-theme="light">'));
  assert.ok(html?.includes(':root[data-theme="light"]'), "the override block the attribute now selects");
});

test("renderStaticPage: a theme declaring no defaultMode emits no data-theme at all (pre-wiring behavior)", () => {
  const html = renderStaticPage({ theme: makeTheme(), pageId: "index" });
  // Asserted against the `<html>` tag specifically: `data-theme` also appears in the emitted
  // `:root[data-theme="light"]` CSS block, which `tokensToRootCss` writes unconditionally.
  assert.ok(/<html[^>]*>/.test(html ?? ""), "sanity: the fixture has an <html> tag to check");
  assert.ok(
    !/<html[^>]*\sdata-theme=/.test(html ?? ""),
    "no attribute on <html>, so the base :root block wins exactly as before"
  );
});

test("renderStaticPage: an <html> that already carries data-theme is left alone", () => {
  const theme = makeTheme();
  theme.manifest = { ...theme.manifest, modes: ["dark", "light"], defaultMode: "dark" };
  theme.pages["index"] = '<html lang="en" data-theme="light"><body></body></html>';
  const html = renderStaticPage({ theme, pageId: "index" });
  assert.ok(html?.includes('data-theme="light"'));
  assert.ok(!html?.includes('data-theme="dark"'));
});

test("renderStaticPage: the real `basic` theme gets its declared dark default and its minimal-footer variant", () => {
  const theme = loadTheme({
    themeDir: path.join(process.cwd(), "src/themes/static/basic"),
    id: "basic",
    source: "built-in",
  });
  assert.equal(theme.status, "valid");
  assert.deepEqual(theme.manifest.modes, ["dark", "light"]);
  assert.equal(theme.manifest.defaultMode, "dark");

  // `dark` is the base `:root` block, so stamping it changes nothing visually — it only gives the
  // theme's own toggle an attribute to flip. This is why wiring `defaultMode` was safe to land.
  const home = renderStaticPage({ theme, pageId: "index" });
  assert.ok(home?.includes('data-theme="dark"'));
  assert.ok(home?.includes('class="main-nav'), "nav slot still resolves through the manifest");

  // signin.html is the one page on disk using `data-slot-variant="minimal"`, and `basic` is the one
  // theme declaring an explicit `variants` map for it.
  const signin = renderStaticPage({ theme, pageId: "signin" });
  assert.ok(signin !== null);
  assert.ok(!signin?.includes('data-tovu-slot="footer"'), "the minimal-footer marker must be consumed");
});
