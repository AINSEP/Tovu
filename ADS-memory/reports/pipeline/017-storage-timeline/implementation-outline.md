# Implementation Outline: storage-timeline

- Spec: SPEC-017 v1.3.0 (hash: sha256:bce97937e6e34ec517b57385c80b34cd9a0c7ab33360cf97e081437b438ff6a8)
- ADR: ADR-PIPE-017
- Status: PRODUCED
- Trigger result: Boundary Cross, Contract Change, System Wiring, Data And Persistence, Brownfield Dependency, Critical Cross-Boundary Invariant
- Date: 2026-07-15T08:00:00Z
- Author: Software Architect (Claude Sonnet 5, Agent Direct Mode)

## Trigger Decision Matrix

| Trigger | Applies? | Evidence | Source Trace |
|---|---:|---|---|
| Boundary Cross | yes | Crosses `core/gated-mutations`, `infra/sqlite`, a new `infra/postgres` seam (deferred), `features/storage`; hands off to SPEC-019 (Recovery) | ADR-PIPE-017 Module Boundaries |
| Contract Change | yes | New endpoints (Timeline query, migrate-forward gateway instantiation, restore-points, Tier-3 browser), new error codes, new agent-tool catalog | SPEC-017 api.spec.md §1, errors.spec.md §2 |
| System Wiring | yes | Dialect-conditional state machine; boot-sequence ordering across `reconcileInterruptedMigrationOnBoot` and `evaluateBootMigrationPolicy` | SPEC-017 behavior.spec.md §2.4 |
| Data And Persistence | yes | New sidecar `ops/storage-journal.db` (separate from `content.db`), new tables `storage_ledger`/`migration_runs`/`restore_points` | SPEC-017 state.spec.md §1 |
| Brownfield Dependency | yes | Amends a pre-existing spec (`003-site-install-dir`'s `SERVE_SITE` row) as a named follow-up; confirmed no existing code implements `SERVE_SITE` today | SPEC-017 Dependencies table; ADR-PIPE-017 Brownfield Grounding |
| Reverse-Spec Or Migration | no | Not a reverse-spec extraction. | N/A |
| Critical Cross-Boundary Invariant | yes | INV-01–INV-08 span the state machine, ledger, and boot sequence | SPEC-017 feature.spec.md Invariants |
| Parallelization Ambiguity | yes | SPEC-019 does not yet exist; Coordinator needs an explicit sequencing note for the REQ-14/REQ-23 hand-off | ADR-PIPE-017 Consequences (risk) |

## Module Map

| Module/Domain | Owns | Responsibility | Public Contracts | Dependencies | Notes |
|---|---|---|---|---|---|
| `features/storage` | SPEC-017 | Timeline, drift check, migrate-forward domain logic, restore-points, Tier-3 browser, agent-tool catalog | C-101–C-110 | `core/gated-mutations` (plan/confirm/execute, watermark, actor-identity), `infra/sqlite/storage-journal-db`, `infra/sqlite/db-ops` | Never re-implements gateway/watermark/actor-identity logic |
| `infra/sqlite/storage-journal-db` | This ADR | Sidecar DB bootstrap (`ops/storage-journal.db`) | Drizzle handle export | none | Mirrors `content-db.ts`'s existing pattern |
| `infra/sqlite/db-ops` | This ADR | SQLite `DbOpsPort` implementation | implements C-007 (SPEC-016) | `storage-journal-db` | Postgres adapter deferred |
| `core/gated-mutations` (existing, unchanged) | ADR-PIPE-016 | Generic gateway/watermark/actor-identity | C-001–C-008 | — | Imported, never modified |
| `ADS-project-knowledge/specs/003-site-install-dir` (pre-existing, external) | Legacy v1 spec suite | `SERVE_SITE`/status-lifecycle definitions | — | — | Requires a follow-up amendment (REQ-28–REQ-30), tracked as a task, not performed here |

## File Map

| File Path | Module | Creates / Changes | Public Contracts Housed | Responsibility | Why This Separation Exists | Notes |
|---|---|---|---|---|---|---|
| `src/features/storage/timeline.ts` | `features/storage` | creates | C-101 | Timeline read model | Read-only concern, separable from the write ceremony | New |
| `src/features/storage/drift.ts` | `features/storage` | creates | C-102 | Drift classification | Isolates the tag-vs-count precedence algorithm (CIC U-002) as its own testable unit | New |
| `src/features/storage/migrate-forward/state-machine.ts` | `features/storage` | creates | C-103 | Dialect-conditional state machine | The highest-risk unit in this domain — isolated so its transition table is independently reviewable/testable (CIC U-001) | New |
| `src/features/storage/migrate-forward/plan.ts`, `execute.ts` | `features/storage` | creates | C-104, C-105 | Gateway instantiation glue | Thin wrappers calling `core/gated-mutations`; keeps orchestration logic out of domain business logic | New |
| `src/features/storage/boot/reconcile-interrupted-migration.ts`, `evaluate-boot-migration-policy.ts` | `features/storage` | creates | C-106, C-107 | Boot-sequence checks | Separated into two files specifically so their required ordering (CIC U-004) is an explicit call-site concern in the boot composition root, not buried inside one file | New |
| `src/features/storage/restore-points.ts` | `features/storage` | creates | C-108 | `backup_create_restore_point` | Single-call write, distinct contract shape from the gateway | New |
| `src/features/storage/tier3-browser.ts` | `features/storage` | creates | C-109 | Tier-3 read-only browser | Mandatory redaction logic isolated for focused review (REQ-25/INV-07) | New |
| `src/infra/sqlite/storage-journal-db.ts` | `infra/sqlite` | creates | — | Sidecar DB bootstrap | Mirrors `content-db.ts` | New |
| `src/infra/sqlite/storage-journal-schema.ts` | `infra/sqlite` | creates | — | `storage_ledger`/`migration_runs`/`restore_points` Drizzle schema | Separate from `infra/db/schema.ts` (which is `content.db`'s schema) — different physical database | New |
| `src/infra/sqlite/db-ops.ts` | `infra/sqlite` | creates | C-007 (SPEC-016, implemented here) | SQLite `DbOpsPort` adapter | Dialect-specific implementation of SPEC-016's port | New |

## Contract Map

| Contract ID / Name | File | Owner Module | Kind | Why Needed | Job | Inputs | Outputs | Validation | Errors | Effect Boundary | Complexity / Resource View | Aggregate-Risk Note | Spec/ADR Trace | Test Seam / Expectation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C-101 `getTimeline` | `timeline.ts` | `features/storage` | exported function | Timeline read surface | Return filtered, paginated ledger rows | `{kind?, fromDate?, toDate?, outcome?, cursor?, limit}` (required object) | `{items: LedgerRow[], nextCursor}` | `limit ≤ 200`; no SQL text accepted | `VALIDATION_ERROR` | Pure read | O(limit) per page, cursor-based | N/A | SPEC-017 REQ-01, REQ-04, AC-01, AC-04 | Contract test: empty result set on no matches, never an error |
| C-102 `getDriftStatus` | `drift.ts` | `features/storage` | exported function | Drift classification for the banner/plan/execute | Compare `.site-meta.json` vs `__drizzle_migrations` by tag identity, never count | none (reads current state) | `DriftStatus` | Tag identity is always decisive over version-index count | none (pure query) | Pure read | O(1) | Adversarial case: equal `schemaVersion` index, different `schemaTag` → must classify `'diverged'`, not `'in-sync'` — see CIC U-002 | SPEC-017 REQ-03, behavior.spec.md §1.1, AC-03 | Property test: exhaustive tag/index combination matrix |
| C-103 State machine transition function | `migrate-forward/state-machine.ts` | `features/storage` | exported function(s) | Drives the migrate-forward ceremony's dialect-conditional states | Advance `MigrationRunStatus` per the legal-transition table, dialect-branched | current state + dialect + step outcome | next `MigrationRunStatus` | Illegal transitions must be structurally rejected, not silently allowed | throws on illegal transition attempt | Side effect: persists state transitions to `migration_runs` | O(1) per transition | Adversarial case: `CUTOVER_FAILED` must never be conflated with the `APPLYING`/`VERIFYING` failure edge — see CIC U-001 | SPEC-017 REQ-11-REQ-14, state.spec.md §1-§3, AC-12-AC-15, AC-40 | State-transition test: exhaustive legal/illegal table per dialect |
| C-104 `planMigrateForward` | `migrate-forward/plan.ts` | `features/storage` | exported function | `storage_plan_migrate_forward` | Call `core/gated-mutations.plan()` with `domain="storage.migrate"`, attach `MigratePlan.details` (costClass, cost estimate) | none (derived from live state) | `Result<MigratePlanResponse>` | Cost estimate required non-null when `costClass === 'expensive'` | inherited from C-001 (SPEC-016) | Pure decision, delegates to C-001 | O(1) plus `db-ops.getCapabilities()` cost | N/A | SPEC-017 REQ-06, AC-06, AC-07 | Contract test: cross-principal-kind identical `planHash` (AC-07) |
| C-105 `executeMigrateForward` | `migrate-forward/execute.ts` | `features/storage` | exported function | `storage_execute_migrate_forward` | Call `core/gated-mutations.execute()`; additionally refuse on `costClass === 'unavailable'` (REQ-08); acquire the SHARED `core/operation-lock.ts` primitive (`acquireOperationLock({siteId, operationKind:'migration'})`, per GOV-ADR-002 / ADR-PIPE-019) before the state machine proceeds — this is a site-wide lock also consulted by Recovery's `executeRestore`, never a Storage-local check (corrected 2026-07-15 per audit-work internal verification; originally drafted as an independent local guard before ADR-PIPE-019 decided the lock must be shared) | `{confirmationToken}` | `Result<MigrateExecuteResult>` | No attestation-override bypass honored ever | `RESTORE_POINT_UNAVAILABLE`, `MIGRATION_ALREADY_IN_FLIGHT` (this domain's error code, wrapping the shared lock's rejection), plus SPEC-016's codes | Side effect: runs the state machine to a terminal state | O(1) gateway overhead plus state-machine cost | Adversarial case: a concurrent Storage-execute and Recovery-execute attempt against the same site — see SPEC-019 Critical Internal Constraints U-001 (the shared-lock designation lives there; this domain's implementation is bound by it, not a separate designation) | SPEC-017 REQ-08, REQ-09, AC-09, AC-10, AC-41, AC-42; SPEC-019 REQ-13, INV-03 | Integration test: concurrent Storage-execute + Recovery-execute, exactly one winner (see SPEC-019 implementation-outline.md W-302/W-303) |
| C-106 `reconcileInterruptedMigrationOnBoot` | `boot/reconcile-interrupted-migration.ts` | `features/storage` | exported function | Boot-time crash reconciliation | Convert a non-terminal `migration_runs` row into a `migration.interrupted` ledger row, block site-open | none (boot-time, reads sidecar journal) | `void` (blocks or resolves) | Must run and resolve/block before C-107 | none | Side effect: writes ledger row, sets serving-status gate | O(1) | See CIC U-004 (must precede C-107) | SPEC-017 REQ-15, INV-08, AC-17 | Integration test: boot with a non-terminal row present |
| C-107 `evaluateBootMigrationPolicy` | `boot/evaluate-boot-migration-policy.ts` | `features/storage` | exported function | Cost-gated auto-migrate vs. `PENDING_MIGRATION` decision | Branch on `costClass` fresh each boot | none (boot-time) | `void` (mutates `site.servingStatus` or triggers `AUTO_MIGRATE_ON_BOOT`) | Must NOT run until C-106 has resolved/blocked | none | Side effect: runs migration or sets `PENDING_MIGRATION` | O(1) plus migration cost if triggered | See CIC U-004 | SPEC-017 REQ-28-REQ-30, AC-37-AC-39 | Integration test: boot-sequence ordering enforced even under parallel-dispatch temptation |
| C-108 `createRestorePoint` | `restore-points.ts` | `features/storage` | exported function | `backup_create_restore_point` | Mint a restore point independent of any migration | `{costAck?: boolean}` | `Result<RestorePointSummary>` | `costAck` required when `costClass === 'expensive'` | `VALIDATION_ERROR`, `RESTORE_POINT_UNAVAILABLE` | Side effect: durable restore-point artifact + row | dialect-dependent (cheap for SQLite) | N/A | SPEC-017 REQ-22, AC-26, AC-27 | Contract test: missing `costAck` on expensive site → `VALIDATION_ERROR` |
| C-109 `tier3ReadRows`/`describeTables` | `tier3-browser.ts` | `features/storage` | exported functions | Bounded, redacted read-only table browser | Enforce ADR-022 bounded expression language, `limit≤200`, unconditional `sensitive` redaction | `{table, where?, orderBy?, cursor?, limit?}` | `{rows, nextCursor}` / `TableDescriptor[]` | No raw SQL text; `sensitive: true` columns never appear in output | `VALIDATION_ERROR`, `TIER3_DISABLED` | Side effect: none (read-only, statement-timeout bounded) | O(limit) per page | Adversarial case: a `where` clause referencing a `sensitive` column must silently omit that column from output, never error, never leak (INV-07) | SPEC-017 REQ-25, REQ-26, AC-31-AC-35 | Contract test: sensitive column never appears regardless of caller permission tier |
| C-110 Agent-tool catalog | `agent-tools.ts` | `features/storage` | exported registrations | Expose this domain's tools per SPEC-016 REQ-22's naming convention | Register read tools, `storage_plan/execute_migrate_forward`, `backup_create_restore_point`, `storage_get_restore_guidance` | — | — | No `storage_confirm_migrate_forward` tool ever; no Tier-3 tool ever | N/A | N/A | N/A | SPEC-017 REQ-20-REQ-23, AC-24, AC-25, AC-28, AC-33 | Contract test: catalog inspection confirms no confirm/Tier-3 tool exists |

## Wiring Map

| Flow ID | Source | Transport/Call Type | Target | Payload/Contract | Ordering/Retry/Idempotency | Failure Handling | Trace |
|---|---|---|---|---|---|---|---|
| W-101 | Route handler `/storage/migrate-forward/plan` | direct call | C-104 → `core/gated-mutations.plan()` (C-001) | C-104 | Read-only, no retry semantics needed | Domain route maps errors per errors.spec.md | SPEC-017 api.spec.md §1 |
| W-102 | Route handler `/storage/migrate-forward/execute` | direct call | C-105 → `core/operation-lock.acquireOperationLock()` (shared, GOV-ADR-002) → `core/gated-mutations.execute()` (C-003) → C-103 (state machine) | C-105 | Single-use redemption; the shared site-wide lock (not a Storage-local check) must be acquired before the gateway's own mutation proceeds | Maps to `PLAN_STALE`/`TOKEN_EXPIRED`/`FORBIDDEN`/`RESTORE_POINT_UNAVAILABLE`/`MIGRATION_ALREADY_IN_FLIGHT` (wrapping the shared lock's own rejection) | SPEC-017 api.spec.md §1, §6; SPEC-019 REQ-13 |
| W-102a | C-105 (`executeMigrateForward`), before the state machine proceeds | direct call | `core/operation-lock.acquireOperationLock()` (shared primitive; see SPEC-019 implementation-outline.md C-309) | `{siteId, operationKind:'migration'}` | Must succeed before C-105 proceeds to C-103; the SAME primitive Recovery's `executeRestore` (SPEC-019 W-302) also acquires — never an independent Storage-local check | `RESTORE_OPERATION_IN_FLIGHT`-equivalent rejection if already held by a Recovery restore | GOV-ADR-002; SPEC-019 REQ-13, INV-03 |
| W-103 | C-103 (state machine, quiesce step) | direct call | `core/gated-mutations.stampWatermark()` (C-004) | C-004 | Must run inside quiesce's own transaction, at the moment quiesce completes | If quiesce's transaction fails, `revisionSeqAtQuiesce` never lands | SPEC-017 REQ-10, AC-11 |
| W-104 | C-103 (state machine, `APPLYING`/`VERIFYING` failure) | hand-off (not a direct call — routes to a sibling surface) | SPEC-019 (Backups/Recovery)'s own restore-confirmation flow | `StorageContextEnvelope` | Storage never executes the restore itself | SPEC-019 not yet built — this hand-off's receiving side is a sequencing risk (see ADR-PIPE-017 Consequences) | SPEC-017 REQ-14, REQ-23, W-104 note |
| W-105 | Boot composition root | direct call, sequential (never parallel) | C-106 then, only after resolution, C-107 | C-106, C-107 | C-106 MUST fully resolve/block before C-107 is even invoked — not merely deprioritized | If C-106 blocks (non-terminal row found), C-107 never runs this boot cycle | SPEC-017 REQ-15, INV-08, behavior.spec.md §2.4 |
| W-106 | C-107 (`evaluateBootMigrationPolicy`, `costClass==='cheap'`) | direct call, boot-time, no-token | C-103 (state machine) under a reserved boot policy | internal | Attributed to seeded `kind='system'` principal via `core/gated-mutations.appendActorReference()` (C-006) | Same failure handling as `executeMigrateForward` | SPEC-017 REQ-28, AC-37 |

## Data And Side-Effect Boundaries

| Boundary | Owner | Reads | Writes | Side Effects | Consistency / Transaction Rule | Migration / Dual-Write Path |
|---|---|---|---|---|---|---|
| `storage_ledger` (in `ops/storage-journal.db`) | `features/storage` | Timeline, Site-Health card | State-machine transitions, restore-point creation, boot reconciliation | None beyond the row write | Every row of a kind other than `index.provision`/`index.drop` must reference an existing `restore_points` row at creation (INV-02) | N/A — new sidecar file, no prior data |
| `migration_runs` (in `ops/storage-journal.db`) | `features/storage` | Boot reconciliation, Timeline | State-machine transitions only | None | Must never enter `SNAPSHOTTING` before `QUIESCING` completes (INV-01) | N/A |
| `restore_points` (in `ops/storage-journal.db`) | `features/storage` | Recovery (SPEC-019), Timeline | `createRestorePoint` (C-108), state-machine snapshot step | Captures a restore artifact (SQLite whole-file backup / Postgres `pg_dump`) | `watermarkAtCapture` set from SPEC-016's `stampWatermark`-adjacent read at capture time (SPEC-016 REQ-06) | N/A |
| `content.db`'s `storage_write_watermark` column | `core/gated-mutations` (SPEC-016, read-only from this domain's perspective) | This domain reads it at quiesce (REQ-10) | Never written directly by this domain — only via `core/gated-mutations.stampWatermark()` | None | Same-transaction atomicity guaranteed by SPEC-016, not re-verified here | N/A |

## Observability And Operational Expectations

| Surface / Flow | Required Signals | Correlation / Trace Context | Metrics | Logs | Alert / Runbook Need | Privacy / Secret Constraints | Trace |
|---|---|---|---|---|---|---|---|
| Migrate-forward ceremony | Timeline row per state transition (durable, not just log lines) | `correlationId` on every `storage_ledger`/`migration_runs` row | Not specified — deferred to future Site Health surface (ADR-041 §1) | Structured error envelope | N/A — owned by future Site Health surface | `sensitive: true` columns must never appear in any Tier-3 browser log/response | SPEC-017 errors.spec.md §1 |
| Boot-sequence reconciliation | `migration.interrupted` ledger row is itself the durable observability signal | Correlation id minted at boot | N/A | N/A | Operator-visible via Timeline + admin-reachable-but-degraded state | N/A | SPEC-017 REQ-15 |

## Critical Invariants

| Invariant ID | Scope | Rule | Reason | Enforcement Surface | Test Expectation | Trace |
|---|---|---|---|---|---|---|
| INV-01 | `migration_runs` (this domain) | Never enters `SNAPSHOTTING` before `QUIESCING` completes | Snapshotting before quiesce completes could capture a state with in-flight writes still landing | C-103 (state machine) | State-transition test | SPEC-017 feature.spec.md INV-01 |
| INV-02 | `storage_ledger` (this domain) | A row of a kind other than index ops always references an existing `restore_points` row at creation | Prevents an unrecoverable ledger entry with no anchor to restore from | C-103, C-108 | Integration test | SPEC-017 feature.spec.md INV-02 |
| INV-03 | `storage_ledger` (this domain) | `index.provision`/`index.drop` rows never carry a non-null `restorePointId` | Distinguishes the ADR-023 §4 carve-out from table-shape-changing DDL | C-103 | Contract test | SPEC-017 feature.spec.md INV-03 |
| INV-04 | `site.servingStatus` (this domain) | Never transitions from `PENDING_MIGRATION` to `SERVING` except via successful execute or a boot where `costClass` becomes `'cheap'` | Prevents silent resumption of public serving on a degraded/unverified schema | C-107 | Integration test | SPEC-017 feature.spec.md INV-04 |
| INV-05 | `migration_runs` (Postgres) | Never applies schema changes in-place against the serving (blue) schema | Blue must remain untouched until an atomic, verified cutover | C-103 (Postgres branch) | State-transition test | SPEC-017 feature.spec.md INV-05 |
| INV-06 | `migration_runs.quiesceIntegrity` | Never any value other than `'chokepoint-only'` or absent | Prevents an undocumented, unreviewed third disclosure state | C-103 | Contract test | SPEC-017 feature.spec.md INV-06 |
| INV-07 | Tier-3 browser (this domain) | `sensitive: true` column values never returned, even transiently, regardless of permission tier | Prevents credential/secret leakage through an otherwise-legitimate read surface | C-109 | Property test across all permission tiers | SPEC-017 feature.spec.md INV-07 |
| INV-08 `[internal-invariant]` | Boot sequence (this domain) | `evaluateBootMigrationPolicy` never runs while a non-terminal `migration_runs` row exists | Prevents running cost-gated auto-migrate atop an already-crashed, unresolved migration | Boot composition root (W-105's sequential-only wiring) | Integration test: boot with non-terminal row, assert C-107 never invoked | SPEC-017 feature.spec.md INV-08, behavior.spec.md §2.4; see CIC U-004 |

## Brownfield / Migration Mapping

| Source Behavior / Contract | Target Module / Contract | Preserve / Change | Characterization Evidence | Migration Safety Note |
|---|---|---|---|---|
| `ADS-project-knowledge/specs/003-site-install-dir`'s `SERVE_SITE` row (spec only — no running code) | This domain's REQ-28-REQ-30 cost-gated boot policy | Change — the spec-level behavior description is superseded by the cost-gated version; no running code exists to preserve compatibility with | Confirmed via direct grep: no `SERVE_SITE`/`serveSite` implementation exists in `src/` | The mechanical edit to that pre-existing spec file is a tracked follow-up task, not performed by this outline or its ADR |
| `src/infra/sqlite/content-db.ts` (existing bootstrap pattern) | `src/infra/sqlite/storage-journal-db.ts` (new, mirrors the pattern) | Preserve the pattern, apply to a new file | Direct read of `content-db.ts` | Zero blast radius on `content.db`'s own bootstrap |

## Test Expectations

- Contract tests: C-101–C-110.
- Integration tests: W-103 (same-transaction watermark stamping at quiesce), W-105 (boot-sequence ordering under a simulated crash), W-104 (hand-off envelope shape, deferred full integration until SPEC-019 exists).
- Property/invariant tests: INV-01 through INV-08, especially INV-08 (boot-sequence ordering) and INV-05 (blue never touched pre-cutover).
- Characterization tests: N/A.
- Explicitly N/A suites with reason: Postgres `db-ops` adapter contract tests — N/A, adapter deferred (OQ-03 unresolved).

## Downstream Handoff Notes

- Coordinator task-generation constraints: C-106/C-107's boot-sequence ordering (W-105) must be a single sequential task or two tasks with an explicit blocking dependency — never marked `[P]` parallel to each other. Tasks touching `features/storage` cannot start until `core/gated-mutations` (SPEC-016) is implemented.
- TDD focus: prioritize C-103's exhaustive transition-table test and the boot-sequence ordering integration test (INV-08) first — both are the highest-consequence units in this domain.
- Programmer architecture audit focus: confirm `storage_ledger`/`migration_runs`/`restore_points` never land in `content.db`'s own schema file; confirm C-106 always precedes C-107 in the actual boot composition root wiring, not just in tests.
- Open risks or ambiguities: SPEC-019 (Recovery) does not yet exist — W-104's hand-off is defined at the contract level only; full integration testing of that flow is blocked until SPEC-019's own architecture work lands. SPEC-016's OQ-01 (watermark contention) and this spec's own OQ-01/OQ-03/OQ-05/OQ-06 remain open per their stated owners/deadlines.
