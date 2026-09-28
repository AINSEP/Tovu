import { is, SQL } from "drizzle-orm";
import { getTableConfig, PgDialect, type IndexedColumn, type PgColumn, type PgTable } from "drizzle-orm/pg-core";

import { computeCoreTableCopyOrder, DERIVED_OBJECTS } from "../../platform/db/migration/manifest.js";
import * as pgSchema from "../../platform/db/schema.postgres.js";
import { EXCLUDED_CORE_TABLES, PARTIALLY_EXCLUDED_TABLES, SECRET_COLUMN_PATTERN, TRANSFER_EXCLUSION_REASON_TEXT } from "./exclusions.js";
import type { SourceColumn, SourceTableLayout, TransferSource } from "./sqlite-source.js";

/**
 * @file What a copy carries: every table in the site's snapshot is either a {@link TransferTable}
 * (with its full Postgres layout: columns, defaults, identity, primary key, indexes, foreign keys and
 * checks) or left out with a reason — never silently dropped ({@link planSnapshotTables}).
 *
 * - Core tables take their layout from `schema.postgres.ts` (generated from the SQLite schema).
 * - Every other table (a plugin's `p_<id>__*` tables, for example) takes the layout the snapshot
 *   itself declares, translated by SQLite type affinity: INTEGER -> bigint (a lone INTEGER primary key
 *   is SQLite's auto-numbered row id, so it becomes an identity column), REAL -> double precision,
 *   BLOB -> bytea, anything else -> text. Only plain literal defaults are carried.
 */

export interface TransferColumn {
  readonly name: string;
  readonly sqlType: string;
  readonly notNull: boolean;
  /** A Postgres default expression, already SQL. */
  readonly default?: string;
  /** Postgres identity kind; the copy writes the source's numbers, then moves the counter past them. */
  readonly identity?: "ALWAYS" | "BY DEFAULT";
}

export interface TransferIndex {
  readonly name: string;
  readonly columns: readonly string[];
  readonly unique: boolean;
}

export interface TransferForeignKey {
  readonly name: string;
  readonly columns: readonly string[];
  readonly foreignTable: string;
  /** `null` = the parent's primary key (a SQLite foreign key may leave its columns out). */
  readonly foreignColumns: readonly string[] | null;
  readonly onDelete: string;
  readonly onUpdate: string;
}

export interface TransferCheck {
  readonly name: string;
  readonly sql: string;
}

export interface TransferTable {
  readonly name: string;
  readonly columns: readonly TransferColumn[];
  readonly primaryKey: readonly string[];
  /** A source-side predicate selecting the rows that are copied; absent = every row. */
  readonly keep?: string;
  readonly indexes: readonly TransferIndex[];
  readonly foreignKeys: readonly TransferForeignKey[];
  readonly checks: readonly TransferCheck[];
}

const dialect = new PgDialect();

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function coreDefault(column: PgColumn): string | undefined {
  if (!column.hasDefault || column.default === undefined) return undefined;
  const value: unknown = column.default;
  if (is(value, SQL)) return dialect.sqlToQuery(value).sql;
  if (typeof value === "string") return quoteLiteral(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  throw new Error(`schema.postgres.ts: '${column.name}' has a default this copier cannot write`);
}

function coreColumn(column: PgColumn): TransferColumn {
  const base = { name: column.name, sqlType: column.getSQLType(), notNull: column.notNull };
  const fallback = coreDefault(column);
  const identity = (column as unknown as { generatedIdentity?: { type: "always" | "byDefault" } }).generatedIdentity;
  return {
    ...base,
    ...(fallback === undefined ? {} : { default: fallback }),
    ...(identity === undefined ? {} : { identity: identity.type === "always" ? "ALWAYS" : "BY DEFAULT" }),
  };
}

function coreIndexes(cfg: ReturnType<typeof getTableConfig>): TransferIndex[] {
  const declared = cfg.indexes.map((index) => ({
    name: index.config.name ?? `${cfg.name}_idx`,
    columns: index.config.columns.map((column) => {
      const name = is(column, SQL) ? undefined : (column as IndexedColumn).name;
      if (name === undefined) throw new Error(`schema.postgres.ts: index '${index.config.name}' on '${cfg.name}' uses an expression this copier cannot write`);
      return name;
    }),
    unique: index.config.unique,
  }));
  const uniqueColumns = cfg.columns.filter((column) => column.isUnique).map((column) => ({ name: column.uniqueName ?? `${cfg.name}_${column.name}_unique`, columns: [column.name], unique: true }));
  const uniqueConstraints = cfg.uniqueConstraints.map((constraint) => ({ name: constraint.getName() ?? `${cfg.name}_unique`, columns: constraint.columns.map((column) => column.name), unique: true }));
  return [...declared, ...uniqueColumns, ...uniqueConstraints];
}

function coreTable(table: PgTable): TransferTable {
  const cfg = getTableConfig(table);
  const inline = cfg.columns.filter((column) => column.primary).map((column) => column.name);
  const composite = cfg.primaryKeys.flatMap((pk) => pk.columns.map((column) => column.name));
  const keep = PARTIALLY_EXCLUDED_TABLES[cfg.name]?.keep;
  return {
    name: cfg.name,
    columns: cfg.columns.map(coreColumn),
    primaryKey: inline.length > 0 ? inline : composite,
    ...(keep === undefined ? {} : { keep }),
    indexes: coreIndexes(cfg),
    foreignKeys: cfg.foreignKeys.map((fk) => {
      const reference = fk.reference();
      return {
        name: fk.getName(),
        columns: reference.columns.map((column) => column.name),
        foreignTable: getTableConfig(reference.foreignTable).name,
        foreignColumns: reference.foreignColumns.map((column) => column.name),
        onDelete: fk.onDelete ?? "no action",
        onUpdate: fk.onUpdate ?? "no action",
      };
    }),
    checks: cfg.checks.map((check) => ({ name: check.name, sql: dialect.sqlToQuery(check.value).sql })),
  };
}

/**
 * The core tables a copy carries, in foreign-key-safe order, logins and saved keys removed.
 *
 * @complexity O(tables + foreign keys).
 */
export function collectTransferTables(): TransferTable[] {
  const byExportName = pgSchema as unknown as Record<string, PgTable | undefined>;
  return computeCoreTableCopyOrder().flatMap((exportName) => {
    const table = byExportName[exportName];
    if (table === undefined) throw new Error(`schema.postgres.ts has no table exported as '${exportName}'; regenerate it`);
    const transfer = coreTable(table);
    return transfer.name in EXCLUDED_CORE_TABLES ? [] : [transfer];
  });
}

/** Every SQL table name `schema.postgres.ts` declares, copied or not. */
function coreTableNames(): Set<string> {
  const names = new Set<string>();
  for (const value of Object.values(pgSchema) as unknown[]) {
    if (value !== null && typeof value === "object" && Symbol.for("drizzle:IsDrizzleTable") in value) names.add(getTableConfig(value as PgTable).name);
  }
  return names;
}

/** SQLite type affinity (https://sqlite.org/datatype3.html §3.1), mapped onto a Postgres type. */
function postgresTypeFor(declaredType: string): string {
  const type = declaredType.toUpperCase();
  if (type.includes("INT")) return "bigint";
  if (/CHAR|CLOB|TEXT/.test(type)) return "text";
  if (type.includes("BLOB")) return "bytea";
  if (/REAL|FLOA|DOUB/.test(type)) return "double precision";
  return "text";
}

/** Only plain literals travel: a number, or a single-quoted string. Anything else (a function call) is dropped. */
function literalDefault(defaultSql: string | null, sqlType: string): string | undefined {
  if (defaultSql === null || sqlType === "bytea") return undefined;
  const text = defaultSql.trim();
  if (/^-?\d+(\.\d+)?$/.test(text) || /^'(?:[^']|'')*'$/.test(text)) return text;
  return undefined;
}

function introspectedColumn(column: SourceColumn, rowId: boolean): TransferColumn {
  const sqlType = postgresTypeFor(column.declaredType);
  const fallback = literalDefault(column.defaultSql, sqlType);
  return {
    name: column.name,
    sqlType,
    notNull: column.notNull || column.primaryKeyPosition > 0,
    ...(fallback === undefined ? {} : { default: fallback }),
    ...(rowId ? { identity: "BY DEFAULT" as const } : {}),
  };
}

/** A table no Tovu schema file describes, in the layout the snapshot declares. */
function introspectedTable(name: string, layout: SourceTableLayout): TransferTable {
  const primaryKey = layout.columns.filter((column) => column.primaryKeyPosition > 0).sort((a, b) => a.primaryKeyPosition - b.primaryKeyPosition).map((column) => column.name);
  const rowIdColumn = primaryKey.length === 1 ? layout.columns.find((column) => column.name === primaryKey[0] && column.declaredType.toUpperCase() === "INTEGER") : undefined;
  const indexes = layout.indexes
    .filter((index) => index.origin !== "pk" && !index.partial && index.columns.every((column) => column !== null))
    .map((index) => {
      const columns = index.columns as string[];
      return { name: index.origin === "u" ? `${name}_${columns.join("_")}_key` : index.name, columns, unique: index.unique };
    });
  return {
    name,
    columns: layout.columns.map((column) => introspectedColumn(column, column === rowIdColumn)),
    primaryKey,
    indexes,
    foreignKeys: layout.foreignKeys.map((fk) => ({
      name: `${name}_${fk.columns.join("_")}_fkey`,
      columns: fk.columns,
      foreignTable: fk.foreignTable,
      foreignColumns: fk.foreignColumns.some((column) => column === null) ? null : (fk.foreignColumns as string[]),
      onDelete: fk.onDelete.toLowerCase(),
      onUpdate: fk.onUpdate.toLowerCase(),
    })),
    checks: [],
  };
}

export const LEFT_OUT_REASON = {
  bookkeeping: "the database's own bookkeeping is not copied",
  derived: "search indexes are rebuilt from the content, not copied",
  secret: "tables holding passwords, keys or sign-in tokens are not copied",
} as const;

export interface SnapshotTablePlan {
  /** Core tables first (foreign-key-safe order), then the snapshot's other tables by name. */
  readonly tables: readonly TransferTable[];
  readonly leftOut: readonly { readonly table: string; readonly reason: string }[];
}

function isBookkeeping(name: string): boolean {
  return name.startsWith("sqlite_") || name === "__drizzle_migrations" || name.startsWith("_plugin_");
}

/** The reason a non-core table stays behind, or `null` when it is copied. */
function reasonToLeaveOut(name: string, layout: SourceTableLayout, derived: ReadonlySet<string>, virtualTables: readonly string[]): string | null {
  if (isBookkeeping(name)) return LEFT_OUT_REASON.bookkeeping;
  if (derived.has(name) || layout.virtual || virtualTables.some((vt) => name.startsWith(`${vt}_`))) return LEFT_OUT_REASON.derived;
  if (layout.columns.some((column) => SECRET_COLUMN_PATTERN.test(column.name))) return LEFT_OUT_REASON.secret;
  return null;
}

/**
 * Sorts every table in the snapshot into copied or left out (with the reason). Core tables come from
 * `schema.postgres.ts` even when the snapshot lacks them, so {@link countSourceRows} can name the gap.
 *
 * @complexity O(snapshot tables) PRAGMA reads.
 */
export function planSnapshotTables(source: TransferSource): SnapshotTablePlan {
  const core = coreTableNames();
  const tables: TransferTable[] = collectTransferTables();
  const leftOut: { table: string; reason: string }[] = [];
  const derived = new Set(DERIVED_OBJECTS.map((object) => object.name));
  const names = source.tableNames();
  const layouts = new Map(names.map((name) => [name, source.layout(name)] as const));
  const virtualTables = names.filter((name) => layouts.get(name)?.virtual === true);
  for (const name of names) {
    const excluded = EXCLUDED_CORE_TABLES[name];
    if (excluded !== undefined) leftOut.push({ table: name, reason: TRANSFER_EXCLUSION_REASON_TEXT[excluded] });
    const layout = layouts.get(name);
    if (core.has(name) || layout === null || layout === undefined) continue;
    const reason = reasonToLeaveOut(name, layout, derived, virtualTables);
    if (reason === null) tables.push(introspectedTable(name, layout));
    else leftOut.push({ table: name, reason });
  }
  return { tables, leftOut };
}
