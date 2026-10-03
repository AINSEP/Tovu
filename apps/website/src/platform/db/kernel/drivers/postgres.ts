/** @file Tovu compatibility facade over the shared Jini database package. */
import pg from "pg";
import { openPostgresKernel as jiniOpenPostgresKernel } from "@jini-ai/db/kernel/postgres";
import type { StorageKernel } from "@jini-ai/db/kernel";

/** Preserve the host opener shape while injecting Tovu's pg module and pool limit. */
// Pool concurrency and idle-error recovery rationale: Jini/packages/db/src/kernel/postgres/driver.ts.
export function openPostgresKernel<DB>(required: { connectionString: string; max?: number }): StorageKernel<DB> {
  return jiniOpenPostgresKernel<DB>({ pg, connectionString: required.connectionString }, { max: required.max });
}
