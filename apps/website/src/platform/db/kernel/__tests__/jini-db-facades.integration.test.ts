import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";
import Database from "better-sqlite3";
import { sql } from "kysely";
import * as jini from "@jini-ai/db/kernel";
import { sqliteKernel as jiniSqliteKernel } from "@jini-ai/db/kernel/sqlite";
import { jsonText } from "../dialect.js";
import { UnsupportedCapabilityError } from "../port.js";
import { openMemorySqliteKernel, sqliteKernel, sqliteClientOf, sqliteConnectionOf } from "../drivers/sqlite.js";
import { openPgliteKernel } from "../drivers/pglite.js";
import { defaultPgliteSocketDir, ensurePrivateDir, acquireOwnerLock, OWNER_LOCK_FILE, PGLITE_LOW_MEMORY_START_PARAMS, PgliteOwnerLockedError } from "../drivers/pglite-owner.js";
import { storageOps, StorageOpNotSupportedError } from "../ops.js";
import { hasLedger, runMigrations } from "../../migrations/runner.js";
import { MigrationChecksumError, UnknownAppliedMigrationError, type MigrationStep } from "../../migrations/step.js";

test("kernel shims expose the same shared implementations and error constructors", () => {
  assert.equal(jsonText, jini.jsonText);
  assert.equal(UnsupportedCapabilityError, jini.UnsupportedCapabilityError);
});

test("same-file locking crosses from a Tovu shim into a direct Jini kernel", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "j02-locks-"));
  const file = path.join(dir, "probe.db");
  const a = new Database(file);
  const b = new Database(file);
  try {
    a.pragma("journal_mode = WAL");
    a.exec("CREATE TABLE probe (value TEXT NOT NULL)");
    const ka = sqliteKernel(a);
    const kb = jiniSqliteKernel(b);
    await ka.transaction(async () => {
      await ka.execute(sql`INSERT INTO probe VALUES ('nested probe')`);
      await assert.rejects(kb.transaction(async () => {}), /another connection to the same database file/);
      await assert.rejects(kb.run(() => undefined), /another connection to the same database file/);
    });
    await Promise.all([
      ka.transaction(() => ka.execute(sql`INSERT INTO probe VALUES ('a')`)),
      kb.transaction(() => kb.execute(sql`INSERT INTO probe VALUES ('b')`)),
    ]);
    assert.deepEqual(await kb.query(sql`SELECT value FROM probe ORDER BY value`), [{ value: "a" }, { value: "b" }, { value: "nested probe" }]);
    // Native types must remain available to old Tovu consumers without a cast.
    const native: Database.Database = sqliteClientOf({ $client: a });
    const reverse: Database.Database | undefined = sqliteConnectionOf(ka);
    assert.equal(native, a);
    assert.equal(reverse, a);
  } finally {
    a.close();
    b.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("runner defaults preserve separate content and chat ledgers, no-op reruns and Tovu errors", async () => {
  const kernel = openMemorySqliteKernel<unknown>();
  const makeStep = (id: string, table: string): MigrationStep => ({
    id, checksum: createHash("sha256").update(id).digest("hex"),
    up: (db) => db.execute(sql`CREATE TABLE ${sql.table(table)} (id INTEGER PRIMARY KEY)`),
  });
  const content = makeStep("0000_content_probe", "content_probe");
  const chat = makeStep("0000_chat_probe", "chat_probe");
  try {
    assert.equal(await hasLedger(kernel), false);
    assert.deepEqual(await runMigrations(kernel, [content]), { applied: [content.id], alreadyApplied: [], notes: [] });
    assert.equal(await hasLedger(kernel), true);
    assert.deepEqual(await runMigrations(kernel, [chat], { ledgerTable: "tovu_chat_migrations" }), { applied: [chat.id], alreadyApplied: [], notes: [] });
    assert.deepEqual(await runMigrations(kernel, [content]), { applied: [], alreadyApplied: [content.id], notes: [] });
    assert.deepEqual(await runMigrations(kernel, [chat], { ledgerTable: "tovu_chat_migrations" }), { applied: [], alreadyApplied: [chat.id], notes: [] });
    assert.deepEqual(await kernel.query(sql`SELECT id, checksum FROM tovu_migrations`), [{ id: content.id, checksum: content.checksum }]);
    assert.deepEqual(await kernel.query(sql`SELECT id, checksum FROM tovu_chat_migrations`), [{ id: chat.id, checksum: chat.checksum }]);
    await assert.rejects(runMigrations(kernel, [{ ...content, checksum: "f".repeat(64) }]), MigrationChecksumError);
    const expected = "the database has migrations this runtime does not know (0000_content_probe); it was upgraded by a newer Tovu — run that version";
    assert.equal(new UnknownAppliedMigrationError([content.id]).message, expected);
    await assert.rejects(runMigrations(kernel, []), (error: unknown) => {
      assert.ok(error instanceof UnknownAppliedMigrationError);
      assert.equal(error.message, expected);
      assert.deepEqual(error.ids, [content.id]);
      return true;
    });
  } finally {
    await kernel.close();
  }
});

test("PGlite compaction reads the Tovu ledger and copies drop the Tovu owner lock", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "j02-ops-"));
  const dataDir = path.join(dir, "source");
  const kernel = openPgliteKernel<unknown>({ dataDir });
  try {
    await kernel.execute(sql`CREATE TABLE tovu_migrations (id TEXT PRIMARY KEY)`);
    await assert.rejects(storageOps(kernel).compactAndVerify(), { message: "the migration ledger tovu_migrations is empty after compacting" });
    await kernel.execute(sql`INSERT INTO tovu_migrations VALUES ('0000_probe')`);
    await storageOps(kernel).compactAndVerify();
    fs.writeFileSync(path.join(dataDir, OWNER_LOCK_FILE), String(process.pid));
    const target = path.join(dir, "copy");
    await storageOps(kernel).copyTo(target);
    assert.equal(fs.existsSync(path.join(target, OWNER_LOCK_FILE)), false);
    const copy = openPgliteKernel<unknown>({ dataDir: target });
    try {
      assert.deepEqual(await copy.query(sql`SELECT id FROM tovu_migrations`), [{ id: "0000_probe" }]);
    } finally {
      await copy.close();
    }
  } finally {
    await kernel.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("unsupported Postgres copies retain Tovu operator guidance without a server connection", async () => {
  const base = openMemorySqliteKernel<unknown>();
  try {
    for (const [transport, reason] of [
      ["node-postgres", "a Postgres site is backed up by its provider; use the move/transfer tools to copy it"],
      ["pglite-socket", "a PGlite socket client copies through its owner's exclusive window (pass pgliteOwner)"],
    ] as const) {
      const kernel = { ...base, dialect: "postgres" as const, transport };
      await assert.rejects(storageOps(kernel).copyTo("/never"), (error: unknown) => {
        assert.ok(error instanceof StorageOpNotSupportedError);
        assert.equal(error.message, `storage op copyTo is not supported on the ${transport} driver: ${reason}`);
        return true;
      });
      await assert.rejects(kernel.transaction(async () => storageOps(kernel).copyTo("/never")), /must be called outside a transaction/);
    }
  } finally {
    await base.close();
  }
});

test("owner shims preserve Tovu socket names, low-memory settings and private directory checks", () => {
  const dataDir = path.join(os.tmpdir(), "j02-never-opened");
  const key = createHash("sha256").update(path.resolve(dataDir)).digest("hex").slice(0, 8);
  assert.equal(defaultPgliteSocketDir(dataDir, "/short"), path.join("/short", ".tovu", "run", key));
  assert.equal(defaultPgliteSocketDir(dataDir, "/" + "deep/".repeat(50)), path.join("/tmp", `tovu-${process.getuid?.() ?? "user"}`, key));
  assert.deepEqual(PGLITE_LOW_MEMORY_START_PARAMS, [
    ...PGlite.defaultStartParams,
    "-c", "shared_buffers=16MB",
    "-c", "work_mem=1MB",
    "-c", "maintenance_work_mem=8MB",
    "-c", "wal_buffers=256kB",
    "-c", "max_connections=1",
  ]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "j02-owner-"));
  try {
    const release = acquireOwnerLock(dir);
    try {
      assert.equal(fs.readFileSync(path.join(dir, OWNER_LOCK_FILE), "utf8").trim(), String(process.pid));
      assert.throws(() => acquireOwnerLock(dir), PgliteOwnerLockedError);
    } finally {
      release();
    }
    assert.equal(fs.existsSync(path.join(dir, OWNER_LOCK_FILE)), false);
    // Disposable stand-in for the /tmp/tovu-<uid>/<key> fallback; force the same parent check.
    const parent = path.join(dir, "private-parent");
    fs.mkdirSync(parent, { mode: 0o755 });
    fs.chmodSync(parent, 0o755);
    assert.throws(() => ensurePrivateDir(path.join(parent, "socket"), { privateParent: true }), /not a 0700 directory owned by this user/);
    fs.chmodSync(parent, 0o700);
    ensurePrivateDir(path.join(parent, "socket"), { privateParent: true });
    assert.equal(fs.statSync(path.join(parent, "socket")).mode & 0o777, 0o700);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  // Use lexical /tmp, as the real fallback does, without touching /tmp/tovu-<uid>.
  const fallbackParent = fs.mkdtempSync("/tmp/j02-private-");
  try {
    fs.chmodSync(fallbackParent, 0o755);
    assert.throws(() => ensurePrivateDir(path.join(fallbackParent, "socket")), /not a 0700 directory owned by this user/);
    fs.chmodSync(fallbackParent, 0o700);
    ensurePrivateDir(path.join(fallbackParent, "socket"));
    assert.equal(fs.statSync(path.join(fallbackParent, "socket")).mode & 0o777, 0o700);
  } finally {
    fs.rmSync(fallbackParent, { recursive: true, force: true });
  }
});
