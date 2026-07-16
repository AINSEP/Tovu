# ADR-044: Categories & Tags — shared taxonomy system

- Status: **Accepted** (2026-07-14, human owner sign-off — Leon Aburime) — emerged from the same 3-round swarm `/debate` as ADR-043 (2026-07-14). Unlike
  ADR-043's storage-shape question, **this topic converged closely across all three participants and all
  three rounds** — there is no persistent disagreement to tie-break here. **Audited six times across two
  threat models — debate-round numbers above are independent of audit rounds: audit round 1 used
  `TM-ADR-STORAGE-CONTENT-004`; audit rounds 2–6 used `TM-ADR-CONTENT-ADMIN-005` (internal verification,
  external re-dispatch, compliance inspection, final internal close-out, and fix-compliance re-check
  respectively):** round 1 under
  `TM-ADR-STORAGE-CONTENT-004` (2026-07-14, unanimous FAIL — the only one of
  the four originally audited ADRs all three auditors failed independently — 4 fixes folded, see Round 1
  audit fold below); an internal-verification round under `TM-ADR-CONTENT-ADMIN-005` (2026-07-14, escalation
  findings on cross-ADR consistency and merge reversibility); and external peer re-dispatch (2026-07-14,
  Codex GPT-5.6 Terra + Gemini 3.1 Pro, same TM id) which independently converged on the SAME core defects
  (allow-list timing contradiction, false merge-reversibility claim, missing `taxonomy_revisions` sample,
  missing outbox/watermark obligations) — all now fixed this fold. One additional auditor finding (a
  kind-mutation cascade concern) was checked against the live code and found not applicable: `posts.kind` is
  fixed at creation with no post↔page conversion path in v1. **Round 4 (2026-07-14, same auditors,
  compliance-inspector pass) — unanimous PASS, Codex 9.6, agy 9.8; agy caught one more low-severity
  consistency gap in the just-added `taxonomy_revisions` sample (missing `perTaxonomySeq`, mirroring
  ADR-043's round-3 fix), fixed this fold.** **Round 5 (2026-07-14, Fable, final internal close-out) — PASS
  9.0. One substantive finding: the term lifecycle (reparent, deprecate) wasn't fully wired into the op
  vocabulary/outbox obligation/`terms` schema despite being named by the `parentId`-validation and
  revisioning bullets — `reparentTerm` added, `terms.status` added, both fixed this fold. Remaining findings
  were provenance/citation cleanup, also fixed this fold.** **Round 6 (2026-07-14, same TM id,
  fix-compliance re-check) — external PASS (Codex GPT-5.6 Terra 9.0, agy 9.9; one nit fixed: the
  audit-count legend); internal re-verification (Fable) PASS, no new findings on this ADR.**
  Audit-adversarial review is complete; see the
  external-audit run for full cross-auditor reasoning and disposition.
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
**Corrected by round-3 `/audit-work` (2026-07-14, TM-ADR-CONTENT-ADMIN-005 — Fable, Codex, and agy
independently converged on this defect): `post`/`page` opt in via a small hardcoded allow-list in the
taxonomy library, permanently for as long as they remain on the legacy `posts` table — not "until ADR-043
ships," which was internally contradictory (ADR-043 permanently rejects `post`/`page` as registry keys, so
they can never move into `content_types` when ADR-043 ships; only a future, separate migration ADR could
change this). ADR-043's `content_types` registry carries the per-type taxonomy allow-list for Collections
`entries` only.**

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
- **ADR-043's `content_types` registry** carries the per-type taxonomy allow-list for Collections
  `entries`. **Corrected by round-3 `/audit-work` fold (2026-07-14):** `post`/`page` use a hardcoded
  allow-list permanently for this pass, not "until ADR-043 ships" — see §4 above.
- **ADR-007** workspace scoping on every table and port method.
- **ADR-009 outbox discipline + ADR-041 §5 watermark stamping (added, round-3 `/audit-work` fold,
  TM-ADR-CONTENT-ADMIN-005 — Codex and agy independently flagged this omission).** Every mutating taxonomy
  write (`assignTerms`, `mergeTerm`, `renameTerm`, `reparentTerm`, and `taxonomies`/`terms` create/deprecate)
  must enqueue an
  outbox event and increment-and-stamp the authoritative `storage_write_watermark`, both in the same
  transaction as the write — the identical same-transaction obligation ADR-043 §4 already requires for
  Collections. Without the outbox event, taxonomy changes are silently invisible to every downstream
  event-driven consumer (search indexing, webhooks); without the watermark stamp, taxonomy writes are never
  countable in ADR-045's discarded-window disclosure, repeating the exact coverage gap that ADR-043's
  original text left open (see ADR-043 §4's own watermark-stamping bullet for the precedent).
- **Explicit dependency on ADR-043 (added, round-1 audit fold).** This ADR's `entry_terms.(workspaceId,
  contentType, contentId)` soft reference composes cleanly against both the legacy `posts` table and ADR-043's
  `entries` table **only because ADR-043 §4 now rejects `content_types.key ∈ {'post','page'}` at registry-write
  time.** Without that reservation, an operator-created Collection named "post" would make `contentType='post'`
  ambiguous between a `posts` row and an `entries` row — this ADR's polymorphic join is not injective on its own;
  it is injective only in composition with ADR-043's reserved-key guarantee. This dependency must hold even if
  ADR-043 or ADR-044 ship independently of each other in time.
- **Workspace-scoped join resolution (added, round-1 audit fold; extended round 3).** The soft `(workspaceId,
  contentType, contentId)` reference is acceptable only if `assignTerms`/every taxonomy write validates that
  the target term and the target content row belong to the **same** `workspaceId` before writing — never
  trusting a caller-supplied `workspaceId` alone. The write chokepoint must resolve both `terms.workspaceId`
  and the content row's own workspace ownership and reject the write (not just the read) on any mismatch.
  Cross-workspace term/content pairing is otherwise a direct tenant-isolation violation of ADR-007. Contract
  tests must prove a cross-workspace assignment is rejected, not merely untested. **Round-3 correction
  (2026-07-14, TM-ADR-CONTENT-ADMIN-005 — internal verification): workspace-match alone leaves a lens-level
  gap — `contentType='page'` plus a `posts` row whose actual `kind='post'` would pass every check above
  (same table, same workspace). The chokepoint must additionally verify the resolved row's own type/lens
  equals the supplied `contentType` (`posts.kind` for `post`/`page`; `entries.type` for Collections keys),
  rejecting on mismatch, with a contract test alongside the cross-workspace one. Note this is a write-time
  validation gap, not a mutation-cascade concern: `posts.kind` is fixed at creation with no post↔page
  conversion path in v1 (`src/features/post/post.ts`; `UpdatePostInput` has no `kind` field), so no cascade
  obligation is needed — only the write-time lens check above.**
- **`parentId` hierarchy validation (added, round-1 audit fold).** The write chokepoint must validate, transactionally,
  before accepting a `parentId` update: (a) the parent belongs to the **same** `taxonomyId` as the child — a term
  cannot parent across taxonomies; (b) `parentId` is rejected (must be `null`) when `taxonomies.hierarchical = 0`
  (tags never get a parent); (c) the existing cycle-detection check (Failure modes, below) still applies. The
  original decision named cycle detection only; same-taxonomy and hierarchy-mode validation were unstated gaps.

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

// added, round-3 audit fold (2026-07-14, TM-ADR-CONTENT-ADMIN-005 — Fable, Codex, and agy independently
// found this table missing from the sample despite being load-bearing for §4's revisioning claims and
// mergeTerm's revised reversibility disclosure below).
export const taxonomyRevisions = sqliteTable("taxonomy_revisions", {
  seq: integer("seq").primaryKey({ autoIncrement: true }),
  taxonomyId: text("taxonomy_id").notNull(),
  // added, round-4 audit fold (2026-07-14, TM-ADR-CONTENT-ADMIN-005 — agy) — mirrors the same fix
  // ADR-043's content_type_revisions got in round 3: a global seq-only index doesn't give a gapless
  // per-taxonomy sequence the way entryRevisions'/contentTypeRevisions' perEntrySeq/perContentTypeSeq do.
  perTaxonomySeq: integer("per_taxonomy_seq").notNull(),
  workspaceId: text("workspace_id").notNull(),
  stateJson: text("state_json").notNull(),      // full pre-operation term/taxonomy state
  actorId: text("actor_id").notNull(),
  pluginId: text("plugin_id"),                  // ADR-022 §4a origin-plugin attribution; null for core/operator writes
  // extended, round-5 audit fold (2026-07-14, TM-ADR-CONTENT-ADMIN-005, Fable F1) — `reparent` was missing:
  // the parentId hierarchy-validation bullet above explicitly governs "accepting a parentId update," but the
  // original enum had no way to record that mutation.
  op: text("op").notNull(),                     // create|rename|reparent|merge|deprecate
  recordedAt: text("recorded_at").notNull(),
}, (t) => [uniqueIndex("idx_taxonomy_revisions_taxonomy_seq").on(t.taxonomyId, t.perTaxonomySeq)]);

export const terms = sqliteTable("terms", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  taxonomyId: text("taxonomy_id").notNull().references(() => taxonomies.id, { onDelete: "restrict" }),
  parentId: text("parent_id"),                   // self-ref; null for tags & top-level categories
  slug: text("slug").notNull(),
  label: text("label").notNull(),
  // added, round-5 audit fold (2026-07-14, TM-ADR-CONTENT-ADMIN-005, Fable F1) — the op enum above and the
  // outbox/watermark obligation bullet both claimed terms support `deprecate`, but nothing recorded that
  // state; without a `status` column a term cannot actually be deprecated as drawn.
  status: text("status").notNull().default("active"), // active|deprecated
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
  assignTerms(req: { workspaceId; actorId; contentType; contentId; termIds: string[] }): Promise<void>; // NOT revisioned — see round-1 audit fold below
  mergeTerm(req: { workspaceId; actorId; fromTermId; intoTermId }): Promise<void>; // one tx, revisioned (term metadata only — membership dedup is destructive, see round-3 fold below)
  renameTerm(req: { workspaceId; actorId; termId; label; slug }): Promise<void>; // one tx, revisioned
  reparentTerm(req: { workspaceId; actorId; termId; newParentId: string | null }): Promise<void>; // one tx, revisioned (added, round-5 audit fold) — the `parentId` hierarchy-validation checks below run inside this call
}
```

**`entry_terms` revisioning — explicit narrowing of ADR-022 §4a (added, round-1 audit fold, 2026-07-14; wording
corrected round 2).** ADR-022 §4a names `entry_terms` explicitly among the mutations requiring a same-transaction
revision under its CI canary. Round-1 audit correctly found that `assignTerms` (adding/removing a term from a
content row) was neither revisioned nor explicitly exempted — a direct, undisclosed conflict with an Accepted
invariant. This ADR now **explicitly narrows ADR-022 §4a for `entry_terms` membership changes only** (not for
`terms`/`taxonomies` themselves, which keep full revisioning via `taxonomy_revisions`): term-assignment membership
is treated as **high-churn relational state whose historical audit trail is judged low-value** — the same basis
`redirect_hits` and `asset_renditions` already use, both disclosed as "deliberately non-revisioned (narrows
ADR-022 INV-3)." **Corrected by round-2 `/audit-work` (Fable): the original justification claimed membership is
"reconstructable from a table scan of `entry_terms` itself" — that only shows *current* membership is queryable,
not that a *removed* assignment is recoverable after the fact, which is what a revision ledger actually provides.
Unlike `redirect_hits` (regenerable from access telemetry) or `asset_renditions` (regenerable from the source
asset), a deleted `entry_terms` row has no upstream source to rebuild from. This ADR now states plainly: a removed
term assignment is NOT independently recoverable, and that is an accepted, disclosed loss of audit granularity —
not a claim that the data is safe because it's reconstructable.** The ADR-022 §4a CI canary must be taught this
exception (an explicit allow-list entry for `entry_terms`, not a silent gap it fails to notice).

Permissions: `admin.taxonomy.manage` (ADR-021 flat-string convention).

## Failure modes

- **Orphaned `entry_terms` on content deletion outside the taxonomy chokepoint.** Mitigation: content
  deletion emits an event the taxonomy library subscribes to for cleanup; orphans are inert on read; a
  periodic/boot reconcile sweeps them — never a brick, at worst a slow leak of dead join rows.
- **Destructive term merge losing history or corrupting counts.** Merge is a single transaction writing a
  `taxonomy_revisions` row capturing the pre-merge term metadata mapping (`fromTermId`→`intoTermId`); the
  `entry_terms_unique` index guarantees dedup when merging terms that already share content; counts are
  always derived from the reverse index, never cached-and-drifted. **Corrected by round-3 `/audit-work`
  (2026-07-14, TM-ADR-CONTENT-ADMIN-005 — Fable, Codex, and agy independently converged on this defect):
  merge is NOT reversible, and the original "(reversible narrative)" claim contradicted this ADR's own
  `entry_terms` non-recoverability disclosure above. When the merge's deduplication step drops an
  `entry_terms` row for content already assigned to both `fromTermId` and `intoTermId`, that dropped
  assignment is permanently lost — `taxonomy_revisions` records what the term metadata mapping was, not
  which individual `entry_terms` rows existed before the merge, so it cannot reconstruct them. This is the
  same accepted, disclosed loss of audit granularity `entry_terms` membership already carries generally;
  merge does not get a special exemption from it. Operators should be warned before merging that assignment
  history for deduplicated rows cannot be recovered.**
- **Hierarchy cycles.** A category set as its own ancestor. Mitigation: the write-service chokepoint
  checks for cycles before accepting a `parentId` update, enforcing a strict DAG.

## Consequences

- Ships independently of, and can land before, ADR-043's Collections engine.
- The soft polymorphic join means no database-enforced referential integrity between `entry_terms` and
  its content — an accepted, precedented tradeoff (see ADR-041), not an oversight.
- `post`/`page`'s taxonomy opt-in is a hardcoded allow-list, permanently for as long as they remain on the
  legacy `posts` table (corrected round-3 `/audit-work` fold — see §4) — a small, disclosed interim step
  pending any future migration ADR, not something ADR-043 shipping changes on its own.

## Round 1 audit fold (2026-07-14), amended by round 2

**Round 2 update:** Fable (in-host, round 2) found the entry_terms revisioning-exemption justification (below)
used a weak analogy — "reconstructable from itself" doesn't actually make a deleted assignment recoverable.
Reworded to state the real basis (accepted loss of audit granularity for high-churn state) plainly.

Audited under `TM-ADR-STORAGE-CONTENT-004` by three independent auditors (Codex gpt-5.6-terra/high, agy/Gemini 3.1
Pro High, Fable/Opus in-host). **Unanimous FAIL — the only one of the four audited ADRs all three auditors failed
independently.** agy and Fable independently found the identical namespace-collision defect by different reasoning
paths; Codex and Fable independently found different-but-related write-chokepoint gaps (workspace-scoping,
revisioning). This is the strongest convergent evidence in the whole audit run.

- **Fixed (this fold):** `entry_terms` writes were neither revisioned nor explicitly exempted from ADR-022 §4a,
  which names `entry_terms` directly — now explicitly narrowed with a stated justification (above), matching the
  `redirect_hits`/`asset_renditions` precedent.
- **Fixed (this fold):** namespace collision with ADR-043's `content_types.key` — resolved by ADR-043's
  reserved-key fix; this ADR's dependency on that fix is now stated explicitly (Wiring section).
- **Fixed (this fold):** no workspace-scoped validation on the term/content join — write chokepoint now required
  to validate same-workspace ownership before writing, with mandatory cross-workspace-rejection contract tests.
- **Fixed (this fold):** `parentId` hierarchy validation only checked cycles — now also requires same-taxonomy and
  hierarchy-mode (`parentId=null` for tags) validation.

## Open Questions

- Whether operator-defined custom taxonomies (beyond the seeded `category`/`tag`) are in scope for v1 or
  a later pass — the schema supports them (any `taxonomies` row), but the admin UI for defining new
  taxonomies (vs. just managing terms within `category`/`tag`) is not scoped here.
- Per-content-type taxonomy limits (e.g., max taxonomies per type) — not addressed.

## Process Note

Converged across all three participants and all three debate rounds — no Coordinator tie-break was
needed for this topic, unlike ADR-043.
