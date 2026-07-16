# Tasks: categories-and-tags

- Spec: SPEC-018 v1.3.0 (hash: sha256:0dbe6f8750aed1ea94fe94d4cfde31345207c73591cd4bbe93d52f13f3422f60)
- ADR: ADR-PIPE-018
- Outline: `ADS-memory/reports/pipeline/018-categories-and-tags/implementation-outline.md` (PRODUCED)
- Critical Internal Constraints: `ADS-memory/reports/pipeline/018-categories-and-tags/critical-internal-constraints.md` (PRODUCED — U-001 fixed validation-chain ordering, U-002 cycle-detection algorithm)
- Date: 2026-07-15T00:00:00Z
- Author: TDD Agent (Coordinator step delegated to TDD Agent for this dispatch)

## Format

`[ID] [P?] [Story ref] Description`

- **[P]**: Task can run in parallel — touches different files, no shared mutable state
- Task checkboxes are Coordinator-owned. Implementation, TDD, TestRunner, and Code Review agents
  treat this file as read-only unless the Coordinator explicitly delegates an update.
- This package's tasks have no hard sequencing dependency on SPEC-017/019/020's own tasks — only a
  design-time (not task-ordering) dependency on ADR-043/SPEC-020's reserved-key guarantee (per
  `implementation-outline.md`'s own Downstream Handoff Notes), and a code dependency on
  `core/gated-mutations` (SPEC-016) for `mergeTerm` only.

---

## Constraints

### Coverage Profile

- Unit minimums: defaults `98/98/98/98` — no human-approved override
- Integration minimums: defaults `90/90/90/90` — no human-approved override
- E2E minimums: N/A — this package's `ui.spec.md` React components are not part of this TDD pass's
  module boundary (backend/domain files only, per `implementation-outline.md`'s File Map); deferred
  to whichever dispatch implements the `.tsx` files, per React Component Testing Policy's Skip
  Policy
- Convergence threshold before Code Review: default `100%` of P1 acceptance tests and invariants passing

### Required Suites

- Unit: required (validation chain, cycle detection, write-service contract behavior, mergeTerm gateway instantiation)
- Integration: required (content-deletion event cleanup, same-transaction watermark+outbox stamping)
- E2E: not applicable — no `.tsx` in this package's own File Map

### Coverage Tool

- Tool: `node --test --experimental-test-coverage` (matches `npm run test:cov`)
- Machine-readable output path: `coverage/lcov.info`
- Cleanup paths before run: `coverage/`

### Naming Convention

Same as SPEC-016/017 — `__tests__/unit/*.unit.test.ts` / `__tests__/integration/*.integration.test.ts`,
per `ADS-memory/knowledge/project_memory.md`'s 2026-07-15 entry.

---

## Phase 0 — Setup

- [ ] T201 [P] Create `src/features/taxonomy/` module directories (`__tests__/unit/`, `__tests__/integration/`)

---

## Phase 1 — Foundational (blocks all story work in this package)

- [ ] T202 [P] Write failing unit tests for the fixed validation-chain ordering — `src/features/taxonomy/__tests__/unit/validation-chain.unit.test.ts` (C-208, U-001, REQ-06–REQ-11, behavior.spec.md §2.1, AC-07/AC-09/AC-11/AC-12/AC-12a/AC-12b/AC-13)
- [ ] T203 [P] Write failing unit tests for the cycle-detection algorithm — `src/features/taxonomy/__tests__/unit/cycle-detection.unit.test.ts` (C-203, U-002, INV-03, REQ-11, EC-05/EC-05a/EC-05b, AC-14)
- [ ] T204 [P] Write failing unit tests for the write-service's ordinary mutations — `src/features/taxonomy/__tests__/unit/write-service.unit.test.ts` (C-201–C-206, REQ-01–REQ-05, REQ-12–REQ-14, REQ-17, AC-01–AC-06, AC-15–AC-20, AC-25, AC-26, INV-01, INV-02, INV-04, INV-05)
- [ ] T205 [P] Write failing unit tests for `mergeTerm`'s gateway instantiation — `src/features/taxonomy/__tests__/unit/merge-term.unit.test.ts` (C-207, REQ-15, REQ-15a, REQ-16, AC-21–AC-24, AC-22a, INV-06, INV-08)
- [ ] T206 [P] Write failing integration tests for content-deletion cleanup — `src/features/taxonomy/__tests__/integration/content-deletion-cleanup.integration.test.ts` (C-206, W-203, REQ-18, REQ-19, AC-27–AC-29, INV-07)
- [ ] T207 Implement `src/features/taxonomy/validation-chain.ts` (depends on T202, T203; honors CIC U-001's fixed 6-step order and U-002's full-descendant-walk cycle check)
- [ ] T208 Implement `src/features/taxonomy/write-service.ts` (depends on T204, T207)
- [ ] T209 Implement `src/features/taxonomy/merge-term.ts` (depends on T205, T207, `core/gated-mutations` from SPEC-016)
- [ ] T210 [P] Implement `src/features/taxonomy/repo.memory.ts` / `repo.sqlite.ts` (rule-of-two adapters, mirrors `src/redirects/` precedent)
- [ ] T211 [P] Add `taxonomies`/`terms`/`entry_terms`/`taxonomy_revisions` tables to `src/infra/db/schema.ts` (additive only)
- [ ] T212 Run all Phase 1 tests to convergence

**Checkpoint**: `features/taxonomy` domain complete and passing — `mergeTerm`'s own tests depend on
`core/gated-mutations` (SPEC-016) existing; all other tasks in this package have no cross-package
code dependency.

---

## Phase N — Polish

- [ ] T213 [P] TSDoc for all exported `features/taxonomy` functions
- [ ] T214 [P] Confirm `assignTerms`/`unassignTerms` never produce a `taxonomy_revisions` row (Programmer architecture-audit focus per outline)
- [ ] T215 Record `[CIC_DEVIATION]`/`[CIC_DEVIATION_APPROVED]` for any deviation discovered (none expected)

---

## Parallelization Rules

- T202–T206 (test-writing) run in parallel — different files, no shared state
- T207 (validation-chain implementation) blocks T208/T209 — both consume it
- T210/T211 can run in parallel with T207–T209

## Execution Strategy

Phase 0 → Phase 1 (tests in parallel T202–T206, then T207 → T208/T209 [P] with T210/T211 [P]) →
checkpoint → Phase N.

---

## Coverage Summary Against Acceptance Criteria

- P1 ACs covered: AC-01, AC-02, AC-03, AC-04, AC-06, AC-07, AC-09, AC-10, AC-11, AC-12, AC-12a, AC-12b, AC-13, AC-14, AC-15, AC-15a, AC-15b, AC-16, AC-17, AC-19, AC-20, AC-21, AC-22, AC-22a, AC-23, AC-25, AC-27, AC-28, AC-29, AC-30, AC-31, AC-32, AC-33
- P2 ACs covered: AC-24, AC-26
- Gaps (see `test-certification.md`): AC-05 (query-plan/indexed-lookup assertion — requires a real SQLite adapter with `EXPLAIN QUERY PLAN`, Medium risk), AC-08 (mechanism-level call-count assertion the spec itself says is architectural-review-verified, not behavioral — Low risk), AC-18 (ADR-022 CI canary allow-list entry — a CI configuration concern, not a unit test, Low risk), AC-32 (route registry existence — thin route-wiring, Low risk)
- All 8 invariants (INV-01–INV-08) covered
- Both CIC units (U-001, U-002) covered through their declared observable verification surfaces
