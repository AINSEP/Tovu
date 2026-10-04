import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { computeCoreTableCopyOrder } from "#src/platform/db/migration/manifest";
import { closeSqliteConnection } from "#src/platform/db/kernel/index";
import { migrateSqliteContentFile, openSqliteContentConnection } from "#src/platform/db/sqlite/content-db";
import { connectionFor, dropDatabase, recreateDatabase, sql } from "./pg-test-db.js";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";

import * as pgSchema from "#src/platform/db/schema.postgres";
import { collectTransferTables, countPartialExclusions, countSourceRows, DEFAULT_TRANSFER_SCHEMA, inspectTarget, planSnapshotTables, runCopy, siteSchemaName, type CopyResult } from "../copy-engine.js";
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

/** A content.db built the way a site's boot builds it (the migration runner: `tovu_migrations` ledger, no empty legacy chat tables). */
let migratedBase: Buffer | undefined;

async function buildMigratedBase(): Promise<Buffer> {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-transfer-"));
  try {
    const filePath = path.join(dir, "content.db");
    const db = openSqliteContentConnection(filePath);
    try {
      await migrateSqliteContentFile(db, filePath);
      // Out of WAL, so the bytes open again as an in-memory database.
      db.$client.pragma("journal_mode = DELETE");
      return db.$client.serialize();
    } finally {
      closeSqliteConnection(db);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A fresh in-memory copy of the migrated base, foreign keys on (as a site connection has them). */
function migratedDb(): Database.Database {
  assert.ok(migratedBase !== undefined, "test.before builds the migrated base first");
  const c = new Database(migratedBase);
  c.pragma("foreign_keys = ON");
  return c;
}

/** A migrated content.db with rows that exercise every COPY escape, a jsonb and a boolean column, and an excluded table. */
function fixtureSnapshot(extra?: (c: Database.Database) => void): Buffer {
  const c = migratedDb();
  try {
    extra?.(c);
    c.prepare(
      "INSERT INTO menus (id, workspace_id, slug, title, status, doc_json, locations_json, updated_at, version) VALUES (?, 'ws', ?, ?, 'published', ?, '[]', '2026-09-27T00:00:00.000Z', 1)"
    ).run("menu-1", "main", TRICKY_TEXT, JSON.stringify({ items: [{ label: TRICKY_TEXT }] }));
    c.prepare("INSERT INTO menus (id, workspace_id, slug, title, status, doc_json, locations_json, updated_at, version) VALUES ('menu-2', 'ws', 'footer', 'Footer', 'draft', '{}', '[]', '2026-09-27T00:00:00.000Z', 2)").run();
    c.prepare(
      "INSERT INTO posts (id, workspace_id, title, slug, status, body_json, updated_at, version, overrides_theme_page) VALUES ('post-1', 'ws', 'Hello', 'hello', 'draft', '{}', '2026-09-27T00:00:00.000Z', 1, 1)"
    ).run();
    c.prepare("INSERT INTO identity_users (principal_id, workspace_id, username, password_hash) VALUES ('p1', 'ws', 'owner', 'scrypt$secret-hash')").run();
    return c.serialize();
  } finally {
    c.close();
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
    const { tables } = planSnapshotTables(source);
    const result = await runCopy({ source, target: TARGET(), tables, counts: countSourceRows(source, tables), schema: inspected.schema, marker: { site, snapshotAt }, replaceExisting: inspected.lastCopy !== null });
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
    return await runCopy({ source, target: TARGET(), tables, counts: countSourceRows(source, tables), schema, marker: { site, snapshotAt: "x" }, replaceExisting: false });
  } finally {
    source.close();
  }
}

test.before(async () => {
  migratedBase = await buildMigratedBase();
});
test.beforeEach(() => recreateDatabase(FIXTURE_DB));
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
  const initial = await copyAs(SITE, "original");
  assert.ok(initial.result.ok, JSON.stringify(initial.result));
  const { schema, result } = await copyAs(SITE, "2026-09-27T13:00:00.000Z");
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(schema, "tovu");
  assert.equal(await count("menus", "tovu"), 2);
  assert.equal(await sql(FIXTURE_DB, `SELECT count(*) FROM tovu._tovu_transfer`), "1");
});

test("cross-site wipe regression: a copy aimed at a schema holding ANOTHER site's copy is refused inside the transaction", async () => {
  const initial = await copyAs(SITE, "original");
  assert.ok(initial.result.ok, JSON.stringify(initial.result));
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
  const initial = await copyAs(SITE, "original");
  assert.ok(initial.result.ok, JSON.stringify(initial.result));
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
  const initial = await copyAs(SITE, "original");
  assert.ok(initial.result.ok, JSON.stringify(initial.result));
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
  const c = migratedDb();
  let bytes: Buffer;
  try {
    c.prepare("INSERT INTO menus (id, workspace_id, slug, title, status, doc_json, locations_json, updated_at, version) VALUES ('m', 'ws', 's', 't', 'draft', 'not json SECRET-ROW-VALUE', '[]', 'x', 1)").run();
    bytes = c.serialize();
  } finally {
    c.close();
  }
  const { schema, result } = await copyAs("bad-row", "x", bytes);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.code, "COPY_FAILED");
  assert.match(!result.ok ? result.message : "", /menus/);
  assert.doesNotMatch(JSON.stringify(result), /SECRET-ROW-VALUE/);
  assert.equal(await sql(FIXTURE_DB, `SELECT to_regnamespace('${schema}') IS NULL`), "t", "nothing may be left behind");
});

test("a count mismatch or rejected replacement preserves the earlier rows and marker", async () => {
  const original = await copyAs(SITE, "original");
  assert.ok(original.result.ok, JSON.stringify(original.result));
  await sql(FIXTURE_DB, "UPDATE tovu.menus SET title = 'original sentinel' WHERE id = 'menu-1'");
  const replacement = fixtureSnapshot();
  const source = openSqliteSnapshotSource(replacement);
  const tables = collectTransferTables();
  try {
    const counts = countSourceRows(source, tables).map((entry) => entry.table.name === "menus" ? { ...entry, rows: entry.rows + 1 } : entry);
    const result = await runCopy({ source, target: TARGET(), tables, counts, schema: "tovu", marker: { site: SITE, snapshotAt: "replacement" }, replaceExisting: true });
    assert.equal(!result.ok && result.code, "COUNT_MISMATCH");
    assert.match(!result.ok ? result.message : "", /menus/);
  } finally {
    source.close();
  }
  assert.equal(await sql(FIXTURE_DB, "SELECT title FROM tovu.menus WHERE id = 'menu-1'"), "original sentinel");
  assert.equal(await sql(FIXTURE_DB, "SELECT snapshot_at FROM tovu._tovu_transfer"), "original");

  const invalid = fixtureSnapshot((c) => {
    c.prepare("INSERT INTO menus (id, workspace_id, slug, title, status, doc_json, locations_json, updated_at, version) VALUES ('bad', 'ws', 'bad', 'bad', 'draft', 'not json', '[]', 'x', 1)").run();
  });
  const refused = await copyAs(SITE, "rejected", invalid);
  assert.equal(!refused.result.ok && refused.result.code, "COPY_FAILED");
  assert.equal(await count("menus", "tovu"), 2);
  assert.equal(await sql(FIXTURE_DB, "SELECT title FROM tovu.menus WHERE id = 'menu-1'"), "original sentinel");
  assert.equal(await sql(FIXTURE_DB, "SELECT snapshot_at FROM tovu._tovu_transfer"), "original");
});

test("a setting marked secret stays behind (values at every scope and its history); ordinary settings are copied", async () => {
  const c = migratedDb();
  let bytes: Buffer;
  try {
    const define = c.prepare(
      "INSERT INTO setting_definitions (setting_id, version, namespace, key, owner_kind, schema_json, scopes, secret, status, created_at, updated_at) VALUES (?, 1, 'test', ?, 'core', '{}', 3, ?, 'active', 'x', 'x')"
    );
    define.run("set-secret", "api_token", 1);
    define.run("set-plain", "site_title", 0);
    const value = c.prepare("INSERT INTO setting_values_global (setting_id, value_json, def_version, seq, updated_by, updated_at) VALUES (?, ?, 1, 1, 'p', 'x')");
    value.run("set-secret", JSON.stringify("SECRET-SETTING-VALUE"));
    value.run("set-plain", JSON.stringify("My site"));
    c.prepare("INSERT INTO workspaces (id, name, slug, created_at) VALUES ('scope-ws', 'Scope', 'scope', 'x')").run();
    for (const scope of ["workspace", "user"]) {
      const extraColumns = scope === "user" ? ", principal_id" : "";
      const extraValues = scope === "user" ? ", 'scope-user'" : "";
      const scopedValue = c.prepare(`INSERT INTO setting_values_${scope} (setting_id, workspace_id${extraColumns}, value_json, def_version, seq, updated_by, updated_at) VALUES (?, 'scope-ws'${extraValues}, ?, 1, 1, 'p', 'x')`);
      scopedValue.run("set-secret", JSON.stringify(`SECRET-${scope}`));
      scopedValue.run("set-plain", JSON.stringify(`Plain ${scope}`));
    }
    c.prepare(
      "INSERT INTO setting_revisions (entity_kind, setting_id, scope, op, before_json, after_json, def_version, actor, created_at) VALUES ('value', 'set-secret', 'global', 'set', NULL, ?, 1, 'p', 'x')"
    ).run(JSON.stringify("SECRET-SETTING-VALUE"));
    bytes = c.serialize();
  } finally {
    c.close();
  }
  const source = openSqliteSnapshotSource(bytes);
  const counts = countSourceRows(source, collectTransferTables());
  assert.equal(counts.find((entry) => entry.table.name === "setting_values_global")?.rows, 1);
  assert.equal(counts.find((entry) => entry.table.name === "setting_revisions")?.rows, 0);
  for (const scope of ["workspace", "user"]) assert.equal(counts.find((entry) => entry.table.name === `setting_values_${scope}`)?.rows, 1);
  assert.deepEqual(countPartialExclusions(source).filter((entry) => entry.rows > 0), [
    { table: "setting_values_global", rows: 1, reason: "settings marked secret, and their history, are not copied" },
    { table: "setting_values_workspace", rows: 1, reason: "settings marked secret, and their history, are not copied" },
    { table: "setting_values_user", rows: 1, reason: "settings marked secret, and their history, are not copied" },
    { table: "setting_revisions", rows: 1, reason: "settings marked secret, and their history, are not copied" },
  ]);
  source.close();
  const { schema, result } = await copyAs("settings-site", "x", bytes);
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(await sql(FIXTURE_DB, `SELECT setting_id FROM "${schema}".setting_values_global`), "set-plain");
  for (const scope of ["workspace", "user"]) {
    assert.equal(await sql(FIXTURE_DB, `SELECT setting_id || ' ' || (value_json #>> '{}') FROM "${schema}".setting_values_${scope}`), `set-plain Plain ${scope}`);
  }
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

/** The Postgres schema's own declarations for the tables a copy carries, for comparison. */
function declaredFor(copied: ReadonlySet<string>) {
  const out = { indexes: 0, foreignKeys: 0, checks: 0 };
  for (const table of Object.values(pgSchema) as unknown[]) {
    if (table === null || typeof table !== "object" || !(Symbol.for("drizzle:IsDrizzleTable") in table)) continue;
    const cfg = getTableConfig(table as PgTable);
    if (!copied.has(cfg.name)) continue;
    const hasPrimaryKey = cfg.columns.some((column) => column.primary) || cfg.primaryKeys.length > 0;
    out.indexes += cfg.indexes.length + (hasPrimaryKey ? 1 : 0) + cfg.columns.filter((column) => column.isUnique).length;
    out.foreignKeys += cfg.foreignKeys.filter((fk) => copied.has(getTableConfig(fk.reference().foreignTable).name)).length;
    out.checks += cfg.checks.length;
  }
  return out;
}

test("T1: the copy carries the schema's indexes, foreign keys, checks, defaults and identity columns, and new rows number after the copied ones", async () => {
  const bytes = fixtureSnapshot((c) => {
    const attempt = c.prepare("INSERT INTO agent_tool_attempts (id, attempt_id, workspace_id, run_id, tool_id, principal_id, phase, at) VALUES (?, ?, 'ws', 'r', 't', 'p', 'start', 'x')");
    attempt.run(5, "a5");
    attempt.run(7, "a7");
  });
  const { schema, result } = await copyAs("ddl-site", "x", bytes);
  assert.ok(result.ok, JSON.stringify(result));
  assert.deepEqual(result.unvalidatedConstraints, []);
  const copied = new Set(result.tables.map((table) => table.name));
  const declared = declaredFor(copied);
  const q = (text: string) => sql(FIXTURE_DB, text);
  assert.equal(Number(await q(`SELECT count(*) FROM pg_indexes WHERE schemaname = '${schema}' AND tablename <> '_tovu_transfer'`)), declared.indexes);
  assert.equal(Number(await q(`SELECT count(*) FROM pg_constraint WHERE connamespace = '${schema}'::regnamespace AND contype = 'f'`)), declared.foreignKeys);
  assert.equal(Number(await q(`SELECT count(*) FROM pg_constraint WHERE connamespace = '${schema}'::regnamespace AND contype = 'c'`)), declared.checks);
  assert.equal(await q(`SELECT indexdef LIKE 'CREATE UNIQUE INDEX%' FROM pg_indexes WHERE schemaname = '${schema}' AND indexname = 'pk_setting_values_workspace'`), "t");
  assert.equal(await q(`SELECT column_default FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = 'setting_values_global' AND column_name = 'state'`), "'set'::text");
  assert.equal(await q(`SELECT is_identity || ' ' || identity_generation FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = 'agent_tool_attempts' AND column_name = 'id'`), "YES ALWAYS");
  assert.equal(await q(`INSERT INTO "${schema}".agent_tool_attempts (attempt_id, workspace_id, run_id, tool_id, principal_id, phase, at) VALUES ('new', 'ws', 'r', 't', 'p', 'start', 'x') RETURNING id`), "8");
  await assert.rejects(q(`INSERT INTO "${schema}".commerce_orders (id, workspace_id, status, currency, total_amount_cents, created_at, updated_at) VALUES ('o', 'ws', 'bogus', 'usd', 1, 'x', 'x')`), /violates/);
});

test("T1: a source row whose parent is missing does not stop the copy; that foreign key is kept unvalidated and named in the result", async () => {
  const bytes = fixtureSnapshot((c) => {
    c.pragma("foreign_keys = OFF");
    c.prepare("INSERT INTO setting_values_workspace (setting_id, workspace_id, value_json, def_version, seq, updated_by, updated_at) VALUES ('s', 'no-such-workspace', '1', 1, 1, 'p', 'x')").run();
  });
  const { schema, result } = await copyAs("orphan-site", "x", bytes);
  assert.ok(result.ok, JSON.stringify(result));
  assert.deepEqual(result.unvalidatedConstraints, ["setting_values_workspace.setting_values_workspace_workspace_id_workspaces_id_fk"]);
  assert.equal(await sql(FIXTURE_DB, `SELECT convalidated FROM pg_constraint WHERE connamespace = '${schema}'::regnamespace AND conname = 'setting_values_workspace_workspace_id_workspaces_id_fk'`), "f");
  assert.equal(await count("setting_values_workspace", schema), 1);
});

test("T2: every table in the snapshot is copied or left out with a reason; a plugin's tables are copied from the snapshot's own layout", async () => {
  const blob = Buffer.from([0, 1, 2, 254, 255, 92, 10]);
  const bytes = fixtureSnapshot((c) => {
    c.exec("CREATE TABLE p_demo__items (id INTEGER PRIMARY KEY, title TEXT NOT NULL, data BLOB, score REAL, status TEXT NOT NULL DEFAULT 'new')");
    c.exec("CREATE INDEX idx_p_demo__items_title ON p_demo__items (title)");
    c.exec("CREATE TABLE p_demo__links (id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL REFERENCES p_demo__items(id) ON DELETE CASCADE, url TEXT UNIQUE)");
    c.exec("CREATE TABLE p_demo__tokens (id INTEGER PRIMARY KEY, token_hash TEXT NOT NULL)");
    c.prepare("INSERT INTO p_demo__items (id, title, data, score) VALUES (3, 'Three', ?, 1.5)").run(blob);
    c.prepare("INSERT INTO p_demo__links (id, item_id, url) VALUES (1, 3, 'https://x')").run();
    c.prepare("INSERT INTO p_demo__tokens (id, token_hash) VALUES (1, 'SECRET-TOKEN-HASH')").run();
  });
  const source = openSqliteSnapshotSource(bytes);
  const inventory = planSnapshotTables(source);
  const all = source.tableNames();
  source.close();
  const copied = new Set(inventory.tables.map((table) => table.name));
  const leftOut = new Map(inventory.leftOut.map((entry) => [entry.table, entry.reason]));
  assert.deepEqual(all.filter((name) => !copied.has(name) && !leftOut.has(name)), [], "a table on neither list");
  assert.deepEqual(all.filter((name) => copied.has(name) && leftOut.has(name)), [], "a table on both lists");
  assert.ok(copied.has("p_demo__items") && copied.has("p_demo__links"));
  assert.equal(leftOut.get("p_demo__tokens"), "tables holding passwords, keys or sign-in tokens are not copied");
  assert.equal(leftOut.get("post_search_fts"), "search indexes are rebuilt from the content, not copied");
  assert.equal(leftOut.get("post_search_document"), "search indexes are rebuilt from the content, not copied");
  assert.equal(leftOut.get("__drizzle_migrations"), "the database's own bookkeeping is not copied");
  // The target runs its own migration runner; a copied SQLite ledger would tell it steps had run there.
  assert.equal(leftOut.get("tovu_migrations"), "the database's own bookkeeping is not copied");

  const { schema, result } = await copyAs("plugin-site", "x", bytes);
  assert.ok(result.ok, JSON.stringify(result));
  const q = (text: string) => sql(FIXTURE_DB, text);
  assert.equal(await q(`SELECT title || ' ' || encode(data, 'hex') || ' ' || score || ' ' || status FROM "${schema}".p_demo__items`), `Three ${blob.toString("hex")} 1.5 new`);
  assert.equal(await q(`INSERT INTO "${schema}".p_demo__items (title) VALUES ('next') RETURNING id`), "4");
  assert.equal(await q(`SELECT count(*) FROM pg_indexes WHERE schemaname = '${schema}' AND tablename LIKE 'p_demo__%'`), "4", "two primary keys, the title index and the url unique");
  assert.equal(await q(`SELECT confdeltype FROM pg_constraint WHERE connamespace = '${schema}'::regnamespace AND conrelid = '"${schema}".p_demo__links'::regclass AND contype = 'f'`), "c");
  assert.equal(await q(`SELECT to_regclass('"${schema}".p_demo__tokens') IS NULL`), "t");
});

test("an unconfirmed first-copy plan cannot overwrite a copy created since planning", async () => {
  const original = await copyAs(SITE, "first-copy-sentinel");
  assert.equal(original.result.ok, true);
  const menusBefore = await count("menus", "tovu");
  assert.equal(menusBefore, 2);
  const result = await copyInto(original.schema, SITE);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.code, "COPY_FAILED");
  assert.equal(await sql(FIXTURE_DB, "SELECT snapshot_at FROM tovu._tovu_transfer"), "first-copy-sentinel");
  // The fixture snapshot holds two menus; the refused copy must leave the original copy's rows as they were.
  assert.equal(await count("menus", "tovu"), menusBefore);
});
