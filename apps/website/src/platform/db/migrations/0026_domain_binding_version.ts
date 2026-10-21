import { sql } from "kysely";
import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

/**
 * @file Migration 0026: `domain_binding.version`, the compare-and-swap counter of a binding.
 *
 * 0024's store upserted unconditionally after asynchronous DNS reads, so a slow background
 * re-check could overwrite the requirements a newer `dns_verify` had just saved (review 13-dns #8).
 * Every write now names the version it read and bumps it; a write against a version that moved on
 * changes nothing and the stale observation is discarded (sweep) or recomputed (`dns_verify`).
 * Rows from before this step start at 0, which is what their readers then expect.
 *
 * Portable DDL (integer only) for SQLite and Postgres, shared with the fresh-database bootstrap.
 */
export const DOMAIN_BINDING_VERSION_ID = "0026_domain_binding_version";

export const DOMAIN_BINDING_VERSION_STATEMENTS = [
  "ALTER TABLE domain_binding ADD COLUMN version integer NOT NULL DEFAULT 0 CHECK (version >= 0)",
] as const;

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  for (const statement of DOMAIN_BINDING_VERSION_STATEMENTS) await kernel.execute(sql.raw(statement));
}

/** Build the immutable ADR-066 step. @example domainBindingVersion({ checksum: pinnedChecksum }) */
export function domainBindingVersion(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep {
  return { id: DOMAIN_BINDING_VERSION_ID, checksum: required.checksum, up };
}
