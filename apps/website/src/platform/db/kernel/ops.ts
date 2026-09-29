import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { sql } from "kysely";

import type { StorageKernel, StorageTransport } from "./port.js";
import { OWNER_LOCK_FILE } from "./drivers/pglite-owner.js";
import { sqliteConnectionOf } from "./drivers/sqlite.js";

/**
 * @file The storage ops port: whole-database FILE operations, which every dialect spells
 * differently and which are not queries (copying a database, compacting and sealing it). Queries go
 * through `StorageKernel.run`; a whole-database backup is `StorageKernel.backupTo`.
 *
 * - SQLite: `VACUUM INTO` / `VACUUM` + WAL checkpoint + `integrity_check`.
 * - PGlite (in process, or a socket client given its owner): the copy is a data-dir dump restored
 *   into a new data dir; compacting is `VACUUM` + `CHECKPOINT`, then a read-back of the migration
 *   ledger. A socket client reaches the dump only through its owner's exclusive window
 *   ({@link PgliteExclusive}); without it, `copyTo` is refused like Postgres.
 * - Postgres (node-postgres): no file copy — a Postgres site is backed up by its provider and moved
 *   with the move/transfer tools; compacting is `VACUUM (ANALYZE)` plus the same read-back.
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

/** An op this driver has no implementation of. `reason` says what to do instead, when there is something. */
export class StorageOpNotSupportedError extends Error {
  constructor(
    readonly op: keyof StorageOps,
    readonly transport: StorageTransport,
    reason?: string
  ) {
    super(reason === undefined ? `storage op ${op} is not supported on the ${transport} driver` : `storage op ${op} is not supported on the ${transport} driver: ${reason}`);
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

/** A PGlite owner's exclusive window (`PgliteOwner.runExclusive`): the one way to dump a served data dir. */
export interface PgliteExclusive {
  runExclusive<T>(fn: (db: PGlite) => Promise<T>): Promise<T>;
}

/** Why a Postgres server's database is never file-copied. */
const POSTGRES_COPY_REASON = "a Postgres site is backed up by its provider; use the move/transfer tools to copy it";

/**
 * The ops for `kernel`'s database. Must be used outside a transaction (neither SQLite nor Postgres
 * can `VACUUM` inside one).
 *
 * @param optional.pgliteOwner the owner serving the PGlite data dir `kernel` is a socket client of;
 *   needed for `copyTo` on such a kernel.
 * @throws {Error} a better-sqlite3 kernel this driver did not build (no connection to act on); an
 *   op called inside a transaction.
 */
export function storageOps<DB>(kernel: StorageKernel<DB>, optional: { pgliteOwner?: PgliteExclusive } = {}): StorageOps {
  if (kernel.dialect === "postgres") return postgresOps(kernel, optional.pgliteOwner);
  const client = sqliteConnectionOf(kernel);
  if (client === undefined) throw new Error("storageOps: this SQLite kernel was not built by the sqlite driver");
  const outsideTransaction = outsideTransactionOf(kernel as StorageKernel<unknown>);
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

function outsideTransactionOf(kernel: StorageKernel<unknown>): (op: keyof StorageOps) => void {
  return (op) => {
    if (kernel.inTransaction()) throw new Error(`storage op ${op} must be called outside a transaction`);
  };
}

/**
 * PGlite and Postgres. The copy is a PGlite data dir at `targetPath`: dumped (in process through the
 * kernel's own backup, served through the owner's exclusive window) and restored by a fresh PGlite.
 */
function postgresOps<DB>(kernel: StorageKernel<DB>, owner: PgliteExclusive | undefined): StorageOps {
  const outsideTransaction = outsideTransactionOf(kernel as StorageKernel<unknown>);
  const embedded = kernel.transport === "pglite" || owner !== undefined;
  return {
    async copyTo(targetPath) {
      outsideTransaction("copyTo");
      if (!embedded) throw new StorageOpNotSupportedError("copyTo", kernel.transport, POSTGRES_COPY_REASON);
      if (existsSync(targetPath)) throw new Error(`storage op copyTo: ${targetPath} already exists`);
      let dump: Blob;
      if (owner !== undefined) {
        dump = await owner.runExclusive((db) => db.dumpDataDir("none"));
      } else {
        const tarball = `${targetPath}.${randomUUID()}.tar`;
        try {
          await kernel.backupTo(tarball);
          dump = new Blob([await readFile(tarball)]);
        } finally {
          rmSync(tarball, { force: true });
        }
      }
      try {
        const restored = await PGlite.create({ dataDir: targetPath, loadDataDir: dump });
        await restored.close();
        // The dump carries the source owner's pid lock; the copy has no owner yet.
        rmSync(join(targetPath, OWNER_LOCK_FILE), { force: true });
      } catch (err) {
        rmSync(targetPath, { recursive: true, force: true });
        throw err;
      }
    },
    async compactAndVerify() {
      outsideTransaction("compactAndVerify");
      if (owner !== undefined) {
        // Two calls: a multi-statement string runs as one implicit transaction, which VACUUM refuses.
        await owner.runExclusive(async (db) => {
          await db.exec("VACUUM");
          await db.exec("CHECKPOINT");
        });
      } else if (kernel.transport === "pglite") {
        await kernel.execute(sql`VACUUM`);
        await kernel.execute(sql`CHECKPOINT`);
      } else {
        // A hosted server rarely lets a site's role CHECKPOINT; a commit is durable anyway.
        await kernel.execute(sql`VACUUM (ANALYZE)`);
      }
      let steps: number;
      try {
        const [row] = await kernel.query<{ n: number }>(sql`SELECT count(*)::int AS n FROM tovu_migrations`);
        steps = row?.n ?? 0;
      } catch (err) {
        throw new StorageOpError(`the migration ledger tovu_migrations cannot be read back: ${(err as Error).message}`);
      }
      if (steps === 0) throw new StorageOpError("the migration ledger tovu_migrations is empty after compacting");
    },
  };
}
