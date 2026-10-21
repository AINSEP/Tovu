import assert from "node:assert/strict";
import { test } from "node:test";

import type { SearchIndexStateRow, SearchTarget } from "@jini-ai/search";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { Kysely } from "kysely";
import { createSqlSearchIndexStore, type SearchIndexDatabase } from "../index-state-store.js";

/** The content kernel's Kysely handle, re-typed for 0023's raw-SQL tables (as the store does). */
const tables = (db: unknown) => db as Kysely<SearchIndexDatabase>;

/** @file The search-index store's one Kysely body on SQLite and PGlite, over the real 0023 tables. */

const TARGET: SearchTarget = { siteId: "site-a", providerId: "builtin", generation: 1 };
const OTHER: SearchTarget = { siteId: "site-a", providerId: "builtin", generation: 2 };

function row(overrides: Partial<SearchIndexStateRow> = {}): SearchIndexStateRow {
  return {
    target: TARGET,
    key: { siteId: "site-a", workspaceId: "ws", collection: "post", documentId: "p/1" },
    revision: 1_760_000_000_123,
    deleted: false,
    status: "pending",
    attempts: 0,
    updatedAtMs: 1_760_000_000_500,
    ...overrides,
  };
}

const key = (documentId: string) => ({ siteId: "site-a", workspaceId: "ws", collection: "post", documentId });

describeEachDialect("SqlSearchIndexStore", {
  tables: ["search_index_state", "search_index_watermarks", "search_index_targets"],
  make: (kernel) => {
    let clock = 1_000;
    return { kernel, ...createSqlSearchIndexStore({ kernel, now: () => clock++ }) };
  },
}, (make) => {
  test("put inserts then upserts one row per (target, key); get round-trips every field, incl. epoch-ms bigints", async () => {
    const { indexState } = make();
    assert.equal(await indexState.get({ target: TARGET, key: key("p/1") }), null);
    await indexState.put({ row: row() });
    assert.deepEqual(await indexState.get({ target: TARGET, key: key("p/1") }), row());
    const settled = row({ revision: 1_760_000_000_999, deleted: true, status: "failed", attempts: 3, taskId: "t-9", lastError: "boom", updatedAtMs: 1_760_000_001_000 });
    await indexState.put({ row: settled });
    assert.deepEqual(await indexState.get({ target: TARGET, key: key("p/1") }), settled);
    // Same key, other generation: an independent row.
    assert.equal(await indexState.get({ target: OTHER, key: key("p/1") }), null);
    // A key whose parts contain "/" is stored under its encoded form and never collides.
    assert.equal(await indexState.get({ target: TARGET, key: { ...key("p"), collection: "post/1" } }), null);
  });

  test("listByStatus filters by target and status, oldest first with the key as tie-break, capped at limit", async () => {
    const { indexState } = make();
    await indexState.put({ row: row({ key: key("c"), status: "unknown", updatedAtMs: 5 }) });
    await indexState.put({ row: row({ key: key("b"), status: "pending", updatedAtMs: 5 }) });
    await indexState.put({ row: row({ key: key("a"), status: "pending", updatedAtMs: 9 }) });
    await indexState.put({ row: row({ key: key("d"), status: "indexed", updatedAtMs: 1 }) });
    await indexState.put({ row: row({ target: OTHER, key: key("e"), status: "pending", updatedAtMs: 1 }) });
    const ids = async (statuses: Parameters<typeof indexState.listByStatus>[0]["statuses"], limit = 10) =>
      (await indexState.listByStatus({ target: TARGET, statuses, limit })).map(r => r.key.documentId);
    assert.deepEqual(await ids(["pending", "unknown"]), ["b", "c", "a"]);
    assert.deepEqual(await ids(["pending", "unknown"], 2), ["b", "c"]);
    assert.deepEqual(await ids(["indexed"]), ["d"]);
    assert.deepEqual(await ids([]), [], "no status asked for matches no row");
  });

  test("counts reports every status, zero when absent, per target", async () => {
    const { indexState } = make();
    assert.deepEqual(await indexState.counts({ target: TARGET }), { pending: 0, indexed: 0, unknown: 0, failed: 0 });
    await indexState.put({ row: row({ key: key("a"), status: "pending" }) });
    await indexState.put({ row: row({ key: key("b"), status: "pending" }) });
    await indexState.put({ row: row({ key: key("c"), status: "failed" }) });
    await indexState.put({ row: row({ target: OTHER, key: key("d"), status: "indexed" }) });
    assert.deepEqual(await indexState.counts({ target: TARGET }), { pending: 2, indexed: 0, unknown: 0, failed: 1 });
  });

  test("watermarks: null before start, cursor while running, cursor-less done, upserted in place", async () => {
    const { indexState } = make();
    assert.equal(await indexState.getWatermark({ target: TARGET, collection: "post" }), null);
    await indexState.putWatermark({ target: TARGET, collection: "post", cursor: "id-5", done: false });
    assert.deepEqual(await indexState.getWatermark({ target: TARGET, collection: "post" }), { cursor: "id-5", done: false });
    await indexState.putWatermark({ target: TARGET, collection: "post", done: true });
    assert.deepEqual(await indexState.getWatermark({ target: TARGET, collection: "post" }), { done: true });
    assert.equal(await indexState.getWatermark({ target: TARGET, collection: "page" }), null);
    assert.equal(await indexState.getWatermark({ target: OTHER, collection: "post" }), null);
  });

  test("deleteTarget drops that target's rows and watermarks only", async () => {
    const { indexState } = make();
    await indexState.put({ row: row({ key: key("a") }) });
    await indexState.put({ row: row({ target: OTHER, key: key("a") }) });
    await indexState.putWatermark({ target: TARGET, collection: "post", done: true });
    await indexState.putWatermark({ target: OTHER, collection: "post", done: true });
    await indexState.deleteTarget({ target: TARGET });
    assert.equal(await indexState.get({ target: TARGET, key: key("a") }), null);
    assert.equal(await indexState.getWatermark({ target: TARGET, collection: "post" }), null);
    assert.ok(await indexState.get({ target: OTHER, key: key("a") }));
    assert.deepEqual(await indexState.getWatermark({ target: OTHER, collection: "post" }), { done: true });
  });

  test("targets: empty site, setBuilding (replacing an unfinished one), promote, clearBuilding", async () => {
    const { targets, kernel } = make();
    assert.deepEqual(await targets.get({ siteId: "site-a" }), { active: null, building: null });
    await targets.setBuilding({ target: TARGET });
    await targets.setBuilding({ target: OTHER });
    assert.deepEqual(await targets.get({ siteId: "site-a" }), { active: null, building: OTHER });
    assert.equal(await targets.promote({ siteId: "site-a", expected: TARGET }), false, "a stale expectation never switches");
    assert.deepEqual(await targets.promote({ siteId: "site-a", expected: OTHER }), { replaced: null });
    assert.deepEqual(await targets.get({ siteId: "site-a" }), { active: OTHER, building: null });
    assert.equal(await targets.promote({ siteId: "site-a", expected: OTHER }), false, "a second promote of the same build finds no building");

    const next = { siteId: "site-a", providerId: "meili", generation: 3 };
    await targets.setBuilding({ target: next });
    assert.deepEqual(await targets.get({ siteId: "site-a" }), { active: OTHER, building: next }, "a rebuild keeps the active pointer");
    assert.deepEqual(await targets.promote({ siteId: "site-a", expected: next }), { replaced: OTHER });
    assert.deepEqual(await targets.get({ siteId: "site-a" }), { active: next, building: null });

    await targets.setBuilding({ target: TARGET });
    await targets.clearBuilding({ siteId: "site-a" });
    assert.deepEqual(await targets.get({ siteId: "site-a" }), { active: next, building: null });
    await targets.clearBuilding({ siteId: "site-b" });
    assert.deepEqual(await targets.get({ siteId: "site-b" }), { active: null, building: null }, "clearing an unknown site is a no-op");
    assert.equal(await targets.promote({ siteId: "site-b", expected: TARGET }), false);
    // The pointer row records when it last changed (injected clock, strictly increasing).
    const [stamp] = await kernel.run(db => tables(db)
      .selectFrom("search_index_targets").select("updated_at_ms").where("site_id", "=", "site-a").execute());
    assert.ok(Number(stamp!.updated_at_ms) > 1_000);
  });

  test("promote is a compare-and-swap on the active pointer too: a switch that raced in first wins", async () => {
    const { targets, kernel } = make();
    const raced = { siteId: "site-a", providerId: "meili", generation: 7 };
    await targets.setBuilding({ target: TARGET });
    // Between promote's read and its UPDATE another writer moves the active pointer; simulated by a
    // kernel whose first read reports the pre-race state.
    const racing = createSqlSearchIndexStore({
      kernel: { ...kernel, run: async (fn) => {
        const result = await kernel.run(fn);
        await kernel.run(db => tables(db)
          .updateTable("search_index_targets").set({ active_provider_id: raced.providerId, active_generation: raced.generation }).where("site_id", "=", "site-a").execute());
        return result;
      } },
      now: () => 1,
    });
    assert.equal(await racing.targets.promote({ siteId: "site-a", expected: TARGET }), false);
    assert.deepEqual(await targets.get({ siteId: "site-a" }), { active: raced, building: TARGET });
  });
});
