import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { createRouteDeps } from "../../server/app.js";
import { InMemoryPostRepo } from "../../features/post/index.js";
import { InMemoryRedirectRepo } from "../../redirects/index.js";
import type { RedirectRecord } from "../../redirects/index.js";
import { buildRouteManifest, type RouteManifestDeps } from "../route-manifest.js";

/**
 * @file Regression coverage for `buildRouteManifest` (SPEC — static site exporter, 2026-08-15).
 *
 * Deliberately built against `server/app.ts`'s own `createRouteDeps()` fixture (the seeded demo
 * workspace/posts/theme every other route test in this repo already trusts) rather than hand-rolled
 * fakes — that fixture is real production seed data (`server/seed.ts`), so a manifest that is wrong
 * against it would also be wrong against a freshly-installed real site.
 */

/** MUTATES the object `createRouteDeps()` returns rather than spreading a copy — deliberately,
 *  since 2026-08-20 (RouteDeps-narrowing pass 2): `resolveStorefrontProducts` is a closure bound to
 *  ONE object identity, at construction time, inside `createRouteDeps()` itself (same shape and same
 *  gotcha as `RouteDeps.exportSiteBound` — see that field's doc in `server/routes/types.ts`,
 *  generalized). A spread (`{ ...deps, ...overrides }`) would return a logically-overridden but
 *  DIFFERENT object identity that closure never sees; none of the overrides this file actually
 *  passes (`postRepo`) affect what `resolveStorefrontProducts` itself reads, so a spread would not
 *  have failed any assertion here today — but it would have been silently inert for a future
 *  override that DID matter, which is the exact failure mode worth refusing on principle rather than
 *  by luck. */
function baseDeps(overrides: Partial<RouteManifestDeps> = {}): RouteManifestDeps {
  const deps = createRouteDeps();
  return Object.assign(deps, overrides);
}

test("buildRouteManifest: includes home and every seeded published post/page, and does not depend on sitemap.ts", async () => {
  const manifest = await buildRouteManifest(baseDeps());

  const home = manifest.routes.find((r) => r.path === "/");
  assert.ok(home, "expected a '/' route");
  assert.equal(home?.kind, "home");

  // `server/seed.ts`'s `seededPosts` includes a published post at slug "welcome" — asserted by
  // path+kind (not by importing `seo/sitemap.ts` in any form) so this test can never pass merely
  // because the two modules happen to agree; `buildRouteManifest` never imports `seo/sitemap.ts` at
  // all (verified by this file's import list above), so there is no seam for their behavior to leak
  // into each other through.
  const welcome = manifest.routes.find((r) => r.path === "/welcome");
  assert.ok(welcome, "expected the seeded 'welcome' post to be enumerated");
  assert.equal(welcome?.kind, "post");
});

test("buildRouteManifest: always includes the convention routes robots.txt/sitemap.xml, and reports the missing favicon/manifest route", async () => {
  const manifest = await buildRouteManifest(baseDeps());

  const robots = manifest.routes.find((r) => r.path === "/robots.txt");
  assert.ok(robots, "expected /robots.txt — no HTML page links to it, so a crawl alone would never find it");
  assert.equal(robots?.kind, "well-known");

  const sitemap = manifest.routes.find((r) => r.path === "/sitemap.xml");
  assert.ok(sitemap, "expected /sitemap.xml — always registered regardless of the sitemapEnabled setting");
  assert.equal(sitemap?.kind, "well-known");

  assert.ok(
    manifest.skipped.some((s) => s.reason === "no-favicon-or-manifest-route"),
    "Tovu has no favicon/manifest route today — the gap must be named, not silently absent"
  );
});

test("buildRouteManifest: resolves and returns the active theme's id + on-disk dir", async () => {
  const manifest = await buildRouteManifest(baseDeps());
  assert.equal(manifest.activeTheme?.id, "basic");
  assert.ok(manifest.activeTheme?.dir.endsWith(`${path.sep}basic`));
});

test("buildRouteManifest: enumerates the active theme's own static pages, excluding index/404 and template shells", async () => {
  const manifest = await buildRouteManifest(baseDeps());

  // seeded active theme is "basic" (server/seed.ts's seededPresentation), a static-tier theme whose
  // theme.json declares "pricing" as a real page and "page-shell"/"blog-post" as template shells
  // (theme.manifest.templates) a post picks via templateChoice, never their own route.
  const pricing = manifest.routes.find((r) => r.path === "/pricing");
  assert.ok(pricing, "expected the theme's own 'pricing' static page to be enumerated");
  assert.equal(pricing?.kind, "theme-page");

  assert.equal(
    manifest.routes.some((r) => r.path === "/page-shell" || r.path === "/blog-post"),
    false,
    "a template shell (theme.manifest.templates) must never be enumerated as its own route"
  );
  assert.equal(
    manifest.routes.some((r) => r.path === "/index" || r.path === "/404"),
    false,
    "'index' is home ('/') and '404' is the not-found probe — neither is its own route"
  );
});

test("buildRouteManifest: a post that overridesThemePage wins over the theme's same-slug static page", async () => {
  const base = createRouteDeps();
  const overridingPost = {
    id: "post-override-test",
    workspaceId: base.workspaceId,
    title: "Custom Pricing",
    slug: "pricing", // collides with basic theme's pages/pricing.html
    bodyJson: { type: "doc", content: [] },
    status: "published" as const,
    kind: "post" as const,
    bodyFormat: "doc" as const,
    bodyHtml: null,
    updatedAt: new Date().toISOString(),
    version: 1,
    overridesThemePage: true,
  };
  const postRepo = new InMemoryPostRepo([overridingPost]);
  const manifest = await buildRouteManifest(baseDeps({ postRepo }));

  const pricingRoutes = manifest.routes.filter((r) => r.path === "/pricing");
  assert.equal(pricingRoutes.length, 1, "exactly one route at the shared slug, never two");
  assert.equal(pricingRoutes[0]?.kind, "post");
});

test("buildRouteManifest: a post that never decided (overridesThemePage omitted) still wins by default (tri-state, 2026-08-15)", async () => {
  const base = createRouteDeps();
  // Deliberately no `overridesThemePage` key at all — the same shape `createPost` produces for
  // every post today (see `CreatePostInput`'s own doc for why it stays absent), not a hand-picked
  // edge case. Must resolve exactly like the explicit-`true` test above: the exported manifest has
  // to agree with what the live site actually serves for this row.
  const neverDecidedPost = {
    id: "post-never-decided-test",
    workspaceId: base.workspaceId,
    title: "Custom Pricing (never decided)",
    slug: "pricing", // collides with basic theme's pages/pricing.html
    bodyJson: { type: "doc", content: [] },
    status: "published" as const,
    kind: "post" as const,
    bodyFormat: "doc" as const,
    bodyHtml: null,
    updatedAt: new Date().toISOString(),
    version: 1,
  };
  const postRepo = new InMemoryPostRepo([neverDecidedPost]);
  const manifest = await buildRouteManifest(baseDeps({ postRepo }));

  const pricingRoutes = manifest.routes.filter((r) => r.path === "/pricing");
  assert.equal(pricingRoutes.length, 1, "exactly one route at the shared slug, never two");
  assert.equal(pricingRoutes[0]?.kind, "post", "the new default (post wins) must apply here too, not just in the live resolver");
});

test("buildRouteManifest: a post explicitly kept at false still loses to the theme's same-slug static page (tri-state, 2026-08-15)", async () => {
  const base = createRouteDeps();
  const explicitlyKeptPost = {
    id: "post-explicit-false-test",
    workspaceId: base.workspaceId,
    title: "Custom Pricing (explicitly kept theme page)",
    slug: "pricing",
    bodyJson: { type: "doc", content: [] },
    status: "published" as const,
    kind: "post" as const,
    bodyFormat: "doc" as const,
    bodyHtml: null,
    updatedAt: new Date().toISOString(),
    version: 1,
    overridesThemePage: false,
  };
  const postRepo = new InMemoryPostRepo([explicitlyKeptPost]);
  const manifest = await buildRouteManifest(baseDeps({ postRepo }));

  const pricingRoutes = manifest.routes.filter((r) => r.path === "/pricing");
  assert.equal(pricingRoutes.length, 1, "exactly one route at the shared slug, never two");
  assert.equal(pricingRoutes[0]?.kind, "theme-page", "an explicit false is a permanent choice and must still win over the default");
});

test("buildRouteManifest: enumerates products only when the storefront actually has any", async () => {
  const withoutStore = await buildRouteManifest(baseDeps());
  assert.equal(
    withoutStore.routes.some((r) => r.kind === "product-list" || r.kind === "product"),
    false,
    "no store/commerce wired in the base fixture — no product routes should appear"
  );

  const store = {
    listProducts: () => [{ id: "mug-01", title: "Mug", price: 1200, stock: 5, version: 1 }],
    checkout: () => ({ ok: false as const, reason: "not-found" as const, retries: 0 }),
  };
  // `store` is read only by `resolveStorefrontProducts`'s own real implementation
  // (`server/routes/site/products.ts`), never by `buildRouteManifest` directly — correctly absent
  // from `RouteManifestDeps` (2026-08-20 RouteDeps-narrowing pass 2), so `baseDeps`'s narrow
  // `Partial<RouteManifestDeps>` override param can't name it. Goes through `createRouteDeps()`
  // directly instead, mutated in place for the same closure-identity reason `baseDeps` itself now
  // mutates rather than spreads (see that function's own doc above) — `deps` here is structurally a
  // superset of `RouteManifestDeps`, so passing it to `buildRouteManifest` needs no cast.
  const deps = createRouteDeps();
  deps.store = store;
  const withStore = await buildRouteManifest(deps);
  assert.ok(withStore.routes.find((r) => r.path === "/products" && r.kind === "product-list"));
  assert.ok(withStore.routes.find((r) => r.path === "/products/mug-01" && r.kind === "product"));
});

test("buildRouteManifest: an exact-match active redirect is enumerated; a prefix rule is reported as skipped, not silently dropped", async () => {
  const now = new Date().toISOString();
  const exactRule: RedirectRecord = {
    id: "redir-exact",
    workspaceId: "workspace-local",
    matchType: "exact",
    fromPattern: "/old-page",
    toTarget: "/welcome",
    statusCode: 301,
    status: "active",
    override: false,
    priority: 0,
    source: "manual",
    createdByPrincipal: "system",
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  const prefixRule: RedirectRecord = { ...exactRule, id: "redir-prefix", matchType: "prefix", fromPattern: "/old" };
  const redirectRepo = new InMemoryRedirectRepo([exactRule, prefixRule]);

  const manifest = await buildRouteManifest(baseDeps({ redirectRepo }));

  const exact = manifest.routes.find((r) => r.path === "/old-page");
  assert.ok(exact, "expected the exact-match redirect to be enumerated as a route");
  assert.equal(exact?.kind, "redirect");
  assert.equal(exact?.redirectTarget, "/welcome");
  assert.equal(exact?.redirectStatusCode, 301);

  assert.equal(
    manifest.routes.some((r) => r.path === "/old"),
    false,
    "a prefix rule matches a family of paths and must not appear as one route"
  );
  assert.ok(
    manifest.skipped.some((s) => s.reason === "non-exact-redirect" && s.detail.includes("/old")),
    "the prefix rule must be named in `skipped`, never silently absent from the report"
  );
});

test("buildRouteManifest: the not-found probe path never collides with a real enumerated route", async () => {
  const manifest = await buildRouteManifest(baseDeps());
  const probe = manifest.routes.find((r) => r.kind === "not-found");
  assert.ok(probe, "expected a not-found probe route");

  const realPaths = manifest.routes.filter((r) => r.kind !== "not-found").map((r) => r.path);
  assert.equal(realPaths.includes(probe?.path ?? ""), false);
});
