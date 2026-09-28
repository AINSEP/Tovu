import assert from "node:assert/strict";
import test from "node:test";

import { seedPrincipals } from "#src/platform/db/kernel/__tests__/content-seeds";
import { type ContentKernel, eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { InMemoryUserPurge, UserDeleteUnsupportedError, type PurgeCounts, type UserPurgePort } from "../user-purge-types.js";
import { SqlUserPurge } from "../user-purge.js";
import type { DomainEvent } from "@jini-ai/cms/core";

/**
 * @file RED-first coverage for `UserPurgePort`'s two adapters (delete-user plan Slice 1): seed the
 * FK targets a test needs, then prove the transaction's round-trip and rollback behavior against
 * the real adapter — the one Kysely body (`user-purge.ts`) on SQLite and PGlite.
 */

const WS = "workspace-1";
const NOW = "2026-09-24T00:00:00.000Z";

/** Every table the suite writes, emptied (PGlite) before each test. */
const TABLES = [
  "workspaces",
  "principals",
  "identity_users",
  "principal_roles",
  "principal_policies",
  "sessions",
  "api_keys",
  "setting_values_user",
  "admin_execution_credentials",
  "posts",
  "outbox_events",
];

/** Seeds one `kind='user'` principal plus one row in every identity table `SqlUserPurge`
 *  purges, plus one `posts` row it authored (the attribution-survives probe). */
async function seedFullUser(kernel: ContentKernel, principalId: string): Promise<void> {
  await seedPrincipals(kernel, WS, [principalId]);
  await kernel.run(async (db) => {
    await db
      .insertInto("identity_users")
      .values({ principal_id: principalId, workspace_id: WS, username: "ada", password_hash: "hash", email: "ada@example.com" })
      .execute();
    await db.insertInto("principal_roles").values({ id: "pr-1", workspace_id: WS, principal_id: principalId, role_id: "role-1" }).execute();
    await db
      .insertInto("principal_policies")
      .values({ id: "pp-1", workspace_id: WS, principal_id: principalId, policy_id: "policy-1" })
      .execute();
    await db
      .insertInto("sessions")
      .values([
        { id: "sess-1", workspace_id: WS, principal_id: principalId, token_hash: "t1", created_at: NOW, expires_at: NOW },
        { id: "sess-2", workspace_id: WS, principal_id: principalId, token_hash: "t2", created_at: NOW, expires_at: NOW },
      ])
      .execute();
    await db
      .insertInto("api_keys")
      .values({ id: "key-1", workspace_id: WS, principal_id: principalId, label: "key", key_hash: "kh", prefix: "tovu_ak_1", created_at: NOW })
      .execute();
    await db
      .insertInto("setting_values_user")
      .values({
        setting_id: "setting-1",
        workspace_id: WS,
        principal_id: principalId,
        value_json: '"on"',
        def_version: 1,
        seq: 1,
        updated_by: principalId,
        updated_at: NOW,
      })
      .execute();
    await db
      .insertInto("posts")
      .values({
        id: "post-1",
        workspace_id: WS,
        title: "Hello",
        slug: "hello",
        body_json: "{}",
        status: "published",
        updated_at: NOW,
        version: 1,
        created_by_principal_id: principalId,
      })
      .execute();
  });
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

/** Rows of `table` whose `column` is `value`. */
async function countWhere(kernel: ContentKernel, table: (typeof TABLES)[number], column: string, value: string): Promise<number> {
  const rows = await kernel.run((db) =>
    // The suite's own probe over a fixed table list; the column name is a literal at every call site.
    db.selectFrom(table as "principals").select("id").where(column as "id", "=", value).execute()
  );
  return rows.length;
}

for (const each of eachDialect({ tables: TABLES, make: (kernel) => kernel })) {
  test(`[SqlUserPurge ${each.name}] purgeUser deletes every identity row, keeps content attribution, records one audit event, and returns exact counts`, async () => {
    const kernel = each.make();
    const principalId = "user-1";
    await seedFullUser(kernel, principalId);

    const purge = new SqlUserPurge(kernel);
    const counts = await purge.purgeUser({ workspaceId: WS, principalId, buildEvent: makeBuildEvent(principalId) });

    assert.deepEqual(counts, { roles: 1, policies: 1, sessions: 2, apiKeys: 1, userSettings: 1 });

    assert.equal(await countWhere(kernel, "principals", "id", principalId), 0);
    for (const table of ["identity_users", "principal_roles", "principal_policies", "sessions", "api_keys", "setting_values_user"] as const) {
      const rows = await kernel.run((db) =>
        db.selectFrom(table).selectAll().where("principal_id", "=", principalId).execute()
      );
      assert.equal(rows.length, 0, `${table} purged`);
    }

    const post = await kernel.run((db) =>
      db.selectFrom("posts").select("created_by_principal_id").where("id", "=", "post-1").executeTakeFirst()
    );
    assert.equal(post?.created_by_principal_id, principalId);

    const outboxRows = await kernel.run((db) => db.selectFrom("outbox_events").select("event_json").execute());
    assert.equal(outboxRows.length, 1);
    const storedEvent = JSON.parse(outboxRows[0]!.event_json);
    assert.equal(storedEvent.name, "identity.user.deleted");
    // Proves `buildEvent` was called WITH the real counts (not a caller-guessed placeholder) — the
    // stored payload's `removed` matches the returned counts exactly.
    assert.deepEqual(storedEvent.payload.removed, counts);
  });

  test(`[SqlUserPurge ${each.name}] purgeUser rolls back every delete when the outbox insert fails`, async () => {
    const kernel = each.make();
    const principalId = "user-2";
    await seedFullUser(kernel, principalId);

    // A pre-existing row with the same id makes the transaction's own INSERT collide on the primary
    // key, forcing the whole transaction to throw and roll back.
    await kernel.run((db) =>
      db
        .insertInto("outbox_events")
        .values({ id: "dup-event", workspace_id: WS, event_json: "{}", status: "pending", attempts: 0, next_attempt_at: NOW, created_at: NOW })
        .execute()
    );

    const purge = new SqlUserPurge(kernel);
    await assert.rejects(
      purge.purgeUser({ workspaceId: WS, principalId, buildEvent: makeBuildEvent(principalId, "dup-event") })
    );

    assert.equal(await countWhere(kernel, "principals", "id", principalId), 1);
    assert.equal(await countWhere(kernel, "sessions", "principal_id", principalId), 2);
  });
}

test("[InMemoryUserPurge] purgeUser rejects with the exact unsupported-store message", async () => {
  const purge: UserPurgePort = new InMemoryUserPurge();
  await assert.rejects(
    purge.purgeUser({ workspaceId: WS, principalId: "user-1", buildEvent: makeBuildEvent("user-1") }),
    (err: unknown) => err instanceof UserDeleteUnsupportedError && err.message === "user delete requires the SQLite identity store"
  );
});
