/** @file Tovu compatibility facade over the shared Jini database package. */
// Single-connection/readiness rationale: Jini/packages/db/src/kernel/pglite/driver.ts.
import { PGlite } from "@electric-sql/pglite";
import { openPgliteKernel as jiniOpenPgliteKernel, type PgKernel } from "@jini-ai/db/kernel/pglite";

export type { PgKernel } from "@jini-ai/db/kernel/pglite";

/** Preserve the host opener shape while injecting Tovu's PGlite class. */
export function openPgliteKernel<DB>(optional: { dataDir?: string; prepare?: (client: PGlite) => Promise<void> } = {}): PgKernel<DB> {
  return jiniOpenPgliteKernel<DB>({ PGlite }, optional);
}
