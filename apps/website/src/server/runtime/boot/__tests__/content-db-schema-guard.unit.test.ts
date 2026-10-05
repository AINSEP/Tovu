import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { checkContentDbSchema } from "../content-db-schema-guard.js";

/**
 * @file `checkContentDbSchema()` — closes the gap this dispatch's own header names: `npm run dev`
 * (and `npm start`, the same `index.ts` boot path) called `openContentDb()` directly, with no
 * schema-version check at all, while `tovu serve` refuses via `compareSchemaVersion` before ever
 * opening a site's db. Every fixture db here is a throwaway created in `os.tmpdir()` via
 * `fs.mkdtempSync` — never the real `sites/tovu-com/content.db` another agent is actively working
 * on in this same repo.
 *
 * `__drizzle_migrations`'s DDL (`id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric`) is
 * confirmed against `drizzle-orm`'s own `SQLiteSyncDialect.migrate()`
 * (`node_modules/drizzle-orm/sqlite-core/dialect.cjs`) — the same empirical source
 * `database-introspection-adapter.sqlite.ts`'s own header already cites for the identical fact.
 */

function mkTempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-content-db-schema-guard-"));
  return path.join(dir, "content.db");
}

test("checkContentDbSchema(): a path with no file at all returns 'no-file' (first boot — nothing to guard, openContentDb() will create it)", async () => {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-content-db-schema-guard-")), "does-not-exist.db");
  const result = await checkContentDbSchema(dbPath);
  assert.deepEqual(result, { status: "no-file" });
});

test("checkContentDbSchema(): an existing file with no __drizzle_migrations table at all returns 'unmigrated' (nothing applied yet — safe to proceed)", async () => {
  const dbPath = mkTempDbPath();
  // A bare sqlite file with a real table but NOT `__drizzle_migrations` — never opened via
  // `openContentDb()`, so no migration has ever run against it.
  const sqlite = new Database(dbPath);
  sqlite.exec("CREATE TABLE unrelated (id INTEGER PRIMARY KEY)");
  sqlite.close();

  const result = await checkContentDbSchema(dbPath);
  assert.deepEqual(result, { status: "unmigrated" });
});

test("checkContentDbSchema(): a __drizzle_migrations table that exists but is EMPTY also returns 'unmigrated' — a distinct branch from 'table absent entirely' inside readAppliedMigrationIdentity", async () => {
  const dbPath = mkTempDbPath();
  const sqlite = new Database(dbPath);
  sqlite.exec("CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash text NOT NULL, created_at numeric)");
  sqlite.close();

  const result = await checkContentDbSchema(dbPath);
  assert.deepEqual(result, { status: "unmigrated" });
});

test("checkContentDbSchema(): a db already migrated by THIS runtime returns 'ok' — the same db openContentDb() would happily reopen", async () => {
  const dbPath = mkTempDbPath();
  const db = openContentDb(dbPath);
  db.$client.close();

  const result = await checkContentDbSchema(dbPath);
  assert.deepEqual(result, { status: "ok" });
});

test("checkContentDbSchema(): a db whose latest applied migration matches no entry in this runtime's bundled journal returns 'refuse' — REFUSE, not a silent migrate, on a divergent lineage this function cannot safely interpret", async () => {
  const dbPath = mkTempDbPath();
  const db = openContentDb(dbPath);
  // Fabricates the exact shape a db migrated forward by a DIFFERENT runtime (a newer checkout, or a
  // different branch's migration set) would have: a `__drizzle_migrations` row whose `created_at`
  // matches no `when` value in this runtime's own `db/drizzle/meta/_journal.json` — the same
  // divergent-lineage case `database-introspection-adapter.sqlite.ts`'s `readAppliedSnapshot()`
  // already documents as unmatchable.
  db.$client.exec(
    `INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('deadbeef-fabricated-hash', 9999999999999)`
  );
  db.$client.close();

  const result = await checkContentDbSchema(dbPath);
  assert.equal(result.status, "refuse");
  if (result.status !== "refuse") assert.fail("expected refusal");
  assert.ok(result.message.includes(dbPath));
  assert.match(result.message, /applied migration.*bundled/s);
  assert.match(result.message, /divergent schema lineage/);
});

test("checkContentDbSchema(): divergent migration lineage returns a refusal without throwing", async () => {
  // Same fixture as the divergent-lineage test above; asserted from a different angle: whatever
  // divergent-lineage refusal is returned, so a caller can decide what it means without a catch.
  const dbPath = mkTempDbPath();
  const db = openContentDb(dbPath);
  // `created_at` must be LARGER than every real applied row's epoch-millis timestamp so
  // `ORDER BY created_at DESC LIMIT 1` actually selects this fabricated row as "latest" — a small
  // value here would silently sort behind the real migration history and never exercise this path.
  db.$client.exec(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('another-fabricated-hash', 9999999999998)`);
  db.$client.close();

  await assert.doesNotReject(() => checkContentDbSchema(dbPath));
  assert.equal((await checkContentDbSchema(dbPath)).status, "refuse");
});

test("checkContentDbSchema(): an older real migration is safe to migrate forward", async (t) => {
  const dbPath = mkTempDbPath();
  t.after(() => fs.rmSync(path.dirname(dbPath), { recursive: true, force: true }));
  const journal = JSON.parse(fs.readFileSync(new URL("../../../../platform/db/drizzle/meta/_journal.json", import.meta.url), "utf8"));
  assert.ok(journal.entries.length >= 2);
  const older = journal.entries.at(-2);
  const sqlite = new Database(dbPath);
  sqlite.exec("CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash text NOT NULL, created_at numeric)");
  sqlite.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)").run("older-migration", older.when);
  sqlite.close();
  assert.deepEqual(await checkContentDbSchema(dbPath), { status: "ok" });
});
