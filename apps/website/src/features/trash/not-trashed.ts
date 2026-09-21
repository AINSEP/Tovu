/**
 * @file The one read rule every trashable domain's queries add: "this row is not currently in the
 * Trash." Two forms of the same rule — {@link notTrashed} for a SQL `WHERE`, {@link isTrashedRecord}
 * for an in-memory record — so a SQLite/Postgres repo and its in-memory test double agree without
 * either one re-deriving the rule from `entityType` itself.
 *
 * Deliberately excludes the `hiddenWithParent` clause (a term hidden because its taxonomy is
 * trashed) — no G1 entry declares it. See `registry.ts`'s file header for why that field is not on
 * `TrashEntry` yet; adding it here is G3/G4's job, once a real entry exercises it.
 */
import { eq, isNull, ne, not, type SQL } from "drizzle-orm";

import type { TrashEntityType } from "./ports.js";
import type { TrashEntry, TrashRegistry } from "./registry.js";

/** Fails fast: an `entityType` with no registry entry is a composition bug (a caller wired a domain
 *  into the Trash without registering it), not a runtime condition to degrade around. */
function requireEntry(entityType: TrashEntityType, registry: TrashRegistry): TrashEntry {
  const entry = registry.get(entityType);
  if (!entry) {
    throw new Error(`trash: '${entityType}' has no TRASHABLE registry entry — register it in registry.ts first.`);
  }
  return entry;
}

/**
 * A SQL condition, true for a row that is currently LIVE.
 *
 * @complexity O(1) to build; the condition itself costs whatever index the caller's query already
 *             uses on the marker column.
 */
export function notTrashed(required: { entityType: TrashEntityType }, options: { registry: TrashRegistry }): SQL {
  const entry = requireEntry(required.entityType, options.registry);
  return entry.marker.kind === "timestamp" ? isNull(entry.marker.column) : ne(entry.marker.column, entry.marker.trashed);
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
 * declaration in `schema.ts` already follows 1:1 (`workspaceId` / `workspace_id`,
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
 * @returns `true` when `record` is currently in the Trash.
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
