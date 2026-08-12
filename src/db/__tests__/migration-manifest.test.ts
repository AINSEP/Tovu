/**
 * @file Pure-logic tests for `src/db/migration/manifest.ts` and `verify.ts` — no live database.
 *
 * Live-Postgres proof of the semantics these classifications rest on (int4 vs int8 capacity,
 * identity reseeding, the timestamp-timezone ambiguity, the JSON-in-plain-text gap) lives in
 * `migration-manifest-postgres.test.ts`. This file is everything that can be proven without a
 * server: that the manifest's classification covers the real schema completely and without drift,
 * and that `verify.ts`'s pure checks accept/reject the right shapes.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { getTableConfig } from "drizzle-orm/sqlite-core";

import type { ColumnDecl } from "../../features/plugins/data-module";
import {
  assertIdentifierFits,
  classifyAllCoreColumns,
  classifyPluginColumn,
  collectCoreTables,
  collectIdentityColumns,
  DERIVED_OBJECTS,
  isJsonColumnName,
  isTimestampColumnName,
  reseedSequenceSql,
  REVIEWED_INTEGER_ID_COLUMNS,
  WATERMARK_IS_NOT_A_MIGRATION_BOUNDARY,
} from "../migration/manifest";
import { verifyBooleanCopy, verifyClassifiedValue, verifyJsonText, verifyUtcTimestampText } from "../migration/verify";

const SCHEMA_SOURCE = fs.readFileSync(path.resolve(__dirname, "../schema.ts"), "utf8");

test("classifying every column of every core table does not throw — the real schema has no case this manifest hasn't reviewed", () => {
  const all = classifyAllCoreColumns();
  assert.ok(all.length > 500, `sanity: expected several hundred columns, got ${all.length}`);
});

test("REVIEWED_INTEGER_ID_COLUMNS has no stale entries — every key names a real column in schema.ts today", () => {
  const all = classifyAllCoreColumns();
  const real = new Set(all.map((c) => `${c.sqlTableName}.${c.sqlColumnName}`));
  const stale = Object.keys(REVIEWED_INTEGER_ID_COLUMNS).filter((key) => !real.has(key));
  assert.deepEqual(stale, [], "REVIEWED_INTEGER_ID_COLUMNS names a column that no longer exists — update the registry");
});

test("bigint-id classification matches exactly the handoff's named categories: 7 revision logs, tool attempts, analytics events, the watermark", () => {
  const all = classifyAllCoreColumns();
  const bigintIds = all.filter((c) => c.columnClass.kind === "bigint-id").map((c) => `${c.sqlTableName}.${c.sqlColumnName}`);
  assert.deepEqual(
    new Set(bigintIds),
    new Set([
      "setting_revisions.seq",
      "redirect_revisions.id",
      "member_revisions.seq",
      "newsletter_campaign_revisions.seq",
      "content_type_revisions.seq",
      "entry_revisions.seq",
      "taxonomy_revisions.seq",
      "agent_tool_attempts.id",
      "analytics_events.id",
      "database_write_watermark.value",
    ])
  );
});

test("int4-safe-id classification covers exactly the two bounded join/reference tables, not silently omitted", () => {
  const all = classifyAllCoreColumns();
  const int4SafeIds = all.filter((c) => c.columnClass.kind === "int4-safe-id").map((c) => `${c.sqlTableName}.${c.sqlColumnName}`);
  assert.deepEqual(new Set(int4SafeIds), new Set(["entry_refs.id", "entry_terms.id"]));
});

test("every autoincrement identity column is covered by identity reseeding, independent of its bigint-vs-int4 classification", () => {
  const identity = collectIdentityColumns().map((c) => `${c.sqlTableName}.${c.sqlColumnName}`);
  // The union of bigint-id + int4-safe-id autoincrement PKs (database_write_watermark.value is a
  // reviewed bigint-id but NOT an autoincrement PK, so it is deliberately excluded here).
  const expected = new Set([
    "setting_revisions.seq",
    "redirect_revisions.id",
    "member_revisions.seq",
    "newsletter_campaign_revisions.seq",
    "content_type_revisions.seq",
    "entry_revisions.seq",
    "taxonomy_revisions.seq",
    "agent_tool_attempts.id",
    "analytics_events.id",
    "entry_refs.id",
    "entry_terms.id",
  ]);
  assert.deepEqual(new Set(identity), expected);
  assert.equal(identity.length, 11, "expected exactly 11 autoincrement primary keys in the core schema");
});

test("boolean-flag classification matches exactly the 3 SQLiteBoolean columns in schema.ts, not the many plain-integer 0/1 flags", () => {
  const all = classifyAllCoreColumns();
  const booleans = all.filter((c) => c.columnClass.kind === "boolean-flag").map((c) => `${c.sqlTableName}.${c.sqlColumnName}`);
  assert.deepEqual(new Set(booleans), new Set(["posts.overrides_theme_page", "plugin_activations.enabled", "external_mcp_servers.enabled"]));

  // Plain-integer 0/1-shaped flags get NO transform (correct passthrough) — confirm they are
  // classified plain-integer, not accidentally swept into boolean-flag by a looser name-based rule.
  const plainIntegers = new Set(all.filter((c) => c.columnClass.kind === "plain-integer").map((c) => `${c.sqlTableName}.${c.sqlColumnName}`));
  for (const flagLike of ["redirect_revisions.tombstoned", "taxonomies.hierarchical", "policies.is_builtin", "policies.is_frozen", "member_tiers.visible_in_portal"]) {
    assert.ok(plainIntegers.has(flagLike), `expected "${flagLike}" to be plain-integer (declared without {mode:"boolean"})`);
  }
});

test("json-text classification matches an independent textual scan of schema.ts for *_json columns", () => {
  // Independent oracle: regexes directly over the source text, not through Drizzle introspection —
  // a different code path from classifyAllCoreColumns()'s getTableConfig() walk, so this cannot pass
  // merely because the same bug is present in both places.
  const declared = new Set([...SCHEMA_SOURCE.matchAll(/text\("([a-z0-9_]*_json)"\)/g)].map((m) => m[1]));
  // Distinct NAMES, not occurrences — "state_json"/"value_json"/"before_json" etc. each repeat
  // across several tables, so this is well under the 37 total json-text columns classifyAllCoreColumns()
  // finds; the deepEqual below is what actually proves per-occurrence agreement via classifyAllCoreColumns.
  assert.ok(declared.size > 20, `sanity: expected 20+ distinct *_json column names, got ${declared.size}`);

  const all = classifyAllCoreColumns();
  const classified = new Set(all.filter((c) => c.columnClass.kind === "json-text").map((c) => c.sqlColumnName));
  assert.deepEqual(classified, declared);
});

test("utc-timestamp-text classification matches an independent textual scan of schema.ts for *_at / bare 'at' columns, excluding *_at_capture snapshot columns", () => {
  const declared = new Set(
    [...SCHEMA_SOURCE.matchAll(/text\("([a-z0-9_]+)"\)/g)].map((m) => m[1]).filter((name) => name === "at" || name.endsWith("_at"))
  );
  // Distinct NAMES, not occurrences — "created_at"/"updated_at" alone account for dozens of the 98
  // total utc-timestamp-text columns classifyAllCoreColumns() finds; the deepEqual below proves
  // per-occurrence agreement via classifyAllCoreColumns, this is just the independent-oracle sanity floor.
  assert.ok(declared.size > 25, `sanity: expected 25+ distinct timestamp-shaped column names, got ${declared.size}`);
  // The two known trap cases: "from_path_at_capture"/"to_path_at_capture" contain "_at_" but do not
  // END in "_at" (they end "_capture") — confirm the independent oracle itself excludes them, so this
  // test cannot pass by accident if isTimestampColumnName's own exclusion regressed.
  assert.ok(!declared.has("from_path_at_capture") && !declared.has("to_path_at_capture"));

  const all = classifyAllCoreColumns();
  const classified = new Set(all.filter((c) => c.columnClass.kind === "utc-timestamp-text").map((c) => c.sqlColumnName));
  assert.deepEqual(classified, declared);
});

test("isTimestampColumnName: bare 'at' and '*_at' match; '*_at_capture' point-in-time snapshots do not", () => {
  assert.equal(isTimestampColumnName("at"), true);
  assert.equal(isTimestampColumnName("created_at"), true);
  assert.equal(isTimestampColumnName("last_hit_at"), true);
  assert.equal(isTimestampColumnName("from_path_at_capture"), false);
  assert.equal(isTimestampColumnName("format"), false);
});

test("isJsonColumnName: '*_json' matches, unrelated columns do not", () => {
  assert.equal(isJsonColumnName("body_json"), true);
  assert.equal(isJsonColumnName("event_props_json"), true);
  assert.equal(isJsonColumnName("json"), false);
  assert.equal(isJsonColumnName("body_html"), false);
});

test("reseedSequenceSql produces a setval statement using pg_get_serial_sequence and the empty-table-safe 3-arg form", () => {
  const sql = reseedSequenceSql("analytics_events", "id");
  assert.match(sql, /setval\(pg_get_serial_sequence\('analytics_events', 'id'\)/);
  assert.match(sql, /COALESCE\(\(SELECT max\(id\) FROM analytics_events\), 1\)/);
  assert.match(sql, /\(SELECT max\(id\) FROM analytics_events\) IS NOT NULL/);
});

test("reseedSequenceSql rejects an over-long identifier rather than emitting SQL Postgres would silently truncate", () => {
  const tooLong = "a".repeat(64);
  assert.throws(() => reseedSequenceSql(tooLong, "id"), /64 bytes, exceeding PostgreSQL's 63-byte/);
});

test("assertIdentifierFits: every real table and column identifier in the source schema fits in 63 bytes today", () => {
  for (const { table } of collectCoreTables()) {
    const cfg = getTableConfig(table);
    assert.doesNotThrow(() => assertIdentifierFits(cfg.name, "table name"));
    for (const col of cfg.columns) assert.doesNotThrow(() => assertIdentifierFits(col.name, "column name"));
  }
});

test("DERIVED_OBJECTS names post_search_fts as never-copy-rows", () => {
  const fts = DERIVED_OBJECTS.find((d) => d.name === "post_search_fts");
  assert.ok(fts);
  assert.equal(fts?.copyPolicy, "never-copy-rows");
  assert.equal(fts?.kind, "fts5-virtual-table");
});

test("WATERMARK_IS_NOT_A_MIGRATION_BOUNDARY is exported as a truthy guard, not silently absent", () => {
  assert.equal(WATERMARK_IS_NOT_A_MIGRATION_BOUNDARY, true);
});

// --- classifyPluginColumn -----------------------------------------------------------------------

test("classifyPluginColumn: INTEGER + primaryKey is identity-int (SQLite INTEGER PRIMARY KEY has no AUTOINCREMENT signal to check)", () => {
  const decl: ColumnDecl = { name: "id", type: "INTEGER", primaryKey: true };
  const result = classifyPluginColumn(decl);
  assert.equal(result.kind, "identity-int");
});

test("classifyPluginColumn: INTEGER without primaryKey is plain-integer", () => {
  assert.deepEqual(classifyPluginColumn({ name: "count", type: "INTEGER" }), { kind: "plain-integer" });
});

test("classifyPluginColumn: TEXT columns follow the same *_json / *_at naming conventions as core schema", () => {
  assert.equal(classifyPluginColumn({ name: "payload_json", type: "TEXT" }).kind, "json-text");
  assert.equal(classifyPluginColumn({ name: "created_at", type: "TEXT" }).kind, "utc-timestamp-text");
  assert.equal(classifyPluginColumn({ name: "label", type: "TEXT" }).kind, "plain-text");
});

test("classifyPluginColumn: REAL and BLOB pass through as their own kinds", () => {
  assert.equal(classifyPluginColumn({ name: "score", type: "REAL" }).kind, "real");
  assert.equal(classifyPluginColumn({ name: "payload", type: "BLOB" }).kind, "blob");
});

// --- verify.ts -------------------------------------------------------------------------------

test("verifyUtcTimestampText: accepts Z and numeric-offset forms, rejects naive-local, rejects null-pass-through", () => {
  assert.equal(verifyUtcTimestampText("2026-08-12T10:00:00Z"), null);
  assert.equal(verifyUtcTimestampText("2026-08-12T10:00:00+00:00"), null);
  assert.equal(verifyUtcTimestampText(null), null);
  const naive = verifyUtcTimestampText("2026-08-12T10:00:00");
  assert.equal(naive?.code, "NAIVE_LOCAL_TIMESTAMP");
  const garbage = verifyUtcTimestampText("not-a-date Z");
  assert.equal(garbage?.code, "UNPARSEABLE_TIMESTAMP");
});

test("verifyJsonText: accepts valid JSON and null, rejects malformed JSON", () => {
  assert.equal(verifyJsonText('{"a":1}'), null);
  assert.equal(verifyJsonText("[]"), null);
  assert.equal(verifyJsonText(null), null);
  assert.equal(verifyJsonText("{not valid json")?.code, "INVALID_JSON");
});

test("verifyBooleanCopy: 0->false and 1->true are accepted; a mismatch and a non-0/1 source both fail with distinct codes", () => {
  assert.equal(verifyBooleanCopy(1, true), null);
  assert.equal(verifyBooleanCopy(0, false), null);
  assert.equal(verifyBooleanCopy(1, false)?.code, "BOOLEAN_COPY_MISMATCH");
  assert.equal(verifyBooleanCopy(2, true)?.code, "INVALID_SQLITE_BOOLEAN_SOURCE");
});

test("verifyClassifiedValue dispatches to the right check per column kind, and passes id/plain kinds unconditionally", () => {
  assert.equal(verifyClassifiedValue({ kind: "json-text" }, null, '{"a":1}'), null);
  assert.equal(verifyClassifiedValue({ kind: "json-text" }, null, "{bad")?.code, "INVALID_JSON");
  assert.equal(verifyClassifiedValue({ kind: "utc-timestamp-text" }, null, "2026-08-12T10:00:00Z"), null);
  assert.equal(verifyClassifiedValue({ kind: "boolean-flag" }, 1, true), null);
  assert.equal(verifyClassifiedValue({ kind: "bigint-id", rationale: "x" }, 1, 1), null);
  assert.equal(verifyClassifiedValue({ kind: "int4-safe-id", rationale: "x" }, 1, 1), null);
  assert.equal(verifyClassifiedValue({ kind: "plain-integer" }, 1, 1), null);
  assert.equal(verifyClassifiedValue({ kind: "plain-text" }, "x", "x"), null);
});
