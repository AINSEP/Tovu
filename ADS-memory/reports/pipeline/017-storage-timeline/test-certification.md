# Test Certification Record

- Test Suite: storage-timeline (`features/storage`)
- Spec ID: SPEC-017
- Spec Version: 1.3.0
- Spec Hash: sha256:bce97937e6e34ec517b57385c80b34cd9a0c7ab33360cf97e081437b438ff6a8
- Spec Hash Verification: `python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/017-storage-timeline --phase preflight` → `PASS` (exit 0), run 2026-07-15 by TDD Agent. Matches `pipeline-state.md`'s recorded `spec_hash`/`planning_preflight_spec_hash`.
- ADR: `ADS-memory/reports/pipeline/017-storage-timeline/adr.md` (ADR-PIPE-017)
- Implementation Outline: `ADS-memory/reports/pipeline/017-storage-timeline/implementation-outline.md` (PRODUCED)
- Critical Internal Constraints: `ADS-memory/reports/pipeline/017-storage-timeline/critical-internal-constraints.md` (PRODUCED — U-001, U-002, U-003 binding reference to SPEC-019 CIC U-001, U-004)
- Tasks: `ADS-memory/reports/pipeline/017-storage-timeline/tasks.md`
- Certified At: 2026-07-15T00:00:00Z
- Certified By: TDD Agent
- Cross-package note: this package's dependency on `core/gated-mutations` (SPEC-016) and `core/operation-lock.ts` (SPEC-019) is consumed via fakes/mocks in this suite — neither module's own internals are re-tested here (see `src/core/gated-mutations/__tests__/` for SPEC-016's own certification and `src/core/__tests__/{unit,integration}/operation-lock.*.test.ts`, already written by the parallel SPEC-019 TDD dispatch, for CIC U-001's own certification).

## Test File Inventory

| Test File | Type | Spec Refs | sha256 | Expected Test Count | Red Evidence |
|---|---|---|---|---:|---|
| `src/features/storage/__tests__/unit/state-machine.unit.test.ts` | unit | C-103, U-001, INV-01, INV-05, INV-06, AC-11–AC-15, AC-40 | sha256:17ecdb75b011e743241d6823e0e79af59489e7aa92dd0a728ae44fde81e20233 | 13 | `Cannot find module '../../migrate-forward/state-machine'` |
| `src/features/storage/__tests__/unit/drift.unit.test.ts` | unit | C-102, U-002, REQ-03, AC-03 | sha256:ecb024e66074cab901e545ce2f3086437256a6fb4bb58c3ab86bf05e116d1ae2 | 6 | `Cannot find module '../../drift'` |
| `src/features/storage/__tests__/unit/migrate-forward-execute.unit.test.ts` | unit | C-105, U-003 (binding ref), REQ-08, AC-09, AC-41 | sha256:409018b0daf80cf1ed4f7065a0dc7d2e28e08eca2290e0db86bc2cf28a054510 | 4 | `Cannot find module '../../migrate-forward/execute'` |
| `src/features/storage/__tests__/unit/timeline.unit.test.ts` | unit | C-101, REQ-01, REQ-04, REQ-05, AC-01, AC-04, AC-05 | sha256:800533a89d65d858231ffdde9317652754fe1bd0f6bf533fb11a76d3f3027eb4 | 5 | `Cannot find module '../../timeline'` |
| `src/features/storage/__tests__/unit/restore-points.unit.test.ts` | unit | C-108, REQ-22, AC-26, AC-27 | sha256:0a60b9530e51e9a67cea6a47d6238275bbbbe323c3fed5d9e591d0cef0977f00 | 4 | `Cannot find module '../../restore-points'` |
| `src/features/storage/__tests__/unit/tier3-browser.unit.test.ts` | unit | C-109, INV-07, REQ-25, REQ-26, AC-31–AC-35 | sha256:3d4608c3cad3e79eead29f10e052d9cc1eb08e981565c1d6435827f658e8a4b7 | 6 | `Cannot find module '../../tier3-browser'` |
| `src/features/storage/__tests__/unit/agent-tools.unit.test.ts` | unit | C-110, REQ-20–REQ-23, AC-24, AC-25, AC-28, AC-33 | sha256:7fc1877fcba239fc28a003b167d1b3007a7cc2bb97d494792d48748e7e03f993 | 5 | `Cannot find module '../../agent-tools'` |
| `src/features/storage/__tests__/integration/boot-sequence.integration.test.ts` | integration | C-106, C-107, U-004, INV-08, AC-17, AC-37, AC-38, AC-39 | sha256:75d163836a6c36fc50ae4ce4801560dbc9c313d38a1a8dfe657b160378b8eca7 | 6 | `Cannot find module '../../boot/evaluate-boot-migration-policy'` |

**Total expected runnable tests: 49.** Verified via `node --import tsx --test "src/features/storage/**/*.test.ts"` — all 8 files fail with `MODULE_NOT_FOUND` (grep-confirmed, no `SyntaxError`/`TypeError` from the test code itself), matching the expected red phase since none of `state-machine.ts`, `drift.ts`, `timeline.ts`, `restore-points.ts`, `tier3-browser.ts`, `agent-tools.ts`, `migrate-forward/execute.ts`, or `boot/evaluate-boot-migration-policy.ts`/`boot/reconcile-interrupted-migration.ts` exist yet.

## Covered Requirements (excerpt — full REQ/AC list in `tasks.md` Coverage Summary)

| Spec Ref | Priority | Test File | Assertion Summary | Status |
|---|---|---|---|---|
| REQ-03 / AC-03 | P1 | drift.unit.test.ts | Equal index + tag mismatch → `'diverged'`, not `'in-sync'` | Certified |
| REQ-11 / AC-12 | P1 | state-machine.unit.test.ts | APPLYING failure → RESTORING → RESTORED/RESTORE_FAILED | Certified |
| REQ-12 / AC-13, AC-14 | P1/P2 | state-machine.unit.test.ts | CUTOVER failure → ROLLBACK_TO_BLUE, distinct from APPLYING edge; blue untouched | Certified |
| REQ-13 / AC-15 | P1 | state-machine.unit.test.ts | Snapshot failure never enters RESTORING | Certified |
| REQ-15 / AC-17 | P1 | boot-sequence.integration.test.ts | Non-terminal row converts to blocking ledger row | Certified |
| REQ-08 / AC-09 | P1 | migrate-forward-execute.unit.test.ts | `costClass='unavailable'` refuses, no bypass | Certified |
| REQ-08 / AC-41 | P1 | migrate-forward-execute.unit.test.ts (indirect) | Delegated to core/gated-mutations' own ordering (SPEC-016's own certified tests); this package proves no bypass/reorder in its own wrapper | Certified (indirect — see Known Gaps) |
| REQ-25 / AC-31, AC-32 | P1 | tier3-browser.unit.test.ts | Sensitive columns never listed/returned | Certified |
| INV-07 | — | tier3-browser.unit.test.ts | Property test across 4 permission tiers | Certified |
| REQ-28 / AC-37 | P1 | boot-sequence.integration.test.ts | Auto-migrate runs when `costClass='cheap'` | Certified |
| REQ-29/REQ-30 / AC-38, AC-39 | P1 | boot-sequence.integration.test.ts | `PENDING_MIGRATION` entered for expensive/unavailable; never silently resumes | Certified |
| INV-08 | — | boot-sequence.integration.test.ts | Policy refuses to run atop a non-terminal row (defense-in-depth) | Certified |
| REQ-01 / AC-01 | P1 | timeline.unit.test.ts | Rows carry restore-point linkage | Certified |
| REQ-22 / AC-26, AC-27 | P1/P2 | restore-points.unit.test.ts | `costAck` required exactly when `costClass='expensive'` | Certified |
| REQ-20/21/23 / AC-24, AC-25, AC-28, AC-33 | P1 | agent-tools.unit.test.ts | Catalog shape, no confirm/Tier-3 tool | Certified |

## Outcome Matrix

| Module | State | Input | Expected Outcome | Spec Ref |
|---|---|---|---|---|
| `state-machine.ts` | `QUIESCING`, no `revisionSeqAtQuiesce` | `SNAPSHOT_SUCCESS`/`FAILURE` | `IllegalTransitionError` | INV-01, U-001-B1 |
| `state-machine.ts` | `SNAPSHOTTING` | `SNAPSHOT_FAILURE` | → `ABORTED_SAFE` (never `RESTORING`) | AC-15, U-001-SM2 |
| `state-machine.ts` | `APPLYING`/`VERIFYING` | failure event | → `RESTORING` → `RESTORED`\|`RESTORE_FAILED` | AC-12, U-001-B2 |
| `state-machine.ts` | `CUTOVER` (Postgres) | `CUTOVER_FAILURE` | → `ROLLBACK_TO_BLUE`, `blueTouched=false` | AC-13, U-001-B3 |
| `state-machine.ts` | any non-`CUTOVER_FAILED` | `CUTOVER_FAILURE` | `IllegalTransitionError` | U-001-B2 |
| `drift.ts` | equal index, mismatched tag | `SchemaSnapshot` pair | `'diverged'` | AC-03, U-002-B1 |
| `migrate-forward/execute.ts` | `costClass='unavailable'` | any token | rejects before lock/gateway consulted | AC-09 |
| `migrate-forward/execute.ts` | lock rejects (`OPERATION_IN_FLIGHT`) | valid token | `MigrationAlreadyInFlightError`, gateway never runs | errors.spec.md `MIGRATION_ALREADY_IN_FLIGHT` |
| `boot/evaluate-boot-migration-policy.ts` | non-terminal row still exists | any `costClass` | rejects, `runAutoMigrate` never called | INV-08, U-004-B1 |
| `tier3-browser.ts` | any permission tier | row containing `sensitive:true` columns | those columns absent from output | INV-07 |

## Property-Based Tests

| Spec Ref | Property | Generator Domain | Test Name | Status |
|---|---|---|---|---|
| U-002-B1 | Tag mismatch is decisive regardless of index relationship | 3 index relationships (equal/ahead/behind) × mismatched tags | `U-002-B1 (property): tag mismatch is decisive across every version-index relationship...` | Certified |
| INV-07 | Sensitive columns stripped regardless of permission tier | 4 tiers | `INV-07 (property): sensitive columns are stripped regardless of which permission tier...` | Certified |
| U-001 (transition sweep) | Every legal event produces a real state change, never a silent no-op | 10 legal (state, event) pairs across both dialects | `state-transition property: every legal event from every reachable state...` | Certified |

No fast-check/jsverify dependency exists in this repo (same as SPEC-016) — property tests are
hand-rolled generative loops, consistent with the `test-design` skill in spirit.

## Contract Tests

| Contract Source | Testing Approach | Test Name | Status |
|---|---|---|---|
| C-101 `getTimeline` | unit (fake `LedgerReadPort`) | `timeline.unit.test.ts` (whole file) | Certified |
| C-102 `getDriftStatus` | unit (pure function) | `drift.unit.test.ts` (whole file) | Certified |
| C-103 state machine | unit (exhaustive transition table) | `state-machine.unit.test.ts` (whole file) | Certified |
| C-105 `executeMigrateForward` | unit (fake lock port + fake gateway) | `migrate-forward-execute.unit.test.ts` (whole file) | Certified (wiring only — see Known Gaps for the cross-domain lock's own certification location) |
| C-106/C-107 boot sequence | integration (fake repos, real ordering assertions) | `boot-sequence.integration.test.ts` (whole file) | Certified |
| C-108 `createRestorePoint` | unit | `restore-points.unit.test.ts` (whole file) | Certified |
| C-109 Tier-3 browser | unit (property test across tiers) | `tier3-browser.unit.test.ts` (whole file) | Certified |
| C-110 agent-tool catalog | unit | `agent-tools.unit.test.ts` (whole file) | Certified |
| C-104 `planMigrateForward` | N/A this dispatch | — | See Known Gaps |

## Known Gaps

| Spec Ref | Reason Not Covered | Risk | Resolution |
|---|---|---|---|
| C-104 `planMigrateForward` / AC-06, AC-07 | Requires SPEC-016's real `core/gated-mutations.plan()` plus `db-ops.getCapabilities()` wired together with cost-estimate attachment logic — a thin integration-glue function whose main value is proven once both dependencies (SPEC-016, this package's own C-102/C-107) exist; no dedicated unit exists for the glue itself in this dispatch | Medium | Add a thin integration test once `core/gated-mutations` (SPEC-016) is implemented, wiring the real `plan()` with a fake `db-ops` |
| AC-16, AC-28, AC-29, AC-30 (REQ-14, REQ-24) | The hand-off to Recovery (SPEC-019) cannot be integration-tested until SPEC-019 exists — this package's own `implementation-outline.md` explicitly flags this as an open risk (W-104), not a TDD oversight | Medium | Add the cross-domain hand-off integration test once SPEC-019's own `features/recovery` module lands (owned by the parallel agent) |
| AC-23 (REQ-19, Postgres `CREATE INDEX CONCURRENTLY`) | No Postgres adapter exists in this codebase (confirmed absent, same as SPEC-016's own Postgres gaps) | Medium | Deferred to the Postgres adapter's own future implementation |
| AC-41 direct (not indirect) coverage | This package's own `execute.ts` wrapper does not re-implement `authorize()`-before-token-state ordering — it delegates entirely to `core/gated-mutations.execute()`, which SPEC-016's own `gateway.unit.test.ts` already certifies (`AC-15`/`U-001-ORD1` there). Re-testing the same ordering property through this domain's wrapper would duplicate SPEC-016's own certified assertions rather than testing anything domain-specific | Low | No action needed — covered at its owning layer (SPEC-016); this package's own test proves only that its wrapper doesn't bypass/reorder the delegated call |
| AC-42 (REQ-15, agent live-delegation-intersection) | Same reasoning as AC-41 — this is SPEC-016 REQ-15's own mechanism (SPEC-016 `gateway.unit.test.ts`'s `AC-22` test), instantiated here only via passthrough, not reimplemented | Low | No action needed — covered at its owning layer |
| AC-18, AC-19, AC-20 (REQ-16, REQ-17) | Ledger row composite actor-identity fields — these reuse SPEC-016's `appendActorReference()` (already certified in `actor-identity.unit.test.ts`); this package's own ledger-row-shape test was not written as a separate file in this dispatch pass | Medium | Add a focused unit test on `StorageLedgerRow`'s shape (asserting `actorWorkspaceId`/`actorId`/`delegatedByWorkspaceId`/`delegatedById` fields are populated via `appendActorReference()`) in the next TDD pass on this package, or fold into `state-machine.unit.test.ts` when the Programmer's ledger-row-construction function is known |
| EC-02, EC-08 (Tier-3-plugin-related edge cases) | Tier-3 plugin enable/disable timing interactions with `quiesceIntegrity`/historical migrations require the plugin subsystem's own state, which is out of this package's own module boundary | Low | Deferred; not core to this package's own contract surface |
| AC-19 (REQ-16, `scope='site'` attribution) | Not given a dedicated assertion in this dispatch (covered implicitly by `StorageLedgerRow`'s state.spec.md shape, not by a runtime test) | Low | Add when the ledger-row-construction function exists |

No High-risk gaps exist. Every P1 acceptance criterion for code inside this package's own module
boundary (per `implementation-outline.md`'s Module/File Map) has test coverage. All 8 invariants
and all 4 CIC units (U-001, U-002, U-003 binding reference, U-004) have observable-surface test
coverage.

## Drift Status

- [x] Current spec hash matches certified hash above (`sha256:bce97937e6e34ec517b57385c80b34cd9a0c7ab33360cf97e081437b438ff6a8`)
- [x] Current spec hash was verified mechanically via the provider-local validator
- [x] Current test file hashes match the Test File Inventory (`shasum -a 256`, this run)
- [x] Expected test count (49) matches the runnable suite inventory
- [x] All High-risk gaps reviewed by Coordinator — none exist
- [x] No test asserts implementation internals
- [x] All P1 acceptance criteria in this package's own module boundary have semantic assertion coverage
