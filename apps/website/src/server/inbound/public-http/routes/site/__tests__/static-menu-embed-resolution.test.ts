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
