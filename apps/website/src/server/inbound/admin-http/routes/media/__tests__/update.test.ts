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
  overrides: { title?: string; slug?: string; alt?: string; caption?: string; credit?: string; htmlAttributes?: string | null } = {}
): Promise<string> {
  const id = deps.idGen.newId();
  const nowIso = deps.clock.nowIso();
  await deps.mediaRepo.save({
    id,
    workspaceId: WORKSPACE_ID,
    title: overrides.title ?? "Original Title",
    slug: overrides.slug ?? `original-slug-${id}`,
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
    htmlAttributes: overrides.htmlAttributes ?? null,
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

// ---------------------------------------------------------------------------
// Error-mapping characterization, added 2026-09-16 ahead of extracting the route handler's inline
// instanceof chain into `mapMediaUpdateError` (source-complexity-drift ceiling). The 404 branch had
// no coverage at all before this — every existing test above only reaches 200/400/409.
// ---------------------------------------------------------------------------

test("update: a nonexistent mediaId is rejected with 404 naming it, not 500 or a silent no-op", async (t) => {
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
  const { status, json } = await patch(t, app, "no-such-media-id", { alt: "does not matter" });
  assert.equal(status, 404);
  assert.equal(json.error, "media 'no-such-media-id' was not found");
});

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

// ---------------------------------------------------------------------------
// slug (2026-09-07) — PATCH-route coverage. `parseMediaMetadataPatch` reading `body.slug` is what
// closes the exact silent-drop trap this route used to have for any unrecognized key (a 200 with
// every OTHER field applied, and the new one never persisted) — every assertion below reads the
// PERSISTED value back through the repo, never just the response status, per that same trap.
// ---------------------------------------------------------------------------

test("update: slug is persisted — asserted by re-reading the repo, not just a 200 status (closes the silent-drop trap)", async (t) => {
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
  const id = await seedMedia(base, { slug: "old-slug" });
  const { status, json } = await patch(t, app, id, { slug: "Woodnest-Cabin-Booking" });
  assert.equal(status, 200);
  assert.equal(json.media.slug, "woodnest-cabin-booking", "normalized to lowercase, and present in the response DTO");

  const persisted = await base.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id });
  assert.equal(persisted?.slug, "woodnest-cabin-booking", "the repo's own state, not just the echoed response");
});

test("update: a slug already claimed by ANOTHER row in the same workspace is refused with 409, naming the conflict — and neither row's slug changes", async (t) => {
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
  const takenId = await seedMedia(base, { slug: "cabin-booking" });
  const id = await seedMedia(base, { slug: "other-asset" });

  const { status, json } = await patch(t, app, id, { slug: "cabin-booking" });
  assert.equal(status, 409);
  assert.match(json.error, /cabin-booking/, "the error must name the conflicting slug, not a generic message");

  const persisted = await base.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id });
  assert.equal(persisted?.slug, "other-asset", "the rejected row's slug must be untouched");
  const persistedTaken = await base.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id: takenId });
  assert.equal(persistedTaken?.slug, "cabin-booking", "the row that already owns the slug must be untouched too");
});

test("update: re-submitting a row's OWN current slug alongside another field change is not a self-conflict", async (t) => {
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
  const id = await seedMedia(base, { slug: "stable-slug" });
  const { status, json } = await patch(t, app, id, { slug: "stable-slug", alt: "new alt" });
  assert.equal(status, 200);
  assert.equal(json.media.slug, "stable-slug");
  assert.equal(json.media.alt, "new alt");
});

test("update: a malformed slug (uppercase/space/symbol) is rejected with 400 naming the reason, not silently accepted or dropped", async (t) => {
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
  const id = await seedMedia(base, { slug: "original-slug" });
  const { status, json } = await patch(t, app, id, { slug: "not a valid slug!" });
  assert.equal(status, 400);
  assert.match(json.error, /lowercase letters, numbers, and dashes/);

  const persisted = await base.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id });
  assert.equal(persisted?.slug, "original-slug", "a rejected slug must not partially land");
});

test("update: renaming the title alone leaves the slug untouched, end to end through the route", async (t) => {
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
  const id = await seedMedia(base, { title: "Old Title", slug: "old-title" });
  const { status, json } = await patch(t, app, id, { title: "Brand New Title" });
  assert.equal(status, 200);
  assert.equal(json.media.title, "Brand New Title");
  assert.equal(json.media.slug, "old-title", "slug is a separate field — a title-only PATCH must never recompute it");
});

// ---------------------------------------------------------------------------
// htmlAttributes (2026-09-07) — server-side enforcement of the html-attributes.ts allowlist,
// end to end through this route. Every assertion reads the PERSISTED value back through the repo,
// same trap-closing discipline the slug tests above use, since `parseMediaMetadataPatch` silently
// dropping an unrecognized key is a confirmed prior defect in this exact function.
// ---------------------------------------------------------------------------

function buildMediaApp(base: ReturnType<typeof createRouteDeps>): express.Express {
  return buildApp({
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
}

test("update: a valid htmlAttributes value is persisted — asserted by re-reading the repo, not just the response", async (t) => {
  const base = createRouteDeps();
  const app = buildMediaApp(base);
  const id = await seedMedia(base);
  const { status, json } = await patch(t, app, id, { htmlAttributes: 'data-motion="fade-in" loading="lazy"' });
  assert.equal(status, 200);
  assert.equal(json.media.htmlAttributes, 'data-motion="fade-in" loading="lazy"');

  const persisted = await base.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id });
  assert.equal(persisted?.htmlAttributes, 'data-motion="fade-in" loading="lazy"');
});

test("update: an on* handler in htmlAttributes is rejected with 400 naming it, and NOTHING in the same request persists", async (t) => {
  const base = createRouteDeps();
  const app = buildMediaApp(base);
  const id = await seedMedia(base, { title: "Keep Me" });
  const { status, json } = await patch(t, app, id, { title: "Should Not Save", htmlAttributes: 'onerror="alert(1)"' });
  assert.equal(status, 400);
  assert.match(json.error, /onerror/);

  const persisted = await base.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id });
  assert.equal(persisted?.title, "Keep Me", "a rejected htmlAttributes value must not let another field in the same PATCH persist");
  assert.equal(persisted?.htmlAttributes, null);
});

test("update: a javascript: value on an otherwise-allowed name is rejected with 400", async (t) => {
  const base = createRouteDeps();
  const app = buildMediaApp(base);
  const id = await seedMedia(base);
  const { status, json } = await patch(t, app, id, { htmlAttributes: 'poster="javascript:alert(1)"' });
  assert.equal(status, 400);
  assert.match(json.error, /javascript:/);
});

test("update: a disallowed attribute name is rejected with 400, naming it", async (t) => {
  const base = createRouteDeps();
  const app = buildMediaApp(base);
  const id = await seedMedia(base);
  const { status, json } = await patch(t, app, id, { htmlAttributes: 'style="color:red"' });
  assert.equal(status, 400);
  assert.match(json.error, /style/);
});

test("update: htmlAttributes: null clears a previously-set value back to null", async (t) => {
  const base = createRouteDeps();
  const app = buildMediaApp(base);
  const id = await seedMedia(base, { htmlAttributes: "muted" });
  const { status, json } = await patch(t, app, id, { htmlAttributes: null });
  assert.equal(status, 200);
  assert.equal(json.media.htmlAttributes, null);
});

test("update: omitting htmlAttributes leaves a previously-set value unchanged", async (t) => {
  const base = createRouteDeps();
  const app = buildMediaApp(base);
  const id = await seedMedia(base, { htmlAttributes: "muted" });
  const { status, json } = await patch(t, app, id, { alt: "unrelated change" });
  assert.equal(status, 200);
  assert.equal(json.media.htmlAttributes, "muted");
  assert.equal(json.media.alt, "unrelated change");
});

test("update: a trashed media row is refused with 409 ENTITY_IN_TRASH and left unchanged (S8, web-high fix plan)", async (t) => {
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
  const seeded = await base.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id });
  assert.ok(seeded);
  await base.mediaRepo.save({ ...seeded, status: "trashed" });

  const { status, json } = await patch(t, app, id, { alt: "x" });
  assert.equal(status, 409);
  assert.equal(json.code, "ENTITY_IN_TRASH");
  assert.equal(json.error, `ENTITY_IN_TRASH: media '${id}' is in the Trash. Restore it from the Trash before changing it.`);
  const after = await base.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id });
  assert.equal(after?.alt, "Original alt text");
});
