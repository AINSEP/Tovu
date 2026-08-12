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
import { getTableConfig as getPgTableConfig } from "drizzle-orm/pg-core";

import type { ColumnDecl } from "../../features/plugins/data-module";
import {
  assertIdentifierFits,
  classifyAllCoreColumns,
  classifyPluginColumn,
  collectCoreTables,
  collectForeignKeyEdges,
  collectIdentityColumns,
  computeCoreTableCopyOrder,
  DERIVED_OBJECTS,
  type ForeignKeyEdge,
  IDENTITY_COLUMN_INSERT_OVERRIDE,
  isJsonColumnName,
  isTimestampColumnName,
  PG_BIGINT53_SAFE_INTEGER_CEILING,
  reseedSequenceSql,
  REVIEWED_INTEGER_ID_COLUMNS,
  TableCopyOrderCycleError,
  TIMESTAMP_ORDERING_REQUIRES_CANONICAL_Z,
  topologicalTableCopyOrder,
  WATERMARK_IS_NOT_A_MIGRATION_BOUNDARY,
} from "../migration/manifest";
import { verifyBooleanCopy, verifyClassifiedValue, verifyExactTextCopy, verifyJsonText, verifyUtcTimestampText } from "../migration/verify";
import * as pgSchema from "../schema.postgres";

const SCHEMA_SOURCE = fs.readFileSync(path.resolve(__dirname, "../schema.ts"), "utf8");

test("classifying every column of every core table does not throw — the real schema has no case this manifest hasn't reviewed", () => {
  const all = classifyAllCoreColumns();
  assert.ok(all.length > 500, `sanity: expected several hundred columns, got ${all.length}`);
});

/**
 * Every column of every core table, derived DIRECTLY via `getTableConfig()` — deliberately NOT via
 * `classifyAllCoreColumns()`/`classifyCoreColumn()`, which throws for any autoincrement PK missing
 * from `REVIEWED_INTEGER_ID_COLUMNS` (a deliberate fail-loud design this fix must not weaken — see
 * that registry's own doc). GATE A and the "stale entries" GATE B check below used to both call
 * `classifyAllCoreColumns()` for their column list, which meant a single classifier gap crashed both
 * gates identically — no differentiated signal about which invariant actually broke. This helper
 * gives both an independent path to the same raw facts (LOW #10 in the 2026-08-12 audit); the very
 * first test above is what still exercises — and is allowed to be taken down by — the throwing path.
 */
function rawCoreColumns(): Array<{ exportName: string; sqlTableName: string; sqlColumnName: string; columnType: string }> {
  const out: Array<{ exportName: string; sqlTableName: string; sqlColumnName: string; columnType: string }> = [];
  for (const { exportName, table } of collectCoreTables()) {
    const cfg = getTableConfig(table);
    for (const col of cfg.columns) out.push({ exportName, sqlTableName: cfg.name, sqlColumnName: col.name, columnType: col.columnType });
  }
  return out;
}

// --- GATE A: physical-type completeness, checked against the generated schema.postgres.ts --------
// Two independent gates prove the 64-bit-ID story, deliberately not covering for each other: GATE A
// (below) proves the ACTUAL Postgres output is universally safe (bigint, zero exceptions), and GATE B
// (further down) proves this manifest's growth-class review is complete. Either could pass while the
// other fails — e.g. a generator regression could reintroduce an `integer` column while every PK is
// still correctly reviewed here, or a new autoincrement PK could land unreviewed while the generator
// still happens to widen it anyway. Neither gate is redundant with the other.

const DRIZZLE_IS_TABLE = Symbol.for("drizzle:IsDrizzleTable");

function pgTablesByExportName(): Map<string, object> {
  return new Map(
    Object.entries(pgSchema)
      .filter(([, v]) => Boolean(v && typeof v === "object" && (v as Record<symbol, unknown>)[DRIZZLE_IS_TABLE]))
      .map(([exportName, table]) => [exportName, table as object])
  );
}

test("GATE A: every SQLiteInteger column in schema.ts maps to a bigint column in the generated schema.postgres.ts, with zero exceptions", () => {
  // Derived via rawCoreColumns() (raw getTableConfig() walk), NOT classifyAllCoreColumns() — this
  // gate is about physical type, independent of growth-class review completeness (see that helper's
  // own doc / LOW #10: a classifier throw on an unreviewed PK must not also take this gate down).
  const sqliteIntegerColumns = rawCoreColumns().filter((c) => c.columnType === "SQLiteInteger");
  assert.ok(sqliteIntegerColumns.length > 60, `sanity: expected 60+ SQLiteInteger columns, got ${sqliteIntegerColumns.length}`);

  const pgTables = pgTablesByExportName();
  const violations: string[] = [];
  for (const col of sqliteIntegerColumns) {
    const pgTable = pgTables.get(col.exportName);
    if (!pgTable) {
      violations.push(`${col.sqlTableName}: no generated Postgres table found for export "${col.exportName}"`);
      continue;
    }
    const pgCol = getPgTableConfig(pgTable as never).columns.find((c) => c.name === col.sqlColumnName);
    if (!pgCol) {
      violations.push(`${col.sqlTableName}.${col.sqlColumnName}: missing from the generated table entirely`);
    } else if (pgCol.columnType !== "PgBigInt53") {
      violations.push(`${col.sqlTableName}.${col.sqlColumnName}: generated as ${pgCol.columnType}, not bigint`);
    }
  }
  assert.deepEqual(violations, [], "every SQLiteInteger column must generate as bigint in schema.postgres.ts, with zero exceptions");
});

// --- GATE B: growth-class review completeness, independent of the generated schema ----------------

test("GATE B: REVIEWED_INTEGER_ID_COLUMNS has no stale entries — every key names a real column in schema.ts today", () => {
  // Derived via rawCoreColumns(), NOT classifyAllCoreColumns() — same independence rationale as
  // GATE A above (LOW #10).
  const real = new Set(rawCoreColumns().map((c) => `${c.sqlTableName}.${c.sqlColumnName}`));
  const stale = Object.keys(REVIEWED_INTEGER_ID_COLUMNS).filter((key) => !real.has(key));
  assert.deepEqual(stale, [], "REVIEWED_INTEGER_ID_COLUMNS names a column that no longer exists — update the registry");
});

test("GATE B: every autoincrement PK in schema.ts is assigned exactly one growth class ('unbounded' or 'bounded') — none unreviewed", () => {
  const identityKeys = collectIdentityColumns().map((c) => `${c.sqlTableName}.${c.sqlColumnName}`);
  assert.ok(identityKeys.length > 0, "sanity: expected at least one autoincrement PK");
  for (const key of identityKeys) {
    const review = REVIEWED_INTEGER_ID_COLUMNS[key];
    assert.ok(review, `autoincrement PK "${key}" has no growth-class review in REVIEWED_INTEGER_ID_COLUMNS`);
    assert.ok(review.growthClass === "unbounded" || review.growthClass === "bounded", `"${key}" has an invalid growth class`);
  }
});

test("growth class 'unbounded' matches exactly the handoff's named risk categories: 7 revision logs, tool attempts, analytics events, the watermark", () => {
  const all = classifyAllCoreColumns();
  const unbounded = all
    .filter((c) => c.columnClass.kind === "reviewed-id" && c.columnClass.growthClass === "unbounded")
    .map((c) => `${c.sqlTableName}.${c.sqlColumnName}`);
  assert.deepEqual(
    new Set(unbounded),
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

test("growth class 'bounded' covers exactly the two bounded join/reference tables, not silently omitted", () => {
  const all = classifyAllCoreColumns();
  const bounded = all
    .filter((c) => c.columnClass.kind === "reviewed-id" && c.columnClass.growthClass === "bounded")
    .map((c) => `${c.sqlTableName}.${c.sqlColumnName}`);
  assert.deepEqual(new Set(bounded), new Set(["entry_refs.id", "entry_terms.id"]));
});

test("every autoincrement identity column is covered by identity reseeding, independent of its growth class or generated column width", () => {
  const identity = collectIdentityColumns().map((c) => `${c.sqlTableName}.${c.sqlColumnName}`);
  // The union of unbounded + bounded autoincrement PKs (database_write_watermark.value is a
  // reviewed "unbounded" column but NOT an autoincrement PK, so it is deliberately excluded here).
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

test("entry_revisions.seq's rationale correctly scopes to entries, not posts — features/post/repo.sqlite.ts never writes entry_revisions (LOW #12 correction)", () => {
  const rationale = REVIEWED_INTEGER_ID_COLUMNS["entry_revisions.seq"]?.rationale ?? "";
  assert.ok(rationale.includes("features/entries/repo.sqlite.ts"), "rationale should name the actual writer");
  assert.ok(!/entry\/post save/.test(rationale), "rationale must not repeat the false 'every entry/post save' claim");
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

// LEDGER #14 (2026-08-12 audit, partially-resolved by the previous round): this "independent" oracle
// filters with `name.endsWith("_json")` — the SAME suffix rule isJsonColumnName() itself encodes,
// just re-typed by hand rather than called. Exactly the same coupling the timestamp oracle two tests
// below used to have (see that test's own LOW #14 comment) — it proves classifyAllCoreColumns()
// faithfully APPLIES the rule to every real column, not that the rule is EXHAUSTIVE over which
// columns are semantically JSON. A JSON column named outside the *_json convention (e.g.
// "settings_payload") would classify plain-text, skip JSON validation entirely, and this test would
// stay green right alongside the bug. The genuinely independent test immediately below closes this
// half of #14 the same way the timestamp half was already closed: by reading a DIFFERENT naming
// convention (schema.ts's camelCase TS property names) against a DIFFERENT substring of the source.
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

test("json-text classification agrees with a GENUINELY independent oracle: schema.ts's camelCase TS property names ('*Json' convention) vs its snake_case SQL names ('_json' convention) never disagree on a single column", () => {
  // Mirrors the timestamp version of this test below, closing LEDGER #14's JSON half the same way
  // its timestamp half was already closed. Different signal from the coupled test above: this reads
  // the TS property name (left of the colon, e.g. `bodyJson` in `bodyJson: text("body_json")`) via
  // its own regex against a different substring of the source, then applies its OWN "is this JSON"
  // predicate to that different string. A bug in the *_json convention itself that the SQL-name
  // oracle above cannot see would only also fool THIS test if schema.ts's two independent naming
  // conventions had themselves drifted apart on that exact column — a real, checkable fact about the
  // schema's own naming discipline, not a restatement of the implementation. Manually verified before
  // writing this test: every `*Json: text("*_json")` declaration in schema.ts pairs up cleanly today
  // (no TS `*Json` name lacks a matching `_json` SQL name, and no `_json` SQL name lacks a matching
  // TS `*Json` name) — the pairing genuinely holds for JSON the same way it holds for timestamps.
  const pairs = [...SCHEMA_SOURCE.matchAll(/([A-Za-z_$][\w$]*):\s*text\("([a-z0-9_]+)"\)/g)].map((m) => ({ tsName: m[1], sqlName: m[2] }));
  assert.ok(pairs.length > 400, `sanity: expected 400+ text(...) column declarations, got ${pairs.length}`);

  const sqlSaysJson = (sqlName: string) => sqlName.endsWith("_json");
  const tsSaysJson = (tsName: string) => tsName.endsWith("Json");

  const disagreements = pairs.filter((p) => sqlSaysJson(p.sqlName) !== tsSaysJson(p.tsName));
  assert.deepEqual(
    disagreements,
    [],
    "schema.ts's SQL name and TS property name disagree about whether a column is JSON for at least one column"
  );
});

// LOW #14 (2026-08-12 audit): this "independent" oracle filters with `name === "at" || name.endsWith("_at")`
// — the SAME predicate isTimestampColumnName() itself encodes, just re-typed by hand rather than
// called. That proves classifyAllCoreColumns() faithfully APPLIES the rule to every real column (a
// real and worthwhile thing to prove — it catches, for example, a dispatch bug that called the wrong
// helper for one column kind); it does NOT prove the RULE is exhaustive over which columns are
// semantically timestamps. If isTimestampColumnName's *convention itself* were wrong (missed a real
// timestamp column named some other way, or wrongly caught a non-timestamp *_at column), this test
// and the implementation would agree with each other and both be wrong the same way — an exhaustive
// hand-built ground-truth list (~400 entries) would close that gap but was rejected as worse than the
// problem it solves (a large, drift-prone list nobody keeps current). The TS-property-name test
// immediately below is the cheaper, genuinely independent check that DOES catch one real class of
// rule-level bug: the SQL name and TS name conventions silently disagreeing about a specific column.
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

test("utc-timestamp-text classification agrees with a GENUINELY independent oracle: schema.ts's camelCase TS property names ('*At' convention) vs its snake_case SQL names ('_at' convention) never disagree on a single column", () => {
  // Different signal from the test above: this reads the TS property name (left of the colon, e.g.
  // `createdAt` in `createdAt: text("created_at")`) via its own regex against a different substring
  // of the source, then applies its OWN "is this a timestamp name" predicate to that different
  // string. A bug in isTimestampColumnName's underlying convention that this file's SQL-name oracle
  // cannot see (see the doc above) would only also fool THIS test if schema.ts's two independent
  // naming conventions had themselves drifted apart on that exact column — a real, checkable fact
  // about the schema's own naming discipline, not a restatement of the implementation.
  const pairs = [...SCHEMA_SOURCE.matchAll(/([A-Za-z_$][\w$]*):\s*text\("([a-z0-9_]+)"\)/g)].map((m) => ({ tsName: m[1], sqlName: m[2] }));
  assert.ok(pairs.length > 400, `sanity: expected 400+ text(...) column declarations, got ${pairs.length}`);

  const sqlSaysTimestamp = (sqlName: string) => sqlName === "at" || sqlName.endsWith("_at");
  const tsSaysTimestamp = (tsName: string) => tsName === "at" || tsName.endsWith("At");

  const disagreements = pairs.filter((p) => sqlSaysTimestamp(p.sqlName) !== tsSaysTimestamp(p.tsName));
  assert.deepEqual(
    disagreements,
    [],
    "schema.ts's SQL name and TS property name disagree about whether a column is a timestamp for at least one column"
  );
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

test("reseedSequenceSql produces a setval statement using pg_get_serial_sequence, GREATEST-clamped to the sequence's minimum of 1", () => {
  // BLOCKER #2 (2026-08-12 audit): the OLD shape — COALESCE(max, 1), (max IS NOT NULL) — passed
  // max(id) straight through as both the target value and the is_called flag, so a table containing
  // only non-positive ids (SQLite's INTEGER PRIMARY KEY AUTOINCREMENT accepts 0 and negative values)
  // produced e.g. `setval(seq, 0, true)`, which Postgres rejects outright: "value 0 is out of bounds
  // for sequence ... (1..9223372036854775807)" — AFTER the row copy that produced that id had
  // already landed. See migration-manifest-postgres.test.ts for the live proof of both the old
  // failure and the fix across empty / positive / non-positive / mixed-sign cases.
  const sql = reseedSequenceSql("analytics_events", "id");
  assert.match(sql, /setval\(pg_get_serial_sequence\('analytics_events', 'id'\)/);
  assert.match(sql, /GREATEST\(COALESCE\(\(SELECT max\(id\) FROM analytics_events\), 0\), 1\)/);
  assert.match(sql, /COALESCE\(\(SELECT max\(id\) FROM analytics_events\), 0\) >= 1/);
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

test("DERIVED_OBJECTS also names post_search_document — the ordinary table the FTS5 index runs against, invisible to the generator in exactly the same way (MEDIUM #8)", () => {
  const doc = DERIVED_OBJECTS.find((d) => d.name === "post_search_document");
  assert.ok(doc, "post_search_document must be listed — it is a real, raw-SQL table with rows a copier could otherwise mistakenly copy or silently skip without a documented reason");
  assert.equal(doc?.copyPolicy, "never-copy-rows");
  assert.equal(doc?.kind, "fts5-content-table");
  assert.ok(/extractPostPlainText/.test(doc?.rebuildStrategy ?? ""), "rebuild strategy must name the actual TypeScript extraction step, not describe the rebuild as pure SQL");
});

test("WATERMARK_IS_NOT_A_MIGRATION_BOUNDARY is exported as a truthy guard, not silently absent", () => {
  assert.equal(WATERMARK_IS_NOT_A_MIGRATION_BOUNDARY, true);
});

// --- HIGH #5: OVERRIDING SYSTEM VALUE, scoped to INSERT-based copiers only ------------------------

test("IDENTITY_COLUMN_INSERT_OVERRIDE names the exact clause an INSERT-based copier needs — live-verified against both bulk-load paths in migration-manifest-postgres.test.ts", () => {
  assert.equal(IDENTITY_COLUMN_INSERT_OVERRIDE, "OVERRIDING SYSTEM VALUE");
});

// --- HIGH #6: copy ordering derived from the FK graph ----------------------------------------------

test("topologicalTableCopyOrder orders every referenced table before every table that references it (synthetic DAG, not the real schema)", () => {
  const edges: ForeignKeyEdge[] = [
    { fromExportName: "c", fromSqlTableName: "c", toExportName: "b", toSqlTableName: "b", selfReferencing: false },
    { fromExportName: "b", fromSqlTableName: "b", toExportName: "a", toSqlTableName: "a", selfReferencing: false },
  ];
  const order = topologicalTableCopyOrder(["c", "b", "a", "d"], edges);
  assert.deepEqual(new Set(order), new Set(["a", "b", "c", "d"]));
  assert.ok(order.indexOf("a") < order.indexOf("b"), "a (referenced by b) must come before b");
  assert.ok(order.indexOf("b") < order.indexOf("c"), "b (referenced by c) must come before c");
});

test("topologicalTableCopyOrder throws TableCopyOrderCycleError for a cycle across different tables (synthetic — the real schema has none today, proven below)", () => {
  const edges: ForeignKeyEdge[] = [
    { fromExportName: "a", fromSqlTableName: "a", toExportName: "b", toSqlTableName: "b", selfReferencing: false },
    { fromExportName: "b", fromSqlTableName: "b", toExportName: "c", toSqlTableName: "c", selfReferencing: false },
    { fromExportName: "c", fromSqlTableName: "c", toExportName: "a", toSqlTableName: "a", selfReferencing: false },
  ];
  assert.throws(
    () => topologicalTableCopyOrder(["a", "b", "c"], edges),
    (err: unknown) => {
      assert.ok(err instanceof TableCopyOrderCycleError, "must throw TableCopyOrderCycleError specifically");
      assert.deepEqual(new Set((err as TableCopyOrderCycleError).stuckExportNames), new Set(["a", "b", "c"]));
      return true;
    }
  );
});

test("topologicalTableCopyOrder excludes self-referencing edges from the ordering graph — a table cannot be sequenced before itself, but still appears exactly once", () => {
  const edges: ForeignKeyEdge[] = [
    { fromExportName: "tree", fromSqlTableName: "tree", toExportName: "tree", toSqlTableName: "tree", selfReferencing: true },
  ];
  const order = topologicalTableCopyOrder(["tree", "other"], edges);
  assert.deepEqual(new Set(order), new Set(["tree", "other"]));
  assert.equal(order.filter((n) => n === "tree").length, 1, "a self-referencing table must appear exactly once, not be dropped or duplicated");
});

test("collectForeignKeyEdges finds real foreign keys in the core schema, and none are self-referencing today", () => {
  const edges = collectForeignKeyEdges();
  assert.ok(edges.length > 10, `sanity: expected several FKs, got ${edges.length}`);
  assert.ok(
    edges.every((e) => !e.selfReferencing),
    "no self-referencing FK exists in schema.ts today — if this fails, a new one was added and needs its own " +
      "row-level ordering plan, see topologicalTableCopyOrder's doc"
  );
});

test("computeCoreTableCopyOrder succeeds against the real schema (no cycle) and its order satisfies every real foreign key", () => {
  const order = computeCoreTableCopyOrder();
  const allExportNames = collectCoreTables().map((t) => t.exportName);
  assert.deepEqual(new Set(order), new Set(allExportNames));
  assert.equal(order.length, allExportNames.length, "no table dropped or duplicated");

  const index = new Map(order.map((name, i) => [name, i]));
  for (const edge of collectForeignKeyEdges()) {
    if (edge.selfReferencing) continue;
    assert.ok(
      index.get(edge.toExportName)! < index.get(edge.fromExportName)!,
      `${edge.fromSqlTableName} (references ${edge.toSqlTableName}) must be copied after ${edge.toSqlTableName}`
    );
  }
});

// --- MEDIUM #7: the 2^53 ceiling is documented, not fixed by changing the generator's column mode --

test("PG_BIGINT53_SAFE_INTEGER_CEILING documents Number.MAX_SAFE_INTEGER and explicitly rejects mode:\"bigint\" as the fix", () => {
  assert.equal(PG_BIGINT53_SAFE_INTEGER_CEILING.ceiling, Number.MAX_SAFE_INTEGER);
  assert.ok(PG_BIGINT53_SAFE_INTEGER_CEILING.yearsToExhaustAt1MPerSecond > 280 && PG_BIGINT53_SAFE_INTEGER_CEILING.yearsToExhaustAt1MPerSecond < 290);
  assert.match(PG_BIGINT53_SAFE_INTEGER_CEILING.doNotFixBySwitchingMode, /BigInt/);
});

// --- MEDIUM #9: Z vs offset forms both verify, but do not sort consistently against each other -----

test("TIMESTAMP_ORDERING_REQUIRES_CANONICAL_Z documents the collation hazard without asking verifyUtcTimestampText to reject the offset form", () => {
  assert.match(TIMESTAMP_ORDERING_REQUIRES_CANONICAL_Z.hazard, /collation/);
  assert.match(TIMESTAMP_ORDERING_REQUIRES_CANONICAL_Z.requirement, /normalize to canonical Z/);
  // Both forms must still verify — this constant documents a sort-order hazard, not a validity one.
  assert.equal(verifyUtcTimestampText("2026-08-12T10:00:00Z"), null);
  assert.equal(verifyUtcTimestampText("2026-08-12T10:00:00-04:00"), null);
});

test("Z and offset forms genuinely disagree under plain string comparison, even though both name valid, unambiguous instants — the mechanism TIMESTAMP_ORDERING_REQUIRES_CANONICAL_Z documents", () => {
  // The audited example: a -05:00 offset with clock-hour "10" names 15:00 UTC (chronologically
  // LATER than the Z form below), but "10" is lexicographically SMALLER than "12" — so plain string
  // comparison ranks the chronologically later value first.
  const laterInstantOffsetForm = "2026-08-12T10:00:00-05:00"; // 15:00 UTC
  const earlierInstantZForm = "2026-08-12T12:00:00Z"; // 12:00 UTC
  assert.ok(
    Date.parse(laterInstantOffsetForm) > Date.parse(earlierInstantZForm),
    "sanity: the offset form really does name the chronologically later instant"
  );
  assert.ok(
    laterInstantOffsetForm < earlierInstantZForm,
    "plain string comparison ranks the LATER instant first — the opposite of chronological order"
  );
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

test("verifyUtcTimestampText: accepts fractional seconds, and a genuine leap-day instant in a leap year", () => {
  assert.equal(verifyUtcTimestampText("2026-08-12T10:00:00.123Z"), null);
  assert.equal(verifyUtcTimestampText("2028-02-29T00:00:00Z"), null, "2028 is a leap year — Feb 29 is a real date");
});

test("verifyUtcTimestampText: rejects Date.parse's looser forms that bare Date.parse would silently accept (MEDIUM #11)", () => {
  // Space-separated date-time: Date.parse("2026-08-12 10:00:00Z") parses successfully (isNaN false)
  // even though it is not the RFC3339 "T"-separated shape this manifest's timestamps are declared to
  // use. Verified before tightening: a live scan of infra/content.db found zero space-separated
  // values in any schema.ts-declared timestamp column, so this does not retroactively flag real data.
  const spaceSeparated = verifyUtcTimestampText("2026-08-12 10:00:00Z");
  assert.equal(spaceSeparated?.code, "UNPARSEABLE_TIMESTAMP");

  // Invalid calendar date: Date.parse("2026-02-30T00:00:00Z") does NOT return NaN — it silently
  // normalizes to March 2nd instead of failing, which the old bare-Date.parse check let straight
  // through as "valid". 2026 is not a leap year, so Feb 29 is invalid too. Same shape for a 30-day
  // month: April has no 31st, and Date.parse silently rolls "2026-04-31" into May 1st.
  const feb30 = verifyUtcTimestampText("2026-02-30T00:00:00Z");
  assert.equal(feb30?.code, "INVALID_CALENDAR_DATE");
  const feb29NonLeap = verifyUtcTimestampText("2026-02-29T00:00:00Z");
  assert.equal(feb29NonLeap?.code, "INVALID_CALENDAR_DATE");
  const april31 = verifyUtcTimestampText("2026-04-31T00:00:00Z");
  assert.equal(april31?.code, "INVALID_CALENDAR_DATE");

  // Confirm the OLD lax check really would have accepted all of these — otherwise this "regression"
  // test would not be exercising the bug it claims to (V8's Date.parse DOES reject syntactically
  // out-of-range fields like month 13 or hour 25 on its own; the silent-normalization bug is
  // specifically a day-of-month that is in the 1-31 syntactic range but invalid for that month).
  assert.ok(!Number.isNaN(Date.parse("2026-08-12 10:00:00Z")), "sanity: Date.parse accepts the space-separated form");
  assert.ok(!Number.isNaN(Date.parse("2026-02-30T00:00:00Z")), "sanity: Date.parse silently normalizes Feb 30");
  assert.ok(!Number.isNaN(Date.parse("2026-04-31T00:00:00Z")), "sanity: Date.parse silently normalizes April 31");
});

test("verifyUtcTimestampText: rejects an out-of-range UTC offset — the regression the STRICT_RFC3339_SHAPE/isValidCalendarInstant rewrite silently introduced by dropping Date.parse's own offset-bounds checking", () => {
  // Before this fix: STRICT_RFC3339_SHAPE matched any two-digit:two-digit offset (no range check at
  // all), and isValidCalendarInstant only round-trips the date/time fields — neither one looks at the
  // offset's own magnitude, so all three of these shape-matched and calendar-round-tripped cleanly
  // and were wrongly ACCEPTED. Date.parse itself has always rejected all three (see the sanity
  // assertions below) — this is a real loss of a check the previous round had for free, not a new one.
  const overHourBoundary = verifyUtcTimestampText("2026-08-12T10:00:00+24:00");
  assert.equal(overHourBoundary?.code, "INVALID_UTC_OFFSET");
  const overMinuteBoundary = verifyUtcTimestampText("2026-08-12T10:00:00+23:60");
  assert.equal(overMinuteBoundary?.code, "INVALID_UTC_OFFSET");
  const wayOutOfRange = verifyUtcTimestampText("2026-08-12T10:00:00+99:99");
  assert.equal(wayOutOfRange?.code, "INVALID_UTC_OFFSET");
  const negativeOverHourBoundary = verifyUtcTimestampText("2026-08-12T10:00:00-24:00");
  assert.equal(negativeOverHourBoundary?.code, "INVALID_UTC_OFFSET");

  // Confirm Date.parse really would have rejected all four — otherwise this would not be a genuine
  // regression relative to the pre-rewrite behavior this manifest replaced.
  assert.ok(Number.isNaN(Date.parse("2026-08-12T10:00:00+24:00")), "sanity: Date.parse rejects +24:00");
  assert.ok(Number.isNaN(Date.parse("2026-08-12T10:00:00+23:60")), "sanity: Date.parse rejects +23:60");
  assert.ok(Number.isNaN(Date.parse("2026-08-12T10:00:00+99:99")), "sanity: Date.parse rejects +99:99");
  assert.ok(Number.isNaN(Date.parse("2026-08-12T10:00:00-24:00")), "sanity: Date.parse rejects -24:00");
});

test("verifyUtcTimestampText: accepts boundary-VALID offsets — the fix must not reject the legitimate edge of the range along with the illegitimate one", () => {
  // ±15:59, not ±23:59 — Postgres's own timezone-displacement cap (2026-08-12 round-3 fix), see
  // isValidUtcOffset's own doc and the live proof in migration-manifest-postgres.test.ts.
  assert.equal(verifyUtcTimestampText("2026-08-12T10:00:00+15:59"), null, "+15:59 is the maximum valid positive offset (Postgres's own cap)");
  assert.equal(verifyUtcTimestampText("2026-08-12T10:00:00-15:59"), null, "-15:59 is the maximum valid negative offset (Postgres's own cap)");
  assert.equal(verifyUtcTimestampText("2026-08-12T10:00:00+00:00"), null, "+00:00 is a valid (if redundant with Z) offset");
});

// --- round-3 audit (2026-08-12): the ±23:59 bound above was itself wrong — Postgres genuinely
// rejects +16:00 through +23:59, so the PREVIOUS round's fix let values through this validator that
// its own destination database can never accept -----------------------------------------------------

test("verifyUtcTimestampText: rejects offsets Postgres itself rejects (+16:00 through +23:59) even though Date.parse alone accepts every one of them — this was the round-3 regression: the ±23:59 bound matched Date.parse, not Postgres, the actual authority this validator answers to", () => {
  // Live Postgres 14.18 proof (migration-manifest-postgres.test.ts): '...+16:00'::timestamptz ->
  // ERROR: time zone displacement out of range. '...+15:59'::timestamptz -> OK. The cap is exactly
  // ±15:59, so +16:00 is the smallest value that must now be rejected, and +23:59 (the OLD bound's own
  // "valid" boundary case) must be rejected too.
  const justOverNewBoundary = verifyUtcTimestampText("2026-08-12T10:00:00+16:00");
  assert.equal(justOverNewBoundary?.code, "INVALID_UTC_OFFSET");
  const oldBoundaryNowInvalid = verifyUtcTimestampText("2026-08-12T10:00:00+23:59");
  assert.equal(oldBoundaryNowInvalid?.code, "INVALID_UTC_OFFSET");
  const negativeJustOverNewBoundary = verifyUtcTimestampText("2026-08-12T10:00:00-16:00");
  assert.equal(negativeJustOverNewBoundary?.code, "INVALID_UTC_OFFSET");
  const negativeOldBoundaryNowInvalid = verifyUtcTimestampText("2026-08-12T10:00:00-23:59");
  assert.equal(negativeOldBoundaryNowInvalid?.code, "INVALID_UTC_OFFSET");

  // Confirm Date.parse genuinely accepts all four — otherwise this would not be exercising the gap
  // between "what Date.parse allows" and "what Postgres allows" that this fix closes.
  assert.ok(!Number.isNaN(Date.parse("2026-08-12T10:00:00+16:00")), "sanity: Date.parse accepts +16:00 (Postgres does not)");
  assert.ok(!Number.isNaN(Date.parse("2026-08-12T10:00:00+23:59")), "sanity: Date.parse accepts +23:59 (Postgres does not)");
  assert.ok(!Number.isNaN(Date.parse("2026-08-12T10:00:00-16:00")), "sanity: Date.parse accepts -16:00 (Postgres does not)");
  assert.ok(!Number.isNaN(Date.parse("2026-08-12T10:00:00-23:59")), "sanity: Date.parse accepts -23:59 (Postgres does not)");
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

// --- BLOCKER #3: verifyClassifiedValue must check COPY FIDELITY (source vs destination), not just
// destination shape ------------------------------------------------------------------------------

test("verifyExactTextCopy: exact match passes (including null==null), any mismatch fails with one distinct code", () => {
  assert.equal(verifyExactTextCopy("x", "x"), null);
  assert.equal(verifyExactTextCopy(null, null), null);
  assert.equal(verifyExactTextCopy('{"a":1}', '{"a":1}'), null);
  assert.equal(verifyExactTextCopy("x", "y")?.code, "TEXT_COPY_FIDELITY_MISMATCH");
  assert.equal(verifyExactTextCopy(null, "x")?.code, "TEXT_COPY_FIDELITY_MISMATCH");
  assert.equal(verifyExactTextCopy("x", null)?.code, "TEXT_COPY_FIDELITY_MISMATCH");
});

test("verifyClassifiedValue dispatches to the right check per column kind, and passes id/plain-integer/boolean kinds through their own dedicated paths", () => {
  assert.equal(verifyClassifiedValue({ kind: "json-text" }, '{"a":1}', '{"a":1}'), null);
  assert.equal(verifyClassifiedValue({ kind: "utc-timestamp-text" }, "2026-08-12T10:00:00Z", "2026-08-12T10:00:00Z"), null);
  assert.equal(verifyClassifiedValue({ kind: "plain-text" }, "hello", "hello"), null);
  assert.equal(verifyClassifiedValue({ kind: "boolean-flag" }, 1, true), null);
  assert.equal(verifyClassifiedValue({ kind: "reviewed-id", growthClass: "unbounded", rationale: "x" }, 1, 1), null);
  assert.equal(verifyClassifiedValue({ kind: "reviewed-id", growthClass: "bounded", rationale: "x" }, 1, 1), null);
  assert.equal(verifyClassifiedValue({ kind: "plain-integer" }, 1, 1), null);
});

test("verifyClassifiedValue rejects a copier that silently substitutes a different-but-valid value — the exact audited example ({\"role\":\"admin\"} copied as {\"role\":\"member\"}) — for every text-family kind", () => {
  // Before the fix, all three of these passed: json-text and utc-timestamp-text validated only
  // postgresValue's SHAPE, ignoring sqliteValue entirely, and plain-text had no check at all. The old
  // tests passed `null` as the source value for json-text/utc-timestamp-text, which is what concealed
  // the omission (null never triggers a shape check either way) — this test uses REAL matching source
  // shapes on purpose, so it actually exercises the fidelity comparison.
  const jsonSwap = verifyClassifiedValue({ kind: "json-text" }, '{"role":"admin"}', '{"role":"member"}');
  assert.equal(jsonSwap?.code, "TEXT_COPY_FIDELITY_MISMATCH");

  const timestampSwap = verifyClassifiedValue({ kind: "utc-timestamp-text" }, "2026-08-12T10:00:00Z", "2026-08-12T11:00:00Z");
  assert.equal(timestampSwap?.code, "TEXT_COPY_FIDELITY_MISMATCH");

  const plainTextSwap = verifyClassifiedValue({ kind: "plain-text" }, "hello", "goodbye");
  assert.equal(plainTextSwap?.code, "TEXT_COPY_FIDELITY_MISMATCH");
});

test("verifyClassifiedValue still catches a destination-shape violation even when fidelity passes (fidelity and shape are two DIFFERENT checks, not one replacing the other)", () => {
  // The source and destination match exactly, so fidelity passes — but the matched value is itself
  // malformed JSON / a naive-local timestamp, which the shape check (run second) must still catch.
  assert.equal(verifyClassifiedValue({ kind: "json-text" }, "{bad", "{bad")?.code, "INVALID_JSON");
  assert.equal(verifyClassifiedValue({ kind: "utc-timestamp-text" }, "2026-08-12T10:00:00", "2026-08-12T10:00:00")?.code, "NAIVE_LOCAL_TIMESTAMP");
});
