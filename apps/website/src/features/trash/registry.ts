/**
 * @file `TRASHABLE` — the one place a domain opts into the generic Trash. Design of record:
 * `ADS-memory/.local-artifacts/handoffs/2026-09-21-t8f-trash-more-plan.md` §1/§4.
 *
 * Adding a type to the Trash means adding one entry here — no new adapter file, no new route. Each
 * entry names its own table, marker column and display columns; `createTableTrashAdapter` (written
 * once, `table-adapter.ts`) and `notTrashed`/`isTrashedRecord` (`not-trashed.ts`) read the registry
 * rather than switching on `entityType` themselves.
 *
 * Every table and column is named by its SQL (snake_case) name, never a driver's column object, so
 * the one Kysely body in `table-adapter.ts`/`entry-sql.ts` runs the same on every dialect the storage
 * kernel drives. Names here are module constants, never caller input. A column on the entry's own
 * table is a bare name (`deleted_at`); a display column is qualified (`form_definitions.name`)
 * because a display `join` can bring a second table into the query.
 *
 * Registered today: `form`, `form_submission`, `widget` (an `entries` row scoped to
 * `type = 'widget'`), `menu`, `term`, `taxonomy` (T1). `taxonomy` has no `subtitle`: unlike the plan's
 * entry table suggests, `taxonomies` (`schema.sqlite.ts`) has no `slug` column (only `id`/`name`/
 * `hierarchical`/`status`/`updatedAt`/`version`) — verified by reading the table, not assumed from
 * the plan. `TrashDisplaySpec.subtitle` is optional for exactly this reason.
 */
import type { TrashEntityType } from "@jini-ai/cms/trash";

/**
 * Where a domain's "trashed" state lives:
 *  - `timestamp` — a nullable column, `NULL` = live (posts, media, redirects, `form`). Restoring
 *    always clears it; there is no "previous value" to remember.
 *  - `status` — an enum-ish text column with a distinct `trashed` value, and a `restoreFallback` for
 *    rows with no recorded prior value.
 */
export type TrashMarkerSpec =
  | { kind: "timestamp"; column: string }
  | { kind: "status"; column: string; trashed: string; restoreFallback: string };

/** Column-only snapshot for a Trash row's two display lines (SEE `TrashDisplay` in `ports.ts`).
 *  `join` reaches ONE parent row for a column that is not on the entry's own table (a submission's
 *  form name) — an inner join, so it is only for parents a foreign key guarantees. */
export interface TrashDisplaySpec {
  /** Qualified `table.column`. */
  title: string;
  /** Qualified `table.column`. */
  subtitle?: string;
  join?: TrashDisplayJoin;
}

/** One inner join: `table` joined on `on[0] = on[1]` (both qualified `table.column`). */
export interface TrashDisplayJoin {
  table: string;
  on: readonly [string, string];
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
  table: string;
  /** DIRECT case: the child column holding the parent's id. */
  parentIdColumn?: string;
  /** TWO-HOP case: `table`'s child rows are resolved through `throughTable` first. */
  via?: {
    /** The column on `table` matched against the ids resolved from `throughTable` (`entry_terms.term_id`). */
    matchColumn: string;
    /** The table the parent's children are actually recorded on (`terms`). */
    throughTable: string;
    /** `throughTable`'s own id column (`terms.id`). */
    throughIdColumn: string;
    /** `throughTable`'s column holding the id of the entity being purged (`terms.taxonomy_id`). */
    throughParentIdColumn: string;
  };
  /** `table`'s own id column — required only alongside `entityType`, to know which child ids are
   *  about to be removed before their `trashed_items` rows are cleaned up. */
  idColumn?: string;
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
  table: string;
  /** The child column holding this entity's id (`terms.parent_id`). */
  parentIdColumn: string;
  /** Machine-readable reason surfaced in the 409 body (`TERM_HAS_CHILDREN`). */
  code: string;
}

/**
 * A term is trashed the moment its taxonomy is — there is no second write, no cascade-hide of every
 * member term. `notTrashed` (`not-trashed.ts`) read this to treat a live term
 * whose taxonomy is trashed as trashed too, so `moveToTrash` on it reads `not-found` (a caller cannot
 * re-trash what is already hidden through its parent) — same precedence `not-trashed.ts`'s own file
 * header already documents for the plain marker check.
 *
 * `isTrashedRecord` (the in-memory twin) CANNOT evaluate this: a flat record has no parent row to
 * join against, so it reports the entity's own marker only — see its doc.
 * isCurrentlyTrashed (features/trash/not-trashed.ts) was deleted 2026-10-03: unused; see development/DELETED-CODE.md.
 */
export interface TrashHiddenWithParentSpec {
  /** The parent's own table (`taxonomies`). */
  parentTable: string;
  /** This entity's column pointing at the parent (`terms.taxonomy_id`). */
  parentIdColumn: string;
  /** The parent table's own id column (`taxonomies.id`). */
  parentPkColumn: string;
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
  readonly table: string;
  readonly idColumn: string;
  readonly workspaceColumn: string;
  /** A fixed `column = value` predicate ANDed into every query this entry's adapter runs — e.g.
   *  `type = 'widget'` against the shared `entries` table. */
  readonly scope?: { column: string; equals: string };
  readonly marker: TrashMarkerSpec;
  /** Optimistic-concurrency column. `undefined` for a domain with no version column (none in G1). */
  readonly versionColumn?: string;
  /** `updated_at`-shaped column, stamped alongside the marker. */
  readonly touchColumn?: string;
  readonly display: TrashDisplaySpec;
  /** Child rows removed, in this order, before the entry's own row — see `TrashCascadeSpec`. */
  readonly purgeFirst?: readonly TrashCascadeSpec[];
  /** Refuses `hide` while blocking rows exist — see `TrashBlockerSpec`. */
  readonly blocker?: TrashBlockerSpec;
  /** This entity reads as trashed whenever its parent is — see `TrashHiddenWithParentSpec`. */
  readonly hiddenWithParent?: TrashHiddenWithParentSpec;
}

export type TrashRegistry = ReadonlyMap<TrashEntityType, TrashEntry>;

/**
 * Builds `TRASHABLE`. Called once at composition (`deps.ts`) and resolved at CALL time thereafter by
 * every consumer (`createTableTrashAdapter`, `notTrashed`, `moveToTrash`) — the returned `Map` is
 * never mutated after this returns, so "resolved at call time" here means "read fresh from the Map
 * on every lookup", not "rebuilt every call".
 *
 * @complexity O(1) — a fixed handful of entries.
 */
export function buildTrashRegistry(): TrashRegistry {
  return new Map<TrashEntityType, TrashEntry>([
    [
      "form",
      {
        entityType: "form",
        label: "Form",
        permission: "admin.forms.manage",
        table: "form_definitions",
        idColumn: "id",
        workspaceColumn: "workspace_id",
        marker: { kind: "timestamp", column: "deleted_at" },
        versionColumn: "version",
        display: { title: "form_definitions.name", subtitle: "form_definitions.slug" },
        // `entityType`/`idColumn`: `form_submission` is itself a `TRASHABLE` entry (below), so a purge
        // also cleans up the phantom `trashed_items` row of any submission that was trashed
        // independently first (T1 item 5) — the doc comment on `TrashCascadeSpec.entityType` names
        // this exact case as its example; it was missing here (RED-first regression test).
        purgeFirst: [{ table: "form_submissions", parentIdColumn: "form_definition_id", idColumn: "id", entityType: "form_submission" }],
      },
    ],
    [
      "form_submission",
      {
        entityType: "form_submission",
        label: "Form submission",
        permission: "admin.forms.submissions.delete",
        table: "form_submissions",
        idColumn: "id",
        workspaceColumn: "workspace_id",
        marker: { kind: "timestamp", column: "deleted_at" },
        versionColumn: "version",
        // The form's name and when it was sent — never `data_json`: the Trash list is not a place
        // to show a visitor's data. `form_submissions.form_definition_id` is a real FK, so the
        // inner join always finds the form (trashed or not).
        display: {
          title: "form_definitions.name",
          subtitle: "form_submissions.submitted_at",
          join: { table: "form_definitions", on: ["form_definitions.id", "form_submissions.form_definition_id"] },
        },
      },
    ],
    [
      "widget",
      {
        entityType: "widget",
        label: "Widget",
        permission: "widgets.delete",
        table: "entries",
        idColumn: "id",
        workspaceColumn: "workspace_id",
        // `entries` holds every entry type; only widgets go to the Trash this way, so a collection
        // entry's id can never be hidden or purged through this entry.
        scope: { column: "type", equals: "widget" },
        // `deleted_at`, not `entries.status` (typed `draft|published|unpublished`) and not the
        // widget payload's own status (changing that needs a parse, which fails on corrupt rows).
        marker: { kind: "timestamp", column: "deleted_at" },
        versionColumn: "version",
        display: { title: "entries.title", subtitle: "entries.slug" },
        // Its own outgoing refs (e.g. a menu widget's `menuRef`) and its revisions. Refs OTHER
        // entries hold to it (a region placement, an embed) stay and render as dangling (REQ-43).
        purgeFirst: [
          { table: "entry_refs", parentIdColumn: "source_entry_id" },
          { table: "entry_revisions", parentIdColumn: "entry_id" },
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
        table: "menus",
        idColumn: "id",
        workspaceColumn: "workspace_id",
        // `status` already carries draft/published for a live menu; `trash` is a new value alongside
        // them, same pattern the test-only harness in `table-adapter.test.ts` already exercises.
        marker: { kind: "status", column: "status", trashed: "trash", restoreFallback: "published" },
        versionColumn: "version",
        touchColumn: "updated_at",
        display: { title: "menus.title", subtitle: "menus.slug" },
        // A trashed menu's location bindings are removed at PURGE — decision 1 in
        // `2026-09-21-trash-parallel-plan.md` §6 Q1 (recommendation accepted): purge is already the
        // explicit, confirmed permanent step, so "Delete permanently" on a bound menu unassigns it
        // rather than refusing. No `entityType`: bindings are not a `TRASHABLE` kind of their own.
        purgeFirst: [{ table: "nav_location_bindings", parentIdColumn: "menu_id" }],
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
        table: "terms",
        idColumn: "id",
        workspaceColumn: "workspace_id",
        marker: { kind: "status", column: "status", trashed: "trash", restoreFallback: "active" },
        versionColumn: "version",
        touchColumn: "updated_at",
        // The term's own name, plus its taxonomy's name so the Trash list can tell "Red" (Colors)
        // apart from "Red" (Tags) — an inner join, since `terms.taxonomy_id` is a real FK.
        display: {
          title: "terms.name",
          subtitle: "taxonomies.name",
          join: { table: "taxonomies", on: ["taxonomies.id", "terms.taxonomy_id"] },
        },
        // A term's own content assignments — purge deletes them; trash/restore never touch them
        // (decision 5: tags/categories stay assigned while trashed, hidden from reads, restored back).
        purgeFirst: [{ table: "entry_terms", parentIdColumn: "term_id" }],
        // Counts live AND trashed children: a parent can never be trashed while a child (of either
        // state) still points at it, so a purge — which only ever runs on an already-trashed row —
        // can never leave a dangling `parent_id` either.
        blocker: { table: "terms", parentIdColumn: "parent_id", code: "TERM_HAS_CHILDREN" },
        hiddenWithParent: {
          parentTable: "taxonomies",
          parentIdColumn: "taxonomy_id",
          parentPkColumn: "id",
          parentMarker: { kind: "status", column: "status", trashed: "trash", restoreFallback: "active" },
        },
      },
    ],
    [
      "taxonomy",
      {
        entityType: "taxonomy",
        label: "Taxonomy",
        permission: "admin.taxonomy.manage",
        table: "taxonomies",
        idColumn: "id",
        workspaceColumn: "workspace_id",
        marker: { kind: "status", column: "status", trashed: "trash", restoreFallback: "active" },
        versionColumn: "version",
        touchColumn: "updated_at",
        // No `subtitle` — `taxonomies` has no `slug` column, see the file header.
        display: { title: "taxonomies.name" },
        // Two-hop: `entry_terms` has no `taxonomy_id` column, so its rows are resolved through
        // `terms` first (`term_id IN (SELECT id FROM terms WHERE taxonomy_id = ?)`), THEN the terms
        // themselves are removed (`entityType: "term"` cleans up their `trashed_items` phantom rows
        // too — a term trashed on its own before its taxonomy was purged).
        purgeFirst: [
          {
            table: "entry_terms",
            via: { matchColumn: "term_id", throughTable: "terms", throughIdColumn: "id", throughParentIdColumn: "taxonomy_id" },
          },
          { table: "terms", parentIdColumn: "taxonomy_id", idColumn: "id", entityType: "term" },
        ],
      },
    ],
  ]);
}
