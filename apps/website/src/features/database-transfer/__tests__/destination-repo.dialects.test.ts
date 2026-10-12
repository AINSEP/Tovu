import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";
import { VaultError, type VaultRecord } from "@jini-ai/platform/secrets/credential-sets";
import { describeEachDialect, heldUntil } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { ensureVaultRepoFixture } from "#src/platform/db/repos/__tests__/vault-repo.fixture";
import { DatabaseDestinationRepo } from "../destination-repo.js";

/** S3c: the destination's vault SQL adapter on SQLite and PGlite, including singleton and CAS. */
const RECORD: VaultRecord = {
  workspaceId: "ws-1", id: 'vault:["database-destination",null]', kind: "database-destination",
  ownerKey: "tovu", principalId: null, provider: null, binding: null, label: "Database destination",
  sealed: { keyId: "v1", ciphertext: "c1", nonce: "n1", alg: "aes-256-gcm" },
  isDefault: true, revision: 1, last4: null, tokenLength: null,
  meta: { description: { host: "db.example.test", port: "5432", database: "site", user: "owner" }, lastRun: null },
  createdAt: "2026-09-28T00:00:00.000Z", updatedAt: "2026-09-28T00:00:00.000Z",
};

describeEachDialect("DatabaseDestinationRepo", { tables: ["workspaces"], make: (base) => {
  const ready = base.transaction(async () => {
    await ensureVaultRepoFixture({ kernel: base });
    await base.execute(sql`DELETE FROM secrets_vault`);
    for (const id of ["ws-1", "ws-2"]) await base.execute(sql`INSERT INTO workspaces(id,name,slug,created_at) VALUES(${id},${id},${id},${RECORD.createdAt})`);
  });
  return new DatabaseDestinationRepo(heldUntil(base, ready));
} }, (make) => {
  test("insert, replacement, and targeted lastRun patch preserve workspace scoping", async () => {
    const repo = make();
    assert.equal(await repo.find(RECORD), null);
    await repo.put({ record: RECORD, expectedRevision: null });
    assert.deepEqual(await repo.find(RECORD), RECORD);
    const replaced = { ...RECORD, revision: 2, sealed: { ...RECORD.sealed!, ciphertext: "c2" } };
    await repo.put({ record: replaced, expectedRevision: 1 });
    assert.deepEqual(await repo.find(RECORD), replaced);
    const other = { ...RECORD, workspaceId: "ws-2" };
    await repo.put({ record: other, expectedRevision: null });
    const lastRun = { copied: true, snapshotAt: RECORD.updatedAt, tableCount: 2, rowCount: 3 };
    await repo.patchMeta({ ...RECORD, expectedRevision: 2, patch: { lastRun }, updatedAt: RECORD.updatedAt });
    const patched = await repo.find(RECORD);
    assert.deepEqual(patched?.meta.lastRun, lastRun);
    assert.deepEqual(patched?.sealed, replaced.sealed);
    assert.equal(patched?.revision, 3);
    assert.deepEqual(await repo.find(other), other);
    assert.equal(await repo.find({ workspaceId: "ws-missing", id: RECORD.id }), null);
  });

  test("a stale lastRun patch cannot overwrite a concurrent credential replacement", async () => {
    const repo = make();
    await repo.put({ record: RECORD, expectedRevision: null });
    const replacement = { ...RECORD, revision: 2, sealed: { ...RECORD.sealed!, ciphertext: "new-credential" } };
    await repo.put({ record: replacement, expectedRevision: 1 });
    await assert.rejects(repo.patchMeta({ ...RECORD, expectedRevision: 1, patch: { lastRun: { copied: false } }, updatedAt: RECORD.updatedAt }), VaultError);
    assert.deepEqual(await repo.find(RECORD), replacement);
    await assert.rejects(repo.put({ record: { ...RECORD, id: "second-singleton", label: "Another destination" }, expectedRevision: null }));
    assert.deepEqual(await repo.find(RECORD), replacement);
  });
});
