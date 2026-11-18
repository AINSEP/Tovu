import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { SqlAssetBlobRepo, SqlMediaRepo } from "#src/platform/db/repos/media-repo";
import { outboxEventValues } from "#src/platform/db/repos/outbox-repo";
import { createUserTrashAdapter } from "#src/features/trash/adapters/user";
import { trashEntityLockKey } from "@jini-ai/cms/trash";
import { buildTrashRegistry } from "#src/features/trash/registry";
import { createTableTrashAdapter } from "#src/features/trash/table-adapter";
import { SqlMagicLinkTokenRepo, SqlMemberRepo } from "#src/features/members/repo";
import type { AssetBlobRecord, AssetRenditionRecord, MediaRecord } from "@jini-ai/cms/media";
import { recordingKernel } from "./support/recording-kernel.js";

/**
 * @file P1 (S0), second half: the media, trash and member lock keys. The media slug key has five
 * call sites behind one helper, so each of the five public writers is driven separately (one test
 * per site: a writer that stopped locking, or built another key, fails alone).
 */

const WS = "lane-su-ws";
const NOW = "2026-11-17T00:00:00.000Z";

function media(): MediaRecord {
  return {
    kind: "media", originalFilename: null, id: "media-1", workspaceId: WS, title: "A photo", slug: "a-photo",
    alt: "alt", caption: "caption", credit: "credit", source: { sha256: "a".repeat(64) }, status: "active",
    createdAt: NOW, updatedAt: NOW, version: 1, width: null, height: null, cssClass: null, htmlAttributes: null,
  };
}

function rendition(): AssetRenditionRecord {
  return { id: "rendition-1", workspaceId: WS, assetId: "media-1", transformName: "thumb", version: 1, storageKey: "k", createdAt: NOW };
}

describe("P1 media lock keys", () => {
  const slugKey = `media_slugs:${WS}`;

  test("media save()", async () => {
    const { kernel, keys } = recordingKernel();
    await new SqlMediaRepo(kernel).save(media());
    assert.deepEqual(keys, [slugKey]);
  });

  test("media saveIfVersion()", async () => {
    const { kernel, keys } = recordingKernel();
    assert.deepEqual(await new SqlMediaRepo(kernel).saveIfVersion({ record: media(), ifVersion: 1 }), { applied: false });
    assert.deepEqual(keys, [slugKey]);
  });

  test("media replaceFileIfVersion()", async () => {
    const { kernel, keys } = recordingKernel();
    const restore = { version: 1, updatedAt: NOW, source: { sha256: "a".repeat(64) } };
    const applied = await new SqlMediaRepo(kernel).replaceFileIfVersion({
      workspaceId: WS, id: "media-1", ifVersion: 1, sha256: "a".repeat(64), storageKey: "k", originalRenditionId: "r", updatedAt: NOW, restore,
    });
    assert.deepEqual(applied, { applied: false });
    assert.deepEqual(keys, [slugKey]);
  });

  test("media saveRenditionIfSource()", async () => {
    const { kernel, keys } = recordingKernel();
    const applied = await new SqlMediaRepo(kernel).saveRenditionIfSource({ record: rendition(), sourceSha256: "a".repeat(64) });
    assert.deepEqual(applied, { applied: false });
    assert.deepEqual(keys, [slugKey]);
  });

  test("media insertIfAbsent()", async () => {
    const { kernel, keys } = recordingKernel();
    assert.deepEqual(await new SqlMediaRepo(kernel).insertIfAbsent(media()), { applied: true });
    assert.deepEqual(keys, [slugKey]);
  });

  test("asset blobs are keyed by workspace and content hash", async () => {
    const { kernel, keys } = recordingKernel();
    const blob: AssetBlobRecord = { id: "blob-1", workspaceId: WS, sha256: "b".repeat(64), storageKey: "k", createdByPrincipal: "p", createdAt: NOW, status: "active" };
    await new SqlAssetBlobRepo(kernel).save(blob);
    assert.deepEqual(keys, [`asset_blobs:${WS}:${"b".repeat(64)}`]);
  });
});

describe("P1 trash lock keys", () => {
  test("the table adapter locks trash:<entityType>:<workspace>:<id> for every registered entry", async () => {
    const registry = buildTrashRegistry();
    assert.ok(registry.size > 0);
    for (const [entityType, entry] of registry) {
      const { kernel, keys } = recordingKernel();
      const result = await createTableTrashAdapter({ entry, db: kernel }).hide({ workspaceId: WS, entityId: "missing-id", at: NOW, expectedVersion: null });
      assert.deepEqual(result, { ok: false, reason: "not-found" }, entityType);
      assert.deepEqual(keys, [`trash:${entityType}:${WS}:missing-id`], entityType);
      assert.deepEqual(keys, [trashEntityLockKey({ entityType, workspaceId: WS, entityId: "missing-id" })], `${entityType}: Jini's builder names the key the table adapter takes`);
    }
  });

  test("the user adapter locks trash:user:<workspace>:<principal> (stays in Tovu)", async () => {
    const { kernel, keys } = recordingKernel();
    const adapter = createUserTrashAdapter({
      eventValues: outboxEventValues, db: kernel,
      purge: { purgeUser: async () => { throw new Error("purge is not reached by hide"); } },
      idGen: { next: () => "id-1" }, clock: { nowIso: () => NOW },
    });
    assert.deepEqual(await adapter.hide({ workspaceId: WS, entityId: "principal-1", at: NOW, expectedVersion: null }), { ok: false, reason: "not-found" });
    assert.deepEqual(keys, [`trash:user:${WS}:principal-1`]);
  });
});

describe("P1 member lock keys", () => {
  test("magic-link consume is keyed by workspace", async () => {
    const { kernel, keys } = recordingKernel();
    const links = new SqlMagicLinkTokenRepo(kernel);
    await links.save({ id: "link-1", workspaceId: WS, memberId: "member-1", purpose: "password_reset", tokenHash: "digest-class-only", createdAt: NOW, expiresAt: "2026-11-18T00:00:00.000Z" });
    await new SqlMemberRepo(kernel).save({ id: "member-1", workspaceId: WS, email: "m@example.test", status: "active", createdAt: NOW, updatedAt: NOW, version: 1 });
    await links.consume({ workspaceId: WS, id: "link-1", consumedAt: NOW });
    assert.deepEqual(keys, [`members:magic-tokens:${WS}`]);
  });
});
