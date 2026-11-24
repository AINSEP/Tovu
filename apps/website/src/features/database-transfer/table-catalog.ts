import { is, SQL } from "drizzle-orm";
import { getTableConfig, PgDialect, type IndexedColumn, type PgColumn, type PgTable } from "drizzle-orm/pg-core";

import { EXCLUDED_CORE_TABLES, PARTIALLY_EXCLUDED_TABLES, SECRET_COLUMN_PATTERN, TRANSFER_EXCLUSION_REASON_TEXT } from "./exclusions.js";
import {
  collectCatalogSchemaTables, collectCatalogTransferTables, planCatalogSnapshotTables, planIntrospectedSnapshotTables,
  type CatalogIntrospection, type CatalogSchemaPorts, type SnapshotTablePlan, type TransferSource, type TransferTable,
} from "@jini-ai/db/transfer";

/**
 * @file Tovu's binding of Jini's generic transfer catalog (`@jini-ai/db/transfer`): what a copy carries.
 * Every table in the site's snapshot is either a transfer table (full Postgres layout) or left out with a
 * reason — never silently dropped. Jini owns the projection and planning; this file supplies the drizzle
 * introspection port, the exclusion tables ({@link EXCLUDED_CORE_TABLES}) and Tovu's table/ledger names.
 *
 * - Core tables take their layout from `schema.postgres.ts` (generated from the SQLite schema).
 * - Every other table (a plugin's `p_<id>__*` tables, for example) takes the layout the snapshot
 *   itself declares (see `introspectedTable` in Jini).
 */

const dialect = new PgDialect();

/** Reads drizzle's Postgres table config into the neutral shape Jini's catalog consumes. */
const drizzleIntrospection: CatalogIntrospection = {
  tableName: (table) => getTableConfig(table as PgTable).name,
  isTable: (value) => Symbol.for("drizzle:IsDrizzleTable") in (value as object),
  isSql: (value) => is(value, SQL),
  renderSql: ({ value, indexTerm }) => indexTerm === true
    ? dialect.sqlToQuery(new SQL((value as SQL).queryChunks).inlineParams(), "indexes").sql
    : dialect.sqlToQuery(value as SQL).sql,
  tableConfig: (table) => {
    const cfg = getTableConfig(table as PgTable);
    return {
      name: cfg.name,
      columns: cfg.columns.map((column: PgColumn) => {
        const identity = (column as unknown as { generatedIdentity?: { type: "always" | "byDefault" } }).generatedIdentity;
        return {
          name: column.name, sqlType: column.getSQLType(), notNull: column.notNull, primary: column.primary,
          isUnique: column.isUnique, uniqueName: column.uniqueName, hasDefault: column.hasDefault, default: column.default,
          ...(identity === undefined ? {} : { identity: identity.type }),
        };
      }),
      indexes: cfg.indexes.map((index) => ({
        name: index.config.name,
        // Drizzle's index terms are a column or an SQL expression.
        terms: index.config.columns.map((column) => is(column, SQL) ? { kind: "sql" as const, sql: column } : { kind: "column" as const, name: (column as IndexedColumn).name }),
        unique: index.config.unique,
        where: index.config.where,
      })),
      uniqueConstraints: cfg.uniqueConstraints.map((constraint) => ({ name: constraint.getName(), columns: constraint.columns.map((column) => column.name) })),
      primaryKeys: cfg.primaryKeys.map((pk) => ({ columns: pk.columns.map((column) => column.name) })),
      foreignKeys: () => cfg.foreignKeys.map((fk) => {
        const reference = fk.reference();
        return {
          name: fk.getName(),
          columns: reference.columns.map((column) => column.name),
          foreignTable: getTableConfig(reference.foreignTable).name,
          foreignColumns: reference.foreignColumns.map((column) => column.name),
          onDelete: fk.onDelete,
          onUpdate: fk.onUpdate,
        };
      }),
      checks: cfg.checks.map((check) => ({ name: check.name, value: check.value })),
    };
  },
};

export interface CoreTableCatalogPorts {
  schema: Readonly<Record<string, PgTable | undefined>>;
  copyOrder: () => readonly string[];
  derivedNames: ReadonlySet<string>;
}

const EXCLUDED_TABLE_REASONS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(EXCLUDED_CORE_TABLES).map(([name, reason]) => [name, TRANSFER_EXCLUSION_REASON_TEXT[reason]]),
);

function jiniCatalog({ catalog }: { catalog: CoreTableCatalogPorts }, _optional = {}): CatalogSchemaPorts {
  return {
    introspection: drizzleIntrospection, schema: catalog.schema, copyOrder: catalog.copyOrder, derivedNames: catalog.derivedNames,
    schemaLabel: "schema.postgres.ts", partiallyExcluded: PARTIALLY_EXCLUDED_TABLES, excludedTables: EXCLUDED_TABLE_REASONS,
  };
}

/**
 * The core tables a copy carries, in foreign-key-safe order, logins and saved keys removed.
 *
 * @complexity O(tables + foreign keys).
 */
export function collectTransferTables({ catalog }: { catalog: CoreTableCatalogPorts }, _optional: Record<string, never> = {}): TransferTable[] {
  return collectCatalogTransferTables({ catalog: jiniCatalog({ catalog }) });
}

/**
 * EVERY table `schema.postgres.ts` declares, in the same foreign-key-safe order, nothing left out:
 * the full schema a fresh Postgres database is created with (`platform/db/__tests__/pg-content-schema.ts`, test support).
 *
 * @complexity O(tables + foreign keys).
 */
export function collectSchemaTables({ catalog }: { catalog: CoreTableCatalogPorts }, _optional: Record<string, never> = {}): TransferTable[] {
  return collectCatalogSchemaTables({ catalog: jiniCatalog({ catalog }) });
}

/** Migration ledgers stay behind: the target's runner owns its applied history. */
const MIGRATION_LEDGERS = new Set(["__drizzle_migrations", "tovu_migrations", "tovu_chat_migrations"]);
/** The conversation tables chat.db owns ({@link planChatSnapshotTables} copies them, in this order). */
const CHAT_TABLES = ["ai_chats", "ai_chat_messages", "assistant_agent_sessions"];
/**
 * Legacy migrations 0023/0051 still create the chat tables in content.db, and
 * `0002_drop_empty_legacy_chat_tables` keeps any that hold a pre-split install's rows. chat.db is
 * the only copy source for them: declaring a table from both files makes `runCopy` refuse the whole
 * copy, and the stranded rows are the ones the running site no longer reads (`chat-orphan-check.ts`).
 * Their row counts are still disclosed in the plan's `leftOut`.
 */
const LEGACY_CONTENT_CHAT_REASON = "conversations are copied from chat.db; chat history still left in content.db from before the chat.db split is not copied";
export function planSnapshotTables({ source, catalog }: { source: TransferSource; catalog: CoreTableCatalogPorts }, _optional = {}): SnapshotTablePlan {
  return planCatalogSnapshotTables({ source, catalog: jiniCatalog({ catalog }), policy: {
    migrationLedgers: MIGRATION_LEDGERS, foreignOwnedTables: CHAT_TABLES, foreignOwnedReason: LEGACY_CONTENT_CHAT_REASON,
    bookkeepingPrefixes: ["sqlite_", "_plugin_", "_vault_backup_"], secretColumnPattern: SECRET_COLUMN_PATTERN,
  } });
}
/** chat.db's raw-SQL schema is introspected separately; never use content's Drizzle catalog here. */
export function planChatSnapshotTables(source: TransferSource): SnapshotTablePlan {
  return planIntrospectedSnapshotTables({ source, ownedTables: CHAT_TABLES, migrationLedgers: MIGRATION_LEDGERS, bookkeepingPrefixes: ["sqlite_", "_plugin_"] });
}
