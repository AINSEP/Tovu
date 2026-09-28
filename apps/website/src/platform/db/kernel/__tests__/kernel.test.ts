import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";

import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { excluded, jsonSet, jsonText, listColumns, listTables, nowIso, tableExists, toBytes } from "../dialect.js";
import { openPgliteKernel } from "../drivers/pglite.js";
import { sqliteKernel } from "../drivers/sqlite.js";
import type { StorageKernel } from "../port.js";
import { TurnLock } from "../turn-lock.js";

/**
 * @file The storage kernel's rules, proven on EVERY driver by the same assertions: transactions
 * commit/roll back, nested calls join, `transaction()` inside `run()` is refused, and — the reason
 * the turn lock exists — an unrelated caller's write never lands inside someone else's open
 * transaction on a shared connection. Plus the dialect helpers returning the same values on both.
 */

const probe = sql.identifier("kernel_probe");

interface Case {
  name: string;
  kernel: StorageKernel<unknown>;
  /** DDL for the probe table: `doc` is a JSON column in the dialect's own type. */
  create: ReturnType<typeof sql>;
}

const cases: Case[] = [
  {
    name: "sqlite",
    kernel: sqliteKernel(drizzle(new Database(":memory:"))) as StorageKernel<unknown>,
    create: sql`CREATE TABLE ${probe} (id text PRIMARY KEY NOT NULL, doc text, n integer)`,
  },
  {
    name: "pglite",
    kernel: openPgliteKernel({ schema: {} }) as StorageKernel<unknown>,
    create: sql`CREATE TABLE ${probe} (id text PRIMARY KEY NOT NULL, doc jsonb, n integer)`,
  },
];

after(async () => {
  for (const each of cases) await each.kernel.close();
});

async function ids(kernel: StorageKernel<unknown>): Promise<string[]> {
  const rows = await kernel.query<{ id: string }>(sql`SELECT id FROM ${probe} ORDER BY id`);
  return rows.map((row) => row.id);
}

const insert = (kernel: StorageKernel<unknown>, id: string) =>
  kernel.execute(sql`INSERT INTO ${probe} (id) VALUES (${id})`);

/** A promise plus the function that resolves it. */
function gate(): { opened: Promise<void>; open: () => void } {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

for (const { name, kernel, create } of cases) {
  describe(`storage kernel [${name}]`, () => {
    beforeEach(async () => {
      await kernel.execute(sql`DROP TABLE IF EXISTS ${probe}`);
      await kernel.execute(create);
    });

    test("a transaction commits on resolve and rolls back on throw", async () => {
      await kernel.transaction(async () => insert(kernel, "kept"));
      await assert.rejects(
        kernel.transaction(async () => {
          await insert(kernel, "dropped");
          throw new Error("boom");
        }),
        /boom/
      );
      assert.deepEqual(await ids(kernel), ["kept"]);
    });

    test("a nested transaction joins the outer one: an outer throw rolls back the inner write", async () => {
      await assert.rejects(
        kernel.transaction(async () => {
          await kernel.transaction(async () => insert(kernel, "inner"));
          assert.equal(kernel.inTransaction(), true);
          throw new Error("outer fails");
        }),
        /outer fails/
      );
      assert.deepEqual(await ids(kernel), []);
    });

    test("transaction() inside a run() body is refused, not deadlocked", async () => {
      await assert.rejects(
        kernel.run(() => kernel.transaction(async () => {})),
        { message: "transaction() was called inside a run() body; start the transaction first and call run() inside it" }
      );
    });

    test("an unrelated caller's write waits for an open transaction instead of landing inside it", async () => {
      const inside = gate();
      const release = gate();
      const tx = kernel.transaction(async () => {
        await insert(kernel, "in-tx");
        inside.open();
        await release.opened;
        throw new Error("roll back");
      });
      await inside.opened;
      // Another request, outside the transaction's async context, writes meanwhile.
      const outside = insert(kernel, "outside");
      release.open();
      await assert.rejects(tx, /roll back/);
      await outside;
      assert.deepEqual(await ids(kernel), ["outside"]);
    });

    test("jsonText / jsonSet read and write the same values on both dialects", async () => {
      await kernel.execute(sql`INSERT INTO ${probe} (id, doc) VALUES ('a', ${JSON.stringify({ title: "Hi", meta: { lang: "en" } })})`);
      await kernel.execute(sql`INSERT INTO ${probe} (id, doc) VALUES ('b', NULL)`);
      const doc = sql.identifier("doc");
      await kernel.execute(sql`UPDATE ${probe} SET doc = ${jsonSet(kernel.dialect, doc, ["meta", "lang"], "fr")} WHERE id = 'a'`);
      await kernel.execute(sql`UPDATE ${probe} SET doc = ${jsonSet(kernel.dialect, doc, ["title"], "New")} WHERE id = 'b'`);
      const rows = await kernel.query<{ id: string; title: string | null; lang: string | null }>(
        sql`SELECT id, ${jsonText(kernel.dialect, doc, ["title"])} AS title,
                   ${jsonText(kernel.dialect, doc, ["meta", "lang"])} AS lang
            FROM ${probe} ORDER BY id`
      );
      assert.deepEqual(
        rows.map((row) => ({ ...row })),
        [
          { id: "a", title: "Hi", lang: "fr" },
          { id: "b", title: "New", lang: null },
        ]
      );
      assert.throws(() => jsonText(kernel.dialect, doc, ["a'b"]), { message: "JSON path key 'a'b' is not a plain identifier" });
    });

    test("nowIso is Date#toISOString text", async () => {
      const [row] = await kernel.query<{ now: string }>(sql`SELECT ${nowIso(kernel.dialect)} AS now`);
      assert.match(row!.now, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
      assert.ok(Math.abs(Date.parse(row!.now) - Date.now()) < 60_000);
    });

    test("an upsert through excluded() keeps the inserted value", async () => {
      const n = { name: "n" };
      const upsert = (value: number) =>
        kernel.execute(
          sql`INSERT INTO ${probe} (id, n) VALUES ('x', ${value}) ON CONFLICT (id) DO UPDATE SET n = ${excluded(n)}`
        );
      await upsert(1);
      await upsert(2);
      const rows = await kernel.query<{ n: number }>(sql`SELECT n FROM ${probe}`);
      assert.deepEqual(rows.map((row) => Number(row.n)), [2]);
    });

    test("introspection lists tables and columns", async () => {
      assert.ok((await listTables(kernel)).includes("kernel_probe"));
      assert.equal(await tableExists(kernel, "kernel_probe"), true);
      assert.equal(await tableExists(kernel, "no_such_table"), false);
      const columns = await listColumns(kernel, "kernel_probe");
      assert.deepEqual(
        columns.map(({ name, notNull, primaryKey }) => ({ name, notNull, primaryKey })),
        [
          { name: "id", notNull: true, primaryKey: true },
          { name: "doc", notNull: false, primaryKey: false },
          { name: "n", notNull: false, primaryKey: false },
        ]
      );
    });
  });
}

test("sqlite: one kernel per connection, and a legacy BEGIN IMMEDIATE is joined, not nested", async () => {
  const db = drizzle(new Database(":memory:"));
  const kernel = sqliteKernel(db);
  assert.equal(sqliteKernel(db), kernel);
  await kernel.execute(sql`CREATE TABLE t (id text)`);
  db.$client.exec("BEGIN IMMEDIATE");
  await kernel.transaction(async () => kernel.execute(sql`INSERT INTO t VALUES ('a')`));
  db.$client.exec("ROLLBACK");
  assert.deepEqual(await kernel.query(sql`SELECT id FROM t`), []);
});

test("toBytes accepts Buffer and Uint8Array, refuses anything else", () => {
  assert.deepEqual([...toBytes(Buffer.from([1, 2]))], [1, 2]);
  assert.deepEqual([...toBytes(new Uint8Array([3]))], [3]);
  assert.throws(() => toBytes("AQI="), { message: "expected a binary column value, got string" });
});

test("TurnLock: a queued transaction goes before later readers (FIFO, no starvation)", async () => {
  const lock = new TurnLock();
  const order: string[] = [];
  await lock.acquire("shared");
  const writer = lock.acquire("exclusive").then(() => order.push("writer"));
  const reader = lock.acquire("shared").then(() => order.push("reader"));
  lock.release("shared");
  await writer;
  assert.deepEqual(order, ["writer"]);
  lock.release("exclusive");
  await reader;
  assert.deepEqual(order, ["writer", "reader"]);
});
