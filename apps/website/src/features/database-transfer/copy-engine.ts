/** Compatibility adapter; engine ordering, wipe-guard and identifier rationale now lives in @jini-ai/db/transfer. */
import * as engine from "@jini-ai/db/transfer";
import type { TransferSource, TransferTable, PostgresTargetPort, CopyMarker, TableCount, TransferNaming } from "@jini-ai/db/transfer";
import { planSnapshotTables } from "./table-catalog.js";
import { PARTIALLY_EXCLUDED_TABLES, TRANSFER_EXCLUSION_REASON_TEXT } from "./exclusions.js";
export { SourceSchemaMismatchError, IncompleteTransferPlanError, planTransfer } from "@jini-ai/db/transfer";
export type { TableCount, CopyMarker, CopyResult, TargetInspection, TargetSchemaState, TransferCopyInfo } from "@jini-ai/db/transfer";
export { collectTransferTables, planSnapshotTables, type SnapshotTablePlan, type TransferColumn, type TransferTable } from "./table-catalog.js";
/** The first site gets this schema; existing destination markers must keep their original names. */
export const DEFAULT_TRANSFER_SCHEMA = "tovu";
export const TRANSFER_MARKER_TABLE = "_tovu_transfer";
export const TRANSFER_NAMING: TransferNaming = { defaultSchema: DEFAULT_TRANSFER_SCHEMA, markerTable: TRANSFER_MARKER_TABLE, unvalidatedTable: "pg_temp._tovu_unvalidated", schemaPrefix: "tovu_", sqlTag: "tovu" };
export function siteSchemaName(site: string): string { return engine.siteSchemaName({ site, naming: TRANSFER_NAMING }); }
// excludedTableNames (apps/website/src/features/database-transfer/copy-engine.ts) was deleted 2026-10-03: unused; see development/DELETED-CODE.md.
export function countSourceRows(source: TransferSource, tables: readonly TransferTable[]): TableCount[] { return engine.countSourceRows({ source, tables }); }
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


export function inspectTarget(target: PostgresTargetPort, site: string) { return engine.inspectTarget({ target, site, naming: TRANSFER_NAMING }); }
export function runCopy(input: { source: TransferSource; target: PostgresTargetPort; tables: readonly TransferTable[]; counts: readonly TableCount[]; schema: string; marker: CopyMarker; replaceExisting: boolean }) {
  // Existing importers remain single-source; the tools use Jini's multi-source API directly.
  const { leftOut } = planSnapshotTables(input.source);
  return engine.runCopy({ sources: [{ name: "content.db", source: input.source, tables: input.tables, counts: input.counts, leftOut }], target: input.target, naming: TRANSFER_NAMING, schema: input.schema, marker: input.marker, replaceExisting: input.replaceExisting });
}
