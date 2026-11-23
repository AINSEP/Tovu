import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { recordingKernel } from "#src/__tests__/lane-su-pins/support/recording-kernel";
import type { TrashEntityType, TrashEntry, TrashRegistry } from "@jini-ai/cms/trash";
import { buildTrashRegistry } from "../registry.js";
import { SqliteTrashRepo } from "../repo.sqlite.js";
import { entryWhere, loose, readLiveSnapshot, notTrashed } from "@jini-ai/cms/trash/sql";

/**
 * @file S4a T0: the Trash SQL kit's contracts on the unmoved code, before it moves to Jini `@jini-ai/cms/trash/sql`.
 * Sweep claims (due rows only, an unexpired lease keeps a row out, the sweep lock is taken before the read, concurrent
 * claimers get disjoint batches), `notTrashed` per marker kind as a real `WHERE`, `readLiveSnapshot` never returns a trashed
 * row, `entryWhere` keeps the entry's fixed `scope` predicate. Each test names the one-line mutation that turns it red.
 */

const WS = "ws-1";
const NOW = "2026-10-10T00:00:00.000Z";
const EARLIER = "2026-10-09T00:00:00.000Z";
const LATER = "2026-10-11T00:00:00.000Z";

/** `trashed_items.workspace_id` is a real foreign key, so the claim tests need the workspace row. */
async function repoWithWorkspace() {
  const { kernel, keys } = recordingKernel();
  await kernel.run((db) => db.insertInto("workspaces").values({ id: WS, name: WS, slug: WS, created_at: NOW }).execute());
  return { kernel, keys, repo: new SqliteTrashRepo({ store: kernel }) };
}

function item(id: string, purgeAfter: string, entityId = id) {
  return { id, workspaceId: WS, entityType: "form" as const, entityId, trashedAt: EARLIER, purgeAfter, actorPrincipalId: "p", actorPluginId: null, displayTitle: id, displaySubtitle: null, entityVersion: 1, priorMarker: null };
}

test("claimDue takes rows due at or before now, never a later row nor a row under a live lease", async () => {
  const { kernel, repo } = await repoWithWorkspace();
  for (const row of [item("before", EARLIER), item("at", NOW), item("after", LATER), item("leased", EARLIER), item("lapsed", EARLIER)]) await repo.insert({ row });
  await kernel.run((db) => db.updateTable("trashed_items").set({ purge_lease_owner: "other", purge_lease_expires_at: LATER }).where("id", "=", "leased").execute());
  await kernel.run((db) => db.updateTable("trashed_items").set({ purge_lease_owner: "other", purge_lease_expires_at: EARLIER }).where("id", "=", "lapsed").execute());
  const claimed = await repo.claimDue({ now: NOW, leaseOwner: "me", leaseUntil: LATER, limit: 10 });
  assert.deepEqual(claimed.map((row) => row.id).sort(), ["at", "before", "lapsed"]);
  assert.deepEqual(await repo.claimDue({ now: NOW, leaseOwner: "again", leaseUntil: LATER, limit: 10 }), [], "a second claimer finds nothing");
});

test("claimDue takes the sweep lock before it reads, inside a transaction", async () => {
  const { kernel, keys, repo } = await repoWithWorkspace();
  await repo.insert({ row: item("a", EARLIER) });
  keys.length = 0;
  await repo.claimDue({ now: NOW, leaseOwner: "me", leaseUntil: LATER, limit: 5 });
  assert.deepEqual(keys, ["trash:sweep-claim"]);
});

test("two concurrent claimers lease disjoint batches", async () => {
  const { kernel, repo } = await repoWithWorkspace();
  for (const id of ["a", "b", "c", "d"]) await repo.insert({ row: item(id, EARLIER) });
  const [first, second] = await Promise.all([
    repo.claimDue({ now: NOW, leaseOwner: "one", leaseUntil: LATER, limit: 2 }),
    repo.claimDue({ now: NOW, leaseOwner: "two", leaseUntil: LATER, limit: 2 }),
  ]);
  const ids = [...first, ...second].map((row) => row.id).sort();
  assert.deepEqual(ids, ["a", "b", "c", "d"]);
});

/** One entry per marker kind over plain tables: the condition is run as a real WHERE. */
function entry(over: Partial<TrashEntry> & Pick<TrashEntry, "entityType" | "table" | "marker">): TrashEntry {
  return { label: over.entityType, permission: "x.delete", idColumn: "id", workspaceColumn: "workspace_id", display: { title: `${over.table}.id` }, ...over };
}

test("notTrashed, as a real WHERE: a timestamp marker, a status marker, and hidden-with-parent over a live, trashed and NULL parent", async () => {
  const { kernel } = recordingKernel();
  const timestamp = entry({ entityType: "form", table: "t_ts", marker: { kind: "timestamp", column: "deleted_at" } });
  const status = entry({ entityType: "menu", table: "t_st", marker: { kind: "status", column: "status", trashed: "trash", restoreFallback: "draft" } });
  const child = entry({ entityType: "term", table: "t_child", marker: { kind: "status", column: "status", trashed: "trash", restoreFallback: "active" },
    hiddenWithParent: { parentTable: "t_parent", parentIdColumn: "parent_id", parentPkColumn: "id", parentMarker: { kind: "status", column: "status", trashed: "trash", restoreFallback: "active" } } });
  const registry: TrashRegistry = new Map<TrashEntityType, TrashEntry>([["form", timestamp], ["menu", status], ["term", child]]);
  const { sql } = await import("kysely");
  const statements = `CREATE TABLE t_ts (id TEXT PRIMARY KEY, workspace_id TEXT, deleted_at TEXT);
    CREATE TABLE t_st (id TEXT PRIMARY KEY, workspace_id TEXT, status TEXT);
    CREATE TABLE t_parent (id TEXT PRIMARY KEY, status TEXT);
    CREATE TABLE t_child (id TEXT PRIMARY KEY, workspace_id TEXT, parent_id TEXT, status TEXT);
    INSERT INTO t_ts VALUES ('live', 'w', NULL), ('gone', 'w', '2026-10-09');
    INSERT INTO t_st VALUES ('live', 'w', 'draft'), ('gone', 'w', 'trash');
    INSERT INTO t_parent VALUES ('p-live', 'active'), ('p-gone', 'trash');
    INSERT INTO t_child VALUES ('c-live', 'w', 'p-live', 'active'), ('c-own', 'w', 'p-live', 'trash'), ('c-orphan', 'w', 'p-gone', 'active'), ('c-null', 'w', NULL, 'active');`.split(";").map((statement) => statement.trim()).filter(Boolean);
  for (const statement of statements) await kernel.execute(sql.raw(statement));
  const ids = (table: string, type: TrashEntityType) =>
    kernel.run((db) => loose(db).selectFrom(table).select(`${table}.id`).where((eb) => notTrashed({ entityType: type, registry })(eb)).orderBy(`${table}.id`).execute()).then((rows) => rows.map((row) => String(row.id)));
  assert.deepEqual(await ids("t_ts", "form"), ["live"]);
  assert.deepEqual(await ids("t_st", "menu"), ["live"]);
  // A NULL parent id has no parent row, so `NOT EXISTS` is true: the child reads as live.
  assert.deepEqual(await ids("t_child", "term"), ["c-live", "c-null"]);
});

function widgetRow(id: string, over: Record<string, unknown> = {}) {
  return { id, workspace_id: WS, type: "widget", slug: `slug-${id}`, status: "draft", title: `Title ${id}`, body_json: null, fields_json: "{}", published_at: null, created_at: NOW, updated_at: NOW, version: 3, deleted_at: null, ...over };
}

test("readLiveSnapshot returns a live row (title, subtitle, version) and null for a trashed row", async () => {
  const { kernel } = recordingKernel();
  const registry = buildTrashRegistry();
  const widget = registry.get("widget")!;
  await kernel.run((db) => db.insertInto("entries").values([widgetRow("live"), widgetRow("gone", { deleted_at: EARLIER })]).execute());
  assert.deepEqual(await readLiveSnapshot({ entry: widget, workspaceId: WS, entityId: "live" }, { kernel, registry }), { title: "Title live", subtitle: "slug-live", version: 3 });
  assert.equal(await readLiveSnapshot({ entry: widget, workspaceId: WS, entityId: "gone" }, { kernel, registry }), null);
  assert.equal(await readLiveSnapshot({ entry: widget, workspaceId: "ws-2", entityId: "live" }, { kernel, registry }), null, "another workspace");
});

test("entryWhere keeps the entry's fixed scope: a widget entry cannot address an entry of another type by id", async () => {
  const { kernel } = recordingKernel();
  const registry = buildTrashRegistry();
  const widget = registry.get("widget")!;
  await kernel.run((db) => db.insertInto("entries").values([widgetRow("w1"), widgetRow("recipe-1", { type: "recipe" })]).execute());
  assert.equal(await readLiveSnapshot({ entry: widget, workspaceId: WS, entityId: "recipe-1" }, { kernel, registry }), null);
  const hits = await kernel.run((db) => loose(db).selectFrom("entries").select("entries.id").where((eb) => entryWhere({ eb, entry: widget, workspaceId: WS, entityId: "recipe-1" })).execute());
  assert.deepEqual(hits, []);
});
