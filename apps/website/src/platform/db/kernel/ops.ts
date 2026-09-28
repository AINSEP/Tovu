import type { StorageKernel, StorageTransport } from "./port.js";
import { sqliteConnectionOf } from "./drivers/sqlite.js";

/**
 * @file The storage ops port: whole-database FILE operations, which every dialect spells
 * differently and which are not queries (copying a database, compacting and sealing it). Queries go
 * through `StorageKernel.run`; a whole-database backup is `StorageKernel.backupTo`.
 *
 * SQLite implements it now. PGlite and Postgres throw {@link StorageOpNotSupportedError} until the
 * storage-choice slice (plan R1) gives a site a non-SQLite store to duplicate; nothing reaches them
 * before that, since every caller opens a SQLite file today.
 */

export interface StorageOps {
  /**
   * Writes a physically consistent copy of the whole database to `targetPath` (which must not
   * exist), read through this connection — so anything still parked in a write-ahead log is
   * included — without writing the source (works on a read-only open).
   * @throws the driver's own error (target exists, directory not writable, source locked).
   */
  copyTo(targetPath: string): Promise<void>;
  /**
   * Reclaims free pages, leaves the database with no pending journal (a sealed file with no
   * sidecars, in WAL mode like every opened content db), then verifies its integrity.
   * @throws {StorageOpError} a busy final checkpoint or a failed integrity check.
   */
  compactAndVerify(): Promise<void>;
}

/** An op this driver has no implementation of yet. */
export class StorageOpNotSupportedError extends Error {
  constructor(
    readonly op: keyof StorageOps,
    readonly transport: StorageTransport
  ) {
    super(`storage op ${op} is not supported yet on the ${transport} driver (storage plan R1)`);
    this.name = "StorageOpNotSupportedError";
  }
}

/** An op that ran but found the database in a state it must not hand back. */
export class StorageOpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageOpError";
  }
}

/**
 * The ops for `kernel`'s database. Must be used outside a transaction (SQLite cannot `VACUUM`
 * inside one).
 * @throws {Error} a better-sqlite3 kernel this driver did not build (no connection to act on); an
 *   op called inside a transaction.
 */
export function storageOps(kernel: StorageKernel<unknown>): StorageOps {
  if (kernel.transport !== "better-sqlite3") return unsupportedOps(kernel.transport);
  const client = sqliteConnectionOf(kernel);
  if (client === undefined) throw new Error("storageOps: this SQLite kernel was not built by the sqlite driver");
  const outsideTransaction = (op: keyof StorageOps) => {
    if (kernel.inTransaction()) throw new Error(`storage op ${op} must be called outside a transaction`);
  };
  return {
    async copyTo(targetPath) {
      outsideTransaction("copyTo");
      // Bound parameter: VACUUM INTO takes an expression, so the path is never spliced into SQL.
      client.prepare("VACUUM INTO ?").run(targetPath);
    },
    async compactAndVerify() {
      outsideTransaction("compactAndVerify");
      client.exec("VACUUM");
      // WAL switch and checkpoint BEFORE integrity_check: running the check first on a just-VACUUMed
      // connection reproducibly left a lock that failed the checkpoint with SQLITE_LOCKED.
      client.pragma("journal_mode = WAL");
      const [checkpoint] = client.pragma("wal_checkpoint(TRUNCATE)") as Array<{ busy: number }>;
      if (checkpoint.busy !== 0) {
        throw new StorageOpError(`final WAL checkpoint on ${client.name} reported busy=${checkpoint.busy}`);
      }
      const [integrity] = client.pragma("integrity_check") as Array<{ integrity_check: string }>;
      if (integrity.integrity_check !== "ok") {
        throw new StorageOpError(`${client.name} failed integrity_check: ${JSON.stringify(integrity)}`);
      }
    },
  };
}

function unsupportedOps(transport: StorageTransport): StorageOps {
  return {
    copyTo: async () => {
      throw new StorageOpNotSupportedError("copyTo", transport);
    },
    compactAndVerify: async () => {
      throw new StorageOpNotSupportedError("compactAndVerify", transport);
    },
  };
}
