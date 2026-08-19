import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb } from "../content-db.js";
import { SqliteAdminExecutionCredentialRepo } from "../execution-credential-repo.sqlite.js";
import { principals, workspaces } from "../../schema.js";
import type { AdminExecutionCredentialRecord } from "../../../assistant/execution-credential-store.js";

/**
 * @file `SqliteAdminExecutionCredentialRepo` against a real, migrated `content.db` (`:memory:`) —
 * the thing worth proving here is that migration `0026`'s composite primary key, its real FKs to
 * `workspaces`/`principals`, and its CHECK constraint all agree with this adapter's mapping, which a
 * pure in-memory-Map test double cannot catch. Mirrors `site-credential-repo.sqlite.test.ts`'s
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

test("findByWorkspaceAndPrincipal returns null when no row exists", async () => {
  const repo = new SqliteAdminExecutionCredentialRepo(openSeededDb());
  assert.equal(await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A }), null);
});

test("upsert then findByWorkspaceAndPrincipal round-trips a sealed record exactly", async () => {
  const repo = new SqliteAdminExecutionCredentialRepo(openSeededDb());
  const record = makeRecord({
    protocol: "openai",
    providerId: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    maxTokens: 4096,
    sealed: { keyId: "v1", ciphertext: "Y2lwaGVy", nonce: "bm9uY2U=", alg: "aes-256-gcm" },
    masked: "••••7777",
  });

  await repo.upsert(record);
  const found = await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A });
  assert.deepEqual(found, record);
});

test("upsert is a true upsert — a second call on the same (workspace, principal) updates the one row, not a second row", async () => {
  const repo = new SqliteAdminExecutionCredentialRepo(openSeededDb());
  await repo.upsert(makeRecord({ model: "first-model" }));
  await repo.upsert(makeRecord({ model: "second-model", updatedAt: "2026-08-05T01:00:00.000Z" }));

  const found = await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A });
  assert.equal(found?.model, "second-model");
});

test("clearKey nulls the sealed columns and masked, and leaves everything else untouched", async () => {
  const repo = new SqliteAdminExecutionCredentialRepo(openSeededDb());
  await repo.upsert(
    makeRecord({
      model: "gpt-4o",
      sealed: { keyId: "v1", ciphertext: "Y2lwaGVy", nonce: "bm9uY2U=", alg: "aes-256-gcm" },
      masked: "••••7777",
    })
  );

  await repo.clearKey({ workspaceId: WORKSPACE, principalId: ADMIN_A, updatedAt: "2026-08-05T02:00:00.000Z" });

  const found = await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A });
  assert.equal(found?.sealed, null);
  assert.equal(found?.masked, null);
  assert.equal(found?.model, "gpt-4o");
  assert.equal(found?.updatedAt, "2026-08-05T02:00:00.000Z");
});

test("clearKey on a (workspace, principal) with no row is a harmless no-op", async () => {
  const repo = new SqliteAdminExecutionCredentialRepo(openSeededDb());
  await repo.clearKey({ workspaceId: WORKSPACE, principalId: ADMIN_A, updatedAt: NOW });
  assert.equal(await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A }), null);
});

test("row-level isolation: two principals in the same workspace never collide", async () => {
  const repo = new SqliteAdminExecutionCredentialRepo(openSeededDb());
  await repo.upsert(makeRecord({ principalId: ADMIN_A, model: "admin-a-model" }));
  await repo.upsert(makeRecord({ principalId: ADMIN_B, model: "admin-b-model" }));

  assert.equal((await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A }))?.model, "admin-a-model");
  assert.equal((await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_B }))?.model, "admin-b-model");
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
