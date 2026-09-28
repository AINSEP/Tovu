import type { StorageKernel } from "../kernel/port.js";

/**
 * @file What a migration step is (ADR-066). Steps form ONE ordered history for every dialect; the
 * runner (`runner.ts`) applies each pending one in its own transaction and records it in
 * `tovu_migrations`.
 */

/** `NNNN_snake_name`. Ordered by the number; never renamed or reused once shipped. */
export const MIGRATION_ID = /^\d{4}_[a-z0-9_]+$/;

export interface MigrationContext {
  /** Where to write a backup before a step changes an existing database (the runner's caller decides). */
  readonly backupPath?: string;
  /** Something worth telling the operator (a backup taken, a legacy tail applied). */
  note(message: string): void;
}

export interface MigrationStep {
  readonly id: string;
  /** sha256 hex of what the step does, pinned in `checksums.ts` (a test re-derives it from the sources). */
  readonly checksum: string;
  /** Runs OUTSIDE the transaction, only when the step is pending (backups: they cannot run inside one). */
  prepare?(kernel: StorageKernel<unknown>, context: MigrationContext): Promise<void>;
  /** Runs inside the step's transaction, after the runner holds the migration lock. */
  up(kernel: StorageKernel<unknown>, context: MigrationContext): Promise<void>;
}

/** An applied step's recorded checksum differs from this runtime's: the step was edited after shipping. */
export class MigrationChecksumError extends Error {
  constructor(
    readonly id: string,
    readonly recorded: string,
    readonly expected: string
  ) {
    super(`migration ${id} was applied with checksum ${recorded}, but this runtime's ${id} has ${expected}; an applied migration must never change`);
    this.name = "MigrationChecksumError";
  }
}

/** The database records steps this runtime does not have: it was migrated by a newer Tovu. */
export class UnknownAppliedMigrationError extends Error {
  constructor(readonly ids: readonly string[]) {
    super(`the database has migrations this runtime does not know (${ids.join(", ")}); it was upgraded by a newer Tovu — run that version`);
    this.name = "UnknownAppliedMigrationError";
  }
}

/** The legacy drizzle history of a SQLite database cannot be matched to the frozen chain. Needs a human. */
export class LegacyHistoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LegacyHistoryError";
  }
}
