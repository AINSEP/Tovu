import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createSitemapService } from "@jini-ai/cms/seo";
import { createSeoDeps } from "#src/features/seo/index";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { InMemoryPostRepo } from "#src/features/post/index";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { SeoRouteDeps } from "#src/server/runtime/composition/modules/seo";
import { registerSeoSitemapRoute } from "../seo-documents.js";

/**
 * @file Wire pin for the serving origin the public SEO routes build their absolute URLs from
 * (K1 public-seo): the origin comes from the request's own authority, and `X-Forwarded-Host` /
 * `X-Forwarded-Proto` count only when Express's `trust proxy` setting trusts the socket peer. Written
 * green against the hand-written route, then held identical through the move to a Jini spec.
 */

async function sitemapBody(t: test.TestContext, { trustProxy, headers }: { trustProxy: boolean | string; headers: Record<string, string> }): Promise<string> {
  const base = createRouteDeps();
  const deps: SeoRouteDeps = { ...base, postRepo: new InMemoryPostRepo({}, { initialRows: [] }) };
  deps.seoDeps = createSeoDeps({ deps }, {});
  deps.sitemapService = createSitemapService({ deps: deps.seoDeps }, {});
  deps.sitemapService.invalidateSitemapCache({ workspaceId: deps.workspaceId });
  deps.sitemapService.registerSitemapCollectHook({ hook: { priority: 0, handle: async () => [{ loc: "/hook-entry" }] } }, {});
  t.after(() => {
    deps.sitemapService.resetSitemapCollectHooksForTests({}, {});
    deps.sitemapService.invalidateSitemapCache({ workspaceId: deps.workspaceId });
  });
  const app = express();
  app.set("trust proxy", trustProxy);
  registerSeoSitemapRoute({ app, deps });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/sitemap.xml`, { headers });
  assert.equal(res.status, 200);
  return res.text();
}

test("GET /sitemap.xml: behind a trusted proxy the forwarded host and protocol are the origin of every URL", async (t) => {
  const body = await sitemapBody(t, { trustProxy: "loopback", headers: { "x-forwarded-host": "www.example.test:8443, other.test", "x-forwarded-proto": "https" } });
  assert.ok(body.includes("<url><loc>https://www.example.test:8443/hook-entry</loc></url>"), body);
});

test("GET /sitemap.xml: with no trusted proxy a forwarded host is ignored and the request's own Host is the origin", async (t) => {
  const body = await sitemapBody(t, { trustProxy: false, headers: { "x-forwarded-host": "attacker.example", "x-forwarded-proto": "https" } });
  assert.ok(!body.includes("attacker.example"), body);
  assert.match(body, /<url><loc>http:\/\/127\.0\.0\.1:\d+\/hook-entry<\/loc><\/url>/);
});
