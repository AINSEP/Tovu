import { contentKernel } from "../../content-kernel.js";
import { ensureVaultRepoFixture } from "#src/platform/db/repos/__tests__/vault-repo.fixture";
import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";

import { seedWorkspaces } from "#src/platform/db/kernel/__tests__/content-seeds";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqlSourceControlCredentialSetRepo } from "../../../../features/source-control/source-control-credential-repo.js";
import { openContentDb } from "../../sqlite/content-db.js";
import { SqliteSourceControlCredentialSetRepo } from "../../../../features/source-control/source-control-credential-repo.sqlite.js";
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
    isDefault: true,
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

async function openSeededDb() {
  const db = openContentDb(":memory:");
  seedSqliteWorkspaces(db, [WORKSPACE, OTHER_WORKSPACE]);
  await ensureVaultRepoFixture({ kernel: contentKernel(db) });
  return db;
}

describeEachDialect(
  "SourceControlCredentialSetRepoPort",
  { tables: ["workspaces"], make: (kernel) => ({ kernel, repo: new SqlSourceControlCredentialSetRepo(kernel) }) },
  (make) => {
    async function makeRepo() {
      const { kernel, repo } = make();
      await ensureVaultRepoFixture({ kernel });
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
      await assert.rejects(() => repo.insert(makeRecord({ id: "cred-2", label: "Same label" })), /UNIQUE constraint failed|violates unique constraint|Secrets vault: conflict/);
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
        const sibling = makeRecord({ id: "cred-2", label: "Sibling", isDefault: false, accountLabel: "sibling-account" });
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
    test("account-label guard compares every envelope field and leaves stale probes unchanged", async () => {
      const repo = await makeRepo();
      const record = makeRecord({ isDefault: true });
      await repo.insert(record);
      const before = await repo.vault.find(record);
      for (const field of ["keyId", "ciphertext", "nonce", "alg"] as const) {
        await repo.updateAccountLabel({ ...record, accountLabel: "stale-account", expectedSealed: { ...record.sealed, [field]: "stale" } });
        assert.deepEqual(await repo.vault.find(record), before);
      }
      await repo.updateAccountLabel({ ...record, accountLabel: "verified-account", expectedSealed: record.sealed });
      const after = await repo.vault.find(record);
      assert.equal(after?.meta.accountLabel, "verified-account");
      assert.equal(after?.revision, before!.revision + 1);
      assert.deepEqual(after?.sealed, before?.sealed);
      assert.equal(after?.updatedAt, before?.updatedAt);
    });

    test("JSON account-label patch preserves migration metadata and default state", async () => {
      const repo = await makeRepo();
      const record = makeRecord({ isDefault: true });
      await repo.insert(record);
      const row = (await repo.vault.find(record))!;
      const before = await repo.vault.put({ expectedRevision: row.revision, record: { ...row, revision: row.revision + 1,
        meta: { ...row.meta, migration: { table: "source_control_credential_sets", originalLabel: "Saved" } } } });
      await repo.updateAccountLabel({ ...record, accountLabel: "verified-account", expectedSealed: record.sealed });
      const after = await repo.vault.find(record);
      assert.deepEqual(after?.meta.migration, before.meta.migration);
      assert.deepEqual(after?.sealed, before.sealed);
      assert.equal(after?.isDefault, before.isDefault);
      assert.equal(after?.updatedAt, before.updatedAt);
      assert.equal(after?.revision, before.revision + 1);
    });

    test("rotation racing the targeted JSON patch remains authoritative", async () => {
      const repo = await makeRepo();
      const record = makeRecord({ isDefault: true });
      await repo.insert(record);
      const patch = repo.vault.patchMeta.bind(repo.vault);
      const rotated = { ...record.sealed, ciphertext: "rotated", nonce: "rotated-nonce" };
      repo.vault.patchMeta = async input => {
        const row = (await repo.vault.find(record))!;
        await repo.vault.put({ expectedRevision: row.revision, record: { ...row, sealed: rotated,
          meta: { accountLabel: "new-account" }, revision: row.revision + 1 } });
        return patch(input);
      };
      await repo.updateAccountLabel({ ...record, accountLabel: "stale-account", expectedSealed: record.sealed });
      const after = await repo.vault.find(record);
      assert.equal(after?.meta.accountLabel, "new-account");
      assert.deepEqual(after?.sealed, rotated);
      repo.vault.patchMeta = patch;
    });

    test("default repository lookup uses findDefault and missing account-label patches are no-ops", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ isDefault: true }));
      repo.vault.list = async () => { throw new Error("default lookup must not list siblings"); };
      assert.equal((await repo.findDefaultByProvider({ workspaceId: WORKSPACE, providerId: "github" }))?.id, "cred-1");
      await repo.updateAccountLabel({ workspaceId: WORKSPACE, id: "missing", accountLabel: "ignored" });
      assert.equal(await repo.findById({ workspaceId: WORKSPACE, id: "missing" }), null);
    });
  }
);

// SQLite-only: raw statements test the vault's constraints past its adapter.
test("the vault rejects a half-sealed row written outside the adapter", async () => {
  const db = await openSeededDb();
  assert.throws(() => db.$client.prepare(
    `INSERT INTO secrets_vault (workspace_id,id,kind,owner_key,provider,label,is_default,revision,
      sealed_key_id,sealed_ciphertext,sealed_nonce,sealed_alg,meta,created_at,updated_at)
     VALUES (?, 'cred-1', 'source-control', 'tovu', 'github', 'x', 1, 1, 'v1', NULL, NULL, NULL, '{"accountLabel":null}', ?, ?)`
  ).run(WORKSPACE, NOW, NOW), /CHECK constraint failed/);
});
test("the vault FK rejects a workspace that does not exist", async () => {
  const db = await openSeededDb();
  assert.throws(() => db.$client.prepare(
    `INSERT INTO secrets_vault (workspace_id,id,kind,owner_key,provider,label,is_default,revision,
      sealed_key_id,sealed_ciphertext,sealed_nonce,sealed_alg,meta,created_at,updated_at)
     VALUES ('no-such-workspace', 'cred-1', 'source-control', 'tovu', 'github', 'x', 1, 1,
      'v1', 'cipher', 'nonce', 'aes-256-gcm', '{"accountLabel":null}', ?, ?)`
  ).run(NOW, NOW), /FOREIGN KEY constraint failed/);
});

test("deleting a workspace CASCADEs to its credential sets", async () => {
  const db = await openSeededDb();
  const repo = new SqliteSourceControlCredentialSetRepo(contentKernel(db));
  await repo.insert(makeRecord());

  db.delete(workspaces).where(eq(workspaces.id, WORKSPACE)).run();

  assert.equal(await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }), null);
});
