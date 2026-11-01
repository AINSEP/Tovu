import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { migrateSqliteContentFile, openContentDb } from "../content-db.js";

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
  await migrateSqliteContentFile(db, file);
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
  const report = await migrateSqliteContentFile(db, file);
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
  const report = await migrateSqliteContentFile(db, file);
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
  await assert.rejects(migrateSqliteContentFile(db, file), /duplicate column/);
  assert.equal(fs.readdirSync(ops).filter(n => n.endsWith(".db")).length, 5);
});
