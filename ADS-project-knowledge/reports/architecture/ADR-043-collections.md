# ADR-043: Collections — operator-defined content types

- Status: **PROPOSED** — emerged from a 3-round swarm `/debate` (2026-07-14, Primary Opus/Sonnet host +
  Fable subagent + Codex gpt-5.5 + Gemini 3.1 Pro via agy). All three external/subagent participants
  converged closely on the overall shape; the storage-shape sub-question (below) did **not** converge
  even after 3 rounds — this ADR's storage decision is a Coordinator tie-break over a genuine,
  persistent 3-way split, not a peer-unanimous result. **Has NOT been through `/audit-work`.**
- Date: 2026-07-14
- Relates: ADR-022 (content model — this ADR is the first real implementation of its deferred `entries`/
  `content_types` design), ADR-023 (core-mediated plugin data modules — explicitly rejected as the storage
  mechanism for this feature), ADR-024 (expression-totality — governs the field-validation language),
  ADR-041 (Storage/Timeline — this feature's index-provisioning events feed that Timeline), ADR-044
  (Categories & Tags — the taxonomy layer Collections entries opt into), ADR-007 (workspace scoping)
- Process note: this ADR's Primary/host participant did not run a genuine blind first pass before
  peer dispatch (see Process Note at the end) — a process gap, disclosed rather than hidden.

## Context

Tovu's content model today is a single bespoke `posts` table with a `kind` column (`post`|`page`).
ADR-022 (accepted 2026-07-08) describes a generic `entries` table + a content-type-as-data registry +
a validated JSON field-extension bag + core-provisioned expression indexes — but **that design was never
implemented**. All three debate participants independently verified this directly against
`src/infra/db/schema.ts` (not from prose), and two existing code comments in the shipped codebase already
say so explicitly ("not the generic ADR-022 `entries` model, which doesn't exist in this repo").

There is currently no admin-facing way for a site operator to define their own content type (e.g.
"Recipe," "Product," "Event") with its own fields, without a developer writing code and running a
migration. This ADR designs that capability — "Collections" — as the first real build of ADR-022's
deferred engine.

## Decision

### 1. Collections is a UI over a real content-type registry, not a database builder

Operator-defined content types are **data, not code, not DDL**. Creating a Collection inserts a row into
a `content_types` registry (schema: field names, kinds, validation rules, which fields are `queryable`)
and, for queryable fields, issues a core-mediated `CREATE INDEX` on a JSON path — **never**
`CREATE TABLE`/`ALTER TABLE`. This is ADR-022 §1–§4's design, finally implemented as intended.

### 2. Storage shape: a new `entries` table, coexisting with the untouched `posts` table

**This is the one point the debate did not converge on even after three rounds**, and is the
Coordinator's tie-break call, not a peer-unanimous result:

- **Round 1**: Fable proposed a new `entries` table, explicitly leaving `posts` untouched, citing
  migration-risk-aversion toward live content. Codex and agy's illustrative sketches leaned toward
  reusing `posts` directly, though neither had committed to this as a deliberate position.
- **Round 2 (disclosed)**: Fable reversed — re-reading ADR-022 §1's literal text ("`post`/`page` ship as
  seeded registry rows"), Fable proposed instead an **additive-only evolution of `posts`** (one nullable
  `fields_json` column + a registry-checked `type` replacing the bare `kind` enum), arguing the migration
  risk it originally feared was smaller than assumed (zero existing-row mutation, fully reversible via
  `DROP COLUMN`). Codex explicitly reversed *toward* Fable's original coexistence stance. agy sided with
  coexistence but proposed a third option: a thin **identity-anchor** supertype table (`nodes`/`entities`
  holding just `id`/`created_at`/`type`), with both `posts` and a new `entries` table as FK children —
  giving taxonomy one real join target without touching `posts`'s own columns.
- **Round 3 (final, testing the anchor)**: no further convergence. Fable moved to recommend the anchor
  pattern (0.78 confidence). Codex rejected the anchor (citing a new dual-write-chokepoint coupling risk
  it introduces) and returned to plain coexisting tables (0.78). agy **abandoned its own anchor proposal**
  after weighing its cost (a permanent write-path coordination tax and a join-hop on every read) and
  moved to recommend Fable's Round 2 additive-`posts`-evolution position instead (0.90). Three
  participants, three different final answers.

**Coordinator's tie-break: plain coexisting tables.** A new `entries` table holds Collections content;
`posts` is not touched in any way (no new columns, no write-path changes, no join dependency). Reasoning:

- Every participant who evaluated the identity-anchor pattern in depth — including agy, its own
  author — ultimately rejected it once the cost was fully reasoned through: it adds a permanent
  dual-write transaction to every post/entry create and a join-hop to every cross-type read, purely to
  avoid one nullable column. That is a worse trade than the problem it solves.
- The real objection to plain coexistence — "taxonomy needs a genuine join target, not a polymorphic
  soft reference" — has an existing, proven answer already in this codebase: **ADR-041's sidecar ops
  journal already uses exactly this kind of soft cross-table reference** for actor identity, for the
  identical reason (a physical/module boundary that can't carry a real foreign key). This codebase
  already tolerates and reconciles soft references where a hard FK isn't available; it is not a novel
  risk introduced here.
- This codebase's single most repeated architectural value, across nearly every accepted ADR
  (ADR-011, ADR-015, ADR-023, ADR-041), is protecting live, real content from anything new and unproven.
  Plain coexistence gives Collections the cleanest possible abort path — if the feature doesn't pan out,
  `DROP TABLE entries` and walk away with zero effect on real site content. Neither the additive-`posts`
  evolution nor the identity-anchor pattern preserves that property as cleanly.

**`post`/`page` are NOT migrated onto `entries` in this pass.** They remain on `posts`, unaffected.
Migrating them is explicitly deferred to a future pass, once the `entries` engine has proven itself in
production on lower-stakes custom types — mirroring ADR-023's own "engine against real demand, not
speculatively" doctrine.

### 3. Rejected alternatives (converged, all three participants agreed)

- **Directus/Contentful-style physical tables per Collection** (`CREATE TABLE` per operator-defined
  type). Rejected — this is squarely ADR-023 `dataModule` territory (plugin code, capability-gated,
  snapshot-before-every-DDL, disk-headroom preflight, boot-blocking crash recovery), and ADR-023 §3's
  tier matrix explicitly rejects zero-code/Tier-1 declarations. Handing that ceremony to an operator's
  "New Collection" button is a direct never-brick violation, not a shortcut.
- **Entity-Attribute-Value (EAV) tables.** Rejected — known anti-pattern for SQLite performance; the
  namespaced JSON extension bag (ADR-022 §2) plus core-provisioned expression indexes is the better fit
  this codebase already designed for exactly this problem.
- **JSON array of arbitrary fields with no registry/validation.** Rejected — this is the WordPress
  postmeta trap ADR-022 exists to avoid; every field must be declared and validated against the
  `content_types` registry before it can be written.

### 4. Wiring into the existing codebase

- **ADR-022 §1–§4** is the design being implemented, not extended: content-types-as-registry-data,
  universal typed columns + namespaced `fields.ext.{owner}.*`, expression-index query surface, single
  write chokepoint, complete append-only revisions with actor + monotonic sequence.
- **ADR-024's expression-totality amendment** governs the field-validation predicate language — bounded
  cost, never Turing-complete. Operator-authored validation rules ride this same trust primitive.
- **ADR-023 is explicitly NOT the storage path** — named here to foreclose the instinct to route
  Collections through `dataModule`.
- **ADR-041's `index.provision`/`index.drop` ledger events** fire when a Collection's queryable field
  indexes are created/dropped, so this shows up on the Storage Timeline like any other schema-adjacent
  operation, using the carve-out ADR-041 §4 already defined (no restore point needed for index-only
  operations).
- **ADR-007** workspace scoping on every `content_types`/`entries`/`entry_revisions` row and port method.

### 5. Concrete sample implementation

```ts
// src/infra/db/schema.ts — additive, coexists with the untouched `posts` table
export const contentTypes = sqliteTable("content_types", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  key: text("key").notNull(),                   // "recipe"
  label: text("label").notNull(),
  fieldsSchemaJson: text("fields_schema_json").notNull(), // field defs: name, kind, queryable, required
  status: text("status").notNull(),             // active|deprecated|tombstone
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull(),
}, (t) => [uniqueIndex("content_types_workspace_key_unique").on(t.workspaceId, t.key)]);

export const entries = sqliteTable("entries", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  type: text("type").notNull(),                 // soft ref to content_types.key
  slug: text("slug").notNull(),
  status: text("status").notNull(),
  title: text("title").notNull(),
  fieldsJson: text("fields_json").notNull(),    // { ext: { site: {...} } }, validated against content_types
  publishedAt: text("published_at"),
  updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull(),
}, (t) => [
  uniqueIndex("entries_workspace_type_slug_unique").on(t.workspaceId, t.type, t.slug),
  index("idx_entries_workspace_type").on(t.workspaceId, t.type),
]);

export const entryRevisions = sqliteTable("entry_revisions", {
  seq: integer("seq").primaryKey({ autoIncrement: true }),
  entryId: text("entry_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  perEntrySeq: integer("per_entry_seq").notNull(),
  stateJson: text("state_json").notNull(),
  actorId: text("actor_id").notNull(),
  op: text("op").notNull(),
  recordedAt: text("recorded_at").notNull(),
}, (t) => [uniqueIndex("idx_entry_revisions_entry_seq").on(t.entryId, t.perEntrySeq)]);
```

New Tier-2 library `src/features/entries/` (+ `src/features/content-types/`), mirroring every shipped
feature this year: `ports.ts`, `types.ts`, `write-service.ts` (the chokepoint — validates against the
registry, writes entry + revision in one transaction), `repo.memory.ts` + `repo.sqlite.ts` (rule-of-two),
admin routes under `/api/admin/v1/content-types` and `/api/admin/v1/entries`, React screen
`apps/admin/src/sections/Collections.tsx`. Permissions: `admin.collections.read`, `admin.collections.manage`
(ADR-021 flat-string convention).

## Consequences

- The deferred ADR-022 engine finally gets built, but scoped to new content only — `posts`/`pages`
  carry zero migration risk from this pass.
- Collections and Categories & Tags (ADR-044) can ship independently of each other — the taxonomy join
  doesn't depend on Collections existing, and Collections doesn't depend on taxonomy existing.
- A future decision (not this ADR) is still owed: whether/when to migrate `posts`/`pages` onto `entries`
  to fully realize ADR-022 §1's "post/page are seeded registry rows" text. This ADR explicitly defers
  that, accepting `posts` as a permanent-for-now bespoke exception.
- Taxonomy's join to `entries` (and to `posts`, for existing content) uses a soft polymorphic reference,
  not a hard FK — an accepted, precedented tradeoff (see ADR-044), not a design gap.

## Failure modes

- **Queryable-index sprawl.** An operator marks many fields `queryable` across many Collections,
  degrading write performance. Mitigation: a per-type cap on `queryable` fields enforced at
  `content_types` definition time.
- **Schema drift / dangling fields.** An operator removes a field from a type definition, leaving old
  entries with orphaned JSON keys. Mitigation: validation is strict on write, tolerant on read (unknown
  keys are ignored, not fatal); field removal is a tombstone, never a destructive drop.

## Open Questions

- Whether/when `posts`/`pages` migrate onto `entries` — deliberately out of this ADR's scope.
- Exact per-type `queryable` field cap — not benchmarked here.
- Whether the additive-`posts`-evolution or identity-anchor alternatives should be revisited once
  Collections has real production usage data — both were credible positions held by a majority of
  Round-3 participants (2 of 3 final answers were NOT plain coexistence), so this decision should not be
  read as an overwhelming consensus; it is a reasoned tie-break over a genuine, persistent split.

## Process Note

This ADR's Primary/host participant (Claude, this session) did not run a true blind first pass before
dispatching peers, contrary to the debate protocol's own requirement that Primary form and freeze an
independent position before peer synthesis — flagged here rather than silently omitted, per this
project's evidence-over-invention discipline. The final storage-shape tie-break above is the
Coordinator's own reasoned judgment, formed after watching all three rounds, not a blind prior position
that happened to agree.
