import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import { ForbiddenError } from "@jini-ai/cms/core";

import { createSurfaceExchangeStore, type SurfaceExchangeStore } from "../../../contracts/core/tool-surface-exchanges.js";
import { InMemoryAssetBlobRepo, InMemoryAssetRenditionRepo, InMemoryBlobStore, InMemoryMediaRepo } from "../index.js";
import { makeRemoveMediaDouble, type RecordedMediaRemoval } from "./remove-media-double.js";
import {
  buildMediaRegistrationsForTovu,
  type MediaPublicUrlDeps,
  type MediaToolDeps,
  type MediaTrashToolDeps,
} from "../tool-registrations.js";

/** Owner policy: reversible removal runs immediately; authorization and data integrity remain enforced. */

const WORKSPACE_ID = "ws-media-trash-confirm";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-08-20T00:00:00.000Z";
const TRASH_TOOL_ID = "media_trash_asset";

const ONE_PIXEL_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function makeDeps(options: { allow?: boolean; allowedPermissions?: string[]; mediaRepo?: InMemoryMediaRepo } = {}): MediaToolDeps &
  MediaPublicUrlDeps &
  MediaTrashToolDeps & { removed: RecordedMediaRemoval[] } {
  let counter = 0;
  const authorize: MediaToolDeps["authorize"] = async (request) =>
    options.allow === false || (options.allowedPermissions && !options.allowedPermissions.includes(request.permission))
      ? { allowed: false, reason: "insufficient_permission" as const }
      : { allowed: true, reason: "matched" as const };
  const mediaRepo = options.mediaRepo ?? new InMemoryMediaRepo();
  const { removeMedia, removed } = makeRemoveMediaDouble(mediaRepo);
  return {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    mediaRepo,
    removeMedia,
    removed,
    assetBlobRepo: new InMemoryAssetBlobRepo(),
    assetRenditionRepo: new InMemoryAssetRenditionRepo(),
    blobStore: new InMemoryBlobStore(),
    authorize,
  };
}

function buildRegistrations(deps: MediaToolDeps & MediaPublicUrlDeps & MediaTrashToolDeps, surfaceExchanges: SurfaceExchangeStore): Map<string, ToolRegistration> {
  return new Map(buildMediaRegistrationsForTovu(deps, { surfaceExchanges }).map((r) => [r.descriptor.id, r]));
}

function tool(registrations: Map<string, ToolRegistration>, id: string): ToolRegistration {
  const found = registrations.get(id);
  assert.ok(found, `expected '${id}' to be wired`);
  return found;
}

interface CallOptions {
  input?: unknown;
  emitSurface?: SurfaceEmitter;
  signal?: AbortSignal;
}

function call(registration: ToolRegistration, options: CallOptions = {}) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input: options.input ?? {},
    signal: options.signal ?? new AbortController().signal,
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  };
  return registration.handler(ctx);
}


/** Seed via the real upload registration, including blobs and rendition state. */
async function seedMediaAsset(deps: MediaToolDeps & MediaPublicUrlDeps & MediaTrashToolDeps, surfaces: SurfaceExchangeStore) {
  const result = await call(tool(buildRegistrations(deps, surfaces), "media_upload_asset"), {
    input: { filename: "logo.png", contentType: "image/png", dataBase64: ONE_PIXEL_PNG_BASE64 },
  }) as { media: { id: string; title: string; slug: string } };
  return result.media;
}

test("media.delete is checked before any dialog is raised, and a denied principal never sees one", async () => {
  const seedDeps = makeDeps();
  const seedSurfaces = createSurfaceExchangeStore();
  const asset = await seedMediaAsset(seedDeps, seedSurfaces);
  const deps = makeDeps({ allowedPermissions: ["media.upload", "media.read"], mediaRepo: seedDeps.mediaRepo });
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  let emissions = 0;
  await assert.rejects(
    () => call(trashTool, { input: { mediaId: asset.id }, emitSurface: async () => { emissions++; } }),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenError, `expected ForbiddenError, got ${String(error)}`);
      assert.equal(error.permission, "media.delete");
      return true;
    },
  );
  assert.equal(emissions, 0);
  assert.equal(surfaceExchanges.size(), 0, "a denied principal must never get a dialog opened for them");

  const row = await deps.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id: asset.id });
  assert.equal(row?.status, "active", "nothing may be written ahead of the permission gate");
});

test("a nonexistent media id is refused before any dialog is raised", async () => {
  const deps = makeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  await assert.rejects(() => call(trashTool, { input: { mediaId: "nope" } }), /was not found/);
  assert.equal(surfaceExchanges.size(), 0);
});

test("n06: reversible removal runs without a confirmation channel", async () => {
  const deps = makeDeps();
  const store = createSurfaceExchangeStore();
  const asset = await seedMediaAsset(deps, store);
  const result = await call(tool(buildRegistrations(deps, store), TRASH_TOOL_ID), {input: {mediaId: asset.id}}) as {trashed: boolean; media: {status: string}};
  assert.equal(result.trashed, true);
  assert.equal(result.media.status, "trashed");
  assert.equal(deps.removed.length, 1);
  assert.equal(deps.removed[0].id, asset.id);
  assert.equal(store.size(), 0);
});
