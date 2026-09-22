import assert from "node:assert/strict";
import test from "node:test";
import type Database from "better-sqlite3";

import * as schema from "#src/platform/db/schema";
import { openContentDb, type ContentDb } from "#src/platform/db/sqlite/content-db";

import { createSqliteTrashDb } from "../db-port.sqlite.js";
import { withFollowUps, type TrashFollowUpHooks } from "../follow-ups.js";
import { createContentDbTransactionRunner, SqliteTrashRepo } from "../repo.sqlite.js";
import { createTableTrashAdapter } from "../table-adapter.js";
import type { TrashEntry } from "../registry.js";
import { createTrashService } from "../write-service.js";
import type { TrashAdapter, TrashPort } from "../ports.js";

/**
 * @file Direct test of `withFollowUps` (T1c dispatch item 3) — the decorator itself, not any one
 * type's hook. Proves the three claims its own file header makes: a hook fires on a real OK/`purged`
 * transition; it never fires on a no-op (idempotent already-trashed/already-live, or a blocked/
 * not-found/version-changed outcome); and a throwing hook rolls back the whole operation, because it
 * runs from inside the SAME transaction `write-service.ts` opens around the adapter call.
 *
 * A real SQLite-backed table adapter is used (not a fake `TrashAdapter`) and driven through
 * `createTrashService` (not called bare), because the rollback claim is only true through that
 * composition: `write-service.ts`'s `trash`/`restore`/`purgeSelected` open `deps.transaction` BEFORE
 * calling the adapter, so the underlying `table-adapter.ts`'s own `db.transaction` call re-enters
 * (see `db-port.sqlite.ts`'s header) rather than committing on its own — a hook that throws after the
 * marker flip is still inside that one open transaction. Calling the wrapped adapter bare (skipping
 * `write-service.ts`) would let the adapter's own transaction commit before the hook ever ran, and a
 * throw at that point would prove nothing about rollback.
 *
 * Uses a test-only STATUS-marker entry over the real `menus` table (same technique
 * `table-adapter.test.ts` already uses for its `test-menu` entry) — a status marker is required to
 * exercise `afterUnhide`'s `priorMarker` at all (a timestamp marker never sets one, see
 * `follow-ups.ts`'s `UnhideFollowUp` doc), and gives `beforePurge` a real column to read.
 */

const WS = "workspace-1";
const AT = "2026-09-21T12:00:00.000Z";
const AT2 = "2026-09-21T13:00:00.000Z";
const ENTITY_TYPE = "test-followups";

function buildEntry(): TrashEntry {
  return {
    entityType: ENTITY_TYPE,
    label: "Test FollowUps",
    permission: "test.followups.manage",
    table: schema.menus,
    idColumn: schema.menus.id,
    workspaceColumn: schema.menus.workspaceId,
    marker: { kind: "status", column: schema.menus.status, trashed: "trashed", restoreFallback: "draft" },
    versionColumn: schema.menus.version,
    touchColumn: schema.menus.updatedAt,
    display: { title: schema.menus.title, subtitle: schema.menus.slug },
  };
}

interface Harness {
  client: Database.Database;
  trash: TrashPort;
  repo: SqliteTrashRepo;
}

function harness(hooks: TrashFollowUpHooks): Harness {
  const db: ContentDb = openContentDb(":memory:");
  const client = (db as unknown as { $client: Database.Database }).$client;
  client
    .prepare(`INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)`)
    .run(WS, WS, WS, "2026-01-01T00:00:00.000Z");

  const trashDb = createSqliteTrashDb({ db });
  const baseAdapter = createTableTrashAdapter({ entry: buildEntry(), db: trashDb });
  const wrapped = withFollowUps({ adapter: baseAdapter, hooks });
  const adapters = new Map<string, TrashAdapter>([[ENTITY_TYPE, wrapped]]);
  const repo = new SqliteTrashRepo(client);
  let seq = 0;
  const trash = createTrashService({
    repo,
    adapters,
    idGen: { next: () => `trash-${(seq += 1)}` },
    transaction: createContentDbTransactionRunner(client),
  });

  return { client, trash, repo };
}

function seedRow(client: Database.Database, id: string, overrides: { status?: string; version?: number } = {}): void {
  client
    .prepare(
      `INSERT INTO menus (id, workspace_id, slug, title, status, doc_json, locations_json, updated_at, version)
       VALUES (?, ?, ?, ?, ?, '{}', '{}', ?, ?)`
    )
    .run(id, WS, `slug-${id}`, `Row ${id}`, overrides.status ?? "published", "2026-09-01T00:00:00.000Z", overrides.version ?? 1);
}

function readRow(client: Database.Database, id: string): { status: string; version: number } | undefined {
  return client.prepare(`SELECT status, version FROM menus WHERE id = ?`).get(id) as
    | { status: string; version: number }
    | undefined;
}

// ---------------------------------------------------------------------------
// afterHide
// ---------------------------------------------------------------------------

test("afterHide fires exactly once, with the transitioned entity's ids and timestamp, on a real hide", async () => {
  const calls: { workspaceId: string; entityId: string; at: string }[] = [];
  const h = harness({ afterHide: async (required) => void calls.push(required) });
  seedRow(h.client, "row-1", { status: "published", version: 1 });

  const outcome = await h.trash.trash({
    workspaceId: WS,
    entityType: ENTITY_TYPE,
    entityId: "row-1",
    actor: { principalId: "p-1" },
    display: { title: "Row row-1" },
    at: AT,
    expectedVersion: 1,
  });

  assert.equal(outcome.ok, true);
  assert.deepEqual(calls, [{ workspaceId: WS, entityId: "row-1", at: AT }]);
});

test("afterHide never fires when hide is a no-op (the row is already trashed)", async () => {
  const calls: unknown[] = [];
  const h = harness({ afterHide: async (required) => void calls.push(required) });
  seedRow(h.client, "row-1", { status: "trashed", version: 2 });

  const outcome = await h.trash.trash({
    workspaceId: WS,
    entityType: ENTITY_TYPE,
    entityId: "row-1",
    actor: { principalId: "p-1" },
    display: { title: "Row row-1" },
    at: AT,
    expectedVersion: 2,
  });

  assert.equal(outcome.ok, true, "the idempotent branch still reports ok:true");
  assert.deepEqual(calls, [], "nothing changed, so nothing should have finished");
});

test("afterHide never fires on a blocked, not-found, or version-changed hide", async () => {
  const calls: unknown[] = [];
  const h = harness({ afterHide: async (required) => void calls.push(required) });
  seedRow(h.client, "row-1", { status: "published", version: 1 });

  const staleVersion = await h.trash.trash({
    workspaceId: WS,
    entityType: ENTITY_TYPE,
    entityId: "row-1",
    actor: { principalId: "p-1" },
    display: { title: "Row row-1" },
    at: AT,
    expectedVersion: 99,
  });
  assert.deepEqual(staleVersion, { ok: false, reason: "version-changed" });

  const missing = await h.trash.trash({
    workspaceId: WS,
    entityType: ENTITY_TYPE,
    entityId: "does-not-exist",
    actor: { principalId: "p-1" },
    display: { title: "Row does-not-exist" },
    at: AT,
    expectedVersion: null,
  });
  assert.deepEqual(missing, { ok: false, reason: "not-found" });

  assert.deepEqual(calls, []);
});

test("a throwing afterHide rolls back the whole trash op — the row stays live and no trashed_items row is inserted", async () => {
  const h = harness({
    afterHide: async () => {
      throw new Error("afterHide boom");
    },
  });
  seedRow(h.client, "row-1", { status: "published", version: 1 });

  await assert.rejects(
    () =>
      h.trash.trash({
        workspaceId: WS,
        entityType: ENTITY_TYPE,
        entityId: "row-1",
        actor: { principalId: "p-1" },
        display: { title: "Row row-1" },
        at: AT,
        expectedVersion: 1,
      }),
    /afterHide boom/
  );

  assert.deepEqual(readRow(h.client, "row-1"), { status: "published", version: 1 });
  const indexed = await h.repo.findByEntity({ workspaceId: WS, entityType: ENTITY_TYPE, entityId: "row-1" });
  assert.equal(indexed, null, "a rolled-back hide must leave no trashed_items row behind");
});

// ---------------------------------------------------------------------------
// afterUnhide
// ---------------------------------------------------------------------------

test("afterUnhide fires exactly once with the recorded priorMarker, on a real restore", async () => {
  const calls: { workspaceId: string; entityId: string; priorMarker: string; at: string }[] = [];
  const h = harness({ afterUnhide: async (required) => void calls.push(required) });
  seedRow(h.client, "row-1", { status: "published", version: 1 });

  const trashed = await h.trash.trash({
    workspaceId: WS,
    entityType: ENTITY_TYPE,
    entityId: "row-1",
    actor: { principalId: "p-1" },
    display: { title: "Row row-1" },
    at: AT,
    expectedVersion: 1,
  });
  assert.equal(trashed.ok, true);

  const restored = await h.trash.restore({ workspaceId: WS, entityType: ENTITY_TYPE, entityId: "row-1", at: AT2 });
  assert.equal(restored, "restored");
  assert.deepEqual(calls, [{ workspaceId: WS, entityId: "row-1", priorMarker: "published", at: AT2 }]);
});

test("afterUnhide never fires when unhide is a no-op (the row is already live, despite a stale trashed_items row)", async () => {
  const calls: unknown[] = [];
  const h = harness({ afterUnhide: async (required) => void calls.push(required) });
  // Simulate a stale index row: something restored the domain row directly (bypassing the Trash),
  // leaving the `trashed_items` row believing it is still trashed.
  seedRow(h.client, "row-1", { status: "published", version: 1 });
  await h.repo.insert({
    id: "trash-stale",
    workspaceId: WS,
    entityType: ENTITY_TYPE,
    entityId: "row-1",
    trashedAt: AT,
    purgeAfter: "2099-01-01T00:00:00.000Z",
    actorPrincipalId: "p-1",
    actorPluginId: null,
    displayTitle: "Row row-1",
    displaySubtitle: null,
    entityVersion: 1,
    priorMarker: "published",
  });

  const restored = await h.trash.restore({ workspaceId: WS, entityType: ENTITY_TYPE, entityId: "row-1", at: AT2 });
  assert.equal(restored, "restored", "unhide's idempotent branch still reports ok:true, so restore() still succeeds");
  assert.deepEqual(calls, [], "nothing changed on the domain row, so nothing should have finished");
});

test("a throwing afterUnhide rolls back the whole restore — the row stays trashed and the index row survives", async () => {
  const h = harness({
    afterUnhide: async () => {
      throw new Error("afterUnhide boom");
    },
  });
  seedRow(h.client, "row-1", { status: "published", version: 1 });
  const trashed = await h.trash.trash({
    workspaceId: WS,
    entityType: ENTITY_TYPE,
    entityId: "row-1",
    actor: { principalId: "p-1" },
    display: { title: "Row row-1" },
    at: AT,
    expectedVersion: 1,
  });
  assert.equal(trashed.ok, true);

  await assert.rejects(
    () => h.trash.restore({ workspaceId: WS, entityType: ENTITY_TYPE, entityId: "row-1", at: AT2 }),
    /afterUnhide boom/
  );

  assert.deepEqual(readRow(h.client, "row-1"), { status: "trashed", version: 2 });
  const indexed = await h.repo.findByEntity({ workspaceId: WS, entityType: ENTITY_TYPE, entityId: "row-1" });
  assert.notEqual(indexed, null, "a rolled-back restore must leave the trashed_items row in place");
});

// ---------------------------------------------------------------------------
// beforePurge / afterPurge
// ---------------------------------------------------------------------------

test("beforePurge reads the row's pre-purge state and afterPurge receives exactly that, once, only on 'purged'", async () => {
  const afterCalls: { workspaceId: string; entityId: string; priorState: unknown }[] = [];
  const h = harness({
    beforePurge: async (required) => {
      const row = readRow(h.client, required.entityId);
      return { titleAtPurgeTime: row ? `Row ${required.entityId}` : null };
    },
    afterPurge: async (required) => void afterCalls.push(required),
  });
  seedRow(h.client, "row-1", { status: "trashed", version: 2 });
  await h.repo.insert({
    id: "trash-1",
    workspaceId: WS,
    entityType: ENTITY_TYPE,
    entityId: "row-1",
    trashedAt: AT,
    purgeAfter: "2099-01-01T00:00:00.000Z",
    actorPrincipalId: "p-1",
    actorPluginId: null,
    displayTitle: "Row row-1",
    displaySubtitle: null,
    entityVersion: 2,
    priorMarker: "published",
  });

  const report = await h.trash.purgeSelected({
    workspaceId: WS,
    ids: ["trash-1"],
    actor: { principalId: "p-1" },
    authorizeItem: async () => true,
  });

  assert.deepEqual(report, { purged: 1, results: [{ id: "trash-1", outcome: "purged" }] });
  assert.deepEqual(afterCalls, [
    { workspaceId: WS, entityId: "row-1", priorState: { titleAtPurgeTime: "Row row-1" } },
  ]);
  assert.equal(readRow(h.client, "row-1"), undefined, "the row must actually be gone");
});

test("afterPurge never fires on a no-op purge outcome (already-gone)", async () => {
  const afterCalls: unknown[] = [];
  const h = harness({ afterPurge: async (required) => void afterCalls.push(required) });
  // No domain row seeded at all — the index row points at a row that is already gone.
  await h.repo.insert({
    id: "trash-1",
    workspaceId: WS,
    entityType: ENTITY_TYPE,
    entityId: "row-missing",
    trashedAt: AT,
    purgeAfter: "2099-01-01T00:00:00.000Z",
    actorPrincipalId: "p-1",
    actorPluginId: null,
    displayTitle: "Row row-missing",
    displaySubtitle: null,
    entityVersion: 1,
    priorMarker: "published",
  });

  const report = await h.trash.purgeSelected({
    workspaceId: WS,
    ids: ["trash-1"],
    actor: { principalId: "p-1" },
    authorizeItem: async () => true,
  });

  assert.deepEqual(report, { purged: 0, results: [{ id: "trash-1", outcome: "already-gone" }] });
  assert.deepEqual(afterCalls, []);
});

test("a throwing afterPurge rolls back the whole purge — the row and its index entry both survive", async () => {
  const h = harness({
    afterPurge: async () => {
      throw new Error("afterPurge boom");
    },
  });
  seedRow(h.client, "row-1", { status: "trashed", version: 2 });
  await h.repo.insert({
    id: "trash-1",
    workspaceId: WS,
    entityType: ENTITY_TYPE,
    entityId: "row-1",
    trashedAt: AT,
    purgeAfter: "2099-01-01T00:00:00.000Z",
    actorPrincipalId: "p-1",
    actorPluginId: null,
    displayTitle: "Row row-1",
    displaySubtitle: null,
    entityVersion: 2,
    priorMarker: "published",
  });

  await assert.rejects(
    () =>
      h.trash.purgeSelected({
        workspaceId: WS,
        ids: ["trash-1"],
        actor: { principalId: "p-1" },
        authorizeItem: async () => true,
      }),
    /afterPurge boom/
  );

  assert.deepEqual(readRow(h.client, "row-1"), { status: "trashed", version: 2 }, "the delete must have rolled back");
  const indexed = await h.repo.findByEntity({ workspaceId: WS, entityType: ENTITY_TYPE, entityId: "row-1" });
  assert.notEqual(indexed, null, "a rolled-back purge must leave the trashed_items row in place");
});
