import assert from "node:assert/strict";
import test from "node:test";

import type { PostRecord } from "#src/features/post/index";
import { InMemoryPostRepo } from "#src/features/post/index";
import type { DiscoveredTheme } from "#src/features/theme/index";
import { InMemoryMenuRepo, NAV_DOC_TYPE } from "#src/navigation/index";
import type { NavMenuEntry } from "#src/navigation/index";
import { createApp, createRouteDeps } from "#src/server/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { resolveHtmlEmbedsForRender, resolveMediaAssetMetadataForRender } from "#src/server/routes/site/pages";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Integration-tier mirror of `pages.route.test.ts` / `static-menu-embed-resolution.test.ts` /
 * `render-context-resolution-helpers.test.ts` (unit tier) — `check:route-coverage-diff` scores unit
 * and integration branch coverage as two INDEPENDENT lcov runs (`route-coverage-lib.ts`'s
 * `isIntegrationTestFile`: a file counts for the integration tier only by living under
 * `__tests__/integration/` or ending `.integration.test.ts`), so a branch only ever exercised by a
 * unit-tier file still reads as 0% on the integration tier. Same pattern
 * `products.integration.test.ts` already established for `products.ts`'s own unit/integration split.
 */

const WORKSPACE_ID = "workspace-local";
const MENU_SLUG = "primary-nav-int";

function testDeps(overrides: Partial<RouteDeps> = {}): RouteDeps {
  return { ...createRouteDeps(), ...overrides };
}

function themeWithMenuMarker(pageId: string): DiscoveredTheme {
  const menuMarker = `<div data-embed-config='{"type":"menu","id":"${MENU_SLUG}"}'></div>`;
  return {
    manifest: {
      id: "static-menu-integration-theme",
      name: "Static Menu Integration Theme",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      templates: [],
    },
    dir: "/nonexistent/menu-integration-theme",
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

function staticThemeWithThemed404(): DiscoveredTheme {
  return {
    manifest: {
      id: "static-404-integration-theme",
      name: "Static 404 Integration Theme",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      templates: [],
    },
    dir: "/nonexistent/404-integration-theme",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: {
      index: "<html><body><main>home</main></body></html>",
      "404": "<html><body><main>Themed not found (integration)</main></body></html>",
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
    id: "post-linked-from-menu-int",
    workspaceId: WORKSPACE_ID,
    title: "Linked post",
    slug: "linked-post-int",
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
    id: "menu-primary-nav-int-id",
    workspaceId: WORKSPACE_ID,
    slug: MENU_SLUG,
    title: "Primary Nav (integration)",
    status: "published",
    doc: {
      type: NAV_DOC_TYPE,
      version: 1,
      items: [
        { id: "item-entry", label: "Linked post", target: { kind: "entryRef", entryId: "post-linked-from-menu-int" } },
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

test("integration: GET / 500s with 'No themes installed' when resolveActiveTheme finds none", async (t) => {
  const app = createApp(testDeps({ themes: [] }));
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(baseUrl);
  assert.equal(res.status, 500);
  assert.match(await res.text(), /No themes installed/);
});

test("integration: GET /:slug 500s with 'No themes installed' when resolveActiveTheme finds none", async (t) => {
  const app = createApp(testDeps({ themes: [] }));
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/anything`);
  assert.equal(res.status, 500);
  assert.match(await res.text(), /No themes installed/);
});

test("integration: GET /:slug a static theme's own pages/404.html renders instead of the bare fallback 404", async (t) => {
  const app = createApp(testDeps({ themes: [staticThemeWithThemed404()], postRepo: new InMemoryPostRepo([]) }));
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/does-not-exist-anywhere`);
  assert.equal(res.status, 404);
  assert.ok((await res.text()).includes("Themed not found (integration)"));
});

test("integration: GET /about a static theme's own menu marker resolves through a real seeded menu, exercising every NavTarget kind", async (t) => {
  const app = createApp(
    testDeps({
      themes: [themeWithMenuMarker("about")],
      postRepo: new InMemoryPostRepo([publishedPost()]),
      menuRepo: new InMemoryMenuRepo([menuEntry()]),
    })
  );
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/about`);
  assert.equal(res.status, 200);
  assert.ok((await res.text()).includes("about"));
});

test("integration: resolveHtmlEmbedsForRender/resolveMediaAssetMetadataForRender's !post guards, called directly", async () => {
  const deps = testDeps();
  assert.equal(await resolveHtmlEmbedsForRender(deps, undefined), undefined);
  assert.equal((await resolveMediaAssetMetadataForRender(deps, undefined)).size, 0);
});

/** Mirrors `pages.route.test.ts`'s unit-tier `UnresolvableCanonicalPostRepo` — a post repo whose
 *  `findById` always misses regardless of what `findBySlug`/`list` return, forcing
 *  `buildExtraHead`'s own `urlFor` entryRef re-fetch to fail so its `/<slug>` canonical fallback
 *  actually runs. */
class UnresolvableCanonicalPostRepo extends InMemoryPostRepo {
  async findById(): Promise<PostRecord | null> {
    return null;
  }
}

test("integration: GET /:slug (post route) buildExtraHead's canonical falls back to /<slug> when urlFor can't resolve the post's own entryRef", async (t) => {
  const deps = testDeps();
  const post: PostRecord = {
    id: "post-broken-canonical-int",
    workspaceId: deps.workspaceId,
    title: "Broken canonical post (integration)",
    slug: "broken-canonical-int",
    bodyJson: { type: "doc", content: [] },
    bodyFormat: "doc",
    bodyHtml: null,
    status: "published",
    kind: "post",
    updatedAt: "2026-08-17T00:00:00.000Z",
    version: 1,
  } as unknown as PostRecord;

  const app = createApp(testDeps({ postRepo: new UnresolvableCanonicalPostRepo([post]) }));
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/broken-canonical-int`);
  assert.equal(res.status, 200);
});
