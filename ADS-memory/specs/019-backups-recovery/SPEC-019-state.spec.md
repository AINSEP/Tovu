# State Contract Spec: backups-recovery

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/state.spec.md`

- Spec ID: `SPEC-019`
- Feature: `FEAT-019-backups-recovery`
- Version: `1.1.0`
- Content Hash: `sha256:eb0588d10723af1981dbad16975255bc05681df346246287a9c546514c854f4d`
- Last Edited: `2026-07-14T23:30:00Z`

## Purpose

Defines the Recovery screen's client-facing state: the restore-points list, the capability/status bar, the
five-step restore-flow state machine, and the degraded-mode banners. The durable backing state (the
`storage_write_watermark` counter, the confirmation-token lifecycle, `restore_points.watermarkAtCapture`) is
owned by SPEC-016's `state.spec.md` and is not restated here — this file only adds the Recovery-specific
projection and the restore-run progress state the screen itself renders.

## 1) State Shape

| Field | Type | Nullable | Initial Value | Description |
|---|---|---|---|---|
| `restorePoints` | `array<RestorePointSummary>` | no | `[]` | Newest-first list (REQ-04) |
| `capabilities.costClass` | `CostClass` | no | `'cheap'` (optimistic until first fetch) | Drives degraded modes (REQ-03, REQ-12) |
| `capabilities.operationInFlight` | `boolean` | no | `false` | Cross-screen block (REQ-13) |
| `capabilities.pendingMigration` | `boolean` | no | `false` | Read-only signal owned by SPEC-017 (REQ-17) |
| `capabilities.migrationInterrupted` | `boolean` | no | `false` | Read-only signal owned by SPEC-017 (REQ-19) |
| `restoreFlow.step` | `RestoreFlowStep` | no | `'idle'` | Client-side wizard position (REQ-06's five steps) |
| `restoreFlow.plan` | `BackupRestorePlanResponse` | yes | `null` | Set after `plan()` returns |
| `restoreFlow.disclosureAcknowledged` | `boolean` | no | `false` | Gates `confirm()` reachability (REQ-08, INV-02) |
| `restoreFlow.confirmationToken` | `string` | yes | `null` | Set after `confirm()` returns |
| `restoreRun.state` | `RestoreRunState` | yes | `null` | Read live from the sidecar journal (REQ-14, REQ-15) |
| `deepLinkContext.envelope` | `StorageContextEnvelope` | yes | `null` | Carried, untrusted (REQ-20) |
| `deepLinkContext.resolved` | `RecoveryContextResponse` | yes | `null` | Server-re-looked-up (REQ-20, REQ-21) |

## 2) Entity Contracts
```yaml
CostClass: enum[cheap, expensive, unavailable]   # SPEC-016 REQ-19

RestoreFlowStep: enum[idle, planned, disclosure-pending, disclosure-acknowledged, confirmed, executing, completed]
  # 'idle' -> 'planned' on plan() success
  # 'planned' -> 'disclosure-pending' immediately (disclosure always rendered before confirm is reachable)
  # 'disclosure-pending' -> 'disclosure-acknowledged' only on explicit operator acknowledgment (REQ-08)
  # 'disclosure-acknowledged' -> 'confirmed' on confirm() success
  # 'confirmed' -> 'executing' on execute() call
  # 'executing' -> 'completed' on RESTORED or RESTORE_FAILED

RestoreRunState: enum[QUIESCING, SNAPSHOTTING, RESTORING, RESTORED, RESTORE_FAILED]
  # Mirrors ADR-045 §3 Step 4's state machine, read live from the sidecar ops journal (REQ-14)

RestorePointSummary:
  restorePointId: string
  capturedAt: string (date-time)
  trigger: enum[pre-migration-auto, manual, template-upgrade]
  schemaVersion: string
  schemaTag: string
  sizeBytes: integer
  costClassAtCapture: CostClass
  discardSummary: string
  watermarkAtCapture: integer | null   # SPEC-016 REQ-06; null only for pre-column rows (EC-02)

StorageContextEnvelope:               # ADR-041 §7 shape, consumed unchanged, never mutated
  v: integer
  correlationId: string
  siteId: string
  ledgerEventId: string | null
  restorePointId: string | null
  drift: string
  intent: string
  issuedAt: string (date-time)
```

## 3) Action Catalog

| Action | Payload | Precondition | State Changes | Failure Handling |
|---|---|---|---|---|
| `FETCH_RESTORE_POINTS` | `{cursor?, limit?}` | caller holds `backup.read` | `restorePoints` replaced/appended | `UNAUTHENTICATED`/`FORBIDDEN` leave `restorePoints` unchanged |
| `FETCH_CAPABILITIES` | none | caller holds `backup.read` | `capabilities.*` replaced | on transient failure, prior `capabilities` value is retained, never reset to an optimistic default |
| `CREATE_RESTORE_POINT` | `{idempotencyKey, trigger: 'manual'}` | caller holds `backup.create`; no operation in flight | new `RestorePointSummary` prepended to `restorePoints` | `RESTORE_OPERATION_IN_FLIGHT` if `capabilities.operationInFlight` is true |
| `PLAN_RESTORE` | `{restorePointId}` | caller holds `backup.read`; `costClass !== 'unavailable'` | `restoreFlow.plan` set; `restoreFlow.step = 'disclosure-pending'` | `RESTORE_POINT_NOT_FOUND`/`COST_CLASS_UNAVAILABLE` leave `restoreFlow` at `'idle'` |
| `ACKNOWLEDGE_DISCLOSURE` | none | `restoreFlow.step === 'disclosure-pending'` | `restoreFlow.disclosureAcknowledged = true`; `restoreFlow.step = 'disclosure-acknowledged'` | none — client-only gate, no server call (REQ-08, INV-02) |
| `CONFIRM_RESTORE` | `{planId, planHash, disclosureAcknowledged: true}` | `restoreFlow.step === 'disclosure-acknowledged'`; caller is `kind='user'` holding `backup.restore` | `restoreFlow.confirmationToken` set; `restoreFlow.step = 'confirmed'` | rejected (no token) if `disclosureAcknowledged !== true` or caller is not `kind='user'` |
| `EXECUTE_RESTORE` | `{confirmationToken}` | `restoreFlow.step === 'confirmed'` | `restoreFlow.step = 'executing'`; `restoreRun.state = 'QUIESCING'` | `PLAN_STALE`/`TOKEN_EXPIRED`/`TOKEN_ALREADY_REDEEMED`/`FORBIDDEN` leave `restoreFlow.step` at `'confirmed'` for a possible re-confirm |
| `POLL_RESTORE_RUN` | `{restoreRunId}` | `restoreFlow.step === 'executing'` | `restoreRun.state` updated from the live sidecar journal | never derived from the original `execute()` response after the first poll (REQ-14) |
| `RESOLVE_DEEP_LINK` | `{envelope}` | none (read-only, re-verifies server-side) | `deepLinkContext.envelope` set; `deepLinkContext.resolved` set from server re-lookup | `DEEP_LINK_TARGET_NOT_FOUND` sets `deepLinkContext.resolved.found = false`, never assumes the envelope's carried values |

## 4) Selector Contracts

| Selector | Input | Output | Null/Empty Behavior |
|---|---|---|---|
| `canStartRestore` | `(capabilities, restorePoint)` | `boolean` | `false` whenever `capabilities.costClass === 'unavailable'` or `capabilities.operationInFlight === true` (INV-01, INV-03) |
| `canConfirmRestore` | `restoreFlow` | `boolean` | `false` unless `restoreFlow.step === 'disclosure-acknowledged'` (INV-02) |
| `isRestoreRunTerminal` | `restoreRun.state` | `boolean` | `true` only for `'RESTORED'`/`'RESTORE_FAILED'`; drives dismissability (REQ-15) |
| `pendingMigrationBannerTarget` | `capabilities.pendingMigration` | `{action: 'deep-link-to-storage-migration'} | null` | never resolves to a restore-flow action (INV-07) |

## 5) State Invariants
- [x] `restoreFlow.step` never reaches `'confirmed'` while `restoreFlow.disclosureAcknowledged === false`
      (INV-02).
- [x] `capabilities.costClass === 'unavailable'` always implies `canStartRestore` returns `false` (INV-01).
- [x] `restoreRun.state` is read from `POLL_RESTORE_RUN` (the live sidecar journal), never frozen at the
      value returned by the initial `EXECUTE_RESTORE` call (REQ-14).
- [x] `deepLinkContext.resolved` is only ever populated by a server-side re-lookup response, never copied
      directly from `deepLinkContext.envelope` (INV-04).

## 6) Acceptance Checklist
- [x] All actions have explicit before/after behavior.
- [x] Selectors are deterministic and side-effect free.
- [x] Entity fields and enums align with `api.spec.md`, `orchestrator.spec.md`, and `ui.spec.md`.
