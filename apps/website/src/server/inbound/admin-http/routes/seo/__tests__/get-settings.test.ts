import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { setSeoSettings } from "#src/features/seo/settings";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import {
  createCapturingResponse,
  extractRouteHandler,
  startTestServer,
} from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminSeoGetSettingsRoute } from "../get-settings.js";
import type { SeoRouteDeps } from "../deps.js";

/**
 * @file Unit-tier coverage for `GET .../seo/settings` (`registerAdminSeoGetSettingsRoute`).
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
  registerAdminSeoGetSettingsRoute(app, deps);
  return app;
}

async function get(t: import("node:test").TestContext, app: express.Express, path = PATH) {
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${path}`);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

test("get-settings: mismatched workspaceId 404s", async (t) => {
  const app = buildApp();
  const { status, json } = await get(t, app, `/api/admin/v1/workspaces/not-real/seo/settings`);
  assert.equal(status, 404);
  assert.deepEqual(json, { error: "workspace was not found" });
});

test("get-settings: forbidden 403s", async (t) => {
  const app = buildApp({ authorize: async () => ({ allowed: false, reason: "no grant" }) });
  const { status, json } = await get(t, app);
  assert.equal(status, 403);
  assert.equal((json as { code?: string }).code, "FORBIDDEN");
  assert.equal((json as { details?: { reason?: string } }).details?.reason, "no grant");
});

test("get-settings: returns workspace seo settings (200)", async (t) => {
  const base = createRouteDeps();
  await base.siteTitleReady; // Finish all boot-time settings writes before seeding this fixture.
  const expected = {
    titleTemplate: "%s | Stored site", defaultDescription: "Stored description",
    defaultOgImage: "https://example.com/card.png", twitterSite: "@storedsite",
    defaultRobots: { noindex: true, nofollow: true }, sitemapEnabled: false,
    robotsRules: [{ userAgent: "CanaryBot", allow: ["/public"], disallow: ["/private"] }],
  };
  await setSeoSettings({ settingsRepo: base.settingsRepo, clock: base.clock, ids: base.idGen,
    authorize: async () => ({ allowed: true, reason: "matched" }), principals: base.principalRepo },
    { workspaceId: WORKSPACE_ID, callerPrincipalId: "test-principal", patch: expected });
  const app = buildApp({ settingsRepo: base.settingsRepo, seoReady: base.seoReady });
  const { status, json } = await get(t, app);
  assert.equal(status, 200);
  const body = json as { data?: { titleTemplate?: string; sitemapEnabled?: boolean } };
  assert.ok(body.data, "expected settings data");
  assert.ok(typeof body.data?.titleTemplate === "string");
  assert.ok(typeof body.data?.sitemapEnabled === "boolean");
  assert.deepEqual(body.data, expected);
});

test("get-settings: unexpected error returns 500 (INTERNAL_ERROR)", async (t) => {
  const base = createRouteDeps();
  const app = buildApp({
    settingsRepo: {
      ...base.settingsRepo,
      find: async () => {
        throw new Error("read error");
      },
    },
  });
  const { status, json } = await get(t, app);
  assert.equal(status, 500);
  assert.deepEqual(json, { error: "internal error", code: "INTERNAL_ERROR" });
});

test("get-settings: workspaceId undefined fallback via direct handler execution", async () => {
  const app = buildApp();
  const handler = extractRouteHandler(app, "get", "/api/admin/v1/workspaces/:workspaceId/seo/settings");

  const { res, capture } = createCapturingResponse();
  const req = { params: { workspaceId: undefined } } as unknown as Parameters<typeof handler>[0];
  await handler(req, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});
