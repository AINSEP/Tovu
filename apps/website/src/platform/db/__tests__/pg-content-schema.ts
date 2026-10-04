import type { PGlite, Transaction } from "@electric-sql/pglite";

import { collectSchemaTables } from "../../../features/database-transfer/table-catalog.js";
import { constraintSql, createTableSql, indexSql } from "../../../features/database-transfer/postgres-ddl.js";

/**
 * @file Test support: the content schema on a fresh Postgres (PGlite) database, built from
 * `schema.postgres.ts` through the same DDL the SQLite→Postgres copy writes
 * (`features/database-transfer`), so there is one Postgres layout, not two.
 *
 * It creates the schema ONCE on an empty database and never changes an existing one. Production
 * Postgres sites get their schema from the migration runner; this is the reference the type
 * generator (`kernel/__tests__/database-types.test.ts`) and the baseline/owner tests compare against.
 * Moved from `pglite/content-schema.ts` (no production importer; see development/DELETED-CODE.md).
 */

/** True when the content tables are already there. */
export async function hasPgContentSchema(client: PGlite | Transaction): Promise<boolean> {
  const found = await client.query<{ t: string | null }>(`SELECT to_regclass('public.posts')::text AS t`);
  return Boolean(found.rows[0]?.t);
}

/** The whole content schema — every table, credential tables included — as one DDL script
 *  (tables, then indexes, then constraints). */
export function pgContentSchemaSql(): string {
  const tables = collectSchemaTables();
  return (
    tables.map((table) => createTableSql("public", table)).join("") +
    tables.map((table) => indexSql("public", table)).join("") +
    constraintSql("public", tables)
  );
}

/** Creates the content schema in one transaction when the database has none. */
export async function ensurePgContentSchema(client: PGlite): Promise<void> {
  if (await hasPgContentSchema(client)) return;
  await client.transaction(async (tx) => {
    await tx.exec(pgContentSchemaSql());
  });
}
