import assert from "node:assert/strict";
import test from "node:test";
import type Database from "better-sqlite3";

import { contentKernel } from "#src/platform/db/content-kernel";
import { openContentDb } from "#src/platform/db/sqlite/content-db";

import { createContentDbTransactionRunner } from "../repo.sqlite.js";

/**
 * @file The Trash transaction runner is the content db's storage-kernel transaction: nested calls
 * join the caller's own transaction, and a CONCURRENT caller (another async context) waits for its
 * own transaction instead of silently joining someone else's.
 */

function fixture() {
  const db = openContentDb(":memory:");
  const client = (db as unknown as { $client: Database.Database }).$client;
  client.exec("CREATE TABLE probe (v TEXT NOT NULL)");
  const values = () => (client.prepare("SELECT v FROM probe ORDER BY v").all() as { v: string }[]).map((row) => row.v);
  const insert = (v: string) => client.prepare("INSERT INTO probe (v) VALUES (?)").run(v);
  return { db, client, values, insert };
}

test("a concurrent caller gets its own transaction: another caller's rollback does not undo its write", async () => {
  const { client, values, insert } = fixture();
  const runInTransaction = createContentDbTransactionRunner(client);
  let releaseA!: () => void;
  const aHolds = new Promise<void>((resolve) => (releaseA = resolve));

  const a = runInTransaction(async () => {
    insert("a");
    await aHolds;
    throw new Error("a fails");
  });
  const b = runInTransaction(async () => {
    insert("b");
  });
  await new Promise((resolve) => setImmediate(resolve));
  releaseA();

  await assert.rejects(a, /a fails/);
  await b;
  assert.deepEqual(values(), ["b"]);
});

test("a nested call joins the caller's kernel transaction and rolls back with it", async () => {
  const { db, client, values, insert } = fixture();
  const runInTransaction = createContentDbTransactionRunner(client);

  await assert.rejects(
    contentKernel(db).transaction(async () => {
      await runInTransaction(async () => insert("inner"));
      throw new Error("outer fails");
    }),
    /outer fails/
  );
  assert.deepEqual(values(), []);
});
