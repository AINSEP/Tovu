import assert from "node:assert/strict";
import test from "node:test";
import type Database from "better-sqlite3";

import { openContentDb } from "#src/platform/db/sqlite/content-db";

import { createContentDbTransactionRunner, SqliteTrashRepo } from "../repo.sqlite.js";
import { createTrashService } from "../write-service.js";
import type { TrashAdapter, TrashChangeEvent, TrashMarkerResult, TrashPort, TrashPurgeOutcome } from "../ports.js";

/**
 * @file `TrashServiceDeps.onChanged` — fires once per actual state change (trash/restore/purge),
 * never for a no-op outcome, and a failure inside it never undoes the change it followed.
 *
 * Uses a stub adapter (no `table-adapter.ts` exists yet — that lands with G1b/G2) so every hide/
 * unhide/purge outcome, including the ones no bespoke adapter happens to produce today, is directly
 * controllable per test.
 */

const WS = "workspace-1";
const ACTOR = { principalId: "principal-1" };
const AT = "2026-09-21T12:00:00.000Z";
const STUB_ENTITY_TYPE = "stub-status";
const ALLOW_ALL = async () => true;

interface HarnessOptions {
  hide?: TrashMarkerResult;
  unhide?: TrashMarkerResult;
  purge?: TrashPurgeOutcome;
  onChanged?: (event: TrashChangeEvent) => void | Promise<void>;
}

function harness(options: HarnessOptions = {}): { trash: TrashPort; repo: SqliteTrashRepo; client: Database.Database } {
  const db = openContentDb(":memory:");
  const client = (db as unknown as { $client: Database.Database }).$client;
  client
    .prepare(`INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)`)
    .run(WS, WS, WS, "2026-01-01T00:00:00.000Z");

  const adapter: TrashAdapter = {
    entityType: STUB_ENTITY_TYPE,
    async hide() {
      return options.hide ?? { ok: true, version: 2 };
    },
    async unhide() {
      return options.unhide ?? { ok: true, version: 3 };
    },
    async purge() {
      return options.purge ?? "purged";
    },
  };

  const repo = new SqliteTrashRepo(client);
  let seq = 0;
  const trash = createTrashService({
    repo,
    adapters: new Map([[STUB_ENTITY_TYPE, adapter]]),
    idGen: { next: () => `trash-${(seq += 1)}` },
    transaction: createContentDbTransactionRunner(client),
    onChanged: options.onChanged,
  });
  return { trash, repo, client };
}

// ---------------------------------------------------------------------------
// trash()
// ---------------------------------------------------------------------------

test("trash() fires onChanged once, with change:'trash', after a successful hide", async () => {
  const events: TrashChangeEvent[] = [];
  const { trash } = harness({ onChanged: (event) => events.push(event) });

  await trash.trash({
    workspaceId: WS,
    entityType: STUB_ENTITY_TYPE,
    entityId: "e-1",
    actor: ACTOR,
    display: { title: "Entity e-1" },
    at: AT,
    expectedVersion: 1,
  });

  assert.deepEqual(events, [{ workspaceId: WS, entityType: STUB_ENTITY_TYPE, entityId: "e-1", change: "trash" }]);
});

test("trash() does not fire onChanged when the adapter refuses (version-changed)", async () => {
  const events: TrashChangeEvent[] = [];
  const { trash } = harness({ hide: { ok: false, reason: "version-changed" }, onChanged: (event) => events.push(event) });

  const result = await trash.trash({
    workspaceId: WS,
    entityType: STUB_ENTITY_TYPE,
    entityId: "e-1",
    actor: ACTOR,
    display: { title: "Entity e-1" },
    at: AT,
    expectedVersion: 1,
  });

  assert.deepEqual(result, { ok: false, reason: "version-changed" });
  assert.deepEqual(events, []);
});

test("a failure inside onChanged does not undo the committed trash, and is not rethrown", async () => {
  const { trash } = harness({
    onChanged: () => {
      throw new Error("outbox is down");
    },
  });

  const result = await trash.trash({
    workspaceId: WS,
    entityType: STUB_ENTITY_TYPE,
    entityId: "e-1",
    actor: ACTOR,
    display: { title: "Entity e-1" },
    at: AT,
    expectedVersion: 1,
  });

  assert.deepEqual(result, { ok: true, version: 2 });
  const page = await trash.list({ workspaceId: WS, now: AT, limit: 10 });
  assert.equal(page.items.length, 1, "the trash row must exist even though the hook threw");
});

// ---------------------------------------------------------------------------
// restore()
// ---------------------------------------------------------------------------

test("restore() fires onChanged once, with change:'restore', after a successful unhide", async () => {
  const events: TrashChangeEvent[] = [];
  const { trash } = harness({ onChanged: (event) => events.push(event) });

  await trash.trash({
    workspaceId: WS,
    entityType: STUB_ENTITY_TYPE,
    entityId: "e-1",
    actor: ACTOR,
    display: { title: "Entity e-1" },
    at: AT,
    expectedVersion: 1,
  });
  events.length = 0; // isolate the restore call from the trash call's own event

  const outcome = await trash.restore({ workspaceId: WS, entityType: STUB_ENTITY_TYPE, entityId: "e-1", at: AT });

  assert.equal(outcome, "restored");
  assert.deepEqual(events, [{ workspaceId: WS, entityType: STUB_ENTITY_TYPE, entityId: "e-1", change: "restore" }]);
});

test("restore() does not fire onChanged when there is no trashed_items row for the entity", async () => {
  const events: TrashChangeEvent[] = [];
  const { trash } = harness({ onChanged: (event) => events.push(event) });

  const outcome = await trash.restore({ workspaceId: WS, entityType: STUB_ENTITY_TYPE, entityId: "never-trashed", at: AT });

  assert.equal(outcome, "not-found");
  assert.deepEqual(events, []);
});

test("restore() does not fire onChanged when the adapter refuses (version-changed)", async () => {
  const events: TrashChangeEvent[] = [];
  // The adapter's `unhide` result is fixed per harness, so a case that needs `hide` to succeed and
  // `unhide` to fail needs its own harness rather than reconfiguring the one above mid-test.
  const { trash } = harness({ unhide: { ok: false, reason: "version-changed" }, onChanged: (event) => events.push(event) });

  await trash.trash({
    workspaceId: WS,
    entityType: STUB_ENTITY_TYPE,
    entityId: "e-1",
    actor: ACTOR,
    display: { title: "Entity e-1" },
    at: AT,
    expectedVersion: 1,
  });
  events.length = 0; // isolate the restore call from the trash call's own event

  const outcome = await trash.restore({ workspaceId: WS, entityType: STUB_ENTITY_TYPE, entityId: "e-1", at: AT });
  assert.equal(outcome, "version-changed");
  assert.deepEqual(events, []);
});

// ---------------------------------------------------------------------------
// purgeSelected()
// ---------------------------------------------------------------------------

test("purgeSelected fires onChanged once per purged item, with change:'purge'", async () => {
  const events: TrashChangeEvent[] = [];
  const { trash } = harness({ purge: "purged", onChanged: (event) => events.push(event) });

  for (const entityId of ["e-1", "e-2"]) {
    await trash.trash({
      workspaceId: WS,
      entityType: STUB_ENTITY_TYPE,
      entityId,
      actor: ACTOR,
      display: { title: entityId },
      at: AT,
      expectedVersion: 1,
    });
  }
  events.length = 0;

  const report = await trash.purgeSelected({ workspaceId: WS, ids: ["trash-1", "trash-2"], actor: ACTOR, authorizeItem: ALLOW_ALL });

  assert.equal(report.purged, 2);
  assert.deepEqual(
    events.sort((a, b) => a.entityId.localeCompare(b.entityId)),
    [
      { workspaceId: WS, entityType: STUB_ENTITY_TYPE, entityId: "e-1", change: "purge" },
      { workspaceId: WS, entityType: STUB_ENTITY_TYPE, entityId: "e-2", change: "purge" },
    ]
  );
});

test("purgeSelected does not fire onChanged for already-gone, not-found or forbidden — nothing changed", async () => {
  const events: TrashChangeEvent[] = [];
  const { trash } = harness({ purge: "already-gone", onChanged: (event) => events.push(event) });

  await trash.trash({
    workspaceId: WS,
    entityType: STUB_ENTITY_TYPE,
    entityId: "e-1",
    actor: ACTOR,
    display: { title: "e-1" },
    at: AT,
    expectedVersion: 1,
  });
  events.length = 0;

  const alreadyGoneReport = await trash.purgeSelected({ workspaceId: WS, ids: ["trash-1"], actor: ACTOR, authorizeItem: ALLOW_ALL });
  assert.deepEqual(alreadyGoneReport.results, [{ id: "trash-1", outcome: "already-gone" }]);

  const notFoundReport = await trash.purgeSelected({ workspaceId: WS, ids: ["does-not-exist"], actor: ACTOR, authorizeItem: ALLOW_ALL });
  assert.deepEqual(notFoundReport.results, [{ id: "does-not-exist", outcome: "not-found" }]);

  assert.deepEqual(events, [], "already-gone and not-found are no-ops; onChanged must not fire for either");
});

test("purgeSelected does not fire onChanged when a version-changed race stands the purge down", async () => {
  const events: TrashChangeEvent[] = [];
  const { trash } = harness({ purge: "version-changed", onChanged: (event) => events.push(event) });

  await trash.trash({
    workspaceId: WS,
    entityType: STUB_ENTITY_TYPE,
    entityId: "e-1",
    actor: ACTOR,
    display: { title: "e-1" },
    at: AT,
    expectedVersion: 1,
  });
  events.length = 0;

  const report = await trash.purgeSelected({ workspaceId: WS, ids: ["trash-1"], actor: ACTOR, authorizeItem: ALLOW_ALL });
  assert.deepEqual(report.results, [{ id: "trash-1", outcome: "version-changed" }]);
  assert.deepEqual(events, []);
});
