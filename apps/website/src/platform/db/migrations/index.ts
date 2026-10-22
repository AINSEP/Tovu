import { siteConsentRevisions } from './0021_site_consent_revisions.js';
import { workspaceMcpCascade } from "./0022_workspace_mcp_cascade.js";
import { mailLedgers } from "./0023_mail_ledgers.js";
import { domainBindings } from "./0024_domain_bindings.js";
import { mailFeedbackProcessed } from "./0025_mail_feedback_processed.js";
import { domainBindingVersion } from "./0026_domain_binding_version.js";
import { searchIndex } from "./0027_search_index.js";
import { searchIndexRetired } from "./0028_search_index_retired.js";
import { mailActivityIndexes } from "./0029_mail_activity_indexes.js";
import { mailSuppressionAdmin } from "./0030_mail_suppression_admin.js";
import { publishHistoryKind } from "./0017_publish_history_kind.js";
import { formSubmissionRemoteReceipts } from "./0018_form_submission_remote_receipts.js";
import { formDeliveryPlans } from "./0019_form_delivery_plans.js";
import { vaultApiConnectionKind } from "./0020_vault_api_connection_kind.js";
import { AI_CHAT_SCHEMA } from "../chat-kernel.js";
import type { StorageKernel } from "../kernel/port.js";
import { legacyBaseline } from "./0000_legacy_baseline.js";
import { postSearch } from "./0001_post_search.js";
import { dropEmptyLegacyChatTables } from "./0002_drop_empty_legacy_chat_tables.js";
import { coercionJsonAsJson } from "./0003_coercion_json_as_json.js";
import { dropUnusedDeploymentTables } from "./0004_drop_unused_deployment_tables.js";
import { chatBaseline } from "./chat/0000_chat_baseline.js";
import { sqliteChatTables } from "./chat/0001_sqlite_chat_tables.js";
import { durableRunAttempts } from "./chat/0002_durable_run_attempts.js";
import { mediaCreatedBy } from "./0005_media_createdby.js";
import { submissionIpRetentionMigration } from "./0006_submission_ip_retention.js";
import { publishBackstop } from "./0007_publish_backstop.js";
import { postsPublishAtFeaturedMedia } from "./0008_posts_publish_at_featured_media.js";
import { postsAuthor } from "./0009_posts_author.js";
import { membersCredentialsRevokedAt } from "./0010_members_credentials_revoked_at.js";
import { dropEmptyCoreCommerceTables } from "./0011_drop_empty_core_commerce_tables.js";
import { secretsVault } from "./0012_secrets_vault.js";
import { unifyVaultCredentials } from "./0013_unify_vault_credentials.js";
import { mediaLibrary } from "./0014_media_library.js";
import { documentBlobOwnership } from "./0015_document_blob_ownership.js";
import { publishDestinationHistory } from "./0016_publish_destination_history.js";
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
  publishBackstop({ checksum: pinned("0007_publish_backstop") }),
  postsPublishAtFeaturedMedia({ checksum: pinned("0008_posts_publish_at_featured_media") }),
  postsAuthor({ checksum: pinned("0009_posts_author") }),
  membersCredentialsRevokedAt({ checksum: pinned("0010_members_credentials_revoked_at") }),
  dropEmptyCoreCommerceTables({ checksum: pinned("0011_drop_empty_core_commerce_tables") }),
  secretsVault({ checksum: pinned("0012_secrets_vault") }),
  unifyVaultCredentials({ checksum: pinned("0013_unify_vault_credentials") }),
  mediaLibrary({ checksum: pinned("0014_media_library") }),
  documentBlobOwnership({ checksum: pinned("0015_document_blob_ownership") }),
  publishDestinationHistory({ checksum: pinned("0016_publish_destination_history") }),
  publishHistoryKind({ checksum: pinned("0017_publish_history_kind") }),
  formSubmissionRemoteReceipts({ checksum: pinned("0018_form_submission_remote_receipts") }),
  formDeliveryPlans({ checksum: pinned("0019_form_delivery_plans") }),
  vaultApiConnectionKind({ checksum: pinned("0020_vault_api_connection_kind") }),
  siteConsentRevisions({ checksum: pinned("0021_site_consent_revisions") }),
  workspaceMcpCascade({ checksum: pinned("0022_workspace_mcp_cascade") }),
  mailLedgers({ checksum: pinned("0023_mail_ledgers") }),
  domainBindings({ checksum: pinned("0024_domain_bindings") }),
  mailFeedbackProcessed({ checksum: pinned("0025_mail_feedback_processed") }),
  domainBindingVersion({ checksum: pinned("0026_domain_binding_version") }),
  searchIndex({ checksum: pinned("0027_search_index") }),
  searchIndexRetired({ checksum: pinned("0028_search_index_retired") }),
  mailActivityIndexes({ checksum: pinned("0029_mail_activity_indexes") }),
  mailSuppressionAdmin({ checksum: pinned("0030_mail_suppression_admin") }),
];

export const CHAT_MIGRATIONS: readonly MigrationStep[] = [
  chatBaseline(pinned("chat/0000_chat_baseline")),
  sqliteChatTables(pinned("chat/0001_sqlite_chat_tables")),
  durableRunAttempts({ checksum: pinned("chat/0002_durable_run_attempts") }, {}),
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
