import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import Database from "better-sqlite3";
import { sql } from "kysely";

import { closeSqliteConnection, openSqliteFileKernel, sqliteKernel } from "../drivers/sqlite.js";
import { openPgliteKernel } from "../drivers/pglite.js";
import { StorageOpNotSupportedError, storageOps } from "../ops.js";

/**
 * @file The storage ops port (`ops.ts`) and the SQLite file helpers it leans on: a WAL-safe copy
 * from a read-only open, compact + seal + verify, and the not-yet-supported error on PGlite.
 */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-kernel-ops-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

function walSource(name: string): { file: string; writer: Database.Database } {
  const file = path.join(tmp, name);
  const writer = new Database(file);
  writer.pragma("journal_mode = WAL");
  writer.pragma("wal_autocheckpoint = 0"); // keep the committed rows in the -wal file
  writer.exec("CREATE TABLE t (id text); INSERT INTO t VALUES ('a'), ('b')");
  return { file, writer };
}

test("SQLite copyTo from a read-only open includes rows still in the WAL, and never writes the source", async () => {
  const { file, writer } = walSource("wal-source.db");
  const mainBytesBefore = fs.readFileSync(file);
  const source = openSqliteFileKernel<unknown>(file, { readOnly: true });
  try {
    await storageOps(source).copyTo(path.join(tmp, "wal-copy.db"));
    await assert.rejects(source.execute(sql`INSERT INTO t VALUES ('c')`), /readonly/);
  } finally {
    await source.close();
  }
  assert.deepEqual(fs.readFileSync(file), mainBytesBefore);
  writer.close();
  const copy = new Database(path.join(tmp, "wal-copy.db"), { readonly: true });
  assert.deepEqual(copy.prepare("SELECT id FROM t ORDER BY id").all(), [{ id: "a" }, { id: "b" }]);
  copy.close();
});

test("SQLite copyTo refuses an existing target with the driver's own error", async () => {
  const { file, writer } = walSource("exists-source.db");
  writer.close();
  const taken = new Database(path.join(tmp, "taken.db"));
  taken.exec("CREATE TABLE keep (id text)");
  taken.close();
  const source = openSqliteFileKernel<unknown>(file, { readOnly: true });
  try {
    await assert.rejects(storageOps(source).copyTo(path.join(tmp, "taken.db")), /output file already exists/);
  } finally {
    await source.close();
  }
});

test("SQLite compactAndVerify leaves a WAL-mode file with no sidecar content, and refuses inside a transaction", async () => {
  const file = path.join(tmp, "compact.db");
  const kernel = openSqliteFileKernel<unknown>(file);
  try {
    await kernel.execute(sql`CREATE TABLE t (id text)`);
    await kernel.execute(sql`INSERT INTO t VALUES ('a')`);
    await kernel.execute(sql`DELETE FROM t`);
    await storageOps(kernel).compactAndVerify();
    const [mode] = await kernel.query<{ journal_mode: string }>(sql`PRAGMA journal_mode`);
    assert.equal(mode.journal_mode, "wal");
    assert.equal(fs.existsSync(`${file}-wal`) ? fs.statSync(`${file}-wal`).size : 0, 0);
    await assert.rejects(
      kernel.transaction(async () => storageOps(kernel).compactAndVerify()),
      /must be called outside a transaction/
    );
  } finally {
    await kernel.close();
  }
});

test("storageOps works on the kernel of a Drizzle-style handle, and closeSqliteConnection closes it", async () => {
  const client = new Database(path.join(tmp, "handle.db"));
  const handle = { $client: client };
  await storageOps(sqliteKernel<unknown>(handle)).copyTo(path.join(tmp, "handle-copy.db"));
  assert.ok(fs.existsSync(path.join(tmp, "handle-copy.db")));
  closeSqliteConnection(handle);
  assert.equal(client.open, false);
});

test("openSqliteFileKernel readOnly requires the file to exist", () => {
  assert.throws(() => openSqliteFileKernel<unknown>(path.join(tmp, "missing.db"), { readOnly: true }), /unable to open/i);
});

test("PGlite ops are not supported yet (R1)", async () => {
  const kernel = openPgliteKernel<unknown>();
  try {
    const ops = storageOps(kernel);
    await assert.rejects(ops.copyTo(path.join(tmp, "never")), (err: unknown) => {
      assert.ok(err instanceof StorageOpNotSupportedError);
      assert.equal(err.message, "storage op copyTo is not supported yet on the pglite driver (storage plan R1)");
      return true;
    });
    await assert.rejects(ops.compactAndVerify(), StorageOpNotSupportedError);
  } finally {
    await kernel.close();
  }
});
