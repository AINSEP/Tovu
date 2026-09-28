import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { computeCoreTableCopyOrder } from "#src/platform/db/migration/manifest";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { connectionFor, dropDatabase, recreateDatabase, sql } from "./pg-test-db.js";
import { collectTransferTables, countPartialExclusions, countSourceRows, DEFAULT_TRANSFER_SCHEMA, inspectTarget, runCopy, siteSchemaName, type CopyResult } from "../copy-engine.js";
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

const SITE = "fixture";
const TARGET = () => createPsqlPostgresTarget(CONNECTION);

async function count(table: string, schema: string): Promise<number> {
  return Number(await sql(FIXTURE_DB, `SELECT count(*) FROM "${schema}"."${table}"`));
}

/** What the tools do: inspect the destination for this site's schema, then copy into it. */
async function copyAs(site: string, snapshotAt: string, bytes: Buffer = fixtureSnapshot()): Promise<{ schema: string; result: CopyResult }> {
  const inspected = await inspectTarget(TARGET(), site);
  assert.ok(inspected.ok && inspected.schema !== null, JSON.stringify(inspected));
  const source = openSqliteSnapshotSource(bytes);
  try {
    const tables = collectTransferTables();
    const result = await runCopy({ source, target: TARGET(), tables, counts: countSourceRows(source, tables), schema: inspected.schema, marker: { site, snapshotAt } });
    return { schema: inspected.schema, result };
  } finally {
    source.close();
  }
}

/** A copy straight into `schema`, skipping the inspection — what a stale plan or a race would do. */
async function copyInto(schema: string, site: string): Promise<CopyResult> {
  const source = openSqliteSnapshotSource(fixtureSnapshot());
  try {
    const tables = collectTransferTables();
    return await runCopy({ source, target: TARGET(), tables, counts: countSourceRows(source, tables), schema, marker: { site, snapshotAt: "x" } });
  } finally {
    source.close();
  }
}

test.before(() => recreateDatabase(FIXTURE_DB));
test.after(() => dropDatabase(FIXTURE_DB));

test("the first site's copy lands in `tovu` with the same row count as SQLite for every copied core table, and leaves out logins and saved keys", async () => {
  const tables = collectTransferTables();
  assert.equal(tables.length, computeCoreTableCopyOrder().length - Object.keys(EXCLUDED_CORE_TABLES).length);
  assert.ok(!tables.some((table) => table.name in EXCLUDED_CORE_TABLES));

  const before = await inspectTarget(TARGET(), SITE);
  assert.deepEqual(before.ok && [before.schemaState, before.schema, before.lastCopy], ["absent", DEFAULT_TRANSFER_SCHEMA, null]);

  const source = openSqliteSnapshotSource(fixtureSnapshot());
  const counts = countSourceRows(source, tables);
  source.close();
  const { schema, result } = await copyAs(SITE, "2026-09-27T12:00:00.000Z");
  assert.equal(schema, "tovu");
  assert.ok(result.ok, `copy failed: ${JSON.stringify(result)}`);

  for (const { table, rows } of counts) assert.equal(await count(table.name, "tovu"), rows, table.name);
  assert.equal(await count("menus", "tovu"), 2);
  assert.equal(await count("posts", "tovu"), 1);
  assert.equal(await sql(FIXTURE_DB, `SELECT title = ${"$$"}${TRICKY_TEXT}${"$$"} FROM tovu.menus WHERE id = 'menu-1'`), "t");
  assert.equal(await sql(FIXTURE_DB, `SELECT doc_json->'items'->0->>'label' = ${"$$"}${TRICKY_TEXT}${"$$"} FROM tovu.menus WHERE id = 'menu-1'`), "t");
  assert.equal(await sql(FIXTURE_DB, `SELECT overrides_theme_page FROM tovu.posts`), "t");
  assert.equal(await sql(FIXTURE_DB, `SELECT to_regclass('tovu.identity_users') IS NULL`), "t", "an excluded table must not be created");

  const after = await inspectTarget(TARGET(), SITE);
  assert.deepEqual(after.ok && [after.schemaState, after.schema, after.lastCopy], ["ours", "tovu", { site: SITE, snapshotAt: "2026-09-27T12:00:00.000Z" }]);
});

test("a re-copy replaces the site's own copy and never appends", async () => {
  const { schema, result } = await copyAs(SITE, "2026-09-27T13:00:00.000Z");
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(schema, "tovu");
  assert.equal(await count("menus", "tovu"), 2);
  assert.equal(await sql(FIXTURE_DB, `SELECT count(*) FROM tovu._tovu_transfer`), "1");
});

test("cross-site wipe regression: a copy aimed at a schema holding ANOTHER site's copy is refused inside the transaction", async () => {
  const refused = await copyInto("tovu", "intruder-site");
  assert.deepEqual(refused, {
    ok: false,
    code: "TARGET_NOT_OURS",
    message: "the destination already has a 'tovu' area that holds other data. Nothing was written, and it was left untouched.",
  });
  assert.equal(await count("menus", "tovu"), 2, "the other site's copy must survive");
  assert.equal(await sql(FIXTURE_DB, `SELECT site FROM tovu._tovu_transfer`), SITE);
});

test("a schema someone else made (no marker) is refused and left untouched, and a new site is given its own schema instead", async () => {
  await sql(FIXTURE_DB, `CREATE SCHEMA tovu_someone; CREATE TABLE tovu_someone.theirs (v text); INSERT INTO tovu_someone.theirs VALUES ('keep me');`);
  const refused = await copyInto("tovu_someone", "someone");
  assert.equal(!refused.ok && refused.code, "TARGET_NOT_OURS");
  assert.equal(await sql(FIXTURE_DB, `SELECT v FROM tovu_someone.theirs`), "keep me");
  assert.equal(await sql(FIXTURE_DB, `SELECT to_regclass('tovu_someone.menus') IS NULL`), "t");

  const inspected = await inspectTarget(TARGET(), "someone");
  assert.equal(inspected.ok && inspected.schemaState, "absent");
  assert.match(inspected.ok ? String(inspected.schema) : "", /^tovu_someone_[0-9a-f]{8}$/, "the readable name is taken, so the hashed one is used");
});

test("two sites share one database: the second gets `tovu_<site>`, each re-copy replaces only its own, and a site keeps its schema after `tovu` frees up", async () => {
  const b = await copyAs("other-site", "2026-09-27T14:00:00.000Z");
  assert.ok(b.result.ok, JSON.stringify(b.result));
  assert.equal(b.schema, "tovu_other_site");
  assert.equal(await count("menus", "tovu_other_site"), 2);

  await sql(FIXTURE_DB, `INSERT INTO tovu_other_site.menus (id, workspace_id, slug, title, status, doc_json, locations_json, updated_at, version) VALUES ('only-in-b', 'ws', 'b', 'B', 'draft', '{}', '[]', 'x', 1)`);
  const a = await copyAs(SITE, "2026-09-27T15:00:00.000Z");
  assert.ok(a.result.ok);
  assert.equal(a.schema, "tovu");
  assert.equal(await count("menus", "tovu_other_site"), 3, "re-copying site A must not touch site B's schema");

  await sql(FIXTURE_DB, `DROP SCHEMA tovu CASCADE`);
  const again = await inspectTarget(TARGET(), "other-site");
  assert.deepEqual(again.ok && [again.schemaState, again.schema, again.lastCopy], ["ours", "tovu_other_site", { site: "other-site", snapshotAt: "2026-09-27T14:00:00.000Z" }]);
});

test("a row Postgres rejects rolls the whole copy back and names only the table", async () => {
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
  const { schema, result } = await copyAs("bad-row", "x", bytes);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.code, "COPY_FAILED");
  assert.match(!result.ok ? result.message : "", /menus/);
  assert.doesNotMatch(JSON.stringify(result), /SECRET-ROW-VALUE/);
  assert.equal(await sql(FIXTURE_DB, `SELECT to_regnamespace('${schema}') IS NULL`), "t", "nothing may be left behind");
});

test("a setting marked secret stays behind (values at every scope and its history); ordinary settings are copied", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-transfer-settings-"));
  let bytes: Buffer;
  try {
    const db = openContentDb(path.join(dir, "content.db"));
    const c = db.$client;
    const define = c.prepare(
      "INSERT INTO setting_definitions (setting_id, version, namespace, key, owner_kind, schema_json, scopes, secret, status, created_at, updated_at) VALUES (?, 1, 'test', ?, 'core', '{}', 3, ?, 'active', 'x', 'x')"
    );
    define.run("set-secret", "api_token", 1);
    define.run("set-plain", "site_title", 0);
    const value = c.prepare("INSERT INTO setting_values_global (setting_id, value_json, def_version, seq, updated_by, updated_at) VALUES (?, ?, 1, 1, 'p', 'x')");
    value.run("set-secret", JSON.stringify("SECRET-SETTING-VALUE"));
    value.run("set-plain", JSON.stringify("My site"));
    c.prepare(
      "INSERT INTO setting_revisions (entity_kind, setting_id, scope, op, before_json, after_json, def_version, actor, created_at) VALUES ('value', 'set-secret', 'global', 'set', NULL, ?, 1, 'p', 'x')"
    ).run(JSON.stringify("SECRET-SETTING-VALUE"));
    bytes = c.serialize();
    c.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const source = openSqliteSnapshotSource(bytes);
  const counts = countSourceRows(source, collectTransferTables());
  assert.equal(counts.find((entry) => entry.table.name === "setting_values_global")?.rows, 1);
  assert.equal(counts.find((entry) => entry.table.name === "setting_revisions")?.rows, 0);
  assert.deepEqual(countPartialExclusions(source).filter((entry) => entry.rows > 0), [
    { table: "setting_values_global", rows: 1, reason: "settings marked secret, and their history, are not copied" },
    { table: "setting_revisions", rows: 1, reason: "settings marked secret, and their history, are not copied" },
  ]);
  source.close();
  const { schema, result } = await copyAs("settings-site", "x", bytes);
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(await sql(FIXTURE_DB, `SELECT setting_id FROM "${schema}".setting_values_global`), "set-plain");
  assert.equal(await count("setting_revisions", schema), 0);
  assert.equal(await count("setting_definitions", schema), 2, "definitions are not secret; only their values are");
});

test("siteSchemaName: the readable per-site schema for every site after the first, a safe identifier of at most 63 bytes", () => {
  assert.equal(siteSchemaName("tovu-dev"), "tovu_tovu_dev");
  assert.equal(siteSchemaName("My Site"), "tovu_my_site");
  assert.equal(siteSchemaName("other-site"), "tovu_other_site");
  const long = "a-very-long-site-name-".repeat(5);
  assert.equal(siteSchemaName(long), siteSchemaName(long), "stable");
  assert.match(siteSchemaName(long), /^tovu_a_very_long_site_name_a_very_long_site_name_a_ver_[0-9a-f]{8}$/);
  assert.ok(Buffer.byteLength(siteSchemaName(long)) <= 63);
  assert.notEqual(siteSchemaName(long), siteSchemaName(`${long}x`), "a truncated name keeps a hash of the whole name");
  assert.match(siteSchemaName("---"), /^tovu_[0-9a-f]{8}$/);
  assert.match(siteSchemaName("café"), /^tovu_caf_[0-9a-f]{8}$/, "a name that loses characters keeps a hash, so 'café' and 'caf' differ");
  assert.match(siteSchemaName("My Site!"), /^tovu_my_site_[0-9a-f]{8}$/);
  assert.notEqual(siteSchemaName("public"), "public");
});
