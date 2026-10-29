/** Compatibility adapter; snapshot/WAL rationale now lives in @jini-ai/db/transfer. */
import { openSqliteSnapshot } from "../../platform/db/kernel/drivers/sqlite.js";
import { openSqliteSnapshotSource as openSnapshot, type TransferSource } from "@jini-ai/db/transfer";
export type { TransferSource, SourceColumn, SourceForeignKey, SourceIndex, SourceTableLayout } from "@jini-ai/db/transfer";
export function openSqliteSnapshotSource(bytes: Buffer): TransferSource {
  return openSnapshot({ bytes }, { open: (data) => openSqliteSnapshot({ data }) });
}
