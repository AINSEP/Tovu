# Tasks: collections

- Spec: SPEC-020 v1.4.0 (hash: sha256:5d6a931b381091ca04fddf55e9918227aed20fe895bb1f5a64cc50f33f44f4b6)
- ADR: ADR-PIPE-020
- Outline: `ADS-memory/reports/pipeline/020-collections/implementation-outline.md`
- Critical Internal Constraints: `ADS-memory/reports/pipeline/020-collections/critical-internal-constraints.md`
- Date: 2026-07-15T18:00:00Z
- Author: Coordinator (TDD Agent dispatch, Agent Direct Mode)

## Format

`[ID] [P?] [Story ref] Description`

- **[P]**: Task can run in parallel — touches different files, no shared mutable state with other [P] tasks in the same phase
- **[Story ref]**: Maps to an acceptance criterion or invariant (e.g., AC-01, INV-01)
- Task checkboxes are Coordinator-owned state. TDD, Programmer, TestRunner, and Code Review agents must
  treat this file as read-only unless the Coordinator explicitly delegates a task-list update.
- Tasks touching `index-provisioning.ts` reference Unit **U-001** (DDL-injection prevention — the single
  highest-security-severity unit in this entire 5-package pipeline) and **U-003** (REQ-27/29/30 composition).
  Tasks touching `write-service.ts`'s guard/version ordering reference **U-002**/**U-004**.

---

## Constraints

### Coverage Profile

- Unit minimums: defaults `98/98/98/98` for lines/branches/functions/statements — no human-approved override
- Integration minimums: defaults `90/90/90/90` for lines/branches/functions/statements — no human-approved override
- E2E minimums: N/A — no browser-level E2E harness is in scope for this backend/admin-API domain in this pass; `apps/admin/src/sections/Collections.tsx` UI work (if/when built) is governed separately by the React Component Testing Policy, not this profile
- Convergence threshold before Code Review: **100%** of P1 acceptance tests and invariants passing (default; no human-approved lower value exists for this package)
- **Contract Tests**: Derived from the Implementation Outline's Contract Map — C-401 through C-406, C-409 through C-412. Testing approach: property test for C-403 (index provisioning — DDL safety and composition, the two highest-risk contracts in this package), unit/contract test for C-401/C-402/C-404/C-409/C-410/C-411 (public Validation-column behavior), integration test for C-405 (cleanup gateway instantiation) and W-402/W-403 (cross-module delegation).

### Required Suites

- Unit: required
- Integration: required (cleanup-gateway instantiation W-403; index-provisioning delegation W-402; watermark same-transaction stamping)
- E2E: not applicable — reason recorded above

### Coverage Tool

- Tool: Node built-in test runner coverage (`node --test --experimental-test-coverage`), matching `package.json`'s existing `test:cov` script
- Machine-readable output path: `coverage/lcov.info`
- Cleanup paths before run: `coverage/` (`rm -rf coverage && mkdir -p coverage`, per existing script)
- Per-suite output paths: unit and integration tests run under one `node --test` invocation; suite classification is by filename suffix (`.unit.test.ts` / `.integration.test.ts`)

### Performance (optional)

- Tool: N/A — no explicit latency/throughput NFR stated (ADR-PIPE-020 Quality Attribute Scorecard `performance` axis not activated)
- Targets: N/A
- Pass criteria: N/A

---

## Naming Convention Note

Same override note as `019-backups-recovery/tasks.md`: this package's tests use the AI Dev Shop `test-design`
skill's mandatory `__tests__/unit/`/`__tests__/integration/` + `.unit.test.ts`/`.integration.test.ts`
convention (no documented project-level override exists). Both suffixes still match the existing
`package.json` test glob (`src/**/*.test.ts`).

---

## Phase 0 — Setup

- [ ] T001 [P] Create `src/features/content-types/` directory structure per ADR-PIPE-020 Module Boundaries
- [ ] T002 [P] Create `src/features/entries/` directory structure per ADR-PIPE-020 Module Boundaries
- [ ] T003 [P] Confirm no `content_types`/`entries` tables or code exist yet (brownfield grounding re-check) — already confirmed by ADR-PIPE-020's own grep; no action expected

## Phase 1 — Foundational

Core infrastructure that blocks all field-update/index-affecting stories: the fixed `kind`→`CAST` lookup
table and the field-name/key grammar gate (U-001) — the single highest-severity unit in the 5-package
pipeline — plus the fixed definition-time guard order (U-002).

- [ ] T004 [U-001, INV-03, INV-04, AC-05, AC-06, AC-07] Write failing DDL-injection-safety property tests for `index-provisioning.ts`'s `kind→CAST` lookup and field-name/key grammar gate — `src/features/content-types/__tests__/unit/index-provisioning.ddl-safety.unit.test.ts`. **This is the highest-priority test file in the entire 5-package pipeline** (CIC Downstream Handoff Notes). Must include: adversarial `kind` payloads (e.g. `"text'); DROP TABLE entries;--"`), adversarial field names (e.g. `name"; DROP TABLE entries;--`), and a delimiter-injectivity property test proving no two distinct `(key, name)` pairs encode to the same joined index-identity string (U-001-B3).
- [ ] T005 [U-002, AC-38] Write failing fixed-guard-order tests (key grammar → reserved-key → field-name grammar → field-kind → queryable-cap; first-failure-only reporting) — `src/features/content-types/__tests__/unit/write-service.register.unit.test.ts`
- [ ] T006 Define `content-types`/`entries` port/type shapes only insofar as tests reference them (Programmer-owned; TDD does not implement)

**Checkpoint**: Foundation complete — DDL-safety property suite and guard-order suite are fixed; every downstream story that touches index provisioning or content-type writes builds against this contract.

---

## Phase 2 — [Story: REQ-26/27/29/30, U-003/U-004] Field-update composition and optimistic concurrency (P1)

**Goal**: `updateContentTypeFields`'s full-replace semantics, the 4-combination-class index-provisioning composition (U-003), and `expectedVersion`-checked-first ordering (U-004) — the most combinatorially complex and second-highest-risk story in this package.
**Independent test**: Runnable once Phase 1's lookup table/grammar gate exist as an importable contract.

- [ ] T007 [P] [U-003, INV-09, INV-10, AC-43, AC-52, AC-53, AC-54, AC-55, EC-12, EC-17, EC-18, EC-19] Write failing exhaustive 4-combination-class property test (kind-only change, queryable-only change, both together, newly-introduced field) — `src/features/content-types/__tests__/unit/index-provisioning.composition.unit.test.ts`
- [ ] T008 [P] [U-004, AC-41, AC-42, AC-51, AC-56, EC-11, EC-16] Write failing tests for `updateContentTypeFields`'s expectedVersion-first ordering, full-replace semantics, and the `fields_empty` floor — `src/features/content-types/__tests__/unit/write-service.update-fields.unit.test.ts`
- [ ] T009 Implement `write-service.ts`'s `updateContentTypeFields` + `index-provisioning.ts`'s composition logic (Programmer) to converge T007/T008 (depends on T004)
- [ ] T010 Run tests to convergence

**Checkpoint**: U-003/U-004 Binding constraints encoded and green — the two highest-complexity units after U-001.

---

## Phase 3 — [Story: REQ-09/10/11/12] Content-type lifecycle (P1)

**Goal**: `active ⇄ deprecated → tombstone` state machine, index teardown on tombstone, outbox events.
**Independent test**: Runnable independently once Phase 1's lookup table exists (tombstone tears down indexes via the same fixed mechanism).

- [ ] T011 [P] [INV-06, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, EC-05, EC-06, EC-09] Write failing state-transition tests for `deprecateContentType`/`reactivateContentType`/`tombstoneContentType` — `src/features/content-types/__tests__/unit/lifecycle.unit.test.ts`
- [ ] T012 Implement `lifecycle.ts` (Programmer)
- [ ] T013 Run tests to convergence

**Checkpoint**: AC-13 through AC-20 passing.

---

## Phase 4 — [Story: REQ-20/21] Destructive cleanup ceremony (P1)

**Goal**: `planCleanup`/`confirmCleanup`/`executeCleanup` instantiating `core/gated-mutations`; eligibility gate; atomic multi-table delete.
**Independent test**: Depends on Phase 3 (tombstone status) and SPEC-016's gateway being importable.

- [ ] T014 [P] [AC-31, AC-32, AC-33, EC-09] Write failing eligibility-gate tests (not-tombstoned / retention-window / export-reference, in fixed order) — `src/features/content-types/__tests__/unit/cleanup.unit.test.ts`
- [ ] T015 [P] [AC-34, EC-10] Write failing atomic-multi-table-delete integration test and double-execute staleness test — `src/features/content-types/__tests__/integration/cleanup.execute.integration.test.ts`
- [ ] T016 Implement `cleanup.ts` (Programmer), depends on T011-T013
- [ ] T017 Run tests to convergence

**Checkpoint**: AC-31 through AC-35 passing.

---

## Phase 5 — [Story: REQ-13/14/15/19] Entry CRUD and field-bag validation (P1)

**Goal**: `createEntry`/`updateEntry`, `validateFieldsAgainstSchema`'s envelope-shape-first ordering, orphaned-field read tolerance, type soft-reference validation.
**Independent test**: Depends on Phase 1's content-type schema-read contract existing (one-way dependency: entries reads content-types, never writes it) — otherwise independent of Phases 2-4.

- [ ] T018 [P] [AC-22, AC-23, AC-49, AC-50, EC-07, EC-15] Write failing tests for `validateFieldsAgainstSchema`'s envelope-shape-first ordering and per-field key/required/kind checks — `src/features/entries/__tests__/unit/field-validation.unit.test.ts`
- [ ] T019 [P] [AC-21, AC-29, AC-30] Write failing tests for `createEntry`'s slug-uniqueness and type-existence/workspace-ownership validation — `src/features/entries/__tests__/unit/write-service.create.unit.test.ts`
- [ ] T020 [P] [AC-24, EC-08] Write failing test for orphaned-field read tolerance — `src/features/entries/__tests__/unit/field-validation.unit.test.ts` (co-located with T018; same contract, `selectVisibleEntryFields`)
- [ ] T021 [P] [REQ-28, AC-44, AC-45, AC-46, EC-13, EC-14] Write failing tests for `updateEntry`/`publishEntry`/`unpublishEntry` vs. tombstone/deprecated owning-type distinction — `src/features/entries/__tests__/unit/write-service.update-publish.unit.test.ts`
- [ ] T022 Implement `entries/write-service.ts` and `entries/field-validation.ts` (Programmer)
- [ ] T023 Run tests to convergence

**Checkpoint**: AC-21 through AC-30, AC-44 through AC-50 passing.

---

## Phase 6 — [Story: REQ-07/08/16/17, REQ-22/23] Watermark/revision/actor-identity and agent-tool/permission gating (P1)

**Goal**: Same-transaction watermark stamping and revision append with composite actor identity on both write chokepoints; agent-tool catalog correctness; permission gating.
**Independent test**: Depends on Phases 2-5's write chokepoints existing (this is largely a cross-cutting verification story, not a new module).

- [ ] T024 [P] [INV-08, AC-11, AC-12, AC-26, AC-47, AC-48] Write failing tests for same-transaction watermark stamping and `(delegatedByWorkspaceId, delegatedById)` actor-identity propagation — `src/features/content-types/__tests__/integration/watermark-stamping.integration.test.ts`
- [ ] T025 [P] [AC-35] Write failing tests for the content-types agent-tool catalog (no `collections_confirm_cleanup` tool) — `src/features/content-types/__tests__/unit/agent-tools.unit.test.ts`
- [ ] T026 [P] [AC-36, AC-37] Write failing tests for permission gating across both libraries — `src/features/content-types/__tests__/unit/permissions.unit.test.ts`
- [ ] T027 Implement remaining wiring (Programmer)
- [ ] T028 Run tests to convergence

**Checkpoint**: All P1 ACs across Phases 1-6 passing — story independently testable and complete.

---

## Phase N — Polish

- [ ] T029 [P] Documentation updates (module-level TSDoc per `testable-design-patterns` skill)
- [ ] T030 [P] Additional unit tests for pure logic gaps found during TestRunner pass (e.g. `ENTRY_VALIDATE_FIELDS` dry-run route-level AC-39/AC-40 if not already covered by T018)
- [ ] T031 Security hardening pass — confirm no DDL-generation code path bypasses the fixed lookup table anywhere in `features/content-types` (Code Review Agent enforcement per ADR-PIPE-020/GOV-ADR-003)

---

## Parallelization Rules

- Tasks marked [P] in the same phase can be dispatched simultaneously.
- `features/entries`'s tasks (Phase 5) depend on `features/content-types`'s schema-read contract existing
  first (one-way dependency per the Implementation Outline); do not parallelize Phase 5 writes against
  Phase 1-4 writes to the same content-type schema files.
- No Programmer instance writes to a file another instance reads within the same phase.

## Execution Strategies

**Sequential (single agent):** Phase 0 → Phase 1 checkpoint → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase N

**Parallel (multiple Programmer instances):** Phase 0 → Phase 1 checkpoint → Phases 2, 3 simultaneously (both build on Phase 1's lookup table, touch disjoint files) → Phase 4 (needs Phase 3) + Phase 5 (needs only Phase 1) simultaneously → Phase 6 (needs Phases 2-5) → TestRunner aggregates → Phase N
