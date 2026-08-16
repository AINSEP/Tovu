import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";

import { openContentDb } from "../content-db";
import { SqlitePublishCredentialSetRepo } from "../publish-credential-repo.sqlite";
import { workspaces } from "../../schema";
import type { PublishCredentialSetRecord } from "../../../features/deployments/publish-credentials/types";

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
