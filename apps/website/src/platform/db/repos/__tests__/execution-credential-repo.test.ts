import "../../../site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { seedPrincipals, seedWorkspaces } from "#src/platform/db/kernel/__tests__/content-seeds";
import { ensureVaultRepoFixture } from "#src/platform/db/repos/__tests__/vault-repo.fixture";
import { contentKernel, type ContentKernel } from "#src/platform/db/content-kernel";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { openContentDb } from "../../sqlite/content-db.js";
import { SqlAdminExecutionCredentialRepo } from "../../../../assistant/execution-credential-repo.js";
import { principals, workspaces } from "../../schema.sqlite.js";
import { setExecutionCredential, type AdminExecutionCredentialRecord } from "#src/assistant/execution-credential-store";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";

/** Existing adapter characterization on the Jini vault: envelope/settings round trips,
 * singleton scope, clears, replacement, SQL constraints and principal isolation on both dialects.
 * Raw envelopes have no verified token length, so their masks must be null; service writes
 * establish length-aware hints. The regression below explicitly refuses an unverified suffix. */

const WORKSPACE = "workspace-1";
const OTHER_WORKSPACE = "workspace-2";
const ADMIN_A = "principal-admin-a";
const ADMIN_B = "principal-admin-b";
const NOW = "2026-08-05T00:00:00.000Z";

function makeRecord(overrides: Partial<AdminExecutionCredentialRecord> = {}): AdminExecutionCredentialRecord {
  return {
    workspaceId: WORKSPACE,
    principalId: ADMIN_A,
    protocol: "anthropic",
    providerId: null,
    baseUrl: null,
    model: null,
    maxTokens: null,
    sealed: null,
    masked: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
    aadVersion: overrides.sealed ? 2 : 0,
  };
}

/** Seeds the `workspaces`/`principals` rows the new table's real FKs require — a plain
 *  `openContentDb(":memory:")` has neither by default. */
function seedIdentities(db: ReturnType<typeof openContentDb>, ids: { workspaceIds: string[]; principalIds: string[] }): void {
  for (const workspaceId of ids.workspaceIds) {
    db.insert(workspaces).values({ id: workspaceId, name: workspaceId, slug: workspaceId, createdAt: NOW }).onConflictDoNothing().run();
  }
  for (const principalId of ids.principalIds) {
    db.insert(principals)
      .values({ id: principalId, workspaceId: ids.workspaceIds[0]!, kind: "user", displayName: principalId, status: "active", createdAt: NOW })
      .onConflictDoNothing()
      .run();
  }
}

function openSeededDb() {
  const db = openContentDb(":memory:");
  seedIdentities(db, { workspaceIds: [WORKSPACE, OTHER_WORKSPACE], principalIds: [ADMIN_A, ADMIN_B] });
  return db;
}

/** The destructive step runs only on this disposable fixture, never in the boot registry. */
async function prepareVault(kernel: ContentKernel): Promise<void> {
  await ensureVaultRepoFixture({ kernel });
}

describeEachDialect("AdminExecutionCredentialRepoPort", { tables: ["workspaces"], make: (kernel) => ({ kernel, repo: new SqlAdminExecutionCredentialRepo(kernel) }) }, (make) => {
  async function makeRepo() {
    const { kernel, repo } = make();
    await prepareVault(kernel);
    await seedPrincipals(kernel, WORKSPACE, [ADMIN_A, ADMIN_B]);
    await seedWorkspaces(kernel, [OTHER_WORKSPACE]);
    return repo;
  }

  test("findByWorkspaceAndPrincipal returns null when no row exists", async () => {
    const repo = await makeRepo();
    assert.equal(await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A }), null);
  });

  test("the first execution credential save persists settings in SQL", async () => {
    const repo = await makeRepo();
    const keyring = new InMemoryKeyring();
    const scope = { workspaceId: WORKSPACE, principalId: ADMIN_A };

    await setExecutionCredential({ repo, keyring, sealer: new AesGcmSecretSealer(keyring), clock: { nowMs: () => Date.parse(NOW) } },
      { ...scope, protocol: "openai", providerId: "first-provider", model: "first-model" });

    assert.deepEqual(await repo.findByWorkspaceAndPrincipal(scope), makeRecord({
      protocol: "openai", providerId: "first-provider", model: "first-model",
    }));
  });

  test("upsert then findByWorkspaceAndPrincipal round-trips a sealed record exactly", async () => {
    const repo = await makeRepo();
    const record = makeRecord({
      protocol: "openai",
      providerId: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
      maxTokens: 4096,
      sealed: { keyId: "v1", ciphertext: "Y2lwaGVy", nonce: "bm9uY2U=", alg: "aes-256-gcm" },
      masked: null,
      aadVersion: 2,
    });

    await repo.upsert(record);
    const found = await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A });
    assert.deepEqual(found, record);
  });

  test("upsert is a true upsert — a second call on the same (workspace, principal) updates the one row, not a second row", async () => {
    const repo = await makeRepo();
    await repo.upsert(makeRecord({
      model: "first-model", aadVersion: 2,
      sealed: { keyId: "v1", ciphertext: "bGVnYWN5", nonce: "bm9uY2U=", alg: "aes-256-gcm" }, masked: null,
    }));
    const updated = makeRecord({
      model: "second-model", updatedAt: "2026-08-05T01:00:00.000Z", aadVersion: 2,
      sealed: { keyId: "v2", ciphertext: "bmV3", nonce: "bm9uY2Uy", alg: "aes-256-gcm" }, masked: null,
    });
    await repo.upsert(updated);

    const found = await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A });
    assert.equal(found?.model, "second-model");
    assert.deepEqual(found, updated);
  });

  test("clearKey nulls the sealed columns and masked, and leaves everything else untouched", async () => {
    const repo = await makeRepo();
    await repo.upsert(
      makeRecord({
        model: "gpt-4o",
        sealed: { keyId: "v1", ciphertext: "Y2lwaGVy", nonce: "bm9uY2U=", alg: "aes-256-gcm" },
        masked: null,
      })
    );

    const siblings = [
      makeRecord({ principalId: ADMIN_B, sealed: { keyId: "v2", ciphertext: "b3RoZXI=", nonce: "bm9uY2Uy", alg: "aes-256-gcm" }, masked: null, aadVersion: 1 }),
      makeRecord({ workspaceId: OTHER_WORKSPACE, sealed: { keyId: "v3", ciphertext: "dGhpcmQ=", nonce: "bm9uY2Uz", alg: "aes-256-gcm" }, masked: null, aadVersion: 1 }),
    ];
    for (const sibling of siblings) await repo.upsert(sibling);

    const keyed = (await repo.vault.findOne({ workspaceId: WORKSPACE, kind: "personal-execution", principalId: ADMIN_A }))!;
    await repo.vault.put({ record: { ...keyed, last4: "7777", tokenLength: 16, revision: keyed.revision + 1 }, expectedRevision: keyed.revision });
    assert.equal((await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A }))?.masked, "••••7777");
    await repo.clearKey({ workspaceId: WORKSPACE, principalId: ADMIN_A, updatedAt: "2026-08-05T02:00:00.000Z" });

    const found = await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A });
    assert.equal(found?.sealed, null);
    assert.equal(found?.masked, null);
    assert.equal(found?.model, "gpt-4o");
    assert.equal(found?.updatedAt, "2026-08-05T02:00:00.000Z");
    for (const sibling of siblings) {
      assert.deepEqual(await repo.findByWorkspaceAndPrincipal({ workspaceId: sibling.workspaceId, principalId: sibling.principalId }), sibling);
    }
  });

  test("raw envelope writes withhold unknown-length hints, preserve verified hints, and clear them on envelope changes", async () => {
    const repo = await makeRepo();
    const record = makeRecord({
      sealed: { keyId: "v1", ciphertext: "cipher", nonce: "nonce", alg: "aes-256-gcm" }, masked: "••••7777",
    });
    await repo.upsert(record);
    assert.deepEqual(await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A }), { ...record, masked: null });
    const row = (await repo.vault.findOne({ workspaceId: WORKSPACE, kind: "personal-execution" }))!;
    assert.equal(row.last4, null);
    assert.equal(row.tokenLength, null);
    // Represent a hint already verified by the service, then perform a metadata-only DTO write.
    await repo.vault.put({ record: { ...row, last4: "7777", tokenLength: 16, revision: row.revision + 1 }, expectedRevision: row.revision });
    await repo.upsert({ ...record, model: "new-model" });
    assert.equal((await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A }))?.masked, "••••7777");
    // Same ciphertext alone is insufficient: the key identity is part of the envelope.
    await repo.upsert({ ...record, sealed: { ...record.sealed!, keyId: "v2" } });
    assert.equal((await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A }))?.masked, null);
  });

  test("clearKey on a (workspace, principal) with no row is a harmless no-op", async () => {
    const repo = await makeRepo();
    await repo.clearKey({ workspaceId: WORKSPACE, principalId: ADMIN_A, updatedAt: NOW });
    assert.equal(await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A }), null);
  });

  test("row-level isolation: two principals in the same workspace never collide", async () => {
    const repo = await makeRepo();
    await repo.upsert(makeRecord({ principalId: ADMIN_A, model: "admin-a-model" }));
    await repo.upsert(makeRecord({ principalId: ADMIN_B, model: "admin-b-model" }));

    assert.equal((await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A }))?.model, "admin-a-model");
    assert.equal((await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_B }))?.model, "admin-b-model");
  });
});

test("the vault CHECK constraint rejects a half-sealed row written outside this adapter", async () => {
  const db = openSeededDb();
  await prepareVault(contentKernel(db));
  assert.throws(() => {
    db.$client
      .prepare(
        `INSERT INTO secrets_vault
           (workspace_id,id,kind,owner_key,principal_id,label,is_default,revision,meta,sealed_key_id,created_at,updated_at)
         VALUES (?, 'half', 'personal-execution', 'tovu', ?, '', 1, 1, '{}', 'v1', ?, ?)`
      )
      .run(WORKSPACE, ADMIN_A, NOW, NOW);
  }, /CHECK constraint failed/);
});

test("the vault FK rejects a row for a principal that does not exist", async () => {
  const db = openSeededDb();
  await prepareVault(contentKernel(db));
  assert.throws(() => {
    db.$client
      .prepare(
        `INSERT INTO secrets_vault
           (workspace_id,id,kind,owner_key,principal_id,label,is_default,revision,meta,created_at,updated_at)
         VALUES (?, 'missing', 'personal-execution', 'tovu', 'no-such-principal', '', 1, 1, '{}', ?, ?)`
      )
      .run(WORKSPACE, NOW, NOW);
  }, /FOREIGN KEY constraint failed/);
});
