# Tasks: storage-timeline

- Spec: SPEC-017 v1.3.0 (hash: sha256:bce97937e6e34ec517b57385c80b34cd9a0c7ab33360cf97e081437b438ff6a8)
- ADR: ADR-PIPE-017
- Outline: `ADS-memory/reports/pipeline/017-storage-timeline/implementation-outline.md` (PRODUCED)
- Critical Internal Constraints: `ADS-memory/reports/pipeline/017-storage-timeline/critical-internal-constraints.md` (PRODUCED — U-001 dialect-conditional state machine, U-002 drift classification, U-003 binding reference to SPEC-019 CIC U-001 shared operation lock, U-004 boot-sequence ordering)
- Date: 2026-07-15T00:00:00Z
- Author: TDD Agent (Coordinator step delegated to TDD Agent for this dispatch)

## Format

`[ID] [P?] [Story ref] Description`

- **[P]**: Task can run in parallel — touches different files, no shared mutable state
- Task checkboxes are Coordinator-owned. Implementation, TDD, TestRunner, and Code Review agents
  treat this file as read-only unless the Coordinator explicitly delegates an update.
- **Cross-package note**: `features/recovery` (SPEC-019) and `features/collections`/`categories-and-tags`
  (SPEC-020/018) are out of scope for this file — a separate agent owns their own `tasks.md`. This
  package's C-105 (`executeMigrateForward`) consumes the shared `core/operation-lock.ts` primitive
  (GOV-ADR-002) as a dependency but does not implement or test it here — see `critical-internal-constraints.md`'s
  U-003 binding-reference note and `src/core/__tests__/{unit,integration}/operation-lock.*.test.ts`
  (already written by the parallel SPEC-019 TDD dispatch; read-only reference for this package).

---

## Constraints

### Coverage Profile

- Unit minimums: defaults `98/98/98/98` — no human-approved override
- Integration minimums: defaults `90/90/90/90` — no human-approved override
- E2E minimums: N/A for this dispatch's scope — `ui.spec.md` exists (`DriftBanner`, `PendingMigrationBanner`, `MigrateForwardWizard`) but React component implementation is not part of this TDD pass's module boundary per `implementation-outline.md`'s File Map (backend/domain files only); component tests are deferred to whichever dispatch implements the actual `.tsx` files, per the React Component Testing Policy's Skip Policy (documented reason: no `.tsx`/`.jsx` file is created by this package's own Module Map)
- Convergence threshold before Code Review: default `100%` of P1 acceptance tests and invariants passing

### Required Suites

- Unit: required (state machine, drift classification, tier-3 redaction, agent-tool catalog shape)
- Integration: required (boot-sequence ordering against a real sidecar DB, real SQLite restore-point capture)
- E2E: not applicable — no `.tsx` in this package's own File Map

### Coverage Tool

- Tool: `node --test --experimental-test-coverage` (matches `npm run test:cov`)
- Machine-readable output path: `coverage/lcov.info`
- Cleanup paths before run: `coverage/`

### Naming Convention

Same as SPEC-016 — `__tests__/unit/*.unit.test.ts` / `__tests__/integration/*.integration.test.ts`,
per `ADS-memory/knowledge/project_memory.md`'s 2026-07-15 entry.

---

## Phase 0 — Setup

- [ ] T101 [P] Create `src/features/storage/` module directories (`migrate-forward/`, `boot/`, `__tests__/unit/`, `__tests__/integration/`)
- [ ] T102 [P] Create `src/infra/sqlite/storage-journal-db.ts` / `storage-journal-schema.ts` scaffolding

---

## Phase 1 — Foundational (blocks all story work in this package)

- [ ] T103 [P] Write failing unit tests for the dialect-conditional state machine — `src/features/storage/__tests__/unit/state-machine.unit.test.ts` (C-103, U-001, INV-01, INV-05, INV-06, AC-11–AC-15, AC-40)
- [ ] T104 [P] Write failing unit tests for drift classification — `src/features/storage/__tests__/unit/drift.unit.test.ts` (C-102, U-002, REQ-03, AC-03)
- [ ] T105 [P] Write failing integration tests for boot-sequence ordering — `src/features/storage/__tests__/integration/boot-sequence.integration.test.ts` (C-106, C-107, U-004, INV-08, AC-17, AC-37, AC-38, AC-39)
- [ ] T106 [P] Write failing unit tests for `executeMigrateForward`'s shared-lock wiring — `src/features/storage/__tests__/unit/migrate-forward-execute.unit.test.ts` (C-105, U-003 binding reference, REQ-08, AC-09, AC-41, AC-42)
- [ ] T107 [P] Write failing unit tests for the Timeline read model — `src/features/storage/__tests__/unit/timeline.unit.test.ts` (C-101, REQ-01, REQ-04, REQ-05, AC-01, AC-04, AC-05)
- [ ] T108 [P] Write failing unit tests for restore-point creation — `src/features/storage/__tests__/unit/restore-points.unit.test.ts` (C-108, REQ-22, AC-26, AC-27)
- [ ] T109 [P] Write failing unit tests for the Tier-3 read-only browser's redaction guarantee — `src/features/storage/__tests__/unit/tier3-browser.unit.test.ts` (C-109, INV-07, REQ-25, REQ-26, AC-31–AC-35)
- [ ] T110 [P] Write failing unit tests for the agent-tool catalog shape — `src/features/storage/__tests__/unit/agent-tools.unit.test.ts` (C-110, REQ-20–REQ-23, AC-24, AC-25, AC-28, AC-33)
- [ ] T111 Implement `src/features/storage/migrate-forward/state-machine.ts` (depends on T103; honors CIC U-001's 3 structurally-distinct failure edges)
- [ ] T112 Implement `src/features/storage/drift.ts` (depends on T104; honors CIC U-002's tag-decisive precedence)
- [ ] T113 Implement `src/features/storage/timeline.ts` (depends on T107)
- [ ] T114 Implement `src/infra/sqlite/storage-journal-db.ts` + `storage-journal-schema.ts` (depends on T102)
- [ ] T115 Implement `src/features/storage/restore-points.ts` (depends on T108, T114)
- [ ] T116 Implement `src/features/storage/tier3-browser.ts` (depends on T109)
- [ ] T117 Implement `src/features/storage/migrate-forward/plan.ts` (C-104) and `execute.ts` (C-105) (depends on T106, T111, `core/gated-mutations` from SPEC-016, `core/operation-lock.ts` from SPEC-019)
- [ ] T118 Implement `src/features/storage/boot/reconcile-interrupted-migration.ts` and `evaluate-boot-migration-policy.ts` (depends on T105, T111; boot composition root must wire these strictly sequentially per CIC U-004 — never `[P]` relative to each other)
- [ ] T119 Implement `src/features/storage/agent-tools.ts` (depends on T110)
- [ ] T120 Run all Phase 1 tests to convergence

**Checkpoint**: `features/storage` domain complete and passing — depends on `core/gated-mutations`
(SPEC-016) and `core/operation-lock.ts` (SPEC-019) both existing first.

---

## Phase N — Polish

- [ ] T121 [P] TSDoc for all exported `features/storage` functions
- [ ] T122 [P] Confirm boot composition root wires C-106 → C-107 strictly sequentially (Programmer architecture-audit focus per outline)
- [ ] T123 Record `[CIC_DEVIATION]`/`[CIC_DEVIATION_APPROVED]` for any deviation discovered (none expected)

---

## Parallelization Rules

- T103–T110 (test-writing) can run in parallel — different files, no shared state
- T111–T116 (implementation) can mostly run in parallel once T101/T102 land; T117 depends on T106/T111 AND on `core/gated-mutations`/`core/operation-lock.ts` existing (cross-package dependency — sequence after SPEC-016/019 Programmer work)
- T118 (boot composition) must NOT be split into two parallel tasks for C-106/C-107 — CIC U-004 requires strict sequencing, not just "not parallel in principle"

## Execution Strategy

Sequential within this package for T111–T119 given cross-file dependencies on `core/gated-mutations`
and `core/operation-lock.ts`: Phase 0 → Phase 1 (tests in parallel, then implementation respecting
the dependency graph above) → checkpoint → Phase N.

---

## Coverage Summary Against Acceptance Criteria

- P1 ACs covered: AC-01, AC-03, AC-05, AC-09, AC-11, AC-12, AC-13, AC-15, AC-17, AC-18, AC-20, AC-21, AC-22, AC-24, AC-25, AC-26, AC-31, AC-32, AC-33, AC-34, AC-36, AC-37, AC-38, AC-39, AC-40, AC-41, AC-42
- P2 ACs covered: AC-04, AC-07, AC-14, AC-19, AC-27, AC-35
- Gaps (see `test-certification.md`): AC-06/AC-07 (cost-estimate detail requires SPEC-016's `db-ops.getCapabilities()` wiring — cross-package, Medium risk), AC-16/AC-28/AC-29/AC-30 (Recovery hand-off — blocked on SPEC-019 not existing at outline-authoring time, Medium risk, matches outline's own stated open risk), AC-23 (Postgres `CREATE INDEX CONCURRENTLY` — no Postgres adapter exists, Medium risk, architecturally deferred)
- All 8 invariants (INV-01–INV-08) covered
- All 4 CIC units (U-001, U-002, U-003 binding reference, U-004) covered through their declared observable verification surfaces
