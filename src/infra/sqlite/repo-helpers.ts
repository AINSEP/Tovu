import { and, type SQL } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

import type { ContentDb } from "./content-db";

/**
 * @file ADR-042 item 1: the workspace-scoped single-row lookup every `repo.sqlite.ts` adapter
 * hand-rolled (`db.select().from(table).where(and(eq(...), eq(...))).all()` then
 * `rows[0] ? mapper(rows[0]) : null`) — confirmed jaccard 1.0 across ~35 call sites in 11
 * files (newsletter/forms/features/post/identity/members/etc). This is that shape, written
 * once; adapters compose it via `eq()` conditions they still build themselves, they don't
 * reimplement the lookup+map boilerplate around it.
 */

/**
 * Runs a workspace-scoped (or otherwise arbitrarily-conditioned) single-row lookup and maps the
 * result, or returns `null` if no row matched. `conditions` is typically
 * `[eq(table.workspaceId, id), eq(table.someColumn, value)]`.
 */
export function findOneBy<TTable extends SQLiteTable, TRecord>(
  db: ContentDb,
  table: TTable,
  conditions: SQL[],
  mapper: (row: TTable["$inferSelect"]) => TRecord
): TRecord | null {
  const rows = db
    .select()
    .from(table as SQLiteTable)
    .where(and(...conditions))
    .limit(1)
    .all() as Array<TTable["$inferSelect"]>;
  return rows[0] ? mapper(rows[0]) : null;
}
