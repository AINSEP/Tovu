/**
 * @file Proves the generator's index/CHECK-SQL translation on the specific shapes that have no live
 * case in `schema.ts` today, so its correctness rests on evidence rather than "the real schema never
 * exercises this branch."
 *
 * Why fixtures instead of adding these shapes to `schema.ts` itself: the real schema is the single
 * source of truth this whole generator exists to preserve, and none of these four shapes (a partial
 * index, a `.desc()`-ordered index, an expression index, a CHECK containing a bound parameter) is
 * something the product actually needs today — inventing a real table just to exercise them would be
 * fixture data masquerading as a schema decision. Building small standalone `sqliteTable`s here,
 * against the generator's own exported `renderTable`, exercises the exact same code path
 * `generate()` uses per real table without touching `schema.ts` or `schema.postgres.ts` at all.
 *
 * Three of the four are proven by CORRECT TRANSLATION, not rejection — see
 * `generate-postgres-schema.ts`'s own doc on `renderIndexColumnExpr`/`renderSqlText` for why ordering,
 * expression indexes, and predicates translate rather than refuse: SQLite's Drizzle represents all
 * three as plain `SQL` values built from static text and column references, the same shape CHECK
 * bodies already used, so refusing them outright would be declining work the existing hardened
 * renderer already does safely. Each "correctly emitted" fixture is checked two ways: the exact
 * generated source text, AND that pg-core's own `getTableConfig()` accepts the round-tripped snippet
 * without error — text matching alone could not tell a syntactically-plausible-but-wrong translation
 * from a correct one.
 *
 * The fourth (a CHECK containing a bound string parameter) is the one genuine rejection case: a value
 * interpolated into a `sql` template that isn't itself a Drizzle value lands in `queryChunks` as a
 * bare, unwrapped JS primitive (confirmed against this project's pinned `drizzle-orm@0.44.7` — see
 * `renderSqlText`'s doc). Splicing that into emitted SQL as trusted text is exactly the bug this
 * generator shipped once already; this fixture is the regression test for it.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { sql, desc } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { getTableConfig as getPgTableConfig } from "drizzle-orm/pg-core";
import * as pg from "drizzle-orm/pg-core";

import { renderTable } from "../../../development/scripts/generate-postgres-schema";

/**
 * Round-trips one generated `pgTable(...)` snippet through an actual `Function` constructor call so
 * pg-core itself validates the shape — a static text match can confirm "this looks like the intended
 * output" but not "this is a call pg-core actually accepts", and those have diverged before (this is
 * exactly the class of gap `getTableConfig()`-based semantic checks exist to close, see
 * `schema-postgres-parity.test.ts`'s own header).
 */
function evaluateGeneratedTable(source: string): unknown {
  const body = source.replace(/^export const \w+ = /, "return ");
  // Deliberately exercising the exact generated source text against the real pg-core builders it
  // will run under in schema.postgres.ts, not evaluating anything user- or database-controlled.
  // `bigint` is in scope here (not just `integer`) because every fixture below declares its `id`
  // column as a SQLite `SQLiteInteger` (via `integer("id").primaryKey()`), and the generator now
  // renders every `SQLiteInteger` column as `bigint(..., { mode: "number" })` — see
  // generate-postgres-schema.ts's columnBuilder() doc.
  const factory = new Function(
    "pgTable", "bigint", "boolean", "check", "foreignKey", "index", "integer", "primaryKey", "sql", "text", "uniqueIndex",
    body
  );
  return factory(pg.pgTable, pg.bigint, pg.boolean, pg.check, pg.foreignKey, pg.index, pg.integer, pg.primaryKey, sql, pg.text, pg.uniqueIndex);
}

test("a partial unique index (.where(...)) is translated, not silently emitted unfiltered", () => {
  const fixture = sqliteTable(
    "fx_partial_index",
    { id: integer("id").primaryKey(), workspaceId: text("workspace_id").notNull(), deletedAt: text("deleted_at") },
    (t) => [uniqueIndex("fx_partial_index_workspace_unique").on(t.workspaceId).where(sql`${t.deletedAt} is null`)]
  );

  const out = renderTable("fxPartialIndex", fixture as never);
  assert.match(out, /uniqueIndex\("fx_partial_index_workspace_unique"\)\.on\(t\.workspaceId\)\.where\(sql`deleted_at is null`\)/);

  const pgTable = evaluateGeneratedTable(out);
  const cfg = getPgTableConfig(pgTable as never);
  assert.equal(cfg.indexes.length, 1);
  assert.equal(cfg.indexes[0].config.unique, true);
  assert.ok(cfg.indexes[0].config.where, "predicate must survive into the pg-core index config, not just the source text");
});

test("a .desc()-ordered index column is translated to an equivalent SQL fragment, not dropped as an unresolved column name", () => {
  const fixture = sqliteTable(
    "fx_ordered_index",
    { id: integer("id").primaryKey(), createdAt: text("created_at").notNull() },
    (t) => [index("fx_ordered_index_created_at").on(desc(t.createdAt))]
  );

  const out = renderTable("fxOrderedIndex", fixture as never);
  assert.match(out, /index\("fx_ordered_index_created_at"\)\.on\(sql`\$\{t\.createdAt\} desc`\)/);
  // Casting an IndexColumn straight to a plain column (the original bug) would have produced
  // "t.undefined" here instead — assert its absence explicitly, not just that SOME text matched.
  assert.ok(!out.includes("t.undefined"), "an ordered index column must never fall back to an unresolved column reference");

  const pgTable = evaluateGeneratedTable(out);
  assert.equal(getPgTableConfig(pgTable as never).indexes.length, 1);
});

test("an expression index (sql`lower(...)`) is translated with the real column substituted in, not lost", () => {
  const fixture = sqliteTable(
    "fx_expr_index",
    { id: integer("id").primaryKey(), email: text("email").notNull() },
    (t) => [index("fx_expr_index_lower_email").on(sql`lower(${t.email})`)]
  );

  const out = renderTable("fxExprIndex", fixture as never);
  assert.match(out, /index\("fx_expr_index_lower_email"\)\.on\(sql`lower\(\$\{t\.email\}\)`\)/);

  const pgTable = evaluateGeneratedTable(out);
  assert.equal(getPgTableConfig(pgTable as never).indexes.length, 1);
});

test("a CHECK containing a bound parameter is rejected, not spliced into emitted SQL as trusted text", () => {
  const fixture = sqliteTable("fx_bad_check", { id: integer("id").primaryKey(), status: text("status").notNull() }, (t) => [
    check("fx_bad_check_status", sql`${t.status} = ${"published"}`),
  ]);

  assert.throws(() => renderTable("fxBadCheck", fixture as never), (error: unknown) => {
    assert.ok(error instanceof Error);
    // Confirms the rejection is the generic "unrecognised chunk" path catching an unwrapped
    // primitive — not some unrelated failure (e.g. a typo) that happens to also throw.
    assert.match(error.message, /unrecognised chunk \(String\)/);
    assert.match(error.message, /runtime data is not trusted SQL syntax/);
    return true;
  });
});

test("a CHECK column belonging to a different table is rejected rather than silently cross-referenced", () => {
  const other = sqliteTable("fx_other_table", { id: integer("id").primaryKey() });
  const fixture = sqliteTable("fx_cross_table_check", { id: integer("id").primaryKey(), status: text("status").notNull() }, (t) => [
    // Constructing a cross-table reference requires reaching into another table's column directly —
    // exactly the shape a hand-edited or generated-by-mistake CHECK could produce.
    check("fx_cross_table_check_bad", sql`${t.status} = ${other.id}`),
  ]);

  assert.throws(() => renderTable("fxCrossTableCheck", fixture as never), /from a different table/);
});
