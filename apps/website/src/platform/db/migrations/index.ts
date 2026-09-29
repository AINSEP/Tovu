import { AI_CHAT_SCHEMA } from "../chat-kernel.js";
import type { StorageKernel } from "../kernel/port.js";
import { legacyBaseline } from "./0000_legacy_baseline.js";
import { postSearch } from "./0001_post_search.js";
import { chatBaseline } from "./chat/0000_chat_baseline.js";
import { MIGRATION_CHECKSUMS } from "./checksums.js";
import { type MigrationReport, runMigrations } from "./runner.js";
import type { MigrationStep } from "./step.js";

/**
 * @file The content database's migration history (ADR-066), in order. Add a step as
 * `NNNN_name.ts` exporting a factory taking its pinned checksum, append it here, and pin its
 * checksum with `UPDATE_MIGRATION_CHECKSUMS=1` + `__tests__/checksums.test.ts` (new ids only).
 *
 * The AI chat tables have their own history ({@link CHAT_MIGRATIONS}, files under `chat/`, pinned
 * as `chat/NNNN_name`), applied on Postgres/PGlite only: there they live in the `ai_chat` schema of
 * the content database with their own ledger (ADR-067); SQLite keeps `chat.db`'s bootstrap.
 */

export const CHAT_LEDGER_TABLE = "tovu_chat_migrations";

function pinned(id: string): string {
  const checksum = MIGRATION_CHECKSUMS[id];
  if (checksum === undefined) throw new Error(`migration ${id} has no pinned checksum in checksums.ts`);
  return checksum;
}

export const CONTENT_MIGRATIONS: readonly MigrationStep[] = [legacyBaseline(pinned("0000_legacy_baseline")), postSearch(pinned("0001_post_search"))];

export const CHAT_MIGRATIONS: readonly MigrationStep[] = [chatBaseline(pinned("chat/0000_chat_baseline"))];

/** Brings a content database (any dialect) to head. See `runner.ts`. */
export function migrateContentDatabase(kernel: StorageKernel<unknown>, optional: { backupPath?: string } = {}): Promise<MigrationReport> {
  return runMigrations(kernel, CONTENT_MIGRATIONS, optional);
}

/**
 * Brings the AI chat tables of a Postgres/PGlite database to head: `ai_chat` schema, ledger
 * `ai_chat.tovu_chat_migrations`. `kernel` is the database's plain (unscoped) kernel.
 */
export function migrateChatDatabase(kernel: StorageKernel<unknown>): Promise<MigrationReport> {
  return runMigrations(kernel, CHAT_MIGRATIONS, { ledgerTable: CHAT_LEDGER_TABLE, schema: AI_CHAT_SCHEMA });
}

export { type MigrationOptions, type MigrationReport, runMigrations } from "./runner.js";
export { LegacyHistoryError, MigrationChecksumError, type MigrationStep, UnknownAppliedMigrationError } from "./step.js";
