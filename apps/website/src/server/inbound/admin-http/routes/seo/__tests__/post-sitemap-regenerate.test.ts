import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

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
  const app = buildApp();
  const { status, json } = await post(t, app);
  assert.equal(status, 202);
  assert.deepEqual(json, { data: { accepted: true } });
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
