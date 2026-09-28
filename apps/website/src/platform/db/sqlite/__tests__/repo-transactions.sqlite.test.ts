import assert from "node:assert/strict";
import test from "node:test";

import { workspaces } from "../../schema.sqlite.js";
import { mintToken } from "#src/contracts/core/gated-mutations/token";
import { SqliteUserPurge } from "#src/features/identity/user-purge.sqlite";

import { SqliteChangeSetRepo } from "../change-set-repo.sqlite.js";
import { openContentDb } from "../content-db.js";
import { SqliteTokenStore } from "../gated-mutation-token-repo.sqlite.js";
import { SqliteMediaProviderCredentialRepo } from "../media-provider-credential-repo.sqlite.js";
import { SqliteMediaRepo } from "../media-repo.sqlite.js";
import { SqliteOutboxAdapter } from "../outbox-repo.sqlite.js";
import { SqlitePublishCredentialSetRepo } from "../publish-credential-repo.sqlite.js";
import { writeDuringOthersRollback } from "./concurrent-rollback.js";

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

test("media provider credentials: replaceWorkspace survives another caller's rollback", async () => {
  const db = openSeededDb();
  const repo = new SqliteMediaProviderCredentialRepo(db);
  const record = {
    workspaceId: WORKSPACE,
    providerId: "openai",
    baseUrl: null,
    model: null,
    sealed: null,
    keyTail: null,
    aadVersion: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
  await writeDuringOthersRollback(db, () =>
    repo.replaceWorkspace({ workspaceId: WORKSPACE, plan: () => ({ upserts: [record], tombstoneProviderIds: [] }) })
  );
  assert.deepEqual(await repo.listByWorkspaceId(WORKSPACE), [record]);
});

test("change sets: insert survives another caller's rollback", async () => {
  const db = openSeededDb();
  const repo = new SqliteChangeSetRepo(db);
  const record = {
    id: "cs-1",
    workspaceId: WORKSPACE,
    actorId: "user-1",
    status: "applied" as const,
    summary: "test change set",
    createdAt: NOW,
    appliedAt: NOW,
  };
  await writeDuringOthersRollback(db, () => repo.insert(record, []));
  assert.equal((await repo.findById({ workspaceId: WORKSPACE, id: "cs-1" }))?.changeSet.id, "cs-1");
});

test("outbox: a claim survives another caller's rollback", async () => {
  const db = openSeededDb();
  const outbox = new SqliteOutboxAdapter(db);
  await outbox.enqueue({ id: "evt-1", name: "change-set.applied", occurredAt: NOW, workspaceId: WORKSPACE, payload: {} });
  await writeDuringOthersRollback(db, () => outbox.claimPending(10, NOW));
  assert.deepEqual(await outbox.claimPending(10, NOW), [], "the claimed row stays leased");
});

test("gated mutation tokens: a redeem survives another caller's rollback (no second redeem)", async () => {
  const db = openSeededDb();
  const store = new SqliteTokenStore(db);
  const record = mintToken({ planId: "plan-1", planHash: "hash-1", scopeId: "scope-1", confirmerPrincipalId: "user-1", now: NOW });
  await store.save(record);
  await writeDuringOthersRollback(db, () => store.tryRedeem({ token: record.confirmationToken, now: NOW }));
  assert.equal((await store.tryRedeem({ token: record.confirmationToken, now: NOW })).redeemed, false);
});

test("media: save and remove survive another caller's rollback", async () => {
  const db = openSeededDb();
  const repo = new SqliteMediaRepo(db);
  const record = {
    id: "media-1",
    workspaceId: WORKSPACE,
    title: "A photo",
    slug: "a-photo",
    alt: "alt text",
    caption: "a caption",
    credit: "a credit",
    source: { sha256: "a".repeat(64) },
    status: "active" as const,
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    width: null,
    height: null,
    cssClass: null,
    htmlAttributes: null,
  };
  await writeDuringOthersRollback(db, () => repo.save(record));
  assert.equal((await repo.findById({ workspaceId: WORKSPACE, id: "media-1" }))?.slug, "a-photo");
  await writeDuringOthersRollback(db, () => repo.remove({ workspaceId: WORKSPACE, id: "media-1" }));
  assert.equal(await repo.findById({ workspaceId: WORKSPACE, id: "media-1" }), null);
});

test("user purge: the deletes and the audit event survive another caller's rollback", async () => {
  const db = openSeededDb();
  const purge = new SqliteUserPurge(db);
  await writeDuringOthersRollback(db, () =>
    purge.purgeUser({
      workspaceId: WORKSPACE,
      principalId: "principal-1",
      buildEvent: (removed) => ({ id: "evt-purge", name: "identity.user.purged", occurredAt: NOW, workspaceId: WORKSPACE, payload: { removed } }),
    })
  );
  assert.deepEqual((await new SqliteOutboxAdapter(db).claimPending(10, NOW)).map((record) => record.id), ["evt-purge"]);
});
