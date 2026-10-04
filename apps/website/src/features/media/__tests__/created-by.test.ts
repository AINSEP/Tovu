import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqlMediaRepo, SqlAssetBlobRepo } from "#src/platform/db/repos/media-repo";
import { listColumns } from "#src/platform/db/kernel/dialect";
import { InMemoryVersionedMediaRepo, InMemoryAssetBlobRepo, InMemoryAssetRenditionRepo,
  InMemoryBlobStore, uploadMedia, updateMediaMetadata, type MediaRecord } from "../index.js";
import { toAdminMediaResponse } from "#src/server/inbound/admin-http/http/media";
import { duplicateMediaAsset } from "../duplicate-asset.js";
import { buildMediaRegistrationsForTovu } from "../tool-registrations.js";
import { createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";

/** Owner dispatch 2026-10-04; SPEC: staged/m-media-createdby/SPEC.md. No live schema edits. */
function row(optional: Partial<MediaRecord> = {}): MediaRecord {
  return { id: "asset", workspaceId: "creator-ws", title: "Photo", slug: "photo", alt: "", caption: "",
    credit: "Generated with Higgsfield", source: { sha256: "a".repeat(64) }, status: "active",
    createdAt: "2026-10-04T00:00:00Z", updatedAt: "2026-10-04T00:00:00Z", version: 1,
    width: null, height: null, cssClass: null, htmlAttributes: null, ...optional };
}

test("compatibility upload attributes separate assets sharing bytes to their own actors", async () => {
  let id = 0;
  const deps = { clock: { nowMs: () => Date.parse("2026-10-04T00:00:00Z") },
    idGen: { newId: () => `created-by-${++id}` }, mediaRepo: new InMemoryVersionedMediaRepo(),
    blobRepo: new InMemoryAssetBlobRepo({}), renditionRepo: new InMemoryAssetRenditionRepo({}),
    blobStore: new InMemoryBlobStore() };
  for (const principal of ["owner", "user", "assistant-agent", "plugin-key"]) {
    const { media } = await uploadMedia({ deps, input: { workspaceId: "creator-ws",
      bytes: new Uint8Array([1, 2, 3]), filename: `${principal}.png`, contentType: "image/png",
      createdByPrincipal: principal } });
    assert.equal(media.createdBy, principal);
    assert.equal((await deps.mediaRepo.findById({ workspaceId: "creator-ws", id: media.id }))?.createdBy, principal);
    const edited = await updateMediaMetadata({ deps, input: { workspaceId: "creator-ws", id: media.id, credit: "Edited" } });
    assert.equal((edited.media as MediaRecord).createdBy, principal);
  }
  assert.equal((await deps.blobRepo.list({ workspaceId: "creator-ws" })).length, 1);
});

test("media copies attribute the new library entry to the copier while retaining one shared blob", async () => {
  let id = 0;
  const deps = { clock: { nowMs: () => Date.parse("2026-10-04T00:00:00Z") },
    idGen: { newId: () => `copy-creator-${++id}` }, mediaRepo: new InMemoryVersionedMediaRepo(),
    blobRepo: new InMemoryAssetBlobRepo({}), renditionRepo: new InMemoryAssetRenditionRepo({}),
    blobStore: new InMemoryBlobStore() };
  const { media: original } = await uploadMedia({ deps, input: { workspaceId: "creator-ws",
    bytes: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
    filename: "source.png", contentType: "image/png", createdByPrincipal: "source-owner" } });
  const result = await duplicateMediaAsset({ ...deps, workspaceId: "creator-ws",
    assetBlobRepo: deps.blobRepo, assetRenditionRepo: deps.renditionRepo,
    authorize: async () => ({ allowed: true, reason: "matched" }),
  }, { principalId: "copying-agent", id: original.id, overrides: {} }) as { media: MediaRecord };
  assert.notEqual(result.media.id, original.id);
  assert.equal(result.media.createdBy, "copying-agent");
  assert.equal((await deps.mediaRepo.findById({ workspaceId: "creator-ws", id: original.id }))?.createdBy, "source-owner");
  assert.equal((await deps.blobRepo.list({ workspaceId: "creator-ws" })).length, 1);
});

test("versioned memory writes preserve the original creator, including unknown legacy attribution", async () => {
  const repo = new InMemoryVersionedMediaRepo();
  await repo.save(row({ createdBy: "owner" }));
  await repo.save(row({ createdBy: "forged", version: 2 }));
  assert.equal((await repo.findById({ workspaceId: "creator-ws", id: "asset" }))?.createdBy, "owner");
  assert.deepEqual(await repo.saveIfVersion({ record: row({ createdBy: null, version: 3 }), ifVersion: 2 }), { applied: true });
  assert.equal((await repo.findById({ workspaceId: "creator-ws", id: "asset" }))?.createdBy, "owner");
  await repo.save(row({ id: "legacy", slug: "legacy" }));
  await repo.save(row({ id: "legacy", slug: "legacy", createdBy: "invented" }));
  assert.equal((await repo.findById({ workspaceId: "creator-ws", id: "legacy" }))?.createdBy ?? null, null);
});

test("one registered upload handler isolates attribution between concurrent actor calls", async () => {
  let id = 0;
  const deps = { workspaceId: "creator-ws", clock: { nowMs: () => Date.parse("2026-10-04T00:00:00Z") },
    idGen: { newId: () => `concurrent-creator-${++id}` }, mediaRepo: new InMemoryVersionedMediaRepo(),
    assetBlobRepo: new InMemoryAssetBlobRepo({}), assetRenditionRepo: new InMemoryAssetRenditionRepo({}),
    blobStore: new InMemoryBlobStore(), authorize: async () => ({ allowed: true, reason: "matched" }),
    removeMedia: async () => { assert.fail("unexpected removal"); },
  };
  const upload = buildMediaRegistrationsForTovu(deps, { surfaceExchanges: createSurfaceExchangeStore() })
    .find(tool => tool.descriptor.id === "media_upload_asset")!;
  await Promise.all(["owner", "plugin-agent"].map(async actor => {
    const result = await upload.handler({ executionId: `upload-${actor}`, principal: { id: actor },
      run: { id: "run" }, signal: new AbortController().signal,
      input: { filename: `${actor}.png`, contentType: "image/png", createdBy: "forged",
        dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" },
    }) as { media: { id: string; createdBy: string } };
    assert.equal(result.media.createdBy, actor);
    assert.equal((await deps.mediaRepo.findById({ workspaceId: "creator-ws", id: result.media.id }))?.createdBy, actor);
  }));
  assert.equal((await deps.assetBlobRepo.list({ workspaceId: "creator-ws" })).length, 1);
});

for (const adapter of eachDialect({ tables: ["media", "media_slug_history", "asset_blobs", "asset_renditions"], make: kernel => ({ kernel, repo: new SqlMediaRepo(kernel) }) })) {
  test(`[${adapter.name}] media works before migration and detects installation without recreating repo`, async () => {
    const { kernel, repo } = adapter.make();
    // The same regression suite remains runnable after the owner installs the staged patch.
    if ((await listColumns(kernel, "media")).some(column => column.name === "created_by")) {
      await kernel.execute(sql`ALTER TABLE media DROP COLUMN created_by`);
    }
    await repo.save(row({ createdBy: "before-install" }));
    const legacy = await repo.findById({ workspaceId: "creator-ws", id: "asset" });
    assert.equal(legacy?.createdBy ?? null, null);
    assert.equal(toAdminMediaResponse(legacy!, "image/png", null).createdBy, null);
    // Simulate the additive column on a disposable kernel; the staged migration has its own
    // install-time test so permanent product tests never depend on scratch artifact paths.
    await kernel.execute(sql`ALTER TABLE media ADD COLUMN created_by text`);
    try {
      // Existing rows stay unknown; no parsing of credit or attribution from shared blob rows.
      assert.equal((await repo.findById({ workspaceId: "creator-ws", id: "asset" }))?.createdBy ?? null, null);
      await repo.save(row({ id: "post-install", slug: "post-install", createdBy: "owner" }));
      await repo.insertIfAbsent(row({ id: "imported", slug: "imported", createdBy: "publishing-agent" }));
      assert.equal((await repo.findBySlug({ workspaceId: "creator-ws", slug: "imported" }))?.createdBy, "publishing-agent");
      assert.equal((await repo.list({ workspaceId: "creator-ws" })).find(asset => asset.id === "post-install")?.createdBy, "owner");
      await repo.save(row({ id: "post-install", slug: "renamed", createdBy: "forged", version: 2 }));
      assert.equal((await repo.findBySlug({ workspaceId: "creator-ws", slug: "post-install" }))?.createdBy, "owner");
      assert.deepEqual(await repo.saveIfVersion({ record: row({ id: "imported", slug: "imported", createdBy: null, version: 2 }), ifVersion: 1 }), { applied: true });
      assert.equal((await repo.findById({ workspaceId: "creator-ws", id: "imported" }))?.createdBy, "publishing-agent");
      assert.deepEqual(await repo.saveIfVersion({ record: row({ id: "imported", slug: "imported", createdBy: "forged", version: 3 }), ifVersion: 1 }), { applied: false });
      await new SqlAssetBlobRepo(kernel).save({ id: "replacement-blob", workspaceId: "creator-ws",
        sha256: "b".repeat(64), storageKey: "replacement-key", status: "active",
        createdAt: "2026-10-04T01:00:00Z", createdByPrincipal: "replacing-user" });
      assert.deepEqual(await repo.replaceFileIfVersion({ workspaceId: "creator-ws", id: "imported",
        ifVersion: 2, sha256: "b".repeat(64), storageKey: "replacement-key",
        originalRenditionId: "replacement-rendition", updatedAt: "2026-10-04T01:00:00Z" }), { applied: true });
      assert.equal((await repo.findById({ workspaceId: "creator-ws", id: "imported" }))?.createdBy, "publishing-agent");
      assert.equal(await repo.findById({ workspaceId: "another-ws", id: "imported" }), null);
    } finally {
      // PGlite is shared with the other case; leave its schema at the pre-install state.
      await kernel.execute(sql`ALTER TABLE media DROP COLUMN created_by`);
      if (adapter.name === "sqlite") await kernel.close();
    }
  });
}

test("admin DTO exposes known creator and unknown legacy values without reading credit", () => {
  assert.equal(toAdminMediaResponse(row({ createdBy: "plugin-key" }), "image/png", null).createdBy, "plugin-key");
  assert.equal(toAdminMediaResponse(row(), "image/png", null).createdBy, null);
});
