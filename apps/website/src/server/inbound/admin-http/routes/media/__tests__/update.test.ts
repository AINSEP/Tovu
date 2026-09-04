import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminMediaUpdateRoute } from "../update.js";
import type { MediaRouteDeps } from "../deps.js";

/**
 * @file Unit-tier coverage for `PATCH .../media/:mediaId` (`registerAdminMediaUpdateRoute`), same
 * pattern as `providers.test.ts`: bare Express app, stubbed `res.locals.principal`, real in-memory
 * repos narrowed out of `createRouteDeps()`.
 *
 * Regression focus: explicit `null` on `alt`/`caption`/`credit` must CLEAR the field (route maps it
 * to `""`, which `updateMediaMetadata` already stores as the cleared representation) instead of the
 * pre-fix bug where `String(null)` stored the literal 3-character string `"null"`. `title: null` and
 * any non-string/non-null value on any of the four fields must 400 with an exact message rather than
 * silently coercing (`String({})` -> `"[object Object]"`) or silently no-opping.
 */

const WORKSPACE_ID = "workspace-local";

function buildApp(depsOverrides: Partial<MediaRouteDeps> = {}): express.Express {
  const base = createRouteDeps();
  const deps: MediaRouteDeps = {
    workspaceId: base.workspaceId,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: base.clock,
    idGen: base.idGen,
    mediaRepo: base.mediaRepo,
    assetBlobRepo: base.assetBlobRepo,
    assetRenditionRepo: base.assetRenditionRepo,
    blobStore: base.blobStore,
    mediaContentTypeStore: base.mediaContentTypeStore,
    transformDefinitionRepo: base.transformDefinitionRepo,
    imageTransformer: base.imageTransformer,
    ...depsOverrides,
  };
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminMediaUpdateRoute(app, deps);
  return app;
}

/** Seeds one media row directly through the repo so PATCH has something to update. */
async function seedMedia(
  deps: MediaRouteDeps,
  overrides: { title?: string; alt?: string; caption?: string; credit?: string } = {}
): Promise<string> {
  const id = deps.idGen.newId();
  const nowIso = deps.clock.nowIso();
  await deps.mediaRepo.save({
    id,
    workspaceId: WORKSPACE_ID,
    title: overrides.title ?? "Original Title",
    alt: overrides.alt ?? "Original alt text",
    caption: overrides.caption ?? "Original caption",
    credit: overrides.credit ?? "Original credit",
    source: { sha256: "a".repeat(64) },
    status: "active",
    createdAt: nowIso,
    updatedAt: nowIso,
    version: 1,
    width: null,
    height: null,
    cssClass: null,
  });
  return id;
}

async function patch(
  t: import("node:test").TestContext,
  app: express.Express,
  mediaId: string,
  body: unknown
) {
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/media/${mediaId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

test("update: alt: null clears the field to empty string", async (t) => {
  const base = createRouteDeps();
  const app = buildApp({
    mediaRepo: base.mediaRepo,
    assetBlobRepo: base.assetBlobRepo,
    assetRenditionRepo: base.assetRenditionRepo,
    blobStore: base.blobStore,
    mediaContentTypeStore: base.mediaContentTypeStore,
    transformDefinitionRepo: base.transformDefinitionRepo,
    imageTransformer: base.imageTransformer,
    idGen: base.idGen,
    clock: base.clock,
  });
  const id = await seedMedia(base);
  const { status, json } = await patch(t, app, id, { alt: null });
  assert.equal(status, 200);
  assert.equal(json.media.alt, "");
});

test("update: caption: null clears the field to empty string", async (t) => {
  const base = createRouteDeps();
  const app = buildApp({
    mediaRepo: base.mediaRepo,
    assetBlobRepo: base.assetBlobRepo,
    assetRenditionRepo: base.assetRenditionRepo,
    blobStore: base.blobStore,
    mediaContentTypeStore: base.mediaContentTypeStore,
    transformDefinitionRepo: base.transformDefinitionRepo,
    imageTransformer: base.imageTransformer,
    idGen: base.idGen,
    clock: base.clock,
  });
  const id = await seedMedia(base);
  const { status, json } = await patch(t, app, id, { caption: null });
  assert.equal(status, 200);
  assert.equal(json.media.caption, "");
});

test("update: credit: null clears the field to empty string", async (t) => {
  const base = createRouteDeps();
  const app = buildApp({
    mediaRepo: base.mediaRepo,
    assetBlobRepo: base.assetBlobRepo,
    assetRenditionRepo: base.assetRenditionRepo,
    blobStore: base.blobStore,
    mediaContentTypeStore: base.mediaContentTypeStore,
    transformDefinitionRepo: base.transformDefinitionRepo,
    imageTransformer: base.imageTransformer,
    idGen: base.idGen,
    clock: base.clock,
  });
  const id = await seedMedia(base);
  const { status, json } = await patch(t, app, id, { credit: null });
  assert.equal(status, 200);
  assert.equal(json.media.credit, "");
});

test("update: title: null is rejected with 400 and an exact message (title cannot be cleared)", async (t) => {
  const base = createRouteDeps();
  const app = buildApp({
    mediaRepo: base.mediaRepo,
    assetBlobRepo: base.assetBlobRepo,
    assetRenditionRepo: base.assetRenditionRepo,
    blobStore: base.blobStore,
    mediaContentTypeStore: base.mediaContentTypeStore,
    transformDefinitionRepo: base.transformDefinitionRepo,
    imageTransformer: base.imageTransformer,
    idGen: base.idGen,
    clock: base.clock,
  });
  const id = await seedMedia(base);
  const { status, json } = await patch(t, app, id, { title: null });
  assert.equal(status, 400);
  assert.equal(json.error, "media.title cannot be cleared to null; title is required and cannot be empty");
});

test("update: alt: {} (non-string, non-null) is rejected with 400 and an exact message", async (t) => {
  const base = createRouteDeps();
  const app = buildApp({
    mediaRepo: base.mediaRepo,
    assetBlobRepo: base.assetBlobRepo,
    assetRenditionRepo: base.assetRenditionRepo,
    blobStore: base.blobStore,
    mediaContentTypeStore: base.mediaContentTypeStore,
    transformDefinitionRepo: base.transformDefinitionRepo,
    imageTransformer: base.imageTransformer,
    idGen: base.idGen,
    clock: base.clock,
  });
  const id = await seedMedia(base);
  const { status, json } = await patch(t, app, id, { alt: {} });
  assert.equal(status, 400);
  assert.equal(json.error, "media.alt must be a string or null, got object");
});

test("update: caption: [1,2] (array) is rejected with 400 and an exact message", async (t) => {
  const base = createRouteDeps();
  const app = buildApp({
    mediaRepo: base.mediaRepo,
    assetBlobRepo: base.assetBlobRepo,
    assetRenditionRepo: base.assetRenditionRepo,
    blobStore: base.blobStore,
    mediaContentTypeStore: base.mediaContentTypeStore,
    transformDefinitionRepo: base.transformDefinitionRepo,
    imageTransformer: base.imageTransformer,
    idGen: base.idGen,
    clock: base.clock,
  });
  const id = await seedMedia(base);
  const { status, json } = await patch(t, app, id, { caption: [1, 2] });
  assert.equal(status, 400);
  assert.equal(json.error, "media.caption must be a string or null, got array");
});

test("update: each field omitted leaves the existing value unchanged", async (t) => {
  const base = createRouteDeps();
  const app = buildApp({
    mediaRepo: base.mediaRepo,
    assetBlobRepo: base.assetBlobRepo,
    assetRenditionRepo: base.assetRenditionRepo,
    blobStore: base.blobStore,
    mediaContentTypeStore: base.mediaContentTypeStore,
    transformDefinitionRepo: base.transformDefinitionRepo,
    imageTransformer: base.imageTransformer,
    idGen: base.idGen,
    clock: base.clock,
  });
  const id = await seedMedia(base, {
    title: "Keep Title",
    alt: "Keep alt",
    caption: "Keep caption",
    credit: "Keep credit",
  });
  const { status, json } = await patch(t, app, id, {});
  assert.equal(status, 200);
  assert.equal(json.media.title, "Keep Title");
  assert.equal(json.media.alt, "Keep alt");
  assert.equal(json.media.caption, "Keep caption");
  assert.equal(json.media.credit, "Keep credit");
});

test("update: a normal string value is stored trimmed", async (t) => {
  const base = createRouteDeps();
  const app = buildApp({
    mediaRepo: base.mediaRepo,
    assetBlobRepo: base.assetBlobRepo,
    assetRenditionRepo: base.assetRenditionRepo,
    blobStore: base.blobStore,
    mediaContentTypeStore: base.mediaContentTypeStore,
    transformDefinitionRepo: base.transformDefinitionRepo,
    imageTransformer: base.imageTransformer,
    idGen: base.idGen,
    clock: base.clock,
  });
  const id = await seedMedia(base);
  const { status, json } = await patch(t, app, id, { alt: "  A mountain at dawn  " });
  assert.equal(status, 200);
  assert.equal(json.media.alt, "A mountain at dawn");
});
