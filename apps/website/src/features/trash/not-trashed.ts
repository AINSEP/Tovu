/**
 * @file The one read rule every trashable domain's queries add: "this row is not currently in the
 * Trash." Two forms of the same rule — {@link notTrashed} for a SQL `WHERE`, {@link isTrashedRecord}
 * for an in-memory record — so a SQLite/Postgres repo and its in-memory test double agree without
 * either one re-deriving the rule from `entityType` itself.
 *
 * `term`'s `hiddenWithParent` (T1 item 3, `registry.ts`'s `TrashHiddenWithParentSpec`): a term is
 * trashed the moment its taxonomy is, with no second write and no cascade-hide of every member term.
 * {@link notTrashed} ANDs in a `NOT EXISTS` over the parent table, built with `sql` over column
 * OBJECTS only (never caller input — the same rule `db-port.ts`'s `TrashDbAssignment` doc states for
 * writes), so a term reads as trashed the instant its taxonomy does, with no extra write to keep in
 * sync. {@link isTrashedRecord} — the in-memory twin, used by record-store doubles and hermetic test
 * repos — CANNOT evaluate this: a flat record has no parent row to join against. It reports the
 * entity's own marker only; a term entity whose taxonomy is trashed reads as live through this path
 * until a caller with a real parent lookup (T6's own domain repo) filters it separately.
 */
import { and, eq, isNull, isNotNull, ne, not, sql, type SQL } from "drizzle-orm";

import type { TrashEntityType } from "./ports.js";
import type { TrashEntry, TrashHiddenWithParentSpec, TrashRegistry } from "./registry.js";

/** Fails fast: an `entityType` with no registry entry is a composition bug (a caller wired a domain
 *  into the Trash without registering it), not a runtime condition to degrade around. */
function requireEntry(entityType: TrashEntityType, registry: TrashRegistry): TrashEntry {
  const entry = registry.get(entityType);
  if (!entry) {
    throw new Error(`trash: '${entityType}' has no TRASHABLE registry entry — register it in registry.ts first.`);
  }
  return entry;
}

/** True for a row whose OWN marker (not its parent's) says LIVE. @complexity O(1) to build. */
function ownMarkerLive(entry: TrashEntry): SQL {
  return entry.marker.kind === "timestamp" ? isNull(entry.marker.column) : ne(entry.marker.column, entry.marker.trashed);
}

/**
 * `NOT EXISTS (SELECT 1 FROM <parent> WHERE <parent pk> = <this row's fk> AND <parent is trashed>)`
 * — true when the entity's PARENT is not currently trashed. Built with `sql` over column objects
 * only (see the file header), never a string the caller controls.
 *
 * @complexity O(1) to build; the `NOT EXISTS` costs whatever index the parent table's own primary
 *             key already provides.
 */
function parentNotTrashed(spec: TrashHiddenWithParentSpec): SQL {
  const parentTrashed =
    spec.parentMarker.kind === "timestamp"
      ? isNotNull(spec.parentMarker.column)
      : eq(spec.parentMarker.column, spec.parentMarker.trashed);
  return sql`NOT EXISTS (SELECT 1 FROM ${spec.parentTable} WHERE ${spec.parentPkColumn} = ${spec.parentIdColumn} AND ${parentTrashed})`;
}

/**
 * A SQL condition, true for a row that is currently LIVE — its own marker, ANDed with its parent's
 * when the entry declares `hiddenWithParent` (a term whose taxonomy is trashed reads as trashed too).
 *
 * @complexity O(1) to build; the condition itself costs whatever index the caller's query already
 *             uses on the marker column, plus the parent lookup's own primary key when present.
 */
export function notTrashed(required: { entityType: TrashEntityType }, options: { registry: TrashRegistry }): SQL {
  const entry = requireEntry(required.entityType, options.registry);
  const own = ownMarkerLive(entry);
  return entry.hiddenWithParent ? and(own, parentNotTrashed(entry.hiddenWithParent))! : own;
}

/** The same condition as {@link notTrashed}, negated — true for a row that is currently TRASHED.
 *  Not exported: only `table-adapter.ts`'s `hide`/`unhide` need "is it already in the target state",
 *  and exporting a second public predicate for one internal use would be a second surface to keep in
 *  step with `notTrashed`. */
export function isCurrentlyTrashed(required: { entityType: TrashEntityType }, options: { registry: TrashRegistry }): SQL {
  return not(notTrashed(required, options));
}

/**
 * Converts a Drizzle SQL column name (`deleted_at`) to the camelCase JS property name this
 * codebase's schema always pairs it with (`deletedAt`) — the same convention every `sqliteTable`
 * declaration in `schema.sqlite.ts` already follows 1:1 (`workspaceId` / `workspace_id`,
 * `formDefinitionId` / `form_definition_id`, …).
 *
 * @complexity O(n) in the column name's length.
 */
function sqlNameToJsProperty(sqlName: string): string {
  return sqlName.replace(/_([a-z0-9])/g, (_match, letter: string) => letter.toUpperCase());
}

/**
 * The plain-JS twin of {@link notTrashed}, for in-memory repos and record-store adapters whose
 * stored shape is a JS object rather than a SQL row — e.g. `record-store.ts`'s `TrashRecordStore`.
 *
 * Reads `record[<marker's camelCase property>]` rather than requiring every in-memory repo to pass
 * its own accessor, so a domain that follows this codebase's snake_case-column /
 * camelCase-property convention (every domain does) needs no extra wiring beyond registering the
 * entry.
 *
 * Deliberately ignores `hiddenWithParent` (see the file header): `record` is a flat, already-detached
 * object with no parent row to join against, so this reports the entity's OWN marker only. A record
 * store or hermetic repo for an entry that declares `hiddenWithParent` must apply that half of the
 * rule itself, with its own parent lookup, exactly as `not-trashed.ts`'s SQL half does with `sql`.
 *
 * @returns `true` when `record` is currently in the Trash (by its own marker alone).
 * @complexity O(1).
 */
export function isTrashedRecord(
  required: { entityType: TrashEntityType; record: Record<string, unknown> },
  options: { registry: TrashRegistry }
): boolean {
  const entry = requireEntry(required.entityType, options.registry);
  const property = sqlNameToJsProperty(entry.marker.column.name);
  const value = required.record[property];
  return entry.marker.kind === "timestamp" ? value !== null && value !== undefined : value === entry.marker.trashed;
}
