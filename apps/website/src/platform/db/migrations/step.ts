import { UnknownAppliedMigrationError as JiniUnknownAppliedMigrationError } from "@jini-ai/db/migrate";

/** @file Shared step contracts, with Tovu's historical diagnostic and legacy-adoption error. */
// Ordered-history/checksum/backup rationale: Jini/packages/db/src/migrate/step.ts (ADR-066).
// The host runner records that history in tovu_migrations; shipped step IDs are never reused.
export { MIGRATION_ID, MigrationChecksumError, type MigrationContext, type MigrationStep } from "@jini-ai/db/migrate";

/** Preserve the old constructor shape and the product name for direct callers. */
export class UnknownAppliedMigrationError extends JiniUnknownAppliedMigrationError {
  constructor(ids: readonly string[]) {
    super(ids, "Tovu");
  }
}

/** Tovu's frozen Drizzle history cannot be matched; legacy adoption remains host-owned. */
export class LegacyHistoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LegacyHistoryError";
  }
}
