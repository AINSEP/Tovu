import assert from "node:assert/strict";
import { test } from "node:test";

import Database from "better-sqlite3";
import { sql } from "kysely";

import { openPgliteKernel } from "../drivers/pglite.js";
import { sqliteKernel } from "../drivers/sqlite.js";
import { sqliteForeignKeyCheckedTransaction, sqliteTableInfo } from "../sqlite-only.js";

/**
 * @file The SQLite-only kernel primitives publish's "send by hand" ships across peers: the exact
 * `PRAGMA table_info` shape (type case kept, pk ordinal kept — both peers compare and hash it) and
 * the deferred foreign-key check that rolls the whole send back. Real better-sqlite3, no fakes.
 */

function kernelWith(ddl: string) {
  const client = new Database(":memory:");
  client.exec(ddl);
  return { client, kernel: sqliteKernel<unknown>(client) };
}

test("sqliteTableInfo: declaration order, declared type case and the pk ORDINAL, exactly as table_info reports them", async () => {
  const { kernel } = kernelWith(`CREATE TABLE pairs (b TEXT NOT NULL, a INTEGER, note TEXT, PRIMARY KEY (a, b))`);
  assert.deepEqual(await sqliteTableInfo({ kernel, table: "pairs" }), [
    { name: "b", type: "TEXT", pk: 2, notnull: 1 },
    { name: "a", type: "INTEGER", pk: 1, notnull: 0 },
    { name: "note", type: "TEXT", pk: 0, notnull: 0 },
  ]);
});

test("sqliteTableInfo: null for a missing table and for a VIEW (only ordinary tables are rows to send)", async () => {
  const { kernel } = kernelWith(`CREATE TABLE t (id TEXT PRIMARY KEY); CREATE VIEW v AS SELECT id FROM t`);
  assert.equal(await sqliteTableInfo({ kernel, table: "missing" }), null);
  assert.equal(await sqliteTableInfo({ kernel, table: "v" }), null);
});

test("sqliteTableInfo: the table name is bound, so a hostile name is just a missing table", async () => {
  const { kernel } = kernelWith(`CREATE TABLE t (id TEXT PRIMARY KEY)`);
  assert.equal(await sqliteTableInfo({ kernel, table: `t"); DROP TABLE t; --` }), null);
  assert.notEqual(await sqliteTableInfo({ kernel, table: "t" }), null);
});

test("sqliteForeignKeyCheckedTransaction: a dangling reference throws onViolation's error and rolls back ALL of work", async () => {
  const { client, kernel } = kernelWith(
    `PRAGMA foreign_keys=ON; CREATE TABLE parent (id TEXT PRIMARY KEY); CREATE TABLE child (id TEXT PRIMARY KEY, parent_id TEXT REFERENCES parent(id))`,
  );
  await assert.rejects(
    sqliteForeignKeyCheckedTransaction({
      kernel,
      work: async () => {
        await kernel.execute(sql`INSERT INTO parent VALUES ('kept-only-if-committed')`);
        await kernel.execute(sql`INSERT INTO child VALUES ('c1', 'missing')`);
      },
      onViolation: (first) => new Error(`violation ${first.table} -> ${first.parent}`),
    }),
    { message: "violation child -> parent" },
  );
  assert.deepEqual(client.prepare("SELECT count(*) AS n FROM parent").get(), { n: 0 });
  assert.deepEqual(client.prepare("SELECT count(*) AS n FROM child").get(), { n: 0 });
});

test("sqliteForeignKeyCheckedTransaction: deferral lets work insert a child before its parent, and commits", async () => {
  const { client, kernel } = kernelWith(
    `PRAGMA foreign_keys=ON; CREATE TABLE parent (id TEXT PRIMARY KEY); CREATE TABLE child (id TEXT PRIMARY KEY, parent_id TEXT REFERENCES parent(id))`,
  );
  const result = await sqliteForeignKeyCheckedTransaction({
    kernel,
    work: async () => {
      await kernel.execute(sql`INSERT INTO child VALUES ('c1', 'p1')`);
      await kernel.execute(sql`INSERT INTO parent VALUES ('p1')`);
      return "done";
    },
    onViolation: () => new Error("unexpected"),
  });
  assert.equal(result, "done");
  assert.deepEqual(client.prepare("SELECT parent_id FROM child").all(), [{ parent_id: "p1" }]);
});

test("both primitives refuse a non-SQLite kernel before touching it", async () => {
  const kernel = openPgliteKernel<unknown>();
  try {
    await assert.rejects(sqliteTableInfo({ kernel, table: "t" }), { message: "sqliteTableInfo is SQLite-only; this kernel is postgres" });
    await assert.rejects(
      sqliteForeignKeyCheckedTransaction({ kernel, work: async () => "never", onViolation: () => new Error("never") }),
      { message: "sqliteForeignKeyCheckedTransaction is SQLite-only; this kernel is postgres" },
    );
  } finally {
    await kernel.close();
  }
});
