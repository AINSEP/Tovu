import { formatErrorForLog } from "@jini-ai/core";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NativeSqliteDatabase } from "../kernel/drivers/sqlite.js";
import type { SqliteSyncOpener } from "@jini-ai/core/contracts/storage";
import { DatabaseDiskSpaceError, selectDatabaseCopiesToPrune } from "@jini-ai/db/sqlite";
import { lstat, readdir, unlink } from "node:fs/promises";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { closeSqliteConnection, sqliteKernel, openNativeSqlite } from "../kernel/drivers/sqlite.js";
import { migrateContentDatabase, type MigrationReport } from "../migrations/index.js";
import * as schema from "../schema.sqlite.js";
import { bootstrapFreshContentDb } from "./fresh-content-db.js";
import { processCopyCoordinator, pruneMigrationCopies, sqliteCopyPorts, type CopyCoordinator, type PruneMigrationCopiesRequired, type ReadonlySqliteOpener } from "./copy-coordinator.js";

/**
 * @file Per-site content.db bootstrap (Drizzle over better-sqlite3).
 *
 * Purpose:
 * Opens the SQLite file that backs one site's content and applies pragmas. A site's boot brings it
 * to head through the migration runner ({@link migrateSqliteContentFile}, ADR-066); the sync
 * {@link openContentDb} is for fresh throwaway databases, tests and scripts. Seeding and the
 * watermark row are kernel work (`../prepare-content-store.ts`).
 *
 * How it relates to the project:
 * - The composition root opens the db here and injects the typed Drizzle handle into
 *   the per-feature `repo.sqlite.ts` adapters.
 * - Schema changes are TS steps in `db/migrations/`; the drizzle chain in `db/drizzle/` is frozen
 *   (ADR-066) and is the SQLite half of step `0000_legacy_baseline`.
 * - ADR-042 item 3: this file previously imported `seededWorkspace`/`seededPosts`/
 *   `seededPresentation` directly from `server/seed.ts` — infra depending on
 *   server, a layer-direction violation with no discovered justification. Seed
 *   data is now a parameter the composition root supplies (dependency inversion,
 *   the same seam every port in this codebase already uses), not a value this
 *   file reaches up to fetch itself.
 *
 * Architectural role:
 * Infrastructure. Only adapters and the composition root touch Drizzle/SQLite;
 * domain/slice code stays provider-agnostic.
 */
/**
 * SPEC-016 (`core/gated-mutations`'s `db-ops.ts` adapter, ADR-041 §5): widened with `$client`
 * (the raw `better-sqlite3` `Database` instance `drizzle()` already returns at runtime) so a
 * restore-point capture can call the driver's online-backup API directly. Additive only — every
 * existing caller that only used the Drizzle query surface is unaffected.
 */
export type ContentDb = BetterSQLite3Database<typeof schema> & { $client: NativeSqliteDatabase };

/** The frozen legacy chain, `src/platform/db/drizzle/` (resolved from this file). */
const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../drizzle");

/** First-run demo content a caller may supply to `prepareContentStore` (`../prepare-content-store.ts`). */
export interface ContentDbSeedData {
  workspace: typeof schema.workspaces.$inferInsert;
  /** Optional starter widgets/collections stored as portable content entries. */
  contentEntries?: Array<Omit<typeof schema.entries.$inferInsert, "fieldsJson"> & { fieldsJson: unknown }>;
  /**
   * `bodyJson` and (SPEC-005) `ext` are both JSON-text columns whose seed callers hand us the
   * parsed object — the same shape `PostRecord` carries — so both are widened here and serialized
   * on insert below. `ext` is optional: a seed entry without one gets the column's `'{}'` default.
   */
  posts: Array<
    Omit<typeof schema.posts.$inferInsert, "bodyJson" | "ext"> & { bodyJson: unknown; ext?: unknown }
  >;
  presentation: typeof schema.presentationSettings.$inferInsert;
}

/**
 * Open (or create) the content.db file with its pragmas — no migration, no write. The site opener
 * uses this so crash recovery (ADR-023 §2) can read the plugin migration journal before
 * {@link migrateSqliteContentFile} touches the schema.
 */
export interface ContentDbOpenOptions { readonly open?: SqliteSyncOpener<NativeSqliteDatabase> }

export function openSqliteContentConnection({ filePath }: { filePath: string }, { open = openNativeSqlite }: ContentDbOpenOptions = {}): ContentDb {
  const sqlite = open(filePath, {});
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  // SPEC-033 — defense in depth alongside the store plugin's identical fix: this connection can
  // itself be the "second" connection relative to a separate one (e.g. the store plugin's own
  // dedicated handle) transiently holding a lock. Retry internally rather than throwing immediately.
  sqlite.pragma("busy_timeout = 5000");
  return drizzle(sqlite, { schema }) as ContentDb;
}

/** A site's pre-migration copies live in `<site>/ops/` under this prefix + an ISO timestamp + `.db`. */
export const MIGRATION_BACKUP_PREFIX = "pre-migrations-";

/**
 * Brings an open content.db to head through the migration runner (ADR-066). When the file already
 * holds a database and a step is pending (no ledger yet, or it is behind), the runner first copies
 * it to `<dir>/ops/pre-migrations-<timestamp>.db`; after a successful copy, older copies are removed
 * (the newest five per site are kept, anchored on a newest copy that passes a read-only quick_check). Nothing pending: nothing is written. Low disk space warns
 * and skips only the backup: a production boot must still be able to apply its pending migrations.
 *
 * @param required.filePath - the file `db` was opened on (`:memory:`: no copy).
 * @throws LegacyHistoryError when the file's drizzle history cannot be matched to the frozen chain;
 *   the database is left as it was (the copy is kept).
 */
export async function migrateSqliteContentFile(
  { db, filePath, copies, verify, listProtected }: { db: ContentDb; filePath: string } & MigrationCopyPorts,
  _optional: Record<string, never> = {},
): Promise<MigrationReport> {
  const backupPath = filePath === ":memory:" ? undefined : migrationBackupPath({ filePath });
  const opsDir = backupPath ? path.dirname(backupPath) : ":memory:";
  // The whole runner is the publication: the copy is written and pruned inside one lane, so a retention
  // pass or a Recovery hold never sees a half-written copy as the newest one.
  const report = await copies.withCopyPublication({ opsDir, work: () => migrateContentDatabase({ kernel: sqliteKernel<unknown>({ source: db }) }, { backupPath, onBackupError: ({ error, backupPath: failed }) => {
    if (!isDiskFull({ error })) throw error;
    // A half-written copy only holds the space that ran out; the boot continues without it.
    fs.rmSync(failed, { force: true });
    console.warn(`[migrations] Skipping pre-migration backup: ${error instanceof Error ? error.message : String(error)}`);
  }, onBackupComplete: async ({ backupPath: written }) => {
    // Recovery-window cleanup cannot turn a successful copy into a production boot refusal.
    await pruneMigrationCopies({ opsDir, justWritten: written, verify, held: copies.held, listProtected, fs: { readdir, lstat, unlink }, selectCopies: selectDatabaseCopiesToPrune })
      .catch(error => console.warn(`[migrations] Could not prune older pre-migration backups. ${formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS)}`));
  } }) }, {});
  if (report.applied.length > 0) {
    console.log(`[migrations] ${filePath}: applied ${report.applied.join(", ")}`);
    for (const note of report.notes) console.log(`[migrations]   ${note}`);
  }
  return report;
}

/** The preflight refusal, or SQLite running out of space mid-copy (the 11-01 prod error). */
function isDiskFull({ error }: { error: unknown }, _optional: Record<string, never> = {}): boolean {
  return error instanceof DatabaseDiskSpaceError || (typeof error === "object" && error !== null && "code" in error && error.code === "SQLITE_FULL");
}

function migrationBackupPath({ filePath }: { filePath: string }, _optional: Record<string, never> = {}): string {
  const opsDir = path.join(path.dirname(path.resolve(filePath)), "ops");
  return path.join(opsDir, `${MIGRATION_BACKUP_PREFIX}${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
}

/** The shared copy coordinator plus the checks the migration pruner needs before it removes anything. */
export interface MigrationCopyPorts {
  copies: Pick<CopyCoordinator, "withCopyPublication" | "held">;
  verify: PruneMigrationCopiesRequired["verify"];
  listProtected: PruneMigrationCopiesRequired["listProtected"];
}

/**
 * The serving process's real migration-copy ports: the process coordinator, read-only quick_check and the
 * site's recovery journal (`<site>/ops/database-journal.db` unless the caller names another journal).
 * @complexity O(1); the returned checks do the I/O.
 */
export function siteMigrationCopyPorts({ filePath }: { filePath: string }, { journalPath }: { journalPath?: string } = {}): MigrationCopyPorts {
  const journal = journalPath ?? path.join(path.dirname(path.resolve(filePath)), "ops", "database-journal.db");
  return sqliteCopyPorts({ journalPath: journal, copies: processCopyCoordinator, open: openNativeSqlite as unknown as ReadonlySqliteOpener, exists: fs.existsSync });
}

/**
 * Open (or create) a content.db synchronously for throwaway databases (`:memory:`, the hermetic
 * composition), tests and scripts. An empty database gets the frozen baseline and current content
 * steps atomically through bootstrapFreshContentDb, including the normal ledger.
 *
 * Existing files retain the frozen-chain path through drizzle's migrator. Drizzle decides
 * "applied" by journal stamps, which is sound for a file at the chain's head (every adopted site),
 * not for a partial legacy history. This existing-file path writes no `tovu_migrations` ledger and
 * keeps any legacy chat tables (a legacy site's first boot adopts the file and drops the empty
 * ones, step `0002`). Site boot uses the migration runner instead
 * (`server/runtime/composition/open-site-content-db.ts`, `site-dir/boot-site-dir.ts`).
 */
export function openContentDb(required: string | { filePath: string }, options: ContentDbOpenOptions = {}): ContentDb {
  const filePath = typeof required === "string" ? required : required.filePath;
  const db = openSqliteContentConnection({ filePath }, options);
  try {
    if (!bootstrapFreshContentDb({ db })) migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    return db;
  } catch (error) {
    closeSqliteConnection({ source: db });
    throw error;
  }
}

/**
 * Open an EXISTING content.db strictly for reading — no migration, no watermark row, no write of
 * any kind. Unlike {@link openContentDb}, which unconditionally calls `migrate()` (applies any
 * migration not yet recorded against this file, a genuine schema write) and `ensureWatermarkRow()`
 * (an `INSERT OR IGNORE`, a genuine row write) before a caller ever gets to check its own
 * `--dry-run` flag, this function cannot perform either: `better-sqlite3`'s own `readonly: true`
 * connection mode rejects any write at the SQLite level, not just at this module's call sites — the
 * same guarantee a `--dry-run` script needs and `openContentDb` structurally cannot give it (see the
 * AAD backfill script family and the custom credential username backfill,
 * each of which now opens its dry-run path through this function instead).
 *
 * A caller that needs to read a column only a not-yet-applied migration would add gets a loud SQLite
 * error here ("no such column"), never a silent auto-migration — the correct trade for a function
 * whose entire contract is "never writes".
 *
 * @throws If `filePath` does not already exist (`fileMustExist: true` — there is nothing to
 *   "create" in a read-only open), or whatever `better-sqlite3` throws for a malformed/locked file.
 * @complexity O(1) — one connection open, no migration sweep.
 */
export function openContentDbReadOnly({ filePath }: { filePath: string }, { open = openNativeSqlite }: ContentDbOpenOptions = {}): ContentDb {
  const sqlite = open(filePath, { readonly: true, fileMustExist: true });
  sqlite.pragma("busy_timeout = 5000");
  return drizzle(sqlite, { schema }) as ContentDb;
}
