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
import { registerAdminSeoPutSettingsRoute } from "../put-settings.js";
import type { SeoRouteDeps } from "../deps.js";

/**
 * @file Unit-tier coverage for `PUT .../seo/settings` (`registerAdminSeoPutSettingsRoute`).
 */

const WORKSPACE_ID = "workspace-local";
const PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/seo/settings`;

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
  registerAdminSeoPutSettingsRoute(app, deps);
  return app;
}

async function put(t: import("node:test").TestContext, app: express.Express, body: unknown, path = PATH) {
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

test("put-settings: mismatched workspaceId 404s", async (t) => {
  const app = buildApp();
  const { status, json } = await put(t, app, {}, `/api/admin/v1/workspaces/not-real/seo/settings`);
  assert.equal(status, 404);
  assert.deepEqual(json, { error: "workspace was not found" });
});

test("put-settings: forbidden 403s", async (t) => {
  const app = buildApp({ authorize: async () => ({ allowed: false, reason: "no grant" }) });
  const { status, json } = await put(t, app, {});
  assert.equal(status, 403);
  assert.equal((json as { code?: string }).code, "FORBIDDEN");
  assert.equal((json as { details?: { reason?: string } }).details?.reason, "no grant");
});

test("put-settings: validation error 400s (SEO_SETTINGS_VALIDATION_ERROR)", async (t) => {
  const app = buildApp();
  // titleTemplate requires '%s'
  const { status, json } = await put(t, app, { titleTemplate: "invalid without placeholder" });
  assert.equal(status, 400);
  assert.equal((json as { code?: string }).code, "SEO_SETTINGS_VALIDATION_ERROR");
});

test("put-settings: valid patch returns updated settings (200)", async (t) => {
  const app = buildApp();
  const { status, json } = await put(t, app, { titleTemplate: "%s | Custom Site", sitemapEnabled: false });
  assert.equal(status, 200);
  const body = json as { data?: { titleTemplate?: string; sitemapEnabled?: boolean } };
  assert.ok(body.data, "expected data wrapper in response");
  assert.equal(body.data?.titleTemplate, "%s | Custom Site");
  assert.equal(body.data?.sitemapEnabled, false);
});

test("put-settings: unexpected error returns 500 (INTERNAL_ERROR)", async (t) => {
  const base = createRouteDeps();
  const app = buildApp({
    settingsRepo: {
      ...base.settingsRepo,
      set: async () => {
        throw new Error("storage failure");
      },
    },
  });
  const { status, json } = await put(t, app, { sitemapEnabled: true });
  assert.equal(status, 500);
  assert.deepEqual(json, { error: "internal error", code: "INTERNAL_ERROR" });
});

test("put-settings: workspaceId undefined and req.body undefined fallbacks via direct handler execution", async () => {
  const app = buildApp();
  const handler = extractRouteHandler(app, "put", "/api/admin/v1/workspaces/:workspaceId/seo/settings");

  // workspaceId undefined -> `String(undefined ?? "") !== deps.workspaceId` -> 404
  {
    const { res, capture } = createCapturingResponse();
    const req = { params: { workspaceId: undefined }, body: {} } as unknown as Parameters<
      typeof handler
    >[0];
    await handler(req, res);
    assert.equal(capture.statusCode, 404);
    assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
  }

  // req.body undefined -> `req.body ?? {}` -> an empty patch, which `setSeoSettings` refuses (C4b) -> 400
  {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "test-principal" };
    const req = {
      params: { workspaceId: WORKSPACE_ID },
      body: undefined,
    } as unknown as Parameters<typeof handler>[0];
    await handler(req, res);
    assert.equal(capture.statusCode, 400);
    assert.deepEqual(capture.jsonBody, { error: "patch must include at least one field", code: "SEO_SETTINGS_VALIDATION_ERROR" });
  }
});
