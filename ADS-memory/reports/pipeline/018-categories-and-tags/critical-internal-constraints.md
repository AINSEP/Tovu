# Critical Internal Constraints: categories-and-tags

- Spec: SPEC-018 v1.3.0 (hash: sha256:0dbe6f8750aed1ea94fe94d4cfde31345207c73591cd4bbe93d52f13f3422f60)
- ADR: ADR-PIPE-018
- Implementation Outline: `ADS-memory/reports/pipeline/018-categories-and-tags/implementation-outline.md`
- Prior designations consulted: `ADS-memory/reports/pipeline/016-content-admin-core-contract/critical-internal-constraints.md` — none of SPEC-016's designated units (execute() ordering, watermark atomicity, token redemption, boot-mirror reconciliation) are touched by this domain beyond the unmodified `core/gated-mutations` import; no re-affirmation needed since this domain does not reimplement any of them.
- Status: PRODUCED
- Trigger result: Security-Critical Sequencing Constraint (1 unit), Algorithmic Correctness Constraint (1 unit)
- Source sync: verified 2026-07-15T09:00:00Z against SPEC-018 v1.3.0 and this feature's own implementation-outline.md
- Date: 2026-07-15T09:00:00Z
- Author: Software Architect (Claude Sonnet 5, Agent Direct Mode)

## Trigger Decision Matrix

| Trigger | Applies? | Designated Unit(s) | Plausible Wrong Implementation | Broken Property | Required Constraint | Source Trace |
|---|---:|---|---|---|---|---|
| Algorithmic Correctness Constraint | yes | U-002 | See unit section | See unit section | See unit section | REQ-11, EC-05, EC-05a, EC-05b |
| Stateful Protocol Constraint | no | — | Considered `TaxonomyStatus`/`TermStatus` (`active`/`deprecated`) — but REQ's own Scope section explicitly states `deprecated` has no write-time enforcement in v1 (no illegal transition exists to guard), so no trigger applies. | — | — | — |
| Concurrency / Ordering / Idempotency Constraint | no | — | Considered `assignTerms`'s concurrent-call race (EC-09) — but the required behavior is fully delivered by a DB unique constraint plus upsert/ignore-on-conflict, which is itself the Binding mechanism already stated in the public contract (C-204's Validation column); no internal-only correctness gap exists beyond what the DB guarantees structurally. | — | — | — |
| Security-Critical Sequencing Constraint | yes | U-001 | See unit section | See unit section | See unit section | REQ-06-REQ-11, behavior.spec.md §2.1, Red-Team RT-001/RT-011/RT-012 |
| Explicit Performance Budget Constraint | no | — | No stated latency/throughput budget for this domain. | — | — | — |
| Failure / Recovery Constraint | no | — | `mergeTerm`'s failure modes are fully inherited from SPEC-016's gateway (already covered by SPEC-016's own CIC) — no domain-specific failure/recovery detail beyond that inheritance. | — | — | — |
| Characterization Parity Constraint | no | — | Not a reverse-spec/migration surface. | — | — | — |

Candidate units checked beyond the designated two: `listContentForTerm`/`listTermsForContent` (C-205, a pure indexed read with no invariant beyond query-plan assertion — no trigger); `onContentDeleted` (C-206, best-effort cleanup backstopped by reconciliation — no trigger, since even a missed event is explicitly tolerated by design, not a correctness gap).

## Designated Units

| Unit ID | Name | Location (module / contract ref) | Designating Trigger(s) | Outline Refs | Trace |
|---|---|---|---|---|---|
| U-001 | Fixed validation-chain ordering (allow-list → workspace → lens → hierarchy sub-order) | `features/taxonomy/validation-chain.ts`, C-208 | Security-Critical Sequencing Constraint | C-201, C-203, C-204, C-208 | SPEC-018 behavior.spec.md §2.1, REQ-06-REQ-11 |
| U-002 | Cycle-detection algorithm (`wouldCreateCycle`) | `features/taxonomy/validation-chain.ts`, C-208 (via C-203) | Algorithmic Correctness Constraint | C-203, INV-03 | SPEC-018 REQ-11, state.spec.md §4, EC-05, EC-05a, EC-05b |

## Unit Constraints

### U-001 Fixed validation-chain ordering

- Responsibility: Evaluate the content-join and hierarchy validation checks in the one order (allow-list → workspace → lens → hierarchical-mode → same-taxonomy → cycle) that this domain's own behavior.spec.md §2.1 mandates.
- Designation: This is not a hypothetical risk — it is a *proven* one. Three separate Red-Team rounds each found a real ordering defect in this exact chain: RT-001 (BLOCKING) found the hierarchy sub-order itself was backwards (same-taxonomy checked before hierarchical-mode), which broke the unconditional truth of EC-04's claim for the compound cross-taxonomy-and-non-hierarchical case; RT-011 found `createTerm` never actually exercised the cross-taxonomy check despite REQ-09's text naming it; RT-012 found no distinction between "parent doesn't exist" and "parent exists in wrong taxonomy." A competent implementer, satisfied by the current (corrected) single-scenario ACs, could still reorder or collapse these checks under a future refactor and pass every existing test while reintroducing exactly the RT-001 shape (checking same-taxonomy before hierarchical-mode) for an untested compound case. Broken property: EC-04's claim ("`TAXONOMY_NOT_HIERARCHICAL` fires unconditionally, regardless of what the parentId resolves to") would silently stop holding for the specific compound case that originally exposed RT-001. Required constraint: the six-step order (allow-list, workspace, lens, hierarchical-mode, same-taxonomy [including the not-found sub-check], cycle) is fixed and must be evaluated as ordered, separately-testable steps, never collapsed or reordered.
- Outline refs: C-201, C-203, C-204, C-208

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-001-B1 | The hardcoded `post`/`page` allow-list check runs first, before any content-row lookup, for any content-scoped mutation | — | Cheapest-check-first short-circuit; also prevents an unnecessary DB lookup for an inapplicable taxonomy | API result: allow-list rejection occurs with zero DB reads of the target content row | SPEC-018 behavior.spec.md §1.1, REQ-06 |
| U-001-B2 | For hierarchy-scoped mutations, the hierarchical-mode check (REQ-10) always runs before the same-taxonomy check (REQ-09), which itself always runs before the cycle check (REQ-11) | ESCALATE_SECURITY | EC-04's unconditional guarantee (`TAXONOMY_NOT_HIERARCHICAL` fires regardless of the candidate parent's own taxonomy) must hold even in the compound cross-taxonomy case — the exact case RT-001 found broken | API result: given a flat-taxonomy term and a cross-taxonomy candidate parent, the response is always `TAXONOMY_NOT_HIERARCHICAL`, never `PARENT_CROSS_TAXONOMY` | SPEC-018 behavior.spec.md §2.1, REQ-09, REQ-10, EC-04, AC-13 |
| U-001-B3 | Within the same-taxonomy check, a `parentId`/`newParentId` that fails to resolve to any existing term is rejected with `TERM_NOT_FOUND`, distinct from a resolved-but-wrong-taxonomy parent (`PARENT_CROSS_TAXONOMY`) | — | Distinguishes two genuinely different caller mistakes with different remediation | API result: non-existent parent id → `TERM_NOT_FOUND`; existent-but-wrong-taxonomy parent id → `PARENT_CROSS_TAXONOMY` | SPEC-018 REQ-09, AC-12b, EC-03b |

#### Required Ordering Constraints

| ID | Required Ordering | Property Protected | Observable Verification Surface | Escalation Marker | Trace |
|---|---|---|---|---|---|
| U-001-ORD1 | Allow-list check completes before workspace-ownership check begins | Avoids unnecessary DB lookup; matches behavior.spec.md §1.1's stated precedence | API result for an inapplicable-taxonomy-plus-mismatched-workspace case: `TAXONOMY_NOT_APPLICABLE`, not `WORKSPACE_MISMATCH` | — | SPEC-018 behavior.spec.md §1.1 |
| U-001-ORD2 | Workspace-ownership check completes before content-type/lens check | Matches the fixed chain order (behavior.spec.md §2.1) | API result for a combined workspace-mismatch-plus-lens-mismatch case: `WORKSPACE_MISMATCH` | — | SPEC-018 behavior.spec.md §2.1, REQ-07, REQ-08 |
| U-001-ORD3 | Hierarchical-mode check completes before same-taxonomy check, before cycle check | EC-04's unconditional guarantee (the RT-001 regression case) | API result for the compound flat-taxonomy-plus-cross-taxonomy-parent case: always `TAXONOMY_NOT_HIERARCHICAL` | ESCALATE_SECURITY | SPEC-018 behavior.spec.md §2.1, RT-001 |

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| (no separate outline INV — fully captured by REQ-06/REQ-09/REQ-10 and behavior.spec.md §2.1 directly) | SPEC-018 feature.spec.md, behavior.spec.md §2.1 | U-001-B1, U-001-B2, U-001-B3, U-001-ORD1, U-001-ORD2, U-001-ORD3 |

#### Design Context (optional, non-binding)

This unit exists specifically because this domain has empirical proof (3 separate Red-Team rounds, not a hypothetical) that its own check ordering is easy to get wrong under review pressure — the same class of risk ADR-041's watermark mechanism proved for its own domain. The escalation marker on U-001-B2/ORD3 reflects that this is the one ordering rule with a directly-cited prior regression (RT-001), not a newly-invented concern.

---

### U-002 Cycle-detection algorithm (`wouldCreateCycle`)

- Responsibility: Correctly detect whether a proposed `parentId`/`newParentId` assignment would create a cycle in the term hierarchy, at any depth, including the degenerate self-parenting case.
- Designation: A competent implementer might write a cycle check that only compares the immediate candidate parent against the term's own immediate parent (catching only a 2-node cycle), or might forget to check the degenerate case where `candidateParentId === termId` itself (self-parenting) — both pass the simplest test case (`reparentTerm` swapping two directly-linked terms, AC-14) while missing the 3+-node case (EC-05b) or the self-parent case (EC-05a), both of which this domain's own spec explicitly names as required test cases. Broken property: INV-03 (the term hierarchy under any taxonomy must never contain a cycle) — an undetected cycle would make any hierarchy-walking UI or query (e.g. rendering a category breadcrumb, or a recursive descendant listing) loop indefinitely or produce corrupted output. Required constraint: `wouldCreateCycle` must perform a full recursive descendant walk from the candidate parent, checking whether the term itself appears anywhere in that walk (including immediately, the self-parent case), not a fixed-depth or immediate-parent-only comparison.
- Outline refs: C-203, INV-03

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-002-B1 | `wouldCreateCycle(termId, candidateParentId)` performs a full recursive descendant walk from `candidateParentId`, returning `true` if `termId` appears anywhere in that walk at any depth (including `candidateParentId === termId` itself) | — | INV-03 (no cycle ever exists in the term hierarchy) | Persisted state: after a rejected `reparentTerm`/`createTerm` attempt, the hierarchy remains acyclic; property-testable by constructing chains of arbitrary depth | SPEC-018 REQ-11, INV-03, EC-05, EC-05a, EC-05b |

#### Required Ordering Constraints

N/A — this is a single-function algorithmic correctness constraint, not a multi-step ordering.

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| INV-03 | SPEC-018 feature.spec.md | U-002-B1 |

#### Design Context (optional, non-binding)

The self-parenting case (EC-05a) and the 3+-node case (EC-05b) were both added as explicit edge cases by Red-Team RT-007 specifically because they are the two shapes a fixed-depth or immediate-only cycle check would miss — this unit's Binding constraint makes that full-depth requirement a tested property, not just a documented edge case.

## Deviation And Promotion Protocol

Per `AI-Dev-Shop/skills/critical-internal-constraints/SKILL.md`: escalation-marked constraints (U-001-B2, U-001-ORD3) require Coordinator routing and a recorded `[CIC_DEVIATION_APPROVED]` entry before any deviation; other Binding constraints require a recorded `[CIC_DEVIATION]` entry. No deviations exist yet.

## Downstream Handoff Notes

- Coordinator: tasks touching `validation-chain.ts` reference U-001; tasks touching the cycle-detection algorithm reference U-002.
- TDD focus: U-001's full precedence matrix (replaying all 3 Red-Team regression cases as first-class tests) and U-002's exhaustive cycle-shape property test (self-parent, 2-node, 3+-node) are the highest priority.
- Programmer audit focus: confirm the six-step validation order is implemented as separately-testable, ordered steps, not a single combined boolean expression; confirm `wouldCreateCycle` walks the full descendant tree, not a fixed number of hops.
- Open risks or ambiguities: none beyond SPEC-018's own carried-forward open questions (OQ-01, OQ-02), neither of which changes any Binding constraint recorded here.
