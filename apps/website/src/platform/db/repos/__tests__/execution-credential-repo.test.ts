import assert from "node:assert/strict";
import test from "node:test";

import { seedPrincipals, seedWorkspaces } from "#src/platform/db/kernel/__tests__/content-seeds";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { openContentDb } from "../../sqlite/content-db.js";
import { SqlAdminExecutionCredentialRepo } from "../execution-credential-repo.js";
import { principals, workspaces } from "../../schema.sqlite.js";
import type { AdminExecutionCredentialRecord } from "#src/assistant/execution-credential-store";

/**
 * @file `SqlAdminExecutionCredentialRepo` against a real, migrated content database on every dialect —
 * the thing worth proving here is that migration `0026`'s composite primary key, its real FKs to
 * `workspaces`/`principals`, and its CHECK constraint all agree with this adapter's mapping, which a
 * pure in-memory-Map test double cannot catch. Mirrors `site-credential-repo.test.ts`'s
 * shape for the sibling ADR-058 table.
 */

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
    aadVersion: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
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

describeEachDialect("AdminExecutionCredentialRepoPort", { tables: ["admin_execution_credentials", "principals", "workspaces"], make: (kernel) => ({ kernel, repo: new SqlAdminExecutionCredentialRepo(kernel) }) }, (make) => {
  async function makeRepo() {
    const { kernel, repo } = make();
    await seedPrincipals(kernel, WORKSPACE, [ADMIN_A, ADMIN_B]);
    await seedWorkspaces(kernel, [OTHER_WORKSPACE]);
    return repo;
  }

  test("findByWorkspaceAndPrincipal returns null when no row exists", async () => {
    const repo = await makeRepo();
    assert.equal(await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A }), null);
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
      masked: "••••7777",
      aadVersion: 1,
    });

    await repo.upsert(record);
    const found = await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A });
    assert.deepEqual(found, record);
  });

  test("upsert is a true upsert — a second call on the same (workspace, principal) updates the one row, not a second row", async () => {
    const repo = await makeRepo();
    await repo.upsert(makeRecord({
      model: "first-model", aadVersion: 0,
      sealed: { keyId: "v1", ciphertext: "bGVnYWN5", nonce: "bm9uY2U=", alg: "aes-256-gcm" }, masked: "••••7777",
    }));
    const updated = makeRecord({
      model: "second-model", updatedAt: "2026-08-05T01:00:00.000Z", aadVersion: 1,
      sealed: { keyId: "v2", ciphertext: "bmV3", nonce: "bm9uY2Uy", alg: "aes-256-gcm" }, masked: "••••8888",
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
        masked: "••••7777",
      })
    );

    const siblings = [
      makeRecord({ principalId: ADMIN_B, sealed: { keyId: "v2", ciphertext: "b3RoZXI=", nonce: "bm9uY2Uy", alg: "aes-256-gcm" }, masked: "••••8888", aadVersion: 1 }),
      makeRecord({ workspaceId: OTHER_WORKSPACE, sealed: { keyId: "v3", ciphertext: "dGhpcmQ=", nonce: "bm9uY2Uz", alg: "aes-256-gcm" }, masked: "••••9999", aadVersion: 1 }),
    ];
    for (const sibling of siblings) await repo.upsert(sibling);

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

test("the table's CHECK constraint rejects a half-sealed row written outside this adapter", async () => {
  const db = openSeededDb();
  assert.throws(() => {
    db.$client
      .prepare(
        `INSERT INTO admin_execution_credentials
           (workspace_id, principal_id, protocol, sealed_key_id, sealed_ciphertext, sealed_nonce, sealed_alg, masked, created_at, updated_at)
         VALUES (?, ?, 'anthropic', 'v1', NULL, NULL, NULL, NULL, ?, ?)`
      )
      .run(WORKSPACE, ADMIN_A, NOW, NOW);
  }, /CHECK constraint failed/);
});

test("the table's FK rejects a row for a principal that does not exist", async () => {
  const db = openSeededDb();
  assert.throws(() => {
    db.$client
      .prepare(
        `INSERT INTO admin_execution_credentials
           (workspace_id, principal_id, protocol, created_at, updated_at)
         VALUES (?, 'no-such-principal', 'anthropic', ?, ?)`
      )
      .run(WORKSPACE, NOW, NOW);
  }, /FOREIGN KEY constraint failed/);
});
