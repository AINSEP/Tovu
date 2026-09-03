import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { InMemoryPostRepo } from "#src/features/post/index";
import { invalidateSitemapCache, registerSitemapCollectHook, resetSitemapCollectHooksForTests } from "#src/features/seo/index";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { SeoRouteDeps } from "#src/server/inbound/admin-http/routes/seo/deps";
import { registerSeoSitemapRoute } from "../sitemap.js";

/**
 * @file Coverage-gap fill for `registerSeoSitemapRoute` (`routes/site/sitemap.ts`). The happy
 * path (published posts, each with a real `lastmod`) is already covered by
 * `src/server/__tests__/routes/seo-site-serving.test.ts`. This file targets the branches only
 * reachable through the (currently unused-in-production, but live and exported) sitemap-collect
 * hook seam, an empty result set, or a failing dependency:
 *  - `SitemapEntry.lastmod` is optional (`features/seo/types.ts`); every entry `buildSitemap`
 *    derives from a real post always sets it (`post.updatedAt`), so the only way to reach an
 *    entry with no `lastmod` is through `registerSitemapCollectHook` (`features/seo/sitemap.ts`'s
 *    own documented "live-but-empty" OQ-01 seam) — a real, exported extension point, not dead code.
 *  - the fully-empty `<urlset>` (no published posts, no collect-hook entries).
 *  - the route's own `catch` — reachable whenever `buildSitemap` (post read) throws.
 *
 * Each test invalidates the module-level sitemap cache for its own workspace before asserting,
 * since `buildSitemap` caches per-workspace and `createRouteDeps()` always seeds the same
 * workspace id — without this, a later test could read an earlier test's cached result.
 */

function buildSitemapOnlyApp(depsOverrides: Partial<SeoRouteDeps>): { app: express.Express; deps: SeoRouteDeps } {
  const base = createRouteDeps();
  const deps: SeoRouteDeps = { ...base, ...depsOverrides };
  const app = express();
  registerSeoSitemapRoute(app, deps);
  return { app, deps };
}

test("GET /sitemap.xml: an entry from a registered seo.sitemap.collect hook with no lastmod omits <lastmod> entirely", async (t) => {
  const { app, deps } = buildSitemapOnlyApp({ postRepo: new InMemoryPostRepo([]) });
  invalidateSitemapCache({ workspaceId: deps.workspaceId });
  registerSitemapCollectHook({ priority: 0, handle: async () => [{ loc: "/hook-entry" }] });
  t.after(() => {
    resetSitemapCollectHooksForTests();
    invalidateSitemapCache({ workspaceId: deps.workspaceId });
  });

  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/sitemap.xml`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /<url><loc>\/hook-entry<\/loc><\/url>/, "no lastmod present -> no <lastmod> element at all");
  assert.doesNotMatch(body, /<lastmod>/);
});

test("GET /sitemap.xml: no published posts and no collect-hook entries -> an empty <urlset>, no stray blank line", async (t) => {
  const { app, deps } = buildSitemapOnlyApp({ postRepo: new InMemoryPostRepo([]) });
  invalidateSitemapCache({ workspaceId: deps.workspaceId });
  t.after(() => invalidateSitemapCache({ workspaceId: deps.workspaceId }));

  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/sitemap.xml`);
  assert.equal(res.status, 200);
  assert.equal(
    await res.text(),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n`
  );
});

test("GET /sitemap.xml: a post-read failure is caught and reported as a plain-text 500, not an uncaught rejection", async (t) => {
  // Mutate the real repo instance's own `list`, rather than spreading it into a plain object --
  // `InMemoryPostRepo`'s methods live on its prototype, so a spread would silently drop
  // `findById`/`findBySlug`/etc. too.
  const postRepo = new InMemoryPostRepo([]);
  postRepo.list = async () => {
    throw new Error("post store unavailable");
  };
  const { app, deps } = buildSitemapOnlyApp({ postRepo });
  invalidateSitemapCache({ workspaceId: deps.workspaceId });
  t.after(() => invalidateSitemapCache({ workspaceId: deps.workspaceId }));

  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/sitemap.xml`);
  assert.equal(res.status, 500);
  assert.match(res.headers.get("content-type") ?? "", /text\/plain/);
  assert.equal(await res.text(), "internal error");
});
