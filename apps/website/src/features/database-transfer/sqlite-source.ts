/** Compatibility adapter; snapshot/WAL rationale now lives in @jini-ai/db/transfer. */
import { openSqliteSnapshotSource as openSnapshot, type TransferSource, type SnapshotOpener } from "@jini-ai/db/transfer";
export type { TransferSource, SourceColumn, SourceForeignKey, SourceIndex, SourceTableLayout } from "@jini-ai/db/transfer";
export function openSqliteSnapshotSource({ bytes, open }: { bytes: Buffer; open: SnapshotOpener }, _optional = {}): TransferSource {
  return openSnapshot({ bytes }, { open });
}
