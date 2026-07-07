# State Contract Spec: Content Entry Authoring — Create and Edit Pages + Posts

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/state.spec.md`

- Spec ID: `SPEC-002`
- Feature: `FEAT-002-content-entry-authoring`
- Version: `1.0.0`
- Content Hash: `sha256:see feature.spec.md (package hash of record)`
- Last Edited: `2026-07-07T02:05:00Z`

## Purpose
Defines the durable entry state after the `kind` extension, the create action, selector changes, and the migration/seed contract. Backend durable state only; UI store state is out of scope (ui.spec.md covers component contracts).

## 1) State Shape (durable rows)

| Field | Type | Nullable | Initial Value | Description |
|---|---|---|---|---|
| `posts` (table) | `array<PostRecord>` | no | seeded rows | One row per content entry, both kinds (table rename is OQ-02) |
| `change_sets` / `change_set_items` | per SPEC-001 | no | `[]` | Unchanged shape; creates add rows with `operation "create"` |

## 2) Entity Contracts

```yaml
PostRecord:                          # MODIFIED by this feature
  id: string (uuid)                  # from IdGeneratorPort on create
  workspaceId: string                # required — structural scoping (ADR-007)
  kind: enum[post, page]             # NEW — set at create by route family; immutable (INV-02)
  title: string                      # 1..200 chars after trim
  slug: string                       # ^[a-z0-9-]+$, ≤120 chars, unique per (workspaceId) across kinds (INV-01)
  bodyJson: object                   # TipTap JSON document; stored as validated JSON text in SQLite
  status: enum[draft, published]
  updatedAt: string (date-time)      # from ClockPort
  version: integer                   # 1 on create; +1 per update (SPEC-001 guard input)

ChangeSetItemRecord (create case):   # shape per SPEC-001; value profile for creates
  entityType: "post"                 # single storage shape ⇒ single applier key (both kinds)
  operation: "create"
  inversePayload: null               # creates are non-revertible in v1 (owner call 2026-07-06)
  entityVersionAtApply: 1
```

## 3) Action Catalog (state-changing operations)

| Action | Payload | Precondition | State Changes | Failure Handling |
|---|---|---|---|---|
| `CREATE_ENTRY` (new) | workspaceId, kind, title, slug?, bodyJson?, status? | workspace exists; validation passes (BR-03); slug free after derivation/conflict check; idempotency key unused (when present) | insert 1 `PostRecord` (version 1) + 1 applied change set with 1 `operation "create"` item (via gateway) | any validation/conflict failure ⇒ no row, no change set, no event (EC-07); duplicate key ⇒ `DUPLICATE_COMMAND`, no row |
| `UPDATE_ENTRY` (existing, extended) | per SPEC-001 `POST_UPDATE` | entry exists AND `record.kind` matches the route family (REQ-08); reserved-slug check added (REQ-04) | as SPEC-001 (version +1, change set with inverse) | kind mismatch ⇒ `ENTRY_NOT_FOUND`-class 404, no gateway execution, no change set (BR-06) |

## 4) Status Lifecycle

```
(create) ──▶ draft ──publish (update)──▶ published
                ▲                            │
                └────unpublish (update)──────┘
kind: fixed at create — no transition exists (INV-02)
```

No trash/deleted status exists in this slice (OQ-01). `status` transitions are free-form via update in both directions.

## 5) Selector Contracts (repo port reads)

`PostRepoPort` changes — `list` gains a required `kind` filter; `findBySlug` stays kind-blind (uniqueness and public serving are cross-kind):

| Selector | Input | Output | Null/Empty Behavior |
|---|---|---|---|
| `findById` | `{ workspaceId, id }` | `PostRecord` or null | null when unknown or other workspace (kind guard applied in feature layer) |
| `findBySlug` | `{ workspaceId, slug }` | `PostRecord` or null | null when unused; matches ANY kind |
| `list` (modified) | `{ workspaceId, kind }` | `PostRecord[]` ordered `updatedAt` desc, `id` desc tie-break (TB-01) | empty array |
| `save` | `PostRecord` | void | insert on new id, replace on existing (unchanged) |

Feature-layer read functions follow: `listAdminEntries({workspaceId, kind})`, `listPublishedEntries({workspaceId, kind})` (home uses `kind "post"`), `getPublishedEntryBySlug({workspaceId, slug})` (kind-blind, published only).

## 6) Invariants (state-level)

- `(workspaceId, slug)` must be unique across all rows regardless of `kind` — Drizzle `uniqueIndex("posts_workspace_slug_unique")` in `schema.ts` (already present) and equivalent check in the memory adapter.
- `kind` must be one of exactly `post`, `page`, and is immutable once written.
- `version` must be ≥ 1, start at 1 on insert, and never decrease.
- `bodyJson` must always parse as a JSON object (never array/scalar) in both adapters.
- Every row inserted via the admin API has a corresponding applied change set (INV-03); seeded rows are the only rows without one.

## 7) Persistence Notes

### Drizzle schema migration (additive, REQ-11 / AC-16 / EC-09)

The data layer is Drizzle ORM (code-first schema → generated migrations, adopted 2026-07-06). This feature adds `kind` by editing the schema, not by hand-writing SQL:

```ts
// src/infra/db/schema.ts — add to the existing `posts` table
export const posts = sqliteTable(
  "posts",
  {
    // …existing columns…
    kind: text("kind").notNull().default("post"),   // NEW — additive, defaulted
  },
  (table) => [
    uniqueIndex("posts_workspace_slug_unique").on(table.workspaceId, table.slug), // already present
    index("idx_posts_workspace").on(table.workspaceId),                            // already present
    index("idx_posts_workspace_kind").on(table.workspaceId, table.kind),           // NEW
  ]
);
```

- `drizzle-kit generate` emits a new migration file under `drizzle/` (an additive `ALTER TABLE posts ADD COLUMN kind ... DEFAULT 'post'` + the new index); no file under `drizzle/` is hand-edited.
- Drizzle's `migrate()` (called in `openContentDb`) applies pending migrations and records them in the `__drizzle_migrations` journal, so application is idempotent — re-running on an already-migrated db is a no-op. Never drops, rewrites, or copies the table; existing rows read `kind 'post'`.
- The memory adapter accepts seed rows without `kind` by defaulting to `"post"` (parity with the schema default).

### Seed contract (first-run only, guarded by workspace slug as today)

- Existing seeded posts gain `kind: "post"`.
- One new seeded page: `id "page-about"`, `kind "page"`, `slug "about"`, `title "About This Site"`, `status "published"`, `version 1`, small TipTap body. Present only in fresh databases (seed guard unchanged) — AC-16.

### Postgres forward-compatibility

- `kind` maps to a `text` column with a check constraint (or enum) later; `bodyJson` stays JSON text → `jsonb` (PROJECT_MEMORY portability rule). No decision forced by this slice.
