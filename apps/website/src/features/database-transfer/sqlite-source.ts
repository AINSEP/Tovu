/** Compatibility adapter; snapshot/WAL rationale now lives in @jini-ai/db/transfer. */
import Database from "better-sqlite3";
import { openSqliteSnapshotSource as openSnapshot, type TransferSource } from "@jini-ai/db/transfer";
export type { TransferSource, SourceColumn, SourceForeignKey, SourceIndex, SourceTableLayout } from "@jini-ai/db/transfer";
export function openSqliteSnapshotSource(bytes: Buffer): TransferSource {
  return openSnapshot({ bytes }, { open: (data, options) => {
    const database = new Database(data, options);
    return {
      // The snapshot port iterates only raw() rows; keep their cells typed as arrays at the driver seam.
      prepare: (sql) => database.prepare<unknown[], unknown[]>(sql),
      close: () => database.close(),
    };
  } });
}
