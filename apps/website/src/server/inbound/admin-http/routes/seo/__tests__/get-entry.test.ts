import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { InMemoryPostRepo } from "#src/features/post/index";
import type { VerifiedOrigin } from "#src/features/origin/index";
import { setSeoSettings } from "#src/features/seo/settings";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import {
  createCapturingResponse,
  extractRouteHandler,
  startTestServer,
} from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminSeoGetEntryRoute } from "../get-entry.js";
import type { SeoRouteDeps } from "../deps.js";

/**
 * @file Unit-tier coverage for `GET .../seo/entries/:entryId` (`registerAdminSeoGetEntryRoute`).
 * Mirrors `get-entry-analyze.test.ts`'s shape — the two routes share an identical
 * workspace-guard/authorize/try-catch skeleton, differing only in the underlying read
 * (`getEntryMeta` vs. `analyzeEntry`, which itself wraps `getEntryMeta`).
 */

const WORKSPACE_ID = "workspace-local";
const ENTRY_ID = "post-home";
const PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/seo/entries/${ENTRY_ID}`;

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
  registerAdminSeoGetEntryRoute(app, deps);
  return app;
}

async function get(t: import("node:test").TestContext, app: express.Express, path = PATH) {
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${path}`);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

test("get-entry: mismatched workspaceId 404s", async (t) => {
  const app = buildApp();
  const { status, json } = await get(t, app, `/api/admin/v1/workspaces/not-real/seo/entries/${ENTRY_ID}`);
  assert.equal(status, 404);
  assert.deepEqual(json, { error: "workspace was not found" });
});

test("get-entry: forbidden 403s", async (t) => {
  const app = buildApp({ authorize: async () => ({ allowed: false, reason: "no grant" }) });
  const { status, json } = await get(t, app);
  assert.equal(status, 403);
  assert.equal((json as { code?: string }).code, "FORBIDDEN");
  assert.equal((json as { details?: { reason?: string } }).details?.reason, "no grant");
  assert.equal((json as { details?: { permission?: string } }).details?.permission, "admin.seo.manage");
});

test("get-entry: unknown entry 404s (SEO_ENTRY_NOT_FOUND)", async (t) => {
  const app = buildApp();
  const { status, json } = await get(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/seo/entries/does-not-exist`);
  assert.equal(status, 404);
  assert.equal((json as { code?: string }).code, "SEO_ENTRY_NOT_FOUND");
});

test("get-entry: valid entry returns effective SEO meta (200)", async (t) => {
  const base = createRouteDeps();
  await base.siteTitleReady; // Finish all boot-time settings writes before seeding this fixture.
  const postRepo = new InMemoryPostRepo([{
    id: ENTRY_ID, workspaceId: WORKSPACE_ID, title: "Canary entry", slug: "seo-canary",
    kind: "post", status: "published", bodyJson: { type: "doc", content: [] },
    updatedAt: "2026-09-30T00:00:00.000Z", version: 1, seoExtJson: null,
  }]);
  await setSeoSettings({ settingsRepo: base.settingsRepo, clock: base.clock, ids: base.idGen,
    authorize: async () => ({ allowed: true, reason: "matched" }), principals: base.principalRepo },
    { workspaceId: WORKSPACE_ID, callerPrincipalId: "principal-owner", patch: { titleTemplate: "%s | Canary", defaultDescription: "Canary description" } });
  const originRegistry = { ...base.originRegistry, canonicalOrigin: async () => ({ scheme: "https", host: "seo.example.com", basePath: "", source: "workspace-setting", verifiedAt: "2026-09-30T00:00:00.000Z" } satisfies VerifiedOrigin) };
  const app = buildApp({ postRepo, settingsRepo: base.settingsRepo, seoReady: base.seoReady, originRegistry });
  const { status, json } = await get(t, app);
  assert.equal(status, 200);
  const body = json as { data: { title: string; canonical: string; description: string; robots: unknown; openGraph: { title: string; url: string }; twitter: { title: string } } };
  assert.ok(body.data, "expected meta data in response");
  assert.equal(typeof body.data.title, "string");
  assert.equal(typeof body.data.canonical, "string");
  assert.equal(body.data.title, "Canary entry | Canary");
  assert.equal(body.data.canonical, "https://seo.example.com/seo-canary");
  assert.equal(body.data.description, "Canary description");
  assert.deepEqual(body.data.robots, { noindex: false, nofollow: false });
  assert.equal(body.data.openGraph.title, body.data.title);
  assert.equal(body.data.openGraph.url, body.data.canonical);
  assert.equal(body.data.twitter.title, body.data.title);
});

test("get-entry: unexpected repo error returns 500 (INTERNAL_ERROR)", async (t) => {
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

test("get-entry: workspaceId and entryId undefined fallbacks via direct handler execution", async () => {
  const app = buildApp();
  const handler = extractRouteHandler(app, "get", "/api/admin/v1/workspaces/:workspaceId/seo/entries/:entryId");

  // workspaceId undefined -> `String(undefined ?? "") !== deps.workspaceId` -> 404
  {
    const { res, capture } = createCapturingResponse();
    const req = { params: { workspaceId: undefined, entryId: ENTRY_ID } } as unknown as Parameters<typeof handler>[0];
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
