import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb, type ContentDb } from "#src/platform/db/sqlite/content-db";
import {
  apiKeys,
  identityUsers,
  outboxEvents,
  posts,
  principalPolicies,
  principalRoles,
  principals,
  sessions,
  settingValuesUser,
  workspaces,
} from "#src/platform/db/schema.sqlite";
import { eq } from "drizzle-orm";
import { InMemoryUserPurge, UserDeleteUnsupportedError, type PurgeCounts } from "../user-purge-types.js";
import { SqliteUserPurge } from "../user-purge.sqlite.js";
import type { DomainEvent } from "@jini-ai/cms/core";

/**
 * @file RED-first coverage for `UserPurgePort`'s two adapters (delete-user plan Slice 1). Mirrors
 * `commerce/__tests__/integration/repo.sqlite.integration.test.ts`'s shape: seed the FK targets a
 * test needs against a real `:memory:` SQLite db, then prove the transaction's round-trip and
 * rollback behavior against the real adapter.
 */

const WS = "workspace-1";
const NOW = "2026-09-24T00:00:00.000Z";

function openTestDb(): ContentDb {
  return openContentDb(":memory:");
}

function seedWorkspace(db: ContentDb): void {
  db.insert(workspaces).values({ id: WS, name: WS, slug: WS, createdAt: NOW }).run();
}

/** Seeds one `kind='user'` principal plus one row in every identity table `SqliteUserPurge`
 *  purges, plus one `posts` row it authored (the attribution-survives probe). */
function seedFullUser(db: ContentDb, principalId: string): void {
  db.insert(principals)
    .values({ id: principalId, workspaceId: WS, kind: "user", displayName: "Ada", status: "active", createdAt: NOW })
    .run();
  db.insert(identityUsers)
    .values({ principalId, workspaceId: WS, username: "ada", passwordHash: "hash", email: "ada@example.com" })
    .run();
  db.insert(principalRoles).values({ id: "pr-1", workspaceId: WS, principalId, roleId: "role-1" }).run();
  db.insert(principalPolicies).values({ id: "pp-1", workspaceId: WS, principalId, policyId: "policy-1" }).run();
  db.insert(sessions)
    .values([
      { id: "sess-1", workspaceId: WS, principalId, tokenHash: "t1", createdAt: NOW, expiresAt: NOW },
      { id: "sess-2", workspaceId: WS, principalId, tokenHash: "t2", createdAt: NOW, expiresAt: NOW },
    ])
    .run();
  db.insert(apiKeys)
    .values({ id: "key-1", workspaceId: WS, principalId, label: "key", keyHash: "kh", prefix: "tovu_ak_1", createdAt: NOW })
    .run();
  db.insert(settingValuesUser)
    .values({
      settingId: "setting-1",
      workspaceId: WS,
      principalId,
      valueJson: '"on"',
      defVersion: 1,
      seq: 1,
      updatedBy: principalId,
      updatedAt: NOW,
    })
    .run();
  db.insert(posts)
    .values({
      id: "post-1",
      workspaceId: WS,
      title: "Hello",
      slug: "hello",
      bodyJson: "{}",
      status: "published",
      updatedAt: NOW,
      version: 1,
      createdByPrincipalId: principalId,
    })
    .run();
}

/** The `buildEvent` callback `purgeUser` calls with the counts it actually removed — mirrors
 *  `delete-user-service.ts`'s real event shape closely enough to exercise the port contract. */
function makeBuildEvent(principalId: string, eventId = "event-1") {
  return (removed: PurgeCounts): DomainEvent => ({
    id: eventId,
    name: "identity.user.deleted",
    occurredAt: NOW,
    aggregateId: principalId,
    workspaceId: WS,
    actorId: "caller-1",
    payload: { principalId, username: "ada", removed },
  });
}

test("[SqliteUserPurge] purgeUser deletes every identity row, keeps content attribution, records one audit event, and returns exact counts", async () => {
  const db = openTestDb();
  seedWorkspace(db);
  const principalId = "user-1";
  seedFullUser(db, principalId);

  const purge = new SqliteUserPurge(db);
  const counts = await purge.purgeUser({ workspaceId: WS, principalId, buildEvent: makeBuildEvent(principalId) });

  assert.deepEqual(counts, { roles: 1, policies: 1, sessions: 2, apiKeys: 1, userSettings: 1 });

  assert.equal(db.select().from(principals).where(eq(principals.id, principalId)).all().length, 0);
  assert.equal(db.select().from(identityUsers).where(eq(identityUsers.principalId, principalId)).all().length, 0);
  assert.equal(db.select().from(principalRoles).where(eq(principalRoles.principalId, principalId)).all().length, 0);
  assert.equal(db.select().from(principalPolicies).where(eq(principalPolicies.principalId, principalId)).all().length, 0);
  assert.equal(db.select().from(sessions).where(eq(sessions.principalId, principalId)).all().length, 0);
  assert.equal(db.select().from(apiKeys).where(eq(apiKeys.principalId, principalId)).all().length, 0);
  assert.equal(db.select().from(settingValuesUser).where(eq(settingValuesUser.principalId, principalId)).all().length, 0);

  const post = db.select().from(posts).where(eq(posts.id, "post-1")).all()[0];
  assert.equal(post?.createdByPrincipalId, principalId);

  const outboxRows = db.select().from(outboxEvents).all();
  assert.equal(outboxRows.length, 1);
  const storedEvent = JSON.parse(outboxRows[0]!.eventJson);
  assert.equal(storedEvent.name, "identity.user.deleted");
  // Proves `buildEvent` was called WITH the real counts (not a caller-guessed placeholder) — the
  // stored payload's `removed` matches the returned counts exactly.
  assert.deepEqual(storedEvent.payload.removed, counts);
});

test("[SqliteUserPurge] purgeUser rolls back every delete when the outbox insert fails", async () => {
  const db = openTestDb();
  seedWorkspace(db);
  const principalId = "user-2";
  seedFullUser(db, principalId);

  // A pre-existing row with the same id makes the transaction's own INSERT collide on the primary
  // key, forcing the whole `db.transaction()` callback to throw and roll back.
  db.insert(outboxEvents)
    .values({ id: "dup-event", workspaceId: WS, eventJson: "{}", status: "pending", attempts: 0, nextAttemptAt: NOW, createdAt: NOW })
    .run();

  const purge = new SqliteUserPurge(db);
  await assert.rejects(
    purge.purgeUser({ workspaceId: WS, principalId, buildEvent: makeBuildEvent(principalId, "dup-event") })
  );

  assert.equal(db.select().from(principals).where(eq(principals.id, principalId)).all().length, 1);
  assert.equal(db.select().from(sessions).where(eq(sessions.principalId, principalId)).all().length, 2);
});

test("[InMemoryUserPurge] purgeUser rejects with the exact unsupported-store message", async () => {
  const purge = new InMemoryUserPurge();
  await assert.rejects(
    purge.purgeUser({ workspaceId: WS, principalId: "user-1", buildEvent: makeBuildEvent("user-1") }),
    (err: unknown) => err instanceof UserDeleteUnsupportedError && err.message === "user delete requires the SQLite identity store"
  );
});
