# Orchestrator Contract Spec: categories-and-tags

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/orchestrator.spec.md`

- Spec ID: `SPEC-018`
- Feature: `FEAT-018-categories-and-tags`
- Version: `1.3.0`
- Content Hash: `sha256:0dbe6f8750aed1ea94fe94d4cfde31345207c73591cd4bbe93d52f13f3422f60`
- Last Edited: `2026-07-15T02:00:00Z`

## Purpose

Defines the `TaxonomyWriteService` orchestrator: the single write chokepoint for every taxonomy
mutation. It sequences the validation chain shared by all mutations (`authorize()` →
workspace/lens checks where applicable → hierarchy checks where applicable → watermark stamp +
outbox enqueue), and for `mergeTerm` specifically, instantiates SPEC-016's generic
`GatedMutationGateway` (`orchestrator.spec.md` in SPEC-016) rather than redefining a second gateway.

Every action that produces a `taxonomy_revisions` row — ordinary mutations and the `mergeTerm`
gateway's `executeMergeTerm` step alike — stamps SPEC-016 REQ-16's composite actor-identity shape
onto that row (`state.spec.md` §2's `TaxonomyRevision.delegatedByWorkspaceId`/`delegatedById`, per
REQ-12). This is a single, uniform obligation, not a mechanism unique to the merge ceremony
(Red-Team RT-010).

## 1) Orchestrator Identity
- Name: `TaxonomyWriteService`
- Responsibility: the single write chokepoint (ADR-044 Wiring section) for
  `taxonomies`/`terms`/`entry_terms` mutations. Delegates its one destructive operation
  (`mergeTerm`) to an instantiation of SPEC-016's `GatedMutationGateway` with `domain:
  "taxonomy.merge"`; every other mutation is an ordinary, directly-executed action of this
  orchestrator (REQ-17).

## 2) Input Contract

| Input | Required | Type | Default | Validation/Bounds | Notes |
|---|---|---|---|---|---|
| `workspaceId` | yes | `string (ulid)` | none | must resolve to a real workspace | Present on every action (ADR-007) |
| `actorId` | yes | `string (ulid)` | none | must resolve to a `principals` row | Stamped onto the `taxonomy_revisions` row when applicable (REQ-12) |
| `principalKind` | yes | `enum[user, agent, api_key]` | none | n/a | Drives `CONFIRM_MERGE_TERM`'s `user`-only restriction and `EXECUTE_MERGE_TERM`'s actor-class rule |
| `taxonomyId` / `termId` | conditional | `string (ulid)` | none | must exist and belong to `workspaceId` | Required by every term-scoped or taxonomy-scoped action |
| `contentType` | conditional | `enum[post, page]` | none | REQ-06 hardcoded allow-list | Required by `ASSIGN_TERMS`/`UNASSIGN_TERM`/`listTermsForContent` |
| `contentId` | conditional | `string (ulid)` | none | must resolve to a row whose own `kind` matches `contentType` (REQ-08) | Required alongside `contentType` |
| `parentId` / `newParentId` | conditional | `string (ulid) \| null` | `null` | REQ-09/REQ-10/REQ-11 all apply | Required by `CREATE_TERM` (optional) and `REPARENT_TERM` (required, nullable) |
| `fromTermId` / `intoTermId` | conditional | `string (ulid)` | none | must both exist, same `workspaceId` | Required by `PLAN_MERGE_TERM` |
| `planId` / `planHash` | conditional | `string` | none | required for `CONFIRM_MERGE_TERM` | Bound into the minted token, per SPEC-016 REQ-10 |
| `confirmationToken` | conditional | `string` | none | required for `EXECUTE_MERGE_TERM` | Opaque, single-use, per SPEC-016 state.spec.md |

## 3) Output State Contract

| Field | Type | Nullability | Source | Notes |
|---|---|---|---|---|
| `taxonomy` / `term` | `Taxonomy \| Term` | nullable | derived (from a `CREATE_*`/`RENAME_TERM`/`REPARENT_TERM`/`DEPRECATE_*` action) | see `state.spec.md` |
| `assignResult` | `AssignResult` | nullable | derived (from `ASSIGN_TERMS`) | see `api.spec.md` |
| `mergePlan` | `MergePlanResponse` | nullable | derived (from `PLAN_MERGE_TERM`) | domain-specific `details` payload instantiating SPEC-016's generic `GatewayPlan.details` |
| `mergeConfirmationToken` | `MergeConfirmationToken` | nullable | derived (from `CONFIRM_MERGE_TERM`) | never returned from `PLAN_MERGE_TERM` |
| `mergeExecutionResult` | `MergeExecuteResponse` | nullable | derived (from `EXECUTE_MERGE_TERM`) | see `api.spec.md` |
| `lastError` | `TaxonomyError` | nullable | derived | domain codes (`errors.spec.md`) plus SPEC-016's reused gateway codes for the merge ceremony |
| `isMergeInFlight` | `boolean` | non-null | derived | `true` from a successful `CONFIRM_MERGE_TERM` until `EXECUTE_MERGE_TERM` resolves (mirrors SPEC-016 `isGatedOperationInFlight`) |

## 4) Action Contracts

| Action | Inputs | Returns | Side Effects | Failure Codes |
|---|---|---|---|---|
| `createTaxonomy` / `deprecateTaxonomy` | `{workspaceId, actorId, ...}` | `Result<Taxonomy>` | writes row + `taxonomy_revisions` row (composite actor identity stamped per SPEC-016 REQ-16, REQ-12) + watermark stamp + outbox enqueue, one transaction | `FORBIDDEN, VALIDATION_ERROR, TAXONOMY_NOT_FOUND` |
| `createTerm` / `renameTerm` / `reparentTerm` / `deprecateTerm` | `{workspaceId, actorId, termId or taxonomyId, ...}` | `Result<Term>` | same transactional shape as above, including composite actor-identity stamping on the `taxonomy_revisions` row (SPEC-016 REQ-16, REQ-12); `reparentTerm`/`createTerm` additionally run hierarchy checks before writing, in the fixed sub-order hierarchical-mode (REQ-10) → same-taxonomy (REQ-09, which first resolves `parentId`/`newParentId` and rejects with `TERM_NOT_FOUND` if it does not resolve to any term — Red-Team RT-012) → cycle (REQ-11) (Red-Team RT-001; `behavior.spec.md` §2.1) | `FORBIDDEN, TERM_NOT_FOUND, TAXONOMY_NOT_FOUND, TAXONOMY_NOT_HIERARCHICAL, PARENT_CROSS_TAXONOMY, HIERARCHY_CYCLE_DETECTED` |
| `assignTerms` / `unassignTerm` | `{workspaceId, actorId, contentType, contentId, termIds or termId}` | `Result<AssignResult>` | writes/removes `entry_terms` row(s) (no `taxonomy_revisions` row, REQ-13); watermark stamp + outbox enqueue, one transaction per call | `FORBIDDEN, WORKSPACE_MISMATCH, CONTENT_TYPE_MISMATCH, TAXONOMY_NOT_APPLICABLE, TERM_NOT_FOUND` |
| `planMergeTerm` | `{workspaceId, principalId, principalKind, fromTermId, intoTermId}` | `Result<MergePlanResponse>` | none — read-only; rejects with `SAME_TERM_MERGE` before any overlap computation if `fromTermId === intoTermId` (REQ-15a) (REQ-15, mirrors SPEC-016 REQ-09) | `UNAUTHENTICATED, FORBIDDEN, TERM_NOT_FOUND, SAME_TERM_MERGE` |
| `confirmMergeTerm` | `{workspaceId, principalId, principalKind, planId, planHash}` | `Result<MergeConfirmationToken>` | mints token if `authorize()` passes and `principalKind='user'` (SPEC-016 REQ-10) | `UNAUTHENTICATED, FORBIDDEN` |
| `executeMergeTerm` | `{workspaceId, principalId, principalKind, confirmationToken}` | `Result<MergeExecuteResponse>` | runs the merge exactly once on success; stamps composite actor identity onto the resulting `taxonomy_revisions` row per SPEC-016 REQ-16's `ActorIdentityRef` shape (REQ-12) — the same obligation every other action's `taxonomy_revisions` row also carries, not a merge-specific mechanism (Red-Team RT-010); watermark stamp + outbox enqueue, one transaction | `UNAUTHENTICATED, FORBIDDEN, PLAN_STALE, TOKEN_EXPIRED, TOKEN_ALREADY_REDEEMED, INTERNAL_ERROR` |

## 5) Lifecycle Hooks

| Hook | Trigger | Ordering | Failure Behavior |
|---|---|---|---|
| `onBeforeOrdinaryWrite` | before any `create*`/`rename*`/`reparent*`/`deprecate*`/`assign*`/`unassign*` write | `authorize()` evaluated before any idempotency short-circuit (REQ-17, SPEC-016 REQ-14); workspace check (REQ-07) → lens check (REQ-08) → hierarchy checks (hierarchical-mode REQ-10 → same-taxonomy REQ-09 → cycle REQ-11, in that fixed sub-order per Red-Team RT-001), where applicable | first failing check's code is returned; no later check runs and no row is written |
| `onBeforeMergePlanCompute` | before `planMergeTerm` computes any overlap or constructs a plan | `fromTermId !== intoTermId` checked first (REQ-15a) | if `fromTermId === intoTermId`, rejected with `SAME_TERM_MERGE` before any overlap computation, delegate lookup, or gateway plan construction runs |
| `onBeforeMergeConfirm` | before minting a merge token | delegates to SPEC-016 `GatedMutationGateway.onBeforeConfirm` — evaluates `authorize()` for `admin.taxonomy.manage` before any token is created | if `authorize()` denies, no token is created and the call fails with `FORBIDDEN` |
| `onBeforeMergeExecute` | before checking merge-token validity | delegates to SPEC-016 `GatedMutationGateway.onBeforeExecute` — re-evaluates `authorize()` fresh, strictly before token-state checks | if `authorize()` denies, `executeMergeTerm` fails with `FORBIDDEN` before any token/plan-staleness check runs |
| `onAfterMergePlanRecompute` | after re-deriving the merge plan (overlap count) from live state at execute time | before the merge itself runs | a hash mismatch against the token's bound `planHash` fails the call with `PLAN_STALE` before any mutation |
| `onAfterOrdinaryWriteCommit` | after any ordinary or merge write's own transaction commits | after the write's own transaction | non-fatal logging only at the orchestrator layer — the underlying transaction (which itself called the watermark-stamping function per REQ-14) has already committed |

## 6) Invariants
- [x] No taxonomy/term/entry_terms mutation runs its durable write before `authorize()` has been
      evaluated (mirrors SPEC-016 INV-05, scoped to this domain's writes).
- [x] `executeMergeTerm` never succeeds against a token that has already transitioned to
      `redeemed` or `expired` (INV-06/SPEC-016 INV-03).
- [x] `confirmMergeTerm` never succeeds for a `principalKind` other than `user` (SPEC-016 REQ-10).
- [x] `isMergeInFlight` is `false` immediately after either a successful `executeMergeTerm` or a
      terminal `executeMergeTerm` failure — it never remains `true` indefinitely.
- [x] `createTerm`/`reparentTerm` never commit a `parentId` value that fails any of REQ-09/REQ-10/
      REQ-11's checks.
- [x] `executeMergeTerm` never runs for `fromTermId === intoTermId` — `planMergeTerm` rejects this
      case with `SAME_TERM_MERGE` before any plan is ever produced (REQ-15a, INV-08).

## 7) Acceptance Checklist
- [x] Inputs/outputs/actions are fully documented.
- [x] Failure codes align with `errors.spec.md` and SPEC-016's `errors.spec.md`.
- [x] Entity field names align with `state.spec.md`.
- [x] `mergeTerm`'s gateway instantiation is described as a delegation to SPEC-016's
      `GatedMutationGateway`, not a redefinition of its hooks/invariants.
- [x] Composite actor-identity stamping (SPEC-016 REQ-16) is described as a uniform obligation
      across every action that produces a `taxonomy_revisions` row, not a merge-specific mechanism
      (Red-Team RT-010).
