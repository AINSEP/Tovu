import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createSitemapService, type SeoMeta } from "@jini-ai/cms/seo";
import { createSeoDeps } from "#src/features/seo/index";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";
import { InMemoryPostRepo, ROOT_SLUG } from "#src/features/post/index";
import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";
import type { MediaRecord } from "#src/features/media/index";
import type { VerifiedOrigin } from "@jini-ai/http-kit/verified-origin";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import {
  createCapturingResponse,
  extractRouteHandler,
  startTestServer,
} from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminSeoPutEntryRoute } from "../put-entry.js";
import type { SeoRouteDeps } from "../deps.js";

/**
 * @file Unit-tier coverage for `PUT .../seo/entries/:entryId` (`registerAdminSeoPutEntryRoute`).
 * Same bare-app + stubbed-principal + real-in-memory-repos pattern as
 * `admin/integrations/__tests__/create.test.ts`. `deps.postRepo` is the real `InMemoryPostRepo`
 * narrowed out of `createRouteDeps()`, seeded with `post-home` (a real seeded post id).
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
  registerAdminSeoPutEntryRoute(app, deps);
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

test("put-entry: mismatched workspaceId 404s", async (t) => {
  const app = buildApp();
  const { status } = await put(t, app, { title: "x" }, `/api/admin/v1/workspaces/not-real/seo/entries/${ENTRY_ID}`);
  assert.equal(status, 404);
});

test("put-entry: forbidden 403s", async (t) => {
  const base = createRouteDeps();
  await base.seoReady;
  const before = await base.postRepo.findById({ workspaceId: WORKSPACE_ID, id: ENTRY_ID });
  assert.ok(before);
  const app = buildApp({ postRepo: base.postRepo, authorize: async () => ({ allowed: false, reason: "no grant" }) });
  const { status } = await put(t, app, { title: "x" });
  assert.equal(status, 403);
  assert.deepEqual(await base.postRepo.findById({ workspaceId: WORKSPACE_ID, id: ENTRY_ID }), before);
});

test("put-entry: an unregistered field 400s (SEO_FIELD_VALIDATION_ERROR)", async (t) => {
  const app = buildApp();
  const { status, json } = await put(t, app, { notARealField: "x" });
  assert.equal(status, 400);
  assert.equal((json as { code?: string }).code, "SEO_FIELD_VALIDATION_ERROR");
});

test("put-entry: an unsafe canonical URL scheme 400s (SEO_INVALID_CANONICAL_URL)", async (t) => {
  const app = buildApp();
  const { status, json } = await put(t, app, { canonical: "javascript:alert(1)" });
  assert.equal(status, 400);
  assert.equal((json as { code?: string }).code, "SEO_INVALID_CANONICAL_URL");
});

test("put-entry: an unknown entry id 404s (SEO_ENTRY_NOT_FOUND)", async (t) => {
  const app = buildApp();
  const { status, json } = await put(t, app, { title: "x" }, `/api/admin/v1/workspaces/${WORKSPACE_ID}/seo/entries/does-not-exist`);
  assert.equal(status, 404);
  assert.equal((json as { code?: string }).code, "SEO_ENTRY_NOT_FOUND");
});

test("put-entry: a trashed entry returns 409 ENTITY_IN_TRASH without changing its SEO", async (t) => {
  const post = buildPostRecord({
    id: ENTRY_ID, workspaceId: WORKSPACE_ID, deletedAt: "2026-10-16T00:00:00.000Z",
    seoExtJson: JSON.stringify({ title: "Before trash" }), version: 4,
  });
  const before = structuredClone(post);
  const postRepo = new InMemoryPostRepo([post]);
  const { status, json } = await put(t, buildApp({ postRepo }), { title: "Refused title" });

  assert.equal(status, 409);
  assert.deepEqual(json, {
    error: `ENTITY_IN_TRASH: post '${ENTRY_ID}' is in the Trash. Restore it from the Trash before changing it.`,
    code: "ENTITY_IN_TRASH",
  });
  assert.deepEqual(await postRepo.findById({ workspaceId: WORKSPACE_ID, id: ENTRY_ID }), before);
});

test("put-entry: a valid patch succeeds (200) and the meta reflects it", async (t) => {
  const base = createRouteDeps();
  await base.seoReady;
  const before = await base.postRepo.findById({ workspaceId: WORKSPACE_ID, id: ENTRY_ID });
  assert.ok(before);
  const app = buildApp({ postRepo: base.postRepo });
  const { status, json } = await put(t, app, { title: "New SEO Title", noindex: true });
  assert.equal(status, 200, JSON.stringify(json));
  const body = json as { data: { title?: string; robots?: { noindex?: boolean } } };
  assert.equal(body.data.title, "New SEO Title");
  assert.equal(body.data.robots?.noindex, true);
  const saved = await base.postRepo.findById({ workspaceId: WORKSPACE_ID, id: ENTRY_ID });
  assert.ok(saved);
  assert.deepEqual(JSON.parse(saved.seoExtJson!), { title: "New SEO Title", noindex: true });
  assert.equal(saved.title, before.title);
});

for (const source of ["library", "external"] as const) {
  test(`put-entry: a title-only patch returns the ${source} content image without saving an image override`, async (t) => {
    const base = createRouteDeps();
    await base.siteTitleReady;
    const now = "2026-10-16T00:00:00.000Z";
    const external = "https://external.example/body.jpg";
    const post = buildPostRecord({
      id: ENTRY_ID, workspaceId: WORKSPACE_ID, title: "Landing", slug: ROOT_SLUG, kind: "page",
      featuredMediaId: null, seoExtJson: null,
      bodyJson: { type: "doc", content: [source === "library"
        ? { type: "media", attrs: { assetId: "body" } }
        : { type: "image", attrs: { src: external } }] },
    });
    const postRepo = new InMemoryPostRepo([post]);
    const before = structuredClone(post);
    const asset: MediaRecord = {
      id: "body", workspaceId: WORKSPACE_ID, title: "Body", slug: "body", alt: "", caption: "", credit: "",
      source: { sha256: "body-sha" }, status: "active", createdAt: now, updatedAt: now,
      version: 1, width: 1400, height: 800, cssClass: null, htmlAttributes: null,
    };
    await base.mediaRepo.save(asset);
    await base.mediaContentTypeStore.set({ workspaceId: WORKSPACE_ID, sha256: "body-sha", contentType: "image/png" });
    const seoDeps = createSeoDeps({ deps: { ...base, postRepo } });
    const getSettings = seoDeps.settings.getSeoSettings;
    seoDeps.settings = { ...seoDeps.settings, getSeoSettings: async (input) => ({
      ...await getSettings(input), defaultOgImage: "https://seo.example.com/tovu-share-card.png",
    }) };
    seoDeps.originRegistry = { ...base.originRegistry, canonicalOrigin: async () => ({
      scheme: "https", host: "seo.example.com", source: "workspace-setting", verifiedAt: now,
    } satisfies VerifiedOrigin) };
    seoDeps.media.transformDefinitionRepo = { listByName: async ({ name, workspaceId }) => [{
      id: name, workspaceId, name, version: 1, params: { format: "jpeg", width: 1200, height: 630, fit: "cover" }, owner: "core", createdAt: now,
    }] };
    const { status, json } = await put(t, buildApp({ postRepo, seoDeps }), { title: "New SEO Title" });
    assert.equal(status, 200, JSON.stringify(json));
    const meta = (json as { data: SeoMeta }).data;
    assert.equal(meta.title, "New SEO Title");
    assert.equal(meta.openGraph.imageRef, source === "library" ? "body:public" : external);
    assert.equal(meta.openGraph.image, source === "library" ? "https://seo.example.com/m/body/og.v1/image.jpg" : external);
    assert.equal(meta.openGraph.imageSource, "content");
    assert.equal("imageOverridden" in meta.openGraph, false);
    const saved = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: ENTRY_ID });
    assert.ok(saved);
    assert.deepEqual(JSON.parse(saved.seoExtJson!), { title: "New SEO Title" });
    assert.equal(saved.featuredMediaId, before.featuredMediaId);
    assert.deepEqual(saved.bodyJson, before.bodyJson);
  });
}

test("put-entry: a request with no body at all still succeeds as a real empty patch (express.json() itself always defaults req.body to {}, confirmed by direct check -- see the type-bypass test below for the `req.body ?? {}` branch this does NOT reach)", async (t) => {
  const app = buildApp();
  const baseUrl = await startTestServer(app, t);
  // No `content-type` header and no `body`. Verified directly (a throwaway probe app) that
  // `express.json()` sets `req.body` to `{}` even for a request it doesn't parse as JSON -- it
  // never leaves `req.body` as `undefined` -- so this exercises the same "value present" branch
  // outcome as every other test here, just via an empty object instead of an empty JSON body.
  const res = await fetch(`${baseUrl}${PATH}`, { method: "PUT" });
  const json = (await res.json().catch(() => ({}))) as { data?: { title?: string } };
  assert.equal(res.status, 200, JSON.stringify(json));
  assert.ok(json.data, "an empty patch must still return the entry's current (unchanged) meta");
});

test("put-entry: workspaceId/entryId params, and req.body itself, can never actually be undefined through this app's real composition (a matched `:param` segment is always a populated string, and the global `express.json()` in app.ts always defaults req.body to `{}`) -- their `?? \"\"`/`?? {}` fallbacks are reached by calling the real handler directly, the same type-bypass technique a `default: throw` exhaustiveness guard would need", async (t) => {
  const app = buildApp();
  const handler = extractRouteHandler(app, "put", "/api/admin/v1/workspaces/:workspaceId/seo/entries/:entryId");

  // workspaceId undefined -> `String(undefined ?? "") !== deps.workspaceId` -> the mismatch 404.
  {
    const { res, capture } = createCapturingResponse();
    const req = { params: { workspaceId: undefined, entryId: ENTRY_ID }, body: { title: "x" } } as unknown as Parameters<
      typeof handler
    >[0];
    await handler(req, res);
    assert.equal(capture.statusCode, 404);
    assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
  }

  // entryId undefined -> `String(undefined ?? "")` resolves to "", which no real post ever has as
  // its id, surfacing `setEntrySeoOverrides`'s own real `SeoEntryNotFoundError` -> 404.
  {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "test-principal" };
    const req = {
      params: { workspaceId: WORKSPACE_ID, entryId: undefined },
      body: { title: "x" },
    } as unknown as Parameters<typeof handler>[0];
    await handler(req, res);
    assert.equal(capture.statusCode, 404);
    assert.deepEqual(capture.jsonBody, { error: "entry '' was not found", code: "SEO_ENTRY_NOT_FOUND" });
  }

  // req.body itself undefined -> `req.body ?? {}` resolves to `{}`, an empty (no-op) patch that
  // still 200s with the entry's unchanged current meta -- the same real behavior as the "no body
  // at all" HTTP test above, but this is the only way to make `req.body` itself literally
  // `undefined`, since `express.json()` always substitutes `{}` for any real request it sees.
  {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "test-principal" };
    const req = {
      params: { workspaceId: WORKSPACE_ID, entryId: ENTRY_ID },
      body: undefined,
    } as unknown as Parameters<typeof handler>[0];
    await handler(req, res);
    assert.equal(capture.statusCode, 200, JSON.stringify(capture.jsonBody));
    const body = capture.jsonBody as { data: { title?: string } };
    assert.ok(body.data, "an empty patch must still return the entry's current (unchanged) meta");
  }
});

test("put-entry: an unexpected repo failure 500s", async (t) => {
  const base = createRouteDeps();
  await base.seoReady;
  const before = await base.postRepo.findById({ workspaceId: WORKSPACE_ID, id: ENTRY_ID });
  let reached = false;
  t.mock.method(base.postRepo, "saveIfVersion", async () => {
    reached = true;
    throw new Error("boom");
  });
  const app = buildApp({ postRepo: base.postRepo });
  const { status, json } = await put(t, app, { title: "x" });
  assert.equal(status, 500);
  assert.deepEqual(json, { error: "internal error", code: "INTERNAL_ERROR" });
  assert.equal(reached, true, "the conditional write must be the failing operation");
  assert.deepEqual(await base.postRepo.findById({ workspaceId: WORKSPACE_ID, id: ENTRY_ID }), before);
});

test("put-entry: losing the row to another writer on every merge attempt 409s (SEO_CONCURRENT_WRITE) without writing", async (t) => {
  const base = createRouteDeps();
  await base.seoReady;
  const before = await base.postRepo.findById({ workspaceId: WORKSPACE_ID, id: ENTRY_ID });
  // Every conditional write reports a lost race (another save bumped the version first).
  const lostRace = t.mock.method(base.postRepo, "saveIfVersion", async () => ({ applied: false }));
  const app = buildApp({ postRepo: base.postRepo });
  const { status, json } = await put(t, app, { title: "x" });
  assert.equal(status, 409);
  assert.deepEqual(json, {
    error: `entry '${ENTRY_ID}' is being written by another save; the SEO overrides were not applied`,
    code: "SEO_CONCURRENT_WRITE",
  });
  assert.equal(lostRace.mock.callCount(), 3, "the merge retries until MAX_MERGE_ATTEMPTS reads all lose the row");
  assert.deepEqual(await base.postRepo.findById({ workspaceId: WORKSPACE_ID, id: ENTRY_ID }), before);
});
