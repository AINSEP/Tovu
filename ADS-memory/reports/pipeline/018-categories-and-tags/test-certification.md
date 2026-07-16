# Test Certification Record

- Test Suite: categories-and-tags (`features/taxonomy`)
- Spec ID: SPEC-018
- Spec Version: 1.3.0
- Spec Hash: sha256:0dbe6f8750aed1ea94fe94d4cfde31345207c73591cd4bbe93d52f13f3422f60
- Spec Hash Verification: `python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/018-categories-and-tags --phase preflight` → `PASS` (exit 0), run 2026-07-15 by TDD Agent. Matches `pipeline-state.md`'s recorded `spec_hash`/`planning_preflight_spec_hash`.
- ADR: `ADS-memory/reports/pipeline/018-categories-and-tags/adr.md` (ADR-PIPE-018)
- Implementation Outline: `ADS-memory/reports/pipeline/018-categories-and-tags/implementation-outline.md` (PRODUCED)
- Critical Internal Constraints: `ADS-memory/reports/pipeline/018-categories-and-tags/critical-internal-constraints.md` (PRODUCED — U-001 fixed validation-chain ordering, U-002 cycle-detection algorithm)
- Tasks: `ADS-memory/reports/pipeline/018-categories-and-tags/tasks.md`
- Certified At: 2026-07-15T00:00:00Z
- Certified By: TDD Agent
- Cross-package note: `mergeTerm`'s test suite consumes SPEC-016's `core/gated-mutations.plan()` via a fake seam only — the gateway's own ordering/token/actor-class mechanics are SPEC-016's own certified contract (`src/core/gated-mutations/__tests__/unit/gateway.unit.test.ts`), not re-tested here. `write-service.ts`'s ordinary mutations reuse `core/commands/executeCommand`'s existing `ForbiddenError`/authorize-ordering (already certified at `src/core/commands/__tests__/authorize-gateway.test.ts`), per `implementation-outline.md`'s Module Map note that `core/gated-mutations` is "imported only for mergeTerm."

## Test File Inventory

| Test File | Type | Spec Refs | sha256 | Expected Test Count | Red Evidence |
|---|---|---|---|---:|---|
| `src/features/taxonomy/__tests__/unit/validation-chain.unit.test.ts` | unit | C-208, U-001, REQ-06–REQ-11, behavior.spec.md §2.1 | sha256:ed7e7e140b08bd937f3e1bea7b057da526bea170263e0f291be4903daf8b2476 | 13 | `Cannot find module '../../validation-chain'` |
| `src/features/taxonomy/__tests__/unit/cycle-detection.unit.test.ts` | unit | C-203, U-002, INV-03, REQ-11, EC-05/EC-05a/EC-05b | sha256:fe6ca7483362416ece0f7e068318f9fe199dbdf697066c19c6e196f76ae48be7 | 7 | `Cannot find module '../../validation-chain'` (shared module with validation-chain.unit.test.ts) |
| `src/features/taxonomy/__tests__/unit/write-service.unit.test.ts` | unit | C-201, C-202, C-204, REQ-01–REQ-05, REQ-12–REQ-14, REQ-17 | sha256:f940932ed319e5b58fb3b3787e4c3f126aa0accb5adb6f94a436cacb78ba3518 | 9 | `Cannot find module '../../write-service'` |
| `src/features/taxonomy/__tests__/unit/merge-term.unit.test.ts` | unit | C-207, REQ-15, REQ-15a, REQ-16, INV-06, INV-08 | sha256:b74455b25bdda62fb2c9a48af6830b0f7a505cc2e3878050fa124145c2e86277 | 4 | `Cannot find module '../../merge-term'` |
| `src/features/taxonomy/__tests__/integration/content-deletion-cleanup.integration.test.ts` | integration | C-206, W-203, REQ-18, REQ-19, INV-07 | sha256:3ff4fa95f7af75c2fae51e941ba44b02a5f7c4cfea7f06cdfea1cd13e9abff86 | 4 | `Cannot find module '../../write-service'` (shared module) |

**Total expected runnable tests: 37.** Verified via `node --import tsx --test "src/features/taxonomy/**/*.test.ts"` — all 5 files fail with `MODULE_NOT_FOUND` (grep-confirmed, no `SyntaxError`/`TypeError` from the test code itself). `node --test` reports each failing-to-import file as 1 failed top-level test (5 shown in the raw run summary) since no individual `test()` call inside an unresolvable file is ever registered — the 37 figure is the sum of `test(` occurrences per file, i.e. the runnable count once the modules exist.

## Covered Requirements (excerpt — full REQ/AC list in `tasks.md` Coverage Summary)

| Spec Ref | Priority | Test File | Assertion Summary | Status |
|---|---|---|---|---|
| REQ-06 / AC-07 | P1 | validation-chain.unit.test.ts | Allow-list check runs first, zero downstream checks reached | Certified |
| U-001-ORD3 / EC-04 (RT-001 regression) | P1 | validation-chain.unit.test.ts | Flat taxonomy + cross-taxonomy parent → `TAXONOMY_NOT_HIERARCHICAL`, never `PARENT_CROSS_TAXONOMY` | Certified |
| REQ-09 / AC-12, AC-12a, AC-12b | P1 | validation-chain.unit.test.ts | Cross-taxonomy parent vs. not-found parent produce distinct codes | Certified |
| REQ-11 / INV-03 / AC-14 | P1 | cycle-detection.unit.test.ts | Full recursive walk detects cycles at any depth, incl. self-parent | Certified |
| REQ-01, REQ-02, REQ-03 / AC-01, AC-02, AC-03 | P1 | write-service.unit.test.ts | Shared table for both taxonomy kinds; parentId rules enforced | Certified |
| REQ-12 / AC-15 | P1 | write-service.unit.test.ts | Exactly one revision row with pre-mutation state | Certified |
| REQ-13 / INV-05 / AC-17 | P1 | write-service.unit.test.ts | assignTerms produces zero revision rows | Certified |
| REQ-14 / AC-19, AC-20 | P1 | write-service.unit.test.ts | Exactly one watermark stamp + one outbox enqueue per commit | Certified |
| REQ-17 / AC-25 | P1 | write-service.unit.test.ts | Unauthorized call rejected before any side effect | Certified |
| REQ-15a / INV-08 / AC-22a | P1 | merge-term.unit.test.ts | Self-merge rejected before overlap computation | Certified |
| REQ-16 / AC-23, AC-24 | P1/P2 | merge-term.unit.test.ts | Plan discloses overlap loss (or explicit no-loss) | Certified |
| REQ-18 / AC-27 | P1 | content-deletion-cleanup.integration.test.ts | Deletion event removes all entry_terms rows for that content | Certified |
| REQ-19 / INV-07 / AC-28, AC-29 | P1 | content-deletion-cleanup.integration.test.ts | Orphaned rows omitted on read, removed by sweep | Certified |

## Outcome Matrix

| Module | State | Input | Expected Outcome | Spec Ref |
|---|---|---|---|---|
| `validation-chain.ts` (`validateContentJoin`) | not on allow-list, also mismatched workspace/lens | any content-join params | `TaxonomyNotApplicableError` only | U-001-ORD1 |
| `validation-chain.ts` (`validateHierarchyAssignment`) | flat taxonomy, candidate parent exists in different taxonomy | any termId | `TaxonomyNotHierarchicalError`, never `ParentCrossTaxonomyError` | U-001-B2/ORD3 (RT-001) |
| `validation-chain.ts` (`validateHierarchyAssignment`) | hierarchical, parent resolves to nothing | any termId | `TermNotFoundError` | U-001-B3 |
| `validation-chain.ts` (`validateHierarchyAssignment`) | hierarchical, parent exists in different taxonomy | any termId | `ParentCrossTaxonomyError` | U-001-B3 |
| `validation-chain.ts` (`wouldCreateCycle`) | candidateParentId === termId | any tree | `true` | INV-03, U-002-B1 |
| `write-service.ts` (`assignTerms`) | any valid content-join | termIds array | zero `taxonomy_revisions` rows, one watermark stamp, one outbox event | INV-05, REQ-14 |
| `write-service.ts` (`renameTerm`) | authorize() denies | any termId/newName | `ForbiddenError`, zero side effects | REQ-17 |
| `merge-term.ts` (`planMergeTerm`) | `fromTermId === intoTermId` | any principal | `SameTermMergeError`, `computeOverlap` never called | INV-08, REQ-15a |
| `write-service.ts` (`onContentDeleted`) | orphaned rows exist for deleted content | deletion event | all matching `entry_terms` rows removed | REQ-18 |

## Property-Based Tests

| Spec Ref | Property | Generator Domain | Test Name | Status |
|---|---|---|---|---|
| U-002-B1 / INV-03 | Any candidate parent in termId's own descendant chain, at any depth, is a cycle | depths 1–10 | `U-002-B1 (property): for chains of depth 1 through 10...` | Certified |
| U-002-B1 (negative) | Any candidate parent NOT in termId's descendant chain is never a false-positive cycle | depths 1–10, unrelated branch | `U-002-B1 (property): a candidate parent that is NOT in termId's descendant chain...` | Certified |

No fast-check/jsverify dependency exists in this repo — property tests are hand-rolled generative
loops, consistent with the `test-design` skill in spirit (same approach as SPEC-016/017).

## Contract Tests

| Contract Source | Testing Approach | Test Name | Status |
|---|---|---|---|
| C-201/C-202/C-204 write-service mutations | unit (fake repo/authorize/outbox deps) | `write-service.unit.test.ts` (whole file) | Certified |
| C-203 `reparentTerm`'s cycle check | unit (pure function, tree fake) | `cycle-detection.unit.test.ts` (whole file) | Certified |
| C-206 `onContentDeleted` | integration (fake entry_terms store) | `content-deletion-cleanup.integration.test.ts` (whole file) | Certified |
| C-207 `mergeTerm` (this domain's own wrapper only) | unit (fake `gatewayPlan`/`computeOverlap` seams) | `merge-term.unit.test.ts` (whole file) | Certified (own wrapper only — see Known Gaps) |
| C-208 validation chain | unit (exhaustive ordered-precedence matrix, replaying RT-001/RT-011/RT-012) | `validation-chain.unit.test.ts` (whole file) | Certified |
| C-205 `listContentForTerm`/`listTermsForContent` | N/A this dispatch | — | See Known Gaps |

## Known Gaps

| Spec Ref | Reason Not Covered | Risk | Resolution |
|---|---|---|---|
| AC-05 (REQ-04, C-205) | "Uses `idx_entry_terms_by_term`, no full posts scan" requires a real SQLite adapter with an `EXPLAIN QUERY PLAN` assertion — this dispatch's fakes cannot prove an actual index is used | Medium | Add a dedicated integration test against a real `content.db` once `repo.sqlite.ts` (T210) is implemented, asserting the query plan via `EXPLAIN QUERY PLAN` never contains `SCAN posts` |
| AC-08 (REQ-06) | The spec itself states this AC is "verified by mechanism-level call-count assertion / architectural review, not a live-state behavioral test" (feature.spec.md's own qualification) — no live-state test is expected to exist for it | Low | Verified by Code Review / Architecture Audit, per the spec's own instruction, not a TDD test gap |
| AC-18 (REQ-13) | "ADR-022 §4a CI canary recognizes entry_terms as an allow-listed exemption" is a CI configuration concern (an allow-list entry in a canary script), not application code this test suite exercises | Low | Verified by confirming the canary's allow-list file includes `entry_terms`, a Programmer/Code-Review checklist item |
| AC-32 (REQ-21) | "Route registry has CRUD routes for taxonomies/terms/assignment" is thin route-wiring with no domain logic of its own | Low | Covered implicitly once routes are wired to the already-certified `write-service.ts` functions; a route-registration smoke test can be added trivially once the route files exist |
| C-207 cross-domain gateway internals | This package's own `merge-term.ts` tests use a fake `gatewayPlan`/`computeOverlap` seam — SPEC-016's actual `plan()`/`confirm()`/`execute()` ordering, token TTL, and actor-class rule are not re-exercised through this domain's real wiring in this dispatch | Medium | Add one integration test once both SPEC-016's `core/gated-mutations` and this package's `merge-term.ts` are implemented, wiring the real gateway end-to-end for `taxonomy.merge` |
| AC-15a, AC-15b (REQ-12, composite actor identity) | This package's `write-service.unit.test.ts` does not directly assert `(delegatedByWorkspaceId, delegatedById)` population for agent/api_key actors — it reuses SPEC-016's `appendActorReference()` (already certified in `src/core/gated-mutations/__tests__/unit/actor-identity.unit.test.ts`), and this dispatch's revision-row fake does not model the composite shape explicitly | Medium | Add a focused assertion in the next TDD pass once the Programmer's exact revision-row construction (calling `appendActorReference()`) is known, mirroring SPEC-016's own AC-23 test pattern |
| EC-06 / EC-06a (mergeTerm dedup mechanics) | The dedup-on-conflict behavior for overlapping `entry_terms` rows during `executeMergeTerm` is not directly tested (only the plan-time self-merge guard and overlap-disclosure are) | Medium | Add an integration test once `executeMergeTerm`'s real dedup-write logic exists, asserting `entry_terms_unique` prevents a duplicate row after merge |

No High-risk gaps exist. Every P1 acceptance criterion for code inside this package's own module
boundary has test coverage. Both CIC units (U-001, U-002) have observable-surface test coverage,
including all three historical Red-Team regression cases (RT-001, RT-011, RT-012) replayed as
first-class tests.

## Drift Status

- [x] Current spec hash matches certified hash above (`sha256:0dbe6f8750aed1ea94fe94d4cfde31345207c73591cd4bbe93d52f13f3422f60`)
- [x] Current spec hash was verified mechanically via the provider-local validator
- [x] Current test file hashes match the Test File Inventory (`shasum -a 256`, this run)
- [x] Expected test count (37) matches the runnable suite inventory
- [x] All High-risk gaps reviewed by Coordinator — none exist
- [x] No test asserts implementation internals
- [x] All P1 acceptance criteria in this package's own module boundary have semantic assertion coverage
