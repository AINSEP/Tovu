import { type Kysely, sql } from "kysely";

import { listTables, tableExists } from "../kernel/dialect.js";
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
 * - Given {@link MigrationOptions.backupPath}, a database that already holds tables is copied there
 *   once, outside any transaction, before the first pending step (ledger absent or behind). Nothing
 *   pending, an empty database or a driver without `backup` (Postgres): no copy.
 * - One runner, several histories: a history other than the content one names its own ledger
 *   ({@link MigrationOptions.ledgerTable}) and, on Postgres, the schema that ledger lives in
 *   ({@link MigrationOptions.schema}; the AI chat history's `ai_chat`, ADR-067). Ledger statements
 *   go through Kysely `withSchema`, never `SET search_path` (no session state on a shared PGlite).
 */

export const LEDGER_TABLE = "tovu_migrations";

interface LedgerRow {
  id: string;
  checksum: string;
  applied_at: string;
}

type LedgerDb = Record<string, LedgerRow>;

export interface MigrationOptions {
  /** Where to copy an existing database before the first pending step changes it (see the file header). */
  backupPath?: string;
  /** The ledger table (default {@link LEDGER_TABLE}); also the migration lock's key. */
  ledgerTable?: string;
  /** Postgres only: the schema holding the ledger, created with it when missing. */
  schema?: string;
}

/** Where one history's ledger lives, resolved from {@link MigrationOptions}. */
interface Ledger {
  readonly table: string;
  readonly schema: string | undefined;
  readonly lockKey: string;
  run<T>(fn: (db: Kysely<LedgerDb>) => Promise<T>): Promise<T>;
}

function ledgerFor(kernel: StorageKernel<unknown>, options: MigrationOptions): Ledger {
  const table = options.ledgerTable ?? LEDGER_TABLE;
  const { schema } = options;
  if (schema !== undefined && kernel.dialect !== "postgres") throw new Error(`a migration ledger schema ('${schema}') needs Postgres, not ${kernel.dialect}`);
  const store = kernel as StorageKernel<LedgerDb>;
  return {
    table,
    schema,
    lockKey: schema === undefined ? table : `${schema}.${table}`,
    run: (fn) => store.run((db) => fn(schema === undefined ? db : db.withSchema(schema))),
  };
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

/** Inside the step's transaction, under the lock: two Postgres sessions racing `CREATE TABLE IF NOT
 * EXISTS` can otherwise still collide. Created with the first step, so a backup a step takes in
 * `prepare` is the database exactly as it was. */
async function ensureLedger(kernel: StorageKernel<unknown>, ledger: Ledger): Promise<void> {
  if (ledger.schema !== undefined) await kernel.run((db) => db.schema.createSchema(ledger.schema as string).ifNotExists().execute());
  await ledger.run((db) =>
    db.schema
      .createTable(ledger.table)
      .ifNotExists()
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("checksum", "text", (column) => column.notNull())
      .addColumn("applied_at", "text", (column) => column.notNull())
      .execute()
  );
}

async function readLedger(ledger: Ledger): Promise<LedgerRow[]> {
  return ledger.run((db) => db.selectFrom(ledger.table).selectAll().orderBy("id").execute());
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
 * @param optional.backupPath where an existing database is copied before the first pending step.
 * @throws UnknownAppliedMigrationError / MigrationChecksumError before applying anything; whatever a
 *   step throws (its transaction is rolled back, later steps are not attempted).
 */
export async function runMigrations(
  kernel: StorageKernel<unknown>,
  steps: readonly MigrationStep[],
  optional: MigrationOptions = {}
): Promise<MigrationReport> {
  assertValidSteps(steps);
  kernel.require("interactiveTransactions");
  const ledger = ledgerFor(kernel, optional);
  const recorded = (await ledgerExists(kernel, ledger)) ? await readLedger(ledger) : [];
  verifyRecorded(recorded, steps);

  const report: MigrationReport = { applied: [], alreadyApplied: recorded.map((row) => row.id), notes: [] };
  const context: MigrationContext = { backupPath: optional.backupPath, note: (message) => report.notes.push(message) };
  const done = new Set(report.alreadyApplied);
  let backedUp = false;
  for (const step of steps) {
    if (done.has(step.id)) continue;
    if (!backedUp) await backUpBeforeChange(kernel, context);
    backedUp = true;
    await step.prepare?.(kernel, context);
    const applied = await kernel.transaction(async () => {
      await kernel.lockKey(ledger.lockKey);
      await ensureLedger(kernel, ledger);
      const row = await ledger.run((db) => db.selectFrom(ledger.table).selectAll().where("id", "=", step.id).executeTakeFirst());
      if (row !== undefined) {
        verifyRecorded([row], steps);
        return false;
      }
      await step.up(kernel, context);
      await ledger.run((db) =>
        db.insertInto(ledger.table).values({ id: step.id, checksum: step.checksum, applied_at: new Date().toISOString() }).execute()
      );
      return true;
    });
    (applied ? report.applied : report.alreadyApplied).push(step.id);
  }
  return report;
}

/** The pre-change copy (see the file header). Outside any transaction: a backup cannot run inside one. */
async function backUpBeforeChange(kernel: StorageKernel<unknown>, context: MigrationContext): Promise<void> {
  const target = context.backupPath;
  if (target === undefined || !kernel.capabilities.backup || (await listTables(kernel)).length === 0) return;
  await kernel.backupTo(target);
  context.note(`backed up the database to ${target} before migrating it`);
}

async function ledgerExists(kernel: StorageKernel<unknown>, ledger: Ledger): Promise<boolean> {
  if (ledger.schema === undefined) return tableExists(kernel, ledger.table);
  const [row] = await kernel.query<{ found: string | null }>(sql`SELECT to_regclass(${`${ledger.schema}.${ledger.table}`})::text AS found`);
  return row?.found != null;
}

/** True when `kernel`'s database has the content ledger (it has been through {@link runMigrations}). */
export async function hasLedger(kernel: StorageKernel<unknown>): Promise<boolean> {
  return tableExists(kernel, LEDGER_TABLE);
}
