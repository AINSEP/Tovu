import { sql } from "kysely";

import { tableExists } from "../kernel/dialect.js";
import type { StorageKernel } from "../kernel/port.js";
import { CORE_COMMERCE_TABLES_IN_DROP_ORDER } from "./0011_drop_empty_core_commerce_tables.js";
import type { MigrationContext, MigrationStep } from "./step.js";

/** @file ADR-066 compatibility step before immutable 0011; never imports historical payments. */
export const ARCHIVE_LEGACY_COMMERCE_ID = "0011_archive_legacy_commerce";
const ARCHIVE_PREFIX = "_archive_0011_";
/** Exact retained artifacts for the schema drift guard; these are never active application tables. */
export const CORE_COMMERCE_ARCHIVE_TABLES = CORE_COMMERCE_TABLES_IN_DROP_ORDER.map(table => `${ARCHIVE_PREFIX}${table}`);

/** Discover only the fixed historical inventory, including empty siblings needed by its FKs.
 * @complexity Six bounded metadata queries; O(1) inventory space. Metadata errors propagate.
 */
async function existingTables(kernel: StorageKernel<unknown>): Promise<string[]> {
  const existing: string[] = [];
  for (const table of CORE_COMMERCE_TABLES_IN_DROP_ORDER) {
    if (await tableExists(kernel, table)) existing.push(table);
  }
  return existing;
}

/** Probe for any historical row without counting or reading commerce payloads.
 * @complexity At most six LIMIT 1 probes returning one scalar each; O(1) space. Query errors propagate.
 */
async function hasRows(kernel: StorageKernel<unknown>, tables: readonly string[]): Promise<boolean> {
  for (const table of tables) {
    const rows = await kernel.query(sql`SELECT 1 AS present FROM ${sql.table(table)} LIMIT 1`);
    if (rows.length > 0) return true;
  }
  return false;
}

/** Rename the entire existing set atomically under the runner's lock/transaction.
 * Native rename preserves rows, FK targets and explicit index identities; no table is copied.
 * @throws Archive collisions name the table to resolve; DDL/query errors roll back the whole step.
 * @complexity Fixed six-table inventory: at most six source probes, six presence probes,
 * six archive probes, one PG lock and six renames. No commerce row payload is read.
 */
async function up(kernel: StorageKernel<unknown>, context: MigrationContext): Promise<void> {
  const existing = await existingTables(kernel);
  if (existing.length === 0) return;
  if (kernel.dialect === "postgres") {
    // The migration advisory lock alone does not exclude ordinary historical table writers.
    await kernel.execute(sql`LOCK TABLE ${sql.join(existing.map(table => sql.table(table)))} IN ACCESS EXCLUSIVE MODE`);
  }
  if (!await hasRows(kernel, existing)) return;
  for (const table of existing) {
    const archive = `${ARCHIVE_PREFIX}${table}`;
    if (await tableExists(kernel, archive)) {
      throw new Error(`${ARCHIVE_LEGACY_COMMERCE_ID}: archive ${archive} already exists; nothing renamed. Keep both table sets and take a database backup before resolving this archive-name collision.`);
    }
  }
  for (const table of existing) {
    await kernel.execute(sql`ALTER TABLE ${sql.table(table)} RENAME TO ${sql.id(`${ARCHIVE_PREFIX}${table}`)}`);
  }
  context.note(`WARNING: Historical commerce rows were preserved by archiving tables: ${existing.map(table => `${table} -> ${ARCHIVE_PREFIX}${table}`).join(", ")}. Upgrade continues with commerce off; no payments were imported. Keep these archives in database backups for historical records and recovery.`);
}

/** Build the host-owned preservation step with its pinned source checksum.
 * @param required Immutable checksum from the host migration manifest.
 * @returns A transactional migration; warnings flow through the runner's report notes.
 * @example archiveLegacyCommerce({ checksum: MIGRATION_CHECKSUMS[ARCHIVE_LEGACY_COMMERCE_ID]! })
 */
export const archiveLegacyCommerce = (
  required: { checksum: string },
  _optional: Record<string, never> = {},
): MigrationStep => ({ id: ARCHIVE_LEGACY_COMMERCE_ID, checksum: required.checksum, up });
