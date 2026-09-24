import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import type { PostRecord } from "#src/features/post/index";
import { InMemoryPostRepo } from "#src/features/post/index";
import type { DiscoveredTheme } from "#src/features/theme/index";
import { InMemoryMenuRepo, NAV_DOC_TYPE } from "#src/features/navigation/index";
import type { NavMenuEntry } from "#src/features/navigation/index";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";

/**
 * @file Coverage for `resolveStaticMenusForRender`'s real menu-resolution branch (`pages.ts`) — the
 * direct menu-embed wiring that `data-embed-type="menu"` markers in a static theme's own pages/
 * partials resolve through. Every OTHER test that boots a static-tier theme in this repo uses a
 * fixture with zero menu markers, so `scanMenuEmbedIds` always returns an empty array and the
 * `Promise.all(menuIds.map(...))` resolution path — including `navTargetToRouteTarget` and its
 * `resolveTargetHref` closure — has never actually run anywhere in the suite. This file is the one
 * place that authors a real marker and a real seeded menu, exercising all four `NavTarget` kinds
 * `navTargetToRouteTarget` maps (`entryRef`, `termRef`, `url`, `route`) in one request, so both the
 * resolved (`available: true`) and unresolved (`null`) arms of `resolveTargetHref`'s own ternary run
 * too — `termRef` is a permanent stub (`resolveTermRefTarget` always returns `null`,
 * `routing/routing.ts`) and an unregistered route name resolves to `null` the same way, while `url`
 * and a real published `entryRef` both resolve successfully.
 */

const WORKSPACE_ID = "workspace-local";
const MENU_SLUG = "primary-nav";

function themeWithMenuMarker(pageId: string): DiscoveredTheme {
  const menuMarker = `<div data-embed-config='{"type":"menu","id":"${MENU_SLUG}"}'></div>`;
  return {
    manifest: {
      id: "static-menu-test-theme",
      name: "Static Menu Test Theme",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      templates: [],
      // Theme pages are OFF by default (2026-08-30 owner decision): a manifest with no
      // `publishedPages` publishes nothing. These tests are about menu-marker resolution, not the
      // publish default, so the page under test opts in explicitly.
      publishedPages: [pageId],
    },
    dir: "/nonexistent/menu-test-theme",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: {
      index: "<html><body><main>home</main></body></html>",
      [pageId]: `<html><body>${menuMarker}<main>${pageId}</main></body></html>`,
    },
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

function publishedPost(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-linked-from-menu",
    workspaceId: WORKSPACE_ID,
    title: "Linked post",
    slug: "linked-post",
    bodyJson: { type: "doc", content: [] },
    bodyFormat: "doc",
    bodyHtml: null,
    status: "published",
    kind: "post",
    updatedAt: "2026-08-17T00:00:00.000Z",
    version: 1,
    ...overrides,
  } as PostRecord;
}

function menuEntry(): NavMenuEntry {
  return {
    id: "menu-primary-nav-id",
    workspaceId: WORKSPACE_ID,
    slug: MENU_SLUG,
    title: "Primary Nav",
    status: "published",
    doc: {
      type: NAV_DOC_TYPE,
      version: 1,
      items: [
        { id: "item-entry", label: "Linked post", target: { kind: "entryRef", entryId: "post-linked-from-menu" } },
        { id: "item-term", label: "Category", target: { kind: "termRef", termId: "term-1", taxonomy: "category" } },
        { id: "item-url", label: "External", target: { kind: "url", href: "https://example.com/docs" } },
        { id: "item-route", label: "Unregistered route", target: { kind: "route", route: "not-a-real-route" } },
      ],
    },
    locations: [],
    updatedAt: "2026-08-17T00:00:00.000Z",
    version: 1,
  } as unknown as NavMenuEntry;
}

async function startServer(theme: DiscoveredTheme) {
  const deps = {
    ...createRouteDeps(),
    themes: [theme],
    postRepo: new InMemoryPostRepo([publishedPost()]),
    menuRepo: new InMemoryMenuRepo([menuEntry()]),
  };
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

function closeServer(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve) => server.close(() => resolve()));
}

test("GET /about: a static theme's own menu marker resolves through a real seeded menu, exercising every NavTarget kind", async (t) => {
  const { server, baseUrl } = await startServer(themeWithMenuMarker("about"));
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/about`);
  assert.equal(res.status, 200, "the marketing page must still render even though it now carries a real menu marker");
  const html = await res.text();
  assert.ok(html.includes("about"), "the theme page's own body content must still be present");
});

test("GET /: the home route's own resolveStaticMenusForRender call also resolves a real menu marker on theme.pages.index", async (t) => {
  const theme = themeWithMenuMarker("about");
  // Put the marker on the home page itself too, so the SAME resolution runs through the `/`
  // handler's own (separate) `resolveStaticMenusForRender` call, not just `/:slug`'s.
  const menuMarker = `<div data-embed-config='{"type":"menu","id":"${MENU_SLUG}"}'></div>`;
  (theme.pages as Record<string, string>).index = `<html><body>${menuMarker}<main>home</main></body></html>`;

  const { server, baseUrl } = await startServer(theme);
  t.after(() => closeServer(server));

  const res = await fetch(baseUrl);
  assert.equal(res.status, 200, "home must render successfully with a real menu marker resolved");
});

test("GET /about: a marker naming the menu's raw id (not its slug) falls back to findById — a theme marker predating the 2026-08-10 slug convention", async (t) => {
  const rawIdMarker = `<div data-embed-config='{"type":"menu","id":"menu-primary-nav-id"}'></div>`;
  const theme: DiscoveredTheme = {
    ...themeWithMenuMarker("about"),
    pages: {
      index: "<html><body><main>home</main></body></html>",
      about: `<html><body>${rawIdMarker}<main>about</main></body></html>`,
    },
  } as DiscoveredTheme;

  const { server, baseUrl } = await startServer(theme);
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/about`);
  assert.equal(res.status, 200, "a marker naming the menu's raw id must still resolve via the findById fallback");
});

test("GET /about: a marker naming a menu id that matches nothing (bad slug AND bad id) degrades to no entry, not a crash", async (t) => {
  const unknownMarker = `<div data-embed-config='{"type":"menu","id":"no-such-menu-anywhere"}'></div>`;
  const theme: DiscoveredTheme = {
    ...themeWithMenuMarker("about"),
    pages: {
      index: "<html><body><main>home</main></body></html>",
      about: `<html><body>${unknownMarker}<main>about</main></body></html>`,
    },
  } as DiscoveredTheme;

  const { server, baseUrl } = await startServer(theme);
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/about`);
  assert.equal(res.status, 200, "an unresolvable menu marker must degrade to the theme's own authored fallback, not 500");
});

/**
 * Coverage for the `CURRENT_PAGE_DOCS_SIDEBAR_MENU_ID` sentinel branch added to
 * `resolveStaticMenusForRender` (2026-08-31 docs-nav restructure) — one shared marker id in
 * `blog-sidebar-template.html` that must resolve to a DIFFERENT stored menu per page, at the
 * `docs-<slug>-sidebar` convention slug, rather than the one-fixed-menu behavior every other marker
 * id above exercises. The adversarial case that would catch this resolving to the SAME menu
 * regardless of page (a copy-paste of the literal id into `menuId` instead of deriving per
 * `currentPath`) is two pages that both carry the sentinel marker and each have their own distinctly
 * labeled menu at the convention slug — this suite fetches both and asserts each response carries
 * ONLY its own page's menu item label, never the other page's.
 */
const DOCS_SIDEBAR_SENTINEL_ID = "docs-current-page-sidebar";

function themeWithSentinelSidebarPages(): DiscoveredTheme {
  const sentinelMarker = `<div data-embed-config='{"type":"menu","id":"${DOCS_SIDEBAR_SENTINEL_ID}"}'></div>`;
  return {
    manifest: {
      id: "static-sentinel-sidebar-test-theme",
      name: "Static Sentinel Sidebar Test Theme",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      templates: [],
      publishedPages: ["doc-a", "doc-b"],
    },
    dir: "/nonexistent/sentinel-sidebar-test-theme",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: {
      index: "<html><body><main>home</main></body></html>",
      "doc-a": `<html><body>${sentinelMarker}<main>doc-a</main></body></html>`,
      "doc-b": `<html><body>${sentinelMarker}<main>doc-b</main></body></html>`,
    },
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

function sidebarMenuEntry(slug: string, itemLabel: string): NavMenuEntry {
  return {
    id: `menu-${slug}-id`,
    workspaceId: WORKSPACE_ID,
    slug,
    title: slug,
    status: "published",
    doc: {
      type: NAV_DOC_TYPE,
      version: 1,
      items: [{ id: `item-${slug}`, label: itemLabel, target: { kind: "url", href: "#section" } }],
    },
    locations: [],
    updatedAt: "2026-08-31T00:00:00.000Z",
    version: 1,
  } as unknown as NavMenuEntry;
}

test("GET /doc-a and /doc-b: the reserved docs-sidebar sentinel resolves to a DIFFERENT menu per page, never the other page's", async (t) => {
  const theme = themeWithSentinelSidebarPages();
  const deps = {
    ...createRouteDeps(),
    themes: [theme],
    postRepo: new InMemoryPostRepo([]),
    menuRepo: new InMemoryMenuRepo([
      sidebarMenuEntry("docs-doc-a-sidebar", "Menu A Item"),
      sidebarMenuEntry("docs-doc-b-sidebar", "Menu B Item"),
    ]),
  };
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(() => closeServer(server));

  const resA = await fetch(`${baseUrl}/doc-a`);
  assert.equal(resA.status, 200);
  const htmlA = await resA.text();
  assert.ok(htmlA.includes("Menu A Item"), "doc-a must resolve its own sidebar menu (docs-doc-a-sidebar)");
  assert.ok(!htmlA.includes("Menu B Item"), "doc-a must NOT resolve doc-b's sidebar menu");

  const resB = await fetch(`${baseUrl}/doc-b`);
  assert.equal(resB.status, 200);
  const htmlB = await resB.text();
  assert.ok(htmlB.includes("Menu B Item"), "doc-b must resolve its own sidebar menu (docs-doc-b-sidebar)");
  assert.ok(!htmlB.includes("Menu A Item"), "doc-b must NOT resolve doc-a's sidebar menu");
});

test("GET /doc-a: the docs-sidebar sentinel degrades to the theme's authored fallback when no menu exists at the convention slug", async (t) => {
  const theme = themeWithSentinelSidebarPages();
  const deps = {
    ...createRouteDeps(),
    themes: [theme],
    postRepo: new InMemoryPostRepo([]),
    // No `docs-doc-a-sidebar` menu seeded at all — same "not authored yet" case a brand-new doc page
    // is in before anyone creates its sidebar menu.
    menuRepo: new InMemoryMenuRepo([]),
  };
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/doc-a`);
  assert.equal(res.status, 200, "an unauthored per-page sidebar menu must degrade to the fallback, not 500");
});

/**
 * Coverage for the `docs-section` reserved marker id (2026-09-24 docs IA restructure) —
 * `resolveStaticMenusForRender`'s second reserved id, distinct from the `docs-current-page-sidebar`
 * sentinel above. It resolves to the Docs subtree of `menu-header-nav` (the item whose resolved href
 * is `/docs`), never a stored menu of its own, and the returned items must carry real `isCurrent`/
 * `isActive` state per the request's own `currentPath` — the same tree data feeding the top-nav
 * flyout and mobile drawer, not a second authored copy.
 */
const DOCS_SECTION_SENTINEL_ID = "docs-section";

/** The rendered `<a ...>Label</a>` tag for one menu item label, so a test can assert on its own
 *  attributes (`aria-current`) without a brittle fixed-width slice around the label's text index. */
function anchorTagFor(html: string, label: string): string {
  const labelIndex = html.indexOf(`>${label}<`);
  assert.ok(labelIndex !== -1, `expected to find a rendered menu item labeled "${label}"`);
  const tagStart = html.lastIndexOf("<a ", labelIndex);
  assert.ok(tagStart !== -1, `expected an <a> tag preceding "${label}"`);
  return html.slice(tagStart, labelIndex + label.length + 1);
}

/** The rendered `<li class="...">` opening tag enclosing one menu item label — where
 *  `menuItemClasses` puts structural hooks (`is-current`/`is-active`/an authored `cssClass` like
 *  `docs-pager-prev`), as opposed to {@link anchorTagFor}'s `<a>`-only slice, which never carries them. */
function liTagFor(html: string, label: string): string {
  const labelIndex = html.indexOf(`>${label}<`);
  assert.ok(labelIndex !== -1, `expected to find a rendered menu item labeled "${label}"`);
  const tagStart = html.lastIndexOf("<li ", labelIndex);
  assert.ok(tagStart !== -1, `expected an <li> tag preceding "${label}"`);
  const tagEnd = html.indexOf(">", tagStart);
  return html.slice(tagStart, tagEnd + 1);
}

function headerNavMenuWithDocsSubtree(): NavMenuEntry {
  return {
    id: "menu-header-nav-id",
    workspaceId: WORKSPACE_ID,
    slug: "menu-header-nav",
    title: "Header Nav",
    status: "published",
    doc: {
      type: NAV_DOC_TYPE,
      version: 1,
      items: [
        { id: "item-pricing", label: "Pricing", target: { kind: "url", href: "/pricing" } },
        {
          id: "item-docs",
          label: "Docs",
          target: { kind: "url", href: "/docs" },
          children: [
            {
              id: "group-get-started",
              label: "Get started",
              target: { kind: "url", href: "/docs#get-started" },
              children: [
                { id: "page-quickstart", label: "Quickstart", target: { kind: "url", href: "/quickstart" } },
                { id: "page-install", label: "Install", target: { kind: "url", href: "/install" } },
              ],
            },
            {
              id: "group-build",
              label: "Build your site",
              target: { kind: "url", href: "/docs#build" },
              children: [{ id: "page-pages", label: "Pages", target: { kind: "url", href: "/pages" } }],
            },
          ],
        },
        { id: "item-blog", label: "Blog", target: { kind: "url", href: "/blog" } },
      ],
    },
    locations: [],
    updatedAt: "2026-09-24T00:00:00.000Z",
    version: 1,
  } as unknown as NavMenuEntry;
}

function themeWithDocsSectionPages(): DiscoveredTheme {
  const sectionMarker = `<div data-embed-config='{"type":"menu","id":"${DOCS_SECTION_SENTINEL_ID}","variant":"tree"}'></div>`;
  return {
    manifest: {
      id: "static-docs-section-test-theme",
      name: "Static Docs Section Test Theme",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      templates: [],
      publishedPages: ["quickstart", "install"],
    },
    dir: "/nonexistent/docs-section-test-theme",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: {
      index: "<html><body><main>home</main></body></html>",
      quickstart: `<html><body>${sectionMarker}<main>quickstart</main></body></html>`,
      install: `<html><body>${sectionMarker}<main>install</main></body></html>`,
    },
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

test("GET /quickstart: docs-section resolves to the header nav's Docs subtree only, with the current page and its group marked", async (t) => {
  const theme = themeWithDocsSectionPages();
  const deps = {
    ...createRouteDeps(),
    themes: [theme],
    postRepo: new InMemoryPostRepo([]),
    menuRepo: new InMemoryMenuRepo([headerNavMenuWithDocsSubtree()]),
  };
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/quickstart`);
  assert.equal(res.status, 200);
  const html = await res.text();

  assert.ok(html.includes("Get started"), "the current page's own group must be present");
  assert.ok(html.includes("Build your site"), "sibling groups must also render (full tree, not just the active branch)");
  assert.ok(!html.includes(">Docs<"), "the Docs item itself must NOT render — only its children (the groups)");
  assert.ok(!html.includes(">Pricing<") && !html.includes(">Blog<"), "sibling top-level header items must NOT leak into the docs sidebar");

  assert.ok(anchorTagFor(html, "Quickstart").includes('aria-current="page"'), "the current page's own link must carry aria-current");
  assert.ok(!anchorTagFor(html, "Install").includes('aria-current="page"'), "the sibling page must NOT be marked current");
});

test("GET /install: docs-section marks Install (not Quickstart) as current on that page", async (t) => {
  const theme = themeWithDocsSectionPages();
  const deps = {
    ...createRouteDeps(),
    themes: [theme],
    postRepo: new InMemoryPostRepo([]),
    menuRepo: new InMemoryMenuRepo([headerNavMenuWithDocsSubtree()]),
  };
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/install`);
  assert.equal(res.status, 200);
  const html = await res.text();

  assert.ok(anchorTagFor(html, "Install").includes('aria-current="page"'), "Install must be marked current on its own page");
  assert.ok(!anchorTagFor(html, "Quickstart").includes('aria-current="page"'), "Quickstart must NOT be marked current on /install");
});

test("GET /quickstart: docs-section resolves when the header nav menu's slug is NOT the literal 'menu-header-nav' — real seed data's slug is 'header-nav', only its id is 'menu-header-nav'", async (t) => {
  // Regression (2026-09-24, live-data bug found rendering /quickstart against sites/tovu-com's
  // actual seeded menus table): the fixture every other docs-section test in this file uses
  // (`headerNavMenuWithDocsSubtree`) gives the header nav menu `slug: "menu-header-nav"`, which
  // happens to equal `HEADER_NAV_MENU_SLUG` — so a `findBySlug`-only lookup passed every prior
  // test while still being broken against the real row, whose `slug` column is `"header-nav"` (no
  // `menu-` prefix) and whose `id` column is the one that equals `"menu-header-nav"`. This fixture
  // mirrors the real row shape; `resolveDocsSectionItem` must fall back to `findById` exactly like
  // the generic per-marker-id branch already does (see the `findById` fallback test above), or the
  // sidebar/pager silently degrade to their authored fallback on every real install.
  const theme = themeWithDocsSectionPages();
  const headerNavWithMismatchedSlug: NavMenuEntry = {
    ...headerNavMenuWithDocsSubtree(),
    id: "menu-header-nav",
    slug: "header-nav",
  };
  const deps = {
    ...createRouteDeps(),
    themes: [theme],
    postRepo: new InMemoryPostRepo([]),
    menuRepo: new InMemoryMenuRepo([headerNavWithMismatchedSlug]),
  };
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/quickstart`);
  assert.equal(res.status, 200);
  const html = await res.text();

  assert.ok(
    html.includes("Get started") && html.includes("Build your site"),
    "docs-section must still resolve the Docs subtree via the findById fallback when the slug doesn't match"
  );
});

test("GET /quickstart: docs-section degrades to the theme's authored fallback when menu-header-nav has no item linking to /docs", async (t) => {
  const theme = themeWithDocsSectionPages();
  const headerNavWithoutDocs: NavMenuEntry = {
    ...headerNavMenuWithDocsSubtree(),
    doc: {
      type: NAV_DOC_TYPE,
      version: 1,
      items: [{ id: "item-pricing", label: "Pricing", target: { kind: "url", href: "/pricing" } }],
    },
  };
  const deps = {
    ...createRouteDeps(),
    themes: [theme],
    postRepo: new InMemoryPostRepo([]),
    menuRepo: new InMemoryMenuRepo([headerNavWithoutDocs]),
  };
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/quickstart`);
  assert.equal(res.status, 200, "no /docs item on the header nav must degrade to the fallback, not 500");
});

test("GET /quickstart: docs-section degrades to the theme's authored fallback when menu-header-nav does not exist at all", async (t) => {
  const theme = themeWithDocsSectionPages();
  const deps = {
    ...createRouteDeps(),
    themes: [theme],
    postRepo: new InMemoryPostRepo([]),
    menuRepo: new InMemoryMenuRepo([]),
  };
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/quickstart`);
  assert.equal(res.status, 200, "a missing menu-header-nav must degrade to the fallback, not 500");
});

/**
 * Coverage for the `docs-prev-next` reserved marker id (2026-09-24 docs IA restructure) —
 * Previous/Next pager links flattened across the Docs subtree's group boundaries, from the SAME
 * `menu-header-nav` data `docs-section` reads, not a second lookup mechanism.
 */
const DOCS_PREV_NEXT_SENTINEL_ID = "docs-prev-next";

function themeWithDocsPagerPages(): DiscoveredTheme {
  const pagerMarker = `<div data-embed-config='{"type":"menu","id":"${DOCS_PREV_NEXT_SENTINEL_ID}","variant":"tree"}'></div>`;
  return {
    manifest: {
      id: "static-docs-pager-test-theme",
      name: "Static Docs Pager Test Theme",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      templates: [],
      publishedPages: ["quickstart", "install", "not-a-doc-page"],
    },
    dir: "/nonexistent/docs-pager-test-theme",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: {
      index: "<html><body><main>home</main></body></html>",
      quickstart: `<html><body>${pagerMarker}<main>quickstart</main></body></html>`,
      install: `<html><body>${pagerMarker}<main>install</main></body></html>`,
      // Carries the marker but is not itself a page in the Docs subtree — the "current page not
      // found in the flattened list" degrade case.
      "not-a-doc-page": `<html><body>${pagerMarker}<main>not-a-doc-page</main></body></html>`,
    },
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

test("GET /quickstart: docs-prev-next has no Previous (first page in the subtree) and Next is Install", async (t) => {
  const theme = themeWithDocsPagerPages();
  const deps = {
    ...createRouteDeps(),
    themes: [theme],
    postRepo: new InMemoryPostRepo([]),
    menuRepo: new InMemoryMenuRepo([headerNavMenuWithDocsSubtree()]),
  };
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/quickstart`);
  assert.equal(res.status, 200);
  const html = await res.text();

  assert.ok(html.includes("docs-pager-next"), "Next must be present");
  assert.ok(html.includes(">Install<"), "Next must be Install");
  assert.ok(!html.includes("docs-pager-prev"), "Quickstart is the first page in the subtree — no Previous");
});

test("GET /install: docs-prev-next crosses the group boundary — Previous is Quickstart (same group), Next is Pages (next group)", async (t) => {
  const theme = themeWithDocsPagerPages();
  const deps = {
    ...createRouteDeps(),
    themes: [theme],
    postRepo: new InMemoryPostRepo([]),
    menuRepo: new InMemoryMenuRepo([headerNavMenuWithDocsSubtree()]),
  };
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/install`);
  assert.equal(res.status, 200);
  const html = await res.text();

  assert.ok(liTagFor(html, "Quickstart").includes("docs-pager-prev"), "Previous must be Quickstart");
  assert.ok(liTagFor(html, "Pages").includes("docs-pager-next"), "Next must cross into the next group (Pages, in Build your site)");
});

test("GET /not-a-doc-page: docs-prev-next degrades to the theme's authored fallback when the current page is not itself in the Docs subtree", async (t) => {
  const theme = themeWithDocsPagerPages();
  const deps = {
    ...createRouteDeps(),
    themes: [theme],
    postRepo: new InMemoryPostRepo([]),
    menuRepo: new InMemoryMenuRepo([headerNavMenuWithDocsSubtree()]),
  };
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/not-a-doc-page`);
  assert.equal(res.status, 200, "a page outside the Docs subtree must degrade to the fallback, not 500");
});
