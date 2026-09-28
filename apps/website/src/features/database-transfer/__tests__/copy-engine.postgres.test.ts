import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { computeCoreTableCopyOrder } from "#src/platform/db/migration/manifest";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { connectionFor, dropDatabase, recreateDatabase, sql } from "./pg-test-db.js";
import { collectTransferTables, countSourceRows, inspectTarget, runCopy, TRANSFER_SCHEMA } from "../copy-engine.js";
import { EXCLUDED_CORE_TABLES } from "../exclusions.js";
import { createPsqlPostgresTarget } from "../postgres-target.js";
import { openSqliteSnapshotSource } from "../sqlite-source.js";

/**
 * @file P0's end-to-end proof against a REAL local Postgres (Homebrew 14, `/tmp` socket, role `la` —
 * see `./pg-test-db.ts`): a migrated SQLite site database, snapshotted to bytes,
 * copied into a throwaway database's `tovu` schema, gives the same `count(*)` for every core table in
 * `computeCoreTableCopyOrder()` that is not on the logins/saved-keys exclusion list — and the
 * excluded tables are not created at all. With Postgres down these tests FAIL; they never skip.
 */

const FIXTURE_DB = `tovu_transfer_fixture_${process.pid}`;
const CONNECTION = connectionFor(FIXTURE_DB);
const TRICKY_TEXT = "tab\there\nnew line \\ backslash \\N not-null 'quote' \"dq\" é ✓";

/** A migrated content.db with rows that exercise every COPY escape, a jsonb and a boolean column, and an excluded table. */
function fixtureSnapshot(): Buffer {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-transfer-"));
  try {
    const db = openContentDb(path.join(dir, "content.db"));
    const c = db.$client;
    c.prepare(
      "INSERT INTO menus (id, workspace_id, slug, title, status, doc_json, locations_json, updated_at, version) VALUES (?, 'ws', ?, ?, 'published', ?, '[]', '2026-09-27T00:00:00.000Z', 1)"
    ).run("menu-1", "main", TRICKY_TEXT, JSON.stringify({ items: [{ label: TRICKY_TEXT }] }));
    c.prepare("INSERT INTO menus (id, workspace_id, slug, title, status, doc_json, locations_json, updated_at, version) VALUES ('menu-2', 'ws', 'footer', 'Footer', 'draft', '{}', '[]', '2026-09-27T00:00:00.000Z', 2)").run();
    c.prepare(
      "INSERT INTO posts (id, workspace_id, title, slug, status, body_json, updated_at, version, overrides_theme_page) VALUES ('post-1', 'ws', 'Hello', 'hello', 'draft', '{}', '2026-09-27T00:00:00.000Z', 1, 1)"
    ).run();
    c.prepare("INSERT INTO identity_users (principal_id, workspace_id, username, password_hash) VALUES ('p1', 'ws', 'owner', 'scrypt$secret-hash')").run();
    const bytes = c.serialize();
    c.close();
    return bytes;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function count(table: string): Promise<number> {
  return Number(await sql(FIXTURE_DB, `SELECT count(*) FROM "${TRANSFER_SCHEMA}"."${table}"`));
}

test.before(() => recreateDatabase(FIXTURE_DB));
test.after(() => dropDatabase(FIXTURE_DB));

test("the copy gives Postgres the same row count as SQLite for every copied core table, and leaves out logins and saved keys", async () => {
  const source = openSqliteSnapshotSource(fixtureSnapshot());
  const target = createPsqlPostgresTarget(CONNECTION);
  const tables = collectTransferTables();

  const expectedNames = computeCoreTableCopyOrder().length;
  assert.equal(tables.length, expectedNames - Object.keys(EXCLUDED_CORE_TABLES).length);
  assert.ok(!tables.some((table) => table.name in EXCLUDED_CORE_TABLES));

  const before = await inspectTarget(target);
  assert.equal(before.ok && before.schemaState, "absent");

  const counts = countSourceRows(source, tables);
  const result = await runCopy({ source, target, tables, counts, marker: { site: "fixture", snapshotAt: "2026-09-27T12:00:00.000Z" } });
  source.close();
  assert.ok(result.ok, `copy failed: ${JSON.stringify(result)}`);

  for (const { table, rows } of counts) assert.equal(await count(table.name), rows, table.name);
  assert.equal(await count("menus"), 2);
  assert.equal(await count("posts"), 1);
  assert.equal(await sql(FIXTURE_DB, `SELECT title = ${"$$"}${TRICKY_TEXT}${"$$"} FROM tovu.menus WHERE id = 'menu-1'`), "t");
  assert.equal((await sql(FIXTURE_DB, `SELECT doc_json->'items'->0->>'label' = ${"$$"}${TRICKY_TEXT}${"$$"} FROM tovu.menus WHERE id = 'menu-1'`)), "t");
  assert.equal((await sql(FIXTURE_DB, `SELECT overrides_theme_page FROM tovu.posts`)), "t");
  assert.equal((await sql(FIXTURE_DB, `SELECT to_regclass('tovu.identity_users') IS NULL`)), "t", "an excluded table must not be created");

  const after = await inspectTarget(target);
  assert.equal(after.ok && after.schemaState, "ours");
});

test("a second copy replaces the first one; a `tovu` schema this site did not write is refused and left untouched", async () => {
  const target = createPsqlPostgresTarget(CONNECTION);
  const tables = collectTransferTables();

  const again = openSqliteSnapshotSource(fixtureSnapshot());
  const refreshed = await runCopy({ source: again, target, tables, counts: countSourceRows(again, tables), marker: { site: "fixture", snapshotAt: "2026-09-27T13:00:00.000Z" } });
  again.close();
  assert.ok(refreshed.ok, JSON.stringify(refreshed));
  assert.equal(await count("menus"), 2, "a refresh replaces rows, it never appends");

  await sql(FIXTURE_DB, `DROP SCHEMA tovu CASCADE; CREATE SCHEMA tovu; CREATE TABLE tovu.someone_elses (v text); INSERT INTO tovu.someone_elses VALUES ('keep me');`);
  const inspected = await inspectTarget(target);
  assert.equal(inspected.ok && inspected.schemaState, "foreign");

  const source = openSqliteSnapshotSource(fixtureSnapshot());
  const refused = await runCopy({ source, target, tables, counts: countSourceRows(source, tables), marker: { site: "fixture", snapshotAt: "2026-09-27T14:00:00.000Z" } });
  source.close();
  assert.equal(refused.ok, false);
  assert.equal(!refused.ok && refused.code, "TARGET_NOT_OURS");
  assert.equal((await sql(FIXTURE_DB, `SELECT v FROM tovu.someone_elses`)), "keep me");
  assert.equal((await sql(FIXTURE_DB, `SELECT to_regclass('tovu.menus') IS NULL`)), "t");
});

test("a row Postgres rejects rolls the whole copy back and names only the table", async () => {
  await sql(FIXTURE_DB, `DROP SCHEMA IF EXISTS tovu CASCADE`);
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-transfer-bad-"));
  let bytes: Buffer;
  try {
    const db = openContentDb(path.join(dir, "content.db"));
    db.$client.prepare("INSERT INTO menus (id, workspace_id, slug, title, status, doc_json, locations_json, updated_at, version) VALUES ('m', 'ws', 's', 't', 'draft', 'not json SECRET-ROW-VALUE', '[]', 'x', 1)").run();
    bytes = db.$client.serialize();
    db.$client.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const source = openSqliteSnapshotSource(bytes);
  const tables = collectTransferTables();
  const result = await runCopy({ source, target: createPsqlPostgresTarget(CONNECTION), tables, counts: countSourceRows(source, tables), marker: { site: "fixture", snapshotAt: "x" } });
  source.close();
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.code, "COPY_FAILED");
  assert.match(!result.ok ? result.message : "", /menus/);
  assert.doesNotMatch(JSON.stringify(result), /SECRET-ROW-VALUE/);
  assert.equal((await sql(FIXTURE_DB, `SELECT to_regnamespace('tovu') IS NULL`)), "t", "nothing may be left behind");
});
