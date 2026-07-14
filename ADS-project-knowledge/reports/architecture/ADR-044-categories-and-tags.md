# ADR-044: Categories & Tags — shared taxonomy system

- Status: **PROPOSED** — emerged from the same 3-round swarm `/debate` as ADR-043 (2026-07-14). Unlike
  ADR-043's storage-shape question, **this topic converged closely across all three participants and all
  three rounds** — there is no persistent disagreement to tie-break here. **Has NOT been through
  `/audit-work`.**
- Date: 2026-07-14
- Relates: ADR-022 §5 (the design this ADR finally implements — its `taxonomies`/`terms`/`entry_terms`
  scaffold is a design placeholder, confirmed absent from the shipped schema by all three debate
  participants independently), ADR-043 (Collections — content types opt into taxonomies), ADR-041
  (Storage — precedent for the soft cross-table reference this ADR relies on), ADR-007 (workspace scoping)

## Context

There is currently no shared taxonomy system in Tovu: no way to categorize or tag `posts`/`pages` (or,
per ADR-043, future Collections entries) and browse/filter by that categorization across content types.
ADR-022 §5 sketches a `taxonomies + terms(parentId) + entry_terms` mechanism, but — like ADR-022's
`entries` table — it was never actually built. All three debate participants confirmed this directly
against the schema.

## Decision

### 1. One shared taxonomy mechanism, not two

Categories and tags are two **instances** of the same underlying primitive — a named term attached to
content — differing only in whether terms nest. A `taxonomies` table carries a `hierarchical` boolean:
`category` = hierarchical (`terms.parentId` populated), `tag` = flat (`terms.parentId` always null). This
was unanimous across all three participants across all rounds: modeling them as two separate subsystems
would duplicate CRUD, UI, rename/merge logic, and the reverse-index for no real gain.

### 2. Real relational tables, never JSON arrays

Relations live in `terms` + `entry_terms` real tables, not as a JSON array on the content row. This
matches ADR-022 §5's own explicit text ("relations live in real tables, not JSON") and is required for
the two queries that justify taxonomy's existence: "all content tagged X" (a reverse lookup a JSON array
can't answer efficiently) and "rename/merge tag X everywhere" (referential integrity a JSON array
can't provide).

### 3. The join is a soft polymorphic reference, ships independently of Collections

`entry_terms` references content by `(workspaceId, contentType, contentId)` — a **soft** tuple, not a
hard foreign key to any single table. This is the decision that lets Categories & Tags ship **now,
against the existing `posts` table, without waiting for ADR-043's Collections/`entries` engine to exist**:
the same join mechanism attaches to `posts` rows today and to `entries` rows (ADR-043) later, with zero
schema change when Collections lands.

This soft-reference pattern is not a novel risk: **ADR-041's sidecar ops journal already uses an
identical pattern** (composite actor identity referenced across a physical file boundary that cannot
carry a real foreign key), for the same underlying reason — a reference that must cross a boundary a
hard FK cannot span. Orphaned `entry_terms` rows (from content deleted through a path that doesn't clean
up the join) are inert on read (an inner join simply drops them) and swept by a periodic/boot reconcile,
matching this codebase's established tolerance for soft cross-boundary references.

### 4. Opt-in per content type

A content type (built-in `post`/`page`, or an ADR-043 Collection) declares which taxonomies apply to it.
Until ADR-043 ships, `post`/`page` opt in via a small hardcoded allow-list in the taxonomy library — an
honest interim step, not a permanent design compromise.

## Rejected alternatives (converged)

- **Separate tables/subsystems for categories vs. tags.** Rejected — same underlying shape, differing
  only by a boolean; two subsystems would be pure duplication.
- **JSON array of tag strings on the content row.** Rejected — breaks efficient reverse lookup and
  referential integrity on rename/merge; the exact postmeta-shaped trap ADR-022 exists to avoid.
- **Hard FK from `entry_terms` to a single content table.** Rejected for this pass — would either block
  taxonomy behind ADR-043's `entries` engine landing first, or strand it against `posts` only, forfeiting
  the independent-shipping property that makes this decision valuable.

## Wiring into the existing codebase

- **ADR-022 §5** is the design being implemented.
- New Tier-2 library `src/features/taxonomy/`, following the same shipped-feature template as every
  other feature this year: `ports.ts`, `types.ts`, `write-service.ts` (single write chokepoint + an
  append-only `taxonomy_revisions` ledger — renames/merges are consequential and must be revisioned),
  `repo.memory.ts` + `repo.sqlite.ts` (rule-of-two), admin routes under `/api/admin/v1/taxonomy`, React
  screen `apps/admin/src/sections/Taxonomy.tsx`.
- **ADR-043's `content_types` registry** carries the per-type taxonomy allow-list once it ships;
  `post`/`page` use a hardcoded allow-list until then.
- **ADR-007** workspace scoping on every table and port method.

## Concrete sample implementation

```ts
// src/infra/db/schema.ts
export const taxonomies = sqliteTable("taxonomies", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  key: text("key").notNull(),                    // "category" | "tag" | operator-defined
  label: text("label").notNull(),
  hierarchical: integer("hierarchical").notNull().default(0),
  status: text("status").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull(),
}, (t) => [uniqueIndex("taxonomies_workspace_key_unique").on(t.workspaceId, t.key)]);

export const terms = sqliteTable("terms", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  taxonomyId: text("taxonomy_id").notNull().references(() => taxonomies.id, { onDelete: "restrict" }),
  parentId: text("parent_id"),                   // self-ref; null for tags & top-level categories
  slug: text("slug").notNull(),
  label: text("label").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull(),
}, (t) => [
  uniqueIndex("terms_workspace_taxonomy_slug_unique").on(t.workspaceId, t.taxonomyId, t.slug),
  index("idx_terms_workspace_parent").on(t.workspaceId, t.parentId),
]);

export const entryTerms = sqliteTable("entry_terms", {
  workspaceId: text("workspace_id").notNull(),
  contentType: text("content_type").notNull(),   // "post" | "page" | a content_types.key — POLYMORPHIC
  contentId: text("content_id").notNull(),        // soft ref: posts.id today, entries.id (ADR-043) later
  termId: text("term_id").notNull().references(() => terms.id, { onDelete: "restrict" }),
  position: integer("position").notNull().default(0),
  addedAt: text("added_at").notNull(),
}, (t) => [
  uniqueIndex("entry_terms_unique").on(t.workspaceId, t.contentType, t.contentId, t.termId),
  index("idx_entry_terms_by_term").on(t.workspaceId, t.termId),          // "all content tagged X"
  index("idx_entry_terms_by_content").on(t.workspaceId, t.contentType, t.contentId),
]);
```

```ts
// src/features/taxonomy/write-service.ts
export interface TaxonomyWriteService {
  assignTerms(req: { workspaceId; actorId; contentType; contentId; termIds: string[] }): Promise<void>;
  mergeTerm(req: { workspaceId; actorId; fromTermId; intoTermId }): Promise<void>; // one tx, revisioned
  renameTerm(req: { workspaceId; actorId; termId; label; slug }): Promise<void>;
}
```

Permissions: `admin.taxonomy.manage` (ADR-021 flat-string convention).

## Failure modes

- **Orphaned `entry_terms` on content deletion outside the taxonomy chokepoint.** Mitigation: content
  deletion emits an event the taxonomy library subscribes to for cleanup; orphans are inert on read; a
  periodic/boot reconcile sweeps them — never a brick, at worst a slow leak of dead join rows.
- **Destructive term merge losing history or corrupting counts.** Mitigation: merge is a single
  transaction writing a `taxonomy_revisions` row capturing the pre-merge mapping (reversible narrative);
  the `entry_terms_unique` index guarantees dedup when merging terms that already share content; counts
  are always derived from the reverse index, never cached-and-drifted.
- **Hierarchy cycles.** A category set as its own ancestor. Mitigation: the write-service chokepoint
  checks for cycles before accepting a `parentId` update, enforcing a strict DAG.

## Consequences

- Ships independently of, and can land before, ADR-043's Collections engine.
- The soft polymorphic join means no database-enforced referential integrity between `entry_terms` and
  its content — an accepted, precedented tradeoff (see ADR-041), not an oversight.
- `post`/`page`'s taxonomy opt-in is a hardcoded allow-list until ADR-043 ships its `content_types`
  registry — a small, disclosed interim step.

## Open Questions

- Whether operator-defined custom taxonomies (beyond the seeded `category`/`tag`) are in scope for v1 or
  a later pass — the schema supports them (any `taxonomies` row), but the admin UI for defining new
  taxonomies (vs. just managing terms within `category`/`tag`) is not scoped here.
- Per-content-type taxonomy limits (e.g., max taxonomies per type) — not addressed.

## Process Note

Converged across all three participants and all three debate rounds — no Coordinator tie-break was
needed for this topic, unlike ADR-043.
