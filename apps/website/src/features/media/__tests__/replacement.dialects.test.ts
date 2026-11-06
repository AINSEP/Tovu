import assert from "node:assert/strict";
import test from "node:test";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqlMediaRepo, SqlAssetBlobRepo, SqlAssetRenditionRepo, SqlMediaContentTypeStore } from "#src/platform/db/repos/media-repo";
import type { MediaFileReplacementInput, MediaRecord } from "@jini-ai/cms/media";

const workspaceId = "replacement-workspace";
const prior: MediaRecord = { id: "photo", workspaceId, kind: "media", originalFilename: "original.jpg", createdBy: "creator",
  title: "Before", slug: "before", alt: "", caption: "", credit: "", source: { sha256: "a".repeat(64) },
  version: 3, status: "active", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  width: 10, height: 20, cssClass: null, htmlAttributes: null };
const input: MediaFileReplacementInput = { workspaceId, id: "photo", ifVersion: 3, sha256: "b".repeat(64), storageKey: "new-blob",
  originalRenditionId: "original", updatedAt: "2026-11-04T00:00:00.000Z", contentType: "image/jpeg", provenance: { kind: "upload" },
  metadata: { title: "After", slug: "after", alt: "New alt", caption: "New caption", credit: "New credit", width: 100,
    height: 200, cssClass: "new-class", htmlAttributes: 'loading="lazy"', status: "active" } };

for (const dialect of eachDialect({ tables: ["media", "media_slug_history", "asset_blobs", "asset_renditions"], make: kernel => ({
  repo: new SqlMediaRepo(kernel), blobs: new SqlAssetBlobRepo(kernel), renditions: new SqlAssetRenditionRepo(kernel), types: new SqlMediaContentTypeStore(kernel),
}) })) {
  async function fixture() {
    const f = dialect.make();
    await f.repo.save(prior);
    await f.blobs.save({ id: "blob", workspaceId, sha256: input.sha256, storageKey: input.storageKey,
      status: "active", createdAt: prior.createdAt, createdByPrincipal: "blob-owner" });
    await f.renditions.save({ id: "preview", workspaceId, assetId: "photo", transformName: "thumb", version: 1,
      storageKey: "old-preview", createdAt: prior.createdAt });
    return f;
  }

  test(`[${dialect.name}] replacement commits source, metadata, type and original together with one version bump`, async () => {
    const f = await fixture();
    assert.deepEqual(await f.repo.replaceFileIfVersion(input), { applied: true });
    const saved = (await f.repo.findById({ workspaceId, id: "photo" }))!;
    assert.deepEqual(saved, { ...prior, ...input.metadata, source: { sha256: input.sha256, contentType: "image/jpeg", provenance: { kind: "upload" } },
      version: 4, updatedAt: input.updatedAt });
    assert.equal((await f.types.getMany({ workspaceId, sha256s: [input.sha256] })).get(input.sha256), "image/jpeg");
    assert.equal((await f.blobs.findByHash({ workspaceId, sha256: input.sha256 }))!.createdByPrincipal, "blob-owner");
    assert.equal((await f.repo.findBySlug({ workspaceId, slug: "before" }))!.id, "photo");
    assert.deepEqual((await f.renditions.listByAsset({ workspaceId, assetId: "photo" })).map(row => [row.transformName, row.storageKey]), [["original", "new-blob"]]);
  });

  test(`[${dialect.name}] stale CAS leaves metadata, source, type and previews unchanged`, async () => {
    const f = await fixture();
    assert.deepEqual(await f.repo.replaceFileIfVersion({ ...input, ifVersion: 2 }), { applied: false });
    assert.deepEqual(await f.repo.findById({ workspaceId, id: "photo" }), prior);
    assert.equal((await f.types.getMany({ workspaceId, sha256s: [input.sha256] })).size, 0);
    assert.deepEqual((await f.renditions.listByAsset({ workspaceId, assetId: "photo" })).map(row => row.id), ["preview"]);
  });

  test(`[${dialect.name}] failed original insertion rolls back source, metadata, type, slug history and invalidation`, async () => {
    const f = await fixture();
    await f.renditions.save({ id: "original", workspaceId, assetId: "other", transformName: "original", version: 1,
      storageKey: "other-blob", createdAt: prior.createdAt });
    await assert.rejects(f.repo.replaceFileIfVersion(input));
    assert.deepEqual(await f.repo.findById({ workspaceId, id: "photo" }), prior);
    assert.equal((await f.types.getMany({ workspaceId, sha256s: [input.sha256] })).size, 0);
    assert.deepEqual(await f.repo.listRetiredSlugs({ workspaceId, mediaId: "photo" }), []);
    assert.deepEqual((await f.renditions.listByAsset({ workspaceId, assetId: "photo" })).map(row => row.id), ["preview"]);
  });

  test(`[${dialect.name}] replacement cannot claim another asset's slug`, async () => {
    const f = await fixture();
    await f.repo.save({ ...prior, id: "other", slug: "after" });
    await assert.rejects(f.repo.replaceFileIfVersion(input), /already used/);
    assert.deepEqual(await f.repo.findById({ workspaceId, id: "photo" }), prior);
    assert.deepEqual((await f.renditions.listByAsset({ workspaceId, assetId: "photo" })).map(row => row.id), ["preview"]);
  });
}
