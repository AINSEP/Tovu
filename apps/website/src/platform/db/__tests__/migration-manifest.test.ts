/**
 * @file Pure-logic tests for `src/platform/db/migration/manifest.ts` and `verify.ts` — no live database.
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

import ts from "typescript";

import { getTableConfig } from "drizzle-orm/sqlite-core";
import { getTableConfig as getPgTableConfig } from "drizzle-orm/pg-core";

import type { ColumnDecl } from "#src/features/plugins/data-module";
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
  REVIEWED_JSON_COLUMNS,
  TableCopyOrderCycleError,
  TIMESTAMP_ORDERING_REQUIRES_CANONICAL_Z,
  topologicalTableCopyOrder,
  WATERMARK_IS_NOT_A_MIGRATION_BOUNDARY,
} from "../migration/manifest.js";
import { verifyBooleanCopy, verifyClassifiedValue, verifyExactTextCopy, verifyJsonText, verifyUtcTimestampText } from "../migration/verify.js";
import * as pgSchema from "../schema.postgres.js";

const SCHEMA_SOURCE = fs.readFileSync(path.resolve(import.meta.dirname, "../schema.sqlite.ts"), "utf8");

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

test("GATE A: every SQLiteInteger column in schema.sqlite.ts maps to a bigint column in the generated schema.postgres.ts, with zero exceptions", () => {
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

test("GATE B: REVIEWED_INTEGER_ID_COLUMNS has no stale entries — every key names a real column in schema.sqlite.ts today", () => {
  // Derived via rawCoreColumns(), NOT classifyAllCoreColumns() — same independence rationale as
  // GATE A above (LOW #10).
  const real = new Set(rawCoreColumns().map((c) => `${c.sqlTableName}.${c.sqlColumnName}`));
  const stale = Object.keys(REVIEWED_INTEGER_ID_COLUMNS).filter((key) => !real.has(key));
  assert.deepEqual(stale, [], "REVIEWED_INTEGER_ID_COLUMNS names a column that no longer exists — update the registry");
});

test("GATE B: every autoincrement PK in schema.sqlite.ts is assigned exactly one growth class ('unbounded' or 'bounded') — none unreviewed", () => {
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
      "publish_history.id",
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
    "publish_history.id",
  ]);
  assert.deepEqual(new Set(identity), expected);
  assert.equal(identity.length, 12, "expected exactly 12 autoincrement primary keys in the core schema");
});

test("entry_revisions.seq's rationale correctly scopes to entries, not posts — features/post/repo.sqlite.ts never writes entry_revisions (LOW #12 correction)", () => {
  const rationale = REVIEWED_INTEGER_ID_COLUMNS["entry_revisions.seq"]?.rationale ?? "";
  assert.ok(rationale.includes("features/entries/repo.sqlite.ts"), "rationale should name the actual writer");
  assert.ok(!/entry\/post save/.test(rationale), "rationale must not repeat the false 'every entry/post save' claim");
});

test("boolean-flag classification matches exactly the SQLiteBoolean columns in schema.sqlite.ts, not the many plain-integer 0/1 flags", () => {
  const all = classifyAllCoreColumns();
  const booleans = all.filter((c) => c.columnClass.kind === "boolean-flag").map((c) => `${c.sqlTableName}.${c.sqlColumnName}`);
  // `publish_credential_sets.is_default`/`source_control_credential_sets.is_default` (2026-08-15),
  // `publish_history.reachable` (2026-08-16), and `vendor_credential_sets.is_default` (its own doc
  // comment in schema.sqlite.ts: "same invariant... the two predecessor tables' own isDefault columns
  // document" — a third sibling of the two credential-set columns above) post-date this test's
  // original hardcoded set — added here rather than left stale, since this assertion's whole point
  // is to track real schema.sqlite.ts state.
  assert.deepEqual(
    new Set(booleans),
    new Set([
      "posts.overrides_theme_page",
      "plugin_activations.enabled",
      "external_mcp_servers.enabled",
      "publish_credential_sets.is_default",
      "source_control_credential_sets.is_default",
      "publish_history.reachable",
      "vendor_credential_sets.is_default",
    ])
  );

  // Plain-integer 0/1-shaped flags get NO transform (correct passthrough) — confirm they are
  // classified plain-integer, not accidentally swept into boolean-flag by a looser name-based rule.
  const plainIntegers = new Set(all.filter((c) => c.columnClass.kind === "plain-integer").map((c) => `${c.sqlTableName}.${c.sqlColumnName}`));
  for (const flagLike of ["redirect_revisions.tombstoned", "taxonomies.hierarchical", "policies.is_builtin", "policies.is_frozen", "member_tiers.visible_in_portal"]) {
    assert.ok(plainIntegers.has(flagLike), `expected "${flagLike}" to be plain-integer (declared without {mode:"boolean"})`);
  }
});

// LEDGER #14 (2026-08-12 audit, CORRECTED 2026-08-12 round-3): this "independent" oracle filters with
// `name.endsWith("_json")` — the SAME suffix rule isJsonColumnName() itself encodes, just re-typed by
// hand rather than called. Exactly the same coupling the timestamp oracle two tests below used to have
// (see that test's own LOW #14 comment) — it proves classifyAllCoreColumns() faithfully APPLIES the
// rule to every real column, not that the rule is EXHAUSTIVE over which columns are semantically JSON.
//
// The test immediately below THIS one (SQL-name-vs-TS-name self-consistency) does NOT close that gap —
// a previous version of this comment claimed it did, and that claim was itself wrong, caught live: it
// only proves the *_json/*Json conventions never disagree WITH EACH OTHER on a single column's own two
// names (SQL name says JSON, TS name says JSON, or neither does — genuinely useful, it would catch e.g.
// `bodyJson: text("body_html")`), which says nothing at all about a column that fails the convention on
// BOTH sides consistently. `composio_config.auth_config_ids` (SQL: no `_json` suffix; TS: `authConfigIds`,
// ends `Ids` not `Json`) is exactly that case — a real, live column, not the earlier hypothetical
// "settings_payload" example — and it passed the self-consistency test below cleanly (both sides agree
// it "isn't JSON"), right alongside `classifyAllCoreColumns()` silently classifying it `plain-text` and
// `verifyJsonText` never running on it. Four more columns share the identical shape (`posts.ext`,
// `external_mcp_servers.args`/`allowed_tool_names`/`env_names`) — see `REVIEWED_JSON_COLUMNS` in
// `manifest.ts` for the actual fix (a reviewed allowlist, paired with the staleness/non-redundancy
// gates further down this file) and the full rationale for each. No test built on the *_json/*Json
// naming conventions alone can ever close this gap by construction — the two tests below stay useful
// for what they actually prove (naming-convention self-consistency and classifier-dispatch fidelity),
// they are just not, and were never, a completeness proof over "which columns are semantically JSON."
test("json-text classification matches an independent textual scan of schema.sqlite.ts for *_json columns, UNIONED with the REVIEWED_JSON_COLUMNS allowlist for the columns that scan cannot see by construction", () => {
  // Independent oracle: regexes directly over the source text, not through Drizzle introspection —
  // a different code path from classifyAllCoreColumns()'s getTableConfig() walk, so this cannot pass
  // merely because the same bug is present in both places.
  const declaredByConvention = new Set([...SCHEMA_SOURCE.matchAll(/text\("([a-z0-9_]*_json)"\)/g)].map((m) => m[1]));
  // Distinct NAMES, not occurrences — "state_json"/"value_json"/"before_json" etc. each repeat
  // across several tables, so this is well under the 37 total json-text columns classifyAllCoreColumns()
  // finds; the deepEqual below is what actually proves per-occurrence agreement via classifyAllCoreColumns.
  assert.ok(declaredByConvention.size > 20, `sanity: expected 20+ distinct *_json column names, got ${declaredByConvention.size}`);

  // REVIEWED_JSON_COLUMNS entries are keyed "table.column"; this test compares bare SQL column names
  // (matching declaredByConvention's shape), so take just the column half of each key.
  const declaredByReview = new Set(Object.keys(REVIEWED_JSON_COLUMNS).map((key) => key.split(".")[1]));
  const declared = new Set([...declaredByConvention, ...declaredByReview]);

  const all = classifyAllCoreColumns();
  const classified = new Set(all.filter((c) => c.columnClass.kind === "json-text").map((c) => c.sqlColumnName));
  assert.deepEqual(classified, declared);
});

test("json-text classification agrees with a GENUINELY independent oracle: schema.sqlite.ts's camelCase TS property names ('*Json' convention) vs its snake_case SQL names ('_json' convention) never disagree on a single column", () => {
  // Proves naming-CONVENTION self-consistency only — NOT completeness over "which columns are
  // semantically JSON" (see the LEDGER #14 comment above this test block for the real column,
  // `composio_config.auth_config_ids`, that disproved the old, stronger claim this comment used to
  // make). This reads the TS property name (left of the colon, e.g. `bodyJson` in
  // `bodyJson: text("body_json")`) via its own regex against a different substring of the source, then
  // applies its OWN "is this JSON" predicate to that different string. A bug where the *_json/*Json
  // conventions disagree WITH EACH OTHER on one column's two names (SQL says JSON, TS doesn't, or vice
  // versa) is exactly what this test catches — a column that fails the convention identically on BOTH
  // sides (this test's "no disagreement" case) is invisible to it by construction, which is precisely
  // why REVIEWED_JSON_COLUMNS in manifest.ts exists as a separate, explicitly-reviewed mechanism rather
  // than a strengthening of this oracle.
  const pairs = [...SCHEMA_SOURCE.matchAll(/([A-Za-z_$][\w$]*):\s*text\("([a-z0-9_]+)"\)/g)].map((m) => ({ tsName: m[1], sqlName: m[2] }));
  assert.ok(pairs.length > 400, `sanity: expected 400+ text(...) column declarations, got ${pairs.length}`);

  const sqlSaysJson = (sqlName: string) => sqlName.endsWith("_json");
  const tsSaysJson = (tsName: string) => tsName.endsWith("Json");

  const disagreements = pairs.filter((p) => sqlSaysJson(p.sqlName) !== tsSaysJson(p.tsName));
  assert.deepEqual(
    disagreements,
    [],
    "schema.sqlite.ts's SQL name and TS property name disagree about whether a column is JSON for at least one column"
  );
});

// --- round-3 audit (2026-08-12): REVIEWED_JSON_COLUMNS — the actual fix for the gap the LEDGER #14
// comment above now correctly describes, paired with the same staleness discipline
// REVIEWED_INTEGER_ID_COLUMNS gets (GATE B), plus a non-redundancy check so the allowlist can only ever
// grow with columns the naming convention genuinely cannot see -----------------------------------------

test("REVIEWED_JSON_COLUMNS has no stale entries — every key names a real column in schema.sqlite.ts today", () => {
  const real = new Set(rawCoreColumns().map((c) => `${c.sqlTableName}.${c.sqlColumnName}`));
  const stale = Object.keys(REVIEWED_JSON_COLUMNS).filter((key) => !real.has(key));
  assert.deepEqual(stale, [], "REVIEWED_JSON_COLUMNS names a column that no longer exists — update the registry");
});

test("REVIEWED_JSON_COLUMNS has no redundant entries — no key already matches isJsonColumnName (the allowlist exists ONLY for columns the naming convention cannot see)", () => {
  const redundant = Object.keys(REVIEWED_JSON_COLUMNS).filter((key) => isJsonColumnName(key.split(".")[1]!));
  assert.deepEqual(redundant, [], "a REVIEWED_JSON_COLUMNS entry already matches the *_json naming convention and should not be in this allowlist at all");
});

test("REVIEWED_JSON_COLUMNS: every entry actually classifies json-text via classifyAllCoreColumns — the fix this registry exists for, proven end to end", () => {
  const all = classifyAllCoreColumns();
  const byKey = new Map(all.map((c) => [`${c.sqlTableName}.${c.sqlColumnName}`, c.columnClass.kind]));
  for (const key of Object.keys(REVIEWED_JSON_COLUMNS)) {
    assert.equal(byKey.get(key), "json-text", `"${key}" is in REVIEWED_JSON_COLUMNS but does not classify json-text`);
  }
});

// `external_mcp_servers.write_allowed_tool_names` postdates the round-3 audit: it shipped in the
// halted phase-3 refactor snapshot (03cc7144) as a sibling of the already-reviewed
// `allowed_tool_names`, but its own REVIEWED_JSON_COLUMNS entry was never added at the time — the
// same naming-convention gap the round-3 audit exists to catch, just on a column the round-3 scan
// predates rather than missed.
test("REVIEWED_JSON_COLUMNS matches exactly the six columns known-reviewed today (the 2026-08-12 round-3 audit's five, plus write_allowed_tool_names) — not more, not fewer", () => {
  assert.deepEqual(
    new Set(Object.keys(REVIEWED_JSON_COLUMNS)),
    new Set([
      "posts.ext",
      "composio_config.auth_config_ids",
      "external_mcp_servers.args",
      "external_mcp_servers.allowed_tool_names",
      "external_mcp_servers.env_names",
      "external_mcp_servers.write_allowed_tool_names",
    ])
  );
});

// --- round-4 audit (2026-08-12, R4-F1/C-1): heuristic fail-closed tripwire for the NEXT unreviewed
// JSON column ------------------------------------------------------------------------------------
//
// REVIEWED_JSON_COLUMNS is a closed, hand-maintained allowlist (see its own doc), and nothing in
// classifyCoreColumn's SQLiteText case forces a genuinely-JSON column that misses BOTH the *_json
// naming convention AND a REVIEWED_JSON_COLUMNS entry to be caught — it silently falls through to
// `{ kind: "plain-text" }`, and every test above stays green, exactly how `composio_config.auth_config_ids`
// slipped through before the round-3 audit found it (LEDGER #14 comment above). None of the four
// REVIEWED_JSON_COLUMNS tests above assert anything about a column NOT already in the registry, so none
// of them can catch the next one.
//
// This is a HEURISTIC tripwire, not a completeness proof — the test below says so in its own comment.
// It scans schema.sqlite.ts for the same two signals the round-3 audit's manual scan used to find all five
// current REVIEWED_JSON_COLUMNS entries, with zero false positives on this schema today, and FAILS the
// run (not warns) if either fires on a text() column outside both isJsonColumnName and
// REVIEWED_JSON_COLUMNS: (a) the column's own doc comment calls it a JSON object/array, or (b) it
// defaults to the JSON literal "{}"/"[]". A genuinely-JSON column whose doc comment never says "JSON"
// and has no {}/[] default still slips through this heuristic exactly as it slipped through the naming
// convention before it — this narrows the miss window, it does not close it.

/**
 * Every `text(...)` core-schema column DECLARATION in schema.sqlite.ts, paired with its own leading doc
 * comment, its FULL builder chain, and the SQL name of the table it belongs to.
 *
 * REWRITTEN 2026-08-12 as a TypeScript AST scan (external audit, Terra F1 / Gemini-Pro F1). The
 * previous version was a line-oriented regex, and three auditors independently found three DIFFERENT
 * columns it was blind to — each confirmed by planting the column into schema.sqlite.ts and watching the
 * suite stay green:
 *
 *   - `text('single_quoted')` — the pattern hard-coded a double quote, and the sanity count grepped
 *     `text("`, so BOTH the scan and its own guard missed it simultaneously.
 *   - a column reusing a reviewed BARE name on a different table — identity was the bare column name,
 *     so `otherTable.args` inherited `events.args`'s review.
 *   - a wrapped builder chain — fixed earlier by folding `.`-prefixed continuation lines, which is
 *     exactly the kind of patch this rewrite makes unnecessary.
 *
 * The lesson those three share is that a regex over source TEXT has no completeness property: every
 * fix closes one shape and the next shape is always inventable. An AST walk asks the compiler what a
 * declaration IS, so quoting, whitespace, line breaks, and chain layout stop being separate cases.
 *
 * Column identity is now `sqlTableName.sqlColumnName`, matching `REVIEWED_JSON_COLUMNS`'s own key
 * shape exactly, so a reviewed name no longer leaks its exemption to a same-named column elsewhere.
 */
type ScannedColumn = {
  sqlTableName: string;
  sqlColumnName: string;
  qualifiedName: string;
  docComment: string;
  declLine: string;
};

/** Convenience wrapper — the declarations only. See {@link scanSchemaTables} for `unresolved`. */
function textColumnDeclarations(source: string = SCHEMA_SOURCE): ScannedColumn[] {
  return scanSchemaTables(source).declarations;
}

function scanSchemaTables(source: string = SCHEMA_SOURCE): { declarations: ScannedColumn[]; unresolved: string[] } {
  const sf = ts.createSourceFile("schema.sqlite.ts", source, ts.ScriptTarget.Latest, /* setParentNodes */ true);
  const out: ScannedColumn[] = [];
  const unresolved: string[] = [];

  /** Unwrap a builder chain (`text("x").notNull().default("{}")`) down to its root `text(...)` call. */
  const rootTextCall = (node: ts.Expression): ts.CallExpression | undefined => {
    let cur: ts.Node = node;
    for (;;) {
      if (ts.isCallExpression(cur)) {
        if (ts.isIdentifier(cur.expression) && cur.expression.text === "text") return cur;
        cur = cur.expression;
        continue;
      }
      if (ts.isPropertyAccessExpression(cur)) {
        cur = cur.expression;
        continue;
      }
      return undefined;
    }
  };

  /**
   * What a property's initializer chain BOTTOMS OUT at: a builder call (`integer("x")`, `text("x")`,
   * `real("x")` — a real column this walk simply is not interested in), or a bare reference
   * (`sharedColumn`, `cols.shared` — a column whose `text(...)` call this single-file parse cannot see).
   * The distinction is the whole point: the first is safe to skip, the second is a silent under-report.
   */
  const chainRootKind = (node: ts.Expression): "call" | "reference" | "other" => {
    let cur: ts.Node = node;
    for (;;) {
      if (ts.isCallExpression(cur)) {
        if (ts.isIdentifier(cur.expression)) return "call";
        cur = cur.expression;
        continue;
      }
      if (ts.isPropertyAccessExpression(cur)) {
        cur = cur.expression;
        continue;
      }
      return ts.isIdentifier(cur) ? "reference" : "other";
    }
  };

  const literalText = (node: ts.Node | undefined): string | undefined =>
    node && ts.isStringLiteralLike(node) ? node.text : undefined;

  const visit = (node: ts.Node): void => {
    // A table: `sqliteTable("sql_table_name", { columns… })`
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "sqliteTable") {
      const sqlTableName = literalText(node.arguments[0]);
      const columns = node.arguments[1];
      if (sqlTableName !== undefined && columns !== undefined && ts.isObjectLiteralExpression(columns)) {
        for (const prop of columns.properties) {
          // A property this walk cannot resolve to a builder CALL is recorded, never silently skipped
          // (round-2 audit F1). A shorthand/spread/imported column reference — `auditProbeColumn,` or
          // `...sharedColumns` — is a plausible Drizzle refactor, and the scanner returned nothing for
          // it: the column was ABSENT from the scan, and the textual safety net missed it too, because
          // that net searches schema.sqlite.ts's own text and the `text(...)` call lives in another file. A
          // JSON column could then carry both signals and never be considered a candidate at all.
          // 694/694 real columns are inline builder calls today, so recording these costs nothing now
          // and fails loudly the moment the shape appears.
          if (!ts.isPropertyAssignment(prop)) {
            unresolved.push(`${sqlTableName}.${prop.name?.getText(sf) ?? "<spread>"} (${ts.SyntaxKind[prop.kind]})`);
            continue;
          }
          const call = rootTextCall(prop.initializer);
          if (!call) {
            if (chainRootKind(prop.initializer) !== "call") {
              unresolved.push(`${sqlTableName}.${prop.name.getText(sf)} (initializer is a bare reference, not a builder call)`);
            }
            continue;
          }
          const sqlColumnName = literalText(call.arguments[0]);
          if (sqlColumnName === undefined) {
            unresolved.push(`${sqlTableName}.${prop.name.getText(sf)} (text() called with a non-literal name)`);
            continue;
          }

          // The compiler's own notion of "the comment attached to this property" — no backward line
          // walk, so a blank line, a section header, or a sibling's trailing comment cannot be
          // misattributed here.
          const docComment = (ts.getLeadingCommentRanges(source, prop.getFullStart()) ?? [])
            .map((r) => source.slice(r.pos, r.end))
            .join("\n");

          out.push({
            sqlTableName,
            sqlColumnName,
            qualifiedName: `${sqlTableName}.${sqlColumnName}`,
            docComment,
            // The whole initializer, however it is laid out — this is what replaces "fold the
            // continuation lines back together and hope the shape was one we anticipated".
            declLine: prop.initializer.getText(sf),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return { declarations: out, unresolved };
}

test("textColumnDeclarations(): declLine carries a `.default(...)` wrapped onto a continuation line, not just a same-line one", () => {
  // REGRESSION (found 2026-08-12 by mutation-testing the tripwire below, NOT by reading it): planting a
  // `.default("{}")` column into schema.sqlite.ts with the chain wrapped across lines left the whole file green
  // — the tripwire never saw the default. The sanity test below used to claim its count assertion would
  // catch that case first; it does not, because declPattern's trailing `(.*)` matches the EMPTY string,
  // so a wrapped declaration still counts as one declaration and `declaredCount === rawTextCallSites - 1`
  // still holds. Both signals fire correctly on the two single-line shapes (also mutation-proven); this
  // is the third shape, and it was the one silent hole.
  const fixture = [
    'export const probes = sqliteTable("probes", {',
    "  /** JSON object of settings. */",
    '  wrappedChain: text("wrapped_chain")',
    "    .notNull()",
    '    .default("{}"),',
    "  /** JSON object of settings. */",
    "  singleQuoted: text('single_quoted').notNull().default('{}'),",
    "  /** json object, lowercase mention. */",
    '  lowerCase: text("lower_case"),',
    "  /** Reads from `theme.json`, a filename — NOT a JSON column. */",
    '  filenameOnly: text("filename_only"),',
    "});",
  ].join("\n");
  const decls = textColumnDeclarations(fixture);
  const by = (n: string) => decls.find((d) => d.sqlColumnName === n);

  assert.equal(decls.length, 4, "the AST scan must see all four columns regardless of quoting or layout");
  assert.equal(by("wrapped_chain")?.qualifiedName, "probes.wrapped_chain", "identity must be table-qualified");
  assert.match(by("wrapped_chain")?.declLine ?? "", /\.default\("\{\}"\)/, "a wrapped chain must carry its default");
  assert.ok(by("single_quoted"), "a single-quoted SQL name must be found — the regex scanner was blind to this");
  assert.match(by("single_quoted")?.declLine ?? "", /\.default\('\{\}'\)/, "single-quoted default must be carried too");
  assert.match(by("lower_case")?.docComment ?? "", /json/, "the lowercase doc comment must be attached to its own column");
  assert.match(by("filename_only")?.docComment ?? "", /theme\.json/, "the filename comment must attach to its own column");
});

test("sanity: the AST scan silently drops no text() column that is textually visible in schema.sqlite.ts", () => {
  // REPLACES a count-equality assertion that compared the scan against a `text("` grep. That check was
  // doubly wrong: it hard-coded the double quote (so a single-quoted column moved BOTH sides of the
  // equality and stayed invisible), and its stated purpose — proving declarations are single-line — was
  // false anyway. The real risk with any scanner is SILENT UNDER-COUNTING, so assert that directly and
  // quote-agnostically: every textually-visible `text("x")`/`text('x')` name must appear in the scan.
  //
  // This cannot catch a column the grep ALSO cannot see, which is why it is a floor, not a proof. It is
  // the AST walk itself — asking the compiler what a declaration is — that removes the shape-by-shape
  // blind spots; this assertion only guards against the scan regressing behind plain text search.
  const scanned = textColumnDeclarations();
  // Compare MULTIPLICITIES, not set membership (round 2: Terra F2). A Set masks exactly the failure it
  // claims to detect — one skipped `text("args")` is invisible whenever any other table also has `args`,
  // which is the same bare-name collision this file just removed from the tripwire itself.
  // The matcher accepts a closing `)` OR a `,`, so a `text("col", { … })` config-object form counts as
  // textually visible too (Terra F2, second half); the previous pattern quietly excluded it from its own
  // input set, so a skipped config-object column could never have shown up here.
  const countByName = (names: readonly string[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
    return counts;
  };
  const scannedCounts = countByName(scanned.map((d) => d.sqlColumnName));
  const visibleCounts = countByName(
    [...SCHEMA_SOURCE.matchAll(/text\(\s*(["'])([a-z0-9_]+)\1\s*[),]/g)].map((m) => m[2])
  );

  assert.ok(scanned.length > 500, `sanity: expected 500+ text() column declarations, got ${scanned.length}`);
  const undercounted = [...visibleCounts.entries()]
    .filter(([name, visible]) => (scannedCounts.get(name) ?? 0) < visible)
    .map(([name, visible]) => `${name} (text search sees ${visible}, scan sees ${scannedCounts.get(name) ?? 0})`);
  assert.deepEqual(
    undercounted,
    [],
    "the AST scan sees FEWER occurrences of these column names than a plain text search does, which means " +
      "it is silently skipping declarations — a table helper it does not recognize (it matches only " +
      "`sqliteTable(\"name\", { … })`), or a shape it does not walk. That under-report is what would make " +
      "the tripwire below quietly stop guarding those columns"
  );
  assert.ok(
    scanned.every((d) => d.sqlTableName.length > 0 && d.qualifiedName === `${d.sqlTableName}.${d.sqlColumnName}`),
    "every scanned column must carry the table name its qualified identity depends on"
  );
});

test("the AST scan resolves EVERY property in every sqliteTable literal — an unresolvable one fails loudly instead of vanishing", () => {
  // ROUND-2 AUDIT F1. The scan reads one file and only understands an inline builder CALL. A column
  // referenced by identifier — the ordinary result of extracting shared column builders into a helper
  // module — was returned by NOTHING: absent from the scan, and invisible to the textual safety net
  // too, because that net searches schema.sqlite.ts's own source and the `text(...)` call lives elsewhere. A
  // JSON column could then carry both signals and never be considered a candidate.
  //
  // Rather than resolve cross-file symbols (a full ts.Program for a test-only heuristic guarding a
  // subsystem with no production consumers), refuse to skip quietly: anything this walk cannot resolve
  // to a builder call is recorded, and this test asserts the list is empty. 694/694 real columns are
  // inline calls today, so it costs nothing until the shape actually appears — and then it fails here
  // rather than silently widening the tripwire's blind spot.
  assert.deepEqual(
    scanSchemaTables().unresolved,
    [],
    "schema.sqlite.ts has table properties this scan cannot resolve to a column-builder call. Any text() column " +
      "hiding behind one is invisible to the JSON tripwire below AND to its textual safety net. Either " +
      "inline the builder call, or teach scanSchemaTables() to resolve the reference — do not delete " +
      "this assertion"
  );

  // The guard must be able to fire: a bare reference and a spread are both recorded.
  const withReference = [
    'export const t = sqliteTable("t", {',
    "  inlineCol: text(\"inline_col\"),",
    "  sharedCol: importedColumnBuilder,",
    "  ...spreadColumns,",
    "});",
  ].join("\n");
  const scanned = scanSchemaTables(withReference);
  assert.equal(scanned.declarations.length, 1, "the inline column is still scanned normally");
  assert.equal(scanned.unresolved.length, 2, "the bare reference AND the spread must both be recorded");
  assert.match(scanned.unresolved.join(" "), /sharedCol/, "the referenced column must be named in the report");
});

test("JSON-completeness tripwire (R4-F1/C-1): no text() column outside isJsonColumnName/REVIEWED_JSON_COLUMNS has a doc comment naming it JSON, or a JSON-literal default", () => {
  // HEURISTIC, not a completeness proof — see the round-4 audit comment above for the honest statement
  // of what this cannot catch: a genuinely-JSON column whose doc comment never says "JSON" and has no
  // `{}`/`[]` default slips through exactly as `auth_config_ids` did before the round-3 audit found it
  // by hand. This test narrows that miss window; it does not close it.
  //
  // Two signals, the same ones the round-3 audit's manual scan used to find all five current
  // REVIEWED_JSON_COLUMNS entries:
  //   (a) the column's OWN immediately-preceding doc comment names it a JSON object/array/etc.
  //   (b) it defaults to the JSON literal "{}" or "[]" on its own declaration line.
  //
  // `JSON.stringify`/`JSON.parse` mentions are excluded from signal (a) on purpose, not by oversight:
  // several sealed-ciphertext columns (composio_connector_credentials.sealed_ciphertext is the real,
  // live example, pinned by the sanity assertion at the end of this test) document that they encrypt
  // the OUTPUT of `JSON.stringify(...)` — the column itself stores base64 AES-GCM ciphertext, not
  // plaintext JSON, and verifyJsonText would fail on every real row if this heuristic treated that
  // mention as a JSON signal. Flagging that column would be the heuristic being wrong, not the schema.
  //
  // Column identity is the FULLY QUALIFIED "table.column", matching REVIEWED_JSON_COLUMNS's own key
  // shape (external audit, Gemini-Pro F1). It used to be the bare column name, which meant a reviewed
  // name leaked its exemption to every same-named column on every other table — proven by planting
  // `text("args")` with both JSON signals onto an unrelated table and watching the suite stay green.
  const reviewedQualified = new Set(Object.keys(REVIEWED_JSON_COLUMNS));

  // Case-INSENSITIVE (external audit, Flash), but with the two exclusions that make that safe. Applying
  // the bare `/i` alone was tested and REJECTED: it immediately false-positives on `template_choice`,
  // whose comment mentions the FILENAME `theme.json` — "." is a word boundary, so `\bjson\b` matches
  // there. A column storing "blog-post.html" would have failed the suite.
  //   (?<!\.)  — not a filename extension (`theme.json`, `package.json`, `tokens.json`)
  //   (?!\.(?:stringify|parse)\b) — not the JS API; several sealed-ciphertext columns document
  //                                 encrypting the OUTPUT of JSON.stringify and store base64, not JSON.
  // `seo_ext_json` and friends need no exclusion: `_` is a word character, so `\bjson\b` never matches
  // inside a snake_case identifier in the first place.
  const jsonMentionInOwnComment = /(?<!\.)\bjson\b(?!\.(?:stringify|parse)\b)/i;
  const jsonLiteralDefault = /\.default\(\s*(["'])(\{\}|\[\])\1\s*\)/;

  const offenders: string[] = [];
  for (const { sqlColumnName, qualifiedName, docComment, declLine } of textColumnDeclarations()) {
    if (isJsonColumnName(sqlColumnName) || reviewedQualified.has(qualifiedName)) continue;
    const commentSignal = jsonMentionInOwnComment.test(docComment);
    const defaultSignal = jsonLiteralDefault.test(declLine);
    if (!commentSignal && !defaultSignal) continue;
    const reason = [commentSignal ? "doc comment mentions JSON" : null, defaultSignal ? 'defaults to a JSON literal ("{}" or "[]")' : null]
      .filter(Boolean)
      .join(" and ");
    offenders.push(`${qualifiedName} (${reason})`);
  }

  assert.deepEqual(
    offenders,
    [],
    `found text() column(s) that look like JSON by heuristic but are classified plain-text by neither the ` +
      `*_json naming convention nor REVIEWED_JSON_COLUMNS: ${offenders.join(", ")}. If genuinely JSON, add an ` +
      `entry (with rationale) to REVIEWED_JSON_COLUMNS in manifest.ts; if not, this heuristic has a false ` +
      `positive and needs its own fix.`
  );

  // Confirm the JSON.stringify/parse exclusion is doing real work, not a dead branch that happens to
  // never fire: composio_connector_credentials.sealed_ciphertext's own doc comment DOES mention "JSON"
  // (via "JSON.stringify(credentials)") and the column is neither *_json-named nor in
  // REVIEWED_JSON_COLUMNS — it is the live column that would turn into a false positive above if the
  // exclusion regressed.
  const sealedCiphertextDecl = textColumnDeclarations().find(
    (d) => d.sqlColumnName === "sealed_ciphertext" && /JSON\.stringify/.test(d.docComment)
  );
  assert.ok(
    sealedCiphertextDecl,
    "sanity: expected to find the sealed_ciphertext column whose comment mentions JSON.stringify — if this " +
      "fails, the trap case this test guards against no longer exists in schema.sqlite.ts in this exact shape and " +
      "should be replaced with a live one"
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
test("utc-timestamp-text classification matches an independent textual scan of schema.sqlite.ts for *_at / bare 'at' columns, excluding *_at_capture snapshot columns", () => {
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

test("utc-timestamp-text classification agrees with a GENUINELY independent oracle: schema.sqlite.ts's camelCase TS property names ('*At' convention) vs its snake_case SQL names ('_at' convention) never disagree on a single column", () => {
  // Different signal from the test above: this reads the TS property name (left of the colon, e.g.
  // `createdAt` in `createdAt: text("created_at")`) via its own regex against a different substring
  // of the source, then applies its OWN "is this a timestamp name" predicate to that different
  // string. A bug in isTimestampColumnName's underlying convention that this file's SQL-name oracle
  // cannot see (see the doc above) would only also fool THIS test if schema.sqlite.ts's two independent
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
    "schema.sqlite.ts's SQL name and TS property name disagree about whether a column is a timestamp for at least one column"
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

/**
 * Characterization test (pre-refactor pin): `topologicalTableCopyOrder` re-sorts a table into the
 * READY QUEUE the moment its in-degree hits zero, rather than sorting once up front and then
 * appending newly-ready tables to the end. This distinguishes it from a naive FIFO queue — those two
 * strategies diverge on this exact input. Initial ready set (in-degree 0) is {a, m, z}, alphabetically
 * a, m, z. Processing "a" makes "b" ready. A "sort once, append to end" queue would process the
 * already-ready m, z before ever seeing b, yielding [a, m, z, b]. This function instead re-inserts
 * "b" into its alphabetically-sorted position among the still-ready {m, z}, yielding [a, b, m, z] —
 * "process alphabetically among currently-ready tables" holds at every step, not just the first.
 */
test("topologicalTableCopyOrder re-sorts a newly-ready table into its alphabetical position among already-ready tables, not just appended to the end (pins the insert-on-ready tie-break)", () => {
  const edges: ForeignKeyEdge[] = [
    { fromExportName: "b", fromSqlTableName: "b", toExportName: "a", toSqlTableName: "a", selfReferencing: false },
  ];
  const order = topologicalTableCopyOrder(["a", "m", "z", "b"], edges);
  assert.deepEqual(order, ["a", "b", "m", "z"]);
});

test("collectForeignKeyEdges finds real foreign keys in the core schema, and none are self-referencing today", () => {
  const edges = collectForeignKeyEdges();
  assert.ok(edges.length > 10, `sanity: expected several FKs, got ${edges.length}`);
  assert.ok(
    edges.every((e) => !e.selfReferencing),
    "no self-referencing FK exists in schema.sqlite.ts today — if this fails, a new one was added and needs its own " +
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
  // values in any schema.sqlite.ts-declared timestamp column, so this does not retroactively flag real data.
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
  assert.equal(jsonSwap?.code, "JSON_COPY_FIDELITY_MISMATCH");

  const timestampSwap = verifyClassifiedValue({ kind: "utc-timestamp-text" }, "2026-08-12T10:00:00Z", "2026-08-12T11:00:00Z");
  assert.equal(timestampSwap?.code, "TEXT_COPY_FIDELITY_MISMATCH");

  const plainTextSwap = verifyClassifiedValue({ kind: "plain-text" }, "hello", "goodbye");
  assert.equal(plainTextSwap?.code, "TEXT_COPY_FIDELITY_MISMATCH");
});

test("json-text copy fidelity is JSON-value equality: jsonb's normalisation (key order, whitespace, duplicate keys) passes, any value change still fails", () => {
  // Exactly what Postgres jsonb hands back for the source on the left — keys reordered by length,
  // whitespace re-emitted as ", " / ": ", duplicate key collapsed to its last value.
  assert.equal(verifyClassifiedValue({ kind: "json-text" }, '{"zz":1,"a":{"y":[1,2],"x":null},"a2":true}', '{"a": {"x": null, "y": [1, 2]}, "a2": true, "zz": 1}'), null);
  assert.equal(verifyClassifiedValue({ kind: "json-text" }, '{"k":1,"k":2}', '{"k": 2}'), null);
  assert.equal(verifyClassifiedValue({ kind: "json-text" }, null, null), null);
  // Array order IS meaning; so are types, nullness, and nested values.
  assert.equal(verifyClassifiedValue({ kind: "json-text" }, "[1,2]", "[2, 1]")?.code, "JSON_COPY_FIDELITY_MISMATCH");
  assert.equal(verifyClassifiedValue({ kind: "json-text" }, '{"a":1}', '{"a": "1"}')?.code, "JSON_COPY_FIDELITY_MISMATCH");
  assert.equal(verifyClassifiedValue({ kind: "json-text" }, '{"a":{"b":1}}', '{"a": {"b": 1, "c": 2}}')?.code, "JSON_COPY_FIDELITY_MISMATCH");
  assert.equal(verifyClassifiedValue({ kind: "json-text" }, '{"a":1}', null)?.code, "JSON_COPY_FIDELITY_MISMATCH");
  assert.equal(verifyClassifiedValue({ kind: "json-text" }, null, '{"a": 1}')?.code, "JSON_COPY_FIDELITY_MISMATCH");
  // A malformed source cannot be compared as JSON at all.
  assert.equal(verifyClassifiedValue({ kind: "json-text" }, "{bad", '{"a": 1}')?.code, "INVALID_JSON");
});

test("verifyClassifiedValue still catches a destination-shape violation even when fidelity passes (fidelity and shape are two DIFFERENT checks, not one replacing the other)", () => {
  // The source and destination match exactly, so fidelity passes — but the matched value is itself
  // malformed JSON / a naive-local timestamp, which the shape check (run second) must still catch.
  assert.equal(verifyClassifiedValue({ kind: "json-text" }, "{bad", "{bad")?.code, "INVALID_JSON");
  assert.equal(verifyClassifiedValue({ kind: "utc-timestamp-text" }, "2026-08-12T10:00:00", "2026-08-12T10:00:00")?.code, "NAIVE_LOCAL_TIMESTAMP");
});
