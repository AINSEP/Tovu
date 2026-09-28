import assert from "node:assert/strict";
import test from "node:test";

import { eachDialect } from "../../kernel/__tests__/dialect-matrix.js";
import { SqlAssetBlobRepo, SqlMediaContentTypeStore } from "../media-repo.js";
import { InMemoryMediaContentTypeStore, type MediaContentTypeStorePort } from "#src/features/media/content-type-store";
import type { AssetBlobRecord } from "@jini-ai/cms/media";

/**
 * @file `MediaContentTypeStorePort`'s rule-of-two contract suite (ADR-006) plus the SQLite-only
 * durable-adapter regression guards that the in-memory double structurally cannot express. The
 * durable adapters (`repos/media-repo.ts`, one Kysely body) run on SQLite and PGlite.
 *
 * The column this store owns (`asset_blobs.content_type`) is written by NOTHING else — in
 * particular `SqlAssetBlobRepo.save()` deliberately omits it from its update `values`. The last
 * test in this file is the guard on that omission, and it is the one that actually matters: the
 * upstream `AssetBlobRecord` type has no content-type field, so if a future edit "tidies up"
 * `save()` by round-tripping every column, it would silently null the recorded type of any blob
 * that gets resurrected by a dedup upload — with no type error and no failing test anywhere else.
 */

const WORKSPACE_ID = "workspace-1";
const SHA = "a".repeat(64);
const OTHER_SHA = "b".repeat(64);

function makeAssetBlob(overrides: Partial<AssetBlobRecord> = {}): AssetBlobRecord {
  return {
    id: "blob-1",
    workspaceId: WORKSPACE_ID,
    sha256: SHA,
    storageKey: `blobs/${SHA}`,
    createdByPrincipal: "principal-1",
    createdAt: "2026-08-24T00:00:00.000Z",
    status: "active",
    ...overrides,
  };
}

/**
 * Runs the shared port contract against one adapter.
 *
 * `seedBlob` exists because the two adapters differ in a way the port's own doc already states:
 * the SQLite adapter never INSERTS, it only updates a column on a blob row `uploadMedia` has
 * already created, so its `set` is a no-op for a sha256 with no row. "A blob row exists" is part
 * of the port's precondition, not an adapter quirk — every real caller satisfies it — so the suite
 * establishes it for both adapters rather than pretending the difference away.
 */
function runContractSuite(
  label: string,
  make: () => { store: MediaContentTypeStorePort; seedBlob: (blob: AssetBlobRecord) => Promise<void> }
) {
  test(`${label}: set() then getMany() round-trips a recorded content type`, async () => {
    const { store, seedBlob } = make();
    await seedBlob(makeAssetBlob());

    await store.set({ workspaceId: WORKSPACE_ID, sha256: SHA, contentType: "image/png" });

    const found = await store.getMany({ workspaceId: WORKSPACE_ID, sha256s: [SHA] });
    assert.equal(found.get(SHA), "image/png");
  });

  test(`${label}: getMany() OMITS a sha256 with no recorded type rather than returning a null entry`, async () => {
    const { store, seedBlob } = make();
    await seedBlob(makeAssetBlob());

    const found = await store.getMany({ workspaceId: WORKSPACE_ID, sha256s: [SHA] });
    // The whole point of the absent-vs-recorded distinction: a caller must be able to tell "never
    // sniffed" from a recorded `application/octet-stream`, which IS a real answer.
    assert.equal(found.has(SHA), false);
    assert.equal(found.size, 0);
  });

  test(`${label}: getMany() returns only the requested sha256s, and an empty request is an empty map`, async () => {
    const { store, seedBlob } = make();
    await seedBlob(makeAssetBlob());
    await seedBlob(makeAssetBlob({ id: "blob-2", sha256: OTHER_SHA, storageKey: `blobs/${OTHER_SHA}` }));
    await store.set({ workspaceId: WORKSPACE_ID, sha256: SHA, contentType: "image/png" });
    await store.set({ workspaceId: WORKSPACE_ID, sha256: OTHER_SHA, contentType: "video/mp4" });

    const one = await store.getMany({ workspaceId: WORKSPACE_ID, sha256s: [OTHER_SHA] });
    assert.deepEqual([...one], [[OTHER_SHA, "video/mp4"]]);

    const none = await store.getMany({ workspaceId: WORKSPACE_ID, sha256s: [] });
    assert.equal(none.size, 0);
  });

  test(`${label}: set() overwrites an already-recorded type (re-sniffing the same blob is idempotent)`, async () => {
    const { store, seedBlob } = make();
    await seedBlob(makeAssetBlob());

    await store.set({ workspaceId: WORKSPACE_ID, sha256: SHA, contentType: "application/octet-stream" });
    await store.set({ workspaceId: WORKSPACE_ID, sha256: SHA, contentType: "image/png" });

    const found = await store.getMany({ workspaceId: WORKSPACE_ID, sha256s: [SHA] });
    assert.equal(found.get(SHA), "image/png");
  });

  test(`${label}: a recorded type is scoped to its workspace`, async () => {
    const { store, seedBlob } = make();
    await seedBlob(makeAssetBlob());
    await store.set({ workspaceId: WORKSPACE_ID, sha256: SHA, contentType: "image/png" });

    const found = await store.getMany({ workspaceId: "workspace-2", sha256s: [SHA] });
    assert.equal(found.has(SHA), false);
  });
}

runContractSuite("memory", () => ({
  store: new InMemoryMediaContentTypeStore(),
  seedBlob: async () => {
    // No-op: the in-memory store keys off the sha256 alone and has no blob table to satisfy.
  },
}));

const dialects = eachDialect({
  tables: ["asset_blobs"],
  make: (kernel) => ({ store: new SqlMediaContentTypeStore(kernel), blobRepo: new SqlAssetBlobRepo(kernel) }),
});

for (const each of dialects) {
  runContractSuite(each.name, () => {
    const { store, blobRepo } = each.make();
    return { store, seedBlob: (blob) => blobRepo.save(blob) };
  });
}

for (const each of dialects) test(`SqlMediaContentTypeStore [${each.name}] set() for a sha256 with no blob row records nothing and does not throw`, async () => {
  const { store } = each.make();

  // No blob row was ever written. There is no blob to describe, so there is nothing to record —
  // and an UPDATE matching zero rows must not be an error (see the adapter's own doc).
  await store.set({ workspaceId: WORKSPACE_ID, sha256: SHA, contentType: "image/png" });

  const found = await store.getMany({ workspaceId: WORKSPACE_ID, sha256s: [SHA] });
  assert.equal(found.has(SHA), false);
});

for (const each of dialects) test(`SqlAssetBlobRepo [${each.name}] save() does NOT wipe a recorded content type when a dedup upload resurrects a tombstoned blob`, async () => {
  const { store, blobRepo } = each.make();

  await blobRepo.save(makeAssetBlob());
  await store.set({ workspaceId: WORKSPACE_ID, sha256: SHA, contentType: "image/png" });

  // Exactly what `uploadMedia` does when a re-upload of identical bytes finds the blob tombstoned:
  // it spreads the record it just read back through `save()`. `AssetBlobRecord` has no
  // content-type field, so the type survives ONLY because `save()`'s update omits that column.
  const tombstoned = await blobRepo.findByHash({ workspaceId: WORKSPACE_ID, sha256: SHA });
  assert.ok(tombstoned);
  await blobRepo.save({ ...tombstoned, status: "tombstoned", tombstonedAt: "2026-08-24T01:00:00.000Z" });
  await blobRepo.save({ ...tombstoned, status: "active", tombstonedAt: undefined });

  const found = await store.getMany({ workspaceId: WORKSPACE_ID, sha256s: [SHA] });
  assert.equal(
    found.get(SHA),
    "image/png",
    "the trash/restore round trip must not erase the blob's recorded content type"
  );
});
