# State Contract Spec: categories-and-tags

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/state.spec.md`

- Spec ID: `SPEC-018`
- Feature: `FEAT-018-categories-and-tags`
- Version: `1.3.0`
- Content Hash: `sha256:0dbe6f8750aed1ea94fe94d4cfde31345207c73591cd4bbe93d52f13f3422f60`
- Last Edited: `2026-07-15T02:00:00Z`

## Purpose

Defines the durable state this domain owns: `taxonomies`, `terms`, `entry_terms`, and
`taxonomy_revisions`, plus the merge-ceremony's confirmation-token state (a thin instantiation of
SPEC-016's generic `ConfirmationToken`, not a redefinition of it).

## 1) State Shape

| Field | Type | Nullable | Initial Value | Description |
|---|---|---|---|---|
| `taxonomy.hierarchical` | `boolean` | no | n/a — set at creation | `true` = category (parentable terms), `false` = tag (flat) |
| `taxonomy.status` | `TaxonomyStatus` | no | `'active'` | Lifecycle state |
| `term.parentId` | `string (ulid)` | yes | `null` | Self-referential parent; always `null` for a flat taxonomy's terms (INV-02) |
| `term.status` | `TermStatus` | no | `'active'` | Lifecycle state |
| `entryTerm.position` | `integer` | no | `0` | Display ordering of a term within one content row's assignment list |
| `taxonomyRevision.op` | `TaxonomyRevisionOp` | no | n/a — set per write | Which mutation produced this ledger row |
| `mergeToken.status` | `TokenStatus` (SPEC-016 shape) | no | n/a — created only on `TERM_MERGE_CONFIRM` success | Reuses SPEC-016's `ConfirmationToken` state shape verbatim for this domain's one gated mutation |

## 2) Entity Contracts
```yaml
TaxonomyStatus: enum[active, deprecated]
TermStatus: enum[active, deprecated]
TaxonomyRevisionOp: enum[create, rename, reparent, merge, deprecate]

Taxonomy:
  id: string (ulid)
  workspaceId: string (ulid)
  key: string
  label: string
  hierarchical: boolean
  status: TaxonomyStatus
  updatedAt: string (date-time)
  version: integer

Term:
  id: string (ulid)
  workspaceId: string (ulid)
  taxonomyId: string (ulid)
  parentId: string (ulid) | null
  slug: string
  label: string
  status: TermStatus
  updatedAt: string (date-time)
  version: integer

EntryTerm:
  workspaceId: string (ulid)
  contentType: string        # "post" | "page" — REQ-06 allow-list; polymorphic per SPEC-016 REQ-18
  contentId: string (ulid)    # soft ref: posts.id today
  termId: string (ulid)
  position: integer
  addedAt: string (date-time)

TaxonomyRevision:
  seq: integer
  taxonomyId: string (ulid)
  perTaxonomySeq: integer
  workspaceId: string (ulid)  # also serves as this row's actorWorkspaceId (REQ-12) — actor and
                                # taxonomy/term always share a workspace in this domain, so no
                                # separate actorWorkspaceId column is needed (Red-Team RT-010)
  stateJson: string           # full pre-operation term/taxonomy state
  actorId: string
  delegatedByWorkspaceId: string | null   # populated only when the writer is a delegated agent
                                            # (kind='agent') or an api_key acting for its owning
                                            # user (kind='api_key') — SPEC-016 REQ-16 /
                                            # ActorIdentityRef shape (REQ-12, Red-Team RT-010)
  delegatedById: string | null             # the agent's delegator, or the api_key's owning user
  pluginId: string | null
  op: TaxonomyRevisionOp
  recordedAt: string (date-time)

# Reused verbatim from SPEC-016 state.spec.md §2 — not redefined here.
MergeConfirmationToken:
  planHash: string
  scopeId: string              # workspaceId, for this domain
  confirmerPrincipalId: string
  status: TokenStatus           # SPEC-016 enum[minted, redeemed, expired]
  createdAt: string (date-time)
  expiresAt: string (date-time)
```

## 3) Action Catalog

| Action | Payload | Precondition | State Changes | Failure Handling |
|---|---|---|---|---|
| `CREATE_TAXONOMY` | `{workspaceId, actorId, key, label, hierarchical}` | `authorize()` passes for `admin.taxonomy.manage` | new `Taxonomy` row; `TaxonomyRevision{op:'create'}` written same transaction (composite actor identity stamped per SPEC-016 REQ-16, REQ-12); watermark stamped, outbox enqueued (REQ-14) | `FORBIDDEN`, `VALIDATION_ERROR` (duplicate `key` in workspace) |
| `DEPRECATE_TAXONOMY` | `{workspaceId, actorId, taxonomyId}` | `authorize()` passes | `taxonomy.status = 'deprecated'`; revisioned (composite actor identity stamped per SPEC-016 REQ-16, REQ-12); watermark stamped, outbox enqueued | `FORBIDDEN`, `TAXONOMY_NOT_FOUND` |
| `CREATE_TERM` | `{workspaceId, actorId, taxonomyId, label, slug?, parentId?}` | `authorize()` passes; if `parentId` given, checked in this order (Red-Team RT-001; `behavior.spec.md` §2.1): taxonomy `hierarchical=true` (REQ-10) first, then same `taxonomyId` (REQ-09) — which requires resolving `parentId` to an existing term first, rejecting with `TERM_NOT_FOUND` if it does not resolve to any term at all, before the same-taxonomy comparison can run (Red-Team RT-012) | new `Term` row; revisioned (composite actor identity stamped per SPEC-016 REQ-16, REQ-12, Red-Team RT-010); watermark stamped, outbox enqueued | `FORBIDDEN`, `TAXONOMY_NOT_FOUND`, `TAXONOMY_NOT_HIERARCHICAL`, `PARENT_CROSS_TAXONOMY`, `TERM_NOT_FOUND` |
| `RENAME_TERM` | `{workspaceId, actorId, termId, label?, slug?}` | `authorize()` passes | `term.label`/`term.slug` updated; revisioned (composite actor identity stamped per SPEC-016 REQ-16, REQ-12) | `FORBIDDEN`, `TERM_NOT_FOUND` |
| `REPARENT_TERM` | `{workspaceId, actorId, termId, newParentId}` | `authorize()` passes; checked in this order (Red-Team RT-001; `behavior.spec.md` §2.1): hierarchical-mode (REQ-10) first, then same-taxonomy (REQ-09) — which requires resolving `newParentId` to an existing term first, rejecting with `TERM_NOT_FOUND` if it does not resolve (Red-Team RT-012), then no-cycle (REQ-11) | `term.parentId = newParentId`; revisioned (composite actor identity stamped per SPEC-016 REQ-16, REQ-12); watermark stamped, outbox enqueued | `FORBIDDEN`, `TERM_NOT_FOUND` (covers either the child `termId` or the candidate `newParentId` failing to resolve — two distinct triggering conditions, both surfaced with the same code), `TAXONOMY_NOT_HIERARCHICAL`, `PARENT_CROSS_TAXONOMY`, `HIERARCHY_CYCLE_DETECTED` |
| `DEPRECATE_TERM` | `{workspaceId, actorId, termId}` | `authorize()` passes | `term.status = 'deprecated'`; revisioned (composite actor identity stamped per SPEC-016 REQ-16, REQ-12); watermark stamped, outbox enqueued | `FORBIDDEN`, `TERM_NOT_FOUND` |
| `ASSIGN_TERMS` | `{workspaceId, actorId, contentType, contentId, termIds}` | `authorize()` passes; workspace match (REQ-07), lens match (REQ-08), taxonomy applicable to `contentType` (REQ-06) all validated per `termId` | new `EntryTerm` row(s); NOT revisioned (REQ-13/INV-05); watermark stamped, outbox enqueued once per call | `FORBIDDEN`, `WORKSPACE_MISMATCH`, `CONTENT_TYPE_MISMATCH`, `TAXONOMY_NOT_APPLICABLE`, `TERM_NOT_FOUND` |
| `UNASSIGN_TERM` | `{workspaceId, actorId, contentType, contentId, termId}` | `authorize()` passes | `EntryTerm` row removed; NOT revisioned; watermark stamped, outbox enqueued | `FORBIDDEN`, `TERM_NOT_FOUND` (no such assignment) |
| `PLAN_MERGE_TERM` | `{workspaceId, actorId, fromTermId, intoTermId}` | caller holds `admin.taxonomy.read`; `fromTermId !== intoTermId` (REQ-15a, checked before any overlap computation) | none — read-only; returns `MergePlanResponse` (REQ-16 disclosure) | `FORBIDDEN`, `TERM_NOT_FOUND`, `SAME_TERM_MERGE` |
| `CONFIRM_MERGE_TERM` | `{planId, planHash}` | caller `kind='user'`; `authorize()` passes for `admin.taxonomy.manage` (SPEC-016 REQ-10) | mints `MergeConfirmationToken{status:'minted'}` | `FORBIDDEN` (includes non-user kind) |
| `EXECUTE_MERGE_TERM` | `{confirmationToken}` | SPEC-016 REQ-11 – REQ-13 checks (fresh `authorize()`, token validity, actor-class rule, plan-hash match) all pass, in the order SPEC-016 REQ-11/REQ-13/`behavior.spec.md` §2.2 define — this domain does not redefine or reorder that sequence, it only instantiates it (see `behavior.spec.md` §2.1) | `fromTerm.status = 'deprecated'`; all `EntryTerm` rows for `fromTermId` re-pointed to `intoTermId` (deduplicating via `entry_terms_unique`); one `TaxonomyRevision{op:'merge'}` row (composite actor identity stamped per SPEC-016 REQ-16, REQ-12 — the same obligation every other action's `TaxonomyRevision` row carries, not a merge-specific mechanism); watermark stamped, outbox enqueued | `FORBIDDEN`, `PLAN_STALE`, `TOKEN_EXPIRED`, `TOKEN_ALREADY_REDEEMED` |
| `RECONCILE_ORPHANED_ENTRY_TERMS` | none | periodic tick or boot | orphaned `EntryTerm` rows (referenced content no longer exists) removed | never fails a read; runs best-effort (REQ-19) |

## 4) Selector Contracts

| Selector | Input | Output | Null/Empty Behavior |
|---|---|---|---|
| `listTermsForContent` | `{workspaceId, contentType, contentId}` | `Term[]` | `[]` if no assignments; orphaned rows never surfaced (they reference deleted content, not missing terms) |
| `listContentForTerm` | `{workspaceId, termId}` | `Array<{contentType, contentId}>` | `[]` if unused; drives REQ-04's reverse lookup via `idx_entry_terms_by_term`; orphaned rows are silently omitted (INV-07) |
| `isTermApplicableToContentType` | `{taxonomyId, contentType}` | `boolean` | `false` for any `contentType` not on the REQ-06 allow-list or (for future Collections keys) not declared in ADR-043's `content_types` registry |
| `computeMergeOverlap` | `{fromTermId, intoTermId}` | `{overlappingContentCount: integer, willLoseAssignmentHistory: boolean}` | `willLoseAssignmentHistory = overlappingContentCount > 0` — feeds REQ-16's disclosure |
| `wouldCreateCycle` | `{termId, candidateParentId}` | `boolean` | `true` if `candidateParentId` is `termId` itself (self-parenting, EC-05a) or any existing descendant of `termId` at any depth (EC-05b) |

## 5) State Invariants
- [x] `term.parentId`, when non-null, always references a term with the same `taxonomyId` (INV-01).
- [x] `term.parentId` is always `null` when the term's taxonomy has `hierarchical = false` (INV-02).
- [x] The term hierarchy under any taxonomy never contains a cycle (INV-03).
- [x] `(workspaceId, contentType, contentId, termId)` never has more than one `EntryTerm` row
      (INV-04, enforced by `entry_terms_unique`).
- [x] No `TaxonomyRevision` row is ever produced by `ASSIGN_TERMS`/`UNASSIGN_TERM` (INV-05).
- [x] `EXECUTE_MERGE_TERM` never runs without a prior successful `CONFIRM_MERGE_TERM` bound to the
      same `planHash` it recomputes (INV-06).
- [x] An orphaned `EntryTerm` row never causes `listContentForTerm`/`listTermsForContent` to fail
      with an error — it is always filtered out (INV-07).

## 6) Acceptance Checklist
- [x] All actions have explicit before/after behavior.
- [x] Selectors are deterministic and side-effect free.
- [x] Entity fields and enums align with `api.spec.md` and `orchestrator.spec.md`.
- [x] `MergeConfirmationToken` reuses SPEC-016's `ConfirmationToken`/`TokenStatus` shape verbatim,
      not a parallel redefinition.
- [x] `TaxonomyRevision` carries SPEC-016 REQ-16's `ActorIdentityRef` shape
      (`delegatedByWorkspaceId`/`delegatedById`, nullable) so an agent/api_key-delegated mutation's
      revision row can be attributed to its delegator/owning user, mirroring
      `SPEC-020-state.spec.md`'s identical fix for `ContentTypeRevision`/`EntryRevision`
      (Red-Team RT-010).
