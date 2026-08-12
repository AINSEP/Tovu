/**
 * @file Asserts the generated PostgreSQL schema carries the same structural elements as the SQLite
 * source it was derived from.
 *
 * Why this exists separately from the drift test: the drift test compares the committed file to
 * what the generator currently produces. That catches a stale file, but it is blind to a generator
 * that silently omits something — if the generator stops emitting foreign keys, it stops emitting
 * them consistently, and drift stays "in sync" while the PostgreSQL schema quietly loses
 * referential integrity.
 *
 * That is not hypothetical, and it has happened twice. The first version of the generator dropped
 * **all 9 foreign keys and all 7 CHECK constraints** and produced a file that typechecked cleanly
 * and passed the drift test. The CHECKs are the `*_sealed_shape` constraints on credential tables
 * asserting that sealed columns are either all NULL or all populated; losing them on PostgreSQL
 * would silently permit half-sealed credential rows that SQLite rejects. The second time, it dropped
 * column-level `.unique()` — surviving the FK/CHECK fix because neither the table-level
 * `uniqueConstraints` array nor `uniqueIndex(` (both already covered below) is what a column's own
 * `.unique()` modifier shows up as; it lives on the column's `isUnique` flag instead. A dropped
 * `.unique()` means PostgreSQL silently accepts duplicate rows that SQLite rejects.
 *
 * So this test compares against the SOURCE OF TRUTH — `schema.ts` introspected via Drizzle — rather
 * than against the generator's own output. Counts, not exact SQL, because the two dialects legibly
 * differ in type spelling; a count mismatch means something was dropped or invented.
 *
 * That said, counts alone have a real blind spot: a generator that drops a `WHERE` predicate while
 * keeping the index itself, or reorders an index's columns, or corrupts a CHECK's SQL text, changes
 * *meaning* without changing any count this file was checking before. Two tests below compare meaning
 * directly — CHECK SQL text against a hand-transcribed expectation (see their own doc for why that
 * expectation is NOT derived by calling the generator's own renderer), and each index's exact
 * `.on(...)` argument list/order against source. Both are still measured against `schema.ts`, not the
 * generator's output-of-its-own-output, for the same reason the count tests are.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { SQL, is } from "drizzle-orm";
import { getTableConfig, type SQLiteColumn } from "drizzle-orm/sqlite-core";

import * as sqliteSchema from "../schema";

import { tsPropertyNames } from "../../../development/scripts/generate-postgres-schema";

const GENERATED = fs.readFileSync(path.resolve(__dirname, "../schema.postgres.ts"), "utf8");
const DRIZZLE_IS_TABLE = Symbol.for("drizzle:IsDrizzleTable");

/** Escapes a literal string for use inside a `new RegExp(...)` pattern. */
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function sourceTables(): Array<{ exportName: string; table: never }> {
  return Object.entries(sqliteSchema)
    .filter(([, v]) => Boolean(v && typeof v === "object" && (v as Record<symbol, unknown>)[DRIZZLE_IS_TABLE]))
    .map(([exportName, table]) => ({ exportName, table: table as never }));
}

/** Counts non-overlapping occurrences of a literal token in the generated file. */
const occurrences = (token: string): number => GENERATED.split(token).length - 1;

test("every SQLite table is present in the generated PostgreSQL schema, by export name", () => {
  const missing = sourceTables()
    .map(({ exportName }) => exportName)
    .filter((name) => !new RegExp(`export const ${name} = pgTable\\(`).test(GENERATED));
  assert.deepEqual(missing, [], "tables missing from the generated schema");
});

test("every foreign key survives generation — losing one silently permits orphan rows", () => {
  const expected = sourceTables().reduce((n, { table }) => n + getTableConfig(table).foreignKeys.length, 0);
  assert.ok(expected > 0, "sanity: the source schema should declare foreign keys");
  assert.equal(occurrences("foreignKey({"), expected);
});

test("every CHECK constraint survives generation — these carry the credential sealed-shape invariants", () => {
  const expected = sourceTables().reduce((n, { table }) => n + getTableConfig(table).checks.length, 0);
  assert.ok(expected > 0, "sanity: the source schema should declare CHECK constraints");
  assert.equal(occurrences("check("), expected);
});

test("every composite primary key survives generation", () => {
  const expected = sourceTables().reduce((n, { table }) => n + getTableConfig(table).primaryKeys.length, 0);
  assert.ok(expected > 0, "sanity: the source schema should declare composite primary keys");
  assert.equal(occurrences("primaryKey({"), expected);
});

test("every index survives generation, unique and non-unique alike", () => {
  const all = sourceTables().flatMap(({ table }) => getTableConfig(table).indexes);
  const expectedUnique = all.filter((idx) => idx.config.unique).length;
  const expectedPlain = all.length - expectedUnique;
  assert.ok(all.length > 0, "sanity: the source schema should declare indexes");

  // `occurrences("index(")` counts only the non-unique builder: the literal "index(" does not
  // appear inside "uniqueIndex(", which has a capital I. Asserting the two separately also catches
  // a generator that emitted the right total while getting uniqueness wrong — which a bare sum
  // would silently accept, and which would let duplicate rows into a table SQLite keeps unique.
  assert.equal(occurrences("uniqueIndex("), expectedUnique, "unique index count differs");
  assert.equal(occurrences("index("), expectedPlain, "non-unique index count differs");
});

test("every column-level unique() constraint survives generation — this is what SQLite rejects duplicate rows on", () => {
  const expected = sourceTables().reduce(
    (n, { table }) => n + getTableConfig(table).columns.filter((c) => c.isUnique).length,
    0
  );
  assert.ok(expected > 0, "sanity: the source schema should declare at least one unique column");

  // `.unique(` (with the leading dot) only matches the column-modifier call, not `uniqueIndex(` —
  // that builder's name has no dot immediately before "unique", so the two never collide here.
  assert.equal(occurrences(".unique("), expected, "column-level unique() count differs");
});

test("every SQLiteInteger column is widened to bigint(mode:\"number\") — a plain integer() silently caps autoincrement PKs and counters at 2^31", () => {
  const expectedBigint = sourceTables().reduce(
    (n, { table }) => n + getTableConfig(table).columns.filter((c) => c.columnType === "SQLiteInteger").length,
    0
  );
  assert.ok(expectedBigint > 0, "sanity: the source schema should declare SQLiteInteger columns");

  // `bigint(` only matches the column-builder call, since the import line lists the identifier as
  // `bigint,` with no immediately-following "(" — same reasoning the other count tests in this file
  // rely on for "foreignKey({", "check(", etc.
  assert.equal(occurrences("bigint("), expectedBigint, "bigint(...) count differs from the number of SQLiteInteger columns in schema.ts");
  assert.equal(occurrences("integer("), 0, "a SQLiteInteger column rendered as plain integer(...) instead of being widened to bigint");
});

test("column count matches per table — a dropped column would not be caught by the drift test", () => {
  for (const { exportName, table } of sourceTables()) {
    const cfg = getTableConfig(table);
    const block = new RegExp(`export const ${exportName} = pgTable\\("[^"]+", \\{([\\s\\S]*?)\\n\\}`).exec(GENERATED);
    assert.ok(block, `no generated block found for ${exportName}`);
    const declared = (block[1].match(/^\s{2}\w+:/gm) ?? []).length;
    assert.equal(declared, cfg.columns.length, `${exportName} column count differs`);
  }
});

/**
 * Builds the "sealed shape" CHECK's expected bare SQL text directly from the table's own column
 * names, using the pattern transcribed by hand from `schema.ts` (all sealed columns NULL, or all
 * NOT NULL) — NOT by calling `renderSqlText()`/`renderTable()` from the generator. A generator whose
 * translation logic silently mis-renders CHECK bodies would, by construction, still agree with
 * itself; this only agrees with it if the actual emitted text matches an independently-authored
 * expectation of what the constraint means.
 */
function sealedShapeCheckSql(table: object, sealedColumns: readonly string[]): string {
  const cols = sealedColumns.map((key) => (table as Record<string, { name: string }>)[key].name);
  const allNull = cols.map((n) => `${n} IS NULL`).join(" AND ");
  const allSet = cols.map((n) => `${n} IS NOT NULL`).join(" AND ");
  return `(${allNull}) OR (${allSet})`;
}

test("sealed-shape CHECK SQL text is semantically exact on every credential table — a count match cannot tell a correct constraint from a corrupted one with the same token count", () => {
  // Column lists transcribed from each table's own `check(...)` declaration in schema.ts, not
  // inferred — a table with the wrong column list here would itself be a bug in this test, which is
  // exactly why the assertion below is on the literal generated text, not on this list's shape.
  const cases: ReadonlyArray<{ table: object; checkName: string; sealedColumns: readonly string[] }> = [
    {
      table: sqliteSchema.siteAssistantCredentials,
      checkName: "site_assistant_credentials_sealed_shape",
      sealedColumns: ["sealedKeyId", "sealedCiphertext", "sealedNonce", "sealedAlg", "masked"],
    },
    {
      table: sqliteSchema.adminExecutionCredentials,
      checkName: "admin_execution_credentials_sealed_shape",
      sealedColumns: ["sealedKeyId", "sealedCiphertext", "sealedNonce", "sealedAlg", "masked"],
    },
    {
      table: sqliteSchema.mediaProviderCredentials,
      checkName: "media_provider_credentials_sealed_shape",
      sealedColumns: ["sealedKeyId", "sealedCiphertext", "sealedNonce", "sealedAlg", "keyTail"],
    },
    {
      table: sqliteSchema.composioConfig,
      checkName: "composio_config_sealed_shape",
      sealedColumns: ["sealedKeyId", "sealedCiphertext", "sealedNonce", "sealedAlg", "keyTail"],
    },
    {
      table: sqliteSchema.externalMcpServers,
      checkName: "external_mcp_servers_sealed_shape",
      sealedColumns: ["sealedKeyId", "sealedCiphertext", "sealedNonce", "sealedAlg"],
    },
    {
      table: sqliteSchema.composioConnectorCredentials,
      checkName: "composio_connector_credentials_sealed_shape",
      sealedColumns: ["sealedKeyId", "sealedCiphertext", "sealedNonce", "sealedAlg"],
    },
  ];
  assert.equal(
    cases.length,
    sourceTables().reduce((n, { table }) => n + getTableConfig(table).checks.filter((c) => c.name.endsWith("_sealed_shape")).length, 0),
    "this test's case list has drifted from the number of *_sealed_shape CHECK constraints actually declared in schema.ts"
  );
  for (const { table, checkName, sealedColumns } of cases) {
    const expected = sealedShapeCheckSql(table, sealedColumns);
    const pattern = new RegExp(`check\\(${JSON.stringify(checkName)}, sql\`${escapeRegExp(expected)}\`\\)`);
    assert.match(GENERATED, pattern, `"${checkName}" CHECK text does not match the expected sealed-shape semantics`);
  }
});

test("posts_body_format_shape CHECK preserves the exact-one-body-column-populated semantics", () => {
  const cols = sqliteSchema.posts as unknown as Record<string, { name: string }>;
  const [fmt, json, html] = [cols.bodyFormat.name, cols.bodyJson.name, cols.bodyHtml.name];
  const expected = `(${fmt} = 'doc' AND ${json} IS NOT NULL AND ${html} IS NULL) OR (${fmt} = 'html' AND ${html} IS NOT NULL AND ${json} IS NULL)`;
  const pattern = new RegExp(`check\\("posts_body_format_shape", sql\`${escapeRegExp(expected)}\`\\)`);
  assert.match(GENERATED, pattern, "posts_body_format_shape CHECK text does not match the expected semantics");
});

test("every index's column list and order in the generated schema exactly matches source, and no source index carries an untested WHERE predicate or expression column", () => {
  for (const { exportName, table } of sourceTables()) {
    const cfg = getTableConfig(table);
    const tsNames = tsPropertyNames(table, cfg.columns);
    for (const idx of cfg.indexes) {
      const describe = `${exportName}'s index "${idx.config.name}"`;
      // Every column in schema.ts's indexes today is a plain column (confirmed by this assertion,
      // not assumed) — a source index that starts using asc()/desc()/an expression would need this
      // test extended to assert its exact translated text before this test could trust it, the same
      // way the fixtures test proves that translation independently of the real schema.
      for (const entry of idx.config.columns) {
        assert.ok(!is(entry, SQL), `${describe} uses an expression/ordered column — extend this test with its exact expected text`);
      }
      assert.equal(idx.config.where, undefined, `${describe} carries a WHERE predicate — extend this test with its exact expected text`);

      const argList = idx.config.columns.map((c) => `t.${tsNames.get(c as SQLiteColumn)}`).join(", ");
      const builder = idx.config.unique ? "uniqueIndex" : "index";
      const expected = `${builder}(${JSON.stringify(idx.config.name)}).on(${argList})`;
      assert.ok(GENERATED.includes(expected), `${describe}: expected to find exact "${expected}" in the generated file`);
    }
  }
});
