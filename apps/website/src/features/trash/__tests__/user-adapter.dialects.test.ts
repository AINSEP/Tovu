import assert from "node:assert/strict";
import { test } from "node:test";

import { SqlUserPurge } from "#src/features/identity/user-purge";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";

import { createUserTrashAdapter } from "../adapters/user.js";

/**
 * @file The user `TrashAdapter` on every dialect the storage kernel drives — ONE query body: hide
 * (disable + revoke sessions + trashed event), unhide (back to the prior status + restored event),
 * purge (refuses a live principal, then delegates to the real `SqlUserPurge`), and rollback of each
 * write when its outbox insert fails. The identity-service flows around it stay in
 * `user-adapter.test.ts` (SQLite).
 */

const WS = "ws-user-dialects";
const T0 = "2026-09-01T00:00:00.000Z";
const AT = "2026-09-28T12:00:00.000Z";
const LATER = "2026-09-28T13:00:00.000Z";

const TABLES = [
  "workspaces",
  "principals",
  "identity_users",
  "sessions",
  "principal_roles",
  "principal_policies",
  "api_keys",
  "setting_values_user",
  "admin_execution_credentials",
  "outbox_events",
] as const;

async function seedUser(kernel: ContentKernel, id: string, username: string): Promise<void> {
  await kernel.run((db) =>
    db.insertInto("workspaces").values({ id: WS, name: WS, slug: WS, created_at: T0 }).onConflict((oc) => oc.doNothing()).execute()
  );
  await kernel.run((db) =>
    db.insertInto("principals").values({ id, workspace_id: WS, kind: "user", display_name: `Display ${id}`, status: "active", disabled_at: null, created_at: T0 }).execute()
  );
  await kernel.run((db) => db.insertInto("identity_users").values({ principal_id: id, workspace_id: WS, username, password_hash: "x" }).execute());
  await kernel.run((db) =>
    db.insertInto("sessions").values({ id: `sess-${id}`, workspace_id: WS, principal_id: id, token_hash: `hash-${id}`, created_at: T0, expires_at: LATER }).execute()
  );
}

async function principal(kernel: ContentKernel, id: string) {
  return kernel.run((db) => db.selectFrom("principals").select(["status", "disabled_at"]).where("id", "=", id).executeTakeFirst());
}

async function count(kernel: ContentKernel, table: (typeof TABLES)[number]): Promise<number> {
  const row = await kernel.run((db) => db.selectFrom(table).select((eb) => eb.fn.countAll().as("n")).executeTakeFirstOrThrow());
  return Number(row.n);
}

async function events(kernel: ContentKernel): Promise<{ name: string; actorId?: string; payload: Record<string, unknown> }[]> {
  const rows = await kernel.run((db) => db.selectFrom("outbox_events").select("event_json").orderBy("created_at").orderBy("id").execute());
  return rows.map((row) => JSON.parse(row.event_json));
}

function adapterFor(kernel: ContentKernel, idGen: { next(): string } = counter()) {
  return createUserTrashAdapter({ db: kernel, purge: new SqlUserPurge(kernel), idGen, clock: { nowIso: () => AT } });
}

function counter(): { next(): string } {
  let n = 0;
  return { next: () => `evt-${++n}` };
}

describeEachDialect("user trash adapter", { tables: TABLES, make: (kernel: ContentKernel) => kernel }, (make) => {
  test("hide disables and revokes sessions; unhide restores the prior status; each records its event", async () => {
    const kernel = make();
    await seedUser(kernel, "u-1", "departing");
    const user = adapterFor(kernel);

    assert.deepEqual(await user.hide({ workspaceId: WS, entityId: "u-1", at: AT, expectedVersion: null }, { actor: { principalId: "owner" } }), {
      ok: true,
      version: null,
      priorMarker: "active",
    });
    assert.deepEqual(await principal(kernel, "u-1"), { status: "disabled", disabled_at: AT });
    assert.equal(await count(kernel, "sessions"), 0);
    assert.deepEqual(await user.hide({ workspaceId: WS, entityId: "missing", at: AT, expectedVersion: null }), { ok: false, reason: "not-found" });

    assert.deepEqual(await user.unhide({ workspaceId: WS, entityId: "u-1", at: LATER, expectedVersion: null }, { priorMarker: "active" }), { ok: true, version: null });
    assert.deepEqual(await principal(kernel, "u-1"), { status: "active", disabled_at: null });
    assert.deepEqual(await user.unhide({ workspaceId: WS, entityId: "missing", at: LATER, expectedVersion: null }, { priorMarker: null }), { ok: false, reason: "not-found" });

    const [trashed, restored] = await events(kernel);
    assert.deepEqual(
      { name: trashed!.name, actorId: trashed!.actorId, payload: trashed!.payload },
      { name: "identity.user.trashed", actorId: "owner", payload: { principalId: "u-1", username: "departing", priorStatus: "active", sessionsRevoked: 1 } }
    );
    assert.deepEqual(
      { name: restored!.name, actorId: restored!.actorId, payload: restored!.payload },
      { name: "identity.user.restored", actorId: undefined, payload: { principalId: "u-1", username: "departing", restoredStatus: "active" } }
    );
  });

  test("unhide with no prior marker leaves the principal disabled; the event falls back to the display name without a login", async () => {
    const kernel = make();
    await seedUser(kernel, "u-1", "departing");
    await kernel.run((db) => db.deleteFrom("identity_users").execute());
    const user = adapterFor(kernel);

    await user.hide({ workspaceId: WS, entityId: "u-1", at: AT, expectedVersion: null });
    await user.unhide({ workspaceId: WS, entityId: "u-1", at: LATER, expectedVersion: null }, { priorMarker: null });

    assert.deepEqual(await principal(kernel, "u-1"), { status: "disabled", disabled_at: AT });
    assert.deepEqual(
      (await events(kernel)).map((event) => event.payload.username),
      ["Display u-1", "Display u-1"]
    );
  });

  test("purge refuses a live principal, deletes a hidden one through SqlUserPurge, then reports already-gone", async () => {
    const kernel = make();
    await seedUser(kernel, "u-1", "departing");
    const user = adapterFor(kernel);

    assert.equal(await user.purge({ workspaceId: WS, entityId: "u-1", expectedVersion: null }), "version-changed");
    assert.deepEqual(await principal(kernel, "u-1"), { status: "active", disabled_at: null }, "a live principal is never purged");

    await user.hide({ workspaceId: WS, entityId: "u-1", at: AT, expectedVersion: null });
    assert.equal(await user.purge({ workspaceId: WS, entityId: "u-1", expectedVersion: null }), "purged");
    assert.equal(await count(kernel, "principals"), 0);
    assert.equal(await count(kernel, "identity_users"), 0);
    assert.equal(await user.purge({ workspaceId: WS, entityId: "u-1", expectedVersion: null }), "already-gone");

    const deleted = (await events(kernel)).find((event) => event.name === "identity.user.deleted");
    assert.equal(deleted?.actorId, undefined);
    assert.equal(deleted?.payload.reason, "retention");
    assert.equal(deleted?.payload.username, "departing");
  });

  test("a failing outbox insert rolls back the hide's disable and session revoke, and the purge's deletes", async () => {
    const kernel = make();
    await seedUser(kernel, "u-1", "departing");
    const user = adapterFor(kernel, { next: () => "fixed-event-id" });
    await kernel.run((db) =>
      db
        .insertInto("outbox_events")
        .values({ id: "fixed-event-id", workspace_id: WS, event_json: "{}", status: "pending", attempts: 0, next_attempt_at: T0, created_at: T0 })
        .execute()
    );

    await assert.rejects(() => user.hide({ workspaceId: WS, entityId: "u-1", at: AT, expectedVersion: null }));
    assert.deepEqual(await principal(kernel, "u-1"), { status: "active", disabled_at: null }, "the disable rolled back");
    assert.equal(await count(kernel, "sessions"), 1, "the session revoke rolled back");

    await kernel.run((db) => db.updateTable("principals").set({ status: "disabled", disabled_at: AT }).execute());
    await assert.rejects(() => user.purge({ workspaceId: WS, entityId: "u-1", expectedVersion: null }, { actor: { principalId: "owner" } }));
    assert.equal(await count(kernel, "principals"), 1, "the principal delete rolled back");
    assert.equal(await count(kernel, "identity_users"), 1);
    assert.equal(await count(kernel, "sessions"), 1);
  });
});
