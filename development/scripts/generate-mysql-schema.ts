/**
 * @file Generates `src/platform/db/schema.mysql.ts` from `src/platform/db/schema.sqlite.ts`.
 *
 * Same contract as `generate-postgres-schema.ts` — read that file's module doc first: the SQLite
 * schema is the one authored definition, every other dialect is a build artifact, and
 * `src/platform/db/__tests__/schema-mysql-drift.test.ts` fails CI when the committed file and the
 * generator's output disagree. The shape-completeness gates (`assertKnownShape`, the hardened
 * `renderSqlText`, TS-name recovery) are imported from that generator rather than copied, so a gap
 * closed there is closed here too.
 *
 * This file only documents what is DIFFERENT about MySQL (8.0.16+ — the first release that
 * enforces CHECK constraints; see `CHECK_CONSTRAINTS` below). MariaDB is not a target: its `JSON`
 * is a LONGTEXT alias, not a binary type, and it diverges on replication.
 *
 * MySQL-specific decisions, each enforced in code below rather than trusted:
 *  1. Keyed TEXT -> `varchar(191)`. MySQL cannot index, key, or reference a TEXT/BLOB column
 *     without a prefix length, and Drizzle has no prefix-index syntax. So every text column that is
 *     a primary key, `.unique()`, an index member, a composite-PK member, or either end of a foreign
 *     key becomes `varchar(KEY_VARCHAR_LENGTH)`; every other text column stays unbounded `text`.
 *     See `KEY_VARCHAR_LENGTH` for why 191.
 *  2. JSON TEXT -> native `JSON`, still typed `string`. "JSON" means the migration manifest's
 *     `json-text` class (`_json` suffix plus its reviewed allowlist, e.g. `posts.ext`) — the same
 *     predicate the Postgres generator uses for `jsonb`. See `JSON_TEXT_DECLARATION`.
 *  3. Literal defaults on `text`/`JSON` are emitted as expression defaults (`DEFAULT ('...')`):
 *     MySQL rejects a plain literal default on TEXT/BLOB/JSON (error 1101) and accepts the
 *     parenthesised expression form from 8.0.13. `varchar` keeps a plain literal default.
 *  4. Integers -> `bigint(..., { mode: "number" })`, autoincrement -> `.autoincrement()`. SQLite
 *     INTEGER is 64-bit, so BIGINT is the faithful width — same reasoning as the Postgres generator.
 *  5. Booleans -> `boolean()` (MySQL `tinyint(1)`), which stores 0/1 exactly as SQLite does.
 *  6. Timestamps stay text (ISO-8601), as in `schema.sqlite.ts`; stored semantics do not change.
 *  7. MySQL has no partial indexes and needs `((expr))` for functional ones — both are rejected
 *     rather than silently dropped (no live case today).
 *  8. Identifiers are capped at 64 characters and each index at 3072 key bytes (InnoDB DYNAMIC);
 *     both are asserted at generation time so an over-long name or too-wide index fails here, not
 *     at `CREATE TABLE` on someone's server.
 *
 * Not handled, same as Postgres: FTS5 (`post_search_fts` is raw SQL; MySQL's equivalent is a
 * FULLTEXT index with a different ranking model and must be hand-authored).
 *
 * Run: `npx tsx development/scripts/generate-mysql-schema.ts`
 * Check (CI): `npx tsx development/scripts/generate-mysql-schema.ts --check`
 */
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

import { Column, is } from "drizzle-orm";
import { getTableConfig, type SQLiteColumn } from "drizzle-orm/sqlite-core";

import { classifyCoreColumn } from "../../apps/website/src/platform/db/migration/manifest.js";
import * as schema from "../../apps/website/src/platform/db/schema.sqlite.js";
import { assertKnownShape, columnRef, renderSqlText, tsPropertyNames } from "./generate-postgres-schema.js";

const OUT_PATH = path.resolve(import.meta.dirname, "../../apps/website/src/platform/db/schema.mysql.ts");
const DRIZZLE_IS_TABLE = Symbol.for("drizzle:IsDrizzleTable");

/**
 * Length of every keyed text column. Keys here are `crypto.randomUUID()` ids (36 chars), sha256 hex
 * (64), token hashes (64), slugs, labels, status/enum words and ISO timestamps (24) — 191 covers
 * all of them with room. 191 is the specific number because it is the largest length whose utf8mb4
 * worst case (191 x 4 = 764 bytes) fits the legacy 767-byte single-column key limit, and because the
 * widest index in the schema (`entry_terms_unique`, four text columns) then costs 4 x 764 = 3056
 * bytes, just inside InnoDB's 3072-byte limit. Raising it would break that index; the byte-budget
 * assertion below turns any future too-wide index into a generator failure.
 *
 * Behavioral difference to know about: SQLite enforces no length, so a keyed value longer than 191
 * characters that SQLite accepts is rejected by MySQL strict mode.
 */
const KEY_VARCHAR_LENGTH = 191;
const UTF8MB4_MAX_BYTES_PER_CHAR = 4;
const INNODB_MAX_KEY_BYTES = 3072;
const MYSQL_MAX_IDENTIFIER_LENGTH = 64;

/** Worst-case key bytes per generated column kind, for the index byte-budget assertion. */
function keyBytes(col: SQLiteColumn): number {
  switch (col.columnType) {
    case "SQLiteText":
      return KEY_VARCHAR_LENGTH * UTF8MB4_MAX_BYTES_PER_CHAR;
    case "SQLiteInteger":
      return 8;
    case "SQLiteBoolean":
      return 1;
    default:
      throw new Error(`no key-byte width for column kind "${col.columnType}" on "${col.name}"`);
  }
}

/**
 * A `*_json` column in `schema.sqlite.ts` holds an already-serialised JSON string (repositories
 * `JSON.stringify` on write and `JSON.parse` on read). Drizzle's own `json()` would stringify that
 * string a second time and store a JSON string scalar, and mysql2 hands a JSON column back already
 * parsed — either would change what repository code sees. This custom type keeps the TypeScript
 * type `string` (identical to the SQLite and Postgres schemas, so one repository can target all
 * three) while the column itself is native binary `JSON`: the string passes through on write, and a
 * driver-parsed value is re-serialised on read.
 *
 * Consequences: MySQL rejects a write that is not valid JSON (SQLite would accept it), and it
 * normalises documents (key order, whitespace), so a read returns equivalent JSON, not the
 * byte-identical string written.
 */
const JSON_TEXT_DECLARATION = `/** Native MySQL JSON column exposed as the same serialised \`string\` the SQLite schema stores. */
const jsonText = customType<{ data: string; driverData: unknown }>({
  dataType: () => "json",
  toDriver: (value) => value,
  fromDriver: (value) => (typeof value === "string" ? value : JSON.stringify(value)),
});`;

/** Every exported Drizzle table in `schema.sqlite.ts`, paired with the export name it must keep. */
function collectTables(): Array<{ exportName: string; table: never }> {
  return Object.entries(schema)
    .filter(([, v]) => Boolean(v && typeof v === "object" && (v as unknown as Record<symbol, unknown>)[DRIZZLE_IS_TABLE]))
    .map(([exportName, table]) => ({ exportName, table: table as never }));
}

const EXPORT_NAME_BY_TABLE: Map<object, string> = new Map(
  collectTables().map(({ exportName, table }) => [table as object, exportName])
);

/**
 * Every column that MySQL must be able to index, across the whole schema. Computed globally because
 * a foreign key makes its TARGET column (in another table) keyed too, and both ends must end up with
 * the identical `varchar(191)` type or MySQL refuses the constraint.
 */
function collectKeyedColumns(): Set<SQLiteColumn> {
  const keyed = new Set<SQLiteColumn>();
  for (const { table } of collectTables()) {
    const cfg = getTableConfig(table);
    for (const col of cfg.columns) if (col.primary || col.isUnique) keyed.add(col);
    for (const idx of cfg.indexes) for (const c of idx.config.columns) if (is(c, Column)) keyed.add(c as unknown as SQLiteColumn);
    for (const pk of cfg.primaryKeys) for (const c of pk.columns) keyed.add(c);
    for (const fk of cfg.foreignKeys) {
      const ref = fk.reference();
      for (const c of [...ref.columns, ...ref.foreignColumns]) keyed.add(c as SQLiteColumn);
    }
  }
  return keyed;
}

const KEYED_COLUMNS = collectKeyedColumns();

function isJsonColumn(col: SQLiteColumn): boolean {
  if (col.columnType !== "SQLiteText") return false;
  const tableSqlName = getTableConfig((col as unknown as { table: never }).table).name;
  return classifyCoreColumn(tableSqlName, col).kind === "json-text";
}

function columnBuilder(col: SQLiteColumn): string {
  const name = JSON.stringify(col.name);
  switch (col.columnType) {
    case "SQLiteText":
      if (isJsonColumn(col)) {
        if (KEYED_COLUMNS.has(col)) {
          throw new Error(
            `JSON column "${col.name}" is keyed/indexed. MySQL cannot index a JSON column directly — index a ` +
              `real column instead.`
          );
        }
        return `jsonText(${name})`;
      }
      return KEYED_COLUMNS.has(col) ? `varchar(${name}, { length: ${KEY_VARCHAR_LENGTH} })` : `text(${name})`;
    case "SQLiteBoolean":
      return `boolean(${name})`;
    case "SQLiteInteger":
      return `bigint(${name}, { mode: "number" })`;
    default:
      throw new Error(
        `unmapped column kind "${col.columnType}" on column "${col.name}". ` +
          `Adding a new kind to schema.sqlite.ts requires teaching columnBuilder about it first.`
      );
  }
}

function escapeTemplateText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

/** Literal default; TEXT and JSON columns take the parenthesised expression form (decision 3). */
function renderDefault(col: SQLiteColumn, builder: string): string {
  const value = col.default;
  if (value === undefined) return "";
  if (typeof value === "string") {
    if (builder.startsWith("varchar(")) return `.default(${JSON.stringify(value)})`;
    const sqlLiteral = `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
    return `.default(sql\`(${escapeTemplateText(sqlLiteral)})\`)`;
  }
  if (typeof value === "number" || typeof value === "boolean") return `.default(${value})`;
  throw new Error(`column "${col.name}" has a non-literal default (${typeof value}); not translated automatically.`);
}

/** Mirrors the Postgres generator's column gates: anything it does not translate must stay unset. */
const KNOWN_COLUMN_PROPS = new Set([
  "columnType", "primary", "autoIncrement", "notNull", "default", "isUnique", "uniqueName",
  "name", "table", "keyAsName", "dataType", "config", "mode", "hasDefault",
  "length", "defaultFn", "onUpdateFn", "uniqueType", "enumValues", "generated", "generatedIdentity",
]);
const UNTRANSLATED_COLUMN_PROPS = ["length", "defaultFn", "onUpdateFn", "uniqueType", "enumValues", "generated", "generatedIdentity"];

function assertKnownColumnShape(col: SQLiteColumn): void {
  assertKnownShape(col, KNOWN_COLUMN_PROPS, () => `column "${col.name}"`);
  for (const prop of UNTRANSLATED_COLUMN_PROPS) {
    const value = (col as unknown as Record<string, unknown>)[prop];
    if (value !== undefined) {
      throw new Error(`column "${col.name}" sets "${prop}" (${JSON.stringify(value)}), which this generator does not translate to MySQL.`);
    }
  }
}

function assertIdentifier(name: string, what: string): void {
  if (name.length > MYSQL_MAX_IDENTIFIER_LENGTH) {
    throw new Error(`${what} "${name}" is ${name.length} characters; MySQL identifiers are capped at ${MYSQL_MAX_IDENTIFIER_LENGTH}.`);
  }
}

function assertKeyBudget(cols: readonly SQLiteColumn[], what: string): void {
  const bytes = cols.reduce((sum, c) => sum + keyBytes(c), 0);
  if (bytes > INNODB_MAX_KEY_BYTES) {
    throw new Error(`${what} needs ${bytes} key bytes; InnoDB allows ${INNODB_MAX_KEY_BYTES}. See KEY_VARCHAR_LENGTH.`);
  }
}

function renderColumn(tsName: string, col: SQLiteColumn, tableSqlName: string): string {
  assertKnownColumnShape(col);
  assertIdentifier(col.name, `column of "${tableSqlName}"`);
  const builder = columnBuilder(col);
  let out = builder;
  if (col.primary) {
    assertKeyBudget([col], `primary key of "${tableSqlName}"`);
    out += (col as unknown as { autoIncrement?: boolean }).autoIncrement ? ".autoincrement().primaryKey()" : ".primaryKey()";
  }
  if (col.notNull && !col.primary) out += ".notNull()";
  if (col.isUnique) {
    // Same default-name rule as SQLite/Postgres (`${table}_${column}_unique`, mysql-core/unique-constraint.js).
    assertIdentifier(col.uniqueName!, "unique constraint");
    const defaultUniqueName = `${tableSqlName}_${col.name}_unique`;
    out += col.uniqueName === defaultUniqueName ? ".unique()" : `.unique(${JSON.stringify(col.uniqueName)})`;
  }
  out += renderDefault(col, builder);
  return `  ${tsName}: ${out},`;
}

const HANDLED_TABLE_CONFIG_KEYS = new Set(["columns", "indexes", "foreignKeys", "checks", "primaryKeys", "uniqueConstraints", "name"]);
const HANDLED_INDEX_CONFIG_KEYS = new Set(["name", "columns", "unique", "where", "table"]);
const HANDLED_FOREIGN_KEY_KEYS = new Set(["table", "reference", "onUpdate", "onDelete"]);
const HANDLED_FOREIGN_KEY_REFERENCE_KEYS = new Set(["name", "columns", "foreignTable", "foreignColumns"]);
const HANDLED_PRIMARY_KEY_KEYS = new Set(["table", "columns", "name"]);
const HANDLED_CHECK_KEYS = new Set(["table", "name", "value"]);

function exportNameOfTable(table: object): string {
  const name = EXPORT_NAME_BY_TABLE.get(table);
  if (!name) throw new Error(`a foreign key targets a table not exported from schema.sqlite.ts ("${getTableConfig(table as never).name}")`);
  return name;
}

function foreignTsName(table: object, column: SQLiteColumn): string {
  const name = tsPropertyNames(table, getTableConfig(table as never).columns).get(column);
  if (!name) throw new Error(`could not resolve the TypeScript name of foreign column "${column.name}"`);
  return name;
}

function renderExtras(
  cfg: ReturnType<typeof getTableConfig>,
  exportName: string,
  tsNames: Map<SQLiteColumn, string>,
  table: object
): string[] {
  const indexes = cfg.indexes.map((idx) => {
    const describe = `table "${exportName}"'s index "${idx.config.name}"`;
    assertKnownShape(idx.config, HANDLED_INDEX_CONFIG_KEYS, () => describe);
    assertIdentifier(idx.config.name, "index");
    if (idx.config.where !== undefined) {
      throw new Error(`${describe} is a partial index; MySQL has no partial indexes (decision 7).`);
    }
    const cols = idx.config.columns.map((c) => {
      if (!is(c, Column)) throw new Error(`${describe} has an expression/ordered entry; not translated to MySQL (decision 7).`);
      return c as unknown as SQLiteColumn;
    });
    assertKeyBudget(cols, describe);
    const builder = idx.config.unique ? "uniqueIndex" : "index";
    return `    ${builder}(${JSON.stringify(idx.config.name)}).on(${cols.map((c) => columnRef(c, tsNames)).join(", ")}),`;
  });

  const composite = cfg.primaryKeys.map((pk) => {
    assertKnownShape(pk, HANDLED_PRIMARY_KEY_KEYS, () => `table "${exportName}"'s primary key`);
    assertKeyBudget(pk.columns, `table "${exportName}"'s composite primary key`);
    return `    primaryKey({ columns: [${pk.columns.map((c) => columnRef(c, tsNames)).join(", ")}] }),`;
  });

  // CHECK_CONSTRAINTS: enforced from MySQL 8.0.16; earlier servers parse and silently ignore them.
  const checks = cfg.checks.map((ch) => {
    const c = ch as unknown as { name: string; value: unknown };
    const describe = () => `table "${exportName}"'s check "${c.name}"`;
    assertKnownShape(ch, HANDLED_CHECK_KEYS, describe);
    assertIdentifier(c.name, "check constraint");
    return `    check(${JSON.stringify(c.name)}, sql\`${renderSqlText(c.value, table, describe)}\`),`;
  });

  const foreignKeys = cfg.foreignKeys.map((fk) => {
    assertKnownShape(fk, HANDLED_FOREIGN_KEY_KEYS, () => `table "${exportName}"'s foreign key`);
    assertIdentifier(fk.getName(), "foreign key");
    const target = fk.reference();
    assertKnownShape(target, HANDLED_FOREIGN_KEY_REFERENCE_KEYS, () => `table "${exportName}"'s foreign key reference`);
    const meta = fk as unknown as { onDelete?: string; onUpdate?: string };
    const localCols = target.columns.map((c) => columnRef(c as SQLiteColumn, tsNames)).join(", ");
    const foreignExport = exportNameOfTable(target.foreignTable);
    const foreignCols = target.foreignColumns
      .map((c) => `${foreignExport}.${foreignTsName(target.foreignTable, c as SQLiteColumn)}`)
      .join(", ");
    const actions =
      (meta.onDelete ? `.onDelete(${JSON.stringify(meta.onDelete)})` : "") +
      (meta.onUpdate ? `.onUpdate(${JSON.stringify(meta.onUpdate)})` : "");
    return `    foreignKey({ columns: [${localCols}], foreignColumns: [${foreignCols}] })${actions},`;
  });

  return [...composite, ...foreignKeys, ...checks, ...indexes];
}

function renderTable(exportName: string, table: never): string {
  const cfg = getTableConfig(table);
  assertKnownShape(cfg, HANDLED_TABLE_CONFIG_KEYS, () => `table "${exportName}"'s config`);
  if (cfg.uniqueConstraints.length > 0) {
    throw new Error(`table "${exportName}" declares a table-level unique(...).on(...); teach renderExtras() about it first.`);
  }
  assertIdentifier(cfg.name, "table");
  const tsNames = tsPropertyNames(table, cfg.columns);
  const columns = cfg.columns.map((c) => renderColumn(tsNames.get(c)!, c, cfg.name)).join("\n");
  const extras = renderExtras(cfg, exportName, tsNames, table);
  const tail = extras.length ? `, (t) => [\n${extras.join("\n")}\n  ]` : "";
  return `export const ${exportName} = mysqlTable(${JSON.stringify(cfg.name)}, {\n${columns}\n}${tail});`;
}

function generate(): string {
  const tables = collectTables();
  const body = tables.map(({ exportName, table }) => renderTable(exportName, table)).join("\n\n");
  return `/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Produced from \`src/platform/db/schema.sqlite.ts\` by \`development/scripts/generate-mysql-schema.ts\`.
 * Edit the SQLite schema and regenerate; editing this file directly will be overwritten and will
 * fail the drift check in CI. Targets MySQL 8.0.16+ (not MariaDB) — the generator's module doc
 * lists every MySQL-specific mapping (varchar(${KEY_VARCHAR_LENGTH}) keys, native JSON, expression defaults).
 *
 * FTS5 search objects are absent on purpose — see the generator's module doc.
 *
 * Tables: ${tables.length}
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  foreignKey,
  index,
  mysqlTable,
  primaryKey,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

${JSON_TEXT_DECLARATION}

${body}
`;
}

function main(): void {
  const generated = generate();
  if (!process.argv.includes("--check")) {
    fs.writeFileSync(OUT_PATH, generated, "utf8");
    process.stdout.write(`wrote ${path.relative(process.cwd(), OUT_PATH)}\n`);
    return;
  }
  const current = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, "utf8") : "";
  if (current === generated) {
    process.stdout.write("schema.mysql.ts is up to date with schema.sqlite.ts\n");
    return;
  }
  process.stderr.write(
    "DRIFT: src/platform/db/schema.mysql.ts does not match what schema.sqlite.ts generates.\n" +
      "Run `npx tsx development/scripts/generate-mysql-schema.ts` and commit the result.\n"
  );
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
