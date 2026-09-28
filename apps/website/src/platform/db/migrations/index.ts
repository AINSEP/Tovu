import type { StorageKernel } from "../kernel/port.js";
import { legacyBaseline } from "./0000_legacy_baseline.js";
import { MIGRATION_CHECKSUMS } from "./checksums.js";
import { type MigrationReport, runMigrations } from "./runner.js";
import type { MigrationStep } from "./step.js";

/**
 * @file The content database's migration history (ADR-066), in order. Add a step as
 * `NNNN_name.ts` exporting a factory taking its pinned checksum, append it here, and pin its
 * checksum with `UPDATE_MIGRATION_CHECKSUMS=1` + `__tests__/checksums.test.ts` (new ids only).
 */

function pinned(id: string): string {
  const checksum = MIGRATION_CHECKSUMS[id];
  if (checksum === undefined) throw new Error(`migration ${id} has no pinned checksum in checksums.ts`);
  return checksum;
}

export const CONTENT_MIGRATIONS: readonly MigrationStep[] = [legacyBaseline(pinned("0000_legacy_baseline"))];

/** Brings a content database (any dialect) to head. See `runner.ts`. */
export function migrateContentDatabase(kernel: StorageKernel<unknown>, optional: { backupPath?: string } = {}): Promise<MigrationReport> {
  return runMigrations(kernel, CONTENT_MIGRATIONS, optional);
}

export { type MigrationReport, runMigrations } from "./runner.js";
export { LegacyHistoryError, MigrationChecksumError, type MigrationStep, UnknownAppliedMigrationError } from "./step.js";
