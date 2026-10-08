import { createSitemapService } from "@jini-ai/cms/seo";
import { createSeoDeps } from "#src/features/seo/index";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { setSeoSettings } from "#src/features/seo/settings";
import { registerAdminSeoGetSettingsRoute } from "../get-settings.js";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import {
  createCapturingResponse,
  extractRouteHandler,
  startTestServer,
} from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminSeoPutSettingsRoute } from "../put-settings.js";
import type { SeoRouteDeps } from "../deps.js";
import { InMemorySettingsRepo } from "#src/features/settings/index";

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
    seoDeps: base.seoDeps,
    sitemapService: base.sitemapService,
    mediaContentTypeStore: base.mediaContentTypeStore,
    postRepo: base.postRepo,
    settingsRepo: base.settingsRepo,
    principalRepo: base.principalRepo,
    mediaRepo: base.mediaRepo,
    assetRenditionRepo: base.assetRenditionRepo,
    transformDefinitionRepo: base.transformDefinitionRepo,
    originRegistry: base.originRegistry,
    siteTitlePreservationStore: base.siteTitlePreservationStore,
    workspaceRepo: base.workspaceRepo,
    siteDisplayName: base.siteDisplayName,
    ...depsOverrides,
  };
  deps.seoDeps = depsOverrides.seoDeps ?? createSeoDeps({ deps }, {});
  deps.sitemapService = depsOverrides.sitemapService ?? createSitemapService({ deps: deps.seoDeps }, {});
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminSeoPutSettingsRoute(app, deps);
  registerAdminSeoGetSettingsRoute(app, deps);
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


/** Fault-injecting settings repo: a real `InMemorySettingsRepo` whose `findActiveDefinition` (the first
 *  read every `getEffective`/`set` makes) throws, counting calls so the test can prove the 500 came from
 *  this injected failure. (A `{ ...base.settingsRepo, <method> }` spread would drop the class's prototype
 *  methods, so the route would 500 on a `TypeError` instead and the override would never run.) */
class ThrowingSettingsRepo extends InMemorySettingsRepo {
  calls = 0;
  constructor(private readonly message: string) {
    super();
  }
  override async findActiveDefinition(): Promise<never> {
    this.calls += 1;
    throw new Error(this.message);
  }
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
  const base = createRouteDeps();
  await base.siteTitleReady; // Finish all boot-time settings writes before seeding this fixture.
  await setSeoSettings({ settingsRepo: base.settingsRepo, clock: base.clock, ids: base.idGen,
    authorize: async () => ({ allowed: true, reason: "matched" }), principals: base.principalRepo, media: base.seoDeps.media },
    { workspaceId: WORKSPACE_ID, callerPrincipalId: "test-principal", patch: { twitterSite: "@untouched" } });
  const app = buildApp({ settingsRepo: base.settingsRepo, seoReady: base.seoReady });
  const patch = { titleTemplate: "%s | Custom Site", sitemapEnabled: false,
    defaultRobots: { noindex: true, nofollow: true },
    robotsRules: [{ userAgent: "CanaryBot", allow: ["/public"], disallow: ["/private"] }],
    defaultDescription: "Canary description", defaultOgImage: "https://example.com/canary.png" };
  const { status, json } = await put(t, app, patch);
  assert.equal(status, 200);
  const body = json as { data?: { titleTemplate?: string; sitemapEnabled?: boolean } };
  assert.ok(body.data, "expected data wrapper in response");
  assert.equal(body.data?.titleTemplate, "%s | Custom Site");
  assert.equal(body.data?.sitemapEnabled, false);
  const baseUrl = await startTestServer(app, t);
  const read = async () => {
    const response = await fetch(`${baseUrl}${PATH}`);
    assert.equal(response.status, 200);
    return (await response.json() as { data: unknown }).data;
  };
  const expected = { ...patch, twitterSite: "@untouched" };
  assert.deepEqual(body.data, expected);
  assert.deepEqual(await read(), expected);
  const cleared = await put(t, app, { defaultDescription: null, defaultOgImage: null, twitterSite: null });
  assert.equal(cleared.status, 200);
  const { defaultDescription, defaultOgImage, ...remaining } = patch;
  assert.deepEqual(await read(), remaining);
  for (const invalid of [
    { titleTemplate: "%s | Should not persist", defaultRobots: { noindex: "yes", nofollow: true } },
    { titleTemplate: "%s | Should not persist", robotsRules: [{ userAgent: "" }] },
  ]) {
    const rejected = await put(t, app, invalid);
    assert.equal(rejected.status, 400);
    assert.equal((rejected.json as { code: string }).code, "SEO_SETTINGS_VALIDATION_ERROR");
    assert.deepEqual(await read(), remaining, "invalid patch must make no partial writes");
  }
});

test("put-settings: unexpected error returns 500 (INTERNAL_ERROR)", async (t) => {
  const settingsRepo = new ThrowingSettingsRepo("storage failure");
  const app = buildApp({ settingsRepo });
  const { status, json } = await put(t, app, { sitemapEnabled: true });
  assert.equal(status, 500);
  assert.deepEqual(json, { error: "internal error", code: "INTERNAL_ERROR" });
  assert.ok(settingsRepo.calls > 0, "the 500 must come from the injected settings failure");
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
