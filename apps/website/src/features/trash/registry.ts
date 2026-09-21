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
 * G1 registers only `form` (B1's `form_definitions.deleted_at`/`version`, migration 0071). `menu`,
 * `term`, `taxonomy`, `form_submission` and `widget` are the plan's G2-G4 entries — adding them needs
 * no change to this file's shape, only new `Map` entries (`widget` also needs `scope`, `term`/
 * `taxonomy` need `hiddenWithParent`/`blockers`/`afterChange`, none of which G1 wires — see the
 * handoff's "notes for G2" for why those fields are deliberately not on {@link TrashEntry} yet).
 */
import type { AnyColumn, SQL, Table } from "drizzle-orm";

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
 *  Joins (a submission's form name, a term's taxonomy name) are a G3/G4 extension. */
export interface TrashDisplaySpec {
  title: AnyColumn;
  subtitle?: AnyColumn;
}

/** A child table to delete, in order, before the parent row itself — e.g. a form's submissions. */
export interface TrashCascadeSpec {
  table: Table;
  /** The child column holding the parent's id. */
  parentIdColumn: AnyColumn;
}

/**
 * One domain's registration. Fields left out here on purpose (per the file header): `hiddenWithParent`,
 * `blockers`, `afterChange`. Every field that IS here is exercised by the `form` entry or is a
 * one-line addition `createTableTrashAdapter` already reads (`scope`) — see the plan's entry table
 * (§4) for the full eventual shape.
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
   *  against the shared `entries` table (G2). No G1 entry needs one. */
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
    formDefinitionId: AnyColumn;
  };
}

/**
 * Builds `TRASHABLE` from a schema module. Called once at composition (`deps.ts`) and resolved at
 * CALL time thereafter by every consumer (`createTableTrashAdapter`, `notTrashed`, `moveToTrash`) —
 * the returned `Map` is never mutated after this returns, so "resolved at call time" here means
 * "read fresh from the Map on every lookup", not "rebuilt every call".
 *
 * @complexity O(1) — one entry today.
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
  ]);
}
