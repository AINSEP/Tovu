import {
  hasLedger as jiniHasLedger,
  runMigrations as jiniRunMigrations,
  UnknownAppliedMigrationError as JiniUnknownAppliedMigrationError,
  type MigrationOptions as JiniMigrationOptions,
  type MigrationReport,
  type MigrationStep,
} from "@jini-ai/db/migrate";
import type { StorageKernel } from "@jini-ai/db/kernel";
import { UnknownAppliedMigrationError } from "./step.js";

/** @file Tovu's ledger defaults over Jini's shared runner; step/checksum bytes stay host-owned. */
// Migration invariants: Jini packages/db/src/migrate/runner.ts (Tovu ADR-066; chat history ADR-067).
export { assertValidSteps, type MigrationReport } from "@jini-ai/db/migrate";
export const LEDGER_TABLE = "tovu_migrations";
export type MigrationOptions = Omit<JiniMigrationOptions, "ledgerTable" | "appName"> & { ledgerTable?: string };

/** Apply a history with the old default ledger and Tovu's operator-facing error contract. */
export async function runMigrations(
  kernel: StorageKernel<unknown>,
  steps: readonly MigrationStep[],
  optional: MigrationOptions = {}
): Promise<MigrationReport> {
  try {
    return await jiniRunMigrations(kernel, steps, { ...optional, ledgerTable: optional.ledgerTable ?? LEDGER_TABLE, appName: "Tovu" });
  } catch (error) {
    if (error instanceof JiniUnknownAppliedMigrationError && !(error instanceof UnknownAppliedMigrationError)) {
      throw new UnknownAppliedMigrationError(error.ids);
    }
    throw error;
  }
}

/** The old hasLedger API always checks the content ledger. */
export function hasLedger(kernel: StorageKernel<unknown>): Promise<boolean> {
  return jiniHasLedger(kernel, LEDGER_TABLE);
}
