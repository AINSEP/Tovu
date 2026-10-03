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

// Transfer types and affinity/exclusion rationale now live in @jini-ai/db/transfer.
export type { TransferColumn, TransferIndex, TransferForeignKey, TransferCheck, TransferTable, SnapshotTablePlan } from "@jini-ai/db/transfer";
import { planSnapshotTables as planGenericSnapshot, introspectedTable, type TransferColumn, type TransferIndex, type TransferTable, type SnapshotTablePlan } from "@jini-ai/db/transfer";
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

/**
 * EVERY table `schema.postgres.ts` declares, in the same foreign-key-safe order, nothing left out:
 * the full schema a fresh Postgres database is created with (`platform/db/pglite/content-schema.ts`).
 *
 * @complexity O(tables + foreign keys).
 */
export function collectSchemaTables(): TransferTable[] {
  const byExportName = pgSchema as unknown as Record<string, PgTable | undefined>;
  return computeCoreTableCopyOrder().map((exportName) => {
    const table = byExportName[exportName];
    if (table === undefined) throw new Error(`schema.postgres.ts has no table exported as '${exportName}'; regenerate it`);
    return coreTable(table);
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

export { LEFT_OUT_REASON } from "@jini-ai/db/transfer";
/** Migration ledgers stay behind: the target's runner owns its applied history. */
const MIGRATION_LEDGERS = new Set(["__drizzle_migrations", "tovu_migrations", "tovu_chat_migrations"]);
export function planSnapshotTables(source: TransferSource): SnapshotTablePlan {
  return planGenericSnapshot({ source, policy: {
    coreTables: collectTransferTables(), coreNames: coreTableNames(),
    excludedTables: Object.fromEntries(Object.entries(EXCLUDED_CORE_TABLES).map(([name, reason]) => [name, TRANSFER_EXCLUSION_REASON_TEXT[reason]])),
    derivedNames: new Set(DERIVED_OBJECTS.map(object => object.name)), migrationLedgers: MIGRATION_LEDGERS,
    bookkeepingPrefixes: ["sqlite_", "_plugin_"], secretColumnPattern: SECRET_COLUMN_PATTERN,
  } });
}
/** chat.db's raw-SQL schema is introspected separately; never use content's Drizzle catalog here. */
export function planChatSnapshotTables(source: TransferSource): SnapshotTablePlan {
  const plan = planGenericSnapshot({ source, policy: {
    coreTables: [], coreNames: new Set(), excludedTables: {}, derivedNames: new Set(),
    migrationLedgers: MIGRATION_LEDGERS, bookkeepingPrefixes: ["sqlite_", "_plugin_"],
    // Chat transcript/session columns are data, not credential records; copy all three raw-SQL tables.
    secretColumnPattern: /(?!)/,
  } });
  const order = ["ai_chats", "ai_chat_messages", "assistant_agent_sessions"];
  return { ...plan, tables: [...plan.tables].sort((a, b) => {
    const rank = (name: string) => order.includes(name) ? order.indexOf(name) : order.length;
    return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
  }) };
}
