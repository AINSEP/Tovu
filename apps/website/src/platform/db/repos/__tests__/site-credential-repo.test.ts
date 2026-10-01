import assert from "node:assert/strict";
import test from "node:test";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { openContentDb } from "../../sqlite/content-db.js";
import { SqlSiteAssistantCredentialRepo } from "../site-credential-repo.js";
import type { SiteAssistantCredentialRecord } from "#src/assistant/site-credential-store";

/**
 * @file `SqlSiteAssistantCredentialRepo` against a real, migrated content database on every dialect — the
 * thing worth proving here is that migration `0025`'s CHECK constraint and this adapter's
 * NULL-or-all-five-set mapping actually agree with each other, which a pure in-memory-Map test
 * double cannot catch.
 */

const WORKSPACE = "workspace-1";
const NOW = "2026-08-04T00:00:00.000Z";

function makeRecord(overrides: Partial<SiteAssistantCredentialRecord> = {}): SiteAssistantCredentialRecord {
  return {
    workspaceId: WORKSPACE,
    provider: "google",
    baseUrl: null,
    model: null,
    sealed: null,
    masked: null,
    aadVersion: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describeEachDialect("SiteAssistantCredentialRepoPort", { tables: ["site_assistant_credentials"], make: (kernel) => new SqlSiteAssistantCredentialRepo(kernel) }, (makeRepo) => {
  test("findByWorkspaceId returns null when no row exists", async () => {
    const repo = makeRepo();
    assert.equal(await repo.findByWorkspaceId(WORKSPACE), null);
  });

  test("upsert then findByWorkspaceId round-trips a sealed record exactly", async () => {
    const repo = makeRepo();
    const record = makeRecord({
      baseUrl: "https://generativelanguage.googleapis.com",
      model: "gemini-flash-latest",
      sealed: { keyId: "v1", ciphertext: "Y2lwaGVy", nonce: "bm9uY2U=", alg: "aes-256-gcm" },
      masked: "••••7777",
    });

    await repo.upsert(record);
    const found = await repo.findByWorkspaceId(WORKSPACE);
    assert.deepEqual(found, record);
  });

  test("upsert is a true upsert — a second call on the same workspace updates the one row, not a second row", async () => {
    const repo = makeRepo();
    await repo.upsert(makeRecord({ model: "first-model" }));
    await repo.upsert(makeRecord({ model: "second-model", updatedAt: "2026-08-04T01:00:00.000Z" }));

    const found = await repo.findByWorkspaceId(WORKSPACE);
    assert.equal(found?.model, "second-model");
  });

    test("current lineage survives insert and legacy rotation while upsert and clearKey isolate workspaces", async () => {
      const repo = makeRepo();
      const legacy = makeRecord({
        sealed: { keyId: "legacy-key", ciphertext: "bGVnYWN5", nonce: "bGVnYWN5LW5vbmNl", alg: "aes-256-gcm" },
        masked: "legacy-mask",
        aadVersion: 0,
      });
      const foreign = makeRecord({
        workspaceId: "workspace-2",
        model: "foreign-model",
        baseUrl: "https://foreign.example.test",
        sealed: { keyId: "foreign-key", ciphertext: "Zm9yZWlnbg==", nonce: "Zm9yZWlnbi1ub25jZQ==", alg: "aes-256-gcm" },
        masked: "foreign-mask",
        aadVersion: 1,
      });
      await repo.upsert(legacy);
      await repo.upsert(foreign);
      assert.deepEqual(await repo.findByWorkspaceId(WORKSPACE), legacy);
      assert.deepEqual(await repo.findByWorkspaceId("workspace-2"), foreign);
      const current = {
        ...legacy,
        aadVersion: 1,
        model: "rotated-model",
        sealed: { keyId: "current-key", ciphertext: "Y3VycmVudA==", nonce: "Y3VycmVudC1ub25jZQ==", alg: "aes-256-gcm" },
        masked: "current-mask",
        updatedAt: "2026-08-04T01:00:00.000Z",
      };
      await repo.upsert(current);
      assert.deepEqual(await repo.findByWorkspaceId(WORKSPACE), current);
      assert.deepEqual(await repo.findByWorkspaceId("workspace-2"), foreign);
      const clearedAt = "2026-08-04T02:00:00.000Z";
      await repo.clearKey({ workspaceId: WORKSPACE, updatedAt: clearedAt });
      assert.deepEqual(await repo.findByWorkspaceId(WORKSPACE), {
        ...current, sealed: null, masked: null, updatedAt: clearedAt,
      });
      assert.deepEqual(await repo.findByWorkspaceId("workspace-2"), foreign);
    });

    test("clearKey nulls the sealed columns and masked, and leaves provider/baseUrl/model untouched", async () => {
    const repo = makeRepo();
    await repo.upsert(
      makeRecord({
        baseUrl: "https://generativelanguage.googleapis.com",
        model: "gemini-flash-latest",
        sealed: { keyId: "v1", ciphertext: "Y2lwaGVy", nonce: "bm9uY2U=", alg: "aes-256-gcm" },
        masked: "••••7777",
      })
    );

    await repo.clearKey({ workspaceId: WORKSPACE, updatedAt: "2026-08-04T02:00:00.000Z" });

    const found = await repo.findByWorkspaceId(WORKSPACE);
    assert.equal(found?.sealed, null);
    assert.equal(found?.masked, null);
    assert.equal(found?.baseUrl, "https://generativelanguage.googleapis.com");
    assert.equal(found?.model, "gemini-flash-latest");
    assert.equal(found?.updatedAt, "2026-08-04T02:00:00.000Z");
  });

  test("clearKey on a workspace with no row is a harmless no-op", async () => {
    const repo = makeRepo();
    await repo.clearKey({ workspaceId: WORKSPACE, updatedAt: NOW });
    assert.equal(await repo.findByWorkspaceId(WORKSPACE), null);
  });
});

test("the table's CHECK constraint rejects a half-sealed row written outside this adapter", async () => {
  const db = openContentDb(":memory:");
  assert.throws(() => {
    db.$client
      .prepare(
        `INSERT INTO site_assistant_credentials
           (workspace_id, provider, sealed_key_id, sealed_ciphertext, sealed_nonce, sealed_alg, masked, created_at, updated_at)
         VALUES (?, 'google', 'v1', NULL, NULL, NULL, NULL, ?, ?)`
      )
      .run(WORKSPACE, NOW, NOW);
  }, /CHECK constraint failed/);
});
