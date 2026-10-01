import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";

import { seedWorkspaces } from "#src/platform/db/kernel/__tests__/content-seeds";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqlSourceControlCredentialSetRepo } from "../source-control-credential-repo.js";
import { openContentDb } from "../../sqlite/content-db.js";
import { SqliteSourceControlCredentialSetRepo } from "../../sqlite/source-control-credential-repo.sqlite.js";
import { workspaces } from "../../schema.sqlite.js";
import type { SourceControlCredentialSetRecord } from "#src/features/source-control/types";

/**
 * @file `SqlSourceControlCredentialSetRepo` against a real, migrated content database on every dialect (the raw-SQL constraint probes at the end: SQLite only) —
 * mirrors `publish-credential-repo.test.ts`'s coverage shape exactly, proving migration
 * `0042`'s composite primary key, its real FK to `workspaces`, its `NOT NULL` sealed* columns, and
 * its UNIQUE `(workspace_id, provider_id, label)` index all agree with this adapter's mapping.
 */

const WORKSPACE = "workspace-1";
const OTHER_WORKSPACE = "workspace-2";
const NOW = "2026-08-15T00:00:00.000Z";

function makeRecord(overrides: Partial<SourceControlCredentialSetRecord> = {}): SourceControlCredentialSetRecord {
  return {
    workspaceId: WORKSPACE,
    id: "cred-1",
    providerId: "github",
    label: "default",
    sealed: { keyId: "v1", ciphertext: "Y2lwaGVy", nonce: "bm9uY2U=", alg: "aes-256-gcm" },
    isDefault: false,
    accountLabel: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function seedSqliteWorkspaces(db: ReturnType<typeof openContentDb>, ids: string[]): void {
  for (const id of ids) {
    db.insert(workspaces).values({ id, name: id, slug: id, createdAt: NOW }).onConflictDoNothing().run();
  }
}

function openSeededDb() {
  const db = openContentDb(":memory:");
  seedSqliteWorkspaces(db, [WORKSPACE, OTHER_WORKSPACE]);
  return db;
}

describeEachDialect(
  "SourceControlCredentialSetRepoPort",
  { tables: ["source_control_credential_sets", "workspaces"], make: (kernel) => ({ kernel, repo: new SqlSourceControlCredentialSetRepo(kernel) }) },
  (make) => {
    async function makeRepo() {
      const { kernel, repo } = make();
      await seedWorkspaces(kernel, [WORKSPACE, OTHER_WORKSPACE]);
      return repo;
    }

    test("findById returns null when no row exists", async () => {
      const repo = await makeRepo();
      assert.equal(await repo.findById({ workspaceId: WORKSPACE, id: "no-such-id" }), null);
    });

    test("insert then findById round-trips a sealed record exactly", async () => {
      const repo = await makeRepo();
      const record = makeRecord();
      await repo.insert(record);
      const found = await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" });
      assert.deepEqual(found, record);
    });

    test("listByWorkspace returns every row for that workspace, and none from another", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ id: "cred-1", label: "One" }));
      await repo.insert(makeRecord({ id: "cred-2", label: "Two", providerId: "gitlab" }));
      await repo.insert(makeRecord({ id: "cred-3", label: "Other workspace", workspaceId: OTHER_WORKSPACE }));

      const mine = await repo.listByWorkspace({ workspaceId: WORKSPACE });
      assert.equal(mine.length, 2);
      assert.deepEqual(
        mine.map((r) => r.id).sort(),
        ["cred-1", "cred-2"]
      );
    });

    test("the UNIQUE (workspace_id, provider_id, label) index rejects a duplicate", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ id: "cred-1", label: "Same label" }));
      await assert.rejects(() => repo.insert(makeRecord({ id: "cred-2", label: "Same label" })), /UNIQUE constraint failed|violates unique constraint/);
    });

    test("update changes the row in place — a second insert-shaped id never appears", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ label: "Old label" }));
        const rotated = makeRecord({
          label: "New label",
          sealed: { keyId: "rotation-key", ciphertext: "cm90YXRlZC1zZWNyZXQ=", nonce: "cm90YXRlZC1ub25jZQ==", alg: "aes-256-gcm" },
          updatedAt: "2026-08-15T01:00:00.000Z",
        });
        await repo.update(rotated);

      const found = await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" });
        assert.equal(found?.label, "New label");
        assert.deepEqual(found, rotated);
      assert.equal((await repo.listByWorkspace({ workspaceId: WORKSPACE })).length, 1);
    });

    test("delete removes the row; deleting a non-existent id is a harmless no-op", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord());
      await repo.delete({ workspaceId: WORKSPACE, id: "cred-1" });
      assert.equal(await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }), null);

      await repo.delete({ workspaceId: WORKSPACE, id: "cred-1" });
    });

    test("findDefaultByProvider returns null when the provider has no rows", async () => {
      const repo = await makeRepo();
      assert.equal(await repo.findDefaultByProvider({ workspaceId: WORKSPACE, providerId: "gitlab" }), null);
    });

    test("listByProvider returns only rows for that (workspace, provider) pair", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ id: "cred-1", label: "One", providerId: "gitlab" }));
      await repo.insert(makeRecord({ id: "cred-2", label: "Two", providerId: "bitbucket" }));
      await repo.insert(makeRecord({ id: "cred-3", label: "Three", providerId: "gitlab" }));

      const gitlabOnly = await repo.listByProvider({ workspaceId: WORKSPACE, providerId: "gitlab" });
      assert.deepEqual(
        gitlabOnly.map((r) => r.id).sort(),
        ["cred-1", "cred-3"]
      );
    });

    test("insert with isDefault:true atomically clears isDefault on every OTHER row in the same (workspace, provider) group", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ id: "cred-1", label: "One", providerId: "gitlab", isDefault: true }));
      await repo.insert(makeRecord({ id: "cred-2", label: "Two", providerId: "gitlab", isDefault: true }));

      const one = await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" });
      const two = await repo.findById({ workspaceId: WORKSPACE, id: "cred-2" });
      assert.equal(one?.isDefault, false, "the previous default must be cleared by the new insert");
      assert.equal(two?.isDefault, true);
      assert.equal((await repo.findDefaultByProvider({ workspaceId: WORKSPACE, providerId: "gitlab" }))?.id, "cred-2");
    });

    test("insert with isDefault:true never touches a DIFFERENT provider's or workspace's default", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ id: "cred-1", label: "One", providerId: "gitlab", isDefault: true }));
      await repo.insert(makeRecord({ id: "cred-2", label: "Two", providerId: "bitbucket", isDefault: true }));
      await repo.insert(makeRecord({ id: "cred-3", label: "Three", providerId: "gitlab", workspaceId: OTHER_WORKSPACE, isDefault: true }));

      assert.equal((await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }))?.isDefault, true, "different provider must not be cleared");
      assert.equal((await repo.findById({ workspaceId: OTHER_WORKSPACE, id: "cred-3" }))?.isDefault, true, "different workspace must not be cleared");
    });

    test("update with isDefault:true atomically clears the previous default in the same group", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ id: "cred-1", label: "One", providerId: "gitlab", isDefault: true }));
      await repo.insert(makeRecord({ id: "cred-2", label: "Two", providerId: "gitlab", isDefault: false }));

      await repo.update(makeRecord({ id: "cred-2", label: "Two", providerId: "gitlab", isDefault: true, updatedAt: "2026-08-15T01:00:00.000Z" }));

      assert.equal((await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }))?.isDefault, false);
      assert.equal((await repo.findById({ workspaceId: WORKSPACE, id: "cred-2" }))?.isDefault, true);
    });

    test("deleting the default promotes the group's most-recently-updated remaining row", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ id: "cred-1", label: "One", providerId: "gitlab", isDefault: true, updatedAt: "2026-08-15T00:00:00.000Z" }));
      await repo.insert(makeRecord({ id: "cred-2", label: "Two", providerId: "gitlab", isDefault: false, updatedAt: "2026-08-15T02:00:00.000Z" }));
      await repo.insert(makeRecord({ id: "cred-3", label: "Three", providerId: "gitlab", isDefault: false, updatedAt: "2026-08-15T01:00:00.000Z" }));

      await repo.delete({ workspaceId: WORKSPACE, id: "cred-1" });

      const promoted = await repo.findDefaultByProvider({ workspaceId: WORKSPACE, providerId: "gitlab" });
      assert.equal(promoted?.id, "cred-2", "the most recently updated remaining row must be promoted, not just any row");
    });

    test("deleting the LAST row for a provider leaves no default (not an error)", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ id: "cred-1", label: "One", providerId: "gitlab", isDefault: true }));

      await repo.delete({ workspaceId: WORKSPACE, id: "cred-1" });

      assert.equal(await repo.findDefaultByProvider({ workspaceId: WORKSPACE, providerId: "gitlab" }), null);
    });

    test("deleting a NON-default row never promotes anything (the real default is untouched)", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ id: "cred-1", label: "One", providerId: "gitlab", isDefault: true }));
      await repo.insert(makeRecord({ id: "cred-2", label: "Two", providerId: "gitlab", isDefault: false }));

      await repo.delete({ workspaceId: WORKSPACE, id: "cred-2" });

      assert.equal((await repo.findDefaultByProvider({ workspaceId: WORKSPACE, providerId: "gitlab" }))?.id, "cred-1");
    });

    test("bitbucket rows round-trip their sealed (token, username) pair like any other provider — this table has no per-field username column", async () => {
      const repo = await makeRepo();
      const record = makeRecord({ id: "cred-1", providerId: "bitbucket" });
      await repo.insert(record);
      const found = await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" });
      assert.equal(found?.providerId, "bitbucket");
      // The username lives inside the sealed JSON blob (`store.ts`'s job to put it there), never as its
      // own column — this adapter only ever moves the opaque sealed group in and out.
      assert.equal(found?.sealed.ciphertext, record.sealed.ciphertext);
    });

    // ---------------------------------------------------------------------------
    // account_label (migration 0044, 2026-08-16)
    // ---------------------------------------------------------------------------

    test("a freshly inserted row starts with accountLabel null", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord());
      assert.equal((await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }))?.accountLabel, null);
    });

      test("updateAccountLabel changes only its targeted column and isolates sibling rows", async () => {
        const repo = await makeRepo();
        const target = makeRecord({ isDefault: true });
        const sibling = makeRecord({ id: "cred-2", label: "Sibling", accountLabel: "sibling-account" });
        const foreign = makeRecord({ workspaceId: OTHER_WORKSPACE, label: "Foreign", accountLabel: "foreign-account", isDefault: true });
        for (const row of [target, sibling, foreign]) await repo.insert(row);
        await repo.updateAccountLabel({ workspaceId: WORKSPACE, id: target.id, accountLabel: "verified-account" });
        assert.deepEqual(await repo.findById(target), { ...target, accountLabel: "verified-account" });
        assert.deepEqual(await repo.findById(sibling), sibling);
        assert.deepEqual(await repo.findById(foreign), foreign);
      });

      test("a non-null accountLabel round-trips through insert/update exactly (store.ts's job to populate it — this adapter just moves it)", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ accountLabel: "leonaburime-ucla" }));
      assert.equal((await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }))?.accountLabel, "leonaburime-ucla");

      await repo.update(makeRecord({ accountLabel: null, updatedAt: "2026-08-15T01:00:00.000Z" }));
      assert.equal((await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }))?.accountLabel, null, "update must be able to reset it back to null (a new connection resets it — store.ts's job)");
    });
  }
);

// SQLite-only: raw statements past the adapter, probing the schema's own constraints.

test("the table's NOT NULL sealed* columns reject a half-sealed row written outside this adapter", async () => {
  const db = openSeededDb();
  assert.throws(() => {
    db.$client
      .prepare(
        `INSERT INTO source_control_credential_sets
           (id, workspace_id, provider_id, label, sealed_key_id, sealed_ciphertext, sealed_nonce, sealed_alg, created_at, updated_at)
         VALUES ('cred-1', ?, 'github', 'x', 'v1', NULL, NULL, NULL, ?, ?)`
      )
      .run(WORKSPACE, NOW, NOW);
  }, /NOT NULL constraint failed/);
});

test("the table's FK rejects a row for a workspace that does not exist", async () => {
  const db = openSeededDb();
  assert.throws(() => {
    db.$client
      .prepare(
        `INSERT INTO source_control_credential_sets
           (id, workspace_id, provider_id, label, sealed_key_id, sealed_ciphertext, sealed_nonce, sealed_alg, created_at, updated_at)
         VALUES ('cred-1', 'no-such-workspace', 'github', 'x', 'v1', 'c2VjcmV0', 'bm9uY2U=', 'aes-256-gcm', ?, ?)`
      )
      .run(NOW, NOW);
  }, /FOREIGN KEY constraint failed/);
});

test("deleting a workspace CASCADEs to its credential sets", async () => {
  const db = openSeededDb();
  const repo = new SqliteSourceControlCredentialSetRepo(db);
  await repo.insert(makeRecord());

  db.delete(workspaces).where(eq(workspaces.id, WORKSPACE)).run();

  assert.equal(await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }), null);
});
