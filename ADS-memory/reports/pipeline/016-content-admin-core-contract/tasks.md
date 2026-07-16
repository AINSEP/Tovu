# Tasks: content-admin-core-contract

- Spec: SPEC-016 v1.4.0 (hash: sha256:eade503dc1cc72dddad16eb54f3098dada29954493b6d8f964ac51ca0e06194f)
- ADR: ADR-PIPE-016
- Outline: `ADS-memory/reports/pipeline/016-content-admin-core-contract/implementation-outline.md` (PRODUCED)
- Critical Internal Constraints: `ADS-memory/reports/pipeline/016-content-admin-core-contract/critical-internal-constraints.md` (PRODUCED — U-001 execute() ordering, U-002 watermark atomicity, U-003 token redemption concurrency, U-004 boot reconciliation direction)
- Date: 2026-07-15T00:00:00Z
- Author: TDD Agent (Coordinator step delegated to TDD Agent for this dispatch)

## Format

`[ID] [P?] [Story ref] Description`

- **[P]**: Task can run in parallel — touches different files, no shared mutable state with other [P] tasks in the same phase
- **[Story ref]**: Maps to an acceptance criterion or invariant (e.g., AC-01, INV-01)
- Task checkboxes are Coordinator-owned state. Implementation, TDD, TestRunner, and Code Review
  agents must treat this file as read-only unless the Coordinator explicitly delegates a task-list
  update.

---

## Constraints

### Coverage Profile

- Unit minimums: defaults `98/98/98/98` for lines/branches/functions/statements — no human-approved override recorded
- Integration minimums: defaults `90/90/90/90` — no human-approved override recorded
- E2E minimums: N/A — this package has no UI/browser surface (`ui.spec.md` is OMITTED per `spec-manifest.md`; no `.tsx`/`.jsx` files touched)
- Convergence threshold before Code Review: default `100%` of P1 acceptance tests and invariants passing — no human-approved lower threshold exists
- **Contract Tests**: Required for every Contract Map entry (C-001–C-008) per `implementation-outline.md` — testing approach is integration-style (real dependency-injected fakes/in-memory adapters and a real SQLite adapter for `DbOpsPort`), not consumer-driven/schema-validation, since these are internal module contracts, not externally-versioned wire contracts.

### Required Suites

- Unit: required (pure decision logic — gateway ordering, token lifecycle, actor-identity population, watermark input validation)
- Integration: required (real `better-sqlite3`-backed `content.db` for same-transaction watermark atomicity, boot reconciliation, and the SQLite `DbOpsPort` adapter)
- E2E: not applicable — no browser/UI surface in this package

### Coverage Tool

- Tool: Node's built-in `node --test --experimental-test-coverage` (matches this repo's existing `npm run test:cov` script; no separate c8/istanbul dependency exists in `package.json`)
- Machine-readable output path: `coverage/lcov.info` (per existing `test:cov` script's `--test-reporter=lcov --test-reporter-destination=coverage/lcov.info`)
- Cleanup paths before run: `coverage/`
- Per-suite output paths: unit and integration tests share one lcov report (this repo's existing convention does not split coverage output by suite type); e2e N/A

### Naming Convention Note (documented override — see `ADS-memory/knowledge/project_memory.md`)

This repo's pre-existing `src/**/__tests__/*.test.ts` files use flat `.test.ts` naming with `node:test` + `node:assert/strict`, no `unit`/`integration` subdirectories. Per this Coordinator dispatch's explicit instruction (and consistent with the AI Dev Shop default absent a recorded override until this run), all NEW pipeline-numbered feature work (SPEC-016 onward) uses the AI Dev Shop-mandated `__tests__/unit/*.unit.test.ts` and `__tests__/integration/*.integration.test.ts` convention so pipeline test provenance is unambiguous. This is recorded as a project-memory entry (see that file) rather than re-litigated per package.

---

## Phase 0 — Setup

- [ ] T001 [P] Create `src/core/gated-mutations/` module directory
- [ ] T002 [P] Create `src/core/gated-mutations/__tests__/unit/` and `.../integration/` directories

---

## Phase 1 — Foundational

Core infrastructure that blocks all stories — the shared gated-mutation gateway module every dependent domain (SPEC-017/018/019/020) consumes. No story work in dependent domains begins until this phase's contracts exist.

- [ ] T003 [P] Write failing unit tests for `DbOpsPort`/`AuthorizeFn` type contracts and SQLite `getCapabilities()` — `src/core/gated-mutations/__tests__/integration/db-ops.integration.test.ts` (C-007, C-008, REQ-19–21, AC-28, AC-29, AC-30, AC-31, AC-33, AC-36, AC-37)
- [ ] T004 [P] Write failing unit tests for the confirmation-token lifecycle — `src/core/gated-mutations/__tests__/unit/token.unit.test.ts` (C-005, U-003, INV-03, INV-04, state.spec.md §3)
- [ ] T005 [P] Write failing unit tests for watermark stamping (transaction-boundary validation) — `src/core/gated-mutations/__tests__/unit/watermark.unit.test.ts` (C-004, U-002-B1, REQ-01, AC-01, AC-02)
- [ ] T006 [P] Write failing integration tests for watermark same-transaction atomicity against real SQLite — `src/core/gated-mutations/__tests__/integration/watermark-transaction.integration.test.ts` (U-002-B2, INV-01, EC-01, AC-39/AC-40 documented as Postgres-deferred gap)
- [ ] T007 [P] Write failing integration tests for boot-time mirror reconciliation — `src/core/gated-mutations/__tests__/integration/boot-reconciliation.integration.test.ts` (U-004, REQ-03–05, AC-04, AC-05, AC-06, EC-05)
- [ ] T008 Write failing unit tests for `plan()`/`confirm()`/`execute()` gateway ordering and contracts — `src/core/gated-mutations/__tests__/unit/gateway.unit.test.ts` (C-001, C-002, C-003, U-001, INV-05, INV-08, REQ-09–15, AC-09–AC-22, AC-35, AC-38) (depends on T004's token contract shape)
- [ ] T009 [P] Write failing unit tests for composite actor-identity population — `src/core/gated-mutations/__tests__/unit/actor-identity.unit.test.ts` (C-006, REQ-16–18, INV-06, INV-07, AC-23–AC-27)
- [ ] T010 Implement `src/core/gated-mutations/ports.ts` (`DbOpsPort`, `AuthorizeFn`-shaped type) — `src/core/gated-mutations/ports.ts`
- [ ] T011 Implement `src/core/gated-mutations/token.ts` (mint/redeem/expire, atomic conditional redemption per U-003-B1) — `src/core/gated-mutations/token.ts` (depends on T010)
- [ ] T012 Implement `src/core/gated-mutations/watermark.ts` (stampWatermark, RECONCILE_MIRROR, same-transaction guard per U-002-B1) — `src/core/gated-mutations/watermark.ts` (depends on T010)
- [ ] T013 Implement `src/core/gated-mutations/actor-identity.ts` (appendActorReference) — `src/core/gated-mutations/actor-identity.ts` (depends on T010)
- [ ] T014 Implement `src/core/gated-mutations/gateway.ts` (plan/confirm/execute, fixed check-sequence per U-001) — `src/core/gated-mutations/gateway.ts` (depends on T011, T012, T013)
- [ ] T015 [P] Add `storage_write_watermark` column to `src/infra/db/schema.ts` (additive only) — `src/infra/db/schema.ts`
- [ ] T016 Implement `src/infra/sqlite/db-ops.ts` (SQLite `DbOpsPort` adapter, whole-file online-backup) — `src/infra/sqlite/db-ops.ts` (depends on T010, T015)
- [ ] T017 Run all Phase 1 tests to convergence (100% of P1 ACs/invariants passing)

**Checkpoint**: `core/gated-mutations` module complete and passing — SPEC-017/018/019/020's own task phases (owned by other packages/agents) may now begin in parallel relative to each other.

---

## Phase N — Polish

- [ ] T018 [P] Add TSDoc to all exported `core/gated-mutations` functions per `coding-foundations`/`testable-design-patterns`
- [ ] T019 [P] Confirm no dependent-domain code hand-rolls its own plan/confirm/execute sequence (Programmer architecture-audit focus per outline's Downstream Handoff Notes)
- [ ] T020 Record `[CIC_DEVIATION]`/`[CIC_DEVIATION_APPROVED]` entries for any deviation discovered during implementation (none expected)

---

## Parallelization Rules

- Tasks marked [P] in the same phase can be dispatched simultaneously
- T008 (gateway tests) depends on T004's token contract shape existing first (in test form) since gateway tests use `token.ts`'s exported types as a fake seam
- T011–T013 (implementation) can proceed in parallel once T010 (`ports.ts`) lands; T014 (gateway) depends on all three
- No Programmer instance writes to a file another instance reads

## Execution Strategy

Sequential within this package (single Programmer instance is the expected default given the tight interdependency of gateway.ts on token.ts/watermark.ts/actor-identity.ts): Phase 0 → Phase 1 (tests T003–T009 in parallel, then implementation T010 → T011/T012/T013 [P] → T014 → T015/T016) → checkpoint → Phase N.

---

## Coverage Summary Against Acceptance Criteria

- P1 ACs with dedicated test coverage in this dispatch: AC-01, AC-02, AC-03 (documented gap — see test-certification gaps), AC-05, AC-06, AC-07, AC-09, AC-10, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-27, AC-28, AC-29, AC-30, AC-31, AC-32 (gap), AC-33, AC-35, AC-38, AC-39 (gap — Postgres deferred)
- P2 ACs with dedicated test coverage: AC-04, AC-11, AC-34 (gap — doc-audit only), AC-36, AC-37, AC-40 (gap — Postgres deferred)
- All 7 invariants (INV-01–INV-07) covered
- All 4 CIC designated units (U-001–U-004) covered through their declared observable verification surfaces
- See `test-certification.md` for the full requirement-to-test matrix and explicit gap list with risk levels.
