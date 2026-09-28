import { getTableColumns, getTableName, type Table } from "drizzle-orm";

import type { ContentKernel } from "./content-kernel.js";
import type { StorageKernel } from "./kernel/port.js";
import * as schema from "./schema.sqlite.js";
import type { ContentDbSeedData } from "./sqlite/content-db.js";

/**
 * @file The rows every content store needs after its schema is in place, on any dialect (storage
 * plan R1c): the `database_write_watermark` singleton and, when the caller supplies it, the
 * first-run demo content. Runs on the kernel, after the SQLite opener (`openContentDb`) or the
 * Postgres/PGlite schema step has built the tables.
 */

type AnyRow = Record<string, unknown>;
type AnyTables = Record<string, AnyRow>;

/**
 * `value` (a Drizzle insert object, camelCase keys) as a row of `table`'s real column names, with
 * the conversions Drizzle's own insert applies: `$defaultFn` for an omitted key, then the column's
 * driver mapping (boolean mode → 0/1, json mode → text). Keys the table has no column for are
 * dropped, as Drizzle drops them. Columns left out take their SQL default.
 */
function columnRow(table: Table, value: object): AnyRow {
  const row: AnyRow = {};
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    let field = (value as AnyRow)[key];
    if (field === undefined) field = column.defaultFn?.() ?? column.onUpdateFn?.();
    if (field === undefined) continue;
    row[column.name] = field === null ? null : column.mapToDriverValue(field);
  }
  return row;
}

async function insertRow(kernel: ContentKernel, table: Table, value: object): Promise<void> {
  // Any table by its runtime name: the typed Kysely surface cannot name a table picked at runtime.
  await (kernel as unknown as StorageKernel<AnyTables>).run((db) => db.insertInto(getTableName(table)).values(columnRow(table, value)).execute());
}

/**
 * Seed the demo workspace/posts/presentation exactly once, in one kernel transaction.
 *
 * Guarded by workspace slug so a persisted db (with the operator's own edits) is never re-seeded or
 * overwritten on restart.
 */
export async function seedContentStore(kernel: ContentKernel, seed: ContentDbSeedData): Promise<void> {
  await kernel.transaction(async () => {
    const existing = await kernel.run((db) =>
      db.selectFrom("workspaces").select("id").where("slug", "=", seed.workspace.slug).executeTakeFirst()
    );
    if (existing !== undefined) return;

    await insertRow(kernel, schema.workspaces, seed.workspace);
    for (const post of seed.posts) {
      await insertRow(kernel, schema.posts, { ...post, bodyJson: JSON.stringify(post.bodyJson), ext: JSON.stringify(post.ext ?? {}) });
    }
    await insertRow(kernel, schema.presentationSettings, seed.presentation);
  });
}

/**
 * SPEC-016 (`core/gated-mutations/watermark.ts`) — the `database_write_watermark` singleton row
 * (`id=1`) exists, independent of any demo-seed data; then the demo seed when `seed` is given.
 * Idempotent across restarts: the watermark insert does nothing on conflict, the seed is guarded.
 */
export async function prepareContentStore(kernel: ContentKernel, optional: { seed?: ContentDbSeedData } = {}): Promise<void> {
  await kernel.run((db) =>
    db
      .insertInto("database_write_watermark")
      .values({ id: 1, value: 0, last_stamped_at: null })
      .onConflict((conflict) => conflict.column("id").doNothing())
      .execute()
  );
  if (optional.seed !== undefined) await seedContentStore(kernel, optional.seed);
}
