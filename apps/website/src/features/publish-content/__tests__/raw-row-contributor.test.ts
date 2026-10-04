import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { createRawRowSqlitePort } from "#src/platform/db/sqlite/publish-backstop-row.sqlite";
import { contributeRawRowPublish, rawRowId, undoRawRow } from "../raw-row-contributor.js";
import { contentKernel } from "#src/platform/db/content-kernel";
import type { PackedEntity, PublishContentDeps } from "../type-registry.js";

function fixture(t: test.TestContext) {
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE p_widgets(id TEXT PRIMARY KEY, title TEXT); CREATE TABLE p_links(id TEXT PRIMARY KEY, widget_id TEXT REFERENCES p_widgets(id));");
  const rows = createRawRowSqlitePort({ kernel: contentKernel(db) });
  const outbox = new InMemoryOutbox();
  let serial = 0;
  const deps: PublishContentDeps = {
    workspaceId: "ws", ports: {}, clock: { nowMs: () => Date.parse("2026-10-04T00:00:00.000Z") }, idGen: { newId: () => `id-${++serial}` },
    outbox, changeSets: new InMemoryChangeSetRepo([], [], outbox), authorize: async () => ({ allowed: true, reason: "test" }),
    backstop: { rows, coveredTables: ["posts"], coveredRoots: ["themes"], selection: { rows: [{ table: "p_widgets", pk: { id: "a" } }] } },
  };
  const handler = contributeRawRowPublish().build(deps);
  const collect = async () => { const packed: PackedEntity[] = []; for await (const entity of handler.pack()) packed.push(entity); return packed; };
  return { db, rows, deps, handler, collect };
}

test("selected plugin row packs all columns, round-trips its hash, and identical rows are unchanged", async (t) => {
  const f = fixture(t);
  f.db.prepare("INSERT INTO p_widgets VALUES (?, ?)").run("a", "footer");
  const [packed] = await f.collect();
  assert.equal(packed!.id, rawRowId({ table: "p_widgets", pk: { id: "a" } }));
  assert.deepEqual(packed!.state.values, { id: "a", title: "footer" });
  assert.equal((await f.handler.inspect(packed!.id))?.hash, packed!.contentHash);
  assert.equal(await f.handler.precheck(packed!), null);
});

test("covered tables, shape drift and hostile column names are refused on destination", async (t) => {
  const f = fixture(t);
  f.db.exec("INSERT INTO p_widgets VALUES ('a', 'footer')");
  const [packed] = await f.collect();
  assert.equal(await f.handler.precheck({ ...packed!, state: { ...packed!.state, table: "posts" } }), "Table 'posts' already publishes normally; use Overwrite live in normal publishing.");
  assert.equal(await f.handler.precheck({ ...packed!, state: { ...packed!.state, columns: [{ name: "id", type: "INTEGER", pk: 1, notnull: 0 }, { name: "title", type: "TEXT", pk: 0, notnull: 0 }] } }), "Live's 'p_widgets' has a different shape; update live first.");
  assert.match((await f.handler.precheck({ ...packed!, state: { ...packed!.state, values: { ...packed!.state.values as object, access_token: "x" } } }))!, /access_token/);
});

test("unsafe SQLite integers are skipped instead of silently rounded during transport", async (t) => {
  const f = fixture(t);
  f.db.exec("CREATE TABLE p_numbers(id TEXT PRIMARY KEY, amount INTEGER); INSERT INTO p_numbers VALUES('a', 9007199254740993)");
  const handler = contributeRawRowPublish().build({ ...f.deps, backstop: { ...f.deps.backstop!,
    selection: { rows: [{ table: "p_numbers", pk: { id: "a" } }] } } });
  const packed = []; for await (const entity of handler.pack()) packed.push(entity);
  assert.deepEqual(packed, []);
  assert.match((await handler.listSkipped!())[0]!.reason, /cannot be sent safely/);
});

test("create then undo removes only the created row; update then undo restores the prior row", async (t) => {
  const f = fixture(t);
  f.db.exec("INSERT INTO p_widgets VALUES ('a', 'new')");
  const [packed] = await f.collect();
  f.db.exec("DELETE FROM p_widgets");
  await f.handler.apply({ entity: packed!, principalId: "admin", expectedVersion: undefined, idempotencyKey: "create" });
  const created = await f.handler.inspect(packed!.id);
  assert.ok(created);
  assert.equal(await undoRawRow({ deps: f.deps, entity: packed!, before: null, afterHash: created.hash }), null);
  assert.equal(await f.handler.inspect(packed!.id), null);
  f.db.exec("INSERT INTO p_widgets VALUES ('a', 'old')");
  const before = (await f.rows.read({ table: "p_widgets", pk: { id: "a" } }))!;
  const current = (await f.handler.inspect(packed!.id))!;
  await f.handler.apply({ entity: packed!, principalId: "admin", expectedVersion: current.version, idempotencyKey: "update" });
  assert.equal(await undoRawRow({ deps: f.deps, entity: packed!, before, afterHash: packed!.contentHash }), null);
  assert.equal((f.db.prepare("SELECT title FROM p_widgets WHERE id='a'").get() as { title: string }).title, "old");
});

test("FK violations roll back the entire batch, and a child may arrive before its parent", async (t) => {
  const f = fixture(t);
  await assert.rejects(f.rows.transaction({ work: async () => {
    await f.rows.upsert({ table: "p_widgets", pk: { id: "a" }, values: { id: "a", title: "first" } });
    await f.rows.upsert({ table: "p_links", pk: { id: "l" }, values: { id: "l", widget_id: "missing" } });
  } }), /foreign key|Foreign key/i);
  assert.equal((f.db.prepare("SELECT COUNT(*) AS n FROM p_widgets").get() as { n: number }).n, 0);
  await f.rows.transaction({ work: async () => {
    await f.rows.upsert({ table: "p_links", pk: { id: "l" }, values: { id: "l", widget_id: "a" } });
    await f.rows.upsert({ table: "p_widgets", pk: { id: "a" }, values: { id: "a", title: "parent" } });
  } });
  assert.equal(f.db.prepare("PRAGMA foreign_key_check").all().length, 0);
});

test("undo skips a row edited after the push and apply refuses a stale version", async (t) => {
  const f = fixture(t);
  f.db.exec("INSERT INTO p_widgets VALUES ('a', 'source')");
  const [packed] = await f.collect();
  f.db.exec("UPDATE p_widgets SET title='edited live'");
  assert.match((await undoRawRow({ deps: f.deps, entity: packed!, before: null, afterHash: packed!.contentHash }))!, /changed on live/);
  await assert.rejects(f.handler.apply({ entity: packed!, principalId: "admin", expectedVersion: 1, idempotencyKey: "stale" }), /changed/);
  assert.equal((f.db.prepare("SELECT title FROM p_widgets").get() as { title: string }).title, "edited live");
});
