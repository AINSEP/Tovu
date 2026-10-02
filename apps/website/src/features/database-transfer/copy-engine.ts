import { createHash } from "node:crypto";

import { EXCLUDED_CORE_TABLES, PARTIALLY_EXCLUDED_TABLES, TRANSFER_EXCLUSION_REASON_TEXT } from "./exclusions.js";
import { constraintSql, createTableSql, indexSql, qualified, quoteIdent, quoteLiteral, reseedIdentitySql, UNVALIDATED_TABLE } from "./postgres-ddl.js";
import type { PostgresTargetPort } from "./postgres-target.js";
import type { TransferSource } from "./sqlite-source.js";
import type { TransferColumn, TransferTable } from "./table-catalog.js";

export { collectTransferTables, planSnapshotTables, type SnapshotTablePlan, type TransferColumn, type TransferTable } from "./table-catalog.js";

/**
 * @file The COPY-mode engine (plan slice P0): which tables go, the target DDL, the psql script, and
 * the target-state check. Vendor-blind: it knows "a Postgres database", never a provider.
 *
 * Where a copy goes (several sites may share one database, each in its own schema; never `public`,
 * which hosted Postgres products such as Supabase expose through their data APIs):
 * - a site that already has a copy there keeps its schema: the marker table names the site, so a
 *   re-copy always lands in the same place, whatever other sites did since;
 * - otherwise the first free schema of `tovu` (the default), {@link siteSchemaName} (`tovu_<site>`),
 *   then that name plus a hash of the site name.
 *
 * What one run does, as ONE Postgres transaction (psql `ON_ERROR_STOP`, so the first error aborts it
 * and the previous copy, if any, stays exactly as it was):
 * 1. refuse unless the schema is absent or holds THIS site's copy (its marker names this site and no
 *    other) — checked inside the transaction, so a stale plan or a race can never wipe another
 *    site's copy or someone else's data;
 * 2. drop the site's previous copy and create its schema — never `public`, never any other schema;
 * 3. create every table `table-catalog.ts` plans (core tables from `schema.postgres.ts`, the
 *    snapshot's other tables from its own layout): columns, defaults, identity, primary key;
 * 4. `COPY ... FROM STDIN` every table's rows (minus the logins, saved keys and secret settings in
 *    `exclusions.ts`);
 * 5. check every table's `count(*)` against the source count and abort on any difference;
 * 6. move identity counters past the copied numbers, build the indexes, then add CHECKs and foreign
 *    keys (see `postgres-ddl.ts`: a key the old rows break stays NOT VALID and is reported, it never
 *    aborts the copy);
 * 7. write the marker row (site, source snapshot time, counts, unvalidated constraints) and commit.
 *
 * Not yet (later slices): chat.db tables, checksums and staging swap (T3).
 */

/** The schema the first site to copy into a database gets. */
export const DEFAULT_TRANSFER_SCHEMA = "tovu";
export const TRANSFER_MARKER_TABLE = "_tovu_transfer";
/** Postgres truncates identifiers past 63 bytes (NAMEDATALEN - 1). */
const MAX_IDENTIFIER_BYTES = 63;
const SCHEMA_PREFIX = `${DEFAULT_TRANSFER_SCHEMA}_`;

function shortHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 8);
}

/**
 * The readable schema a site gets when `tovu` is taken: `tovu_` plus the site name lowercased, with
 * every run of other characters turned into one `_`. When that loses information (a character other
 * than a letter, digit, space, `-`, `_` or `.`), is empty, or must be cut to fit 63 bytes, 8 hex
 * characters of the whole name's SHA-256 are appended, so distinct names stay distinct.
 *
 * @complexity O(name length).
 */
export function siteSchemaName(site: string): string {
  const slug = site.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const lossless = /^[A-Za-z0-9 ._-]*$/.test(site);
  if (lossless && slug !== "" && SCHEMA_PREFIX.length + slug.length <= MAX_IDENTIFIER_BYTES) return `${SCHEMA_PREFIX}${slug}`;
  return withHash(site, slug);
}

function withHash(site: string, slug: string): string {
  const room = MAX_IDENTIFIER_BYTES - SCHEMA_PREFIX.length - 9;
  const kept = slug.slice(0, room).replace(/_+$/, "");
  return `${SCHEMA_PREFIX}${kept === "" ? "" : `${kept}_`}${shortHash(site)}`;
}

/** The schemas a site without a copy may take, in order. */
function schemaCandidates(site: string): string[] {
  const slug = site.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return [...new Set([DEFAULT_TRANSFER_SCHEMA, siteSchemaName(site), withHash(site, slug)])];
}

export interface TableCount {
  readonly table: TransferTable;
  readonly rows: number;
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
    return { table, rows: source.countRows(table.name, table.keep) };
  });
}

/**
 * Rows left behind in tables that are otherwise copied (secret settings), per table, with the reason.
 *
 * @complexity O(partially excluded tables) queries.
 */
export function countPartialExclusions(source: TransferSource): { table: string; rows: number; reason: string }[] {
  return Object.entries(PARTIALLY_EXCLUDED_TABLES).flatMap(([table, { keep, reason }]) => {
    if (source.columns(table) === null) return [];
    return [{ table, rows: source.countRows(table) - source.countRows(table, keep), reason: TRANSFER_EXCLUSION_REASON_TEXT[reason] }];
  });
}

/** `ours`: the site's own copy is there; `absent`: a free schema was found; `foreign`: every candidate is taken. */
export type TargetSchemaState = "absent" | "ours" | "foreign";

export interface TransferCopyInfo {
  readonly site: string;
  readonly snapshotAt: string;
}

export type TargetInspection =
  | {
      readonly ok: true;
      readonly serverVersionNum: number;
      readonly schemaState: TargetSchemaState;
      /** Where this site's copy goes; `null` only when `schemaState` is `foreign`. */
      readonly schema: string | null;
      readonly lastCopy: TransferCopyInfo | null;
      readonly canCreateSchema: boolean;
    }
  | { readonly ok: false; readonly error: string };

/** Every marker on the server: schema, the site of its newest row, and whether any row names a different site. */
async function readMarkers(target: PostgresTargetPort): Promise<{ ok: true; value: { schema: string; copy: TransferCopyInfo | null; mixed: boolean }[] } | { ok: false; error: string }> {
  const listed = await target.query(
    `SELECT n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = ${quoteLiteral(TRANSFER_MARKER_TABLE)} AND c.relkind = 'r' ORDER BY 1`
  );
  if (!listed.ok) return listed;
  const markers = [];
  for (const [schema] of listed.value) {
    if (schema === undefined) continue;
    const rows = await target.query(
      `SELECT site, snapshot_at, (SELECT count(DISTINCT site) FROM ${qualified(schema, TRANSFER_MARKER_TABLE)}) > 1 FROM ${qualified(schema, TRANSFER_MARKER_TABLE)} ORDER BY copied_at DESC LIMIT 1`
    );
    // A table merely NAMED like the marker (wrong columns) is someone else's; it never claims a site.
    const [site, snapshotAt, mixed] = rows.ok ? (rows.value[0] ?? []) : [];
    markers.push({ schema, copy: site !== undefined && snapshotAt !== undefined ? { site, snapshotAt } : null, mixed: mixed === "t" });
  }
  return { ok: true, value: markers };
}

/**
 * Connects and reads what a plan needs: the server version, whether this user may create a schema,
 * and where this site's copy goes (see this file's header).
 *
 * @complexity Two queries plus one per schema holding a marker.
 */
export async function inspectTarget(target: PostgresTargetPort, site: string): Promise<TargetInspection> {
  const state = await target.query(`SELECT current_setting('server_version_num'), has_database_privilege(current_database(), 'CREATE')`);
  if (!state.ok) return { ok: false, error: state.error };
  const [version, canCreate] = state.value[0] ?? [];
  const markers = await readMarkers(target);
  if (!markers.ok) return { ok: false, error: markers.error };
  const base = { ok: true as const, serverVersionNum: Number(version), canCreateSchema: canCreate === "t" };

  const own = markers.value.find((marker) => marker.copy?.site === site && !marker.mixed);
  if (own !== undefined) return { ...base, schemaState: "ours", schema: own.schema, lastCopy: own.copy };

  const candidates = schemaCandidates(site);
  const existing = await target.query(`SELECT nspname FROM pg_namespace WHERE nspname IN (${candidates.map(quoteLiteral).join(", ")})`);
  if (!existing.ok) return { ok: false, error: existing.error };
  const taken = new Set(existing.value.map(([name]) => name));
  const free = candidates.find((candidate) => !taken.has(candidate)) ?? null;
  return { ...base, schemaState: free === null ? "foreign" : "absent", schema: free, lastCopy: null };
}

/** One value in COPY text format: `\N` for NULL, backslash escapes for the four specials, `\\x<hex>` for bytes. */
function copyField(value: unknown, table: string, column: TransferColumn): string {
  if (value === null || value === undefined) return "\\N";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "string") return value.replace(/[\\\n\r\t]/g, (ch) => (ch === "\\" ? "\\\\" : ch === "\n" ? "\\n" : ch === "\r" ? "\\r" : "\\t"));
  if (Buffer.isBuffer(value) && column.sqlType === "bytea") return `\\\\x${value.toString("hex")}`;
  throw new SourceSchemaMismatchError(`'${table}.${column.name}' holds binary data, which its Postgres column does not accept`);
}

function* copyTableData(source: TransferSource, schema: string, table: TransferTable): Generator<string> {
  const names = table.columns.map((column) => column.name);
  const columns = table.columns;
  yield `COPY ${qualified(schema, table.name)} (${names.map(quoteIdent).join(", ")}) FROM STDIN;\n`;
  let batch = "";
  for (const row of source.rows(table.name, names, table.keep)) {
    batch += row.map((value, i) => copyField(value, table.name, columns[i]!)).join("\t") + "\n";
    if (batch.length > 256 * 1024) {
      yield batch;
      batch = "";
    }
  }
  yield `${batch}\\.\n`;
}

const FOREIGN_SCHEMA_SIGNAL = "TOVU_TARGET_NOT_OURS";
const COUNT_MISMATCH_SIGNAL = "TOVU_COUNT_MISMATCH";

/**
 * Aborts the transaction unless `schema` is absent or holds only this site's copy. The marker is read
 * with dynamic SQL so a table merely named like it (other columns) also counts as someone else's.
 */
function guardSql(schema: string, site: string): string {
  const marker = quoteLiteral(`${quoteIdent(schema)}.${quoteIdent(TRANSFER_MARKER_TABLE)}`);
  return (
    `DO $tovu$ DECLARE mine bigint; total bigint; BEGIN\n` +
    `  IF to_regnamespace(${quoteLiteral(quoteIdent(schema))}) IS NULL THEN RETURN; END IF;\n` +
    `  IF to_regclass(${marker}) IS NULL THEN RAISE EXCEPTION '${FOREIGN_SCHEMA_SIGNAL}'; END IF;\n` +
    `  BEGIN\n` +
    `    EXECUTE format('SELECT count(*) FILTER (WHERE site = %L), count(*) FROM %s', ${quoteLiteral(site)}, ${marker}) INTO mine, total;\n` +
    `  EXCEPTION WHEN undefined_column THEN RAISE EXCEPTION '${FOREIGN_SCHEMA_SIGNAL}';\n` +
    `  END;\n` +
    `  IF mine = 0 OR mine <> total THEN RAISE EXCEPTION '${FOREIGN_SCHEMA_SIGNAL}'; END IF;\n` +
    `END $tovu$;\n`
  );
}

function countCheckSql(schema: string, counts: readonly TableCount[]): string {
  const checks = counts.map(
    ({ table, rows }) => `SELECT count(*) INTO n FROM ${qualified(schema, table.name)}; IF n <> ${rows} THEN RAISE EXCEPTION '${COUNT_MISMATCH_SIGNAL} ${table.name}'; END IF;`
  );
  return `DO $tovu$ DECLARE n bigint; BEGIN ${checks.join(" ")} END $tovu$;\n`;
}

export interface CopyMarker {
  readonly site: string;
  readonly snapshotAt: string;
}

function markerSql(schema: string, marker: CopyMarker, counts: readonly TableCount[]): string {
  const tableCounts = JSON.stringify(Object.fromEntries(counts.map(({ table, rows }) => [table.name, rows])));
  return (
    `CREATE TABLE ${qualified(schema, TRANSFER_MARKER_TABLE)} (site text NOT NULL, snapshot_at text NOT NULL, copied_at timestamptz NOT NULL DEFAULT now(), table_counts jsonb NOT NULL, unvalidated jsonb NOT NULL);\n` +
    `INSERT INTO ${qualified(schema, TRANSFER_MARKER_TABLE)} (site, snapshot_at, table_counts, unvalidated) VALUES (${quoteLiteral(marker.site)}, ${quoteLiteral(marker.snapshotAt)}, ${quoteLiteral(tableCounts)}::jsonb, ` +
    `(SELECT coalesce(jsonb_agg(name ORDER BY name), '[]'::jsonb) FROM ${UNVALIDATED_TABLE}));\n`
  );
}

function* copyScript(source: TransferSource, schema: string, counts: readonly TableCount[], marker: CopyMarker, replaceExisting: boolean): Generator<string> {
  yield "BEGIN;\n";
  yield guardSql(schema, marker.site);
  // A first copy must fail if the schema appeared since planning, never delete it.
  if (replaceExisting) yield `DROP SCHEMA IF EXISTS ${quoteIdent(schema)} CASCADE;\n`;
  yield `CREATE SCHEMA ${quoteIdent(schema)};\n`;
  for (const { table } of counts) yield createTableSql(schema, table);
  for (const { table } of counts) yield* copyTableData(source, schema, table);
  yield countCheckSql(schema, counts);
  for (const { table } of counts) yield reseedIdentitySql(schema, table);
  for (const { table } of counts) yield indexSql(schema, table);
  yield constraintSql(schema, counts.map(({ table }) => table));
  yield markerSql(schema, marker, counts);
  yield "COMMIT;\n";
}

export type CopyResult =
  | {
      readonly ok: true;
      readonly tables: readonly { readonly name: string; readonly rows: number }[];
      /** `table.constraint` for each CHECK or foreign key the copied rows break: kept, but NOT VALID. */
      readonly unvalidatedConstraints: readonly string[];
      /** Set when the copy committed but its unvalidated list could not be read back. */
      readonly warning?: string;
    }
  | { readonly ok: false; readonly code: "TARGET_NOT_OURS" | "COPY_FAILED" | "COUNT_MISMATCH"; readonly message: string; readonly logDetail?: string };

/** The constraints the committed copy left NOT VALID, from its marker. */
async function readUnvalidated(target: PostgresTargetPort, schema: string): Promise<{ unvalidatedConstraints: string[]; warning?: string }> {
  const read = await target.query(`SELECT unvalidated FROM ${qualified(schema, TRANSFER_MARKER_TABLE)} LIMIT 1`);
  const cell = read.ok ? read.value[0]?.[0] : undefined;
  if (cell === undefined) return { unvalidatedConstraints: [], warning: "the copy finished, but its list of unchecked constraints could not be read back" };
  return { unvalidatedConstraints: JSON.parse(cell) as string[] };
}

/**
 * Runs one copy as a single transaction (see this file's header). A failure's message names at most
 * a table; the redacted psql line goes to `logDetail`, for the server log only.
 *
 * @complexity O(total rows), streamed in ~256 KiB chunks.
 */
export async function runCopy(input: { source: TransferSource; target: PostgresTargetPort; tables: readonly TransferTable[]; counts: readonly TableCount[]; schema: string; marker: CopyMarker; replaceExisting: boolean }): Promise<CopyResult> {
  const { schema } = input;
  if (schema === "public" || !/^[a-z_][a-z0-9_]*$/.test(schema) || Buffer.byteLength(schema) > MAX_IDENTIFIER_BYTES) {
    throw new Error(`runCopy: '${schema}' is not a schema this copier may write`);
  }
  let result;
  try {
    result = await input.target.runScript(copyScript(input.source, schema, input.counts, input.marker, input.replaceExisting));
  } catch (err) {
    if (err instanceof SourceSchemaMismatchError) return { ok: false, code: "COPY_FAILED", message: `${err.message}. Nothing was changed.` };
    throw err;
  }
  if (result.ok) return { ok: true, tables: input.counts.map(({ table, rows }) => ({ name: table.name, rows })), ...(await readUnvalidated(input.target, schema)) };
  if (result.error.includes(FOREIGN_SCHEMA_SIGNAL)) {
    return { ok: false, code: "TARGET_NOT_OURS", message: `the destination already has a '${schema}' area that holds other data. Nothing was written, and it was left untouched.` };
  }
  const mismatch = new RegExp(`${COUNT_MISMATCH_SIGNAL} (\\S+)`).exec(result.error);
  if (mismatch) return { ok: false, code: "COUNT_MISMATCH", message: `the copy of '${mismatch[1]}' did not match, so the whole copy was thrown away. Any earlier copy is untouched.`, logDetail: result.error };
  const where = result.copyTable ? ` while copying '${result.copyTable.replace(`${schema}.`, "")}'` : "";
  return { ok: false, code: "COPY_FAILED", message: `the destination refused the copy${where}, so the whole copy was thrown away. Any earlier copy is untouched.`, logDetail: result.error };
}
