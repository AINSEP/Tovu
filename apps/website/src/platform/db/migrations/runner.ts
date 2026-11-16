import {
  hasLedger as jiniHasLedger,
  runMigrations as jiniRunMigrations,
  type MigrationOptions as JiniMigrationOptions,
  type MigrationReport,
  type MigrationStep,
} from "@jini-ai/db/migrate";
import type { StorageKernel } from "@jini-ai/db/kernel";

/** @file Tovu's ledger defaults over Jini's shared runner; step/checksum bytes stay host-owned. */
// Migration invariants: Jini packages/db/src/migrate/runner.ts (Tovu ADR-066; chat history ADR-067).
export { assertValidSteps, type MigrationReport } from "@jini-ai/db/migrate";
export const LEDGER_TABLE = "tovu_migrations";
export type MigrationOptions = Omit<JiniMigrationOptions, "ledgerTable" | "appName"> & { ledgerTable?: string };

/** Apply a history with the old default ledger; the Jini runner carries the Tovu product name in its errors. */
export async function runMigrations(
  kernel: StorageKernel<unknown>,
  steps: readonly MigrationStep[],
  optional: MigrationOptions = {}
): Promise<MigrationReport> {
  return jiniRunMigrations(kernel, steps, { ...optional, ledgerTable: optional.ledgerTable ?? LEDGER_TABLE, appName: "Tovu" });
}

/** The old hasLedger API always checks the content ledger. */
export function hasLedger(kernel: StorageKernel<unknown>): Promise<boolean> {
  return jiniHasLedger(kernel, LEDGER_TABLE);
}
