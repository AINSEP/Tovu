# Implementation Outline: backups-recovery

- Spec: SPEC-019 v1.1.0 (hash: sha256:eb0588d10723af1981dbad16975255bc05681df346246287a9c546514c854f4d)
- ADR: ADR-PIPE-019
- Status: PRODUCED
- Trigger result: Boundary Cross, Contract Change, System Wiring, Data And Persistence, Brownfield Dependency, Critical Cross-Boundary Invariant
- Date: 2026-07-15T10:00:00Z
- Author: Software Architect (Claude Sonnet 5, Agent Direct Mode)

## Trigger Decision Matrix

| Trigger | Applies? | Evidence | Source Trace |
|---|---:|---|---|
| Boundary Cross | yes | Crosses `core/gated-mutations`, the new shared `core/operation-lock`, `features/storage` (lock coordination + sidecar journal read), `features/recovery` | ADR-PIPE-019 Module Boundaries |
| Contract Change | yes | New routes, agent-tool catalog, domain error codes | SPEC-019 api.spec.md, errors.spec.md |
| System Wiring | yes | Cross-screen in-flight lock coordination between Storage and Recovery; deep-link hand-off consumption from Storage | SPEC-019 REQ-13, REQ-20 |
| Data And Persistence | yes | Reads SPEC-017's sidecar ops journal live (no new tables of its own) | SPEC-019 Dependencies table |
| Brownfield Dependency | yes | Consumes ADR-041 §7's `StorageContextEnvelope` unchanged; supersedes pre-ADR-041 `/admin/backups`/`/admin/database` sitemap entries | SPEC-019 REQ-20, REQ-27 |
| Reverse-Spec Or Migration | no | Not a reverse-spec extraction. | N/A |
| Critical Cross-Boundary Invariant | yes | INV-01-INV-07 span this domain and its coordination with SPEC-017 | SPEC-019 feature.spec.md Invariants |
| Parallelization Ambiguity | yes | This domain's tasks depend on the shared `core/operation-lock` primitive existing before either Storage or Recovery's own gated-mutation tasks can be considered complete — Coordinator needs this made explicit | ADR-PIPE-019 Consequences |

## Module Map

| Module/Domain | Owns | Responsibility | Public Contracts | Dependencies | Notes |
|---|---|---|---|---|---|
| `features/recovery` | SPEC-019 | Restore ceremony, restore-point creation, disclosure, deep-link resolution, agent tools | C-301-C-308 | `core/gated-mutations`, `core/operation-lock` (new, shared), SPEC-017's sidecar journal (read-only) | `RecoveryOrchestrator` matches spec's own assumed naming |
| `core/operation-lock` (new, shared) | This ADR (jointly with ADR-PIPE-017) | Site-wide gated-operation mutual exclusion | C-309 | none | MUST be imported by both `features/storage` and `features/recovery`, never reimplemented per-domain (GOV-ADR-002) |
| `core/gated-mutations` (existing, unchanged) | ADR-PIPE-016 | Generic gateway | C-001-C-008 | — | Imported for the restore ceremony only |
| `features/storage` (SPEC-017, external to this ADR) | SPEC-017 | Migrate-forward ceremony, sidecar journal, `PENDING_MIGRATION`/`migration.interrupted` signals | — | `core/operation-lock` | This domain's degraded banners deep-link into it; this domain reads its sidecar journal for restore-run progress |

## File Map

| File Path | Module | Creates / Changes | Public Contracts Housed | Responsibility | Why This Separation Exists | Notes |
|---|---|---|---|---|---|---|
| `src/features/recovery/recovery-orchestrator.ts` | `features/recovery` | creates | C-301-C-303 | Restore ceremony instantiation | Matches the module/class name this spec's own errors.spec.md already assumes | New |
| `src/features/recovery/restore-points.ts` | `features/recovery` | creates | C-304 | `createRestorePoint`, ordinary mutation | Kept structurally separate from the gateway-instantiated ceremony (CIC-adjacent: never conflate the two mutation classes) | New |
| `src/features/recovery/disclosure.ts` | `features/recovery` | creates | C-305 | Discarded-window disclosure computation | Isolated so the `coveredCategories` versioned constant (REQ-09) is a single, auditable edit point | New |
| `src/features/recovery/deep-link.ts` | `features/recovery` | creates | C-306 | `resolveDeepLinkContext` | Isolated so the mandatory server-side re-verification rule is a single reviewable unit (CIC U-002-adjacent trust boundary) | New |
| `src/features/recovery/agent-tools.ts` | `features/recovery` | creates | C-307 | Agent-tool catalog | Matches convention used by SPEC-017/018 | New |
| `src/core/operation-lock.ts` | `core` | creates | C-309 | Shared site-wide in-flight lock | GOV-ADR-002 — single shared primitive, not per-domain | New, jointly consumed by SPEC-017 and SPEC-019 |

## Contract Map

| Contract ID / Name | File | Owner Module | Kind | Why Needed | Job | Inputs | Outputs | Validation | Errors | Effect Boundary | Complexity / Resource View | Aggregate-Risk Note | Spec/ADR Trace | Test Seam / Expectation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C-301 `planRestore` | `recovery-orchestrator.ts` | `features/recovery` | exported function | Restore ceremony's plan step | Fresh `costClass` re-check, then delegate to `core/gated-mutations.plan()` | `{restorePointId}` | `Result<BackupRestorePlanResponse>` | `costClass` re-checked fresh, not cached (behavior.spec.md §2.2) | `RESTORE_POINT_NOT_FOUND`, `COST_CLASS_UNAVAILABLE` | Pure decision (delegates to C-001) | O(1) plus `getCapabilities()` cost | Adversarial case: `costClass` degrades between list-fetch and plan-call — see CIC U-003 | SPEC-019 REQ-06, REQ-07, AC-12, AC-13 | Contract test: stale-cached costClass never reaches the gateway |
| C-302 `confirmRestore` | `recovery-orchestrator.ts` | `features/recovery` | exported function | Restore ceremony's confirm step | Requires `disclosureAcknowledged: true`; delegates to `core/gated-mutations.confirm()` | `{planId, planHash, disclosureAcknowledged}` | `Result<ConfirmationToken>` | Rejected (no token minted) if `disclosureAcknowledged !== true` (INV-02) | `FORBIDDEN` (incl. missing acknowledgment, non-user kind) | Side effect: mints token via C-002 | O(1) | Adversarial case: a client bypassing its own UI gate and calling confirm directly without acknowledgment — see CIC U-002 | SPEC-019 REQ-08, AC-14, AC-15 | Contract test: server-side rejection independent of any client-side gating |
| C-303 `executeRestore` | `recovery-orchestrator.ts` | `features/recovery` | exported function | Restore ceremony's execute step | Delegates to `core/gated-mutations.execute()`; consults `core/operation-lock` before proceeding | `{confirmationToken}` | `Result<RestoreExecuteResult>` | Site-wide lock must be free (checked via C-309) | `PLAN_STALE`, `TOKEN_EXPIRED`, `TOKEN_ALREADY_REDEEMED`, `FORBIDDEN`, `RESTORE_OPERATION_IN_FLIGHT` | Side effect: runs the restore state machine | O(1) gateway overhead plus restore cost | Adversarial case: concurrent restore+migrate attempt — see CIC U-001 | SPEC-019 REQ-13, AC-21, AC-22 | Integration test: concurrent Storage-migrate + Recovery-restore attempt, exactly one proceeds |
| C-304 `createRestorePoint` | `restore-points.ts` | `features/recovery` | exported function | Ordinary, non-gated restore-point creation | `authorize()`-gated single call; explicitly does not call `core/gated-mutations` | `{idempotencyKey, trigger: 'manual'}` | `Result<RestorePointSummary>` | `authorize()` before idempotency (SPEC-016 REQ-14); site-wide lock checked (REQ-13 extends here too, per behavior.spec.md's `onBeforeCreateOrExecute` hook) | `FORBIDDEN`, `RESTORE_OPERATION_IN_FLIGHT` | Side effect: restore-point artifact + row | dialect-dependent (cheap for SQLite) | N/A | SPEC-019 REQ-05, AC-10, AC-11 | Contract test: never routed through plan/confirm/execute |
| C-305 `computeDisclosure` | `disclosure.ts` | `features/recovery` | exported function | Discarded-write-window disclosure | Reads SPEC-016's `watermarkAtCapture` baseline against `coveredCategories` versioned constant | `{restorePointId}` | `DisclosureResponse` | Never asserts a count for an uncovered category (INV-05) | `WATERMARK_BASELINE_UNAVAILABLE` (SPEC-016) | Pure read | O(1) | Adversarial case: a future category silently added without a version bump — see Enforcement | SPEC-019 REQ-09-REQ-11, AC-16-AC-19 | Contract test: uncovered category never appears in output |
| C-306 `resolveDeepLinkContext` | `deep-link.ts` | `features/recovery` | exported function | Deep-link envelope resolution | Server-side re-lookup of every carried id; never trusts the envelope | `{envelope: StorageContextEnvelope}` | `RecoveryContextResponse` | Every id independently re-verified | none (returns `{found: false}` rather than erroring) | Pure read (re-lookup) | O(1) per carried id | Adversarial case: forged/stale envelope id — must never be trusted implicitly | SPEC-019 REQ-20, REQ-21, AC-30, AC-31 | Contract test: rendering never derives from the envelope's raw carried value |
| C-307 Agent-tool catalog | `agent-tools.ts` | `features/recovery` | exported registrations | Expose this domain's tools | Register per SPEC-016 REQ-22's convention | — | — | No `backup_confirm_restore`-equivalent tool ever | N/A | N/A | N/A | SPEC-019 REQ-23-REQ-25, AC-33-AC-35 | Contract test: catalog inspection |
| C-308 Banner precedence resolver | `ui/degraded-banners.ts` | `features/recovery` | exported function (UI-layer) | Resolve which degraded banner renders when multiple are true | Fixed precedence order (behavior.spec.md §1.1) | `capabilities` state | banner selection | Interrupted-run always outranks PENDING_MIGRATION | N/A | Pure UI decision | N/A — considered for CIC, not designated (see ADR-PIPE-019) | SPEC-019 behavior.spec.md §1.1, EC-06 | Contract test: all pairwise combinations |
| C-309 `acquireOperationLock`/`releaseOperationLock` | `core/operation-lock.ts` | `core` (shared) | exported functions | Site-wide gated-operation mutual exclusion | Atomic acquire-or-reject, site-scoped | `{siteId, operationKind: 'migration'\|'restore'}` | `Result<LockHandle>` | Exactly one lock holder per site at a time | `RESTORE_OPERATION_IN_FLIGHT` / analogous Storage-side code | Side effect: lock state | O(1) | This IS the CIC U-001 unit | SPEC-019 REQ-13, INV-03; GOV-ADR-002 | Property test: concurrent acquire attempts from both domains, exactly one wins |

## Wiring Map

| Flow ID | Source | Transport/Call Type | Target | Payload/Contract | Ordering/Retry/Idempotency | Failure Handling | Trace |
|---|---|---|---|---|---|---|---|
| W-301 | Route handler | direct call | C-301-C-303 (RecoveryOrchestrator) → `core/gated-mutations` (C-001-C-003) | respective contract | disclosure-acknowledgment gate (INV-02) before confirm; site-lock check before execute | Maps to SPEC-016 codes plus domain codes | SPEC-019 api.spec.md |
| W-302 | C-303 (`executeRestore`) | direct call | `core/operation-lock.acquireOperationLock()` (C-309) | C-309 | Must acquire before the gateway's own `execute()` proceeds to the domain mutation | `RESTORE_OPERATION_IN_FLIGHT` if already held | SPEC-019 REQ-13 |
| W-303 | `features/storage`'s migrate-forward `execute()` (SPEC-017, external) | direct call | `core/operation-lock.acquireOperationLock()` (C-309) | C-309 | Same shared primitive, same semantics | Storage-side equivalent of `RESTORE_OPERATION_IN_FLIGHT` | ADR-PIPE-017 W-102 (cross-reference) |
| W-304 | `features/recovery`'s progress panel | direct call, polling | SPEC-017's sidecar ops journal (read-only) | live `RestoreRunState` | Never cached from the initial `execute()` response — always re-read live | Page refresh mid-restore resumes correctly (REQ-14) | SPEC-019 REQ-14, REQ-15 |
| W-305 | Site-Health / Storage Timeline | deep-link navigation | C-306 (`resolveDeepLinkContext`) | `StorageContextEnvelope` | Every carried id re-verified server-side on arrival | `DEEP_LINK_TARGET_NOT_FOUND` → unfocused list fallback | SPEC-019 REQ-20, REQ-21 |

## Data And Side-Effect Boundaries

| Boundary | Owner | Reads | Writes | Side Effects | Consistency / Transaction Rule | Migration / Dual-Write Path |
|---|---|---|---|---|---|---|
| SPEC-017's sidecar ops journal (`storage_ledger`, `migration_runs`, `restore_points`) | SPEC-017 (owner), this domain reads only | Restore-points list, progress panel, disclosure computation | This domain never writes to these tables directly — restore execution writes go through `core/gated-mutations`/SPEC-017's own mechanism | None from this domain's own code | Read-only from this domain's perspective | N/A |
| The shared operation lock state | `core/operation-lock` | Both `features/storage` and `features/recovery` | Both domains, via C-309 only | Blocks a second concurrent gated operation | Exactly one holder per site at a time | N/A — new primitive |

## Observability And Operational Expectations

| Surface / Flow | Required Signals | Correlation / Trace Context | Metrics | Logs | Alert / Runbook Need | Privacy / Secret Constraints | Trace |
|---|---|---|---|---|---|---|---|
| Restore ceremony | Structured error envelope; live progress panel is the primary observability surface | `correlationId` on error envelope | Not specified — v1 admin feature | Standard error envelope | N/A | None beyond standard workspace-scoping | SPEC-019 errors.spec.md |

## Critical Invariants

| Invariant ID | Scope | Rule | Reason | Enforcement Surface | Test Expectation | Trace |
|---|---|---|---|---|---|---|
| INV-01 | Recovery UI (this domain) | Never renders an enabled Restore action when `costClass` is `'unavailable'` | Matches REQ-12's degraded-mode requirement | UI + C-301's fresh recheck | Contract test | SPEC-019 feature.spec.md INV-01 |
| INV-02 | Restore ceremony (this domain) | Disclosure must never be skipped, pre-checked, or auto-acknowledged | The domain's central safety property | C-302 | Contract test | SPEC-019 feature.spec.md INV-02; see CIC U-002 |
| INV-03 | Cross-domain (this domain + SPEC-017) | A restore point must never be presented as restorable while an operation is already in flight | GOV-ADR-002's shared-lock rule | C-309 | Property test | SPEC-019 feature.spec.md INV-03; see CIC U-001 |
| INV-04 | Deep-link handling (this domain) | Never treats an envelope's carried id as authoritative without server-side re-lookup | Trust-boundary property (ADR-041 §7) | C-306 | Contract test | SPEC-019 feature.spec.md INV-04 |
| INV-05 | Disclosure (this domain) | Never asserts a count for a category not confirmed watermark-stamped | Honesty-over-false-precision property | C-305 | Contract test | SPEC-019 feature.spec.md INV-05 |
| INV-06 | Agent-tool catalog (this domain) | A confirm()-equivalent call must never be reachable | Human-only confirmation, no exception | C-307 | Contract test | SPEC-019 feature.spec.md INV-06 |
| INV-07 | Degraded banners (this domain) | A `PENDING_MIGRATION` banner's action must never route to a restore-flow action on Recovery | Prevents offering the wrong resolution for the wrong degraded state | C-308 | Contract test | SPEC-019 feature.spec.md INV-07 |

## Brownfield / Migration Mapping

| Source Behavior / Contract | Target Module / Contract | Preserve / Change | Characterization Evidence | Migration Safety Note |
|---|---|---|---|---|
| Pre-ADR-041 `/admin/backups`/`/admin/database` sitemap entries | `/admin/recovery` (this domain) | Change — supersede per REQ-27 | Confirmed no backup/recovery code exists in `src/` today, so no running behavior is actually being replaced, only a sitemap/routing intent | The mechanical sitemap update is a follow-up task, same pattern as SPEC-017's `SERVE_SITE` amendment |
| ADR-041 §7 `StorageContextEnvelope` (existing spec-level contract) | C-306 (`resolveDeepLinkContext`) | Preserve unchanged | Direct read of ADR-041 §7 | Zero blast radius — consumed as-is |

## Test Expectations

- Contract tests: C-301-C-309.
- Integration tests: W-302/W-303 (cross-domain lock contention), W-304 (progress-panel refresh-safety).
- Property/invariant tests: INV-01 through INV-07, especially INV-02 (disclosure gate) and INV-03 (cross-domain lock).
- Characterization tests: N/A.
- Explicitly N/A suites with reason: none.

## Downstream Handoff Notes

- Coordinator task-generation constraints: `core/operation-lock.ts` (C-309) must be built once and consumed by both SPEC-017 and SPEC-019's own tasks — neither domain's gated-mutation tasks are complete until this shared primitive exists and both domains consume it.
- TDD focus: prioritize C-309's cross-domain concurrent-acquire property test and C-302's server-side disclosure-acknowledgment enforcement test first.
- Programmer architecture audit focus: confirm no independent in-flight-lock logic exists in either `features/storage` or `features/recovery`; confirm `resolveDeepLinkContext` never short-circuits to the envelope's raw value.
- Open risks or ambiguities: OQ-03 (authorize() behavior when content.db is unreadable) remains genuinely unresolved across SPEC-016/017/019 — see ADR-PIPE-019 Consequences for the explicit Coordinator routing recommendation. OQ-01/OQ-02 (findability, quick-restore path) remain open per their stated owners.
