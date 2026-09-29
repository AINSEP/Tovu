import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import Database from "better-sqlite3";
import { sql } from "kysely";

import { closeSqliteConnection, openSqliteFileKernel, sqliteKernel } from "../drivers/sqlite.js";
import { openPgliteKernel } from "../drivers/pglite.js";
import { OWNER_LOCK_FILE, startPgliteOwner } from "../drivers/pglite-owner.js";
import { openPgliteSocketKernel } from "../drivers/pglite-socket.js";
import { StorageOpError, StorageOpNotSupportedError, storageOps } from "../ops.js";
import type { StorageKernel } from "../port.js";

/**
 * @file The storage ops port (`ops.ts`) and the SQLite file helpers it leans on: a WAL-safe copy
 * from a read-only open, compact + seal + verify; PGlite in process and through its owner (a
 * data-dir dump restored into a new dir). Real Postgres: `ops.postgres.test.ts`.
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

async function seedPg(kernel: StorageKernel<unknown>, rows: number): Promise<void> {
  await kernel.execute(sql`CREATE TABLE tovu_migrations (id text PRIMARY KEY)`);
  await kernel.execute(sql`INSERT INTO tovu_migrations VALUES ('0000_test')`);
  await kernel.execute(sql`CREATE TABLE t (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, v text)`);
  await kernel.execute(sql`INSERT INTO t (v) SELECT 'row ' || g FROM generate_series(1, ${rows}) g`);
}

async function countT(dataDir: string): Promise<number> {
  const copy = openPgliteKernel<unknown>({ dataDir });
  try {
    const [row] = await copy.query<{ n: number }>(sql`SELECT count(*)::int AS n FROM t`);
    return row.n;
  } finally {
    await copy.close();
  }
}

test("PGlite in process: copyTo restores the whole data dir into a new one; compactAndVerify reads the ledger back", async () => {
  const kernel = openPgliteKernel<unknown>({ dataDir: path.join(tmp, "pglite-src") });
  const target = path.join(tmp, "pglite-copy");
  try {
    await seedPg(kernel, 250);
    await storageOps(kernel).copyTo(target);
    await assert.rejects(storageOps(kernel).copyTo(target), /already exists/);
    await storageOps(kernel).compactAndVerify();
    await assert.rejects(
      kernel.transaction(async () => storageOps(kernel).compactAndVerify()),
      /must be called outside a transaction/
    );
  } finally {
    await kernel.close();
  }
  assert.equal(await countT(target), 250);
  assert.equal(fs.existsSync(path.join(target, OWNER_LOCK_FILE)), false);
});

test("PGlite compactAndVerify refuses an empty migration ledger", async () => {
  const kernel = openPgliteKernel<unknown>();
  try {
    await kernel.execute(sql`CREATE TABLE tovu_migrations (id text PRIMARY KEY)`);
    await assert.rejects(storageOps(kernel).compactAndVerify(), (err: unknown) => {
      assert.ok(err instanceof StorageOpError);
      assert.equal(err.message, "the migration ledger tovu_migrations is empty after compacting");
      return true;
    });
  } finally {
    await kernel.close();
  }
});

test("PGlite socket client: copyTo goes through the owner's exclusive window, and is refused without it", async () => {
  const dataDir = path.join(tmp, "owned");
  const owner = await startPgliteOwner({ dataDir }, { socketDir: fs.mkdtempSync(path.join(os.tmpdir(), "tovu-ops-")) });
  const client = openPgliteSocketKernel<unknown>({ socketPath: owner.socketPath });
  const target = path.join(tmp, "owned-copy");
  try {
    await seedPg(client, 30);
    await assert.rejects(storageOps(client).copyTo(path.join(tmp, "never")), (err: unknown) => {
      assert.ok(err instanceof StorageOpNotSupportedError);
      assert.match(err.message, /a Postgres site is backed up by its provider; use the move\/transfer tools to copy it$/);
      return true;
    });
    const ops = storageOps(client, { pgliteOwner: owner });
    await ops.copyTo(target);
    await ops.compactAndVerify();
    // The owner still serves after its exclusive window.
    const [row] = await client.query<{ n: number }>(sql`SELECT count(*)::int AS n FROM t`);
    assert.equal(row.n, 30);
  } finally {
    await client.close();
    await owner.close();
  }
  assert.equal(fs.existsSync(path.join(dataDir, OWNER_LOCK_FILE)), false);
  assert.equal(await countT(target), 30);
  assert.equal(fs.existsSync(path.join(target, OWNER_LOCK_FILE)), false);
});
