# Test Certification Record

- Test Suite: backups-recovery
- Spec ID: SPEC-019
- Spec Version: 1.1.0
- Spec Hash: sha256:eb0588d10723af1981dbad16975255bc05681df346246287a9c546514c854f4d
- Spec Hash Verification: `python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/019-backups-recovery --phase preflight` — exit 0, `PASS: strict Speckit package passed mechanical validation.` (run 2026-07-15, this dispatch). Hash also cross-checked by direct read against `SPEC-019-feature.spec.md`'s Header Metadata table and `pipeline-state.md`'s `spec_hash`/`planning_preflight_spec_hash`/`red_team_spec_hash` fields — all four match.
- ADR: `ADS-memory/reports/pipeline/019-backups-recovery/adr.md` (ADR-PIPE-019) — Status ACCEPTED
- Tasks: `ADS-memory/reports/pipeline/019-backups-recovery/tasks.md` (produced this dispatch)
- Certified At: 2026-07-15T19:00:00Z
- Certified By: TDD Agent (Claude Sonnet 5, Agent Direct Mode)

## Test File Inventory

| Test File | Type | Spec Refs | sha256 | Expected Test Count | Red Evidence |
|---|---|---|---|---:|---|
| `src/core/__tests__/unit/operation-lock.unit.test.ts` | unit | CIC U-001-B1, U-001-B2 | sha256:88afbd8929fa39ea84f08697630f5ac32b63c7af923accefa9459875de6e7995 | 5 | Fails to compile: `../../operation-lock` does not exist (`core/operation-lock.ts` not yet implemented, expected — this is the red phase) |
| `src/core/__tests__/integration/operation-lock.cross-domain.integration.test.ts` | integration | CIC U-001-B1/ORD1, REQ-13, INV-03 | sha256:4629f2d1b35ed603456834d1fb886501693af92018439cd6f611798e935ad2d0 | 3 | Fails to compile: same missing module |
| `src/features/recovery/__tests__/unit/recovery-orchestrator.plan-restore.unit.test.ts` | unit | CIC U-003, REQ-07, REQ-12, AC-06, AC-13, EC-05 | sha256:c7a927a2f283ae906ceca209e7d0c88e28903bcb0dc4c97af969508d57dd1d93 | 4 | Fails to compile: `../../recovery-orchestrator` does not exist |
| `src/features/recovery/__tests__/unit/recovery-orchestrator.confirm-restore.unit.test.ts` | unit | CIC U-002, REQ-08, INV-02, AC-14, AC-15 | sha256:7ffb5470f9997530babedc6d403c61729c4395e24520215d79132b66e90b45cc | 5 | Fails to compile: same missing module |
| `src/features/recovery/__tests__/integration/recovery-orchestrator.execute-restore.integration.test.ts` | integration | CIC U-001-ORD1, REQ-13, REQ-16, REQ-18, AC-21, AC-22, AC-26, AC-28, EC-04, EC-07 | sha256:324a7fbaade3af5f1a11f457f3f922ed424b8960a35bf535442577e4fb810855 | 5 | Fails to compile: `../../recovery-orchestrator` and `../../../../core/operation-lock` do not exist |
| `src/features/recovery/__tests__/unit/restore-points.unit.test.ts` | unit | REQ-05, AC-10, AC-11 | sha256:fbf30c41665568c9cf4085953985d58c933be572ff220e582246cefa82d0acd6 | 4 | Fails to compile: `../../restore-points` does not exist |
| `src/features/recovery/__tests__/unit/disclosure.unit.test.ts` | unit | REQ-09, REQ-10, REQ-11, INV-05, AC-16, AC-17, AC-19, EC-02, EC-08 | sha256:23747c8b28b16470a448390ea5df22e5fa28138f0b7bf5aa2d3fd6b997eaa5b7 | 5 | Fails to compile: `../../disclosure` does not exist |
| `src/features/recovery/__tests__/unit/deep-link.unit.test.ts` | unit | REQ-20, REQ-21, INV-04, AC-30, AC-31, EC-03 | sha256:b8ddb0caf7de06103ded0798c0347b9c546d2505e6cbc4b7262a41915e81381e | 4 | Fails to compile: `../../deep-link` does not exist |
| `src/features/recovery/__tests__/unit/agent-tools.unit.test.ts` | unit | REQ-23, REQ-24, REQ-25, INV-06, AC-33, AC-34, AC-35 | sha256:97160bc8f341f313dc82aeedec9e50b49347e4abc191b7275fa33121e9720f65 | 5 | Fails to compile: `../../agent-tools` does not exist |
| `src/features/recovery/__tests__/unit/degraded-banners.unit.test.ts` | unit | behavior.spec.md §1.1, REQ-17, REQ-19, INV-07, AC-27, AC-29, EC-06 | sha256:827d68e0519b045350ff519914ad49c063538cc5be06726775d9193dcadc9ae3 | 7 | Fails to compile: `../../ui/degraded-banners` does not exist |
| `src/features/recovery/__tests__/integration/restore-flow-ordering.integration.test.ts` | integration | REQ-26, AC-36, AC-12 | sha256:2f84d404aa13e30d61c2ba283ed726286c150e64a698f40824c604442c009ef0 | 2 | Fails to compile: `../../recovery-orchestrator` does not exist |
| `src/features/recovery/__tests__/unit/permissions.unit.test.ts` | unit | REQ-02, AC-03, AC-04, AC-05 | sha256:717b972f352598c932557e16fa57845030b83b3be947b7a349b3313f3d5e5b7b | 3 | Fails to compile: same missing modules |
| `src/features/recovery/__tests__/integration/recovery-route.integration.test.ts` | integration | REQ-01, REQ-22, REQ-27, AC-01, AC-02, AC-32, AC-37, AC-38 | sha256:681fc25c34878ce6d20444b750f1b52df0fe8455d95490296ebb474d58338803 | 4 | Compiles against existing `src/admin-shell/navigation.ts`; fails at assertion (`recoverySection` is `undefined`) — correct red-phase failure for a missing feature, not a setup error |

**Total: 13 test files, 56 runnable test cases (once implemented).**

## Covered Requirements

| Spec Ref | Priority | Test File | Assertion Summary | Status |
|---|---|---|---|---|
| REQ-01 / AC-01 | P1 | `recovery-route.integration.test.ts` | `/admin/recovery` renders as a distinct top-level admin section | Certified |
| REQ-01 / AC-02 | P2 | `recovery-route.integration.test.ts` | No inline tab/toggle switches Storage into Recovery (asserted as "Recovery is its own section, never nested") | Certified |
| REQ-02 / AC-03 | P1 | `permissions.unit.test.ts` | `backup.read`-only principal is denied every mutating action (create/confirm) | Certified |
| REQ-02 / AC-04 | P1 | `permissions.unit.test.ts` | Missing `backup.create` rejects restore-point creation with FORBIDDEN | Certified |
| REQ-02 / AC-05 | P1 | `permissions.unit.test.ts` | Missing `backup.restore` rejects `confirmRestore` with FORBIDDEN | Certified |
| REQ-03 / AC-06 | P1 | `recovery-orchestrator.plan-restore.unit.test.ts` | `costClass:'expensive'` still reaches the gateway; status bar data available | Certified |
| REQ-03 / AC-07 | P2 | — | Not covered — see Known Gaps | Gap (Low) |
| REQ-04 / AC-08 | P1 | (not independently exercised beyond disclosure/list shape; row-field presence is a UI-contract concern) | — | Gap (Low) — see Known Gaps |
| REQ-04 / AC-09 | P2 | — | Not covered — see Known Gaps | Gap (Low) |
| REQ-05 / AC-10 | P1 | `restore-points.unit.test.ts` | `createRestorePoint` succeeds without any plan/confirm/token | Certified |
| REQ-05 / AC-11 | P2 | `restore-points.unit.test.ts` | `authorize()` runs on every call including the idempotent-repeat call | Certified |
| REQ-06 / AC-12 | P1 | `restore-flow-ordering.integration.test.ts` | Orchestrator exports exactly plan/confirm/execute — no combined single-call export exists | Certified |
| REQ-07 / AC-13 | P1 | `recovery-orchestrator.plan-restore.unit.test.ts` | `plan()` preview includes target schema version+tag, quiesceIntegrity, cost/disk estimate | Certified |
| REQ-08 / AC-14 | P1 | `recovery-orchestrator.confirm-restore.unit.test.ts` | `confirmRestore` rejects (gateway never called) when `disclosureAcknowledged` missing/falsy | Certified |
| REQ-08 / AC-15 | P1 | `recovery-orchestrator.confirm-restore.unit.test.ts` | `confirmRestore` forwards to the gateway once acknowledged + provenance holds | Certified |
| REQ-09 / AC-16 | P1 | `disclosure.unit.test.ts` | Only posts/pages/plugin-table categories appear in counts | Certified |
| REQ-09 / AC-17 | P1 | `disclosure.unit.test.ts` | `entries` category never appears even if a count source has data for it | Certified |
| REQ-10 / AC-18 | P1 | (acknowledge-control caveat-text wording is a UI-contract/copy concern) | — | Gap (Low) — see Known Gaps |
| REQ-11 / AC-19 | P1 | `disclosure.unit.test.ts` | Unavailable baseline renders `'unknown'` for every covered category, never 0 | Certified |
| REQ-12 / AC-20 | P1 | `recovery-orchestrator.plan-restore.unit.test.ts` | `costClass:'unavailable'` short-circuits before the gateway is ever reached | Certified |
| REQ-13 / AC-21 | P1 | `recovery-orchestrator.execute-restore.integration.test.ts` | A held migration lock blocks a concurrent `executeRestore` attempt | Certified |
| REQ-13 / AC-22 | P1 | `recovery-orchestrator.execute-restore.integration.test.ts` + `operation-lock.cross-domain.integration.test.ts` | Cross-domain contention resolves to exactly one winner | Certified |
| REQ-14 / AC-23 | P1 | (sidecar-journal live-read is SPEC-017's own read surface; this package's obligation — not caching the `execute()` response — is implicit in `executeRestore` never storing/returning a cached poll state) | — | Gap (Medium) — see Known Gaps |
| REQ-15 / AC-24, AC-25 | P1 | (progress-panel dismissability is a UI-state-contract concern) | — | Gap (Low) — see Known Gaps |
| REQ-16 / AC-26 | P1 | `recovery-orchestrator.execute-restore.integration.test.ts` | Successful `RESTORED` completion attaches a Storage Timeline deep-link | Certified |
| REQ-17 / AC-27 | P1 | `degraded-banners.unit.test.ts` | `PENDING_MIGRATION` banner's action is always `deep-link-to-storage-migration` | Certified |
| REQ-18 / AC-28, EC-07 | P1 | `recovery-orchestrator.execute-restore.integration.test.ts` | A successful restore never itself clears `PENDING_MIGRATION` | Certified |
| REQ-19 / AC-29 | P1 | `degraded-banners.unit.test.ts` | `migration-interrupted` banner's accessible text contains `"planned downtime"` | Certified |
| REQ-20 / AC-30 | P1 | `deep-link.unit.test.ts` | `resolveDeepLinkContext` returns the server-re-looked-up value, never the envelope's raw carried value | Certified |
| REQ-21 / AC-31, EC-03 | P1 | `deep-link.unit.test.ts` | A stale/forged `restorePointId` returns `{found:false}` | Certified |
| REQ-22 / AC-32 | P1 | `recovery-route.integration.test.ts` | No raw row-edit/SQL-console description language anywhere in Recovery's section | Certified |
| REQ-23 / AC-33 | P1 | `agent-tools.unit.test.ts` | `backup_plan_restore`/`backup_execute_restore` present, no confirm-equivalent tool | Certified |
| REQ-24 / AC-34 | P1 | `agent-tools.unit.test.ts` | `backup_create_restore_point` present, unwrapped, requires `backup.create` | Certified |
| REQ-25 / AC-35 | P1 | `agent-tools.unit.test.ts` | Read tools are `sideEffects:'none'`, require only `backup.read` | Certified |
| REQ-26 / AC-36 | P1 | `restore-flow-ordering.integration.test.ts` | `costClass:'cheap'` still requires the full plan→confirm ordering (calls trace: `["plan","confirm"]`) | Certified |
| REQ-27 / AC-37 | P1 | `recovery-route.integration.test.ts` | No section keyed/labeled `backups` remains | Certified |
| REQ-27 / AC-38 | P2 | `recovery-route.integration.test.ts` | No standalone `database` section remains | Certified |

## Outcome Matrix

| Module | State | Input | Expected Outcome | Spec Ref |
|---|---|---|---|---|
| `core/operation-lock` | no lock held for `siteId` | `acquireOperationLock({siteId, operationKind})` | `{ok:true, value:{siteId, operationKind, ...}}` | REQ-13, C-309 |
| `core/operation-lock` | lock already held for `siteId` (any `operationKind`) | `acquireOperationLock({siteId, operationKind: other})` | `{ok:false, error:{code:'OPERATION_IN_FLIGHT'}}` | REQ-13, INV-03, U-001-B1 |
| `recovery-orchestrator.planRestore` | `costClass` fresh-fetched = `'unavailable'` | `planRestore({restorePointId})` | `{ok:false, error:{code:'COST_CLASS_UNAVAILABLE'}}`, gateway never called | REQ-12, U-003 |
| `recovery-orchestrator.planRestore` | `costClass` fresh-fetched != `'unavailable'` | `planRestore({restorePointId})` | `{ok:true, value: BackupRestorePlanResponse}` | REQ-07, AC-13 |
| `recovery-orchestrator.confirmRestore` | `disclosureAcknowledged !== true` | `confirmRestore({..., disclosureAcknowledged: false|undefined})` | `{ok:false, error:{code:'VALIDATION_ERROR'}}`, gateway.confirm never called | INV-02, U-002 |
| `recovery-orchestrator.confirmRestore` | `disclosureAcknowledged === true`, `planId` never minted by this server | `confirmRestore({...})` | `{ok:false}` (gateway's own provenance rejection surfaces; Recovery forwards, does not bypass) | U-002-B1 |
| `recovery-orchestrator.confirmRestore` | `disclosureAcknowledged === true`, `planId` minted by a prior `planRestore` | `confirmRestore({...})` | `{ok:true, value: ConfirmationToken}` | REQ-08, AC-15 |
| `recovery-orchestrator.executeRestore` | site lock already held by Storage's migrate-forward | `executeRestore({...})` | `{ok:false, error:{code:'RESTORE_OPERATION_IN_FLIGHT'}}`, gateway.execute never called | REQ-13, U-001-ORD1 |
| `recovery-orchestrator.executeRestore` | lock free, gateway succeeds with `RESTORED` | `executeRestore({...})` | `{ok:true, value:{..., storageTimelineDeepLink}}` | REQ-16, AC-26 |
| `restore-points.createRestorePoint` | authorized, no operation in flight | `createRestorePoint({idempotencyKey, trigger:'manual'})` | `{ok:true, value: RestorePointSummary}`, no token minted | REQ-05, AC-10 |
| `restore-points.createRestorePoint` | operation in flight | `createRestorePoint({...})` | `{ok:false, error:{code:'RESTORE_OPERATION_IN_FLIGHT'}}` | REQ-13 (extends to creation) |
| `disclosure.computeDisclosure` | watermark baseline available | `computeDisclosure({restorePointId})` | counts present only for `coveredCategories`, `partial:true` | REQ-09, INV-05 |
| `disclosure.computeDisclosure` | watermark baseline unavailable / `watermarkAtCapture` null | `computeDisclosure({...})` | every covered category renders `'unknown'`, never a number | REQ-11, EC-02, EC-08 |
| `deep-link.resolveDeepLinkContext` | envelope carries a live `restorePointId` | `resolveDeepLinkContext({envelope})` | `{found:true, restorePoint: <server-re-looked-up>}` | REQ-20, INV-04 |
| `deep-link.resolveDeepLinkContext` | envelope carries a stale/nonexistent `restorePointId` | `resolveDeepLinkContext({...})` | `{found:false, restorePoint:null}` | REQ-21, EC-03 |
| `ui/degraded-banners.resolveDegradedBanner` | `migrationInterrupted && pendingMigration` both true | `resolveDegradedBanner({capabilities})` | `{kind:'migration-interrupted', ...}` | behavior.spec.md §1.1, EC-06 |
| `ui/degraded-banners.resolveDegradedBanner` | only `pendingMigration` true | `resolveDegradedBanner({...})` | `{kind:'pending-migration', actionKind:'deep-link-to-storage-migration'}` | REQ-17, INV-07 |

## Property-Based Tests

| Spec Ref | Property / Invariant | Generator Domain | Test Name | Status |
|---|---|---|---|---|
| REQ-13 / INV-03 / U-001-B1 | At most one lock holder per site, across simulated cross-domain callers | 6 simultaneous attempts (3 `migration`, 3 `restore`) against one `siteId` | `operation-lock.cross-domain.integration.test.ts` > "U-001-B1/ORD1 (property): N simultaneous acquireOperationLock attempts..." | Certified |
| REQ-13 / U-001-B1 | Independent sites never interfere with each other's contention outcome | 50 independent `siteId`s × 4 concurrent attempts each | `operation-lock.cross-domain.integration.test.ts` > "U-001-B1 (property): for 50 independent sites..." | Certified |

## Contract Tests

| Contract Source | Testing Approach | Test Name | Status | Gap / Waiver |
|---|---|---|---|---|
| Outline C-301 `planRestore` | integration (fresh-recheck ordering) | `recovery-orchestrator.plan-restore.unit.test.ts` (all 4 cases) | Certified | N/A |
| Outline C-302 `confirmRestore` | integration (composite predicate via fake gateway) | `recovery-orchestrator.confirm-restore.unit.test.ts` (all 5 cases) | Certified | N/A |
| Outline C-303 `executeRestore` | integration (real `operation-lock` + fake gateway) | `recovery-orchestrator.execute-restore.integration.test.ts` (all 5 cases) | Certified | N/A |
| Outline C-304 `createRestorePoint` | unit (contract + authorize-ordering) | `restore-points.unit.test.ts` (all 4 cases) | Certified | N/A |
| Outline C-305 `computeDisclosure` | unit (pure decision) | `disclosure.unit.test.ts` (all 5 cases) | Certified | N/A |
| Outline C-306 `resolveDeepLinkContext` | unit (pure read + no-mutation contract) | `deep-link.unit.test.ts` (all 4 cases) | Certified | N/A |
| Outline C-307 Agent-tool catalog | unit (catalog inspection) | `agent-tools.unit.test.ts` (all 5 cases) | Certified | N/A |
| Outline C-308 Banner precedence resolver | unit (pure decision, precedence order) | `degraded-banners.unit.test.ts` (all 7 cases) | Certified | N/A (Not designated CIC per ADR-PIPE-019 — display-ordering only; still fully covered as ordinary business logic) |
| Outline C-309 `acquireOperationLock`/`releaseOperationLock` | unit + integration (property) | `operation-lock.unit.test.ts` + `operation-lock.cross-domain.integration.test.ts` | Certified | N/A |

## Known Gaps

| Spec Ref | Reason Not Covered | Risk | Resolution |
|---|---|---|---|
| AC-07 (REQ-03, P2) | In-flight status-bar indicator display is a UI-rendering concern layered on `capabilities.operationInFlight`, which is already proven correct at the data-source level (`operation-lock` tests) — no dedicated UI-contract test written this pass | Low | Defer to a UI component test pass once `CapabilityStatusBar` is implemented (React Component Testing Policy applies then, not to this backend-domain pass) |
| AC-08/AC-09 (REQ-04, P1/P2) | Restore-points list row-field presentation (timestamp/trigger/schema/size/costClass/discardSummary) is a read-projection/UI-contract concern; the underlying data fields are already typed in `state.spec.md`/`api.spec.md` and exercised incidentally by `disclosure.unit.test.ts`'s `RestorePointSummary` fixtures, but no dedicated `listRestorePoints` contract test was written this pass | Low | Add a dedicated `restore-points.list.unit.test.ts` in the gap-fill pass once `listRestorePoints` exists as an exported contract (currently only referenced generically in the Contract Map, not separately outlined as its own numbered contract) |
| AC-18 (REQ-10, P1) | The disclosure acknowledge control's exact caveat-text wording is a UI-copy/accessibility concern (`ui.spec.md` §5), not a backend-domain behavior this package's TDD scope covers | Low | Covered by the React Component Testing Policy when `DiscardedWindowDisclosure` is implemented as a component |
| AC-23 (REQ-14, P1) | Live sidecar-journal read-freshness is SPEC-017's own read surface (this domain only consumes it); no fake-journal refresh-safety test was written in this package since the journal itself is out of this package's implementation scope | Medium | Recommend a cross-package integration test once SPEC-017's sidecar journal is implemented — track via Coordinator as a follow-up task, not a P1 blocker for this package's own TDD certification |
| AC-24/AC-25 (REQ-15, P1) | Progress-panel dismissability (`isDismissable`) is a `RestoreProgressPanel` UI-component prop contract, not backend-domain logic | Low | Covered by the React Component Testing Policy when the component is implemented |

No High-risk gap exists. All P1 acceptance criteria with an underlying backend-domain (non-UI-component) obligation are Certified; the five gaps above are UI-component-contract or cross-package-follow-up items appropriately deferred, per the React Component Testing Policy's own scope boundary and this package's own module boundary (Recovery does not own SPEC-017's sidecar journal).

## Escalations / CIC Notes

- No `[CIC_REQUESTED]` raised — every candidate unit this package's implementation-outline names was already evaluated against all seven triggers by the Software Architect (see `critical-internal-constraints.md`'s Trigger Decision Matrix), and TDD's own test-design pass did not surface a load-bearing internal constraint outside U-001/U-002/U-003.
- No `[CIC_PROPOSED]` raised — test design confirmed U-002-B1's exact audit-corrected composite predicate (flag AND planId provenance, not an invented server-tracked acknowledgment record) and encoded it precisely as worded; no additional undesignated constraint was discovered.
- U-001 is the FIRST designation of the shared `core/operation-lock` primitive; per the CIC's own note, SPEC-017's implementation must treat `core/operation-lock.unit.test.ts` and `core/operation-lock.cross-domain.integration.test.ts` as binding on its own `execute()` path — SPEC-017's own TDD pass (a different agent, per this dispatch's instructions) should reference these files rather than duplicate them.

## Drift Status

- [x] Current spec hash matches certified hash above
- [x] Current spec hash was verified mechanically (`validate_spec_package.py --phase preflight`, exit 0), not by visual comparison
- [x] Current test file hashes match the Test File Inventory (computed via `shasum -a 256` immediately after each file was written)
- [x] Expected test count (56) is greater than zero and matches the runnable suite inventory (`grep -ac '^test('` per file)
- [x] All High-risk gaps have been reviewed by Coordinator — N/A, no High-risk gap exists
- [x] No test asserts implementation internals (only observable behavior — `ok`/`error.code`/`value` shapes, call-count on injected fakes, exported-name inspection for catalog contracts)
- [x] All P1 acceptance criteria with a backend-domain obligation have semantic assertion coverage, not only structural test-name mapping
