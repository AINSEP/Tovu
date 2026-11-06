/** @file Bugs 450/499: an older history cannot mutate a disposable copy of a current site DB. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { sql } from "kysely";
import { closeSqliteConnection, openSqliteFileKernel } from "../../kernel/drivers/sqlite.js";
import { openSiteContentDb } from "#src/server/runtime/composition/open-site-content-db";
import { CONTENT_MIGRATIONS, migrateContentDatabase } from "../index.js";
import { runMigrations } from "../runner.js";
import { UnknownAppliedMigrationError } from "../step.js";

test("a copied current DB rejects an old history without losing data and reopens on the current release", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "migrated-site-copy-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "source.db");
  const source = openSqliteFileKernel<unknown>(sourcePath);
  try {
    await migrateContentDatabase(source);
    await source.execute(sql`CREATE TABLE fixture_content (id text PRIMARY KEY, body text NOT NULL)`);
    await source.execute(sql`INSERT INTO fixture_content VALUES ('draft', 'keep this disposable content')`);
  } finally { await source.close(); }
  const copyPath = path.join(root, "backup-copy.db");
  fs.copyFileSync(sourcePath, copyPath);
  const copy = openSqliteFileKernel<unknown>(copyPath);
  try {
    const ledger = await copy.query<{ id: string; checksum: string; applied_at: string }>(sql`SELECT id, checksum, applied_at FROM tovu_migrations ORDER BY id`);
    assert.equal(ledger.length, 43);
    assert.equal(ledger.at(-1)!.id, "0041_owner_passkeys");
    assert.deepEqual((await migrateContentDatabase(copy)).applied, []);
    await assert.rejects(runMigrations(copy, CONTENT_MIGRATIONS.slice(0, -1)),
      error => error instanceof UnknownAppliedMigrationError && error.ids.includes("0041_owner_passkeys"));
    assert.deepEqual(await copy.query(sql`SELECT id, checksum, applied_at FROM tovu_migrations ORDER BY id`), ledger);
    assert.deepEqual(await copy.query(sql`SELECT * FROM fixture_content`),
      [{ id: "draft", body: "keep this disposable content" }]);
  } finally { await copy.close(); }
  const reopened = await openSiteContentDb(copyPath);
  try {
    assert.deepEqual(reopened.$client.prepare("SELECT * FROM fixture_content").all(),
      [{ id: "draft", body: "keep this disposable content" }]);
    assert.deepEqual(reopened.$client.prepare("SELECT id, value FROM database_write_watermark").all(), [{ id: 1, value: 0 }]);
    assert.equal(reopened.$client.prepare("SELECT id FROM tovu_migrations").all().length, 43);
  } finally { closeSqliteConnection(reopened); }
});
