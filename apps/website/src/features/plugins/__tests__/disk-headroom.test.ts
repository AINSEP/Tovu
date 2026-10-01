import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { syncBuiltinESMExports } from "node:module";
import Database from "better-sqlite3";
import { declareDataModule } from "../data-module.js";

import { checkDiskHeadroom } from "../disk-headroom.js";

function measuredFreeSpace(t: TestContext, freeBytes: number): void {
  const measurement = t.mock.method(fs, "statfsSync", () => ({ bsize: 1, bavail: freeBytes }));
  syncBuiltinESMExports();
  t.after(() => { measurement.mock.restore(); syncBuiltinESMExports(); });
}

/** @file ADR-023 §3 (T4 fix) — disk-headroom preflight, isolated from the rest of the engine. */

test("a nonexistent db file requires zero headroom (0 bytes) and passes on any real volume", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-headroom-"));
  const dbPath = path.join(dir, "content.db"); // never created
  const result = checkDiskHeadroom(dbPath);
  assert.equal(result.requiredBytes, 0);
  assert.equal(result.ok, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("required bytes scale with the actual db + WAL file sizes (1.5x multiplier)", (t) => {
  measuredFreeSpace(t, 1800);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-headroom-"));
  const dbPath = path.join(dir, "content.db");
  fs.writeFileSync(dbPath, Buffer.alloc(1000));
  fs.writeFileSync(`${dbPath}-wal`, Buffer.alloc(200));

  const result = checkDiskHeadroom(dbPath);
  assert.equal(result.requiredBytes, Math.ceil(1.5 * 1200));
  assert.equal(result.freeBytes, 1800);
  assert.equal(result.ok, true, "headroom exactly at the required threshold is sufficient");
  fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * BUG FIX regression coverage (2026-07-28): before this fix, `checkDiskHeadroom(":memory:")`
 * derived its answer from `path.dirname(":memory:")`, i.e. the process's current working
 * directory — a low-disk cwd could fail-close a dataModule declare against an in-memory db that
 * will never touch disk at all. The guard makes this a deterministic no-op instead.
 */
test("an in-memory dbPath is a no-op: ok, zero required bytes, no real measurement attempted", () => {
  const result = checkDiskHeadroom(":memory:");
  assert.equal(result.ok, true);
  assert.equal(result.requiredBytes, 0);
  assert.equal(result.freeBytes, null);
});

test("insufficient free space fails closed (ok: false) rather than throwing", (t) => {
  measuredFreeSpace(t, 1499);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-headroom-"));
  const dbPath = path.join(dir, "content.db");
  fs.writeFileSync(dbPath, Buffer.alloc(1000));
  const result = checkDiskHeadroom(dbPath);
  assert.equal(typeof result.freeBytes, "number");
  assert.ok((result.freeBytes ?? 0) > 0);
  assert.equal(result.measurementFailed, undefined);
  assert.equal(result.requiredBytes, 1500);
  assert.equal(result.freeBytes, 1499);
  assert.equal(result.ok, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule refuses insufficient headroom before snapshot or plugin DDL", async (t) => {
  measuredFreeSpace(t, 0);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-headroom-"));
  const dbPath = path.join(dir, "content.db");
  const db = new Database(dbPath);
  try {
    db.exec("CREATE TABLE posts (id TEXT PRIMARY KEY)");
    const backup = t.mock.method(db, "backup");
    const statements: string[] = [];
    const prepare = db.prepare.bind(db);
    t.mock.method(db, "prepare", (sql: string) => { statements.push(sql); return prepare(sql); });
    const result = await declareDataModule({
      db, dbPath,
      decl: {
        pluginId: "headroom", pluginTier: "tier-2",
        provenance: { sourceUrl: "test://headroom", publisher: "test" },
        tables: [{ name: "products", columns: [{ name: "id", type: "TEXT", primaryKey: true }] }],
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, "INSUFFICIENT_DISK_HEADROOM");
    assert.deepEqual(result.created, []);
    assert.deepEqual(result.altered, []);
    assert.equal(result.snapshotPath, null);
    assert.equal(backup.mock.calls.length, 0, "no snapshot is taken");
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'p_headroom__products'").get(), undefined);
    assert.equal(statements.some(sql => /VACUUM|CREATE TABLE.*p_headroom__products/i.test(sql)), false);
    assert.equal(fs.readdirSync(dir).some(name => name.includes("snapshot")), false);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
