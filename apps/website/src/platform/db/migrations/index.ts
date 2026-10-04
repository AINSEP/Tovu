import { AI_CHAT_SCHEMA } from "../chat-kernel.js";
import type { StorageKernel } from "../kernel/port.js";
import { legacyBaseline } from "./0000_legacy_baseline.js";
import { postSearch } from "./0001_post_search.js";
import { dropEmptyLegacyChatTables } from "./0002_drop_empty_legacy_chat_tables.js";
import { coercionJsonAsJson } from "./0003_coercion_json_as_json.js";
import { dropUnusedDeploymentTables } from "./0004_drop_unused_deployment_tables.js";
import { chatBaseline } from "./chat/0000_chat_baseline.js";
import { sqliteChatTables } from "./chat/0001_sqlite_chat_tables.js";
import { mediaCreatedBy } from "./0005_media_createdby.js";
import { submissionIpRetentionMigration } from "./0006_submission_ip_retention.js";
import { MIGRATION_CHECKSUMS } from "./checksums.js";
import { LEDGER_TABLE, type MigrationReport, runMigrations } from "./runner.js";
import type { MigrationStep } from "./step.js";

/**
 * @file The content database's migration history (ADR-066), in order. Add a step as
 * `NNNN_name.ts` exporting a factory taking its pinned checksum, append it here, and pin its
 * checksum with `UPDATE_MIGRATION_CHECKSUMS=1` + `__tests__/checksums.test.ts` (new ids only).
 *
 * The AI chat tables have their own history ({@link CHAT_MIGRATIONS}, files under `chat/`, pinned
 * as `chat/NNNN_name`) and its own ledger. On Postgres/PGlite they live in the `ai_chat` schema of
 * the content database, ledger included (ADR-067); on SQLite in the site's `chat.db` file.
 */

export const CHAT_LEDGER_TABLE = "tovu_chat_migrations";

function pinned(id: string): string {
  const checksum = MIGRATION_CHECKSUMS[id];
  if (checksum === undefined) throw new Error(`migration ${id} has no pinned checksum in checksums.ts`);
  return checksum;
}

export const CONTENT_MIGRATIONS: readonly MigrationStep[] = [
  legacyBaseline(pinned("0000_legacy_baseline")),
  postSearch(pinned("0001_post_search")),
  dropEmptyLegacyChatTables(pinned("0002_drop_empty_legacy_chat_tables")),
  coercionJsonAsJson(pinned("0003_coercion_json_as_json")),
  dropUnusedDeploymentTables({ checksum: pinned("0004_drop_unused_deployment_tables") }),
  mediaCreatedBy({ checksum: pinned("0005_media_createdby") }),
  submissionIpRetentionMigration({ checksum: pinned("0006_submission_ip_retention") }),
];

export const CHAT_MIGRATIONS: readonly MigrationStep[] = [
  chatBaseline(pinned("chat/0000_chat_baseline")),
  sqliteChatTables(pinned("chat/0001_sqlite_chat_tables")),
];

/** Brings a content database (any dialect) to head. See `runner.ts`. */
export function migrateContentDatabase(kernel: StorageKernel<unknown>, optional: { backupPath?: string } = {}): Promise<MigrationReport> {
  return runMigrations(kernel, CONTENT_MIGRATIONS, { ...optional, ledgerTable: LEDGER_TABLE });
}

/**
 * Brings the AI chat tables to head. Postgres/PGlite: `kernel` is the database's plain (unscoped)
 * kernel; tables and ledger `tovu_chat_migrations` in the `ai_chat` schema. SQLite: `kernel` is the
 * site's `chat.db`; same ledger, no schema.
 */
export function migrateChatDatabase(kernel: StorageKernel<unknown>): Promise<MigrationReport> {
  const schema = kernel.dialect === "postgres" ? AI_CHAT_SCHEMA : undefined;
  return runMigrations(kernel, CHAT_MIGRATIONS, { ledgerTable: CHAT_LEDGER_TABLE, schema });
}

export { type MigrationOptions, type MigrationReport, runMigrations } from "./runner.js";
export { LegacyHistoryError, MigrationChecksumError, type MigrationStep, UnknownAppliedMigrationError } from "./step.js";
