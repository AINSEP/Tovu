import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";

import { openContentDb } from "../content-db.js";
import { SqlitePublishCredentialSetRepo } from "../publish-credential-repo.sqlite.js";
import { workspaces } from "../../schema.js";
import type { PublishCredentialSetRecord } from "#src/features/deployments/publish-credentials/types";

/**
 * @file `SqlitePublishCredentialSetRepo` against a real, migrated `content.db` (`:memory:`) — the
 * thing worth proving here is that migration `0040`'s composite primary key, its real FK to
 * `workspaces`, its `NOT NULL` sealed* columns, and its UNIQUE `(workspace_id, provider_id, label)`
 * index all agree with this adapter's mapping. Mirrors `execution-credential-repo.sqlite.test.ts`'s
 * shape for the sibling ADR-058-pattern table.
 */

const WORKSPACE = "workspace-1";
const OTHER_WORKSPACE = "workspace-2";
const NOW = "2026-08-15T00:00:00.000Z";

function makeRecord(overrides: Partial<PublishCredentialSetRecord> = {}): PublishCredentialSetRecord {
  return {
    workspaceId: WORKSPACE,
    id: "cred-1",
    providerId: "github-pages",
    label: "Main repo",
    sealed: { keyId: "v1", ciphertext: "Y2lwaGVy", nonce: "bm9uY2U=", alg: "aes-256-gcm" },
    isDefault: false,
    accountLabel: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function seedWorkspaces(db: ReturnType<typeof openContentDb>, ids: string[]): void {
  for (const id of ids) {
    db.insert(workspaces).values({ id, name: id, slug: id, createdAt: NOW }).onConflictDoNothing().run();
  }
}

function openSeededDb() {
  const db = openContentDb(":memory:");
  seedWorkspaces(db, [WORKSPACE, OTHER_WORKSPACE]);
  return db;
}

test("findById returns null when no row exists", async () => {
  const repo = new SqlitePublishCredentialSetRepo(openSeededDb());
  assert.equal(await repo.findById({ workspaceId: WORKSPACE, id: "no-such-id" }), null);
});

test("insert then findById round-trips a sealed record exactly", async () => {
  const repo = new SqlitePublishCredentialSetRepo(openSeededDb());
  const record = makeRecord();
  await repo.insert(record);
  const found = await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" });
  assert.deepEqual(found, record);
});

test("listByWorkspace returns every row for that workspace, and none from another", async () => {
  const repo = new SqlitePublishCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord({ id: "cred-1", label: "One" }));
  await repo.insert(makeRecord({ id: "cred-2", label: "Two", providerId: "vercel" }));
  await repo.insert(makeRecord({ id: "cred-3", label: "Other workspace", workspaceId: OTHER_WORKSPACE }));

  const mine = await repo.listByWorkspace({ workspaceId: WORKSPACE });
  assert.equal(mine.length, 2);
  assert.deepEqual(
    mine.map((r) => r.id).sort(),
    ["cred-1", "cred-2"]
  );
});

test("the UNIQUE (workspace_id, provider_id, label) index rejects a duplicate", async () => {
  const repo = new SqlitePublishCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord({ id: "cred-1", label: "Same label" }));
  await assert.rejects(() => repo.insert(makeRecord({ id: "cred-2", label: "Same label" })), /UNIQUE constraint failed/);
});

test("update changes the row in place — a second insert-shaped id never appears", async () => {
  const repo = new SqlitePublishCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord({ label: "Old label" }));
  await repo.update(makeRecord({ label: "New label", updatedAt: "2026-08-15T01:00:00.000Z" }));

  const found = await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" });
  assert.equal(found?.label, "New label");
  assert.equal((await repo.listByWorkspace({ workspaceId: WORKSPACE })).length, 1);
});

test("delete removes the row; deleting a non-existent id is a harmless no-op", async () => {
  const repo = new SqlitePublishCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord());
  await repo.delete({ workspaceId: WORKSPACE, id: "cred-1" });
  assert.equal(await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }), null);

  await repo.delete({ workspaceId: WORKSPACE, id: "cred-1" });
});

test("the table's NOT NULL sealed* columns reject a half-sealed row written outside this adapter", async () => {
  const db = openSeededDb();
  assert.throws(() => {
    db.$client
      .prepare(
        `INSERT INTO publish_credential_sets
           (id, workspace_id, provider_id, label, sealed_key_id, sealed_ciphertext, sealed_nonce, sealed_alg, created_at, updated_at)
         VALUES ('cred-1', ?, 'github-pages', 'x', 'v1', NULL, NULL, NULL, ?, ?)`
      )
      .run(WORKSPACE, NOW, NOW);
  }, /NOT NULL constraint failed/);
});

test("the table's FK rejects a row for a workspace that does not exist", async () => {
  const db = openSeededDb();
  assert.throws(() => {
    db.$client
      .prepare(
        `INSERT INTO publish_credential_sets
           (id, workspace_id, provider_id, label, sealed_key_id, sealed_ciphertext, sealed_nonce, sealed_alg, created_at, updated_at)
         VALUES ('cred-1', 'no-such-workspace', 'github-pages', 'x', 'v1', 'c2VjcmV0', 'bm9uY2U=', 'aes-256-gcm', ?, ?)`
      )
      .run(NOW, NOW);
  }, /FOREIGN KEY constraint failed/);
});

test("deleting a workspace CASCADEs to its credential sets", async () => {
  const db = openSeededDb();
  const repo = new SqlitePublishCredentialSetRepo(db);
  await repo.insert(makeRecord());

  db.delete(workspaces).where(eq(workspaces.id, WORKSPACE)).run();

  assert.equal(await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }), null);
});

test("findDefaultByProvider returns null when the provider has no rows", async () => {
  const repo = new SqlitePublishCredentialSetRepo(openSeededDb());
  assert.equal(await repo.findDefaultByProvider({ workspaceId: WORKSPACE, providerId: "vercel" }), null);
});

test("listByProvider returns only rows for that (workspace, provider) pair", async () => {
  const repo = new SqlitePublishCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord({ id: "cred-1", label: "One", providerId: "vercel" }));
  await repo.insert(makeRecord({ id: "cred-2", label: "Two", providerId: "netlify" }));
  await repo.insert(makeRecord({ id: "cred-3", label: "Three", providerId: "vercel" }));

  const vercelOnly = await repo.listByProvider({ workspaceId: WORKSPACE, providerId: "vercel" });
  assert.deepEqual(
    vercelOnly.map((r) => r.id).sort(),
    ["cred-1", "cred-3"]
  );
});

test("insert with isDefault:true atomically clears isDefault on every OTHER row in the same (workspace, provider) group", async () => {
  const repo = new SqlitePublishCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord({ id: "cred-1", label: "One", providerId: "vercel", isDefault: true }));
  await repo.insert(makeRecord({ id: "cred-2", label: "Two", providerId: "vercel", isDefault: true }));

  const one = await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" });
  const two = await repo.findById({ workspaceId: WORKSPACE, id: "cred-2" });
  assert.equal(one?.isDefault, false, "the previous default must be cleared by the new insert");
  assert.equal(two?.isDefault, true);
  assert.equal((await repo.findDefaultByProvider({ workspaceId: WORKSPACE, providerId: "vercel" }))?.id, "cred-2");
});

test("insert with isDefault:true never touches a DIFFERENT provider's or workspace's default", async () => {
  const repo = new SqlitePublishCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord({ id: "cred-1", label: "One", providerId: "vercel", isDefault: true }));
  await repo.insert(makeRecord({ id: "cred-2", label: "Two", providerId: "netlify", isDefault: true }));
  await repo.insert(makeRecord({ id: "cred-3", label: "Three", providerId: "vercel", workspaceId: OTHER_WORKSPACE, isDefault: true }));

  assert.equal((await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }))?.isDefault, true, "different provider must not be cleared");
  assert.equal((await repo.findById({ workspaceId: OTHER_WORKSPACE, id: "cred-3" }))?.isDefault, true, "different workspace must not be cleared");
});

test("update with isDefault:true atomically clears the previous default in the same group", async () => {
  const repo = new SqlitePublishCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord({ id: "cred-1", label: "One", providerId: "vercel", isDefault: true }));
  await repo.insert(makeRecord({ id: "cred-2", label: "Two", providerId: "vercel", isDefault: false }));

  await repo.update(makeRecord({ id: "cred-2", label: "Two", providerId: "vercel", isDefault: true, updatedAt: "2026-08-15T01:00:00.000Z" }));

  assert.equal((await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }))?.isDefault, false);
  assert.equal((await repo.findById({ workspaceId: WORKSPACE, id: "cred-2" }))?.isDefault, true);
});

test("deleting the default promotes the group's most-recently-updated remaining row", async () => {
  const repo = new SqlitePublishCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord({ id: "cred-1", label: "One", providerId: "vercel", isDefault: true, updatedAt: "2026-08-15T00:00:00.000Z" }));
  await repo.insert(makeRecord({ id: "cred-2", label: "Two", providerId: "vercel", isDefault: false, updatedAt: "2026-08-15T02:00:00.000Z" }));
  await repo.insert(makeRecord({ id: "cred-3", label: "Three", providerId: "vercel", isDefault: false, updatedAt: "2026-08-15T01:00:00.000Z" }));

  await repo.delete({ workspaceId: WORKSPACE, id: "cred-1" });

  const promoted = await repo.findDefaultByProvider({ workspaceId: WORKSPACE, providerId: "vercel" });
  assert.equal(promoted?.id, "cred-2", "the most recently updated remaining row must be promoted, not just any row");
});

test("deleting the LAST row for a provider leaves no default (not an error)", async () => {
  const repo = new SqlitePublishCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord({ id: "cred-1", label: "One", providerId: "vercel", isDefault: true }));

  await repo.delete({ workspaceId: WORKSPACE, id: "cred-1" });

  assert.equal(await repo.findDefaultByProvider({ workspaceId: WORKSPACE, providerId: "vercel" }), null);
});

test("deleting a NON-default row never promotes anything (the real default is untouched)", async () => {
  const repo = new SqlitePublishCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord({ id: "cred-1", label: "One", providerId: "vercel", isDefault: true }));
  await repo.insert(makeRecord({ id: "cred-2", label: "Two", providerId: "vercel", isDefault: false }));

  await repo.delete({ workspaceId: WORKSPACE, id: "cred-2" });

  assert.equal((await repo.findDefaultByProvider({ workspaceId: WORKSPACE, providerId: "vercel" }))?.id, "cred-1");
});

// ---------------------------------------------------------------------------
// account_label (migration 0044, 2026-08-16)
// ---------------------------------------------------------------------------

test("a freshly inserted row starts with accountLabel null", async () => {
  const repo = new SqlitePublishCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord());
  assert.equal((await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }))?.accountLabel, null);
});

test("updateAccountLabel writes ONLY the account_label column — sealed/isDefault/updatedAt are all untouched", async () => {
  const repo = new SqlitePublishCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord({ isDefault: true }));

  await repo.updateAccountLabel({ workspaceId: WORKSPACE, id: "cred-1", accountLabel: "leonaburime-ucla" });

  const found = await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" });
  assert.equal(found?.accountLabel, "leonaburime-ucla");
  assert.equal(found?.isDefault, true, "updateAccountLabel must not disturb isDefault");
  assert.equal(found?.updatedAt, NOW, "updateAccountLabel must not disturb updatedAt — a verify is not a credential change");
  assert.deepEqual(found?.sealed, makeRecord().sealed, "updateAccountLabel must not disturb the sealed connection");
});

test("updateAccountLabel on a non-existent row is a harmless no-op (matches this port's other idempotent-write methods)", async () => {
  const repo = new SqlitePublishCredentialSetRepo(openSeededDb());
  await repo.updateAccountLabel({ workspaceId: WORKSPACE, id: "no-such-id", accountLabel: "someone" });
  // Nothing to assert beyond "did not throw" — there is no row to have changed.
});
