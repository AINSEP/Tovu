/**
 * @file The Kysely pieces every generic `TRASHABLE` query shares: a loosely-typed view of the content
 * database (the registry names tables at runtime, so no static table type can describe them) and the
 * one live-snapshot read `moveToTrash` and the `trash_item` tool both run.
 *
 * Every table and column name reaching a query here comes from a `registry.ts` entry — module
 * constants, never caller input. Kysely quotes each one as an identifier.
 */
import type { AliasedExpression, ExpressionBuilder, Kysely } from "kysely";

import type { ContentDatabase } from "../../platform/db/content-database.generated.js";
import type { ContentKernel } from "../../platform/db/content-kernel.js";
import { notTrashed } from "./not-trashed.js";
import type { TrashEntityType } from "@jini-ai/cms/trash";
import type { TrashEntry, TrashRegistry } from "./registry.js";

/** Any table, any column: the shape a registry-driven query sees. A type alias, not an interface:
 *  Kysely's `withTables` needs the implicit index signature only an alias has. */
export type LooseTables = Record<string, Record<string, unknown>>;

/** The expression builder a registry-driven `WHERE` is written against. */
export type LooseExpressionBuilder = ExpressionBuilder<LooseTables, string>;

/** `db` with every table name accepted — for a query whose table comes from a registry entry.
 *  @complexity O(1). */
export function loose(db: Kysely<ContentDatabase>): Kysely<LooseTables> {
  return db.withTables<LooseTables>() as unknown as Kysely<LooseTables>;
}

/** `table.column` — a bare column name of `table`, qualified so it stays unambiguous next to a join.
 *  @complexity O(1). */
export function qualified(table: string, column: string): string {
  return `${table}.${column}`;
}

/** The display + version columns of one live row, as `readLiveSnapshot` returns them. */
export interface EntitySnapshotRow {
  title: string;
  subtitle?: string | null;
  version?: number | null;
}

/**
 * Reads one LIVE entity's display columns (and its version, when the entry has one): the row must be
 * in `workspaceId`, match the entry's `scope`, and not be in the Trash (`notTrashed`, which includes a
 * term whose taxonomy is trashed). `null` when no such row exists.
 *
 * @complexity O(1): one indexed read, plus the display join's primary-key lookup when present.
 */
export async function readLiveSnapshot(
  required: { entry: TrashEntry; workspaceId: string; entityId: string },
  deps: { kernel: ContentKernel; registry: TrashRegistry }
): Promise<EntitySnapshotRow | null> {
  const { entry } = required;
  const row = await deps.kernel.run((db) => {
    const from = loose(db).selectFrom(entry.table);
    const joined = entry.display.join ? from.innerJoin(entry.display.join.table, entry.display.join.on[0], entry.display.join.on[1]) : from;
    return joined
      .select((eb) => {
        const columns: AliasedExpression<unknown, string>[] = [eb.ref(entry.display.title).as("title")];
        if (entry.display.subtitle) columns.push(eb.ref(entry.display.subtitle).as("subtitle"));
        if (entry.versionColumn) columns.push(eb.ref(qualified(entry.table, entry.versionColumn)).as("version"));
        return columns;
      })
      .where((eb) => entryWhere(eb, { entry, workspaceId: required.workspaceId, entityId: required.entityId }))
      .where((eb) => notTrashed({ entityType: entry.entityType as TrashEntityType }, { registry: deps.registry })(eb))
      .limit(1)
      .executeTakeFirst();
  });
  return (row as EntitySnapshotRow | undefined) ?? null;
}

/**
 * `workspace = ? AND id = ?`, plus the entry's fixed `scope` predicate when it has one — every column
 * qualified with the entry's own table, so the condition holds next to a display join.
 *
 * @complexity O(1) to build.
 */
export function entryWhere(eb: LooseExpressionBuilder, required: { entry: TrashEntry; workspaceId: string; entityId: string }) {
  const { entry } = required;
  const conditions = [
    eb(qualified(entry.table, entry.workspaceColumn), "=", required.workspaceId),
    eb(qualified(entry.table, entry.idColumn), "=", required.entityId),
  ];
  if (entry.scope) conditions.push(eb(qualified(entry.table, entry.scope.column), "=", entry.scope.equals));
  return eb.and(conditions);
}
