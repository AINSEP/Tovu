# Implementation Outline: categories-and-tags

- Spec: SPEC-018 v1.3.0 (hash: sha256:0dbe6f8750aed1ea94fe94d4cfde31345207c73591cd4bbe93d52f13f3422f60)
- ADR: ADR-PIPE-018
- Status: PRODUCED
- Trigger result: Boundary Cross, Contract Change, Data And Persistence, Brownfield Dependency, Critical Cross-Boundary Invariant
- Date: 2026-07-15T09:00:00Z
- Author: Software Architect (Claude Sonnet 5, Agent Direct Mode)

## Trigger Decision Matrix

| Trigger | Applies? | Evidence | Source Trace |
|---|---:|---|---|
| Boundary Cross | yes | Crosses `core/gated-mutations` (mergeTerm only), `infra/db/schema.ts`, `features/taxonomy`; depends on ADR-043/SPEC-020's `content_types` registry for join injectivity | ADR-PIPE-018 Module Boundaries |
| Contract Change | yes | New admin routes, new agent-tool catalog, new domain error codes | SPEC-018 api.spec.md, errors.spec.md |
| System Wiring | no | No cross-package orchestration beyond the single `mergeTerm` gateway call and a content-deletion event subscription (REQ-18) — not a multi-step wiring chain requiring its own outline detail beyond the Wiring Map below | — |
| Data And Persistence | yes | New `taxonomies`/`terms`/`entry_terms`/`taxonomy_revisions` tables in `content.db` | SPEC-018 state.spec.md §1 |
| Brownfield Dependency | yes | Reads `posts.kind` (existing column) for lens validation without modifying `post.ts`; depends on ADR-043's reserved-key guarantee | SPEC-018 Dependencies table |
| Reverse-Spec Or Migration | no | Not a reverse-spec extraction. | N/A |
| Critical Cross-Boundary Invariant | yes | INV-01 through INV-08 span the write-service's validation chain and hierarchy invariants | SPEC-018 feature.spec.md Invariants |
| Parallelization Ambiguity | no | This domain's tasks can proceed independently of SPEC-020 in time (by design — its own success signal); no extra sequencing detail needed beyond citing the injectivity dependency, which is a design-time, not task-ordering, concern | — |

## Module Map

| Module/Domain | Owns | Responsibility | Public Contracts | Dependencies | Notes |
|---|---|---|---|---|---|
| `features/taxonomy` | SPEC-018 | Taxonomy/term CRUD, term assignment, mergeTerm, agent-tool catalog | C-201–C-208 | `core/gated-mutations` (mergeTerm only), `infra/db/schema.ts` | Follows the established rule-of-two shape (`src/redirects/` precedent) |
| `core/gated-mutations` (existing, unchanged) | ADR-PIPE-016 | Generic gateway | C-001–C-008 | — | Imported only for `mergeTerm` |
| `infra/db/schema.ts` (addition) | This ADR | New tables | Drizzle schema export | — | Additive only |
| ADR-043/SPEC-020 `content_types` registry (external, not yet built) | SPEC-020 | Reserved-key guarantee (`key ∉ {'post','page'}`) | — | — | This domain's join injectivity depends on it; no code dependency, a design-time one |

## File Map

| File Path | Module | Creates / Changes | Public Contracts Housed | Responsibility | Why This Separation Exists | Notes |
|---|---|---|---|---|---|---|
| `src/features/taxonomy/write-service.ts` | `features/taxonomy` | creates | C-201–C-206 | Single write chokepoint for all ordinary mutations | One chokepoint per ADR-022 discipline, enforces the fixed validation chain (CIC U-001) | New |
| `src/features/taxonomy/merge-term.ts` | `features/taxonomy` | creates | C-207 | `mergeTerm`'s gateway instantiation | Isolated from ordinary mutations since it alone touches `core/gated-mutations` | New |
| `src/features/taxonomy/validation-chain.ts` | `features/taxonomy` | creates | C-208 | The fixed allow-list→workspace→lens→hierarchy check sequence | Isolated because 3 Red-Team rounds found ordering defects here — keeping it one reviewable unit reduces recurrence risk (CIC U-001) | New |
| `src/features/taxonomy/repo.memory.ts`, `repo.sqlite.ts` | `features/taxonomy` | creates | — | Rule-of-two adapters | Matches established codebase convention | New |
| `src/infra/db/schema.ts` | `infra/db` | changes | — | Adds 4 new tables | Existing shared schema file | Additive |

## Contract Map

| Contract ID / Name | File | Owner Module | Kind | Why Needed | Job | Inputs | Outputs | Validation | Errors | Effect Boundary | Complexity / Resource View | Aggregate-Risk Note | Spec/ADR Trace | Test Seam / Expectation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C-201 `createTaxonomy`/`createTerm` | `write-service.ts` | `features/taxonomy` | exported functions | Taxonomy/term creation | Validate + write + revision + watermark + outbox, one transaction | required object per action | `Result<Taxonomy\|Term>` | Full validation chain for `createTerm` when `parentId` given (CIC U-001) | `FORBIDDEN`, `TAXONOMY_NOT_HIERARCHICAL`, `PARENT_CROSS_TAXONOMY`, `TERM_NOT_FOUND` | Side effect: row + revision + watermark + outbox, one transaction | O(1) plus `wouldCreateCycle`'s descendant walk for `createTerm` with `parentId` | Adversarial case: cross-taxonomy `parentId` combined with non-hierarchical target — see CIC U-001 | SPEC-018 REQ-01, REQ-09, REQ-10, AC-01, AC-12a, AC-12b | Contract test per validation branch |
| C-202 `renameTerm`/`deprecateTaxonomy`/`deprecateTerm` | `write-service.ts` | `features/taxonomy` | exported functions | Ordinary metadata mutations | authorize() → write → revision → watermark → outbox | required object | `Result` | `authorize()` before any side effect (REQ-17) | `FORBIDDEN`, `TERM_NOT_FOUND`, `TAXONOMY_NOT_FOUND` | Side effect: same-transaction write+revision+stamp+outbox | O(1) | N/A | SPEC-018 REQ-12, REQ-17, AC-15, AC-25 | Contract test: authz-denial produces zero side effects |
| C-203 `reparentTerm` | `write-service.ts` | `features/taxonomy` | exported function | Hierarchy mutation | Full validation chain (hierarchical-mode → same-taxonomy → cycle), then write | `{termId, newParentId}` | `Result<Term>` | See CIC U-001 (ordering), U-002 (cycle algorithm) | `TAXONOMY_NOT_HIERARCHICAL`, `PARENT_CROSS_TAXONOMY`, `TERM_NOT_FOUND`, `HIERARCHY_CYCLE_DETECTED` | Side effect: same-transaction write+revision+stamp+outbox | O(depth) for cycle check | Adversarial case: 3+-node cycle, self-parenting — see CIC U-002 | SPEC-018 REQ-09-REQ-11, AC-12-AC-14 | Property test: exhaustive cycle-shape matrix |
| C-204 `assignTerms`/`unassignTerms` | `write-service.ts` | `features/taxonomy` | exported functions | Content-term membership | allow-list → workspace → lens validation, then upsert/ignore-on-conflict write, NOT revisioned | `{contentType, contentId, termIds}` | `Result` | Full REQ-06/07/08 chain | `TAXONOMY_NOT_APPLICABLE`, `WORKSPACE_MISMATCH`, `CONTENT_TYPE_MISMATCH`, `TERM_NOT_FOUND` | Side effect: `entry_terms` row(s) + watermark + outbox, NOT `taxonomy_revisions` (INV-05) | O(termIds.length) | Adversarial case: concurrent identical assign calls — idempotent no-op required (EC-09), not a race | SPEC-018 REQ-06-REQ-08, REQ-13, AC-07, AC-09-AC-11, AC-17 | Property test: concurrent-assign race always converges to exactly one row |
| C-205 `listContentForTerm`/`listTermsForContent` | `write-service.ts` (read side) | `features/taxonomy` | exported functions | Reverse lookup / forward lookup | Indexed query, orphan-filtered | `{workspaceId, termId}` / `{workspaceId, contentType, contentId}` | `Array<...>` | Uses `idx_entry_terms_by_term` | none | Pure read | O(matches), indexed | N/A | SPEC-018 REQ-04, AC-05 | Contract test: query-plan assertion (no full scan) |
| C-206 `onContentDeleted` subscriber | `write-service.ts` | `features/taxonomy` | exported event handler | Cleanup on content deletion | Remove `entry_terms` rows for the deleted content | content-deletion event | `void` | none | none | Side effect: row deletion | O(termIds assigned) | N/A | SPEC-018 REQ-18, AC-27 | Integration test: publish event, assert cleanup |
| C-207 `planMergeTerm`/`confirmMergeTerm`/`executeMergeTerm` | `merge-term.ts` | `features/taxonomy` | exported functions | This domain's gated mutation | Calls `core/gated-mutations`'s C-001/C-002/C-003 with `domain="taxonomy.merge"`; rejects self-merge before overlap computation | `{fromTermId, intoTermId}` / `{planId,planHash}` / `{confirmationToken}` | `Result<MergePlanResponse\|ConfirmationToken\|MergeResult>` | `fromTermId !== intoTermId` checked first (REQ-15a) | `SAME_TERM_MERGE`, plus SPEC-016's gateway codes | Side effect (execute only): re-points `entry_terms`, dedups via unique index, one revision row | O(overlap count) at plan time | Adversarial case: self-merge attempted via a forged token — structurally impossible since no plan/token for it can ever exist (INV-08) | SPEC-018 REQ-15, REQ-15a, REQ-16, AC-21-AC-24, AC-22a | Contract test: self-merge rejected before overlap computation runs |
| C-208 Validation chain | `validation-chain.ts` | `features/taxonomy` | exported function | Shared fixed-order validation for content-join and hierarchy checks | Enforce allow-list → workspace → lens → (hierarchical-mode → same-taxonomy → cycle) in that exact order | domain params | pass/throw | See CIC U-001 | various (see C-201/C-203/C-204) | Pure decision | O(1) plus cycle-check cost when hierarchy-scoped | This IS the CIC U-001 unit | SPEC-018 behavior.spec.md §2.1 | Property test: full precedence matrix, all documented Red-Team regression cases (RT-001, RT-011, RT-012) |

## Wiring Map

| Flow ID | Source | Transport/Call Type | Target | Payload/Contract | Ordering/Retry/Idempotency | Failure Handling | Trace |
|---|---|---|---|---|---|---|---|
| W-201 | Route handler / agent tool | direct call | C-201-C-206 (write-service) | respective contract | `authorize()` before idempotency (REQ-17/SPEC-016 REQ-14) | Maps to domain error codes | SPEC-018 api.spec.md |
| W-202 | `merge-term.ts` (C-207) | direct call | `core/gated-mutations.plan/confirm/execute` (C-001-C-003) | C-001-C-003 | Per SPEC-016's gateway ordering, unmodified | Maps to SPEC-016's codes plus `SAME_TERM_MERGE` | SPEC-018 Integration Contracts |
| W-203 | Content-deletion event bus | event subscription | C-206 (`onContentDeleted`) | content-deletion event | Best-effort; orphans also swept by periodic reconciliation (REQ-19) as a backstop | Missed events are covered by the reconciliation sweep, not a hard failure | SPEC-018 REQ-18, REQ-19 |
| W-204 | `write-service.ts` (any mutation) | direct call | `core/gated-mutations.stampWatermark()` (C-004) | C-004 | Same transaction as the domain row write | Transaction rollback if stamping fails | SPEC-018 REQ-14, AC-19, AC-20 |

## Data And Side-Effect Boundaries

| Boundary | Owner | Reads | Writes | Side Effects | Consistency / Transaction Rule | Migration / Dual-Write Path |
|---|---|---|---|---|---|---|
| `taxonomies`/`terms` (in `content.db`) | `features/taxonomy` | Admin UI, agent tools | `write-service.ts` only | Revision row + watermark + outbox per mutation | Every mutation and its `taxonomy_revisions` row commit atomically (INV-05 for the negative case: assign/unassign never produce one) | N/A — new tables |
| `entry_terms` (in `content.db`) | `features/taxonomy` | Reverse/forward lookup | `assignTerms`/`unassignTerms`/`mergeTerm`'s dedup step | Watermark + outbox, never a revision row | `entry_terms_unique` enforces INV-04 at the DB layer | N/A |
| `taxonomy_revisions` (in `content.db`) | `features/taxonomy` | Audit/history views | Every mutation except assign/unassign | None beyond the row write | Composite actor identity always stamped (REQ-12) | N/A |

## Observability And Operational Expectations

| Surface / Flow | Required Signals | Correlation / Trace Context | Metrics | Logs | Alert / Runbook Need | Privacy / Secret Constraints | Trace |
|---|---|---|---|---|---|---|---|
| Taxonomy mutations | Structured error envelope, `taxonomy_revisions` as durable audit trail | `correlationId` on error envelope | Not specified — v1 admin feature, no ops-critical path | Standard error envelope | N/A | None beyond standard workspace-scoping | SPEC-018 errors.spec.md |

## Critical Invariants

| Invariant ID | Scope | Rule | Reason | Enforcement Surface | Test Expectation | Trace |
|---|---|---|---|---|---|---|
| INV-01 | `terms` (this domain) | `parentId`, when non-null, always references a term in the same `taxonomyId` | Prevents cross-taxonomy hierarchy corruption | C-203/C-208 | Contract test | SPEC-018 feature.spec.md INV-01 |
| INV-02 | `terms` (this domain) | `parentId` always null when taxonomy is flat | Enforces the category/tag distinction structurally | C-201/C-203/C-208 | Contract test | SPEC-018 feature.spec.md INV-02 |
| INV-03 | `terms` hierarchy (this domain) | Never contains a cycle | Prevents infinite-loop traversal in any hierarchy-walking UI/query | C-203/C-208 | Property test | SPEC-018 feature.spec.md INV-03 |
| INV-04 | `entry_terms` (this domain) | `(workspaceId, contentType, contentId, termId)` never duplicated | Prevents double-counting/double-display of a single assignment | DB unique constraint | DB-level test | SPEC-018 feature.spec.md INV-04 |
| INV-05 | `taxonomy_revisions` (this domain) | Never produced for assign/unassign | Explicit, disclosed narrowing of ADR-022's general revisioning rule | C-204 | Contract test | SPEC-018 feature.spec.md INV-05 |
| INV-06 | `mergeTerm` (this domain) | Never executes without a prior successful confirm bound to the recomputed planHash | Inherited SPEC-016 gateway guarantee, applied to this domain's one instantiation | C-207 (delegates to core/gated-mutations) | Contract test | SPEC-018 feature.spec.md INV-06 |
| INV-07 | `entry_terms` orphans (this domain) | Never cause a read to fail — filtered out | SPEC-016 REQ-18 instance | C-205 | Contract test | SPEC-018 feature.spec.md INV-07 |
| INV-08 | `mergeTerm` (this domain) | Never executes with `fromTermId === intoTermId` | Structurally impossible once REQ-15a rejects at plan time | C-207 | Contract test | SPEC-018 feature.spec.md INV-08 |

## Brownfield / Migration Mapping

| Source Behavior / Contract | Target Module / Contract | Preserve / Change | Characterization Evidence | Migration Safety Note |
|---|---|---|---|---|
| `posts.kind` (existing column) | C-201/C-204's lens-validation read | Preserve — read-only, never written by this domain | Direct read of `src/infra/db/schema.ts` | Zero blast radius on `post.ts` |
| `src/redirects/` (existing rule-of-two shape) | `features/taxonomy`'s file structure | Preserve the pattern, apply to a new domain | Direct read of `src/redirects/` directory listing | Zero new architectural ceremony |

## Test Expectations

- Contract tests: C-201-C-208.
- Integration tests: W-203 (content-deletion cleanup event), W-204 (same-transaction watermark stamping).
- Property/invariant tests: INV-01-INV-08, especially INV-03 (cycle detection, CIC U-002) and the validation-chain ordering (CIC U-001).
- Characterization tests: N/A.
- Explicitly N/A suites with reason: none.

## Downstream Handoff Notes

- Coordinator task-generation constraints: this domain's tasks have no hard sequencing dependency on SPEC-017/019/020 — only a design-time (not task-ordering) dependency on ADR-043's reserved-key guarantee.
- TDD focus: prioritize C-208's full precedence-matrix property test (all 3 Red-Team-found ordering regressions) and C-203's cycle-detection property test first.
- Programmer architecture audit focus: confirm `assignTerms`/`unassignTerms` never produce a `taxonomy_revisions` row; confirm the validation chain's exact order is never silently collapsed into a single combined check.
- Open risks or ambiguities: OQ-01 (custom taxonomies admin UI) and OQ-02 (per-content-type taxonomy limits) remain open per their stated owner/deadline (this ADR, before architecture sign-off).
