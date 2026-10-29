import { sqliteTableInfo } from "#src/platform/db/kernel/sqlite-only";
import { sqliteForeignKeyCheckedTransaction } from "#src/platform/db/kernel/sqlite-only";
import assert from "node:assert/strict";
import test from "node:test";

import { sql } from "kysely";

import { openMemorySqliteKernel } from "../../kernel/drivers/sqlite.js";
import type { ContentDatabase } from "../../content-database.generated.js";
import type { ContentKernel } from "../../content-kernel.js";
import { createRawRowSqlitePort } from "../../../../features/publish-content/publish-backstop-row.sqlite.js";
import type { RawValue } from "#src/features/publish-content/backstop-ports";

/**
 * @file The "send by hand" raw-row port on a real in-memory SQLite content kernel: the policy and
 * primary-key refusals, BLOB round trips, and the key-only upsert shape.
 */

async function withPort(work: (input: { kernel: ContentKernel; port: ReturnType<typeof createRawRowSqlitePort> }) => Promise<void>): Promise<void> {
  const kernel = openMemorySqliteKernel<ContentDatabase>();
  try {
    await kernel.execute(sql`CREATE TABLE p_widgets (id TEXT PRIMARY KEY, label TEXT, icon BLOB)`);
    await kernel.execute(sql`CREATE TABLE p_tags (post_id TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (post_id, tag))`);
    await kernel.execute(sql`CREATE TABLE p_unsafe (id TEXT PRIMARY KEY, api_key TEXT)`);
    await kernel.execute(sql`CREATE TABLE p_counters (id TEXT PRIMARY KEY, n INTEGER)`);
    await work({ kernel, port: createRawRowSqlitePort({ checkedTransaction: sqliteForeignKeyCheckedTransaction, tableInfo: sqliteTableInfo, kernel }) });
  } finally { await kernel.close(); }
}

test("the port refuses a non-SQLite content database", async () => {
  const kernel = openMemorySqliteKernel<ContentDatabase>();
  try {
    const postgresLike = new Proxy(kernel, { get: (target, property, receiver) => property === "dialect" ? "postgres" : Reflect.get(target, property, receiver) });
    assert.throws(() => createRawRowSqlitePort({ checkedTransaction: sqliteForeignKeyCheckedTransaction, tableInfo: sqliteTableInfo, kernel: postgresLike }), { message: "Send by hand currently requires a SQLite content database." });
  } finally { await kernel.close(); }
});

test("columns() reports a missing table as null and refuses private tables and secret-shaped columns", async () => {
  await withPort(async ({ port }) => {
    assert.equal(await port.columns({ table: "p_missing" }), null);
    await assert.rejects(port.columns({ table: "members" }), /holds private or per-install data/);
    await assert.rejects(port.columns({ table: "p_unsafe" }), { message: "Column 'api_key' may hold a key or password; this row is never sent." });
    assert.deepEqual((await port.columns({ table: "p_widgets" }))?.map((column) => column.name), ["icon", "id", "label"]);
  });
});

test("read and removal require an existing table and its complete, scalar primary key", async () => {
  await withPort(async ({ port }) => {
    await assert.rejects(port.read({ table: "p_missing", pk: { id: "a" } }), { message: "Table 'p_missing' does not exist." });
    const partialKeys: Array<Readonly<Record<string, RawValue>>> = [{}, { label: "a" }, { post_id: "p" }, { id: null }, { id: { blobBase64: "AA==" } }];
    for (const pk of partialKeys) {
      const table = "post_id" in pk ? "p_tags" : "p_widgets";
      await assert.rejects(port.read({ table, pk }), { message: "Choose a row by its complete primary key." }, JSON.stringify(pk));
    }
    await assert.rejects(port.removeCreated({ table: "p_tags", pk: { post_id: "p" } }), { message: "Choose a row by its complete primary key." });
    assert.equal(await port.read({ table: "p_widgets", pk: { id: "absent" } }), null);
  });
});

test("upsert refuses a row missing a column or disagreeing with its primary key, writing nothing", async () => {
  await withPort(async ({ kernel, port }) => {
    await assert.rejects(port.upsert({ table: "p_widgets", pk: { id: "a" }, values: { id: "a", label: "x" } }),
      { message: "The raw row does not contain every column or its primary key." });
    await assert.rejects(port.upsert({ table: "p_widgets", pk: { id: "a" }, values: { id: "b", label: "x", icon: null } }),
      { message: "The raw row does not contain every column or its primary key." });
    await assert.rejects(port.upsert({ table: "p_unsafe", pk: { id: "a" }, values: { id: "a", api_key: "x" } }), /may hold a key or password/);
    assert.deepEqual(await kernel.query(sql`SELECT * FROM p_widgets`), []);
  });
});

test("BLOB values travel as base64 both ways, and a second upsert replaces the non-key columns", async () => {
  await withPort(async ({ kernel, port }) => {
    const icon = Buffer.from([0, 1, 2, 250]).toString("base64");
    await port.upsert({ table: "p_widgets", pk: { id: "a" }, values: { id: "a", label: "first", icon: { blobBase64: icon } } });
    await port.upsert({ table: "p_widgets", pk: { id: "a" }, values: { id: "a", label: "second", icon: { blobBase64: icon } } });
    const read = await port.read({ table: "p_widgets", pk: { id: "a" } });
    assert.deepEqual(read?.values, { id: "a", label: "second", icon: { blobBase64: icon } });
    const [stored] = await kernel.query<{ icon: Uint8Array }>(sql`SELECT icon FROM p_widgets`);
    assert.deepEqual([...stored!.icon], [0, 1, 2, 250]);
  });
});

test("a key-only table upserts idempotently and removeCreated deletes exactly that row", async () => {
  await withPort(async ({ kernel, port }) => {
    const row = { table: "p_tags", pk: { post_id: "p1", tag: "news" }, values: { post_id: "p1", tag: "news" } };
    await port.upsert(row);
    await port.upsert(row);
    await port.upsert({ ...row, pk: { post_id: "p1", tag: "kept" }, values: { post_id: "p1", tag: "kept" } });
    await port.removeCreated({ table: "p_tags", pk: { post_id: "p1", tag: "news" } });
    assert.deepEqual(await kernel.query(sql`SELECT * FROM p_tags`), [{ post_id: "p1", tag: "kept" }]);
  });
});

test("read refuses a stored integer that JSON would round", async () => {
  await withPort(async ({ kernel, port }) => {
    await kernel.execute(sql`INSERT INTO p_counters VALUES ('big', 9007199254740993), ('ok', 7)`);
    assert.deepEqual((await port.read({ table: "p_counters", pk: { id: "ok" } }))?.values, { id: "ok", n: 7 });
    await assert.rejects(port.read({ table: "p_counters", pk: { id: "big" } }), { message: "This row contains a database value that cannot be sent safely." });
  });
});

test("transaction() checks foreign keys once at the outermost send and joins an enclosing transaction", async () => {
  await withPort(async ({ kernel, port }) => {
    await kernel.execute(sql`CREATE TABLE p_parents (id TEXT PRIMARY KEY)`);
    await kernel.execute(sql`CREATE TABLE p_children (id TEXT PRIMARY KEY, parent_id TEXT REFERENCES p_parents(id))`);
    const orphan = { table: "p_children", pk: { id: "c1" }, values: { id: "c1", parent_id: "missing" } };
    await assert.rejects(port.transaction({ work: () => port.upsert(orphan) }), /^Error: Foreign key check failed: 'p_children' row '\d+' points at a missing 'p_parents' row; this send was rolled back\.$/);
    assert.deepEqual(await kernel.query(sql`SELECT * FROM p_children`), []);

    const joined = await kernel.transaction(async () => {
      await port.upsert({ table: "p_parents", pk: { id: "p1" }, values: { id: "p1" } });
      return port.transaction({ work: async () => { await port.upsert({ ...orphan, values: { id: "c1", parent_id: "p1" } }); return "joined"; } });
    });
    assert.equal(joined, "joined");
    assert.deepEqual(await kernel.query(sql`SELECT * FROM p_children`), [{ id: "c1", parent_id: "p1" }]);
  });
});
