import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { sql } from "kysely";

import { openPgliteKernel } from "#src/platform/db/kernel/drivers/pglite";
import { sqliteKernel } from "#src/platform/db/kernel/drivers/sqlite";
import { closeSqliteConnection } from "#src/platform/db/kernel/index";
import { CONTENT_MIGRATIONS } from "#src/platform/db/migrations/index";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { runtimeSchemaVersion } from "../../schema-guard.js";
import { readAppliedSchemaIdentity, readAppliedSchemaIdentityOfFile } from "../../read-applied-schema-identity.js";

/**
 * @file `readAppliedSchemaIdentity(kernel)` on both ledgers: SQLite reads `__drizzle_migrations`
 * (matched to the bundled journal), Postgres/PGlite reads the `tovu_migrations` head (matched to
 * `CONTENT_MIGRATIONS`). Temp files and in-memory instances only.
 */

const pg = openPgliteKernel<unknown>();
after(async () => {
  await pg.close();
});

test("sqlite: a freshly migrated content db reports this runtime's head, by kernel and by file", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-applied-identity-"));
  const dbPath = path.join(dir, "content.db");
  const db = openContentDb(dbPath);
  const runtime = runtimeSchemaVersion();
  try {
    assert.deepEqual(await readAppliedSchemaIdentity(sqliteKernel(db)), { idx: runtime.index, tag: runtime.tag });
  } finally {
    closeSqliteConnection(db);
  }
  assert.deepEqual(await readAppliedSchemaIdentityOfFile(dbPath), { idx: runtime.index, tag: runtime.tag });
});

test("sqlite: no ledger is 'none'; a latest created_at the journal lacks is 'diverged'", async () => {
  const db = openContentDb(":memory:");
  try {
    const kernel = sqliteKernel(db);
    await kernel.execute(sql`INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('x', 9999999999999)`);
    assert.equal(await readAppliedSchemaIdentity(kernel), "diverged");
    await kernel.execute(sql`DROP TABLE __drizzle_migrations`);
    assert.equal(await readAppliedSchemaIdentity(kernel), "none");
  } finally {
    closeSqliteConnection(db);
  }
});

test("sqlite: an existing empty ledger is none through both kernel and file readers", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-empty-ledger-"));
  const dbPath = path.join(dir, "content.db");
  const db = openContentDb(dbPath);
  try {
    db.$client.exec("DELETE FROM __drizzle_migrations");
    assert.equal(await readAppliedSchemaIdentity(sqliteKernel(db)), "none");
    assert.equal(await readAppliedSchemaIdentityOfFile(dbPath), "none");
  } finally {
    closeSqliteConnection(db);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("postgres: reads the tovu_migrations head — none, known, then diverged", async () => {
  assert.equal(await readAppliedSchemaIdentity(pg), "none");
  await pg.execute(sql`CREATE TABLE tovu_migrations (id text PRIMARY KEY, checksum text NOT NULL, applied_at text NOT NULL)`);
  assert.equal(await readAppliedSchemaIdentity(pg), "none");
  const head = CONTENT_MIGRATIONS[0].id;
  await pg.execute(sql`INSERT INTO tovu_migrations VALUES (${head}, 'c', 'now')`);
  assert.deepEqual(await readAppliedSchemaIdentity(pg), { idx: 0, tag: head });
  const later = CONTENT_MIGRATIONS[2].id;
  await pg.execute(sql`INSERT INTO tovu_migrations VALUES (${later}, 'c', 'earlier-time')`);
  await pg.execute(sql`INSERT INTO tovu_migrations VALUES (${CONTENT_MIGRATIONS[1].id}, 'c', 'later-time')`);
  assert.deepEqual(await readAppliedSchemaIdentity(pg), { idx: 2, tag: later });
  await pg.execute(sql`INSERT INTO tovu_migrations VALUES ('9999_from_a_newer_tovu', 'c', 'now')`);
  assert.equal(await readAppliedSchemaIdentity(pg), "diverged");
});
