import { sql } from "kysely";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { MigrationStep } from "@jini-ai/core/contracts/storage";

/**
 * @file Migration 0042: a `version` column on six editable tables, for optimistic concurrency.
 *
 * Their saves wrote unconditionally, so two editors (or an editor and an agent) saving the same row
 * silently lost the first save (refactor pattern lost-update, 2026-11-13). Each editable save will
 * bump `version`, and a write names the version it read; one against a version that moved on
 * changes nothing. Rows from before this step start at 1, the same default a new row gets.
 *
 * Additive, O(1) per table (a constant default needs no row rewrite on SQLite or Postgres 11+).
 * Portable DDL (integer only) for SQLite and Postgres, shared with the fresh-database bootstrap.
 * Added as an ADR-066 step: the Drizzle chain is frozen and is not extended.
 */
export const OPTIMISTIC_CONCURRENCY_VERSIONS_ID = "0042_optimistic_concurrency_versions";

export const OPTIMISTIC_CONCURRENCY_VERSION_TABLES = [
  "webhook_subscriptions",
  "external_mcp_servers",
  "identity_users",
  "roles",
  "policies",
  "workspaces",
] as const;

export const OPTIMISTIC_CONCURRENCY_VERSIONS_STATEMENTS = OPTIMISTIC_CONCURRENCY_VERSION_TABLES.map(
  table => `ALTER TABLE ${table} ADD COLUMN version integer NOT NULL DEFAULT 1`,
);

async function up(kernel: KyselyKernel<unknown>): Promise<void> {
  for (const statement of OPTIMISTIC_CONCURRENCY_VERSIONS_STATEMENTS) await kernel.execute(sql.raw(statement));
}

/** Build the immutable ADR-066 step. @example optimisticConcurrencyVersions({ checksum: pinnedChecksum }) */
export function optimisticConcurrencyVersions(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep<KyselyKernel<unknown>> {
  return { id: OPTIMISTIC_CONCURRENCY_VERSIONS_ID, checksum: required.checksum, up };
}
