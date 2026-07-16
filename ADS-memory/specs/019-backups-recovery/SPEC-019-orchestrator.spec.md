# Orchestrator Contract Spec: backups-recovery

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/orchestrator.spec.md`

- Spec ID: `SPEC-019`
- Feature: `FEAT-019-backups-recovery`
- Version: `1.1.0`
- Content Hash: `sha256:eb0588d10723af1981dbad16975255bc05681df346246287a9c546514c854f4d`
- Last Edited: `2026-07-14T23:30:00Z`

## Purpose

Defines the Recovery domain's orchestrator: it instantiates SPEC-016's generic `GatedMutationGateway`
(`SPEC-016-orchestrator.spec.md`) for the restore action, and separately owns the ordinary
`CreateRestorePoint` mutation and the read-side `RecoveryContextResolver` that re-verifies deep-link
envelopes. It does not redefine the gateway's own sequencing or `authorize()` ordering — see the
Integration Contracts section of `SPEC-019-feature.spec.md`.

## 1) Orchestrator Identity
- Name: `RecoveryOrchestrator`
- Responsibility: sequence the Recovery screen's read views (restore-points list, capability bar,
  deep-link resolution), the ordinary restore-point-creation mutation, and delegate the restore action
  entirely to SPEC-016's `GatedMutationGateway` instantiated with `domain="backup"`, `action="restore"`.

## 2) Input Contract

| Input | Required | Type | Default | Validation/Bounds | Notes |
|---|---|---|---|---|---|
| `principalId` | yes | `string` | none | must resolve to a `principals` row | Resolved from the authenticated session/token |
| `principalKind` | yes | `enum[user, agent, api_key]` | none | n/a | Drives read-vs-mutate eligibility per Section 4 |
| `restorePointId` | conditional | `string (ulid)` | none | required for `planRestore`/`createRestorePoint`-adjacent lookups | n/a |
| `idempotencyKey` | conditional | `string` | none | required for `createRestorePoint` | REQ-05/AC-11 |
| `envelope` | conditional | `StorageContextEnvelope` | none | required for `resolveDeepLinkContext` | ADR-041 §7 shape, untrusted |
| `planId` / `planHash` / `disclosureAcknowledged` | conditional | see `api.spec.md` §4 | none | required for the gateway's `confirm` step | forwarded unchanged to `GatedMutationGateway.confirm` |
| `confirmationToken` | conditional | `string` | none | required for the gateway's `execute` step | forwarded unchanged to `GatedMutationGateway.execute` |

## 3) Output State Contract

| Field | Type | Nullability | Source | Notes |
|---|---|---|---|---|
| `restorePoints` | `array<RestorePointSummary>` | non-null (empty allowed) | derived (`listRestorePoints`) | Newest-first (REQ-04) |
| `capabilities` | `RecoveryCapabilitiesResponse` | non-null | derived (`getCapabilities`) | Read-through to SPEC-016 REQ-19's `db-ops.getCapabilities()` |
| `gatewayResult` | domain-defined (SPEC-016 `orchestrator.spec.md` §3 Output State Contract) | nullable | delegated | Owned entirely by `GatedMutationGateway`; this orchestrator does not shadow its fields |
| `deepLinkResolution` | `RecoveryContextResponse` | nullable | derived (`resolveDeepLinkContext`) | Never equals the raw envelope (REQ-20/REQ-21) |
| `lastError` | `RecoveryError` | nullable | derived | One of the codes in `errors.spec.md` or SPEC-016's `errors.spec.md` |

## 4) Action Contracts

| Action | Inputs | Returns | Side Effects | Failure Codes |
|---|---|---|---|---|
| `listRestorePoints` | `{principalId, principalKind, cursor?, limit?}` | `Result<RestorePointListResponse>` | none — read-only | `UNAUTHENTICATED, FORBIDDEN` |
| `getCapabilities` | `{principalId, principalKind}` | `Result<RecoveryCapabilitiesResponse>` | none — read-only | `UNAUTHENTICATED, FORBIDDEN` |
| `resolveDeepLinkContext` | `{principalId, principalKind, envelope}` | `Result<RecoveryContextResponse>` | none — read-only; re-looks-up every id server-side (REQ-20) | `UNAUTHENTICATED, FORBIDDEN, DEEP_LINK_TARGET_NOT_FOUND` (returned as `found: false`, not a hard failure) |
| `createRestorePoint` | `{principalId, principalKind, idempotencyKey, trigger: 'manual'}` | `Result<RestorePointSummary>` | mints a new restore-point artifact; not gated by `plan`/`confirm` (REQ-05) | `UNAUTHENTICATED, FORBIDDEN, VALIDATION_ERROR, RESTORE_OPERATION_IN_FLIGHT` |
| `planRestore` (delegates to `GatedMutationGateway.plan`) | `{principalId, principalKind, restorePointId}` | `Result<BackupRestorePlanResponse>` | none — read-only (SPEC-016 REQ-09) | `UNAUTHENTICATED, FORBIDDEN, RESTORE_POINT_NOT_FOUND, COST_CLASS_UNAVAILABLE` |
| `confirmRestore` (delegates to `GatedMutationGateway.confirm`) | `{principalId, principalKind, planId, planHash, disclosureAcknowledged}` | `Result<ConfirmationToken>` | mints a single-use token only if `disclosureAcknowledged === true` and SPEC-016 REQ-10's preconditions hold | `UNAUTHENTICATED, FORBIDDEN, VALIDATION_ERROR` (includes a missing/false acknowledgment) |
| `executeRestore` (delegates to `GatedMutationGateway.execute`) | `{principalId, principalKind, confirmationToken}` | `Result<BackupRestoreExecutionResult>` | runs the restore exactly once on success; stamps composite actor identity per SPEC-016 REQ-16 | `UNAUTHENTICATED, FORBIDDEN, PLAN_STALE, TOKEN_EXPIRED, TOKEN_ALREADY_REDEEMED, RESTORE_OPERATION_IN_FLIGHT, INTERNAL_ERROR` |
| `pollRestoreRun` | `{principalId, principalKind, restoreRunId}` | `Result<RestoreRunState>` | none — reads the live sidecar journal state machine (REQ-14) | `UNAUTHENTICATED, FORBIDDEN` |

## 5) Lifecycle Hooks

| Hook | Trigger | Ordering | Failure Behavior |
|---|---|---|---|
| `onBeforePlanRestore` | before calling `GatedMutationGateway.plan` | verifies `capabilities.costClass !== 'unavailable'` before delegating | if `'unavailable'`, rejects with `COST_CLASS_UNAVAILABLE` before the gateway is invoked at all (REQ-12) |
| `onBeforeConfirmRestore` | before calling `GatedMutationGateway.confirm` | verifies `disclosureAcknowledged === true` in the request body before forwarding | if not exactly `true`, rejects with `VALIDATION_ERROR` before `authorize()` is even evaluated for the mutating permission (REQ-08/REQ-10 — a UI/input-validation gate, not a substitute for SPEC-016's own `authorize()` ordering) |
| `onBeforeCreateOrExecute` | before `createRestorePoint` or `GatedMutationGateway.execute` | checks `capabilities.operationInFlight` | rejects with `RESTORE_OPERATION_IN_FLIGHT` if a restore or migration is already running (REQ-13) |
| `onAfterExecuteSuccess` | after `GatedMutationGateway.execute` resolves `RESTORED` | before returning to the caller | attaches the Storage Timeline deep-link to the response (REQ-16); does not itself clear any `PENDING_MIGRATION` state (REQ-18) |

## 6) Invariants
- [x] `planRestore` never delegates to `GatedMutationGateway.plan` when `capabilities.costClass ===
      'unavailable'` (REQ-12, INV-01).
- [x] `confirmRestore` never forwards to `GatedMutationGateway.confirm` when `disclosureAcknowledged !==
      true` (INV-02).
- [x] `createRestorePoint` and `executeRestore` never both run concurrently for the same site (REQ-13,
      INV-03).
- [x] `resolveDeepLinkContext` never returns a value copied directly from the input `envelope` without a
      server-side lookup call in between (INV-04).

## 7) Acceptance Checklist
- [x] Inputs/outputs/actions are fully documented.
- [x] Failure codes align with `errors.spec.md` and SPEC-016's `errors.spec.md`.
- [x] Entity field names align with `state.spec.md` and `ui.spec.md`.
