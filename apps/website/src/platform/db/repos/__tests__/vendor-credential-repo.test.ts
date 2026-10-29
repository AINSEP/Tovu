import { contentKernel } from "../../content-kernel.js";
import { ensureVaultRepoFixture } from "#src/platform/db/repos/__tests__/vault-repo.fixture";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { InMemoryVendorCredentialSetRepo } from "#src/features/deployments/publish-credentials/repo.memory";
import type { VendorCredentialSetRepoPort } from "#src/features/vendor-credentials/types";
import { eq } from "drizzle-orm";

import { seedWorkspaces } from "#src/platform/db/kernel/__tests__/content-seeds";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqlVendorCredentialSetRepo } from "../../../../features/vendor-credentials/vendor-credential-repo.js";
import { openContentDb } from "../../sqlite/content-db.js";
import { SqliteVendorCredentialSetRepo } from "../../../../features/vendor-credentials/vendor-credential-repo.sqlite.js";
import { workspaces } from "../../schema.sqlite.js";
import type { VendorCredentialSetRecord } from "#src/features/vendor-credentials/types";
import type { VendorCredentialSetVaultRepo } from "#src/features/vendor-credentials/vault-adapter";

/**
 * @file `SqlVendorCredentialSetRepo` against a real, migrated content database on every dialect (the raw-SQL constraint probes at the end: SQLite only) — mirrors
 * `publish-credential-repo.test.ts`'s own shape byte-for-byte (`providerId` -> `vendorId`,
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
    credentialType: "vendor",
    worksFor: [overrides.vendorId ?? "github"],
    label: "Main account",
    sealed: { keyId: "v1", ciphertext: "Y2lwaGVy", nonce: "bm9uY2U=", alg: "aes-256-gcm" },
    tokenTail: "",
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

/** Store saves record the hint in the vault (the sealed-DTO port cannot carry one); seed it there. */
async function seedHint(repo: VendorCredentialSetRepoPort, id = "cred-1"): Promise<void> {
  const { vault } = repo as VendorCredentialSetVaultRepo;
  const row = (await vault.find({ workspaceId: WORKSPACE, id }))!;
  await vault.put({ expectedRevision: row.revision, record: { ...row, last4: "WXYZ", tokenLength: 20, revision: row.revision + 1 } });
}

// The same behavioral contract covers Jini memory and the persisted dialect adapters; only
// SQL adapters need workspace seeding. Raw schema constraints stay in the SQLite-only tests below.
function registerRepoContract(
  required: { makeRepo: () => Promise<VendorCredentialSetRepoPort> },
  _optional: Record<string, never> = {}
): void {
  const { makeRepo } = required;
    test("findById returns null when no row exists", async () => {
      const repo = await makeRepo();
      assert.equal(await repo.findById({ workspaceId: WORKSPACE, id: "no-such-id" }), null);
    });

    test("insert then findById round-trips a sealed record exactly, including tokenTail", async () => {
      const repo = await makeRepo();
      const record = makeRecord();
      await repo.insert(record);
      const found = await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" });
      assert.deepEqual(found, record, "a sealed DTO insert carries no hint, so its tail is empty");
      await seedHint(repo);
      assert.deepEqual(await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }), { ...record, tokenTail: "WXYZ" });
    });


    test("listByWorkspace returns every row for that workspace, and none from another", async () => {
      const repo = await makeRepo();
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
      const repo = await makeRepo();
      await repo.insert(makeRecord({ id: "cred-1", label: "Same label" }));
      await assert.rejects(() => repo.insert(makeRecord({ id: "cred-2", label: "Same label" })), /UNIQUE constraint failed|violates unique constraint|Secrets vault: conflict/);
    });

    test("update changes the row in place — a second insert-shaped id never appears", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ label: "Old label" }));
      await seedHint(repo);
      await repo.update(makeRecord({ label: "Same envelope", tokenTail: "WXYZ" }));
      assert.equal((await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }))?.tokenTail, "WXYZ", "an unchanged envelope keeps its hint");
        const rotated = makeRecord({
          label: "New label",
          tokenTail: "",
          sealed: { keyId: "rotation-key", ciphertext: "cm90YXRlZC12ZW5kb3I=", nonce: "cm90YXRlZC1ub25jZQ==", alg: "aes-256-gcm" },
          updatedAt: "2026-08-16T01:00:00.000Z",
        });
        await repo.update(rotated);

      const found = await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" });
      assert.equal(found?.label, "New label");
        assert.equal(found?.tokenTail, "", "a new envelope drops the old envelope's hint");
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

    test("findDefaultByVendor returns null when the vendor has no rows", async () => {
      const repo = await makeRepo();
      assert.equal(await repo.findDefaultByVendor({ workspaceId: WORKSPACE, vendorId: "vercel" }), null);
    });

    test("listByVendor returns only rows for that (workspace, vendor) pair", async () => {
      const repo = await makeRepo();
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
      const repo = await makeRepo();
      await repo.insert(makeRecord({ id: "cred-1", label: "One", vendorId: "vercel", isDefault: true }));
      await repo.insert(makeRecord({ id: "cred-2", label: "Two", vendorId: "vercel", isDefault: true }));

      const one = await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" });
      const two = await repo.findById({ workspaceId: WORKSPACE, id: "cred-2" });
      assert.equal(one?.isDefault, false, "the previous default must be cleared by the new insert");
      assert.equal(two?.isDefault, true);
      assert.equal((await repo.findDefaultByVendor({ workspaceId: WORKSPACE, vendorId: "vercel" }))?.id, "cred-2");
    });

    test("insert with isDefault:true never touches a DIFFERENT vendor's or workspace's default", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ id: "cred-1", label: "One", vendorId: "vercel", isDefault: true }));
      await repo.insert(makeRecord({ id: "cred-2", label: "Two", vendorId: "netlify", isDefault: true }));
      await repo.insert(makeRecord({ id: "cred-3", label: "Three", vendorId: "vercel", workspaceId: OTHER_WORKSPACE, isDefault: true }));

      assert.equal((await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }))?.isDefault, true, "different vendor must not be cleared");
      assert.equal((await repo.findById({ workspaceId: OTHER_WORKSPACE, id: "cred-3" }))?.isDefault, true, "different workspace must not be cleared");
    });

    test("update with isDefault:true atomically clears the previous default in the same group", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ id: "cred-1", label: "One", vendorId: "vercel", isDefault: true }));
      await repo.insert(makeRecord({ id: "cred-2", label: "Two", vendorId: "vercel", isDefault: false }));

      await repo.update(makeRecord({ id: "cred-2", label: "Two", vendorId: "vercel", isDefault: true, updatedAt: "2026-08-16T01:00:00.000Z" }));

      assert.equal((await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }))?.isDefault, false);
      assert.equal((await repo.findById({ workspaceId: WORKSPACE, id: "cred-2" }))?.isDefault, true);
    });

    test("deleting the default promotes the group's most-recently-updated remaining row", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ id: "cred-1", label: "One", vendorId: "vercel", isDefault: true, updatedAt: "2026-08-16T00:00:00.000Z" }));
      await repo.insert(makeRecord({ id: "cred-2", label: "Two", vendorId: "vercel", isDefault: false, updatedAt: "2026-08-16T02:00:00.000Z" }));
      await repo.insert(makeRecord({ id: "cred-3", label: "Three", vendorId: "vercel", isDefault: false, updatedAt: "2026-08-16T01:00:00.000Z" }));

      await repo.delete({ workspaceId: WORKSPACE, id: "cred-1" });

      const promoted = await repo.findDefaultByVendor({ workspaceId: WORKSPACE, vendorId: "vercel" });
      assert.equal(promoted?.id, "cred-2", "the most recently updated remaining row must be promoted, not just any row");
    });

    test("deleting the LAST row for a vendor leaves no default (not an error)", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ id: "cred-1", label: "One", vendorId: "vercel", isDefault: true }));

      await repo.delete({ workspaceId: WORKSPACE, id: "cred-1" });

      assert.equal(await repo.findDefaultByVendor({ workspaceId: WORKSPACE, vendorId: "vercel" }), null);
    });

    test("deleting a NON-default row never promotes anything (the real default is untouched)", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ id: "cred-1", label: "One", vendorId: "vercel", isDefault: true }));
      await repo.insert(makeRecord({ id: "cred-2", label: "Two", vendorId: "vercel", isDefault: false }));

      await repo.delete({ workspaceId: WORKSPACE, id: "cred-2" });

      assert.equal((await repo.findDefaultByVendor({ workspaceId: WORKSPACE, vendorId: "vercel" }))?.id, "cred-1");
    });

    test("a freshly inserted row starts with accountLabel null", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord());
      assert.equal((await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }))?.accountLabel, null);
    });

    test("updateAccountLabel writes ONLY the account_label column — sealed/tokenTail/isDefault/updatedAt are all untouched", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ isDefault: true }));
      await seedHint(repo);

      await repo.updateAccountLabel({ workspaceId: WORKSPACE, id: "cred-1", accountLabel: "leonaburime-ucla" });

      const found = await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" });
      assert.equal(found?.accountLabel, "leonaburime-ucla");
      assert.equal(found?.isDefault, true, "updateAccountLabel must not disturb isDefault");
      assert.equal(found?.tokenTail, "WXYZ", "updateAccountLabel must not disturb tokenTail");
      const row = await (repo as VendorCredentialSetVaultRepo).vault.find({ workspaceId: WORKSPACE, id: "cred-1" });
      assert.deepEqual([row?.last4, row?.tokenLength], ["WXYZ", 20]);
      assert.equal(found?.updatedAt, NOW, "updateAccountLabel must not disturb updatedAt — a verify is not a credential change");
      assert.deepEqual(found?.sealed, makeRecord().sealed, "updateAccountLabel must not disturb the sealed connection");
    });

      test("updateAccountLabel on a non-existent row is a harmless no-op", async () => {
        const repo = await makeRepo();
        const rows = [
          makeRecord({ accountLabel: "first-account", isDefault: true }),
          makeRecord({ id: "cred-2", label: "Sibling", isDefault: false, accountLabel: "second-account" }),
          makeRecord({ workspaceId: OTHER_WORKSPACE, label: "Foreign", accountLabel: "foreign-account" }),
        ];
        for (const row of rows) await repo.insert(row);
        await repo.updateAccountLabel({ workspaceId: WORKSPACE, id: "no-such-id", accountLabel: "someone" });
        for (const row of rows) assert.deepEqual(await repo.findById(row), row);
      });
}

describe("VendorCredentialSetRepoPort (Jini memory)", () => {
  registerRepoContract({ makeRepo: async () => new InMemoryVendorCredentialSetRepo({}) });
});

describeEachDialect(
  "VendorCredentialSetRepoPort",
  { tables: ["workspaces"], make: (kernel) => ({ kernel, repo: new SqlVendorCredentialSetRepo(kernel) }) },
  (make) => {
    async function makeRepo() {
      const { kernel, repo } = make();
      await ensureVaultRepoFixture({ kernel });
      await seedWorkspaces(kernel, [WORKSPACE, OTHER_WORKSPACE]);
      return repo;
    }

    registerRepoContract({ makeRepo });
  }
);

// SQLite-only: raw statements test the vault's constraints past its adapter.
test("the vault rejects a half-sealed row written outside the adapter", async () => {
  const db = await openSeededDb();
  assert.throws(() => db.$client.prepare(
    `INSERT INTO secrets_vault (workspace_id,id,kind,owner_key,provider,label,is_default,revision,
      sealed_key_id,sealed_ciphertext,sealed_nonce,sealed_alg,meta,created_at,updated_at)
     VALUES (?, 'cred-1', 'vendor', 'tovu', 'github', 'x', 1, 1, 'v1', NULL, NULL, NULL, '{"accountLabel":null}', ?, ?)`
  ).run(WORKSPACE, NOW, NOW), /CHECK constraint failed/);
});
test("the vault FK rejects a workspace that does not exist", async () => {
  const db = await openSeededDb();
  assert.throws(() => db.$client.prepare(
    `INSERT INTO secrets_vault (workspace_id,id,kind,owner_key,provider,label,is_default,revision,
      sealed_key_id,sealed_ciphertext,sealed_nonce,sealed_alg,meta,created_at,updated_at)
     VALUES ('no-such-workspace', 'cred-1', 'vendor', 'tovu', 'github', 'x', 1, 1,
      'v1', 'cipher', 'nonce', 'aes-256-gcm', '{"accountLabel":null}', ?, ?)`
  ).run(NOW, NOW), /FOREIGN KEY constraint failed/);
});

test("deleting a workspace CASCADEs to its credential sets", async () => {
  const db = await openSeededDb();
  const repo = new SqliteVendorCredentialSetRepo(contentKernel(db));
  await repo.insert(makeRecord());

  db.delete(workspaces).where(eq(workspaces.id, WORKSPACE)).run();

  assert.equal(await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }), null);
});
