import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openContentDb } from "../../db/sqlite/content-db";
import {
  SqliteAssetBlobRepo,
  SqliteAssetRenditionRepo,
  SqliteMediaRepo,
  SqliteTransformDefinitionRepo,
} from "../../db/sqlite/media-repo.sqlite";
import {
  InMemoryAssetBlobRepo,
  InMemoryAssetRenditionRepo,
  InMemoryMediaRepo,
  InMemoryTransformDefinitionRepo,
} from "@jini-ai/cms/media";
import type {
  AssetBlobRepoPort,
  AssetRenditionRepoPort,
  MediaRepoPort,
  TransformDefinitionRepoPort,
  AssetBlobRecord,
  AssetRenditionRecord,
  MediaRecord,
  TransformDefinitionRecord,
} from "@jini-ai/cms/media";

/**
 * @file ADR-046 Phase 1 — shared contract-test suite for the four route-consumed media repo
 * ports, run against BOTH `repo.memory.ts` and `db/sqlite/media-repo.sqlite.ts` (rule-of-two,
 * ADR-006). Same pattern as every other rule-of-two contract suite in this codebase.
 */

const WORKSPACE_ID = "workspace-1";

function makeMedia(overrides: Partial<MediaRecord> = {}): MediaRecord {
  return {
    id: "media-1",
    workspaceId: WORKSPACE_ID,
    title: "A photo",
    alt: "alt text",
    caption: "a caption",
    credit: "a credit",
    source: { sha256: "a".repeat(64) },
    status: "active",
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

function runMediaSuite(label: string, makeRepo: () => MediaRepoPort) {
  test(`[${label}] save() then findById() round-trips`, async () => {
    const repo = makeRepo();
    await repo.save(makeMedia());
    const found = await repo.findById({ workspaceId: WORKSPACE_ID, id: "media-1" });
    assert.deepEqual(found, makeMedia());
  });

  test(`[${label}] save() upserts (an update replaces the prior state)`, async () => {
    const repo = makeRepo();
    await repo.save(makeMedia());
    await repo.save(makeMedia({ title: "Updated title", version: 2 }));
    const found = await repo.findById({ workspaceId: WORKSPACE_ID, id: "media-1" });
    assert.equal(found?.title, "Updated title");
    assert.equal(found?.version, 2);
  });

  test(`[${label}] list() scopes strictly by workspace`, async () => {
    const repo = makeRepo();
    await repo.save(makeMedia({ id: "m-1", workspaceId: "workspace-1" }));
    await repo.save(makeMedia({ id: "m-2", workspaceId: "workspace-2" }));
    const list = await repo.list({ workspaceId: "workspace-1" });
    assert.deepEqual(list.map((r) => r.id), ["m-1"]);
  });

  test(`[${label}] remove() deletes the row`, async () => {
    const repo = makeRepo();
    await repo.save(makeMedia());
    await repo.remove({ workspaceId: WORKSPACE_ID, id: "media-1" });
    assert.equal(await repo.findById({ workspaceId: WORKSPACE_ID, id: "media-1" }), null);
  });
}

runMediaSuite("memory", () => new InMemoryMediaRepo());
runMediaSuite("sqlite", () => new SqliteMediaRepo(openContentDb(":memory:")));

function makeAssetBlob(overrides: Partial<AssetBlobRecord> = {}): AssetBlobRecord {
  return {
    id: "blob-1",
    workspaceId: WORKSPACE_ID,
    sha256: "b".repeat(64),
    storageKey: "ws/workspace-1/blobs/bb/bbbb",
    createdByPrincipal: "principal-1",
    createdAt: "2026-07-16T00:00:00.000Z",
    status: "active",
    ...overrides,
  };
}

function runAssetBlobSuite(label: string, makeRepo: () => AssetBlobRepoPort) {
  test(`[${label}] save() then findByHash() round-trips`, async () => {
    const repo = makeRepo();
    await repo.save(makeAssetBlob());
    const found = await repo.findByHash({ workspaceId: WORKSPACE_ID, sha256: "b".repeat(64) });
    assert.deepEqual(found, makeAssetBlob());
  });

  test(`[${label}] save() upserts on (workspaceId, sha256)`, async () => {
    const repo = makeRepo();
    await repo.save(makeAssetBlob());
    await repo.save(makeAssetBlob({ status: "tombstoned", tombstonedAt: "2026-07-16T01:00:00.000Z" }));
    const found = await repo.findByHash({ workspaceId: WORKSPACE_ID, sha256: "b".repeat(64) });
    assert.equal(found?.status, "tombstoned");
  });

  test(`[${label}] list() scopes strictly by workspace`, async () => {
    const repo = makeRepo();
    await repo.save(makeAssetBlob({ id: "b-1", workspaceId: "workspace-1", sha256: "c".repeat(64) }));
    await repo.save(makeAssetBlob({ id: "b-2", workspaceId: "workspace-2", sha256: "d".repeat(64) }));
    const list = await repo.list({ workspaceId: "workspace-1" });
    assert.deepEqual(list.map((r) => r.id), ["b-1"]);
  });

  test(`[${label}] remove() deletes the row`, async () => {
    const repo = makeRepo();
    await repo.save(makeAssetBlob());
    await repo.remove({ workspaceId: WORKSPACE_ID, sha256: "b".repeat(64) });
    assert.equal(await repo.findByHash({ workspaceId: WORKSPACE_ID, sha256: "b".repeat(64) }), null);
  });
}

runAssetBlobSuite("memory", () => new InMemoryAssetBlobRepo());
runAssetBlobSuite("sqlite", () => new SqliteAssetBlobRepo(openContentDb(":memory:")));

function makeRendition(overrides: Partial<AssetRenditionRecord> = {}): AssetRenditionRecord {
  return {
    id: "rendition-1",
    workspaceId: WORKSPACE_ID,
    assetId: "blob-1",
    transformName: "thumb",
    version: 1,
    storageKey: "ws/workspace-1/renditions/blob-1/thumb.v1",
    createdAt: "2026-07-16T00:00:00.000Z",
    ...overrides,
  };
}

function runRenditionSuite(label: string, makeRepo: () => AssetRenditionRepoPort) {
  test(`[${label}] save() then findOne() round-trips on (assetId, transformName, version)`, async () => {
    const repo = makeRepo();
    await repo.save(makeRendition());
    const found = await repo.findOne({ workspaceId: WORKSPACE_ID, assetId: "blob-1", transformName: "thumb", version: 1 });
    assert.deepEqual(found, makeRendition());
  });

  test(`[${label}] listByAsset returns every rendition for that asset`, async () => {
    const repo = makeRepo();
    await repo.save(makeRendition({ id: "r-1", transformName: "thumb" }));
    await repo.save(makeRendition({ id: "r-2", transformName: "hero" }));
    const list = await repo.listByAsset({ workspaceId: WORKSPACE_ID, assetId: "blob-1" });
    assert.equal(list.length, 2);
  });

  test(`[${label}] removeByAsset deletes every rendition for that asset, none other`, async () => {
    const repo = makeRepo();
    await repo.save(makeRendition({ id: "r-1", assetId: "blob-1" }));
    await repo.save(makeRendition({ id: "r-2", assetId: "blob-2" }));
    await repo.removeByAsset({ workspaceId: WORKSPACE_ID, assetId: "blob-1" });
    assert.equal((await repo.listByAsset({ workspaceId: WORKSPACE_ID, assetId: "blob-1" })).length, 0);
    assert.equal((await repo.listByAsset({ workspaceId: WORKSPACE_ID, assetId: "blob-2" })).length, 1);
  });
}

runRenditionSuite("memory", () => new InMemoryAssetRenditionRepo());
runRenditionSuite("sqlite", () => new SqliteAssetRenditionRepo(openContentDb(":memory:")));

function makeTransformDef(overrides: Partial<TransformDefinitionRecord> = {}): TransformDefinitionRecord {
  return {
    id: "def-1",
    workspaceId: WORKSPACE_ID,
    name: "thumb",
    version: 1,
    params: { width: 200, height: 200, fit: "cover", format: "webp" },
    owner: "core",
    createdAt: "2026-07-16T00:00:00.000Z",
    ...overrides,
  };
}

function runTransformDefSuite(label: string, makeRepo: () => TransformDefinitionRepoPort) {
  test(`[${label}] insert() then findByNameVersion() round-trips`, async () => {
    const repo = makeRepo();
    await repo.insert(makeTransformDef());
    const found = await repo.findByNameVersion({ workspaceId: WORKSPACE_ID, name: "thumb", version: 1 });
    assert.deepEqual(found, makeTransformDef());
  });

  test(`[${label}] listByName returns every version`, async () => {
    const repo = makeRepo();
    await repo.insert(makeTransformDef({ id: "d-1", version: 1 }));
    await repo.insert(makeTransformDef({ id: "d-2", version: 2 }));
    const list = await repo.listByName({ workspaceId: WORKSPACE_ID, name: "thumb" });
    assert.equal(list.length, 2);
  });

  test(`[${label}] insert() rejects a duplicate (workspaceId, name, version) — append-only`, async () => {
    const repo = makeRepo();
    await repo.insert(makeTransformDef());
    await assert.rejects(() => repo.insert(makeTransformDef()));
  });
}

runTransformDefSuite("memory", () => new InMemoryTransformDefinitionRepo());
runTransformDefSuite("sqlite", () => new SqliteTransformDefinitionRepo(openContentDb(":memory:")));

test("ADR-046 Phase 1: media + asset_blobs + asset_renditions + transform_registry all survive a simulated process restart (real on-disk file)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-media-restart-test-"));
  const dbPath = join(dir, "content.db");
  try {
    const db1 = openContentDb(dbPath);
    await new SqliteMediaRepo(db1).save(makeMedia());
    await new SqliteAssetBlobRepo(db1).save(makeAssetBlob());
    await new SqliteAssetRenditionRepo(db1).save(makeRendition());
    await new SqliteTransformDefinitionRepo(db1).insert(makeTransformDef());

    // "Restart": brand-new content.db handles against the SAME on-disk file — the in-memory
    // adapters this replaces would have lost all four rows entirely.
    const db2 = openContentDb(dbPath);
    assert.ok(await new SqliteMediaRepo(db2).findById({ workspaceId: WORKSPACE_ID, id: "media-1" }));
    assert.ok(await new SqliteAssetBlobRepo(db2).findByHash({ workspaceId: WORKSPACE_ID, sha256: "b".repeat(64) }));
    assert.ok(await new SqliteAssetRenditionRepo(db2).findOne({ workspaceId: WORKSPACE_ID, assetId: "blob-1", transformName: "thumb", version: 1 }));
    assert.ok(await new SqliteTransformDefinitionRepo(db2).findByNameVersion({ workspaceId: WORKSPACE_ID, name: "thumb", version: 1 }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
