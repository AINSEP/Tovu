/** Compatibility adapter; engine ordering, wipe-guard and identifier rationale now lives in @jini-ai/db/transfer. */
import type { TransferSource, TransferNaming } from "@jini-ai/db/transfer";
import { PARTIALLY_EXCLUDED_TABLES, TRANSFER_EXCLUSION_REASON_TEXT } from "./exclusions.js";
export { SourceSchemaMismatchError, IncompleteTransferPlanError, planTransfer } from "@jini-ai/db/transfer";
export type { TableCount, CopyMarker, CopyResult, TargetInspection, TargetSchemaState, TransferCopyInfo } from "@jini-ai/db/transfer";
export { collectTransferTables, planSnapshotTables, type SnapshotTablePlan, type TransferColumn, type TransferTable } from "./table-catalog.js";
/** The first site gets this schema; existing destination markers must keep their original names. */
export const DEFAULT_TRANSFER_SCHEMA = "tovu";
export const TRANSFER_MARKER_TABLE = "_tovu_transfer";
export const TRANSFER_NAMING: TransferNaming = { defaultSchema: DEFAULT_TRANSFER_SCHEMA, markerTable: TRANSFER_MARKER_TABLE, unvalidatedTable: "pg_temp._tovu_unvalidated", schemaPrefix: "tovu_", sqlTag: "tovu" };
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
