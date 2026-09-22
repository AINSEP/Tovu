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
 * So this test compares against the SOURCE OF TRUTH — `schema.sqlite.ts` introspected via Drizzle — rather
 * than against the generator's own output. Counts, not exact SQL, because the two dialects legibly
 * differ in type spelling; a count mismatch means something was dropped or invented.
 *
 * That said, counts alone have a real blind spot: a generator that drops a `WHERE` predicate while
 * keeping the index itself, or reorders an index's columns, or corrupts a CHECK's SQL text, changes
 * *meaning* without changing any count this file was checking before. Two tests below compare meaning
 * directly — CHECK SQL text against a hand-transcribed expectation (see their own doc for why that
 * expectation is NOT derived by calling the generator's own renderer), and each index's exact
 * `.on(...)` argument list/order against source. Both are still measured against `schema.sqlite.ts`, not the
 * generator's output-of-its-own-output, for the same reason the count tests are.
 *
 * The identity and foreign-key tests near the bottom of this file close a related but distinct blind
 * spot, found by external audit: `bigint(...)` count parity (above, and GATE A in
 * `migration-manifest.test.ts`) proves every `SQLiteInteger` column widens to `PgBigInt53` — it never
 * asserts that a column which is also an autoincrement primary key actually becomes
 * `.generatedAlwaysAsIdentity()` on the PostgreSQL side. A generator that regressed to emitting plain
 * `.primaryKey()` on those columns would still pass GATE A, GATE B, and every count test above,
 * because none of them look at identity at all — and a later copier could not reseed a sequence that
 * was never created. Likewise, `occurrences("foreignKey({")` (above) proves nine `foreignKey({` tokens
 * exist; it says nothing about which table each one targets, so a foreign key silently pointed at the
 * wrong table — same count, wrong meaning — passes that test today. Both new tests below resolve
 * columns and tables on *both* sides by identity via `getTableConfig()` — `schema.sqlite.ts` for source,
 * `schema.postgres.ts` (imported as a module, not read as text) for target — and compare what each
 * column/constraint actually *is*, not how many of a token appear.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { SQL, is } from "drizzle-orm";
import { getTableConfig, type SQLiteColumn } from "drizzle-orm/sqlite-core";
import { getTableConfig as getPgTableConfig } from "drizzle-orm/pg-core";

import * as sqliteSchema from "../schema.sqlite.js";
import * as pgSchema from "../schema.postgres.js";

import { tsPropertyNames } from "../../../../../../development/scripts/generate-postgres-schema.js";

const GENERATED = fs.readFileSync(path.resolve(import.meta.dirname, "../schema.postgres.ts"), "utf8");
const DRIZZLE_IS_TABLE = Symbol.for("drizzle:IsDrizzleTable");

/** Escapes a literal string for use inside a `new RegExp(...)` pattern. */
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Every exported Drizzle table on a schema module, paired with its export name. `IsDrizzleTable` is
 * the same symbol on both SQLite and PostgreSQL table instances — it is set by the dialect-agnostic
 * base `Table` class drizzle-orm shares across cores — so this one walk works for `schema.sqlite.ts` and the
 * generated `schema.postgres.ts` alike.
 */
function tablesOf(schemaModule: object): Array<{ exportName: string; table: never }> {
  return Object.entries(schemaModule)
    .filter(([, v]) => Boolean(v && typeof v === "object" && (v as Record<symbol, unknown>)[DRIZZLE_IS_TABLE]))
    .map(([exportName, table]) => ({ exportName, table: table as never }));
}

function sourceTables(): Array<{ exportName: string; table: never }> {
  return tablesOf(sqliteSchema);
}

/** Counts non-overlapping occurrences of a literal token in the generated file. */
const occurrences = (token: string): number => GENERATED.split(token).length - 1;

/**
 * Resolves a table object to the export name it is bound to within `tables` — used to identify a
 * foreign key's target table by *what it is*, not by re-deriving the generator's own
 * `EXPORT_NAME_BY_TABLE` logic (`development/scripts/generate-postgres-schema.ts`). A miss here is a
 * bug in this test's own bookkeeping, not a real finding, so it fails loudly rather than returning
 * `undefined` and letting a caller's `assert.equal` compare `undefined` to `undefined`.
 */
function exportNameOf(tables: ReadonlyArray<{ exportName: string; table: object }>, target: object): string {
  const found = tables.find(({ table }) => table === target);
  assert.ok(found, "internal test error: table not found among its own schema's exports");
  return found.exportName;
}

/**
 * Maps every column on a table to its TS property name, keyed by SQL name rather than object
 * identity. Identity does not work here: PostgreSQL's `pgTable(name, columns, (t) => [...])` builds a
 * SEPARATE column instance — via `buildExtraConfigColumn()` — for use inside that extra-config
 * callback from the instance `getTableConfig(...).columns` exposes (`drizzle-orm/pg-core/table.js`),
 * so a foreign key's `.reference().columns` on the generated schema is never `===` to anything in
 * `cfg.columns`, even though both plainly name the same column. This was found empirically while
 * writing the FK-meaning test below — it failed with "could not resolve TypeScript property name" on
 * a real, correctly-generated foreign key until name resolution switched from identity to SQL name.
 * SQLite does not split the two (`drizzle-orm/sqlite-core/table.js` assigns `ExtraConfigColumns` the
 * *same* object as `Columns`), but resolving by SQL name uniformly, on both dialects, means these
 * tests do not silently start depending on that SQLite-specific behavior staying true either. `.name`
 * is safe to key on: `columnBuilder()` in the generator passes `col.name` through unchanged from the
 * SQLite column to the PostgreSQL builder call, so a source column and its generated counterpart share
 * the identical SQL name by construction.
 */
function tsNamesBySqlName(table: object, columns: readonly { name: string }[]): Map<string, string> {
  const bySqlName = new Map<string, string>();
  for (const [key, value] of Object.entries(table)) {
    const col = columns.find((c) => c === value);
    if (col !== undefined) bySqlName.set(col.name, key);
  }
  return bySqlName;
}

/** Looks up a column's resolved TS property name by its SQL name, failing loudly instead of silently
 * comparing `undefined` to `undefined` — a miss here would quietly pass a comparison that never
 * actually looked at the column it claims to. */
function resolveName(bySqlName: Map<string, string>, col: { name: string }, describe: string): string {
  const name = bySqlName.get(col.name);
  assert.ok(name !== undefined, `${describe}: could not resolve TypeScript property name for SQL column "${col.name}"`);
  return name;
}

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
  assert.equal(occurrences("bigint("), expectedBigint, "bigint(...) count differs from the number of SQLiteInteger columns in schema.sqlite.ts");
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
 * names, using the pattern transcribed by hand from `schema.sqlite.ts` (all sealed columns NULL, or all
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
  // Column lists transcribed from each table's own `check(...)` declaration in schema.sqlite.ts, not
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
      // The SECOND sealed group on this table — the OAuth blob (`{ clientSecret?, tokens? }`), which
      // varies independently of the env block: a server can hold an OAuth token and no env block, or
      // both. Two CHECKs rather than one combined constraint, so neither group's shape can be
      // satisfied by the other group's columns being set.
      table: sqliteSchema.externalMcpServers,
      checkName: "external_mcp_servers_oauth_sealed_shape",
      sealedColumns: ["oauthSealedKeyId", "oauthSealedCiphertext", "oauthSealedNonce", "oauthSealedAlg"],
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
    "this test's case list has drifted from the number of *_sealed_shape CHECK constraints actually declared in schema.sqlite.ts"
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
      // Every column in schema.sqlite.ts's indexes today is a plain column (confirmed by this assertion,
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

test(
  "every source autoincrement primary key becomes an IDENTITY column in the generated schema, matched " +
    "column-by-column via getTableConfig() on both schemas — GATE A (migration-manifest.test.ts) and the " +
    "bigint(...) count test above only prove the column WIDTH; neither asserts IDENTITY, so a generator " +
    "regression that emitted .primaryKey() instead of .generatedAlwaysAsIdentity() would pass both",
  () => {
    const isSourceIdentityPk = (col: SQLiteColumn): boolean =>
      Boolean(col.primary && (col as unknown as { autoIncrement?: boolean }).autoIncrement);

    const expectedIdentityCount = sourceTables().reduce(
      (n, { table }) => n + getTableConfig(table).columns.filter(isSourceIdentityPk).length,
      0
    );
    assert.ok(expectedIdentityCount > 0, "sanity: the source schema should declare at least one autoincrement primary key");

    const pgTables = tablesOf(pgSchema);
    for (const { exportName, table } of sourceTables()) {
      const srcCfg = getTableConfig(table);
      const srcNames = tsNamesBySqlName(table, srcCfg.columns);

      const pgEntry = pgTables.find((t) => t.exportName === exportName);
      assert.ok(pgEntry, `generated schema has no export "${exportName}"`);
      const pgCfg = getPgTableConfig(pgEntry.table);
      // Keyed by SQL name (not TS name) to look up a source column's counterpart directly — the
      // generator carries `col.name` through unchanged, so this join key is exact by construction.
      const pgColumnBySqlName = new Map(pgCfg.columns.map((c) => [c.name, c]));

      for (const col of srcCfg.columns) {
        const tsName = resolveName(srcNames, col, exportName);
        const pgCol = pgColumnBySqlName.get(col.name);
        assert.ok(pgCol, `${exportName}.${tsName} (SQL name "${col.name}") missing from the generated schema`);

        const sourceIsIdentityPk = isSourceIdentityPk(col);
        const targetIsIdentity = pgCol.generatedIdentity !== undefined && pgCol.generatedIdentity.type === "always";
        assert.equal(
          targetIsIdentity,
          sourceIsIdentityPk,
          `${exportName}.${tsName}: source autoincrement-PK=${sourceIsIdentityPk} but generated column identity=${targetIsIdentity}`
        );
      }
    }
  }
);

test(
  "every foreign key's local columns, referenced table, referenced columns, and ON DELETE/UPDATE actions " +
    "match between schemas by meaning — occurrences(\"foreignKey({\") above proves a token count, which " +
    "cannot tell a foreign key pointed at its correct target from one pointed at the wrong table while " +
    "keeping the same number of declarations",
  () => {
    // Drizzle may resolve an un-set FK action differently across versions (`undefined` vs the literal
    // string "no action"). Normalizing both sides through the same function means a routine drizzle-orm
    // dependency bump can fail this test only on an actual behavior difference, never on a representation
    // difference that carries no referential-integrity meaning.
    const normalizeAction = (action: string | undefined): string => action ?? "no action";

    const pgTables = tablesOf(pgSchema);
    for (const { exportName, table } of sourceTables()) {
      const srcCfg = getTableConfig(table);
      const srcNames = tsNamesBySqlName(table, srcCfg.columns);

      const pgEntry = pgTables.find((t) => t.exportName === exportName);
      assert.ok(pgEntry, `generated schema has no export "${exportName}"`);
      const pgCfg = getPgTableConfig(pgEntry.table);
      const pgNames = tsNamesBySqlName(pgEntry.table, pgCfg.columns);

      // Per-table count, not just the schema-wide total the token-count test above already checks: a
      // loss on one table could be masked by a spurious gain on another and still balance globally.
      assert.equal(
        pgCfg.foreignKeys.length,
        srcCfg.foreignKeys.length,
        `${exportName}: source declares ${srcCfg.foreignKeys.length} foreign key(s), generated declares ${pgCfg.foreignKeys.length}`
      );

      srcCfg.foreignKeys.forEach((srcFk, i) => {
        const pgFk = pgCfg.foreignKeys[i];
        const describe = `${exportName}'s foreign key #${i} ("${srcFk.getName()}")`;
        const srcRef = srcFk.reference();
        const pgRef = pgFk.reference();

        // Local FK columns come from the table's `(t) => [...]` extra-config callback, which is
        // exactly where PostgreSQL's identity split (see `tsNamesBySqlName`'s doc) bites — resolving
        // by SQL name is what makes this comparison work on the generated side at all.
        const srcLocal = srcRef.columns.map((c) => resolveName(srcNames, c, describe)).join(",");
        const pgLocal = pgRef.columns.map((c) => resolveName(pgNames, c, `${describe} (generated)`)).join(",");
        assert.equal(pgLocal, srcLocal, `${describe}: local column(s) differ`);

        const srcTargetExport = exportNameOf(sourceTables(), srcRef.foreignTable);
        const pgTargetExport = exportNameOf(pgTables, pgRef.foreignTable);
        assert.equal(pgTargetExport, srcTargetExport, `${describe}: referenced table differs`);

        const srcTargetNames = tsNamesBySqlName(srcRef.foreignTable, getTableConfig(srcRef.foreignTable).columns);
        const pgTargetNames = tsNamesBySqlName(pgRef.foreignTable, getPgTableConfig(pgRef.foreignTable).columns);
        const srcForeign = srcRef.foreignColumns.map((c) => resolveName(srcTargetNames, c, `${describe}'s referenced columns`)).join(",");
        const pgForeign = pgRef.foreignColumns
          .map((c) => resolveName(pgTargetNames, c, `${describe}'s referenced columns (generated)`))
          .join(",");
        assert.equal(pgForeign, srcForeign, `${describe}: referenced column(s) differ`);

        assert.equal(normalizeAction(pgFk.onDelete), normalizeAction(srcFk.onDelete), `${describe}: onDelete action differs`);
        assert.equal(normalizeAction(pgFk.onUpdate), normalizeAction(srcFk.onUpdate), `${describe}: onUpdate action differs`);
      });
    }
  }
);
