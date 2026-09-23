import assert from "node:assert/strict";
import test from "node:test";

import * as schema from "#src/platform/db/schema.sqlite";
import { openContentDb } from "#src/platform/db/sqlite/content-db";

import { createSqliteTrashDb } from "../db-port.sqlite.js";
import { InMemoryTrashRepo } from "../repo.memory.js";
import { createContentDbTransactionRunner, SqliteTrashRepo } from "../repo.sqlite.js";
import { buildTrashRegistry } from "../registry.js";
import {
  createTrashSweep,
  startTrashSweeper,
  type TrashSweepOnce,
  type TrashSweepReport,
} from "../sweeper.js";
import { createTableTrashAdapter } from "../table-adapter.js";
import { bindRemoveEntity, createTrashService } from "../write-service.js";
import type {
  TrashAdapter,
  TrashMarkerResult,
  TrashPurgeOutcome,
  TrashRepoPort,
  TrashPort,
} from "../ports.js";

/**
 * @file The 60-day backstop, and the one property that matters about it: **a concurrent restore
 * always wins.** Everything else here exists to stop that guarantee being bought by accident.
 *
 * The domain double below is versioned, because the interesting failures are all version-shaped.
 * `purgeCalls` is asserted directly in the restore-race test: the point is not merely that the
 * entity survived, it is that the sweeper never reached for it at all.
 */

const WS = "workspace-1";
const OTHER_WS = "workspace-2";
const ACTOR = { principalId: "principal-1" };
const AT = "2026-09-20T12:00:00.000Z";
/** Comfortably past `AT` + the 60-day retention window. */
const DUE = "2027-01-01T00:00:00.000Z";
const ENTITY = "widget";

interface FakeDomain {
  adapter: TrashAdapter;
  rows: Map<string, { version: number; hidden: boolean }>;
  purgeCalls: string[];
}

/**
 * A versioned domain plus its adapter: `hide`/`unhide` bump the version exactly the way the real
 * post adapter does, so the version the index captures is the one a later purge compares against.
 */
function fakeDomain(entityType = ENTITY): FakeDomain {
  const rows = new Map<string, { version: number; hidden: boolean }>();
  const purgeCalls: string[] = [];

  const move = (
    entityId: string,
    expectedVersion: number | null,
    hidden: boolean
  ): TrashMarkerResult => {
    const row = rows.get(entityId);
    if (!row) return { ok: false, reason: "not-found" };
    if (expectedVersion !== null && row.version !== expectedVersion) {
      return { ok: false, reason: "version-changed" };
    }
    row.hidden = hidden;
    row.version += 1;
    return { ok: true, version: row.version };
  };

  return {
    rows,
    purgeCalls,
    adapter: {
      entityType,
      async hide(required) {
        return move(required.entityId, required.expectedVersion, true);
      },
      async unhide(required) {
        return move(required.entityId, required.expectedVersion, false);
      },
      async purge(required): Promise<TrashPurgeOutcome> {
        purgeCalls.push(required.entityId);
        const row = rows.get(required.entityId);
        if (!row) return "already-gone";
        if (required.expectedVersion !== null && row.version !== required.expectedVersion) {
          return "version-changed";
        }
        rows.delete(required.entityId);
        return "purged";
      },
    },
  };
}

interface Harness {
  repo: InMemoryTrashRepo;
  trash: TrashPort;
  domain: FakeDomain;
  sweep: TrashSweepOnce;
  adapters: Map<string, TrashAdapter>;
}

function harness(optional: { repoWrapper?: (repo: InMemoryTrashRepo) => TrashRepoPort } = {}): Harness {
  const repo = new InMemoryTrashRepo();
  const domain = fakeDomain();
  const adapters = new Map<string, TrashAdapter>([[ENTITY, domain.adapter]]);
  let seq = 0;
  const passThrough = <T>(fn: () => Promise<T>): Promise<T> => fn();
  const trash = createTrashService({
    repo,
    adapters,
    idGen: { next: () => `trash-${(seq += 1)}` },
    transaction: passThrough,
  });
  const sweep = createTrashSweep({
    repo: optional.repoWrapper ? optional.repoWrapper(repo) : repo,
    adapters,
    transaction: passThrough,
  });
  return { repo, trash, domain, sweep, adapters };
}

/** Trashes a fresh entity through the real write path, so the index row's version is real. */
async function trashOne(h: Harness, entityId: string, workspaceId = WS): Promise<void> {
  h.domain.rows.set(entityId, { version: 1, hidden: false });
  const remove = bindRemoveEntity(h.trash, ENTITY);
  const result = await remove({
    workspaceId,
    id: entityId,
    display: { title: entityId },
    at: AT,
    expectedVersion: 1,
    actor: ACTOR,
  });
  assert.equal(result.ok, true, `fixture: trashing ${entityId} should have succeeded`);
}

function sweepArgs(now: string, optional: { limit?: number } = {}) {
  return {
    now,
    leaseOwner: "sweeper-under-test",
    leaseUntil: new Date(new Date(now).getTime() + 60_000).toISOString(),
    limit: optional.limit ?? 50,
  };
}

/** Delegating repo that runs `hook` in the window between the claim and the purge. */
function claimThen(repo: InMemoryTrashRepo, hook: () => Promise<void>): TrashRepoPort {
  return {
    insert: (r) => repo.insert(r),
    findByEntity: (r) => repo.findByEntity(r),
    findByIds: (r) => repo.findByIds(r),
    deleteById: (r) => repo.deleteById(r),
    deleteByEntity: (r) => repo.deleteByEntity(r),
    list: (r) => repo.list(r),
    releaseLease: (r) => repo.releaseLease(r),
    async claimDue(r) {
      const claims = await repo.claimDue(r);
      await hook();
      return claims;
    },
  };
}

test("an expired row is purged and its index row goes with it", async () => {
  const h = harness();
  await trashOne(h, "post-1");

  const report = await h.sweep(sweepArgs(DUE));

  assert.deepEqual(report, { claimed: 1, purged: 1, results: [{ id: "trash-1", outcome: "purged" }] });
  assert.equal(h.domain.rows.has("post-1"), false, "the entity row should be physically gone");
  assert.deepEqual(h.repo.all(), [], "the index row should be gone with it");
});

test("a row that is not yet due is never claimed", async () => {
  const h = harness();
  await trashOne(h, "post-1");

  const report = await h.sweep(sweepArgs("2026-10-01T00:00:00.000Z"));

  assert.deepEqual(report, { claimed: 0, purged: 0, results: [] });
  assert.equal(h.domain.rows.has("post-1"), true);
  assert.equal(h.repo.all().length, 1);
});

test("a restore landing between the claim and the purge leaves the entity live and the index row gone", async () => {
  let restored = false;
  const h = harness({
    repoWrapper: (repo) =>
      claimThen(repo, async () => {
        if (restored) return;
        restored = true;
        const outcome = await h.trash.restore({
          workspaceId: WS,
          entityType: ENTITY,
          entityId: "post-1",
          at: DUE,
        });
        assert.equal(outcome, "restored", "fixture: the racing restore itself must succeed");
      }),
  });
  await trashOne(h, "post-1");

  const report = await h.sweep(sweepArgs(DUE));

  // The entity is alive and visible again...
  assert.deepEqual(h.domain.rows.get("post-1"), { version: 3, hidden: false });
  // ...its index row is gone, because removing it IS the restore...
  assert.deepEqual(h.repo.all(), []);
  // ...and the sweeper never even reached for the entity. Version alone would not have covered
  // this: a domain with a null entity_version has no version to have moved.
  assert.deepEqual(h.domain.purgeCalls, []);
  assert.deepEqual(report, { claimed: 1, purged: 0, results: [{ id: "trash-1", outcome: "not-found" }] });
});

test("a version that moved while the row stayed indexed stands the purge down, and both survive", async () => {
  const h = harness();
  await trashOne(h, "post-1");
  // An out-of-band edit while the entity sat in the Trash: the index's snapshot is now stale.
  h.domain.rows.get("post-1")!.version = 99;

  const report = await h.sweep(sweepArgs(DUE));

  assert.deepEqual(report, {
    claimed: 1,
    purged: 0,
    results: [{ id: "trash-1", outcome: "version-changed" }],
  });
  assert.equal(h.domain.rows.has("post-1"), true, "the safe outcome of a race is that the item survives");
  assert.equal(h.repo.all().length, 1, "and the index row survives with it, so it stays selectable");
});

test("an entity already deleted out from under the index is reported, and the index row is cleared", async () => {
  const h = harness();
  await trashOne(h, "post-1");
  h.domain.rows.delete("post-1");

  const report = await h.sweep(sweepArgs(DUE));

  assert.deepEqual(report.results, [{ id: "trash-1", outcome: "already-gone" }]);
  assert.deepEqual(h.repo.all(), [], "nothing is left to purge, so the row must not linger forever");
});

test("a row whose adapter is uninstalled is reported and left alone, never purged", async () => {
  const h = harness();
  await trashOne(h, "post-1");
  h.adapters.delete(ENTITY);

  const report = await h.sweep(sweepArgs(DUE));

  assert.deepEqual(report, {
    claimed: 1,
    purged: 0,
    results: [{ id: "trash-1", outcome: "adapter-unavailable" }],
  });
  assert.equal(h.repo.all().length, 1);
  assert.deepEqual(h.domain.purgeCalls, []);
});

test("a claimed row is invisible to the next sweep until its lease expires", async () => {
  const h = harness();
  await trashOne(h, "post-1");
  h.adapters.delete(ENTITY); // stands the purge down, so the row survives to be re-claimed

  assert.equal((await h.sweep(sweepArgs(DUE))).claimed, 1);
  assert.equal(
    (await h.sweep(sweepArgs(DUE))).claimed,
    0,
    "a second sweep inside the lease window must not claim the same row"
  );
  // `sweepArgs` leases for 60s; past that the row is reclaimable, which is what gives a sweeper
  // that died mid-batch its crash recovery.
  assert.equal((await h.sweep(sweepArgs("2027-01-01T00:02:00.000Z"))).claimed, 1);
});

test("the claim spans every workspace in the file, and each row is purged in its own", async () => {
  const h = harness();
  await trashOne(h, "post-1", WS);
  await trashOne(h, "post-2", OTHER_WS);

  const report = await h.sweep(sweepArgs(DUE));

  assert.equal(report.purged, 2);
  assert.deepEqual(h.repo.all(), []);
  assert.deepEqual(h.domain.purgeCalls.sort(), ["post-1", "post-2"]);
});

test("one row's failure never aborts the rest of the batch", async () => {
  const h = harness();
  await trashOne(h, "post-1");
  await trashOne(h, "post-2");
  h.domain.rows.get("post-1")!.version = 99;

  const report = await h.sweep(sweepArgs(DUE));

  assert.equal(report.claimed, 2);
  assert.equal(report.purged, 1);
  assert.deepEqual(
    report.results.map((r) => r.outcome).sort(),
    ["purged", "version-changed"]
  );
});

// --- the timer half ------------------------------------------------------------------------

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const EMPTY_REPORT: TrashSweepReport = { claimed: 0, purged: 0, results: [] };
const clockAt = (nowIso: string) => ({ nowIso: () => nowIso });

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
      clock: clockAt(DUE),
    },
    { intervalMs: 50, batchSize: 7, leaseMs: 30_000, leaseOwner: "owner-1" }
  );

  await first.promise;
  await sweeper.stop();

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
      clock: clockAt(DUE),
    },
    { intervalMs: 1, onError: (error) => errors.push(error) }
  );

  await secondCall.promise;
  await sweeper.stop();

  assert.equal(errors.length, 1);
  assert.match((errors[0] as Error).message, /database is locked/);
});

test("a full batch sweeps again immediately instead of waiting out the interval", async () => {
  const done = deferred<void>();
  let calls = 0;
  const sweeper = startTrashSweeper(
    {
      // A full batch every time would spin forever, so the second pass reports a partial one.
      sweep: async () => {
        calls += 1;
        if (calls >= 2) {
          done.resolve();
          return EMPTY_REPORT;
        }
        return { claimed: 3, purged: 3, results: [] };
      },
      clock: clockAt(DUE),
    },
    // An interval long enough that a second call inside the test can only come from the
    // full-batch fast path, not from the idle timer.
    { intervalMs: 60_000, batchSize: 3 }
  );

  await done.promise;
  await sweeper.stop();

  assert.equal(calls, 2);
});

test("stop() is idempotent and waits for a sweep already in flight", async () => {
  const started = deferred<void>();
  const release = deferred<void>();
  let settled = false;
  const sweeper = startTrashSweeper(
    {
      sweep: async () => {
        started.resolve();
        await release.promise;
        settled = true;
        return EMPTY_REPORT;
      },
      clock: clockAt(DUE),
    },
    { intervalMs: 1 }
  );

  await started.promise;
  const stopping = sweeper.stop();
  release.resolve();
  await stopping;
  await sweeper.stop();

  assert.equal(settled, true, "stop() must not resolve before the in-flight sweep has settled");
});

// ---------------------------------------------------------------------------
// Real menu adapter through the sweeper (T1c dispatch item 1(b)): every test above drives
// `createTrashSweep` against a fully fake `TrashAdapter` (`fakeDomain`), which proves the sweeper's
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

  const registry = buildTrashRegistry({ schema });
  const trashDb = createSqliteTrashDb({ db });
  const menuAdapter = createTableTrashAdapter({ entry: registry.get("menu")!, db: trashDb });
  const adapters = new Map<string, TrashAdapter>([["menu", menuAdapter]]);
  const repo = new SqliteTrashRepo(client);
  await repo.insert({
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
  });

  const sweep = createTrashSweep({ repo, adapters, transaction: createContentDbTransactionRunner(client) });
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
