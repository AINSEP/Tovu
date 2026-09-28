import { tableExists } from "../kernel/dialect.js";
import type { StorageKernel } from "../kernel/port.js";
import {
  MIGRATION_ID,
  MigrationChecksumError,
  type MigrationContext,
  type MigrationStep,
  UnknownAppliedMigrationError,
} from "./step.js";

/**
 * @file The migration runner (ADR-066): applies an ordered list of {@link MigrationStep}s to one
 * database on any dialect and records each in the `tovu_migrations` ledger.
 *
 * - Ledger `tovu_migrations(id, checksum, applied_at)`, created by the runner inside the first step's
 *   transaction (so a step's pre-change backup has no trace of the runner), same on every dialect.
 * - Before anything is applied, every recorded id must be one this runtime knows
 *   ({@link UnknownAppliedMigrationError}) with the checksum this runtime has
 *   ({@link MigrationChecksumError}). Nothing is applied on a mismatch.
 * - Serialized: each pending step runs in ONE kernel transaction that first takes
 *   `lockKey("tovu_migrations")` (Postgres advisory lock; SQLite's `BEGIN IMMEDIATE` write lock) and
 *   re-reads its ledger row, so two processes starting at once apply a step exactly once.
 * - A kernel without interactive transactions is refused (`require`), never downgraded.
 */

export const LEDGER_TABLE = "tovu_migrations";
const LOCK_KEY = "tovu_migrations";

interface LedgerRow {
  id: string;
  checksum: string;
  applied_at: string;
}

interface LedgerDb {
  tovu_migrations: LedgerRow;
}

export interface MigrationReport {
  /** Steps this call applied, in order. */
  applied: string[];
  /** Steps already recorded (by an earlier run or a concurrent process). */
  alreadyApplied: string[];
  notes: string[];
}

/** Throws on duplicate, unordered or malformed ids and on a checksum that is not sha256 hex. */
export function assertValidSteps(steps: readonly MigrationStep[]): void {
  let previous = "";
  for (const step of steps) {
    if (!MIGRATION_ID.test(step.id)) throw new Error(`migration id '${step.id}' is not NNNN_snake_name`);
    if (step.id <= previous) throw new Error(`migration '${step.id}' is out of order or duplicated (after '${previous}')`);
    if (!/^[0-9a-f]{64}$/.test(step.checksum)) throw new Error(`migration '${step.id}' has no sha256 checksum`);
    previous = step.id;
  }
}

function ledger(kernel: StorageKernel<unknown>): StorageKernel<LedgerDb> {
  return kernel as StorageKernel<LedgerDb>;
}

/** Inside the step's transaction, under the lock: two Postgres sessions racing `CREATE TABLE IF NOT
 * EXISTS` can otherwise still collide. Created with the first step, so a backup a step takes in
 * `prepare` is the database exactly as it was. */
async function ensureLedger(kernel: StorageKernel<LedgerDb>): Promise<void> {
  await kernel.run((db) =>
    db.schema
      .createTable(LEDGER_TABLE)
      .ifNotExists()
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("checksum", "text", (column) => column.notNull())
      .addColumn("applied_at", "text", (column) => column.notNull())
      .execute()
  );
}

async function readLedger(kernel: StorageKernel<LedgerDb>): Promise<LedgerRow[]> {
  return kernel.run((db) => db.selectFrom(LEDGER_TABLE).selectAll().orderBy("id").execute());
}

function verifyRecorded(rows: readonly LedgerRow[], steps: readonly MigrationStep[]): void {
  const known = new Map(steps.map((step) => [step.id, step]));
  const unknown = rows.filter((row) => !known.has(row.id)).map((row) => row.id);
  if (unknown.length > 0) throw new UnknownAppliedMigrationError(unknown);
  for (const row of rows) {
    const step = known.get(row.id) as MigrationStep;
    if (row.checksum !== step.checksum) throw new MigrationChecksumError(row.id, row.checksum, step.checksum);
  }
}

/**
 * Applies every pending step of `steps`, in order, to `kernel`'s database.
 *
 * @param optional.backupPath handed to steps that back up an existing database before changing it.
 * @throws UnknownAppliedMigrationError / MigrationChecksumError before applying anything; whatever a
 *   step throws (its transaction is rolled back, later steps are not attempted).
 */
export async function runMigrations(
  kernel: StorageKernel<unknown>,
  steps: readonly MigrationStep[],
  optional: { backupPath?: string } = {}
): Promise<MigrationReport> {
  assertValidSteps(steps);
  kernel.require("interactiveTransactions");
  const store = ledger(kernel);
  const recorded = (await hasLedger(kernel)) ? await readLedger(store) : [];
  verifyRecorded(recorded, steps);

  const report: MigrationReport = { applied: [], alreadyApplied: recorded.map((row) => row.id), notes: [] };
  const context: MigrationContext = { backupPath: optional.backupPath, note: (message) => report.notes.push(message) };
  const done = new Set(report.alreadyApplied);
  for (const step of steps) {
    if (done.has(step.id)) continue;
    await step.prepare?.(kernel, context);
    const applied = await store.transaction(async () => {
      await store.lockKey(LOCK_KEY);
      await ensureLedger(store);
      const row = await store.run((db) => db.selectFrom(LEDGER_TABLE).selectAll().where("id", "=", step.id).executeTakeFirst());
      if (row !== undefined) {
        verifyRecorded([row], steps);
        return false;
      }
      await step.up(kernel, context);
      await store.run((db) =>
        db.insertInto(LEDGER_TABLE).values({ id: step.id, checksum: step.checksum, applied_at: new Date().toISOString() }).execute()
      );
      return true;
    });
    (applied ? report.applied : report.alreadyApplied).push(step.id);
  }
  return report;
}

/** True when `kernel`'s database has a ledger (it has been through {@link runMigrations}). */
export async function hasLedger(kernel: StorageKernel<unknown>): Promise<boolean> {
  return tableExists(kernel, LEDGER_TABLE);
}
