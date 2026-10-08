import { createSitemapService } from "@jini-ai/cms/seo";
import { createSeoDeps } from "#src/features/seo/index";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { InMemoryPostRepo } from "#src/features/post/index";
import type { VerifiedOrigin } from "@jini-ai/http-kit/verified-origin";
import { setSeoSettings } from "#src/features/seo/settings";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import {
  createCapturingResponse,
  extractRouteHandler,
  startTestServer,
} from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminSeoGetEntryAnalyzeRoute } from "../get-entry-analyze.js";
import type { SeoRouteDeps } from "../deps.js";

/**
 * @file Unit-tier coverage for `GET .../seo/entries/:entryId/analyze` (`registerAdminSeoGetEntryAnalyzeRoute`).
 */

const WORKSPACE_ID = "workspace-local";
const ENTRY_ID = "post-home";
const PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/seo/entries/${ENTRY_ID}/analyze`;

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
  registerAdminSeoGetEntryAnalyzeRoute(app, deps);
  return app;
}

async function get(t: import("node:test").TestContext, app: express.Express, path = PATH) {
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${path}`);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

test("get-entry-analyze: mismatched workspaceId 404s", async (t) => {
  const app = buildApp();
  const { status, json } = await get(
    t,
    app,
    `/api/admin/v1/workspaces/not-real/seo/entries/${ENTRY_ID}/analyze`
  );
  assert.equal(status, 404);
  assert.deepEqual(json, { error: "workspace was not found" });
});

test("get-entry-analyze: forbidden 403s", async (t) => {
  const app = buildApp({ authorize: async () => ({ allowed: false, reason: "no grant" }) });
  const { status, json } = await get(t, app);
  assert.equal(status, 403);
  assert.equal((json as { code?: string }).code, "FORBIDDEN");
  assert.equal((json as { details?: { reason?: string } }).details?.reason, "no grant");
  assert.equal((json as { details?: { permission?: string } }).details?.permission, "admin.seo.manage");
});

test("get-entry-analyze: unknown entry 404s (SEO_ENTRY_NOT_FOUND)", async (t) => {
  const app = buildApp();
  const { status, json } = await get(
    t,
    app,
    `/api/admin/v1/workspaces/${WORKSPACE_ID}/seo/entries/does-not-exist/analyze`
  );
  assert.equal(status, 404);
  assert.equal((json as { code?: string }).code, "SEO_ENTRY_NOT_FOUND");
});

test("get-entry-analyze: valid entry returns analysis score and issues (200)", async (t) => {
  const base = createRouteDeps();
  await base.siteTitleReady; // Finish all boot-time settings writes before seeding this fixture.
  const postRepo = new InMemoryPostRepo([{
    id: ENTRY_ID, workspaceId: WORKSPACE_ID, title: "Canary entry", slug: "seo-canary",
    kind: "post", status: "published", bodyJson: { type: "doc", content: [] }, bodyFormat: "doc", bodyHtml: null,
    updatedAt: "2026-09-30T00:00:00.000Z", version: 1, seoExtJson: null,
  }]);
  await setSeoSettings({ settingsRepo: base.settingsRepo, clock: base.clock, ids: base.idGen,
    authorize: async () => ({ allowed: true, reason: "matched" }), principals: base.principalRepo, media: base.seoDeps.media },
    { workspaceId: WORKSPACE_ID, callerPrincipalId: "principal-owner", patch: { titleTemplate: "%s | Canary", defaultDescription: "" } });
  const originRegistry = { isAllowedRedirectTarget: base.originRegistry.isAllowedRedirectTarget.bind(base.originRegistry), isAllowedEgressTarget: base.originRegistry.isAllowedEgressTarget.bind(base.originRegistry), canonicalOrigin: async () => ({ scheme: "https", host: "seo.example.com", basePath: "", source: "workspace-setting", verifiedAt: "2026-09-30T00:00:00.000Z" } satisfies VerifiedOrigin) };
  const app = buildApp({ postRepo, settingsRepo: base.settingsRepo, seoReady: base.seoReady, originRegistry });
  const { status, json } = await get(t, app);
  assert.equal(status, 200);
  const body = json as { data: { entryId: string; score: number; issues: Array<{ code: string }>; resolved: { title: string; canonical: string; description?: string } } };
  assert.ok(body.data, "expected analysis data in response");
  assert.equal(typeof body.data.score, "number");
  assert.ok(Array.isArray(body.data.issues));
  assert.equal(body.data.entryId, ENTRY_ID);
  assert.equal(body.data.score, 80);
  assert.deepEqual(body.data.issues, [{ code: "missing_description", severity: "warning", message: "Description is missing.", field: "description" }]);
  assert.equal(body.data.resolved.title, "Canary entry | Canary");
  assert.equal(body.data.resolved.canonical, "https://seo.example.com/seo-canary");
  assert.equal(body.data.resolved.description, undefined);

  const post = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: ENTRY_ID });
  assert.ok(post);
  await postRepo.save({ ...post, seoExtJson: JSON.stringify({ description: "Complete metadata" }) });
  const complete = await get(t, app);
  assert.equal(complete.status, 200);
  const analysis = (complete.json as typeof body).data;
  assert.equal(analysis.entryId, ENTRY_ID);
  assert.equal(analysis.score, 100);
  assert.deepEqual(analysis.issues, []);
  assert.equal(analysis.resolved.description, "Complete metadata");
});

test("get-entry-analyze: unexpected repo error returns 500 (INTERNAL_ERROR)", async (t) => {
  const base = createRouteDeps();
  const app = buildApp({
    postRepo: {
      ...base.postRepo,
      findById: async () => {
        throw new Error("database explosion");
      },
    },
  });
  const { status, json } = await get(t, app);
  assert.equal(status, 500);
  assert.deepEqual(json, { error: "internal error", code: "INTERNAL_ERROR" });
});

test("get-entry-analyze: workspaceId and entryId undefined fallbacks via direct handler execution", async () => {
  const app = buildApp();
  const handler = extractRouteHandler(app, "get", "/api/admin/v1/workspaces/:workspaceId/seo/entries/:entryId/analyze");

  // workspaceId undefined -> `String(undefined ?? "") !== deps.workspaceId` -> 404
  {
    const { res, capture } = createCapturingResponse();
    const req = { params: { workspaceId: undefined, entryId: ENTRY_ID } } as unknown as Parameters<
      typeof handler
    >[0];
    await handler(req, res);
    assert.equal(capture.statusCode, 404);
    assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
  }

  // entryId undefined -> `String(undefined ?? "")` resolves to "", which is not found -> 404
  {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "test-principal" };
    const req = {
      params: { workspaceId: WORKSPACE_ID, entryId: undefined },
    } as unknown as Parameters<typeof handler>[0];
    await handler(req, res);
    assert.equal(capture.statusCode, 404);
    assert.equal((capture.jsonBody as { code?: string }).code, "SEO_ENTRY_NOT_FOUND");
  }
});
