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
 * `type = 'widget'`), `menu`, `term`, `taxonomy` (T1). `taxonomy` has no `subtitle`: unlike the plan's
 * entry table suggests, `taxonomies` (`schema.ts`) has no `slug` column (only `id`/`name`/
 * `hierarchical`/`status`/`updatedAt`/`version`) — verified by reading the table, not assumed from
 * the plan. `TrashDisplaySpec.subtitle` is optional for exactly this reason.
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

/**
 * A child table to delete, in order, before the parent row itself — e.g. a form's submissions.
 *
 * Exactly one of `parentIdColumn`/`via` is set:
 *  - `parentIdColumn` — the DIRECT case, `table`'s own column holds the parent id (a submission's
 *    `form_definition_id`).
 *  - `via` — the TWO-HOP case, `table` has no column pointing at the parent directly (`entry_terms`
 *    has only `term_id`, not `taxonomy_id`), so its rows are resolved through another table first:
 *    `entry_terms.term_id IN (SELECT id FROM terms WHERE taxonomy_id = ?)`.
 */
export interface TrashCascadeSpec {
  table: Table;
  /** DIRECT case: the child column holding the parent's id. */
  parentIdColumn?: AnyColumn;
  /** TWO-HOP case: `table`'s child rows are resolved through `throughTable` first. */
  via?: {
    /** The column on `table` matched against the ids resolved from `throughTable` (`entryTerms.termId`). */
    matchColumn: AnyColumn;
    /** The table the parent's children are actually recorded on (`terms`). */
    throughTable: Table;
    /** `throughTable`'s own id column (`terms.id`). */
    throughIdColumn: AnyColumn;
    /** `throughTable`'s column holding the id of the entity being purged (`terms.taxonomyId`). */
    throughParentIdColumn: AnyColumn;
  };
  /** `table`'s own id column — required only alongside `entityType`, to know which child ids are
   *  about to be removed before their `trashed_items` rows are cleaned up. */
  idColumn?: AnyColumn;
  /**
   * Set when the cascaded child kind is ITSELF a `TRASHABLE` registry entry (`form_submission` under
   * `form`, `term` under `taxonomy`). A purge then also deletes the `trashed_items` rows of the child
   * ids it is about to remove, in the same transaction, before the child rows go — otherwise a
   * child that was trashed independently (a submission moved to the Trash on its own, then its form
   * purged) leaves a phantom Trash row pointing at nothing (the opus-1 known gap, T1 item 5).
   */
  entityType?: TrashEntityType;
}

/**
 * Refuses `hide` (and therefore `purge`, which only ever runs on an already-trashed row) while rows
 * matching this spec exist — e.g. a term with child terms, live or trashed, so a purge can never
 * leave a dangling `parent_id`.
 */
export interface TrashBlockerSpec {
  /** The table to count rows in (`terms`, checking for children of the term being trashed). */
  table: Table;
  /** The child column holding this entity's id (`terms.parentId`). */
  parentIdColumn: AnyColumn;
  /** Machine-readable reason surfaced in the 409 body (`TERM_HAS_CHILDREN`). */
  code: string;
}

/**
 * A term is trashed the moment its taxonomy is — there is no second write, no cascade-hide of every
 * member term. `notTrashed`/`isCurrentlyTrashed` (`not-trashed.ts`) read this to treat a live term
 * whose taxonomy is trashed as trashed too, so `moveToTrash` on it reads `not-found` (a caller cannot
 * re-trash what is already hidden through its parent) — same precedence `not-trashed.ts`'s own file
 * header already documents for the plain marker check.
 *
 * `isTrashedRecord` (the in-memory twin) CANNOT evaluate this: a flat record has no parent row to
 * join against, so it reports the entity's own marker only — see its doc.
 */
export interface TrashHiddenWithParentSpec {
  /** The parent's own table (`taxonomies`). */
  parentTable: Table;
  /** This entity's column pointing at the parent (`terms.taxonomyId`). */
  parentIdColumn: AnyColumn;
  /** The parent table's own id column (`taxonomies.id`). */
  parentPkColumn: AnyColumn;
  /** The parent's own marker spec, reused to test whether the parent itself is currently trashed. */
  parentMarker: TrashMarkerSpec;
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
  /** Refuses `hide` while blocking rows exist — see `TrashBlockerSpec`. */
  readonly blocker?: TrashBlockerSpec;
  /** This entity reads as trashed whenever its parent is — see `TrashHiddenWithParentSpec`. */
  readonly hiddenWithParent?: TrashHiddenWithParentSpec;
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
  menus: Table & {
    id: AnyColumn;
    workspaceId: AnyColumn;
    slug: AnyColumn;
    title: AnyColumn;
    status: AnyColumn;
    updatedAt: AnyColumn;
    version: AnyColumn;
  };
  navLocationBindings: Table & { menuId: AnyColumn };
  taxonomies: Table & {
    id: AnyColumn;
    workspaceId: AnyColumn;
    name: AnyColumn;
    status: AnyColumn;
    updatedAt: AnyColumn;
    version: AnyColumn;
  };
  terms: Table & {
    id: AnyColumn;
    workspaceId: AnyColumn;
    taxonomyId: AnyColumn;
    parentId: AnyColumn;
    name: AnyColumn;
    status: AnyColumn;
    updatedAt: AnyColumn;
    version: AnyColumn;
  };
  entryTerms: Table & { termId: AnyColumn };
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
        // `entityType`/`idColumn`: `form_submission` is itself a `TRASHABLE` entry (below), so a purge
        // also cleans up the phantom `trashed_items` row of any submission that was trashed
        // independently first (T1 item 5) — the doc comment on `TrashCascadeSpec.entityType` names
        // this exact case as its example; it was missing here (RED-first regression test).
        purgeFirst: [
          {
            table: schema.formSubmissions,
            parentIdColumn: schema.formSubmissions.formDefinitionId,
            idColumn: schema.formSubmissions.id,
            entityType: "form_submission",
          },
        ],
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
    [
      "menu",
      {
        entityType: "menu",
        label: "Menu",
        // Verified against `routes/menus/delete.ts:76` — NOT `admin.menus.delete.force`, which T5
        // removes (the plan's decision: purge unassigns bindings instead of refusing).
        permission: "admin.menus.delete",
        table: schema.menus,
        idColumn: schema.menus.id,
        workspaceColumn: schema.menus.workspaceId,
        // `status` already carries draft/published for a live menu; `trash` is a new value alongside
        // them, same pattern the test-only harness in `table-adapter.test.ts` already exercises.
        marker: { kind: "status", column: schema.menus.status, trashed: "trash", restoreFallback: "published" },
        versionColumn: schema.menus.version,
        touchColumn: schema.menus.updatedAt,
        display: { title: schema.menus.title, subtitle: schema.menus.slug },
        // A trashed menu's location bindings are removed at PURGE — decision 1 in
        // `2026-09-21-trash-parallel-plan.md` §6 Q1 (recommendation accepted): purge is already the
        // explicit, confirmed permanent step, so "Delete permanently" on a bound menu unassigns it
        // rather than refusing. No `entityType`: bindings are not a `TRASHABLE` kind of their own.
        purgeFirst: [{ table: schema.navLocationBindings, parentIdColumn: schema.navLocationBindings.menuId }],
      },
    ],
    [
      "term",
      {
        entityType: "term",
        label: "Term",
        // Verified against every `routes/taxonomy/*.ts` route: `admin.taxonomy.manage` is the one
        // permission ADR-044 registers for every taxonomy write.
        permission: "admin.taxonomy.manage",
        table: schema.terms,
        idColumn: schema.terms.id,
        workspaceColumn: schema.terms.workspaceId,
        marker: { kind: "status", column: schema.terms.status, trashed: "trash", restoreFallback: "active" },
        versionColumn: schema.terms.version,
        touchColumn: schema.terms.updatedAt,
        // The term's own name, plus its taxonomy's name so the Trash list can tell "Red" (Colors)
        // apart from "Red" (Tags) — an inner join, since `terms.taxonomy_id` is a real FK.
        display: {
          title: schema.terms.name,
          subtitle: schema.taxonomies.name,
          join: { table: schema.taxonomies, on: eq(schema.taxonomies.id, schema.terms.taxonomyId) },
        },
        // A term's own content assignments — purge deletes them; trash/restore never touch them
        // (decision 5: tags/categories stay assigned while trashed, hidden from reads, restored back).
        purgeFirst: [{ table: schema.entryTerms, parentIdColumn: schema.entryTerms.termId }],
        // Counts live AND trashed children: a parent can never be trashed while a child (of either
        // state) still points at it, so a purge — which only ever runs on an already-trashed row —
        // can never leave a dangling `parent_id` either.
        blocker: { table: schema.terms, parentIdColumn: schema.terms.parentId, code: "TERM_HAS_CHILDREN" },
        hiddenWithParent: {
          parentTable: schema.taxonomies,
          parentIdColumn: schema.terms.taxonomyId,
          parentPkColumn: schema.taxonomies.id,
          parentMarker: { kind: "status", column: schema.taxonomies.status, trashed: "trash", restoreFallback: "active" },
        },
      },
    ],
    [
      "taxonomy",
      {
        entityType: "taxonomy",
        label: "Taxonomy",
        permission: "admin.taxonomy.manage",
        table: schema.taxonomies,
        idColumn: schema.taxonomies.id,
        workspaceColumn: schema.taxonomies.workspaceId,
        marker: { kind: "status", column: schema.taxonomies.status, trashed: "trash", restoreFallback: "active" },
        versionColumn: schema.taxonomies.version,
        touchColumn: schema.taxonomies.updatedAt,
        // No `subtitle` — `taxonomies` (`schema.ts`) has no `slug` column, see the file header.
        display: { title: schema.taxonomies.name },
        // Two-hop: `entry_terms` has no `taxonomy_id` column, so its rows are resolved through
        // `terms` first (`term_id IN (SELECT id FROM terms WHERE taxonomy_id = ?)`), THEN the terms
        // themselves are removed (`entityType: "term"` cleans up their `trashed_items` phantom rows
        // too — a term trashed on its own before its taxonomy was purged).
        purgeFirst: [
          {
            table: schema.entryTerms,
            via: {
              matchColumn: schema.entryTerms.termId,
              throughTable: schema.terms,
              throughIdColumn: schema.terms.id,
              throughParentIdColumn: schema.terms.taxonomyId,
            },
          },
          {
            table: schema.terms,
            parentIdColumn: schema.terms.taxonomyId,
            idColumn: schema.terms.id,
            entityType: "term",
          },
        ],
      },
    ],
  ]);
}
