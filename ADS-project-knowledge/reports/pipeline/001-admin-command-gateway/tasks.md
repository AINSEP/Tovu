# Tasks: admin-command-gateway

- Spec: SPEC-001 v1.0.0 (hash: sha256:768af10e49fcde7a6e8d9dc0f4b1193c0302201a480afc01d9fe20fafe25e5d6) — audit-reconciled 2026-07-07 (was 0230e96c…c7a0; external-audit F1–F4 applied + Red-Team re-affirmed)
- ADR: ADR-018
- Outline: ADS-project-knowledge/reports/pipeline/001-admin-command-gateway/implementation-outline.md
- Date: 2026-07-07T04:35:00Z
- Author: Coordinator

## Format

`[ID] [P?] [Story ref] Description` — [P] = parallel-safe (different files, no shared mutable state within the phase). Phases + order derived from the implementation outline's Module Map, Wiring Map, and downstream phase plan.

Task checkboxes are **Coordinator-owned state**. TDD, Programmer, TestRunner, and Code Review treat this file as **read-only** unless the Coordinator explicitly delegates a task-list update.

---

## Constraints

### Coverage Profile

- Unit minimums: defaults `98/98/98/98` (lines/branches/functions/statements). **Flag:** the repo has no coverage tool wired; node:test built-in coverage may warrant a human-approved override once measured — Coordinator to confirm at first TestRunner report.
- Integration minimums: defaults `90/90/90/90`.
- E2E minimums: N/A — no E2E suite in this backend slice (see Required Suites).
- Convergence threshold before Code Review: default `100%` of P1 acceptance tests (AC-01…AC-03, AC-05…AC-08, AC-10…AC-16) and all invariants (INV-01…INV-05 + INV-006) passing. No lower threshold requested.
- **Contract Tests** (from outline): `ChangeSetRepoPort` shared suite (both adapters); inverse-applier registry resolve/miss.

### Required Suites

- Unit: **required** — gateway ordering, idempotency, revert guard/registry, version monotonicity, concurrency CAS.
- Integration: **required** — 5 HTTP endpoints via the existing `src/server/__tests__/` route harness; response-shape compat assertions on the 2 rewired routes.
- E2E: **not applicable** — no browser/CLI end-to-end surface in this slice (admin UI + agent bridge are out of scope per SPEC-001).

### Coverage Tool

- Tool: node:test built-in coverage — `node --import tsx --test --experimental-test-coverage` (no new dependency; matches existing `npm test`).
- Machine-readable output path: `coverage/lcov.info` (via `--test-reporter=lcov`).
- Cleanup paths before run: `coverage/`.
- Per-suite output: unit + integration share the node:test run (co-located `*.test.ts`); split reporting by path glob if TestRunner needs per-suite numbers.

### Performance (optional)

- N/A — SPEC-001 has no latency/throughput NFRs (rate limiting is `NONE_LOCAL`).

---

## Phase 0 — Setup

No story dependencies.

- [ ] T001 [P] Create new module files per ADR-018 boundaries: `src/core/commands/revert.ts`, `src/core/commands/appliers.ts`, `src/core/commands/index.ts` barrel, and dir `src/server/routes/admin/change-sets/`
- [ ] T002 [P] Ensure co-located test dirs exist: `src/core/commands/__tests__/`, `src/core/commands/__specs__/`, route tests under `src/server/__tests__/routes/`
- [ ] T003 Wire node:test coverage output (`--experimental-test-coverage` → `coverage/lcov.info`) into an `npm run test:cov` script

---

## Phase 1 — Foundational (blocks all stories)

The mutation write path + storage. **Highest risk — do first; reconcile the pre-pipeline draft against certified tests (Const. Art. II).** No story work begins until this checkpoint.

- [ ] T004 [AC-01, INV-01] Write failing tests: `executeCommand` ordering (idempotency→capture→execute→record) + exactly-one-change-set-and-item, `appliedAt == createdAt` — `src/core/commands/__tests__/command.test.ts`
- [ ] T005 [P] [AC-03, AC-04] Write failing tests: duplicate idempotency key same workspace ⇒ `DUPLICATE_COMMAND` w/ original changeSetId; same key different workspace ⇒ executes — `src/core/commands/__tests__/idempotency.test.ts`
- [ ] T006 [P] [C-003] Write failing `ChangeSetRepoPort` shared contract test suite (findById / findByIdempotencyKey / listByWorkspace+TB-01 / save) — `src/core/commands/__tests__/repo.contract.test.ts`
- [ ] T007 [AC-15] Write failing test: feature throw ⇒ no change-set row, no outbox event, original error rethrown — `src/core/commands/__tests__/command.test.ts`
- [ ] T008 [C-003] Reconcile/implement change-set vocabulary + `ChangeSetRepoPort` + `DuplicateCommandError` — `src/core/commands/change-set.ts`
- [ ] T009 [C-003] Reconcile/implement `InMemoryChangeSetRepo` (read-then-check idempotency; TB-01 ordering) — `src/core/commands/repo.memory.ts` (depends T008)
- [ ] T010 [AC-01, AC-16, INV-01, INV-03] Reconcile/implement `executeCommand` gateway (fixed order; one applied single-item change set; `actorId "user-local"`; enqueue `change-set.applied`) — `src/core/commands/command.ts` (depends T008, T009)
- [ ] T011 Run Phase 1 tests to convergence

**Checkpoint**: core write path green — story phases can begin (2, 3, 4 parallelizable per ADR).

---

## Phase 2 — [Story: AC-05/AC-06/AC-02] Post update through the gateway (P1)

**Goal**: `PUT …/posts/:postId` records an auditable change set with the correct inverse, preserves the response contract, and rejects duplicate idempotency keys.
**Independent test**: edit the seeded post via HTTP → assert unchanged response shape + one recorded change set with the pre-edit inverse.

- [ ] T012 [P] [AC-05, AC-02] Write failing integration test: PUT posts through gateway — pre-feature response shape, `summary "Update post {postId}"`, item `entityType "post"` + inverse {title,slug,bodyJson,status} + `entityVersionAtApply` — `src/server/__tests__/routes/posts-update.test.ts`
- [ ] T013 [P] [AC-06] Write failing test: reused `Idempotency-Key` on PUT posts ⇒ 409 `DUPLICATE_COMMAND`, post unchanged
- [ ] T014 [AC-05, AC-02] Rewire `posts/update.ts` through `executeCommand` — captureInverse of pre-edit fields, summary template — `src/server/routes/admin/posts/update.ts`
- [ ] T015 [AC-06] Add `DUPLICATE_COMMAND` → 409 (+ `changeSetId` body) error mapping — `src/server/error-mapping/*`
- [ ] T016 Run to convergence

**Checkpoint**: AC-02/05/06 passing — post write path independently testable.

---

## Phase 3 — [Story: AC-07] Presentation through the gateway (P1) — [P] with Phase 2 (disjoint files)

**Goal**: `PATCH …/presentation` runs through the gateway; `PresentationSettingsRecord` gains `version` (existing row backfilled to 1); item identity + summary recorded.
**Independent test**: patch active theme twice → version 2 then 3; each change set holds prior `activeThemeId`.

- [ ] T017 [P] [AC-07] Write failing tests: version 2→3 (seed backfilled 1), inverse `activeThemeId`, item `entityType "presentation-settings"` + `entityId = workspaceId`, `summary "Set active theme {activeThemeId}"` — `src/server/__tests__/routes/presentation-patch.test.ts`
- [ ] T018 [AC-07, RT-006] Add `version` field + backfill default 1 to `PresentationSettingsRecord` (additive Drizzle migration per ADR-015 if schema-backed) — `src/features/presentation/presentation.ts`
- [ ] T019 [AC-07, RT-001/RT-002] Rewire `presentation/patch-active-theme.ts` through gateway (summary + item identity) — `src/server/routes/admin/presentation/patch-active-theme.ts` (depends T018)
- [ ] T020 Run to convergence

**Checkpoint**: AC-07 passing — presentation write path independently testable.

---

## Phase 4 — [Story: AC-08/AC-09] Change-history read endpoints (P1/P2) — [P] after Phase 1 (read-only)

**Goal**: list + get change sets, workspace-scoped, without exposing `inversePayload`.
**Independent test**: seed 3 change sets → list returns them newest-first, none cross-workspace; get returns header+items or 404.

- [ ] T021 [P] [AC-08] Write failing integration test: `GET …/change-sets` newest-first, workspace-scoped, TB-01 tie-break — `src/server/__tests__/routes/change-sets-list.test.ts`
- [ ] T022 [P] [AC-09] Write failing test: `GET …/change-sets/:id` returns header + items (`revertible` bool, no `inversePayload`); unknown id ⇒ 404 `CHANGE_SET_NOT_FOUND` — `src/server/__tests__/routes/change-sets-get.test.ts`
- [ ] T023 [AC-08] Implement `change-sets/list.ts` — `src/server/routes/admin/change-sets/list.ts`
- [ ] T024 [AC-09] Implement `change-sets/get.ts` + `CHANGE_SET_NOT_FOUND` mapping — `src/server/routes/admin/change-sets/get.ts`
- [ ] T025 Run to convergence

**Checkpoint**: AC-08/09 passing — read surface independently testable.

---

## Phase 5 — [Story: AC-10/11/12/14 + AC-13] Revert executor + inverse-applier registry (P1)

**Goal**: guarded, atomic revert via the registry; the load-bearing undo path.
Depends on Phase 1 (gateway/repo) + Phases 2/3 (appliers restore post/presentation) + Phase 4 (get contract). **No [P] across the executor tasks — shared `revert.ts`/`appliers.ts`.**

- [ ] T026 [P] [AC-10, INV-04] Write failing test: revert restores post title/slug/bodyJson/status, version+1, status `reverted`, `revertedAt` set — `src/core/commands/__tests__/revert.test.ts`
- [ ] T027 [P] [AC-11] Write failing test: later edit ⇒ revert of earlier set ⇒ 409 `REVERT_CONFLICT` (strict version-equality guard), entity unchanged
- [ ] T028 [P] [AC-12] Write failing test: second revert ⇒ 409 `CHANGE_SET_INVALID_STATUS`, no entity change
- [ ] T029 [P] [AC-14] Write failing test: null `inversePayload` ⇒ 422 `REVERT_NOT_POSSIBLE`, stays `applied`
- [ ] T030 [P] [INV-006, RT-003] Write failing concurrency test: two concurrent reverts of one change set ⇒ exactly one succeeds, the other 409 `CHANGE_SET_INVALID_STATUS`
- [ ] T031 [P] [INV-05] Write failing test: any precondition/applier failure ⇒ zero entity writes (no partial apply)
- [ ] T032 [C-005] Implement inverse-applier registry (`registerInverseApplier`/`resolveInverseApplier` by `(entityType, operation)`) — `src/core/commands/appliers.ts`
- [ ] T033 [C-006, AC-10] Implement post + presentation-settings inverse appliers (restore + version+1, refresh updatedAt) — `src/core/commands/appliers.ts` (depends T032)
- [ ] T034 [AC-10..14, INV-05, INV-006, BR-05..09] Implement `revertChangeSet` (precondition order, strict version guard, descending-position walk, compare-and-set status flip, enqueue `change-set.reverted`) — `src/core/commands/revert.ts` (depends T032, T033)
- [ ] T035 [AC-10..14] Implement `change-sets/revert.ts` route + error mapping (`REVERT_CONFLICT`/`REVERT_NOT_POSSIBLE`/`CHANGE_SET_INVALID_STATUS`) — `src/server/routes/admin/change-sets/revert.ts` (depends T034)
- [ ] T036 [AC-13, INV-03] Verify outbox holds `change-set.applied` + `change-set.reverted`, each carrying `workspaceId`, `actorId "user-local"`, `changeSetId`
- [ ] T037 Run to convergence

**Checkpoint**: AC-10/11/12/13/14 + INV-04/05/006 passing — full audit/undo loop works end-to-end.

---

## Phase N — Polish

After all required stories pass.

- [ ] T038 [P] Add `INFO.md` + `index.ts` barrel for `core/commands` per AGENTS.md conventions
- [ ] T039 [P] [RT-007, security] Guard test: `inversePayload` never serialized over HTTP; assert actor/authorization context param present in `executeCommand` + `revertChangeSet` signatures (fixed `user-local`, seam reserved)
- [ ] T040 [P] Aggregate INV-01…INV-05 property/invariant assertions
- [ ] T041 Docs: update module `INFO.md`; record carried RT-004 (SQLite adapter maps `(workspaceId, idempotencyKey)` unique-violation → `DUPLICATE_COMMAND`) as a TODO for the persistence phase

---

## Parallelization Rules

- [P] tasks in the same phase touch different files with no shared mutable state.
- Phases 2, 3, 4 are parallelizable after the Phase 1 checkpoint (disjoint file sets: posts route / presentation route+feature / change-sets read routes). Phase 5 depends on all three.
- Do not parallelize writes to `change-set.ts`, `command.ts`, `revert.ts`, or `appliers.ts` — serialize shared-core edits.

## Execution Strategies

- **Sequential (single agent, this host):** Phase 0 → Phase 1 checkpoint → Phase 2 → 3 → 4 → 5 → Phase N.
- **Parallel (if helper agents verified):** Phase 0 → Phase 1 checkpoint → Phases 2+3+4 simultaneously → Phase 5 → Phase N.

---

## Coverage / AC summary

- P1 ACs: AC-01, AC-02, AC-03, AC-05, AC-06, AC-07, AC-08, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16 → all mapped to a failing-test task before implementation.
- P2 ACs: AC-04 (T005), AC-09 (T022).
- Invariants: INV-01 (T004), INV-03 (T010/T036), INV-04 (T026), INV-05 (T031), INV-006/RT-003 (T030); INV-02 covered via AC-12 (T028).
- Behavior rules BR-01…BR-09 exercised across T004/T010 (gateway) and T034 (revert).
- Total tasks: 41 · Parallelizable [P]: 18 · Phases: 0–5 + Polish.
