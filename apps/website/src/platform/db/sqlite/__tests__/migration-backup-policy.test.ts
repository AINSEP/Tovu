import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createCopyCoordinator, sqliteCopyPorts } from "../copy-coordinator.js";
import { migrateSqliteContentFile, openContentDb } from "../content-db.js";
import { testCopyPorts } from "./helpers/copy-ports.js";

function fixture(t: { after(fn: () => void): void }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "migration-backup-policy-"));
  const file = path.join(dir, "content.db");
  const db = openContentDb(file);
  // Restore the actual pre-0037 state, so boot must run a real pending migration.
  db.$client.exec("ALTER TABLE media DROP COLUMN source_metadata_json; DELETE FROM tovu_migrations WHERE id = '0037_media_source_metadata'");
  t.after(() => { db.$client.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { dir, file, db };
}

test("migration backup keeps newest five exact names and foreign files survive", async t => {
  const { dir, file, db } = fixture(t);
  const ops = path.join(dir, "ops");
  fs.mkdirSync(ops);
  for (let i = 1; i <= 7; i++) fs.writeFileSync(path.join(ops, `pre-migrations-2000-01-0${i}T00-00-00-000Z.db`), "COPY");
  for (const name of ["pre-migrations-personal.db", "pre-migrations-2000-01-01T00-00-00-000Z.db.notes", "other.db"]) fs.writeFileSync(path.join(ops, name), "FOREIGN");
  await migrateSqliteContentFile({ db, filePath: file, ...testCopyPorts({ filePath: file }) });
  const names = fs.readdirSync(ops);
  assert.equal(names.filter(n => /^pre-migrations-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z\.db$/.test(n)).length, 5);
  assert.ok(names.includes("pre-migrations-2000-01-04T00-00-00-000Z.db"));
  for (const name of ["pre-migrations-personal.db", "pre-migrations-2000-01-01T00-00-00-000Z.db.notes", "other.db"]) assert.equal(fs.readFileSync(path.join(ops, name), "utf8"), "FOREIGN");
});

test("boot warns and applies pending migrations without a backup when disk is low", async t => {
  const { dir, file, db } = fixture(t);
  const actual = await fsp.statfs(dir);
  t.mock.method(fsp, "statfs", async () => ({ ...actual, bavail: 0 }));
  const warnings = t.mock.method(console, "warn", () => {});
  const report = await migrateSqliteContentFile({ db, filePath: file, ...testCopyPorts({ filePath: file }) });
  assert.ok(report.applied.includes("0037_media_source_metadata"));
  assert.ok(warnings.mock.calls.some(c => String(c.arguments[0]).includes("disk is almost full")));
  assert.deepEqual(fs.readdirSync(path.join(dir, "ops")).filter(n => n.startsWith("pre-migrations-")), []);
});

test("SQLite running out of space mid-copy warns, removes the partial copy, and still migrates", async t => {
  const { dir, file, db } = fixture(t);
  t.mock.method(db.$client, "backup", async (target: string) => {
    fs.writeFileSync(target, "PARTIAL");
    throw Object.assign(new Error("database or disk is full"), { code: "SQLITE_FULL" });
  });
  const warnings = t.mock.method(console, "warn", () => {});
  const report = await migrateSqliteContentFile({ db, filePath: file, ...testCopyPorts({ filePath: file }) });
  assert.ok(report.applied.includes("0037_media_source_metadata"));
  assert.ok(warnings.mock.calls.some(c => String(c.arguments[0]).includes("database or disk is full")));
  assert.deepEqual(fs.readdirSync(path.join(dir, "ops")).filter(n => n.startsWith("pre-migrations-")), []);
});

test("a successful backup is pruned even if the following migration fails", async t => {
  const { dir, file, db } = fixture(t);
  db.$client.exec("ALTER TABLE media ADD COLUMN source_metadata_json text");
  const ops = path.join(dir, "ops");
  fs.mkdirSync(ops);
  for (let i = 1; i <= 7; i++) fs.writeFileSync(path.join(ops, `pre-migrations-2000-01-0${i}T00-00-00-000Z.db`), "COPY");
  await assert.rejects(migrateSqliteContentFile({ db, filePath: file, ...testCopyPorts({ filePath: file }) }), /duplicate column/);
  assert.equal(fs.readdirSync(ops).filter(n => n.endsWith(".db")).length, 5);
});

test("backup pruning failure logs redacted cause and does not refuse completed migrations", async t => {
  const { file, db } = fixture(t);
  // The pruner reads protection from the recovery journal; an unreadable journal fails the prune, not the boot.
  const failingJournal = async () => { throw new Error("retention context password=PRUNE_CANARY"); };
  const warnings = t.mock.method(console, "warn", () => {});
  const report = await migrateSqliteContentFile({ db, filePath: file, ...testCopyPorts({ filePath: file }), listProtected: failingJournal });
  assert.ok(report.applied.includes("0037_media_source_metadata"));
  const text = warnings.mock.calls.map(call => call.arguments.join(" ")).join(" ");
  assert.match(text, /Could not prune older pre-migration backups.*retention context/);
  assert.doesNotMatch(text, /PRUNE_CANARY/);
});

test("protection reads every nonempty artifact ref across sites and closes the read-only journal", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-protected-"));
  const journalPath = path.join(dir, "database-journal.db");
  const handles: Database.Database[] = [];
  t.after(() => {
    for (const handle of handles) if (handle.open) handle.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const { listProtected } = sqliteCopyPorts({
    journalPath, copies: createCopyCoordinator({}, {}), exists: fs.existsSync,
    open: (requested, options) => {
      assert.equal(requested, journalPath);
      assert.deepEqual(options, { readonly: true, fileMustExist: true });
      const db = new Database(requested, options);
      handles.push(db);
      return db;
    },
  });
  assert.deepEqual(await listProtected(), []);
  assert.equal(handles.length, 0);
  const journal = new Database(journalPath);
  try {
    journal.exec("CREATE TABLE restore_points (site_id TEXT, artifact_ref TEXT);");
    const insert = journal.prepare("INSERT INTO restore_points VALUES (?, ?)");
    insert.run("north", "/copies/north.db");
    insert.run("north", "");
    insert.run("south", "/copies/south.db");
  } finally {
    journal.close();
  }

  assert.deepEqual([...(await listProtected())].sort(), ["/copies/north.db", "/copies/south.db"]);
  assert.deepEqual(handles.map(db => db.open), [false]);
});

test("a present journal missing the protection table fails closed and releases its handle", async t => {
  const db = new Database(":memory:");
  t.after(() => { if (db.open) db.close(); });
  const journalPath = "/fixture/database-journal.db";
  const { listProtected } = sqliteCopyPorts({
    journalPath, copies: createCopyCoordinator({}, {}),
    exists: requested => {
      assert.equal(requested, journalPath);
      return true;
    },
    open: (requested, options) => {
      assert.equal(requested, journalPath);
      assert.deepEqual(options, { readonly: true, fileMustExist: true });
      return db;
    },
  });
  await assert.rejects(listProtected(), { code: "SQLITE_ERROR", message: "no such table: restore_points" });
  assert.equal(db.open, false);
});
