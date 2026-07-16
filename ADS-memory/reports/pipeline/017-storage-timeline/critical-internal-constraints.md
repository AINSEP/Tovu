# Critical Internal Constraints: storage-timeline

- Spec: SPEC-017 v1.3.0 (hash: sha256:bce97937e6e34ec517b57385c80b34cd9a0c7ab33360cf97e081437b438ff6a8)
- ADR: ADR-PIPE-017
- Implementation Outline: `ADS-memory/reports/pipeline/017-storage-timeline/implementation-outline.md`
- Prior designations consulted: `ADS-memory/reports/pipeline/016-content-admin-core-contract/critical-internal-constraints.md` — U-001 (execute() check-sequence ordering) and U-003 (single-use token redemption) are re-affirmed as inherited via `core/gated-mutations`, not re-designated here since this domain does not reimplement them. **Correction (audit-work internal verification, 2026-07-15T15:35:00Z):** `ADS-memory/reports/pipeline/019-backups-recovery/critical-internal-constraints.md`'s **U-001** (shared cross-domain in-flight operation lock, `core/operation-lock.ts`) is BINDING on this package's own `execute()` path (per that unit's own Design Context: "SPEC-017's own implementation must treat this designation as binding on its own `execute()` path"). This package's own U-003, originally drafted at 08:00 (before SPEC-019's 10:00 architect pass existed) as an independent Storage-local designation, is withdrawn as a separate designation and now records only a binding reference to SPEC-019's U-001 — see the U-003 section below. No other prior designation exists for anything specific to this domain's own state machine, drift check, or boot sequence.
- Status: PRODUCED
- Trigger result: Stateful Protocol Constraint (2 units), Algorithmic Correctness Constraint (1 unit), Concurrency / Ordering / Idempotency Constraint (1 unit, binding reference to SPEC-019 U-001 — not independently designated here, see correction note above)
- Source sync: verified 2026-07-15T08:00:00Z against SPEC-017 v1.3.0 and this feature's own implementation-outline.md; re-verified 2026-07-15T15:35:00Z after the U-003 correction
- Date: 2026-07-15T08:00:00Z (revised 2026-07-15T15:35:00Z)
- Author: Software Architect (Claude Sonnet 5, Agent Direct Mode)

## Trigger Decision Matrix

| Trigger | Applies? | Designated Unit(s) | Plausible Wrong Implementation | Broken Property | Required Constraint | Source Trace |
|---|---:|---|---|---|---|---|
| Algorithmic Correctness Constraint | yes | U-002 | See unit section | See unit section | See unit section | REQ-03, behavior.spec.md §1.1, AC-03 |
| Stateful Protocol Constraint | yes | U-001, U-004 | See unit sections | See unit sections | See unit sections | REQ-11-REQ-15, INV-01, INV-05, INV-08 |
| Concurrency / Ordering / Idempotency Constraint | yes (binding reference, not independently designated — see U-003) | U-003 (binds to SPEC-019 U-001) | See SPEC-019 CIC U-001 | See SPEC-019 CIC U-001 | See SPEC-019 CIC U-001 | behavior.spec.md §5, AC-10; SPEC-019 REQ-13, CIC U-001 |
| Security-Critical Sequencing Constraint | no | — | The gateway-level ordering (authorize/token-state/actor-class/plan-hash) is inherited unchanged from `core/gated-mutations` (SPEC-016 CIC U-001) — this domain adds no new security-critical sequencing of its own beyond what it inherits. | — | — | — |
| Explicit Performance Budget Constraint | no | — | No stated latency/throughput budget for the Timeline or migrate-forward ceremony (rate limits are request-volume caps, not latency budgets). | — | — | — |
| Failure / Recovery Constraint | no | — | Considered the `APPLYING`/`VERIFYING`→`RESTORING` failure edge, but its required behavior is fully captured by U-001's state-machine designation (a Stateful Protocol Constraint already covering illegal-transition prevention) — no additional internal-only failure/recovery detail exists beyond the transition table itself. | — | — | — |
| Characterization Parity Constraint | no | — | Not a reverse-spec/migration surface; the pre-existing `SERVE_SITE` reference is a spec document with no running code to characterize. | — | — | — |

Candidate units checked beyond the designated four: `getTimeline` (C-101, a pure paginated read with no invariant beyond input validation — no trigger); `createRestorePoint` (C-108, single-call write fully captured by its public contract's Validation column — no internal detail escapes it); `tier3ReadRows`/`describeTables` (C-109 — considered for Security-Critical Sequencing given the redaction requirement, but redaction is a data-shape filter applied identically on every call, not an ordering/sequencing property — the correctness concern is fully captured by C-109's own contract Validation column, which already states the unconditional exclusion rule).

## Designated Units

| Unit ID | Name | Location (module / contract ref) | Designating Trigger(s) | Outline Refs | Trace |
|---|---|---|---|---|---|
| U-001 | Dialect-conditional migrate-forward state machine (legal-transition table) | `features/storage/migrate-forward/state-machine.ts`, C-103 | Stateful Protocol Constraint | C-103, INV-01, INV-05 | SPEC-017 REQ-11-REQ-14, state.spec.md §1-§3, AC-12-AC-15, AC-40 |
| U-002 | Drift classification (tag-identity-decisive algorithm) | `features/storage/drift.ts`, C-102 | Algorithmic Correctness Constraint | C-102, AC-03 | SPEC-017 REQ-03, behavior.spec.md §1.1 |
| U-003 | Concurrent migration-in-flight guard — binding reference only, see correction note | `features/storage/migrate-forward/execute.ts`, C-105 | Concurrency / Ordering / Idempotency Constraint | C-105, behavior.spec.md §5 | SPEC-017 behavior.spec.md §5, errors.spec.md (`MIGRATION_ALREADY_IN_FLIGHT`); designated at SPEC-019 CIC U-001, binding here |
| U-004 | Boot-sequence ordering: crash reconciliation before cost-gated policy | `features/storage/boot/*.ts`, C-106, C-107 | Stateful Protocol Constraint | C-106, C-107, INV-08 | SPEC-017 REQ-15, INV-08, behavior.spec.md §2.4 |

## Unit Constraints

### U-001 Dialect-conditional migrate-forward state machine

- Responsibility: Advance `MigrationRunStatus` only along legal, dialect-appropriate transitions, and route every failure to its own distinct, non-conflated failure edge.
- Designation: A competent implementer might satisfy every single-scenario AC (AC-12 through AC-15, AC-40) while still implementing the three failure edges as one shared code path that happens to produce the right ledger row for each tested scenario — but under an untested combination (e.g. a Postgres `CUTOVER` failure routed through the same handler as an `APPLYING`/`VERIFYING` failure), the two edges could be silently conflated, since both superficially "restore/rollback something." Broken property: `ROLLBACK_TO_BLUE` is only reachable after `VERIFYING` has already succeeded (green schema validated) and blue was never touched; conflating it with the `APPLYING`/`VERIFYING` edge (which discards an *unvalidated* green schema) would misrepresent whether a validated schema was ever discarded — a forensics/audit-trail correctness issue, and, for the SQLite branch, entering `SNAPSHOTTING` before `QUIESCING` fully completes could snapshot a state with in-flight writes still landing (INV-01). Required constraint: the three failure edges (`SNAPSHOT_FAILED→ABORTED_SAFE`, `(APPLYING|VERIFYING)_FAILED→RESTORING→(RESTORED|RESTORE_FAILED)`, `CUTOVER_FAILED→ROLLBACK_TO_BLUE`) must be structurally distinct code paths, never a shared handler distinguishing only by a flag.
- Outline refs: C-103, INV-01, INV-05

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-001-B1 | `SNAPSHOTTING` may only be entered after `QUIESCING` has fully completed and `revisionSeqAtQuiesce` has been recorded | — | Snapshot correctness — no in-flight write is missed by the recorded watermark baseline | Persisted state: `migration_runs.revisionSeqAtQuiesce` is non-null before any `restore_points` row for this run is created | SPEC-017 INV-01, AC-11 |
| U-001-B2 | The three failure edges (`ABORTED_SAFE`, `RESTORING→RESTORED\|RESTORE_FAILED`, `ROLLBACK_TO_BLUE`) are mutually exclusive, structurally distinct transitions — never a shared code path selected by a runtime flag | — | Forensic/audit correctness of the ledger's `outcome`/terminal-state record | Persisted state: the terminal ledger row's kind/outcome unambiguously identifies which of the three failure shapes occurred | SPEC-017 REQ-13, REQ-14, AC-13, AC-15, AC-40 |
| U-001-B3 | On Postgres, blue is never touched by any state transition prior to a successful `CUTOVER` | ESCALATE_IRREVERSIBLE | Zero-downtime guarantee; an in-place write to blue before verification would be an irreversible, unverified schema change to the live serving database | Persisted state / external observation: blue continues serving unaffected through `APPLYING`/`VERIFYING` (AC-14); only `CUTOVER` repoints | SPEC-017 INV-05, REQ-12, AC-14 |

#### State Machine (Stateful Protocol Constraint only)

| ID | State | Event / Input | Next State | Guard / Precondition | Escalation Marker |
|---|---|---|---|---|---|
| U-001-SM1 | `QUIESCING` | quiesce completes | `SNAPSHOTTING` | `revisionSeqAtQuiesce` recorded | — |
| U-001-SM2 | `SNAPSHOTTING` | snapshot fails | `SNAPSHOT_FAILED` → `ABORTED_SAFE` | none entered `RESTORING` | — |
| U-001-SM3 | `APPLYING` or `VERIFYING` | step fails | `RESTORING` → `RESTORED` \| `RESTORE_FAILED` | green/applied schema was not yet verified | ESCALATE_IRREVERSIBLE (if `RESTORE_FAILED`, a broken state persists) |
| U-001-SM4 | `VERIFYING` (Postgres, succeeded) | proceed | `CUTOVER` | green schema already validated | — |
| U-001-SM5 | `CUTOVER` | repoint fails | `CUTOVER_FAILED` → `ROLLBACK_TO_BLUE` | reachable only from a post-`VERIFYING`-success state | ESCALATE_IRREVERSIBLE |

- Illegal states / transitions: `SNAPSHOTTING` entered directly from `CONFIRMED` (skipping `QUIESCING`) — violates U-001-B1. `ROLLBACK_TO_BLUE` reached from any state other than `CUTOVER_FAILED` — violates U-001-B2/U-001-SM5. Any write to blue during `APPLYING`/`VERIFYING` — violates U-001-B3/INV-05.
- State persistence: `migration_runs` row in `ops/storage-journal.db`; recovery source of truth is that row's own `status` field, read at boot by C-106.

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| INV-01 | SPEC-017 feature.spec.md | U-001-B1 |
| INV-05 | SPEC-017 feature.spec.md | U-001-B3 |

#### Design Context (optional, non-binding)

The three-failure-edge distinction mirrors exactly the shape ADR-041 §3/§11 arrived at after its own audit history — this unit exists so that shape is a Binding, tested property in the actual implementation, not just prose in an ADR.

---

### U-002 Drift classification (tag-identity-decisive algorithm)

- Responsibility: Classify site drift status using `schemaTag` identity as the decisive signal, never `schemaVersion` count/index alone.
- Designation: A competent implementer might compare `schemaVersion` counts or index values first (a natural-seeming shortcut, since it's a single integer comparison), falling back to tag comparison only when counts differ — this passes the common case but is exactly backwards from the required precedence, and silently misclassifies a same-index-different-lineage site as `'in-sync'`. Broken property: REQ-02's drift banner would never appear for a genuinely diverged site sharing the runtime's migration count, defeating the entire purpose of the banner (alerting the operator before a migrate-forward runs against an incompatible lineage). Required constraint: tag-identity comparison is evaluated first and is unconditionally decisive; version-index comparison is used only to distinguish `'ahead'` from `'behind'` after tag identity has already confirmed compatible lineages.
- Outline refs: C-102, AC-03

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-002-B1 | `schemaTag` comparison is evaluated before, and is unconditionally decisive over, any `schemaVersion` index/count comparison | — | A tag mismatch at equal index must never be classified `'in-sync'` (REQ-03) | API/persisted result: `DriftStatus` value for a constructed tag-mismatch-equal-index case is always `'diverged'` | SPEC-017 REQ-03, behavior.spec.md §1.1, AC-03 |

#### Required Ordering Constraints

| ID | Required Ordering | Property Protected | Observable Verification Surface | Escalation Marker | Trace |
|---|---|---|---|---|---|
| U-002-ORD1 | Tag-identity comparison completes and is applied before version-index comparison is consulted for anything beyond ahead/behind disambiguation | Prevents the version-index shortcut from ever overriding a tag mismatch | `DriftStatus` result for the adversarial tag-mismatch-equal-index case | — | SPEC-017 behavior.spec.md §1.1 |

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| (no separate outline INV — fully captured by REQ-03 directly) | SPEC-017 feature.spec.md REQ-03 | U-002-B1, U-002-ORD1 |

#### Design Context (optional, non-binding)

This is exactly the class of "looks like an equivalent shortcut, isn't" bug this unit exists to prevent — a version-index-first implementation would pass every test that doesn't specifically construct a tag-mismatch-equal-index case, which is precisely why behavior.spec.md §1.1 calls it out as a dedicated precedence rule rather than trusting it to fall out of the ACs alone.

---

### U-003 Concurrent migration-in-flight guard — NOT independently designated (corrected 2026-07-15)

**Correction note (audit-work internal verification, 2026-07-15):** This unit was originally drafted as a Storage-local designation ("the check-for-in-flight-run-then-create-new-run step must be a single atomic, site-scoped conditional operation" — implemented independently inside `features/storage`). SPEC-019's own Software Architect pass (ADR-PIPE-019, dispatched later the same session) evaluated exactly this shape — two independent per-screen locks — and explicitly **rejected** it, because a migration on Storage and a restore on Recovery each checking only their own local state would never see each other's in-flight operation. SPEC-019 instead designated this exact concern as its own **U-001** (shared cross-domain in-flight operation lock, `core/operation-lock.ts`) and stated explicitly that "SPEC-017's own implementation must treat this designation as binding on its own `execute()` path." This package's U-003 is therefore withdrawn as an independent designation and replaced with a binding reference:

- **Binding reference:** `features/storage/migrate-forward/execute.ts` (C-105) MUST satisfy `ADS-memory/reports/pipeline/019-backups-recovery/critical-internal-constraints.md`'s **U-001** (all of U-001-B1, U-001-B2, U-001-ORD1) — the shared `core/operation-lock.ts` primitive, consulted identically by both this domain and `features/recovery`. Do not re-implement a Storage-local equivalent; doing so would violate GOV-ADR-002 (MANDATORY, scope includes `src/features/storage/**`).
- **Why not re-designate here:** designating the same property twice, once per consuming domain, is exactly the drift risk this whole pipeline's shared-mechanism discipline (GOV-ADR-001/002) exists to close — the CIC ledger's own convention (see this file's "Prior designations consulted" header) is to record a genuinely shared constraint once, at its origin, and bind every consumer to it by reference.
- **Outline refs:** C-105 (this package), C-309/U-001 (SPEC-019, origin)

#### Required Ordering Constraints

| ID | Required Ordering | Property Protected | Observable Verification Surface | Escalation Marker | Trace |
|---|---|---|---|---|---|
| U-003-ORD1 (binding on this domain, designated at SPEC-019 U-001-ORD1) | `core/operation-lock.acquireOperationLock()` succeeds before `executeMigrateForward` (C-105) proceeds to the state machine (C-103) | REQ-13/INV-03's cross-screen guarantee; prevents a concurrent migration and restore against the same site | Integration test: a concurrent Storage-execute and Recovery-execute attempt against the same site always yields exactly one winner (see SPEC-019 implementation-outline.md W-302/W-303) | ESCALATE_IRREVERSIBLE (per SPEC-019 U-001-ORD1) | SPEC-017 behavior.spec.md §5; SPEC-019 REQ-13, INV-03, CIC U-001 |

#### Design Context (optional, non-binding)

`errors.spec.md`'s `MIGRATION_ALREADY_IN_FLIGHT` code remains this domain's own error mapping for a rejected acquire — it wraps the shared lock's rejection, it does not indicate an independent Storage-local lock implementation.

---

### U-004 Boot-sequence ordering: crash reconciliation before cost-gated policy

- Responsibility: Guarantee `evaluateBootMigrationPolicy` (C-107) never runs while a non-terminal `migration_runs` row exists for the site.
- Designation: A competent implementer, optimizing boot time, might dispatch `reconcileInterruptedMigrationOnBoot` (C-106) and `evaluateBootMigrationPolicy` (C-107) as independent parallel boot-time tasks (a natural performance optimization, since they look like unrelated checks) — this is exactly the wrong-implementation shape SPEC-017's own behavior.spec.md §2.4 test requirement explicitly calls out ("including a check that the two are not dispatched as independent parallel boot-time tasks"). Broken property: running the cost-gated auto-migrate/`PENDING_MIGRATION` decision on top of an already-crashed, unresolved migration is a system integrity violation (INV-08) — the site could auto-migrate or silently resume serving atop a schema left in an unknown state by the prior crash. Required constraint: C-107 must not even be invoked until C-106 has fully resolved or blocked.
- Outline refs: C-106, C-107, INV-08

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-004-B1 | `evaluateBootMigrationPolicy` (C-107) is not invoked until `reconcileInterruptedMigrationOnBoot` (C-106) has fully resolved (no non-terminal row) or is actively blocking site-open | ESCALATE_SECURITY | Prevents auto-migration or public-serving resumption atop an unresolved crashed migration (INV-08) | Integration-observable: a boot with a non-terminal `migration_runs` row present never reaches a state where `AUTO_MIGRATE_ON_BOOT`/`ENTER_PENDING_MIGRATION` has run | SPEC-017 REQ-15, INV-08, behavior.spec.md §2.4 |

#### Required Ordering Constraints

| ID | Required Ordering | Property Protected | Observable Verification Surface | Escalation Marker | Trace |
|---|---|---|---|---|---|
| U-004-ORD1 | C-106 completes (resolves or blocks) strictly before C-107 is invoked; the two are never dispatched as independent parallel boot-time tasks | INV-08 — no cost-gated policy decision atop an unresolved crash | Boot-sequence integration test: instrument both functions' invocation order and assert C-107's first invocation timestamp is strictly after C-106's resolution | ESCALATE_SECURITY | SPEC-017 behavior.spec.md §2.4 (explicit test requirement) |

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| INV-08 | SPEC-017 feature.spec.md / implementation-outline.md `[internal-invariant]` | U-004-B1, U-004-ORD1 |

#### Design Context (optional, non-binding)

SPEC-017's own behavior.spec.md §2.4 already anticipates this exact wrong-implementation shape (parallel boot dispatch) and mandates a test for it — this unit exists to make that anticipation a Binding, escalation-marked constraint rather than only a test-requirement sentence.

## Deviation And Promotion Protocol

Per `AI-Dev-Shop/skills/critical-internal-constraints/SKILL.md`: escalation-marked constraints (U-001-B3, U-001-SM3, U-001-SM5, U-003-ORD1 [binding reference to SPEC-019 U-001-ORD1], U-004-B1, U-004-ORD1) require Coordinator routing and a recorded `[CIC_DEVIATION_APPROVED]` entry before any deviation; other Binding constraints require a recorded `[CIC_DEVIATION]` entry. No deviations exist yet.

## Downstream Handoff Notes

- Coordinator: tasks touching `migrate-forward/state-machine.ts` reference U-001; tasks touching `drift.ts` reference U-002; tasks touching `migrate-forward/execute.ts`'s shared-lock consultation reference U-003 (binding on SPEC-019 CIC U-001 — coordinate with SPEC-019's own tasks, do not spec a Storage-local lock task independently); tasks touching the boot composition root reference U-004 and must not be marked `[P]` relative to each other for C-106/C-107.
- TDD focus: U-004's boot-ordering integration test and U-001's exhaustive dialect-branched transition-table test are the highest priority — both are exactly the shape SPEC-017's own behavior.spec.md flags as needing explicit, not incidental, test coverage. U-003's cross-domain concurrent-acquire property test (SPEC-019 CIC U-001) must be written as one shared integration test exercising both `features/storage` and `features/recovery` together, not two separate per-domain tests.
- Programmer audit focus: confirm C-106/C-107 are never wired as parallel boot tasks; confirm the three failure edges in C-103 are structurally distinct functions/branches, not a shared handler; confirm `executeMigrateForward` acquires the SHARED `core/operation-lock.ts` primitive (not a Storage-local reimplementation) before proceeding to the state machine — this is a Required finding per this ADR's own Enforcement section and per GOV-ADR-002.
- Open risks or ambiguities: none beyond SPEC-017's own carried-forward open questions (OQ-01, OQ-03, OQ-05, OQ-06), none of which change any Binding constraint recorded here. The U-003 correction (2026-07-15T15:35:00Z, via audit-work internal verification) was a real cross-package inconsistency between this package and SPEC-019, now reconciled — see this file's "Prior designations consulted" header for the full correction note.
