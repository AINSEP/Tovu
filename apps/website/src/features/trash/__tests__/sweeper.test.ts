import { createTrashScheduler } from "#src/features/trash/scheduler.node";
import assert from "node:assert/strict";
import test from "node:test";

import * as schema from "#src/platform/db/schema.sqlite";
import { openContentDb } from "#src/platform/db/sqlite/content-db";

import { createSqliteTrashDb } from "../db-port.sqlite.js";
import { createContentDbTransactionRunner, SqliteTrashRepo } from "../repo.sqlite.js";
import { buildTrashRegistry } from "../registry.js";
import { createTrashSweep, startTrashSweeper, type TrashSweepOnce, type TrashSweepReport } from "@jini-ai/cms/trash";
import { createTableTrashAdapter } from "../table-adapter.js";
import { createTrashService } from "@jini-ai/cms/trash";
import type { TrashAdapter } from "@jini-ai/cms/trash";

// Pure claim/compare/delete and restore-race cases moved to Jini trash/__tests__/sweeper.decision.test.ts.
const ACTOR = { principalId: "principal-1" };
const DUE = "2027-01-01T00:00:00.000Z";

// --- the timer half ------------------------------------------------------------------------

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const EMPTY_REPORT: TrashSweepReport = { claimed: 0, purged: 0, results: [] };
const clockAt = (nowIso: string) => ({ nowMs: () => Date.parse(nowIso) });

test("startTrashSweeper runs a sweep on start, derives the lease from the clock, and stops cleanly", async () => {
  const seen: Parameters<TrashSweepOnce>[0][] = [];
  const first = deferred<void>();
  const sweeper = startTrashSweeper(
    {
      sweep: async (required) => {
        seen.push(required);
        first.resolve();
        return EMPTY_REPORT;
      },
      clock: clockAt(DUE), scheduler: createTrashScheduler({}), leaseOwner: "owner-1"
    },
    { intervalMs: 50, batchSize: 7, leaseMs: 30_000, }
  );

  await first.promise;
  await sweeper.stop({});

  assert.equal(seen.length >= 1, true);
  assert.deepEqual(seen[0], {
    now: DUE,
    leaseOwner: "owner-1",
    leaseUntil: "2027-01-01T00:00:30.000Z",
    limit: 7,
  });
});

test("a sweep that throws goes to onError and the loop carries on", async () => {
  const errors: unknown[] = [];
  const secondCall = deferred<void>();
  let calls = 0;
  const sweeper = startTrashSweeper(
    {
      sweep: async () => {
        calls += 1;
        if (calls === 1) throw new Error("database is locked");
        secondCall.resolve();
        return EMPTY_REPORT;
      },
      clock: clockAt(DUE), scheduler: createTrashScheduler({}), leaseOwner: "sweeper-under-test"
    },
    { intervalMs: 1, onError: ({ error }) => errors.push(error) }
  );

  await secondCall.promise;
  await sweeper.stop({});

  assert.equal(errors.length, 1);
  assert.match((errors[0] as Error).message, /database is locked/);
});

test("a full batch sweeps again immediately instead of waiting out the interval", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const sweeper = startTrashSweeper(
    {
      // A full batch every time would spin forever, so the second pass reports a partial one.
      sweep: async () => {
        calls += 1;
        if (calls >= 2) {
          return EMPTY_REPORT;
        }
        return { claimed: 3, purged: 3, results: [] };
      },
      clock: clockAt(DUE), scheduler: createTrashScheduler({}), leaseOwner: "sweeper-under-test"
    },
    // An interval long enough that a second call inside the test can only come from the
    // full-batch fast path, not from the idle timer.
    { intervalMs: 60_000, batchSize: 3 }
  );

  t.mock.timers.tick(0);
  // Let the async pass finish and schedule its next timer without advancing the idle interval.
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  t.mock.timers.tick(0);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
  await sweeper.stop({});

  assert.equal(calls, 2);
});

test("stop() is idempotent and waits for a sweep already in flight", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const started = deferred<void>();
  const release = deferred<void>();
  let settled = false;
  let calls = 0;
  const sweeper = startTrashSweeper(
    {
      sweep: async () => {
        calls += 1;
        started.resolve();
        await release.promise;
        settled = true;
        return EMPTY_REPORT;
      },
      clock: clockAt(DUE), scheduler: createTrashScheduler({}), leaseOwner: "sweeper-under-test"
    },
    { intervalMs: 1 }
  );

  t.mock.timers.tick(0);
  await started.promise;
  const stopping = sweeper.stop({});
  let stopped = false;
  void stopping.then(() => { stopped = true; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(stopped, false, "stop must remain pending while the sweep is held");
  release.resolve();
  await stopping;
  await sweeper.stop({});

  assert.equal(settled, true, "stop() must not resolve before the in-flight sweep has settled");
  assert.equal(stopped, true);
  assert.equal(calls, 1);
  t.mock.timers.tick(10);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(calls, 1, "an in-flight sweep must not reschedule after stop");
});

// ---------------------------------------------------------------------------
// Real menu adapter through the sweeper (T1c dispatch item 1(b)):
// Jini's sweeper.decision.test.ts drives `createTrashSweep` against a versioned fake adapter and proves the sweeper's
// OWN decision logic (claim/compare/delete, the restore race) but nothing about any one registered
// type. `sweeper.ts` has no per-`entityType` branch — `sweepTrashOnce` calls
// `deps.adapters.get(claim.entityType).purge(...)` the same way for every kind — so the menu-specific
// claim that "the 60-day sweeper purge behaves the same [as an interactive purge]"
// (`registry.ts`'s `menu` entry, `table-adapter.test.ts`'s purge/rollback tests) is really a claim
// about `sweeper.ts` calling the SAME `createTableTrashAdapter` instance, not a second implementation
// to keep in sync. Proved here against real SQLite rather than inferred from reading the two files
// side by side.
// ---------------------------------------------------------------------------

const REAL_WS = "workspace-real-1";
const REAL_AT = "2026-07-01T00:00:00.000Z";
/** Comfortably past the 60-day retention window from `REAL_AT`. */
const REAL_DUE = "2026-10-01T00:00:00.000Z";

test("the sweeper purges a real, overdue menu through the real table adapter — its location bindings go with it, in one transaction", async () => {
  const db = openContentDb(":memory:");
  const client = (db as unknown as { $client: import("better-sqlite3").Database }).$client;
  client
    .prepare(`INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)`)
    .run(REAL_WS, REAL_WS, REAL_WS, "2026-01-01T00:00:00.000Z");
  client
    .prepare(
      `INSERT INTO menus (id, workspace_id, slug, title, status, doc_json, locations_json, updated_at, version)
       VALUES ('menu-overdue', ?, 'slug-menu-overdue', 'Menu menu-overdue', 'trash', '{}', '{}', ?, 1)`
    )
    .run(REAL_WS, REAL_AT);
  client
    .prepare(`INSERT INTO nav_location_bindings (workspace_id, location_key, menu_id, bound_at) VALUES (?, 'header', 'menu-overdue', ?)`)
    .run(REAL_WS, REAL_AT);
  client
    .prepare(`INSERT INTO nav_location_bindings (workspace_id, location_key, menu_id, bound_at) VALUES (?, 'footer', 'menu-overdue', ?)`)
    .run(REAL_WS, REAL_AT);

  const registry = buildTrashRegistry();
  const trashDb = createSqliteTrashDb({ db });
  const menuAdapter = createTableTrashAdapter({ entry: registry.get("menu")!, db: trashDb });
  const adapters = new Map<string, TrashAdapter>([["menu", menuAdapter]]);
  const repo = new SqliteTrashRepo(client);
  await repo.insert({ row: {
    id: "trash-overdue-1",
    workspaceId: REAL_WS,
    entityType: "menu",
    entityId: "menu-overdue",
    trashedAt: REAL_AT,
    purgeAfter: "2026-08-30T00:00:00.000Z", // < REAL_DUE, so it is claimable
    actorPrincipalId: "principal-1",
    actorPluginId: null,
    displayTitle: "Menu menu-overdue",
    displaySubtitle: "slug-menu-overdue",
    entityVersion: 1,
    priorMarker: "published",
  } });

  const sweep = createTrashSweep({
    repo,
    adapters,
    transaction: ({ work }) => (createContentDbTransactionRunner(client))(work),
    entityPolicy: ({ entityType }) => (adapters).has(entityType)
  });
  const report = await sweep({ now: REAL_DUE, leaseOwner: "sweeper-1", leaseUntil: "2026-10-01T00:05:00.000Z", limit: 10 });

  assert.equal(report.claimed, 1);
  assert.equal(report.purged, 1);
  assert.deepEqual(report.results, [{ id: "trash-overdue-1", outcome: "purged" }]);

  const menuRow = client.prepare(`SELECT id FROM menus WHERE id = 'menu-overdue'`).get();
  assert.equal(menuRow, undefined, "the menu row must be gone");
  const bindingCount = (
    client.prepare(`SELECT COUNT(*) AS n FROM nav_location_bindings WHERE menu_id = 'menu-overdue'`).get() as { n: number }
  ).n;
  assert.equal(bindingCount, 0, "its location bindings must be gone too — same purgeFirst cascade an interactive purge runs");

  const stillIndexed = await repo.findByIds({ workspaceId: REAL_WS, ids: ["trash-overdue-1"] });
  assert.deepEqual(stillIndexed, [], "a purged row's index entry must be dropped too");
});

test("a thrown adapter error rolls back its purge, leaves the batch leased, and reaches onError", async (t) => {
  const db = openContentDb(":memory:");
  const client = (db as unknown as { $client: import("better-sqlite3").Database }).$client;
  t.after(() => client.close());
  client.prepare("INSERT INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)").run(REAL_WS, REAL_WS, REAL_WS, REAL_AT);
  for (const id of ["menu-throw", "menu-later"]) {
    client.prepare("INSERT INTO menus (id, workspace_id, slug, title, status, doc_json, locations_json, updated_at, version) VALUES (?, ?, ?, ?, 'published', '{}', '{}', ?, 1)")
      .run(id, REAL_WS, id, id, REAL_AT);
  }
  const adapter = createTableTrashAdapter({ entry: buildTrashRegistry().get("menu")!, db: createSqliteTrashDb({ db }) });
  const failure = new Error("purge failed after deletion");
  const calls: string[] = [];
  const adapters = new Map<string, TrashAdapter>([["menu", {
    ...adapter,
    async purge(required) {
      calls.push(required.entityId);
      const result = await adapter.purge(required);
      if (required.entityId === "menu-throw") throw failure;
      return result;
    },
  }]]);
  const repo = new SqliteTrashRepo(client);
  const transaction = createContentDbTransactionRunner(client);
  let seq = 0;
  const trash = createTrashService({
    repo,
    adapters,
    transaction: ({ work }) => (transaction)(work),
    idGen: { newId: () => `error-trash-${++seq}` },
    entityPolicy: ({ entityType }) => (adapters).has(entityType)
  }, { onError: ({ error }) => console.error("[trash] onChanged hook failed; the trash/restore/purge it followed already committed", error) });
  for (const [entityId, at] of [["menu-throw", REAL_AT], ["menu-later", "2026-07-02T00:00:00.000Z"]]) {
    assert.deepEqual(await trash.trash({ workspaceId: REAL_WS, entityType: "menu", entityId: entityId!, at: at!, expectedVersion: 1, display: { title: entityId! }, actor: ACTOR }), { ok: true, version: 2, priorMarker: "published" });
  }
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const reported = deferred<unknown>();
  const sweeper = startTrashSweeper({
    sweep: createTrashSweep({
      repo,
      adapters,
      transaction: ({ work }) => (transaction)(work),
      entityPolicy: ({ entityType }) => (adapters).has(entityType)
    }), clock: clockAt(REAL_DUE), scheduler: createTrashScheduler({}), leaseOwner: "error-sweeper"
  }, {
    intervalMs: 60_000, leaseMs: 60_000, onError: ({ error }) => reported.resolve(error),
  });
  t.mock.timers.tick(0);
  assert.equal(await reported.promise, failure);
  await sweeper.stop({});
  assert.deepEqual(calls, ["menu-throw"], "exceptions abort the pass; later claims wait for lease expiry");
  assert.deepEqual(client.prepare("SELECT id, status, version FROM menus ORDER BY id").all(), [
    { id: "menu-later", status: "trash", version: 2 },
    { id: "menu-throw", status: "trash", version: 2 },
  ], "the first row's delete rolls back and the later row remains untouched");
  assert.deepEqual(client.prepare("SELECT id, purge_lease_owner FROM trashed_items ORDER BY id").all(), [
    { id: "error-trash-1", purge_lease_owner: "error-sweeper" },
    { id: "error-trash-2", purge_lease_owner: "error-sweeper" },
  ]);
  assert.deepEqual(await repo.claimDue({ now: REAL_DUE, leaseOwner: "retry", leaseUntil: "2026-10-01T00:01:00.000Z", limit: 10 }), []);
});
