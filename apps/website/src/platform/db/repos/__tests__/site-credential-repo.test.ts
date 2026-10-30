import assert from "node:assert/strict";
import test from "node:test";

import { ensureVaultRepoFixture } from "#src/platform/db/repos/__tests__/vault-repo.fixture";
import { contentKernel, type ContentKernel } from "#src/platform/db/content-kernel";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { seedWorkspaces } from "#src/platform/db/kernel/__tests__/content-seeds";
import { openContentDb } from "../../sqlite/content-db.js";
import { SqlSiteAssistantCredentialRepo } from "../../../../assistant/site-credential-repo.js";
import type { SiteAssistantCredentialRecord } from "#src/assistant/site-credential-store";

/** Existing adapter characterization on the Jini vault: envelope/settings round trips,
 * singleton scope, clears, replacement, SQL constraints and principal isolation on both dialects.
 * Raw envelopes have no verified token length, so their masks must be null; service writes
 * establish length-aware hints. The regression below explicitly refuses an unverified suffix. */

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
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
    aadVersion: overrides.sealed ? 2 : 0,
  };
}

/** The destructive step runs only on this disposable fixture, never in the boot registry. */
async function prepareVault(kernel: ContentKernel): Promise<void> {
  await ensureVaultRepoFixture({ kernel });
}

describeEachDialect("SiteAssistantCredentialRepoPort", { tables: ["workspaces"], make: (kernel) => ({ kernel, repo: new SqlSiteAssistantCredentialRepo(kernel) }) }, (make) => {
  async function makeRepo() {
    const { kernel, repo } = make();
    await prepareVault(kernel);
    await seedWorkspaces(kernel, [WORKSPACE, "workspace-2"]);
    return repo;
  }
  test("findByWorkspaceId returns null when no row exists", async () => {
    const repo = await makeRepo();
    assert.equal(await repo.findByWorkspaceId(WORKSPACE), null);
  });

  test("upsert then findByWorkspaceId round-trips a sealed record exactly", async () => {
    const repo = await makeRepo();
    const record = makeRecord({
      baseUrl: "https://generativelanguage.googleapis.com",
      model: "gemini-flash-latest",
      sealed: { keyId: "v1", ciphertext: "Y2lwaGVy", nonce: "bm9uY2U=", alg: "aes-256-gcm" },
      masked: null,
    });

    await repo.upsert(record);
    const found = await repo.findByWorkspaceId(WORKSPACE);
    assert.deepEqual(found, record);
  });

  test("upsert is a true upsert — a second call on the same workspace updates the one row, not a second row", async () => {
    const repo = await makeRepo();
    await repo.upsert(makeRecord({ model: "first-model" }));
    await repo.upsert(makeRecord({ model: "second-model", updatedAt: "2026-08-04T01:00:00.000Z" }));

    const found = await repo.findByWorkspaceId(WORKSPACE);
    assert.equal(found?.model, "second-model");
  });

    test("vault identity survives insert and envelope rotation while upsert and clearKey isolate workspaces", async () => {
      const repo = await makeRepo();
      const legacy = makeRecord({
        sealed: { keyId: "legacy-key", ciphertext: "bGVnYWN5", nonce: "bGVnYWN5LW5vbmNl", alg: "aes-256-gcm" },
        masked: null,
        aadVersion: 2,
      });
      const foreign = makeRecord({
        workspaceId: "workspace-2",
        model: "foreign-model",
        baseUrl: "https://foreign.example.test",
        sealed: { keyId: "foreign-key", ciphertext: "Zm9yZWlnbg==", nonce: "Zm9yZWlnbi1ub25jZQ==", alg: "aes-256-gcm" },
        masked: null,
        aadVersion: 2,
      });
      await repo.upsert(legacy);
      await repo.upsert(foreign);
      assert.deepEqual(await repo.findByWorkspaceId(WORKSPACE), legacy);
      assert.deepEqual(await repo.findByWorkspaceId("workspace-2"), foreign);
      const current = {
        ...legacy,
        aadVersion: 2,
        model: "rotated-model",
        sealed: { keyId: "current-key", ciphertext: "Y3VycmVudA==", nonce: "Y3VycmVudC1ub25jZQ==", alg: "aes-256-gcm" },
        masked: null,
        updatedAt: "2026-08-04T01:00:00.000Z",
      };
      await repo.upsert(current);
      assert.deepEqual(await repo.findByWorkspaceId(WORKSPACE), current);
      assert.deepEqual(await repo.findByWorkspaceId("workspace-2"), foreign);
      const clearedAt = "2026-08-04T02:00:00.000Z";
      await repo.clearKey({ workspaceId: WORKSPACE, updatedAt: clearedAt });
      assert.deepEqual(await repo.findByWorkspaceId(WORKSPACE), {
        ...current, sealed: null, masked: null, aadVersion: 0, updatedAt: clearedAt,
      });
      assert.deepEqual(await repo.findByWorkspaceId("workspace-2"), foreign);
    });

    test("clearKey nulls the sealed columns and masked, and leaves provider/baseUrl/model untouched", async () => {
    const repo = await makeRepo();
    await repo.upsert(
      makeRecord({
        baseUrl: "https://generativelanguage.googleapis.com",
        model: "gemini-flash-latest",
        sealed: { keyId: "v1", ciphertext: "Y2lwaGVy", nonce: "bm9uY2U=", alg: "aes-256-gcm" },
        masked: null,
      })
    );

    const keyed = (await repo.vault.findOne({ workspaceId: WORKSPACE, kind: "site-assistant" }))!;
    await repo.vault.put({ record: { ...keyed, last4: "7777", tokenLength: 16, revision: keyed.revision + 1 }, expectedRevision: keyed.revision });
    assert.equal((await repo.findByWorkspaceId(WORKSPACE))?.masked, "••••7777");
    await repo.clearKey({ workspaceId: WORKSPACE, updatedAt: "2026-08-04T02:00:00.000Z" });

    const found = await repo.findByWorkspaceId(WORKSPACE);
    assert.equal(found?.sealed, null);
    assert.equal(found?.masked, null);
    assert.equal(found?.baseUrl, "https://generativelanguage.googleapis.com");
    assert.equal(found?.model, "gemini-flash-latest");
    assert.equal(found?.updatedAt, "2026-08-04T02:00:00.000Z");
  });

  test("raw envelope writes withhold unknown-length hints, preserve verified hints, and clear them on envelope changes", async () => {
    const repo = await makeRepo();
    const record = makeRecord({
      sealed: { keyId: "v1", ciphertext: "cipher", nonce: "nonce", alg: "aes-256-gcm" }, masked: "••••7777",
    });
    await repo.upsert(record);
    assert.deepEqual(await repo.findByWorkspaceId(WORKSPACE), { ...record, masked: null });
    const row = (await repo.vault.findOne({ workspaceId: WORKSPACE, kind: "site-assistant" }))!;
    assert.equal(row.last4, null);
    assert.equal(row.tokenLength, null);
    // Represent a hint already verified by the service, then perform a metadata-only DTO write.
    await repo.vault.put({ record: { ...row, last4: "7777", tokenLength: 16, revision: row.revision + 1 }, expectedRevision: row.revision });
    await repo.upsert({ ...record, model: "new-model" });
    assert.equal((await repo.findByWorkspaceId(WORKSPACE))?.masked, "••••7777");
    // Same ciphertext alone is insufficient: the key identity is part of the envelope.
    await repo.upsert({ ...record, sealed: { ...record.sealed!, keyId: "v2" } });
    assert.equal((await repo.findByWorkspaceId(WORKSPACE))?.masked, null);
  });

  test("clearKey on a workspace with no row is a harmless no-op", async () => {
    const repo = await makeRepo();
    await repo.clearKey({ workspaceId: WORKSPACE, updatedAt: NOW });
    assert.equal(await repo.findByWorkspaceId(WORKSPACE), null);
  });
});

test("the vault CHECK constraint rejects a half-sealed row written outside this adapter", async () => {
  const db = openContentDb(":memory:");
  await prepareVault(contentKernel(db));
  await seedWorkspaces(contentKernel(db), [WORKSPACE]);
  assert.throws(() => {
    db.$client
      .prepare(
        `INSERT INTO secrets_vault
           (workspace_id,id,kind,owner_key,principal_id,label,is_default,revision,meta,sealed_key_id,created_at,updated_at)
         VALUES (?, 'half', 'site-assistant', 'tovu', NULL, '', 1, 1, '{}', 'v1', ?, ?)`
      )
      .run(WORKSPACE, NOW, NOW);
  }, /CHECK constraint failed/);
});
