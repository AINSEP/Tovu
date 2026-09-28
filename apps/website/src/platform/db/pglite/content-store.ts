import type { PGlite, Transaction } from "@electric-sql/pglite";
import { Kysely } from "kysely";

import type { ContentDatabase } from "../content-database.generated.js";
import { PgliteDialect } from "../kernel/drivers/pglite-dialect.js";
import { openPgliteKernel, type PgKernel, sqliteKernel } from "../kernel/index.js";
import type { ContentDb } from "../sqlite/content-db.js";
import { hasPgContentSchema, pgContentSchemaSql } from "./content-schema.js";

/**
 * @file The PGlite content store for the `TOVU_CONTENT_STORE=pglite` prototype: a storage kernel
 * (`platform/db/kernel`) over one PGlite data dir, with the content schema and a one-time import.
 *
 * - Schema: created ONCE, on an empty data dir, by `content-schema.ts` (the migrator replaces this,
 *   storage-adapter plan slice M1). A schema change after the first boot is not applied.
 * - Import: on that same first boot, when `importFrom` is given, the site's existing `posts` and
 *   `post_revisions` rows are copied over (read-only on the SQLite side), in the same transaction as
 *   the DDL — a crash leaves an empty data dir and the next boot starts over.
 * - Transactions: the kernel's (nested calls join; repo calls inside use the open transaction).
 *
 * Only ONE process may open a data dir. The API process owns it; see `selectPostRepo`.
 */

export type PgliteContentStore = PgKernel<ContentDatabase>;

/** Rows per INSERT during the one-time import (keeps each statement's parameter count small). */
const IMPORT_BATCH = 200;

async function importRows(tx: Transaction, from: ContentDb): Promise<void> {
  // A Kysely over the raw transaction the DDL runs in (it has `query`, all the dialect uses).
  // SQLite's 0/1 booleans bind as Postgres booleans; JSON text binds into jsonb.
  const target = new Kysely<ContentDatabase>({ dialect: new PgliteDialect(tx as unknown as PGlite) });
  const source = sqliteKernel<ContentDatabase>(from);
  for (const table of ["posts", "post_revisions"] as const) {
    const rows = await source.run((db) => db.selectFrom(table).selectAll().execute());
    for (let at = 0; at < rows.length; at += IMPORT_BATCH) {
      await target.insertInto(table).values(rows.slice(at, at + IMPORT_BATCH) as never).execute();
    }
  }
}

async function bootstrap(client: PGlite, importFrom: ContentDb | undefined): Promise<void> {
  if (await hasPgContentSchema(client)) return;
  await client.transaction(async (tx) => {
    await tx.exec(pgContentSchemaSql());
    if (importFrom !== undefined) await importRows(tx, importFrom);
  });
}

/**
 * Opens (and on first use creates) a PGlite content store. Synchronous so it fits the synchronous
 * composition root; the async setup runs behind the kernel's `ready`.
 *
 * @param optional.dataDir absent = in-memory (tests).
 * @param optional.importFrom the SQLite content db whose posts seed a brand-new data dir.
 */
export function openPgliteContentStore(optional: { dataDir?: string; importFrom?: ContentDb }): PgliteContentStore {
  return openPgliteKernel<ContentDatabase>({
    dataDir: optional.dataDir,
    prepare: (client) => bootstrap(client, optional.importFrom),
  });
}
