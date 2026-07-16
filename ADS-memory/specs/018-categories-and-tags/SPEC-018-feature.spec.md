# Feature Spec: categories-and-tags

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-018 |
| version | 1.3.0 |
| status | APPROVED |
| content_hash | sha256:0dbe6f8750aed1ea94fe94d4cfde31345207c73591cd4bbe93d52f13f3422f60 |
| feature_name | FEAT-018-categories-and-tags |
| last_edited | 2026-07-15T02:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (Claude Sonnet 5, delegated subagent run, 2026-07-14) |
| spec_mode | brownfield |
| depends_on | SPEC-016 (content-admin-core-contract) v1.4.0, content_hash sha256:eade503dc1cc72dddad16eb54f3098dada29954493b6d8f964ac51ca0e06194f (bumped during Coordinator Planning Preflight, 2026-07-15; v1.3.0→v1.4.0 only touched REQ-01/EC-01/the Dependencies table/state.spec.md's watermark.value row — none of which this package cites — so no citation re-verification was reopened; hash further updated 2026-07-15T15:35:00Z per audit-work internal verification to reflect SPEC-016's post-renumbering canonical hash — a header-metadata-only correction, not a content re-verification, since renumbering carried no requirement/AC change) |

---

## Revision Note (v1.1.0)

This revision resolves Red-Team findings RT-001 through RT-009
(`ADS-memory/reports/pipeline/018-categories-and-tags/red-team-findings.md`, spec hash
`sha256:a800dda30d1938b0f16629b3f8afc2f6d06242b30a89820f4c8ad5f7f2e6091c`) and re-syncs every
citation in `## Integration Contracts` against SPEC-016 v1.1.0
(`sha256:02382c267da4f022f822d4e571e6c8f32e6fc818771b7bc9e49a6e6683f2ee6d`):

- RT-001 (BLOCKING): the `reparentTerm`/`createTerm` hierarchy-check sub-order is reordered to
  REQ-10 (hierarchical-mode) → REQ-09 (same-taxonomy) → REQ-11 (cycle), resolving the
  `behavior.spec.md` §2.1-vs-§7 contradiction for the compound cross-taxonomy + non-hierarchical
  case. See `behavior.spec.md` §2.1 for the explicit resolution statement.
- RT-002 (BLOCKING): added REQ-15a, AC-22a, EC-06a, INV-08, and the `SAME_TERM_MERGE` error code
  for `mergeTerm`'s `fromTermId === intoTermId` self-merge case.
- RT-003 (BLOCKING): REQ-22 and AC-33 are restated functionally (no agent-callable tool, regardless
  of name, may perform the `confirm()` step) instead of as a name-pattern ban, matching SPEC-016
  REQ-22's actual functional prohibition.
- RT-004 (ADVISORY): OQ-03 marked Resolved.
- RT-005 (ADVISORY): AC-08 restated as a mechanism-level (call-count) assertion.
- RT-006 (ADVISORY): added an explicit Scope statement that `status='deprecated'` is
  display/filtering-only in v1, with no write-time enforcement.
- RT-007 (ADVISORY): added EC-05a (self-parent) and EC-05b (3-node chain) as their own edge cases.
- RT-008 (ADVISORY): EC-09 now commits to the idempotent-no-op-only behavior; the ambiguous
  "or fails with a conflict" branch is removed.
- RT-009 (ADVISORY): added an explicit Out-of-Scope statement that `entryTerm.position` reordering
  is not a v1 capability.
- Re-sync: the `mergeTerm` confirmation-token TTL citation is corrected from SPEC-016's prior
  "~10 minutes" wording to SPEC-016 REQ-10's now-exact "600 seconds (10 minutes)" value, everywhere
  this spec cites it (Integration Contracts, Agent Directives, `behavior.spec.md` §3/§4,
  `api.spec.md`'s `MergeConfirmResponse` comment). All other SPEC-016 citations (REQ-01, REQ-02,
  REQ-08–REQ-14, REQ-16–REQ-18, REQ-22) were re-verified against SPEC-016 v1.1.0's current text and
  remain accurate as previously cited — no other citation had drifted.

## Revision Note (v1.2.0)

This revision resolves Red-Team Round 2 findings RT-010 (BLOCKING) and RT-011/RT-012/RT-013
(ADVISORY)
(`ADS-memory/reports/pipeline/018-categories-and-tags/red-team-findings-round2.md`, spec hash
`sha256:6e959768c9165b5c32c73a286022103ebe6f43a4186d4ded2c323792fe317505`):

- RT-010 (BLOCKING): `state.spec.md`'s `TaxonomyRevision` entity had no field to carry SPEC-016
  REQ-16's composite actor-identity attribution for an agent/api_key-delegated mutation, even
  though every agent-callable taxonomy tool (`api.spec.md` §7) routinely produces exactly that
  case. Added `delegatedByWorkspaceId`/`delegatedById` (nullable) to `TaxonomyRevision`, mirroring
  the identical fix SPEC-020 made this same session for its own `ContentTypeRevision`/
  `EntryRevision` entities (`SPEC-020-state.spec.md` §2, `SPEC-020-feature.spec.md` REQ-08/REQ-16).
  REQ-12 is extended to state the same attribution obligation explicitly (including the assumption
  that this domain's `TaxonomyRevision.workspaceId` column itself serves as `actorWorkspaceId`,
  since actor and taxonomy/term always share a workspace here), a new Integration Contracts row
  cites SPEC-016 REQ-16 directly against REQ-12 (not only the prior contextual REQ-05 grounding),
  and AC-15a/AC-15b demonstrate coverage for the `kind='agent'` and `kind='api_key'` cases
  respectively — closing the previously zero-coverage gap `traceability.spec.md` also had for
  actor-identity stamping.
- RT-011 (ADVISORY): Added AC-12a (REQ-09) and EC-03a covering `createTerm`'s cross-taxonomy
  `parentId` case (REQ-09's own text already named `createTerm`, but no AC/EC had ever instantiated
  it), and added `PARENT_CROSS_TAXONOMY` to `api.spec.md`'s `TERM_CREATE` 400 error mapping, which
  had previously documented only the sibling `TAXONOMY_NOT_HIERARCHICAL` check from the same
  validation chain.
- RT-012 (ADVISORY): REQ-09 now explicitly states that a `parentId`/`newParentId` that does not
  resolve to any existing term is rejected with `TERM_NOT_FOUND`, distinct from
  `PARENT_CROSS_TAXONOMY` (parent exists, wrong taxonomy). Added AC-12b and EC-03b, added
  `TERM_NOT_FOUND` to `state.spec.md`'s `CREATE_TERM` Failure Handling column and
  `api.spec.md`'s `TERM_CREATE` 404 error mapping, and clarified that `REPARENT_TERM`'s existing
  `TERM_NOT_FOUND` code covers both the child `termId` and the `newParentId` lookup, as two
  distinct triggering conditions.
- RT-013 (ADVISORY): Recomputed `spec-dod.md`'s AC/version/timestamp evidence mechanically against
  this file's actual current content (see `spec-dod.md` B-02, B-06, B-21, F-08, G-05) instead of
  carrying forward stale v1.0.0-era values and two internally-contradicting P1 AC counts.

## Revision Note (v1.3.0)

This revision resolves Red-Team Round 3 finding RT-014 (BLOCKING) and RT-015/RT-016/RT-017
(ADVISORY)
(`ADS-memory/reports/pipeline/018-categories-and-tags/red-team-findings-round3.md`, spec hash
`sha256:5191fc93e7714f827be3d2febe5033ddaaa42e910ed803038c47797829ae4ae3`):

- RT-014 (BLOCKING): `state.spec.md`'s `EXECUTE_MERGE_TERM` action's Precondition column
  restated SPEC-016 REQ-11–REQ-13's internal check order as "authorize() → token validity →
  plan-hash match → actor-class rule" — SPEC-016's superseded v1.1.0 order. SPEC-016 v1.2.0
  corrected this order (actor-class rule before plan re-derivation/hash comparison, per its own
  AC-38 and `behavior.spec.md` §2.2) to close a live-state information leak to callers who were
  never authorized to redeem a token. `state.spec.md`'s restatement had drifted out of sync with
  that fix. Corrected the Precondition column to state the checks in the current, correct order
  (authorize() → token validity → actor-class rule → plan-hash match) and added an explicit
  citation to SPEC-016 REQ-11/REQ-13/`behavior.spec.md` §2.2 as the ordering authority, consistent
  with how `behavior.spec.md` §2.1 already defers to that same section instead of restating it.
- RT-015 (ADVISORY): AC-25 (REQ-17) presupposed a concrete `idempotencyKey` request field on
  `renameTerm` that is not defined anywhere in `api.spec.md`'s Request Contracts or
  `state.spec.md`'s Action Catalog, making it untestable as worded. Reworded AC-25 to test only
  the `authorize()`-first ordering property that is concretely observable (rejection before any
  other side effect — no row write, no revision row, no watermark stamp, no outbox enqueue),
  dropping the idempotency-specific framing, and noted explicitly that this domain's ordinary
  mutations do not define an `idempotencyKey` field in v1. `traceability.spec.md`'s AC-25 row
  updated to match.
- RT-016 (ADVISORY): `feature.spec.md`'s `content_hash` correctly read the v1.2.0 canonical hash,
  but all 7 sibling package files' own "Content Hash"/`content_hash` header fields still read the
  stale v1.1.0 hash — the sibling-propagation step was dropped during the 1.1.0→1.2.0 bump. This
  revision propagates the new v1.3.0 canonical hash to every sibling file's header (verified by
  grep across all 8 non-`feature.spec.md` files) and corrects `spec-dod.md` B-02/B-06/F-08's
  evidence cells, which had also gone stale.
- RT-017 (ADVISORY): `feature.spec.md`'s and `spec-manifest.md`'s `depends_on` fields still cited
  SPEC-016 v1.1.0. Updated both to SPEC-016 v1.2.0 (`sha256:a43a9b33d3b37ed1003ba8294cb01b96b8ec4706
  42986d3fa10a407990050981`) — the version this round's mandatory citation re-sync actually
  verified every citation against. Every direct REQ-id/quoted-text citation in this spec's
  Integration Contracts table was independently re-confirmed accurate against SPEC-016 v1.2.0 by
  Red-Team round 3; only the header metadata itself was stale.

---

## Overview

Categories & Tags is Tovu's shared taxonomy system: one write-service and one relational schema
(`taxonomies`/`terms`/`entry_terms`/`taxonomy_revisions`) that implements both hierarchical
categories and flat tags as two configurations of the same primitive, and lets an operator (or an
AI agent acting on their behalf) organize and browse `post`/`page` content by term today, with the
same join mechanism attaching to ADR-043 Collections `entries` later at zero schema cost.

---

## Problem Statement

**Current state:** Tovu has no shared taxonomy system. There is no way to categorize or tag
`posts`/`pages` and no way to browse or filter content by that categorization across content
types. ADR-022 §5 sketched a `taxonomies + terms(parentId) + entry_terms` mechanism, but — like
ADR-022's `entries` table itself — it was never built; all three ADR-044 debate participants
confirmed this directly against the live schema (`src/infra/db/schema.ts`).

**Desired state:** An operator can create/browse a hierarchical `category` taxonomy and a flat
`tag` taxonomy, attach terms to `post`/`page` content, browse "all content tagged X" via an
efficient reverse lookup, and rename/merge/reparent terms without losing referential integrity —
all through real relational tables, never a JSON array on the content row.

**Why now:** ADR-044 is Accepted (2026-07-14, six audit rounds, unanimous final PASS) and is one of
four Accepted ADRs from the same debate/audit cycle whose domain specs are being dispatched
together. Categories & Tags is explicitly designed to ship independently of ADR-043 Collections
(its soft polymorphic reference is what makes that possible) — there is no architectural reason to
wait.

**Success signal:** An operator can assign a term to a post, browse "all posts tagged X" without a
full table scan, and rename/merge a term with the change reflected everywhere that term is
referenced — confirmed by integration test against the `entry_terms` reverse index.

---

## User Journey

1. **Trigger:** An operator wants to organize `post`/`page` content by topic (categories) or
   informal labels (tags), or an AI agent acting on the operator's behalf needs to apply an
   existing term to a piece of content it is drafting/editing.
2. **Steps:**
   1. The operator (or agent, for read-only listing) browses existing taxonomies and terms via
      `GET /api/admin/v1/taxonomy/taxonomies` and `GET /api/admin/v1/taxonomy/taxonomies/{taxonomyId}/terms`.
   2. The operator creates a new term under a taxonomy (e.g. a new category "Recipes" under
      `category`, or a new flat tag "weeknight").
   3. The operator (or an agent with `admin.taxonomy.manage`) assigns one or more terms to a
      `post`/`page` row via the assign-terms endpoint/tool.
   4. Later, the operator renames a term, reparents a category under a different parent category,
      or merges two duplicate terms together — each of which is a single-transaction mutation with
      an append-only `taxonomy_revisions` row.
   5. The operator browses "all content tagged X" via the reverse index.
3. **Outcome:** The term exists, is attached to the intended content, is queryable by reverse
   lookup, and every mutation to the term/taxonomy itself (not the assignment) is durably recorded.
4. **Alternate paths:** If the operator attempts to reparent a term across taxonomies, into a
   cycle, or to give a flat tag a parent, the write is rejected before anything mutates. If the
   operator merges two terms that already overlap on some content, the overlapping content's
   pre-merge dual-assignment is deduplicated and that specific pre-merge row is not recoverable
   afterward — the merge flow (a gated mutation, see Integration Contracts) discloses this before
   the operator confirms.

---

## Scope

**In scope:**
- The `taxonomies`/`terms`/`entry_terms`/`taxonomy_revisions` schema-level contract: the
  `hierarchical` boolean distinguishing category from tag, and the shared write-service governing
  both. (REQ-01 – REQ-02)
- Real relational storage and an efficient reverse-lookup query surface for term membership —
  never a JSON array on the content row. (REQ-03 – REQ-04)
- `entry_terms`'s soft polymorphic `(workspaceId, contentType, contentId)` reference as an instance
  of SPEC-016's general soft cross-boundary reference rule. (REQ-05)
- Per-content-type taxonomy opt-in: a hardcoded, permanent allow-list for `post`/`page`. (REQ-06)
- Write-time workspace-ownership and content-type/lens validation on the term/content join.
  (REQ-07 – REQ-08)
- `parentId` hierarchy validation: same-taxonomy, hierarchical-mode, and cycle checks. (REQ-09 –
  REQ-11)
- The `taxonomy_revisions` append-only ledger for taxonomy/term mutations, and its explicit,
  narrow exemption for `entry_terms` membership changes. (REQ-12 – REQ-13)
- The outbox-enqueue + `storage_write_watermark`-stamping obligation on every mutating taxonomy
  write. (REQ-14)
- `mergeTerm` as this domain's one gated mutation, instantiating SPEC-016's `plan()` → `confirm()`
  → `execute()` gateway, and its plan-time disclosure of irrecoverable pre-merge assignment loss.
  (REQ-15 – REQ-16)
- `mergeTerm`'s rejection of a self-merge (`fromTermId === intoTermId`). (REQ-15a)
- Deprecation semantics for `taxonomy.status`/`term.status`: `'deprecated'` is display/filtering
  guidance only in v1 — no write-time enforcement in this spec blocks `assignTerms`, `createTerm`,
  or `reparentTerm` from targeting a deprecated taxonomy or term. A deprecated taxonomy/term remains
  fully mutable and assignable; a later pass may add write-time enforcement as a new requirement,
  not implied by this one (Red-Team RT-006).
- All other taxonomy/term mutations (create/rename/reparent/deprecate taxonomies and terms,
  assign/unassign terms) as ordinary (non-gated) mutations. (REQ-17)
- Content-deletion-triggered `entry_terms` cleanup, orphan tolerance, and reconciliation sweep.
  (REQ-18 – REQ-19)
- The `admin.taxonomy.read` / `admin.taxonomy.manage` permission pair. (REQ-20)
- Human admin CRUD routes for taxonomies/terms/term-assignment, and the corresponding agent-tool
  catalog. (REQ-21 – REQ-22)

**Out of scope:**
- The Collections content-type registry (`content_types`, `entries`), its reserved-key grammar,
  and its disable→tombstone→cleanup lifecycle — owned by SPEC-020, per ADR-043. This spec only
  depends on ADR-043's reservation of `content_types.key ∈ {'post','page'}` for the
  polymorphic join's injectivity (see Integration Contracts).
- The global `storage_write_watermark` counter mechanics, the sidecar mirror, boot reconciliation,
  the generic `plan()`/`confirm()`/`execute()` gateway internals, the composite actor-identity
  shape, and the `db-ops` port — all owned by SPEC-016 and cited here by REQ/AC id only, never
  restated (this project's Brownfield Rule 3).
- The Storage/Timeline screen and the Backups/Recovery screen — owned by SPEC-017 and SPEC-019
  respectively.
- Operator-defined custom taxonomies beyond the seeded `category`/`tag` (admin UI for defining new
  taxonomy *types*, as opposed to managing terms within the two seeded ones) — ADR-044 itself
  leaves this an Open Question; see OQ-01.
- Per-content-type taxonomy limits (e.g. a maximum number of taxonomies attachable to one content
  type) — ADR-044 does not address this; see OQ-02.
- Any change to `src/features/post/post.ts`'s existing behavior. `posts.kind` is fixed at creation
  with no post↔page conversion path in v1 (confirmed: `UpdatePostInput` has no `kind` field) — this
  spec's write chokepoint reads `posts.kind` for lens validation but never mutates it.
- Deleting or hard-removing a `post`/`page` row. No such delete path exists in the codebase today
  (confirmed: no `deletePost`/`removePost` function exists) — the content-deletion cleanup
  requirement (REQ-18) is a standing obligation for whenever such a path (or ADR-043's `entries`
  tombstone path) is added, not a currently-reachable code path for `post`/`page`.
- Reordering `entryTerm.position` after initial assignment (e.g. a drag-to-reorder admin UI
  interaction or an explicit reorder endpoint/tool). No endpoint, orchestrator action, or UI event
  exists for this in v1 — `position` defaults to `0` for every new assignment
  (`behavior.spec.md` §3) purely as a stable, forward-compatible base value a future pass could
  build reordering on top of; it is not an implied or committed v1 capability (Red-Team RT-009).

---

## Integration Contracts

This spec depends on `SPEC-016` (content-admin-core-contract) for every cross-cutting mechanism it
does not itself own. This spec never redefines these mechanisms — it cites SPEC-016's exact ids and
states which of its own ACs require the citation to be live.

| SPEC-016 id(s) | Mechanism | This spec's dependent requirement(s) | Which of this spec's ACs require it live |
|---|---|---|---|
| SPEC-016 REQ-18 | The general soft cross-boundary reference rule (population-at-write-time, workspace/type validation at write time, orphan tolerance, reconciliation sweep) | REQ-05 (`entry_terms`'s polymorphic reference is a direct instance of this general rule, not a separate pattern), REQ-07, REQ-08, REQ-18, REQ-19 | AC-06, AC-09, AC-10, AC-11, AC-27, AC-28, AC-29 |
| SPEC-016 REQ-16, REQ-17 | The composite `(workspaceId, id)` actor-identity shape and its soft, value-join treatment across a physical boundary — the same generalization REQ-18 also covers, cited here only to make explicit that this spec's polymorphic content reference and SPEC-016's actor-identity reference are the *same* generalized rule, not two coincidentally similar ones | (contextual — grounds REQ-05's "instance, not a separate pattern" framing) | — |
| SPEC-016 REQ-16 | The composite actor-identity **attribution obligation** itself: every ledger/audit/revision row referencing a principal MUST carry `(actorWorkspaceId, actorId)` and, when the actor is a delegated agent (`kind='agent'`) or an api_key acting for its owning user (`kind='api_key'`), MUST additionally carry `(delegatedByWorkspaceId, delegatedById)` per the `ActorIdentityRef` shape (SPEC-016 `state.spec.md` §2) | REQ-12 (every `taxonomy_revisions` row's composite actor-identity stamping, not only the `mergeTerm` ceremony's row) | AC-15a, AC-15b |
| SPEC-016 REQ-01, REQ-02 | The `storage_write_watermark` counter and its same-transaction stamping obligation for any write chokepoint that wants disclosure coverage | REQ-14 (every mutating taxonomy write must call the SPEC-016 stamping function) | AC-19, AC-20 |
| SPEC-016 REQ-08 – REQ-13 | The generic `plan()` → `confirm()` → `execute()` gated-mutation gateway: permission tiers per step, `authorize()` ordering/fail-closed re-evaluation, token minting/TTL/redemption, actor-class redemption rule | REQ-15 (`mergeTerm` instantiates this gateway rather than being a direct single-call mutation) | AC-21, AC-22 |
| SPEC-016 REQ-14 | `authorize()` MUST be evaluated before any idempotency short-circuit at every mutating call site (gated or ordinary) | REQ-17 (this domain's ordinary, non-gated mutations still owe this ordering) | AC-25 |
| SPEC-016 REQ-22 | The agent-tool naming convention (`{domain}_plan_{action}` / `{domain}_execute_{action}` agent-callable) and the **functional** prohibition — not a name-pattern one — on any agent-callable tool, regardless of its name, performing the `confirm()` step | REQ-22 (`taxonomy_plan_merge_term` / `taxonomy_execute_merge_term`; no agent-callable tool of any name may perform `confirmMergeTerm`) | AC-33 |
| SPEC-016 REQ-10 (the exact 600-second/10-minute TTL value) | The fixed confirmation-token TTL this domain's `mergeTerm` ceremony reuses verbatim, not a domain-specific parameter | (contextual — grounds `behavior.spec.md` §3's TTL default row) | AC-22 |

Additional dependency not owned by SPEC-016: this spec's polymorphic join is injective only in
composition with ADR-043's reservation of `content_types.key ∈ {'post','page'}` (see Dependencies
table below) — that reservation is an ADR-043/SPEC-020 commitment, not a SPEC-016 REQ, and is
tracked here for completeness rather than folded into the SPEC-016 citation table above.

---

## Requirements

- REQ-01: The system MUST implement categories and tags as two configurations of one shared
  taxonomy write-service and schema, not as two separate subsystems — governed by a single
  `taxonomies.hierarchical` boolean field.
- REQ-02: When `taxonomies.hierarchical = 1` (category), `terms.parentId` MAY be populated; when
  `taxonomies.hierarchical = 0` (tag), `terms.parentId` MUST always be `null`.
- REQ-03: Term-to-content relationships MUST be stored as rows in a real relational table
  (`entry_terms`), never as a JSON array or delimited string on the content row.
- REQ-04: The system MUST support "list all content assigned term X" as a single indexed
  relational query against `entry_terms`, without scanning every content row.
- REQ-05: `entry_terms` MUST reference content via the soft polymorphic tuple `(workspaceId,
  contentType, contentId)`. This is a direct instance of SPEC-016 REQ-18's general soft
  cross-boundary reference rule (the same generalization that also covers SPEC-016 REQ-16/REQ-17's
  composite actor-identity pattern) — this spec does not define a second, independent
  polymorphic-reference mechanism.
- REQ-06: `post`/`page` taxonomy applicability MUST be determined by a hardcoded allow-list
  maintained inside the taxonomy library, permanently for as long as `post`/`page` remain on the
  legacy `posts` table — never conditioned on whether ADR-043/SPEC-020 has shipped.
- REQ-07: Before writing an `assignTerms`/`unassignTerms` mutation, the write chokepoint MUST
  independently validate that the referenced term's `workspaceId` and the resolved content row's
  own workspace ownership match the caller-supplied `workspaceId`, rejecting the write on any
  mismatch rather than trusting the caller-supplied value alone.
- REQ-08: The write chokepoint MUST additionally validate that the resolved content row's own
  type/lens (`posts.kind` for `contentType ∈ {'post','page'}`) equals the caller-supplied
  `contentType`, rejecting the write on mismatch.
- REQ-09: A `reparentTerm`/term-create `parentId` value MUST be rejected unless the referenced
  parent term belongs to the same `taxonomyId` as the child term. If the supplied `parentId`/
  `newParentId` does not resolve to any existing term at all, the call MUST be rejected with
  `TERM_NOT_FOUND` — a distinct outcome from `PARENT_CROSS_TAXONOMY`, which requires the referenced
  parent term to exist, just in a different taxonomy.
- REQ-10: A `parentId` value MUST be rejected (only `null` is accepted) when the term's taxonomy
  has `hierarchical = 0`.
- REQ-11: A `parentId` update MUST be rejected if applying it would create a cycle in the term
  hierarchy under that taxonomy.
- REQ-12: Every taxonomy/term mutation (`create`, `rename`, `reparent`, `merge`, `deprecate` on
  `taxonomies` or `terms`) MUST write an append-only `taxonomy_revisions` row, in the same
  transaction as the mutation, capturing the pre-operation state. Every `taxonomy_revisions` row
  MUST carry the composite pair `(actorWorkspaceId, actorId)` — for this domain, the row's own
  `workspaceId` column itself serves as `actorWorkspaceId`, since the actor and the taxonomy/term
  being mutated always share a workspace — and, when the mutation was performed by a delegated
  agent (`kind='agent'`) or by an api_key acting for its owning user (`kind='api_key'`), MUST
  additionally carry `(delegatedByWorkspaceId, delegatedById)` identifying the delegator or owning
  user respectively, per SPEC-016 REQ-16's `ActorIdentityRef` shape (SPEC-016 `state.spec.md` §2).
  This obligation applies to every `taxonomy_revisions` row this REQ produces, not only the
  `mergeTerm` ceremony's row.
- REQ-13: `entry_terms` membership changes (`assignTerms`/`unassignTerms`) MUST NOT produce a
  `taxonomy_revisions` row — this is an explicit, disclosed narrowing of ADR-022 §4a's general
  per-entry revisioning rule for `entry_terms` specifically, on the same accepted-audit-granularity
  basis as `redirect_hits`/`asset_renditions`, and MUST be enumerated as an allow-list entry in the
  ADR-022 §4a CI canary rather than left as a silent gap.
- REQ-14: Every mutating taxonomy write (`assignTerms`, `unassignTerms`, `mergeTerm`, `renameTerm`,
  `reparentTerm`, and `taxonomies`/`terms` create/deprecate) MUST call the SPEC-016
  watermark-stamping function (SPEC-016 REQ-01/REQ-02) and enqueue an outbox event, both inside the
  same transaction as its own row write.
- REQ-15: `mergeTerm` MUST be implemented as this domain's gated mutation, instantiating SPEC-016's
  `plan()` → `confirm()` → `execute()` gateway (SPEC-016 REQ-08 – REQ-13, REQ-22) rather than a
  direct single-call mutation, because a merge's `entry_terms` deduplication step is destructive
  and not independently reversible (ADR-044 Failure Modes).
- REQ-15a: `mergeTerm`'s `planMergeTerm()` step MUST reject with `SAME_TERM_MERGE` when
  `fromTermId === intoTermId` (a self-merge attempt), before any overlap computation or plan
  construction runs. Because `confirm()`/`execute()` can only ever act on a plan that `plan()`
  itself produced, no valid confirmation token can exist for a self-merge, so `executeMergeTerm()`
  can never be reached with `fromTermId === intoTermId` through the gateway's normal sequencing.
- REQ-16: `mergeTerm`'s `plan()` step MUST disclose, in its returned plan details, that any content
  currently assigned to both `fromTermId` and `intoTermId` will have its pre-merge duplicate
  `entry_terms` row dropped irrecoverably on `execute()`.
- REQ-17: All taxonomy/term mutations other than `mergeTerm` (create/rename/reparent/deprecate on
  `taxonomies`/`terms`, and `assignTerms`/`unassignTerms`) MUST be ordinary (non-gated) mutations —
  `authorize()` MUST be evaluated before any idempotency short-circuit (SPEC-016 REQ-14), but no
  `plan()`/`confirm()` ceremony is required or offered for them.
- REQ-18: The taxonomy library MUST subscribe to a content-deletion event and, on receipt, clean up
  the deleted content's `entry_terms` rows.
- REQ-19: An `entry_terms` row whose referenced content no longer exists MUST be tolerated as
  inert-on-read (silently omitted by an inner join, per SPEC-016 REQ-18/AC-25) and MUST be removed
  by a periodic or boot-time reconciliation sweep (SPEC-016 AC-26).
- REQ-20: Taxonomy/term mutation (create/rename/reparent/merge/deprecate/assign/unassign) MUST
  require the `admin.taxonomy.manage` permission; read-only listing/browsing of
  taxonomies/terms/assignments MUST require only `admin.taxonomy.read`.
- REQ-21: The system MUST expose human admin CRUD routes under `/api/admin/v1/taxonomy` for
  taxonomies, terms, and term-assignment on `post`/`page` content.
- REQ-22: The agent-tool catalog MUST expose taxonomy/term CRUD and assign/unassign tools; the
  `mergeTerm` gated mutation's tools MUST follow the `taxonomy_plan_merge_term` /
  `taxonomy_execute_merge_term` naming convention (SPEC-016 REQ-22). No agent-callable tool in the
  catalog — regardless of its name — may perform the `confirm()` step for `mergeTerm` (i.e., invoke
  `confirmMergeTerm` or otherwise mint a merge confirmation token). This is a functional
  prohibition, matching SPEC-016 REQ-22's actual wording ("MUST NOT expose any agent-callable tool
  that performs the `confirm()` step"), not merely a ban on one specific tool name — an agent gains
  no lever for the confirm step under any name; only the human-only `TERM_MERGE_CONFIRM` HTTP
  endpoint may invoke it.

---

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Given an operator creates a taxonomy with `key: "category"` and
  `hierarchical: true` and a taxonomy with `key: "tag"` and `hierarchical: false`, when both are
  persisted, then both rows exist in the same `taxonomies` table with no separate category-only or
  tag-only table involved.
- AC-02 (REQ-02) [P1]: Given a term belongs to a taxonomy with `hierarchical = 0`, when a
  `reparentTerm` call attempts to set a non-null `parentId` on that term, then the call is
  rejected.
- AC-03 (REQ-02) [P1]: Given a term belongs to a taxonomy with `hierarchical = 1`, when a
  `reparentTerm` call sets a valid `parentId` within the same taxonomy, then the call succeeds.
- AC-04 (REQ-03) [P1]: Given a `post` row has terms assigned, when the `posts` row itself is
  inspected, then it contains no JSON array or delimited string field representing term
  membership — term membership exists only in `entry_terms` rows.
- AC-05 (REQ-04) [P1]: Given 10,000 `post` rows exist and 5 of them are assigned term X, when "all
  content assigned term X" is queried, then the query plan uses `idx_entry_terms_by_term` and does
  not perform a full scan of the `posts` table.
- AC-06 (REQ-05) [P1]: Given an `entry_terms` row references `contentType: "post"`, when the row is
  inspected for a database-level foreign key to the `posts` table, then none exists — the reference
  is a soft value-join per SPEC-016 REQ-18, validated at write time by this domain's own chokepoint
  (REQ-07/REQ-08).
- AC-07 (REQ-06) [P1]: Given `contentType: "post"` or `contentType: "page"`, when `assignTerms` is
  called for a taxonomy not on the hardcoded allow-list, then the call is rejected.
- AC-08 (REQ-06) [P2]: Given `contentType ∈ {'post','page'}`, when
  `isTermApplicableToContentType` evaluates applicability, then the hardcoded allow-list resolves
  the result without ever querying the `content_types` table — verified by a call-count assertion
  (zero calls) on the `content_types` repository dependency for these two content types, regardless
  of whether ADR-043/SPEC-020's Collections engine has shipped. This is verified by a
  mechanism-level/architectural assertion (Code Review Agent per `traceability.spec.md`), not a
  black-box behavioral comparison against a live `content_types` row, because ADR-043 §4
  permanently reserves `content_types.key ∈ {'post','page'}` — a compliant system can never hold a
  live `content_types` row that could produce a diverging behavioral outcome to compare against.
- AC-09 (REQ-07) [P1]: Given a term belonging to workspace A and a content row belonging to
  workspace B, when `assignTerms` is called with `workspaceId: A`, then the call is rejected
  because the resolved content row's actual workspace does not match.
- AC-10 (REQ-07) [P1]: Given a term and a content row that both genuinely belong to the same
  workspace, when `assignTerms` is called, then the workspace validation passes and the call
  proceeds to the type/lens check (REQ-08).
- AC-11 (REQ-08) [P1]: Given a `posts` row with `kind: "post"`, when `assignTerms` is called with
  `contentType: "page"` and that row's id, then the call is rejected because the resolved row's own
  lens (`post`) does not match the supplied `contentType` (`page`).
- AC-12 (REQ-09) [P1]: Given a term in a *hierarchical* taxonomy A and a candidate parent term in a
  different taxonomy B, when `reparentTerm` is called to set the candidate as parent, then the call
  is rejected with `PARENT_CROSS_TAXONOMY`. (Taxonomy A is hierarchical here so that the REQ-10
  hierarchical-mode check, which runs first per `behavior.spec.md` §2.1, passes and this
  cross-taxonomy check is the one that actually fires — see AC-13 for the case where A is flat.)
- AC-12a (REQ-09) [P1]: Given a candidate parent term exists in taxonomy B, different from target
  hierarchical taxonomy A, when `createTerm` is called under taxonomy A with that candidate's id as
  `parentId`, then the call is rejected with `PARENT_CROSS_TAXONOMY` — the same rule AC-12
  demonstrates for `reparentTerm` applies identically to `createTerm`, since REQ-09's own text
  names both mutation types (Red-Team RT-011).
- AC-12b (REQ-09) [P1]: Given a `parentId`/`newParentId` value that does not resolve to any
  existing term (regardless of taxonomy), when `createTerm` or `reparentTerm` is called with that
  value, then the call is rejected with `TERM_NOT_FOUND` — distinct from the `PARENT_CROSS_TAXONOMY`
  case in AC-12/AC-12a, where the referenced parent term exists but belongs to a different taxonomy
  (Red-Team RT-012).
- AC-13 (REQ-10) [P1]: Given a taxonomy with `hierarchical = 0`, when `createTerm` (or
  `reparentTerm`) is called with a non-null `parentId`, then the call is rejected with
  `TAXONOMY_NOT_HIERARCHICAL` — this holds even in the compound case where the supplied `parentId`
  also resolves to a term in a *different* taxonomy than the child term's own, because REQ-10's
  hierarchical-mode check runs before REQ-09's same-taxonomy check (`behavior.spec.md` §2.1) and
  therefore always fires first, regardless of what the caller supplied as the candidate parent.
- AC-14 (REQ-11) [P1]: Given term A is the parent of term B, when `reparentTerm` attempts to set
  term B as the parent of term A, then the call is rejected because it would create a cycle.
- AC-15 (REQ-12) [P1]: Given `renameTerm` is called and succeeds, when the transaction commits,
  then a `taxonomy_revisions` row exists capturing the term's pre-rename `label`/`slug`.
- AC-15a (REQ-12) [P1]: Given a `taxonomy_revisions` row is appended for a mutation performed by a
  `kind='agent'` principal delegated by another principal, when the row is inspected, then it
  carries `(delegatedByWorkspaceId, delegatedById)` identifying the delegator, per SPEC-016
  REQ-16's `ActorIdentityRef` shape — mirroring `SPEC-020-feature.spec.md` AC-47's identical
  pattern for `ContentTypeRevision` (Red-Team RT-010).
- AC-15b (REQ-12) [P1]: Given a `taxonomy_revisions` row is appended for a mutation performed by a
  `kind='api_key'` principal acting for its owning user, when the row is inspected, then it carries
  `(delegatedByWorkspaceId, delegatedById)` identifying the owning user, per SPEC-016 REQ-16's
  `ActorIdentityRef` shape — mirroring `SPEC-020-feature.spec.md` AC-48's identical pattern for
  `EntryRevision` (Red-Team RT-010).
- AC-16 (REQ-12) [P1]: Given `mergeTerm`'s `execute()` step succeeds, when the transaction commits,
  then a `taxonomy_revisions` row exists with `op: "merge"` capturing the pre-merge
  `fromTermId`→`intoTermId` metadata mapping.
- AC-17 (REQ-13) [P1]: Given `assignTerms` succeeds, when `taxonomy_revisions` is queried for that
  transaction, then no row was written for the assignment itself.
- AC-18 (REQ-13) [P2]: Given the ADR-022 §4a CI canary runs against a commit that touches
  `entry_terms`, when it evaluates whether the touched table is exempted, then it finds
  `entry_terms` present in its allow-list rather than flagging an unrecognized un-revisioned write.
- AC-19 (REQ-14) [P1]: Given `renameTerm` commits successfully, when the transaction is inspected,
  then it also called the watermark-stamping function exactly once and enqueued exactly one outbox
  event.
- AC-20 (REQ-14) [P1]: Given `assignTerms` commits successfully, when the transaction is inspected,
  then it also called the watermark-stamping function exactly once and enqueued exactly one outbox
  event.
- AC-21 (REQ-15) [P1]: Given a caller attempts to call a direct single-call `mergeTerm` mutation
  endpoint that skips `plan()`/`confirm()`, when the attempt is made, then it fails because no such
  direct entry point exists (mirrors SPEC-016 AC-09 for this domain's one gated mutation).
- AC-22 (REQ-15) [P1]: Given a `plan()`/`confirm()` pair has completed for a `mergeTerm` operation,
  when `execute({confirmationToken})` is called, then the merge runs exactly once, subject to
  SPEC-016's `PLAN_STALE`/`TOKEN_EXPIRED`/`TOKEN_ALREADY_REDEEMED`/`FORBIDDEN` rejections (SPEC-016
  REQ-11 – REQ-13).
- AC-22a (REQ-15a) [P1]: Given `fromTermId === intoTermId`, when `planMergeTerm` is called, then
  the call is rejected with `SAME_TERM_MERGE` before any overlap count is computed, and no
  `MergePlanResponse` is returned.
- AC-23 (REQ-16) [P1]: Given `fromTermId` and `intoTermId` both currently have content in common,
  when `mergeTerm`'s `plan()` is called, then the returned plan's `details` payload names that
  overlapping content will lose its pre-merge duplicate assignment irrecoverably.
- AC-24 (REQ-16) [P2]: Given `fromTermId` and `intoTermId` have no content in common, when
  `mergeTerm`'s `plan()` is called, then the returned plan's `details` payload states that no
  content will lose an assignment.
- AC-25 (REQ-17) [P1]: Given a `kind='user'` principal without `admin.taxonomy.manage` calls
  `renameTerm`, when `authorize()` is evaluated, then the call is rejected before any other side
  effect (no `term` row write, no `TaxonomyRevision` row, no watermark stamp, no outbox enqueue)
  occurs. (This domain's ordinary mutations do not define an `idempotencyKey` request field in
  v1 — see `api.spec.md` §4's Request Contracts — so this AC tests only the `authorize()`-first
  ordering property that is concretely observable here, not an idempotency-key short-circuit.)
- AC-26 (REQ-17) [P2]: Given `createTaxonomy` is called, when it succeeds, then no confirmation
  token or `plan()` step was required or produced.
- AC-27 (REQ-18) [P1]: Given a content-deletion event is published for a `post` id that has
  assigned terms, when the taxonomy library's subscriber processes the event, then the associated
  `entry_terms` rows for that `(workspaceId, contentType, contentId)` are removed.
- AC-28 (REQ-19) [P1]: Given an `entry_terms` row's referenced content was deleted through a path
  that did not emit the cleanup event, when "all content assigned term X" is queried via an inner
  join, then that orphaned row is silently omitted from the result set, not surfaced as an error.
- AC-29 (REQ-19) [P1]: Given orphaned `entry_terms` rows exist, when the next periodic or
  boot-time reconciliation sweep runs, then those rows are removed.
- AC-30 (REQ-20) [P1]: Given a `kind='user'` principal holding only `admin.taxonomy.read`, when it
  calls `renameTerm`, then the call is rejected with `FORBIDDEN`.
- AC-31 (REQ-20) [P1]: Given a `kind='user'`/`kind='agent'`/`kind='api_key'` principal each holding
  only `admin.taxonomy.read`, when each lists taxonomies, then all three calls succeed identically.
- AC-32 (REQ-21) [P1]: Given the admin route registry is inspected, when routes under
  `/api/admin/v1/taxonomy` are enumerated, then CRUD routes exist for taxonomies, terms, and
  term-assignment (see `api.spec.md`).
- AC-33 (REQ-22) [P1]: Given every tool definition in the agent-tool catalog is inspected by the
  orchestrator action it maps to (not by its name), when the mapped actions are checked, then
  `taxonomy_plan_merge_term` (mapping to `planMergeTerm`) and `taxonomy_execute_merge_term`
  (mapping to `executeMergeTerm`) are both present and agent-callable, and no tool in the catalog —
  under any name — maps to or otherwise invokes `confirmMergeTerm`. This is verified by a
  mechanism-level check of each tool's mapped orchestrator action (per `traceability.spec.md`),
  not by a name-pattern check (e.g. matching `taxonomy_confirm_*`) alone — a tool named e.g.
  `taxonomy_finalize_merge_step2` that internally invokes `confirmMergeTerm` fails this AC exactly
  as a literally-named `taxonomy_confirm_merge_term` tool would.

---

## Invariants

- INV-01: A term's `parentId`, when non-null, must always reference a term belonging to the same
  `taxonomyId` as the child term.
- INV-02: A term's `parentId` must always be `null` when that term's taxonomy has
  `hierarchical = 0`.
- INV-03: The term hierarchy under any single taxonomy must never contain a cycle.
- INV-04: The tuple `(workspaceId, contentType, contentId, termId)` in `entry_terms` must never
  have more than one row (enforced by `entry_terms_unique`).
- INV-05: A `taxonomy_revisions` row must never be produced for an `assignTerms`/`unassignTerms`
  membership change — only for a `taxonomies`/`terms` mutation itself (REQ-13).
- INV-06: `mergeTerm` must never execute without a prior successful `confirm()` bound to the same
  `planHash` that `execute()` recomputes (SPEC-016 INV-03/INV-05 applied to this domain's one
  gated mutation).
- INV-07: An orphaned `entry_terms` row must never cause a read to fail with an error — it is
  always filtered out of the result set (SPEC-016 INV-07 instance).
- INV-08: `mergeTerm` must never execute (via `executeMergeTerm`) with `fromTermId === intoTermId`
  — `planMergeTerm` rejects this case before any plan is ever produced (REQ-15a), so no valid plan
  or confirmation token for a self-merge can ever exist to reach `execute()` with.

---

## Edge Cases

- EC-01: What happens when `assignTerms` is called with a `termId` belonging to a different
  workspace than the resolved content row?
  Expected behavior: rejected at the write chokepoint before any row is written (REQ-07, AC-09).
- EC-02: What happens when `assignTerms` is called with `contentType: "page"` but the resolved
  `posts` row's actual `kind` is `"post"`?
  Expected behavior: rejected at the write chokepoint (REQ-08, AC-11).
- EC-03: What happens when `reparentTerm` is called with a `newParentId` belonging to a different
  `taxonomyId`, on a term whose own taxonomy is hierarchical?
  Expected behavior: rejected with `PARENT_CROSS_TAXONOMY` (REQ-09, AC-12). This scenario assumes
  the term's own taxonomy is hierarchical — if it is not, REQ-10's hierarchical-mode check fires
  first and unconditionally instead (see EC-04), because REQ-10 is checked before REQ-09
  (`behavior.spec.md` §2.1).
- EC-03a: What happens when `createTerm` is called under a hierarchical target taxonomy with a
  `parentId` belonging to a different `taxonomyId`?
  Expected behavior: rejected with `PARENT_CROSS_TAXONOMY` (REQ-09, AC-12a) — identical to EC-03's
  `reparentTerm` outcome, since REQ-09's own text covers both mutation types (Red-Team RT-011).
- EC-03b: What happens when a `parentId`/`newParentId` supplied to `createTerm` or `reparentTerm`
  does not resolve to any existing term at all?
  Expected behavior: rejected with `TERM_NOT_FOUND` (REQ-09, AC-12b) — distinct from EC-03/EC-03a
  (parent term exists, but in the wrong taxonomy) and EC-05/EC-05a/EC-05b (parent term exists and
  would create a cycle). This is checked as part of resolving the candidate parent for the
  same-taxonomy check, before that check itself can run (Red-Team RT-012).
- EC-04: What happens when `reparentTerm`/`createTerm` is called with a non-null `parentId` on a
  taxonomy whose `hierarchical = 0`?
  Expected behavior: rejected with `TAXONOMY_NOT_HIERARCHICAL` (REQ-10, AC-13) — **unconditionally**,
  regardless of which taxonomy the supplied `parentId` itself resolves to (including the compound
  case where it also belongs to a different taxonomy than the child term's own). Resolution of
  Red-Team RT-001: REQ-10's hierarchical-mode check is fixed to run *before* REQ-09's same-taxonomy
  check (`behavior.spec.md` §2.1) precisely so that this edge case's claim holds unconditionally,
  with no carve-out needed for the cross-taxonomy compound case.
- EC-05: What happens when `reparentTerm` would create an ancestor cycle?
  Expected behavior: rejected before any write (REQ-11, AC-14).
- EC-05a: What happens when `reparentTerm` is called with `newParentId` equal to the term's own id
  (self-parenting)?
  Expected behavior: rejected with `HIERARCHY_CYCLE_DETECTED` before any write — `wouldCreateCycle`
  (`state.spec.md` §4) returns `true` when `candidateParentId` is the term's own id, the minimal
  degenerate case of the same cycle rule that governs EC-05 (REQ-11).
- EC-05b: What happens when `reparentTerm` would create a 3+-node ancestor cycle (e.g. term A is
  term B's parent, term B is term C's parent, and term C is reparented to be term A's parent)?
  Expected behavior: rejected with `HIERARCHY_CYCLE_DETECTED` — `wouldCreateCycle`'s recursive
  descendant walk (`state.spec.md` §4) detects a cycle at any depth, not only the minimal two-node
  case (REQ-11).
- EC-06: What happens when `mergeTerm` deduplicates an `entry_terms` row for content already
  assigned to both `fromTermId` and `intoTermId`?
  Expected behavior: the duplicate is dropped by the `entry_terms_unique` index during the merge
  transaction; that specific pre-merge row for `fromTermId` is not recoverable afterward —
  `taxonomy_revisions` records the term-metadata mapping, not the individual dropped `entry_terms`
  row (matches ADR-044's disclosed, accepted loss of audit granularity).
- EC-06a: What happens when `mergeTerm`'s `planMergeTerm`/`executeMergeTerm` is called with
  `fromTermId === intoTermId` (a self-merge)?
  Expected behavior: `planMergeTerm` rejects with `SAME_TERM_MERGE` before any overlap computation
  runs; no plan is produced and `executeMergeTerm` can never be reached for this case, since it can
  only redeem a token bound to a plan that was never minted (REQ-15a, AC-22a, INV-08).
- EC-07: What happens when a content row referenced by `entry_terms` is deleted through a path that
  does not emit the cleanup event (e.g. a future direct-repo deletion bypassing the taxonomy
  subscriber)?
  Expected behavior: the orphaned rows are inert on read (silently omitted, never an error) and
  removed at the next periodic/boot reconciliation sweep (REQ-19, AC-28, AC-29).
- EC-08: What happens when `assignTerms` is called for a taxonomy that is not on the `post`/`page`
  hardcoded allow-list?
  Expected behavior: rejected (REQ-06, AC-07).
- EC-09: What happens when two concurrent `assignTerms` calls attempt to add the same term to the
  same content simultaneously?
  Expected behavior: the `entry_terms_unique` index prevents a duplicate row; the write is an
  upsert/ignore-on-conflict operation, so **both** concurrent calls complete as idempotent no-ops
  with a success response — final state has exactly one row, and neither caller ever receives a
  conflict/error response for this scenario (per the underlying single-writer transaction model;
  mirrors SPEC-016 EC-01's serialization guarantee). Resolution of Red-Team RT-008: the
  previously-stated "or fails with a conflict that the caller may safely ignore" branch is dropped
  — this domain commits to the idempotent-no-op behavior only, since `entry_terms_unique` plus an
  upsert/ignore-on-conflict write makes a genuine conflict response unreachable for this case.

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| SPEC-016 (content-admin-core-contract) | The `storage_write_watermark` stamping function, the generic `plan()`/`confirm()`/`execute()` gated-mutation gateway, `authorize()`'s call-ordering contract, and the general soft cross-boundary reference rule this spec's `entry_terms` reference instantiates | If SPEC-016's contract is unavailable or its gateway is not implemented, `mergeTerm` cannot be offered as a gated mutation and no taxonomy write can be watermark-disclosure-covered | None — this domain has no independent watermark/gateway implementation; it is fully dependent on SPEC-016's contract being realized |
| ADR-043 (Collections) `content_types` reserved-key guarantee | The guarantee that `content_types.key` can never equal `'post'`/`'page'`, which is what keeps this spec's `(workspaceId, contentType, contentId)` join injective once Collections ships | If ADR-043 ships without this reservation, `contentType='post'` becomes ambiguous between a `posts` row and a Collections `entries` row | None — this spec's join is not injective on its own; it depends on ADR-043 §4's reservation holding, even if the two ship independently in time |
| ADR-021 (identity & authorization) | `authorize()` semantics, the `admin.taxonomy.*` flat-string permission convention, and principal-kind rules | If `authorize()` is unavailable, no taxonomy mutation can be evaluated | None — fail-closed; the mutation is denied, never allowed by default |
| ADR-022 (append-only revisions / write-chokepoint discipline) | The general per-entry revisioning precedent this spec's `taxonomy_revisions` ledger follows, and the CI canary this spec's `entry_terms` exemption must be registered against | If the CI canary is not taught the `entry_terms` exemption, a legitimate un-revisioned `entry_terms` write may be incorrectly flagged as a violation | None — the exemption must be an explicit allow-list entry (REQ-13), not silently tolerated |
| `src/features/post/` (existing `posts` table and write path) | The `posts.kind` column this spec's lens-validation check (REQ-08) reads, and the only content type this spec ships against today | If `posts.kind` semantics change (e.g. a future post↔page conversion path is added), the lens-validation check's assumption that `kind` is fixed at creation would need revisiting | None — this spec's Out of Scope explicitly excludes changing `post.ts`'s existing behavior; a future change is that future spec's responsibility |

---

## Open Questions

- OQ-01: Whether operator-defined custom taxonomies (beyond the seeded `category`/`tag`) are in
  scope for the v1 admin UI, or a later pass — the schema supports them (any `taxonomies` row can
  be created), but ADR-044 itself leaves the admin UI for defining new taxonomy *types* (as opposed
  to managing terms within the two seeded ones) as an open question. — Owner: Software Architect
  for SPEC-018 — Resolve by: before SPEC-018's architecture sign-off.
- OQ-02: Whether a per-content-type limit on the number of taxonomies attachable to one content
  type is needed — ADR-044 does not address this. — Owner: Software Architect for SPEC-018 —
  Resolve by: before SPEC-018's architecture sign-off.
- OQ-03: **Resolved 2026-07-14 (Red-Team RT-004 fold-back).** `mergeTerm`'s plan-time disclosure
  (REQ-16) states only a count (`overlappingContentCount`) and a boolean
  (`willLoseAssignmentHistory`), not an enumerated list of the specific overlapping content items —
  this is the shape already committed in `api.spec.md`'s `MergePlanResponse.details` and
  `ui.spec.md`'s `MergeTermDialog.overlapDisclosure`, both `PRESENT` and complete in this same
  package. A richer enumerated-items disclosure was considered but is not adopted for v1; if a
  future pass wants to enumerate specific items, that is a new capability requiring its own new
  REQ/AC and typed contract fields, not a reinterpretation of this one. (Mirrors SPEC-016 OQ-04's
  resolved-with-reasoning-trail format.)

---

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | N/A | `ADS-memory/governance/constitution.md` Article I is an unfilled template placeholder (literal `[PRINCIPLE NAME]` text, no ratified project-specific principle) — there is no concrete compliance target to check this spec against. |
| II — Test-First | N/A | Same template-placeholder state as Article I — no ratified principle text exists in the constitution file to evaluate compliance against. |
| III — Simplicity Gate | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against; this spec's own scope discipline (see Scope, Out of scope) is documented independently of any constitution article. |
| IV — Anti-Abstraction Gate | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against. |
| V — Integration-First Testing | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against. |
| VI — Security-by-Default | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against; this spec's own workspace/lens validation and permission requirements (REQ-07, REQ-08, REQ-20) stand on ADR-007/ADR-021's decisions, not on a constitution article. |
| VII — Spec Integrity | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against; this spec still carries its own `spec_id`/`content_hash` discipline per the Speckit compatibility contract regardless. |
| VIII — Observability | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against; this spec's error envelope (see `errors.spec.md`) still carries `correlationId` regardless. |

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique (verified: `ADS-memory/specs/004-*` and `ADS-memory/reports/pipeline/004-*` were confirmed absent before this run)
- [x] version set to correct semver
- [x] status set to APPROVED (not DRAFT or REVIEW)
- [x] content_hash computed using the Speckit canonical hash rule and verified by the provider-local validator
- [x] feature_name matches the FEAT folder name exactly
- [x] Zero `[NEEDS CLARIFICATION]` markers remain in this file
- [x] All Open Questions have an owner and a resolution target date
- [x] All REQ-* items are testable and contain no vague qualifiers
- [x] All REQ-* items have at least one AC
- [x] All AC items have a [P1], [P2], or [P3] priority tag
- [x] All AC items follow Given/When/Then format
- [x] All Invariants are written as absolute, falsifiable statements
- [x] All Edge Cases have an explicit Expected Behavior
- [x] Dependencies table is complete — no blank failure mode or fallback cells
- [x] Constitution Compliance table complete — all 8 articles marked COMPLIES / EXCEPTION / N/A
- [x] Scope: in-scope list present and non-empty
- [x] Problem Statement: "Why now" field is filled (even if answer is "no deadline")
- [x] User Journey: trigger, steps, outcome, and alternate paths are present
- [x] Scope: out-of-scope list present and non-empty
- [x] Full spec-system package present: all `PRESENT` files listed in spec-manifest.md exist
- [x] behavior.spec.md complete (this feature has real precedence/ordering/default rules — see Scope)
- [x] traceability.spec.md complete (marked "pending implementation" — no code has been written yet)
- [x] spec-manifest.md complete — all 10 logical files listed with `PRESENT` or `OMITTED` and concrete reasons
- [x] spec-dod.md filled and all items PASS or NA with concrete justification
- [x] spec-dod.md Spec Agent sign-off row completed; Coordinator row is reserved for Coordinator Planning Preflight before `/plan`
- [x] `spec_mode` is `brownfield` — brownfield evidence paths are recorded in `spec-manifest.md`

**Gate result:** PASS

---

## Agent Directives

Always:
- Every requirement referencing `authorize()` calls the existing function contract defined by
  ADR-021 §2, the same one SPEC-016 REQ-14/REQ-15 cite — do not introduce a second authorization
  evaluator for taxonomy.
- Validate workspace ownership (REQ-07) before content-type/lens (REQ-08) before any
  taxonomy-hierarchy check (REQ-09 – REQ-11) — this ordering is fixed in `behavior.spec.md` §2.

Ask before:
- Deciding whether `mergeTerm`'s TTL or token shape may differ from SPEC-016 REQ-10's stated exact
  600-second (10-minute) default — this is a stated SPEC-016/ADR-041 value, not a free
  implementation parameter for this domain to vary.
- Introducing an admin UI for defining new taxonomy *types* beyond `category`/`tag` — OQ-01 is
  unresolved; do not assume it is in scope for v1 without a human decision.

Never:
- Store term-to-content membership as a JSON array or delimited string on the content row (REQ-03)
  — this is the exact postmeta-shaped trap ADR-022 exists to avoid.
- Give `mergeTerm` a direct single-call entry point that skips `plan()`/`confirm()` (REQ-15,
  AC-21) — this collapses the one safety property this domain's gated mutation exists to provide.
- Allow `planMergeTerm`/`executeMergeTerm` to proceed when `fromTermId === intoTermId` (REQ-15a) —
  this is a validation rejection (`SAME_TERM_MERGE`), not a degenerate no-op merge.
- Expose any agent-callable tool — regardless of its name — that maps to or otherwise performs
  `confirmMergeTerm`'s token-minting step (REQ-22) — confirm is human-only with no exception, per
  SPEC-016 REQ-10/REQ-22/ADR-041 §6. This is a functional prohibition: renaming the tool away from
  `taxonomy_confirm_*` does not satisfy it.
