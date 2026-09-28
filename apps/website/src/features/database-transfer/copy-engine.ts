import { getTableConfig, type PgColumn, type PgTable } from "drizzle-orm/pg-core";

import { computeCoreTableCopyOrder } from "../../platform/db/migration/manifest.js";
import * as pgSchema from "../../platform/db/schema.postgres.js";
import { EXCLUDED_CORE_TABLES } from "./exclusions.js";
import type { PostgresTargetPort } from "./postgres-target.js";
import type { TransferSource } from "./sqlite-source.js";

/**
 * @file The COPY-mode engine (plan slice P0): which tables go, the target DDL, the psql script, and
 * the target-state check. Vendor-blind: it knows "a Postgres database", never a provider.
 *
 * What one run does, as ONE Postgres transaction (psql `ON_ERROR_STOP`, so the first error aborts it
 * and the previous copy, if any, stays exactly as it was):
 * 1. refuse if a `tovu` schema exists without this feature's marker table (someone else's data);
 * 2. drop the previous copy and create the `tovu` schema — never `public`, never any other schema;
 * 3. create each table from `schema.postgres.ts` (columns, NOT NULL, primary key only — the generated
 *    migrations with indexes, FKs and identity columns are slice T1);
 * 4. `COPY ... FROM STDIN` every table in `computeCoreTableCopyOrder()`, minus the logins and saved
 *    keys in `exclusions.ts`;
 * 5. check every table's `count(*)` against the source count and abort on any difference;
 * 6. write the marker row (site, source snapshot time, counts) and commit.
 *
 * Not yet (later slices): plugin and chat tables (T2), checksums, identity reseed and staging swap
 * (T3), a sealed connection record (T4).
 */

export const TRANSFER_SCHEMA = "tovu";
export const TRANSFER_MARKER_TABLE = "_tovu_transfer";

export interface TransferColumn {
  readonly name: string;
  readonly sqlType: string;
  readonly notNull: boolean;
}

export interface TransferTable {
  readonly name: string;
  readonly columns: readonly TransferColumn[];
  readonly primaryKey: readonly string[];
}

export interface TableCount {
  readonly table: TransferTable;
  readonly rows: number;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function qualified(table: string): string {
  return `${quoteIdent(TRANSFER_SCHEMA)}.${quoteIdent(table)}`;
}

function toTransferTable(table: PgTable): TransferTable {
  const cfg = getTableConfig(table);
  const columns = cfg.columns.map((column: PgColumn) => ({ name: column.name, sqlType: column.getSQLType(), notNull: column.notNull }));
  const inline = cfg.columns.filter((column) => column.primary).map((column) => column.name);
  const composite = cfg.primaryKeys.flatMap((pk) => pk.columns.map((column) => column.name));
  return { name: cfg.name, columns, primaryKey: inline.length > 0 ? inline : composite };
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
    const transfer = toTransferTable(table);
    return transfer.name in EXCLUDED_CORE_TABLES ? [] : [transfer];
  });
}

/** The core tables left out, by SQL name. */
export function excludedTableNames(): string[] {
  return Object.keys(EXCLUDED_CORE_TABLES);
}

export class SourceSchemaMismatchError extends Error {}

/**
 * Row counts for every table, after checking the source has each table and column the target will
 * get (a site database is migrated at boot, so a gap means the Postgres schema is out of date).
 *
 * @throws {SourceSchemaMismatchError} Naming the first missing table or column.
 * @complexity O(tables) queries.
 */
export function countSourceRows(source: TransferSource, tables: readonly TransferTable[]): TableCount[] {
  return tables.map((table) => {
    const present = source.columns(table.name);
    if (present === null) throw new SourceSchemaMismatchError(`this site's database has no '${table.name}' table`);
    const missing = table.columns.find((column) => !present.includes(column.name));
    if (missing) throw new SourceSchemaMismatchError(`this site's database has no '${table.name}.${missing.name}' column`);
    return { table, rows: source.countRows(table.name) };
  });
}

export type TargetSchemaState = "absent" | "ours" | "foreign";

export type TargetInspection =
  | { readonly ok: true; readonly serverVersionNum: number; readonly schemaState: TargetSchemaState; readonly lastCopy: { readonly site: string; readonly snapshotAt: string } | null; readonly canCreateSchema: boolean }
  | { readonly ok: false; readonly error: string };

/**
 * Connects and reads what a plan needs to know: the server version, whether `tovu` is absent, a
 * previous copy of ours, or someone else's, and whether this user may create a schema.
 *
 * @complexity Two short queries.
 */
export async function inspectTarget(target: PostgresTargetPort): Promise<TargetInspection> {
  const state = await target.query(
    `SELECT current_setting('server_version_num'), to_regnamespace(${quoteLiteral(TRANSFER_SCHEMA)}) IS NOT NULL, ` +
      `to_regclass(${quoteLiteral(`${TRANSFER_SCHEMA}.${TRANSFER_MARKER_TABLE}`)}) IS NOT NULL, has_database_privilege(current_database(), 'CREATE')`
  );
  if (!state.ok) return { ok: false, error: state.error };
  const [version, schemaExists, markerExists, canCreate] = state.value[0] ?? [];
  const schemaState: TargetSchemaState = schemaExists !== "t" ? "absent" : markerExists === "t" ? "ours" : "foreign";
  let lastCopy: { site: string; snapshotAt: string } | null = null;
  if (schemaState === "ours") {
    const marker = await target.query(`SELECT site, snapshot_at FROM ${qualified(TRANSFER_MARKER_TABLE)} ORDER BY copied_at DESC LIMIT 1`);
    if (!marker.ok) return { ok: false, error: marker.error };
    const [site, snapshotAt] = marker.value[0] ?? [];
    if (site !== undefined && snapshotAt !== undefined) lastCopy = { site, snapshotAt };
  }
  return { ok: true, serverVersionNum: Number(version), schemaState, lastCopy, canCreateSchema: canCreate === "t" };
}

function createTableSql(table: TransferTable): string {
  const columns = table.columns.map((column) => `${quoteIdent(column.name)} ${column.sqlType}${column.notNull ? " NOT NULL" : ""}`);
  if (table.primaryKey.length > 0) columns.push(`PRIMARY KEY (${table.primaryKey.map(quoteIdent).join(", ")})`);
  return `CREATE TABLE ${qualified(table.name)} (${columns.join(", ")});\n`;
}

/** One value in COPY text format: `\N` for NULL, backslash escapes for the four specials. */
function copyField(value: unknown, table: string, column: string): string {
  if (value === null || value === undefined) return "\\N";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "string") return value.replace(/[\\\n\r\t]/g, (ch) => (ch === "\\" ? "\\\\" : ch === "\n" ? "\\n" : ch === "\r" ? "\\r" : "\\t"));
  throw new SourceSchemaMismatchError(`'${table}.${column}' holds binary data, which no Postgres column in this copy accepts`);
}

function* copyTableData(source: TransferSource, table: TransferTable): Generator<string> {
  const names = table.columns.map((column) => column.name);
  yield `COPY ${qualified(table.name)} (${names.map(quoteIdent).join(", ")}) FROM STDIN;\n`;
  let batch = "";
  for (const row of source.rows(table.name, names)) {
    batch += row.map((value, i) => copyField(value, table.name, names[i]!)).join("\t") + "\n";
    if (batch.length > 256 * 1024) {
      yield batch;
      batch = "";
    }
  }
  yield `${batch}\\.\n`;
}

const FOREIGN_SCHEMA_SIGNAL = "TOVU_TARGET_NOT_OURS";
const COUNT_MISMATCH_SIGNAL = "TOVU_COUNT_MISMATCH";

function guardSql(): string {
  return (
    `DO $tovu$ BEGIN IF to_regnamespace(${quoteLiteral(TRANSFER_SCHEMA)}) IS NOT NULL AND to_regclass(${quoteLiteral(`${TRANSFER_SCHEMA}.${TRANSFER_MARKER_TABLE}`)}) IS NULL ` +
    `THEN RAISE EXCEPTION '${FOREIGN_SCHEMA_SIGNAL}'; END IF; END $tovu$;\n`
  );
}

function countCheckSql(counts: readonly TableCount[]): string {
  const checks = counts.map(
    ({ table, rows }) => `SELECT count(*) INTO n FROM ${qualified(table.name)}; IF n <> ${rows} THEN RAISE EXCEPTION '${COUNT_MISMATCH_SIGNAL} ${table.name}'; END IF;`
  );
  return `DO $tovu$ DECLARE n bigint; BEGIN ${checks.join(" ")} END $tovu$;\n`;
}

export interface CopyMarker {
  readonly site: string;
  readonly snapshotAt: string;
}

function markerSql(marker: CopyMarker, counts: readonly TableCount[]): string {
  const tableCounts = JSON.stringify(Object.fromEntries(counts.map(({ table, rows }) => [table.name, rows])));
  return (
    `CREATE TABLE ${qualified(TRANSFER_MARKER_TABLE)} (site text NOT NULL, snapshot_at text NOT NULL, copied_at timestamptz NOT NULL DEFAULT now(), table_counts jsonb NOT NULL);\n` +
    `INSERT INTO ${qualified(TRANSFER_MARKER_TABLE)} (site, snapshot_at, table_counts) VALUES (${quoteLiteral(marker.site)}, ${quoteLiteral(marker.snapshotAt)}, ${quoteLiteral(tableCounts)}::jsonb);\n`
  );
}

function* copyScript(source: TransferSource, counts: readonly TableCount[], marker: CopyMarker): Generator<string> {
  yield "BEGIN;\n";
  yield guardSql();
  yield `DROP SCHEMA IF EXISTS ${quoteIdent(TRANSFER_SCHEMA)} CASCADE;\nCREATE SCHEMA ${quoteIdent(TRANSFER_SCHEMA)};\n`;
  for (const { table } of counts) yield createTableSql(table);
  for (const { table } of counts) yield* copyTableData(source, table);
  yield countCheckSql(counts);
  yield markerSql(marker, counts);
  yield "COMMIT;\n";
}

export type CopyResult =
  | { readonly ok: true; readonly tables: readonly { readonly name: string; readonly rows: number }[] }
  | { readonly ok: false; readonly code: "TARGET_NOT_OURS" | "COPY_FAILED" | "COUNT_MISMATCH"; readonly message: string; readonly logDetail?: string };

/**
 * Runs one copy as a single transaction (see this file's header). A failure's message names at most
 * a table; the redacted psql line goes to `logDetail`, for the server log only.
 *
 * @complexity O(total rows), streamed in ~256 KiB chunks.
 */
export async function runCopy(input: { source: TransferSource; target: PostgresTargetPort; tables: readonly TransferTable[]; counts: readonly TableCount[]; marker: CopyMarker }): Promise<CopyResult> {
  let result;
  try {
    result = await input.target.runScript(copyScript(input.source, input.counts, input.marker));
  } catch (err) {
    if (err instanceof SourceSchemaMismatchError) return { ok: false, code: "COPY_FAILED", message: `${err.message}. Nothing was changed.` };
    throw err;
  }
  if (result.ok) return { ok: true, tables: input.counts.map(({ table, rows }) => ({ name: table.name, rows })) };
  if (result.error.includes(FOREIGN_SCHEMA_SIGNAL)) {
    return { ok: false, code: "TARGET_NOT_OURS", message: `the destination already has a '${TRANSFER_SCHEMA}' area that this site did not create. Nothing was written, and it was left untouched.` };
  }
  const mismatch = new RegExp(`${COUNT_MISMATCH_SIGNAL} (\\S+)`).exec(result.error);
  if (mismatch) return { ok: false, code: "COUNT_MISMATCH", message: `the copy of '${mismatch[1]}' did not match, so the whole copy was thrown away. Any earlier copy is untouched.`, logDetail: result.error };
  const where = result.copyTable ? ` while copying '${result.copyTable.replace(`${TRANSFER_SCHEMA}.`, "")}'` : "";
  return { ok: false, code: "COPY_FAILED", message: `the destination refused the copy${where}, so the whole copy was thrown away. Any earlier copy is untouched.`, logDetail: result.error };
}
