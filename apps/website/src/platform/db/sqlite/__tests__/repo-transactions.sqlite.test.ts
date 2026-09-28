import assert from "node:assert/strict";
import test from "node:test";

import { contentKernel } from "../../content-kernel.js";
import { workspaces } from "../../schema.sqlite.js";
import { openContentDb } from "../content-db.js";
import { SqlitePublishCredentialSetRepo } from "../publish-credential-repo.sqlite.js";

/**
 * @file Repo writes that group several statements run in the content db's storage-kernel
 * transaction. The property pinned here: a write started while ANOTHER async context holds a
 * transaction open waits for its own, so that caller's rollback cannot undo it. (A synchronous
 * Drizzle `db.transaction()` became a savepoint inside whatever `BEGIN` was open on the connection,
 * and was rolled back with it.)
 */

const WORKSPACE = "workspace-1";
const NOW = "2026-09-28T00:00:00.000Z";

function openSeededDb() {
  const db = openContentDb(":memory:");
  db.insert(workspaces).values({ id: WORKSPACE, name: WORKSPACE, slug: WORKSPACE, createdAt: NOW }).run();
  return db;
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

/** Runs `write` while another caller's transaction is open, then rolls that one back. */
async function writeDuringOthersRollback(db: ReturnType<typeof openContentDb>, write: () => Promise<unknown>) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const other = contentKernel(db).transaction(async () => {
    await gate;
    throw new Error("the other caller rolls back");
  });
  await tick();
  const mine = write();
  await tick();
  release();
  await assert.rejects(other, /the other caller rolls back/);
  await mine;
}

test("publish credentials: insert survives another caller's rollback", async () => {
  const db = openSeededDb();
  const repo = new SqlitePublishCredentialSetRepo(db);
  const record = {
    workspaceId: WORKSPACE,
    id: "cred-1",
    providerId: "github-pages" as const,
    label: "Main repo",
    sealed: { keyId: "v1", ciphertext: "Y2lwaGVy", nonce: "bm9uY2U=", alg: "aes-256-gcm" as const },
    isDefault: true,
    accountLabel: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
  await writeDuringOthersRollback(db, () => repo.insert(record));
  assert.deepEqual(await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }), record);
});
