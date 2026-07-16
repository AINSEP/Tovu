# Tasks: backups-recovery

- Spec: SPEC-019 v1.1.0 (hash: sha256:eb0588d10723af1981dbad16975255bc05681df346246287a9c546514c854f4d)
- ADR: ADR-PIPE-019
- Outline: `ADS-memory/reports/pipeline/019-backups-recovery/implementation-outline.md`
- Critical Internal Constraints: `ADS-memory/reports/pipeline/019-backups-recovery/critical-internal-constraints.md`
- Date: 2026-07-15T18:00:00Z
- Author: Coordinator (TDD Agent dispatch, Agent Direct Mode)

## Format

`[ID] [P?] [Story ref] Description`

- **[P]**: Task can run in parallel — touches different files, no shared mutable state with other [P] tasks in the same phase
- **[Story ref]**: Maps to an acceptance criterion or invariant (e.g., AC-01, INV-01)
- Task checkboxes are Coordinator-owned state. TDD, Programmer, TestRunner, and Code Review agents must
  treat this file as read-only unless the Coordinator explicitly delegates a task-list update.
- Tasks touching `core/operation-lock.ts` reference Unit U-001 (CIC) and are **shared with SPEC-017**
  (Storage/Timeline) — neither domain's gated-mutation tasks are complete until this primitive exists and
  both domains consume it identically (GOV-ADR-002). Tasks touching `recovery-orchestrator.ts`'s
  confirm/plan steps reference U-002/U-003.

---

## Constraints

### Coverage Profile

- Unit minimums: defaults `98/98/98/98` for lines/branches/functions/statements — no human-approved override
- Integration minimums: defaults `90/90/90/90` for lines/branches/functions/statements — no human-approved override
- E2E minimums: N/A for this pass — no browser-level E2E harness is in scope for this backend/admin-API domain; UI component-level coverage is governed by the React Component Testing Policy for any `.tsx` work, not this profile
- Convergence threshold before Code Review: **100%** of P1 acceptance tests and invariants passing (default; no human-approved lower value exists for this package)
- **Contract Tests**: Derived directly from the Implementation Outline's Contract Map — C-301 through C-309 (see Phase mapping below). Testing approach: integration test for cross-module/cross-domain contracts (C-303, C-309), unit/property test for pure decision contracts (C-301, C-305, C-306, C-308), state-transition test for none (no dedicated state-machine unit in this domain beyond what C-301-C-303's public Validation columns already capture).

### Required Suites

- Unit: required
- Integration: required (cross-domain lock contention W-302/W-303, progress-panel refresh-safety W-304)
- E2E: not applicable — no browser-level E2E harness exists in this repo for backend/admin-API domains; reason recorded above

### Coverage Tool

- Tool: Node built-in test runner coverage (`node --test --experimental-test-coverage`), matching `package.json`'s existing `test:cov` script
- Machine-readable output path: `coverage/lcov.info` (per existing `test:cov` script `--test-reporter=lcov --test-reporter-destination=coverage/lcov.info`)
- Cleanup paths before run: `coverage/` (matches existing `test:cov` script's `rm -rf coverage && mkdir -p coverage`)
- Per-suite output paths: unit and integration tests both run under the same `node --test` invocation (this repo does not split coverage output per suite type); TestRunner distinguishes suite-level pass/fail by test-file-name convention (`.unit.test.ts` vs `.integration.test.ts`)

### Performance (optional)

- Tool: N/A — no explicit latency/throughput NFR is stated for this domain (ADR-PIPE-019 Quality Attribute Scorecard, `performance` axis not activated — no stated budget)
- Targets: N/A
- Pass criteria: N/A

---

## Naming Convention Note

This repo's pre-existing test suite predominantly uses flat `__tests__/*.test.ts` (Node test runner glob
`src/**/*.test.ts`). No override for the AI Dev Shop `test-design` skill's mandatory
`__tests__/unit/`/`__tests__/integration/` + `.unit.test.ts`/`.integration.test.ts` convention is recorded in
`ADS-memory/knowledge/project_memory.md`. Per the skill's explicit rule ("without an explicit override, this
directory rule is mandatory"), this package's tests use the mandatory convention. Both suffixes still match
the existing `package.json` test glob (`src/**/*.test.ts`), so no script change is required to run them.

---

## Phase 0 — Setup

- [ ] T001 [P] Create `src/core/` addition point for the new shared lock primitive (no new directory needed — `src/core/operation-lock.ts` is a single new file per the Module Map)
- [ ] T002 [P] Create `src/features/recovery/` directory structure per ADR-PIPE-019 Module Boundaries (`recovery-orchestrator.ts`, `restore-points.ts`, `disclosure.ts`, `deep-link.ts`, `agent-tools.ts`, `ui/`)
- [ ] T003 [P] Confirm no `backup`/`recovery`/`operation-lock` code exists yet (brownfield grounding re-check) — already confirmed by ADR-PIPE-019's own grep; no action expected

## Phase 1 — Foundational

Core infrastructure that blocks all stories: the shared cross-domain lock (U-001) and its own port/type shapes.

- [ ] T004 [U-001] Write failing tests for `acquireOperationLock`/`releaseOperationLock` (C-309) — `src/core/__tests__/unit/operation-lock.unit.test.ts`
- [ ] T005 [U-001] Write failing cross-domain concurrent-acquire property test — `src/core/__tests__/integration/operation-lock.cross-domain.integration.test.ts` (this is the highest-priority test in the entire 019/020 dispatch per both packages' CIC Downstream Handoff Notes)
- [ ] T006 Define `core/operation-lock.ts`'s port/type shapes only insofar as tests reference them (Programmer-owned; TDD does not implement)

**Checkpoint**: Foundation complete — `core/operation-lock.ts`'s test contract is fixed; SPEC-017's own migrate-forward `execute()` tasks and this package's `executeRestore`/`createRestorePoint` tasks can both proceed against it (do not duplicate U-001's test in SPEC-017's package — it is designated once, here, per the CIC's Design Context).

---

## Phase 2 — [Story: REQ-06/REQ-08, U-002/U-003] Restore ceremony (plan/confirm/execute) (P1)

**Goal**: The gated restore ceremony (`plan()`→disclosure→`confirm()`→`execute()`) is fully covered, including the two Security-Critical Sequencing units (U-002 disclosure-acknowledgment gate, U-003 fresh costClass recheck).
**Independent test**: Runnable in isolation once `core/gated-mutations` (SPEC-016) and `core/operation-lock.ts` (Phase 1) exist as importable modules — no dependency on Phase 3/4 stories.

- [ ] T007 [P] [U-003, AC-06, AC-13, EC-05] Write failing tests for `planRestore` fresh-costClass-recheck — `src/features/recovery/__tests__/unit/recovery-orchestrator.plan-restore.unit.test.ts`
- [ ] T008 [P] [U-002, AC-14, AC-15] Write failing tests for `confirmRestore`'s disclosure-acknowledgment + planId-provenance composite gate — `src/features/recovery/__tests__/unit/recovery-orchestrator.confirm-restore.unit.test.ts`
- [ ] T009 [U-001-ORD1, AC-21, AC-22, AC-26, AC-28, EC-04, EC-07] Write failing tests for `executeRestore`'s lock-consult-before-mutate ordering, actor-class redemption, completion deep-link, and `PENDING_MIGRATION` non-interference — `src/features/recovery/__tests__/integration/recovery-orchestrator.execute-restore.integration.test.ts` (depends on T004/T005)
- [ ] T010 [P] [REQ-26, AC-36, AC-12] Write failing tests for uniform ceremony ordering (no cheap-path shortcut; no direct single-call endpoint) — `src/features/recovery/__tests__/integration/restore-flow-ordering.integration.test.ts`
- [ ] T011 Implement `recovery-orchestrator.ts` (Programmer) to converge T007-T010
- [ ] T012 Run tests to convergence

**Checkpoint**: Restore ceremony passing — U-002/U-003 Binding constraints encoded and green.

---

## Phase 3 — [Story: REQ-05] Restore-point creation (ordinary mutation) (P1)

**Goal**: `createRestorePoint` as a non-gated, `authorize()`-first mutation, structurally distinct from the ceremony.
**Independent test**: Runnable in isolation; only depends on Phase 1's lock primitive for the in-flight check.

- [ ] T013 [P] [REQ-05, AC-10, AC-11] Write failing tests for `createRestorePoint` — `src/features/recovery/__tests__/unit/restore-points.unit.test.ts`
- [ ] T014 Implement `restore-points.ts` (Programmer)
- [ ] T015 Run tests to convergence

**Checkpoint**: AC-10/AC-11 passing.

---

## Phase 4 — [Story: REQ-09/REQ-10/REQ-11] Disclosure computation (P1)

**Goal**: `computeDisclosure`'s covered-category restriction and unknown-baseline rendering.
**Independent test**: Pure-function level; no dependency on other phases.

- [ ] T016 [P] [INV-05, AC-16, AC-17, AC-19, EC-02, EC-08] Write failing tests for `computeDisclosure` — `src/features/recovery/__tests__/unit/disclosure.unit.test.ts`
- [ ] T017 Implement `disclosure.ts` (Programmer)
- [ ] T018 Run tests to convergence

**Checkpoint**: AC-16/17/18/19 passing.

---

## Phase 5 — [Story: REQ-20/REQ-21] Deep-link resolution (P1)

**Goal**: `resolveDeepLinkContext` never trusts the envelope; always re-looks-up server-side.
**Independent test**: Pure read-path; no dependency on other phases.

- [ ] T019 [P] [INV-04, AC-30, AC-31, EC-03] Write failing tests for `resolveDeepLinkContext` — `src/features/recovery/__tests__/unit/deep-link.unit.test.ts`
- [ ] T020 Implement `deep-link.ts` (Programmer)
- [ ] T021 Run tests to convergence

**Checkpoint**: AC-30/AC-31 passing.

---

## Phase 6 — [Story: REQ-23/24/25, REQ-02] Agent-tool catalog and permission gating (P1)

**Goal**: Catalog exposes only the correct tools (no `confirm`-equivalent); permission gates hold for read/create/restore.
**Independent test**: Catalog inspection + permission-fixture level; depends on Phase 2/3's orchestrator exports existing (can stub if sequenced earlier).

- [ ] T022 [P] [INV-06, AC-33, AC-34, AC-35] Write failing tests for the agent-tool catalog — `src/features/recovery/__tests__/unit/agent-tools.unit.test.ts`
- [ ] T023 [P] [AC-03, AC-04, AC-05] Write failing tests for route/tool permission gating — `src/features/recovery/__tests__/unit/permissions.unit.test.ts`
- [ ] T024 Implement `agent-tools.ts` (Programmer)
- [ ] T025 Run tests to convergence

**Checkpoint**: AC-33/34/35 and AC-03/04/05 passing.

---

## Phase 7 — [Story: REQ-01/REQ-13/REQ-17/REQ-19/REQ-22/REQ-27] Screen-level routing and degraded banners (P1/P2)

**Goal**: Distinct route, cross-screen in-flight blocking display, banner precedence, sitemap supersession.
**Independent test**: Depends on Phase 1 (lock) and Phase 2 (ceremony) being importable for the in-flight signal.

- [ ] T026 [P] [AC-27, AC-29, INV-07, EC-06] Write failing tests for degraded-banner precedence resolver (C-308) — `src/features/recovery/__tests__/unit/degraded-banners.unit.test.ts`
- [ ] T027 [P] [AC-01, AC-02, AC-32, AC-37, AC-38] Write failing tests for route independence, no raw-DB affordance, and sitemap supersession — `src/features/recovery/__tests__/integration/recovery-route.integration.test.ts`
- [ ] T028 Implement remaining screen wiring (Programmer)
- [ ] T029 Run tests to convergence

**Checkpoint**: All P1 ACs across Phases 2-7 passing — story independently testable and complete.

---

## Phase N — Polish

- [ ] T030 [P] Documentation updates (module-level TSDoc per `testable-design-patterns` skill)
- [ ] T031 [P] Additional unit tests for pure logic gaps found during TestRunner pass
- [ ] T032 Security hardening pass — confirm no independent in-flight-lock reimplementation exists anywhere in `features/recovery` (Code Review Agent enforcement per ADR-PIPE-019/GOV-ADR-002)

---

## Parallelization Rules

- Tasks marked [P] in the same phase can be dispatched simultaneously.
- No Programmer instance writes to a file another instance reads within the same phase.
- `core/operation-lock.ts` (Phase 1) is a shared, cross-package dependency — do not parallelize its own implementation task against SPEC-017's equivalent consumption task; SPEC-017's own tasks.md must reference this same file, not a duplicate.

## Execution Strategies

**Sequential (single agent):** Phase 0 → Phase 1 checkpoint → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase N

**Parallel (multiple Programmer instances):** Phase 0 → Phase 1 checkpoint → Phases 3, 4, 5 simultaneously (independent modules) while Phase 2 proceeds (needs Phase 1's lock) → Phase 6 (needs Phase 2/3 orchestrator exports) → Phase 7 (needs Phase 1+2) → TestRunner aggregates → Phase N
