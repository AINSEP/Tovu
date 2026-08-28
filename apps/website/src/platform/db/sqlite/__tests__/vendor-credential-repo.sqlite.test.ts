import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";

import { openContentDb } from "../content-db.js";
import { SqliteVendorCredentialSetRepo } from "../vendor-credential-repo.sqlite.js";
import { workspaces } from "../../schema.js";
import type { VendorCredentialSetRecord } from "#src/features/vendor-credentials/types";

/**
 * @file `SqliteVendorCredentialSetRepo` against a real, migrated `content.db` (`:memory:`) — mirrors
 * `publish-credential-repo.sqlite.test.ts`'s own shape byte-for-byte (`providerId` -> `vendorId`,
 * `findDefaultByProvider`/`listByProvider` -> `findDefaultByVendor`/`listByVendor`), plus coverage
 * for the one genuinely new column, `token_tail` (`NOT NULL`, unlike `account_label`).
 */

const WORKSPACE = "workspace-1";
const OTHER_WORKSPACE = "workspace-2";
const NOW = "2026-08-16T00:00:00.000Z";

function makeRecord(overrides: Partial<VendorCredentialSetRecord> = {}): VendorCredentialSetRecord {
  return {
    workspaceId: WORKSPACE,
    id: "cred-1",
    vendorId: "github",
    label: "Main account",
    sealed: { keyId: "v1", ciphertext: "Y2lwaGVy", nonce: "bm9uY2U=", alg: "aes-256-gcm" },
    tokenTail: "WXYZ",
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
  const repo = new SqliteVendorCredentialSetRepo(openSeededDb());
  assert.equal(await repo.findById({ workspaceId: WORKSPACE, id: "no-such-id" }), null);
});

test("insert then findById round-trips a sealed record exactly, including tokenTail", async () => {
  const repo = new SqliteVendorCredentialSetRepo(openSeededDb());
  const record = makeRecord();
  await repo.insert(record);
  const found = await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" });
  assert.deepEqual(found, record);
});

test("listByWorkspace returns every row for that workspace, and none from another", async () => {
  const repo = new SqliteVendorCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord({ id: "cred-1", label: "One" }));
  await repo.insert(makeRecord({ id: "cred-2", label: "Two", vendorId: "vercel" }));
  await repo.insert(makeRecord({ id: "cred-3", label: "Other workspace", workspaceId: OTHER_WORKSPACE }));

  const mine = await repo.listByWorkspace({ workspaceId: WORKSPACE });
  assert.equal(mine.length, 2);
  assert.deepEqual(
    mine.map((r) => r.id).sort(),
    ["cred-1", "cred-2"]
  );
});

test("the UNIQUE (workspace_id, vendor_id, label) index rejects a duplicate", async () => {
  const repo = new SqliteVendorCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord({ id: "cred-1", label: "Same label" }));
  await assert.rejects(() => repo.insert(makeRecord({ id: "cred-2", label: "Same label" })), /UNIQUE constraint failed/);
});

test("update changes the row in place — a second insert-shaped id never appears", async () => {
  const repo = new SqliteVendorCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord({ label: "Old label" }));
  await repo.update(makeRecord({ label: "New label", tokenTail: "9999", updatedAt: "2026-08-16T01:00:00.000Z" }));

  const found = await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" });
  assert.equal(found?.label, "New label");
  assert.equal(found?.tokenTail, "9999");
  assert.equal((await repo.listByWorkspace({ workspaceId: WORKSPACE })).length, 1);
});

test("delete removes the row; deleting a non-existent id is a harmless no-op", async () => {
  const repo = new SqliteVendorCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord());
  await repo.delete({ workspaceId: WORKSPACE, id: "cred-1" });
  assert.equal(await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }), null);

  await repo.delete({ workspaceId: WORKSPACE, id: "cred-1" });
});

test("the table's NOT NULL token_tail column rejects a row written outside this adapter without one", async () => {
  const db = openSeededDb();
  assert.throws(() => {
    db.$client
      .prepare(
        `INSERT INTO vendor_credential_sets
           (id, workspace_id, vendor_id, label, sealed_key_id, sealed_ciphertext, sealed_nonce, sealed_alg, token_tail, created_at, updated_at)
         VALUES ('cred-1', ?, 'github', 'x', 'v1', 'c2VjcmV0', 'bm9uY2U=', 'aes-256-gcm', NULL, ?, ?)`
      )
      .run(WORKSPACE, NOW, NOW);
  }, /NOT NULL constraint failed/);
});

test("the table's FK rejects a row for a workspace that does not exist", async () => {
  const db = openSeededDb();
  assert.throws(() => {
    db.$client
      .prepare(
        `INSERT INTO vendor_credential_sets
           (id, workspace_id, vendor_id, label, sealed_key_id, sealed_ciphertext, sealed_nonce, sealed_alg, token_tail, created_at, updated_at)
         VALUES ('cred-1', 'no-such-workspace', 'github', 'x', 'v1', 'c2VjcmV0', 'bm9uY2U=', 'aes-256-gcm', 'abcd', ?, ?)`
      )
      .run(NOW, NOW);
  }, /FOREIGN KEY constraint failed/);
});

test("deleting a workspace CASCADEs to its credential sets", async () => {
  const db = openSeededDb();
  const repo = new SqliteVendorCredentialSetRepo(db);
  await repo.insert(makeRecord());

  db.delete(workspaces).where(eq(workspaces.id, WORKSPACE)).run();

  assert.equal(await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }), null);
});

test("findDefaultByVendor returns null when the vendor has no rows", async () => {
  const repo = new SqliteVendorCredentialSetRepo(openSeededDb());
  assert.equal(await repo.findDefaultByVendor({ workspaceId: WORKSPACE, vendorId: "vercel" }), null);
});

test("listByVendor returns only rows for that (workspace, vendor) pair", async () => {
  const repo = new SqliteVendorCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord({ id: "cred-1", label: "One", vendorId: "vercel" }));
  await repo.insert(makeRecord({ id: "cred-2", label: "Two", vendorId: "netlify" }));
  await repo.insert(makeRecord({ id: "cred-3", label: "Three", vendorId: "vercel" }));

  const vercelOnly = await repo.listByVendor({ workspaceId: WORKSPACE, vendorId: "vercel" });
  assert.deepEqual(
    vercelOnly.map((r) => r.id).sort(),
    ["cred-1", "cred-3"]
  );
});

test("insert with isDefault:true atomically clears isDefault on every OTHER row in the same (workspace, vendor) group", async () => {
  const repo = new SqliteVendorCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord({ id: "cred-1", label: "One", vendorId: "vercel", isDefault: true }));
  await repo.insert(makeRecord({ id: "cred-2", label: "Two", vendorId: "vercel", isDefault: true }));

  const one = await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" });
  const two = await repo.findById({ workspaceId: WORKSPACE, id: "cred-2" });
  assert.equal(one?.isDefault, false, "the previous default must be cleared by the new insert");
  assert.equal(two?.isDefault, true);
  assert.equal((await repo.findDefaultByVendor({ workspaceId: WORKSPACE, vendorId: "vercel" }))?.id, "cred-2");
});

test("insert with isDefault:true never touches a DIFFERENT vendor's or workspace's default", async () => {
  const repo = new SqliteVendorCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord({ id: "cred-1", label: "One", vendorId: "vercel", isDefault: true }));
  await repo.insert(makeRecord({ id: "cred-2", label: "Two", vendorId: "netlify", isDefault: true }));
  await repo.insert(makeRecord({ id: "cred-3", label: "Three", vendorId: "vercel", workspaceId: OTHER_WORKSPACE, isDefault: true }));

  assert.equal((await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }))?.isDefault, true, "different vendor must not be cleared");
  assert.equal((await repo.findById({ workspaceId: OTHER_WORKSPACE, id: "cred-3" }))?.isDefault, true, "different workspace must not be cleared");
});

test("update with isDefault:true atomically clears the previous default in the same group", async () => {
  const repo = new SqliteVendorCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord({ id: "cred-1", label: "One", vendorId: "vercel", isDefault: true }));
  await repo.insert(makeRecord({ id: "cred-2", label: "Two", vendorId: "vercel", isDefault: false }));

  await repo.update(makeRecord({ id: "cred-2", label: "Two", vendorId: "vercel", isDefault: true, updatedAt: "2026-08-16T01:00:00.000Z" }));

  assert.equal((await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }))?.isDefault, false);
  assert.equal((await repo.findById({ workspaceId: WORKSPACE, id: "cred-2" }))?.isDefault, true);
});

test("deleting the default promotes the group's most-recently-updated remaining row", async () => {
  const repo = new SqliteVendorCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord({ id: "cred-1", label: "One", vendorId: "vercel", isDefault: true, updatedAt: "2026-08-16T00:00:00.000Z" }));
  await repo.insert(makeRecord({ id: "cred-2", label: "Two", vendorId: "vercel", isDefault: false, updatedAt: "2026-08-16T02:00:00.000Z" }));
  await repo.insert(makeRecord({ id: "cred-3", label: "Three", vendorId: "vercel", isDefault: false, updatedAt: "2026-08-16T01:00:00.000Z" }));

  await repo.delete({ workspaceId: WORKSPACE, id: "cred-1" });

  const promoted = await repo.findDefaultByVendor({ workspaceId: WORKSPACE, vendorId: "vercel" });
  assert.equal(promoted?.id, "cred-2", "the most recently updated remaining row must be promoted, not just any row");
});

test("deleting the LAST row for a vendor leaves no default (not an error)", async () => {
  const repo = new SqliteVendorCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord({ id: "cred-1", label: "One", vendorId: "vercel", isDefault: true }));

  await repo.delete({ workspaceId: WORKSPACE, id: "cred-1" });

  assert.equal(await repo.findDefaultByVendor({ workspaceId: WORKSPACE, vendorId: "vercel" }), null);
});

test("deleting a NON-default row never promotes anything (the real default is untouched)", async () => {
  const repo = new SqliteVendorCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord({ id: "cred-1", label: "One", vendorId: "vercel", isDefault: true }));
  await repo.insert(makeRecord({ id: "cred-2", label: "Two", vendorId: "vercel", isDefault: false }));

  await repo.delete({ workspaceId: WORKSPACE, id: "cred-2" });

  assert.equal((await repo.findDefaultByVendor({ workspaceId: WORKSPACE, vendorId: "vercel" }))?.id, "cred-1");
});

test("a freshly inserted row starts with accountLabel null", async () => {
  const repo = new SqliteVendorCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord());
  assert.equal((await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }))?.accountLabel, null);
});

test("updateAccountLabel writes ONLY the account_label column — sealed/tokenTail/isDefault/updatedAt are all untouched", async () => {
  const repo = new SqliteVendorCredentialSetRepo(openSeededDb());
  await repo.insert(makeRecord({ isDefault: true }));

  await repo.updateAccountLabel({ workspaceId: WORKSPACE, id: "cred-1", accountLabel: "leonaburime-ucla" });

  const found = await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" });
  assert.equal(found?.accountLabel, "leonaburime-ucla");
  assert.equal(found?.isDefault, true, "updateAccountLabel must not disturb isDefault");
  assert.equal(found?.tokenTail, "WXYZ", "updateAccountLabel must not disturb tokenTail");
  assert.equal(found?.updatedAt, NOW, "updateAccountLabel must not disturb updatedAt — a verify is not a credential change");
  assert.deepEqual(found?.sealed, makeRecord().sealed, "updateAccountLabel must not disturb the sealed connection");
});

test("updateAccountLabel on a non-existent row is a harmless no-op", async () => {
  const repo = new SqliteVendorCredentialSetRepo(openSeededDb());
  await repo.updateAccountLabel({ workspaceId: WORKSPACE, id: "no-such-id", accountLabel: "someone" });
});
