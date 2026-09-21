/**
 * @file `TRASHABLE` — the one place a domain opts into the generic Trash. Design of record:
 * `ADS-memory/.local-artifacts/handoffs/2026-09-21-t8f-trash-more-plan.md` §1/§4.
 *
 * Adding a type to the Trash means adding one entry here — no new adapter file, no new route. Each
 * entry names its own table, marker column and display columns; `createTableTrashAdapter` (written
 * once, `table-adapter.ts`) and `notTrashed`/`isTrashedRecord` (`not-trashed.ts`) read the registry
 * rather than switching on `entityType` themselves.
 *
 * `buildTrashRegistry` is generic over the schema module it is given so the SAME function builds the
 * registry from either `schema.ts` (SQLite, today) or `schema.postgres.ts` (later) — both export the
 * same table and column names (`schema.postgres.ts`'s own header), so a `TSchema` satisfying
 * {@link TrashRegistrySchema} is satisfied by either module without this file importing either
 * driver's table types.
 *
 * Registered today: `form`, `form_submission`, `widget` (an `entries` row scoped to
 * `type = 'widget'`). The plan's remaining entries (`menu`, `term`, `taxonomy`) are new `Map`
 * entries here, plus whatever optional field (`blockers`, `hiddenWithParent`) the first entry that
 * needs one adds to {@link TrashEntry}.
 */
import { eq, type AnyColumn, type SQL, type Table } from "drizzle-orm";

import type { TrashDbJoin } from "./db-port.js";
import type { TrashEntityType } from "./ports.js";

/**
 * Where a domain's "trashed" state lives:
 *  - `timestamp` — a nullable column, `NULL` = live (posts, media, redirects, `form`). Restoring
 *    always clears it; there is no "previous value" to remember.
 *  - `status` — an enum-ish text column with a distinct `trashed` value, and a `restoreFallback` for
 *    rows with no recorded prior value. Not implemented by `createTableTrashAdapter` yet — no G1
 *    entry uses it. See {@link TrashMarkerNotImplementedError}.
 */
export type TrashMarkerSpec =
  | { kind: "timestamp"; column: AnyColumn }
  | { kind: "status"; column: AnyColumn; trashed: string; restoreFallback: string };

/** Column-only snapshot for a Trash row's two display lines (SEE `TrashDisplay` in `ports.ts`).
 *  `join` reaches ONE parent row for a column that is not on the entry's own table (a submission's
 *  form name) — an inner join, so it is only for parents a foreign key guarantees. */
export interface TrashDisplaySpec {
  title: AnyColumn;
  subtitle?: AnyColumn;
  join?: TrashDbJoin;
}

/** A child table to delete, in order, before the parent row itself — e.g. a form's submissions. */
export interface TrashCascadeSpec {
  table: Table;
  /** The child column holding the parent's id. */
  parentIdColumn: AnyColumn;
}

/**
 * One domain's registration. Optional fields are added when the first entry needs one, never ahead
 * of it — see the plan's entry table (§4) for the full eventual shape.
 */
export interface TrashEntry {
  readonly entityType: TrashEntityType;
  /** English; the admin translates it with `t()`. */
  readonly label: string;
  readonly permission: string;
  readonly table: Table;
  readonly idColumn: AnyColumn;
  readonly workspaceColumn: AnyColumn;
  /** A fixed predicate ANDed into every query this entry's adapter runs — e.g. `type = 'widget'`
   *  against the shared `entries` table. */
  readonly scope?: SQL;
  readonly marker: TrashMarkerSpec;
  /** Optimistic-concurrency column. `undefined` for a domain with no version column (none in G1). */
  readonly versionColumn?: AnyColumn;
  /** `updated_at`-shaped column, stamped alongside the marker. */
  readonly touchColumn?: AnyColumn;
  readonly display: TrashDisplaySpec;
  /** Child rows removed, in this order, before the entry's own row — see `TrashCascadeSpec`. */
  readonly purgeFirst?: readonly TrashCascadeSpec[];
}

export type TrashRegistry = ReadonlyMap<TrashEntityType, TrashEntry>;

/** The exact slice of a schema module {@link buildTrashRegistry} reads — satisfied by both
 *  `schema.ts` and `schema.postgres.ts` (same names, same shape) without importing either. */
export interface TrashRegistrySchema {
  formDefinitions: Table & {
    id: AnyColumn;
    workspaceId: AnyColumn;
    name: AnyColumn;
    slug: AnyColumn;
    deletedAt: AnyColumn;
    version: AnyColumn;
  };
  formSubmissions: Table & {
    id: AnyColumn;
    workspaceId: AnyColumn;
    formDefinitionId: AnyColumn;
    submittedAt: AnyColumn;
    deletedAt: AnyColumn;
    version: AnyColumn;
  };
  entries: Table & {
    id: AnyColumn;
    workspaceId: AnyColumn;
    type: AnyColumn;
    title: AnyColumn;
    slug: AnyColumn;
    deletedAt: AnyColumn;
    version: AnyColumn;
  };
  entryRefs: Table & { sourceEntryId: AnyColumn };
  entryRevisions: Table & { entryId: AnyColumn };
}

/**
 * Builds `TRASHABLE` from a schema module. Called once at composition (`deps.ts`) and resolved at
 * CALL time thereafter by every consumer (`createTableTrashAdapter`, `notTrashed`, `moveToTrash`) —
 * the returned `Map` is never mutated after this returns, so "resolved at call time" here means
 * "read fresh from the Map on every lookup", not "rebuilt every call".
 *
 * @complexity O(1) — a fixed handful of entries.
 */
export function buildTrashRegistry<TSchema extends TrashRegistrySchema>(required: { schema: TSchema }): TrashRegistry {
  const { schema } = required;

  return new Map<TrashEntityType, TrashEntry>([
    [
      "form",
      {
        entityType: "form",
        label: "Form",
        permission: "admin.forms.manage",
        table: schema.formDefinitions,
        idColumn: schema.formDefinitions.id,
        workspaceColumn: schema.formDefinitions.workspaceId,
        marker: { kind: "timestamp", column: schema.formDefinitions.deletedAt },
        versionColumn: schema.formDefinitions.version,
        display: { title: schema.formDefinitions.name, subtitle: schema.formDefinitions.slug },
        purgeFirst: [{ table: schema.formSubmissions, parentIdColumn: schema.formSubmissions.formDefinitionId }],
      },
    ],
    [
      "form_submission",
      {
        entityType: "form_submission",
        label: "Form submission",
        permission: "admin.forms.submissions.delete",
        table: schema.formSubmissions,
        idColumn: schema.formSubmissions.id,
        workspaceColumn: schema.formSubmissions.workspaceId,
        marker: { kind: "timestamp", column: schema.formSubmissions.deletedAt },
        versionColumn: schema.formSubmissions.version,
        // The form's name and when it was sent — never `data_json`: the Trash list is not a place
        // to show a visitor's data. `form_submissions.form_definition_id` is a real FK, so the
        // inner join always finds the form (trashed or not).
        display: {
          title: schema.formDefinitions.name,
          subtitle: schema.formSubmissions.submittedAt,
          join: {
            table: schema.formDefinitions,
            on: eq(schema.formDefinitions.id, schema.formSubmissions.formDefinitionId),
          },
        },
      },
    ],
    [
      "widget",
      {
        entityType: "widget",
        label: "Widget",
        permission: "widgets.delete",
        table: schema.entries,
        idColumn: schema.entries.id,
        workspaceColumn: schema.entries.workspaceId,
        // `entries` holds every entry type; only widgets go to the Trash this way, so a collection
        // entry's id can never be hidden or purged through this entry.
        scope: eq(schema.entries.type, "widget"),
        // `deleted_at`, not `entries.status` (typed `draft|published|unpublished`) and not the
        // widget payload's own status (changing that needs a parse, which fails on corrupt rows).
        marker: { kind: "timestamp", column: schema.entries.deletedAt },
        versionColumn: schema.entries.version,
        display: { title: schema.entries.title, subtitle: schema.entries.slug },
        // Its own outgoing refs (e.g. a menu widget's `menuRef`) and its revisions. Refs OTHER
        // entries hold to it (a region placement, an embed) stay and render as dangling (REQ-43).
        purgeFirst: [
          { table: schema.entryRefs, parentIdColumn: schema.entryRefs.sourceEntryId },
          { table: schema.entryRevisions, parentIdColumn: schema.entryRevisions.entryId },
        ],
      },
    ],
  ]);
}
