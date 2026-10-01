import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { InMemoryPostRepo } from "#src/features/post/index";
import { buildSitemap, invalidateSitemapCache } from "#src/features/seo/sitemap";
import type { VerifiedOrigin } from "#src/features/origin/index";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import {
  createCapturingResponse,
  extractRouteHandler,
  startTestServer,
} from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminSeoPostSitemapRegenerateRoute } from "../post-sitemap-regenerate.js";
import type { SeoRouteDeps } from "../deps.js";

/**
 * @file Unit-tier coverage for `POST .../seo/sitemap/regenerate` (`registerAdminSeoPostSitemapRegenerateRoute`).
 */

const WORKSPACE_ID = "workspace-local";
const PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/seo/sitemap/regenerate`;

function buildApp(depsOverrides: Partial<SeoRouteDeps> = {}): express.Express {
  const base = createRouteDeps();
  const deps: SeoRouteDeps = {
    workspaceId: base.workspaceId,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: base.clock,
    idGen: base.idGen,
    seoReady: base.seoReady,
    postRepo: base.postRepo,
    settingsRepo: base.settingsRepo,
    principalRepo: base.principalRepo,
    mediaRepo: base.mediaRepo,
    assetRenditionRepo: base.assetRenditionRepo,
    transformDefinitionRepo: base.transformDefinitionRepo,
    originRegistry: base.originRegistry,
    ...depsOverrides,
  };
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminSeoPostSitemapRegenerateRoute(app, deps);
  return app;
}

async function post(t: import("node:test").TestContext, app: express.Express, path = PATH) {
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${path}`, { method: "POST" });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

test("post-sitemap-regenerate: mismatched workspaceId 404s", async (t) => {
  const app = buildApp();
  const { status, json } = await post(t, app, `/api/admin/v1/workspaces/not-real/seo/sitemap/regenerate`);
  assert.equal(status, 404);
  assert.deepEqual(json, { error: "workspace was not found" });
});

test("post-sitemap-regenerate: forbidden 403s", async (t) => {
  const app = buildApp({ authorize: async () => ({ allowed: false, reason: "no grant" }) });
  const { status, json } = await post(t, app);
  assert.equal(status, 403);
  assert.equal((json as { code?: string }).code, "FORBIDDEN");
  assert.equal((json as { details?: { reason?: string } }).details?.reason, "no grant");
  assert.equal(
    (json as { error?: string }).error,
    "principal 'test-principal' is not authorized for 'admin.seo.manage' (no grant)"
  );
});

test("post-sitemap-regenerate: returns 202 on successful regeneration", async (t) => {
  const base = createRouteDeps();
  await base.seoReady;
  invalidateSitemapCache({ workspaceId: WORKSPACE_ID });
  t.after(() => invalidateSitemapCache({ workspaceId: WORKSPACE_ID }));
  const original = {
    id: "sitemap-canary", workspaceId: WORKSPACE_ID, title: "Canary", slug: "before-regeneration",
    kind: "post" as const, status: "published" as const, bodyJson: { type: "doc", content: [] },
    version: 1, updatedAt: "2026-09-01T00:00:00.000Z", seoExtJson: null,
  };
  const postRepo = new InMemoryPostRepo([original]);
  const originRegistry = { ...base.originRegistry, canonicalOrigin: async () => ({ scheme: "https", host: "sitemap.example.com", basePath: "", source: "workspace-setting", verifiedAt: "2026-09-30T00:00:00.000Z" } satisfies VerifiedOrigin) };
  const sitemapDeps = { postRepo, settingsRepo: base.settingsRepo, media: base, originRegistry };
  const before = [{ loc: "https://sitemap.example.com/before-regeneration", lastmod: original.updatedAt }];
  assert.deepEqual(await buildSitemap(sitemapDeps, { workspaceId: WORKSPACE_ID }), before);
  await postRepo.save({ ...original, slug: "after-regeneration", updatedAt: "2026-09-30T00:00:00.000Z", version: 2 });
  assert.deepEqual(await buildSitemap(sitemapDeps, { workspaceId: WORKSPACE_ID }), before, "control: cache is stale before regeneration");
  const app = buildApp({ postRepo, settingsRepo: base.settingsRepo, seoReady: base.seoReady, originRegistry });
  const { status, json } = await post(t, app);
  assert.equal(status, 202);
  assert.deepEqual(json, { data: { accepted: true } });
  assert.deepEqual(await buildSitemap(sitemapDeps, { workspaceId: WORKSPACE_ID }), [
    { loc: "https://sitemap.example.com/after-regeneration", lastmod: "2026-09-30T00:00:00.000Z" },
  ]);
});

test("post-sitemap-regenerate: unexpected authorization error returns 500", async (t) => {
  const app = buildApp({
    authorize: async () => {
      throw new Error("db auth failure");
    },
  });
  const { status, json } = await post(t, app);
  assert.equal(status, 500);
  assert.deepEqual(json, { error: "internal error", code: "INTERNAL_ERROR" });
});

test("post-sitemap-regenerate: error when regenerateSitemapCache rejects returns 500", async (t) => {
  const base = createRouteDeps();
  const app = buildApp({
    settingsRepo: {
      ...base.settingsRepo,
      find: async () => {
        throw new Error("settings lookup failed");
      },
    },
  });
  const { status, json } = await post(t, app);
  assert.equal(status, 500);
  assert.deepEqual(json, { error: "internal error", code: "INTERNAL_ERROR" });
});

test("post-sitemap-regenerate: workspaceId undefined fallback via direct handler execution", async () => {
  const app = buildApp();
  const handler = extractRouteHandler(
    app,
    "post",
    "/api/admin/v1/workspaces/:workspaceId/seo/sitemap/regenerate"
  );

  const { res, capture } = createCapturingResponse();
  const req = { params: { workspaceId: undefined } } as unknown as Parameters<typeof handler>[0];
  await handler(req, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});
