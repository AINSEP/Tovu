import { sql } from "kysely";

import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

/**
 * @file Retire migration 0037's never-written deployment model (owner, 2026-10-03).
 * Real deployments use content/agent-plugins/deploy's operations, targets and configs; they never
 * write these tables. Publish credentials and static publish history have separate tables and stay.
 * The frozen SQLite chain and Postgres baseline still create the old tables, so both fresh installs
 * and existing databases need this forward step. Drop children before parents to respect FKs.
 */
export const DROP_UNUSED_DEPLOYMENT_TABLES_ID = "0004_drop_unused_deployment_tables";

const TABLES_IN_DROP_ORDER = [
  "deployment_run_events",
  "deployment_runs",
  "deployment_targets",
  "releases",
  "deployment_environments",
];

/** Drop the obsolete model on every supported dialect (SQLite and Postgres/PGlite).
 * @complexity O(1) — five DDL statements; runner supplies the transaction and migration lock.
 */
async function up(kernel: StorageKernel<unknown>): Promise<void> {
  for (const table of TABLES_IN_DROP_ORDER) {
    await kernel.execute(sql`DROP TABLE IF EXISTS ${sql.table(table)}`);
  }
}

/** Build the host-owned migration step with its immutable source checksum. */
export const dropUnusedDeploymentTables = (
  required: { checksum: string },
  _optional: Record<string, never> = {}
): MigrationStep => ({ id: DROP_UNUSED_DEPLOYMENT_TABLES_ID, checksum: required.checksum, up });
