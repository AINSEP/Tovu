import assert from "node:assert/strict";
import test from "node:test";

import type { CustomCredentialSetRecord } from "#src/features/custom-credentials/types";
import { workspaces } from "../../schema.js";
import { openContentDb } from "../content-db.js";
import { SqliteCustomCredentialSetRepo } from "../custom-credential-repo.sqlite.js";

/**
 * @file `SqliteCustomCredentialSetRepo` against a real, migrated `content.db` (`:memory:`).
 *
 * Had ZERO test coverage of any kind before this file — confirmed via the combined-lcov cross-check
 * (toRecord/toValues/insert/update/findById/listByWorkspace/delete all read 0 hits, deduped). What
 * only a real DB proves here: the composite `(workspace_id, id)` primary key really scopes
 * find/update/delete, and the `custom_credential_sets_workspace_label_unique` index really rejects a
 * duplicate label within one workspace (this repo's own doc: "Letting it propagate raw is
 * deliberate" — `store.ts`'s `isUniqueLabelViolation` is what catches and translates it, not this
 * layer, so this suite proves the raw constraint fires rather than a translated error).
 */

const WORKSPACE = "workspace-1";
const OTHER_WORKSPACE = "workspace-2";
const NOW = "2026-08-21T00:00:00.000Z";
const LATER = "2026-08-21T01:00:00.000Z";

function makeRecord(overrides: Partial<CustomCredentialSetRecord> = {}): CustomCredentialSetRecord {
  return {
    workspaceId: WORKSPACE,
    id: "cred-1",
    label: "name.com",
    category: "hosting",
    baseUrl: "https://api.name.com",
    sealed: { keyId: "k1", ciphertext: "Y2lwaGVy", nonce: "bm9uY2U=", alg: "aes-256-gcm" },
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

function makeRepo() {
  const db = openContentDb(":memory:");
  seedWorkspaces(db, [WORKSPACE, OTHER_WORKSPACE]);
  return new SqliteCustomCredentialSetRepo(db);
}

test("findById returns null when no row exists", async () => {
  assert.equal(await makeRepo().findById({ workspaceId: WORKSPACE, id: "cred-1" }), null);
});

test("insert then findById round-trips a record exactly", async () => {
  const repo = makeRepo();
  const record = makeRecord();

  await repo.insert(record);

  assert.deepEqual(await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }), record);
});

test("insert rejects a duplicate label within the same workspace (raw UNIQUE violation, not swallowed)", async () => {
  const repo = makeRepo();
  await repo.insert(makeRecord({ id: "cred-1", label: "name.com" }));

  await assert.rejects(
    () => repo.insert(makeRecord({ id: "cred-2", label: "name.com" })),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match((err as Error).message, /UNIQUE constraint failed/);
      return true;
    }
  );
});

test("the same label is allowed again in a DIFFERENT workspace", async () => {
  const repo = makeRepo();
  await repo.insert(makeRecord({ workspaceId: WORKSPACE, id: "cred-1", label: "name.com" }));

  await repo.insert(makeRecord({ workspaceId: OTHER_WORKSPACE, id: "cred-2", label: "name.com" }));

  assert.equal((await repo.findById({ workspaceId: OTHER_WORKSPACE, id: "cred-2" }))?.label, "name.com");
});

test("update replaces every field of the targeted row", async () => {
  const repo = makeRepo();
  await repo.insert(makeRecord());

  await repo.update(
    makeRecord({
      label: "name.com-renamed",
      category: "ops",
      baseUrl: "https://api2.name.com",
      sealed: { keyId: "k2", ciphertext: "bmV3", nonce: "bm9uY2Uy", alg: "aes-256-gcm" },
      updatedAt: LATER,
    })
  );

  const found = await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" });
  assert.equal(found?.label, "name.com-renamed");
  assert.equal(found?.category, "ops");
  assert.equal(found?.baseUrl, "https://api2.name.com");
  assert.deepEqual(found?.sealed, { keyId: "k2", ciphertext: "bmV3", nonce: "bm9uY2Uy", alg: "aes-256-gcm" });
  assert.equal(found?.updatedAt, LATER);
});

test("update never crosses a workspace boundary", async () => {
  const repo = makeRepo();
  await repo.insert(makeRecord({ workspaceId: WORKSPACE, id: "cred-1", label: "mine" }));

  // Same id, but scoped to a workspace that never inserted it -- must not touch the real row.
  await repo.update(makeRecord({ workspaceId: OTHER_WORKSPACE, id: "cred-1", label: "should-not-apply" }));

  assert.equal((await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }))?.label, "mine");
});

test("listByWorkspace returns every row for a workspace, scoped away from another workspace's rows", async () => {
  const repo = makeRepo();
  await repo.insert(makeRecord({ id: "cred-1", label: "a" }));
  await repo.insert(makeRecord({ id: "cred-2", label: "b" }));
  await repo.insert(makeRecord({ workspaceId: OTHER_WORKSPACE, id: "cred-3", label: "theirs" }));

  const rows = await repo.listByWorkspace({ workspaceId: WORKSPACE });

  assert.deepEqual(
    rows.map((r) => r.id).sort(),
    ["cred-1", "cred-2"]
  );
});

test("delete removes exactly the targeted row and is a silent no-op when it doesn't exist", async () => {
  const repo = makeRepo();
  await repo.insert(makeRecord({ id: "cred-1" }));
  await repo.insert(makeRecord({ id: "cred-2", label: "other" }));

  await repo.delete({ workspaceId: WORKSPACE, id: "cred-1" });
  assert.deepEqual(
    (await repo.listByWorkspace({ workspaceId: WORKSPACE })).map((r) => r.id),
    ["cred-2"]
  );

  // idempotent no-op on a row that's already gone
  await repo.delete({ workspaceId: WORKSPACE, id: "cred-1" });
  assert.deepEqual(
    (await repo.listByWorkspace({ workspaceId: WORKSPACE })).map((r) => r.id),
    ["cred-2"]
  );
});

test("delete never crosses a workspace boundary", async () => {
  const repo = makeRepo();
  await repo.insert(makeRecord({ workspaceId: WORKSPACE, id: "cred-1", label: "mine" }));
  await repo.insert(makeRecord({ workspaceId: OTHER_WORKSPACE, id: "cred-1", label: "theirs" }));

  await repo.delete({ workspaceId: WORKSPACE, id: "cred-1" });

  assert.equal(await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }), null);
  assert.ok(await repo.findById({ workspaceId: OTHER_WORKSPACE, id: "cred-1" }), "the other workspace's row must survive");
});
