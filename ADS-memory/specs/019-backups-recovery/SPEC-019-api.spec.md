# API Contract Spec: backups-recovery

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/api.spec.md`

- Spec ID: `SPEC-019`
- Feature: `FEAT-019-backups-recovery`
- Version: `1.1.0`
- Content Hash: `sha256:eb0588d10723af1981dbad16975255bc05681df346246287a9c546514c854f4d`
- Last Edited: `2026-07-14T23:30:00Z`

## Purpose

Defines the Recovery domain's concrete route surface and agent-tool catalog. Restore
(`backup.restore`) instantiates SPEC-016's generic gated-mutation gateway (`SPEC-016-api.spec.md` §1)
with `domain="backup"`, `action="restore"`. Restore-point creation (`backup.create`) is an ordinary
mutation, not a gateway instantiation, per REQ-05. Read routes are freely callable by any principal
kind holding `backup.read`.

## 1) Endpoint Registry

| Endpoint ID | Method | Path | Purpose | Auth Profile | Rate Limit Profile |
|---|---|---|---|---|---|
| `RECOVERY_LIST_RESTORE_POINTS` | `GET` | `/api/admin/v1/recovery/restore-points` | List restore points, newest-first | `AUTH_RECOVERY_READ` | `RECOVERY_READ` |
| `RECOVERY_GET_CAPABILITIES` | `GET` | `/api/admin/v1/recovery/capabilities` | Read `costClass`/`kind` and in-flight status | `AUTH_RECOVERY_READ` | `RECOVERY_READ` |
| `RECOVERY_RESOLVE_CONTEXT` | `GET` | `/api/admin/v1/recovery/context` | Server-side re-lookup of a `StorageContextEnvelope`'s carried ids | `AUTH_RECOVERY_READ` | `RECOVERY_READ` |
| `RECOVERY_CREATE_RESTORE_POINT` | `POST` | `/api/admin/v1/recovery/restore-points` | Create a restore point independent of any migration (ordinary mutation, REQ-05) | `AUTH_RECOVERY_CREATE` | `RECOVERY_CREATE` |
| `BACKUP_RESTORE_PLAN` | `POST` | `/api/admin/v1/backup/restore/plan` | Gateway `plan()` instantiation (SPEC-016 REQ-09) | `AUTH_GATEWAY_READ` | `GATED_READ` |
| `BACKUP_RESTORE_CONFIRM` | `POST` | `/api/admin/v1/backup/restore/confirm` | Gateway `confirm()` instantiation (SPEC-016 REQ-10) | `AUTH_GATEWAY_CONFIRM` | `GATED_WRITE` |
| `BACKUP_RESTORE_EXECUTE` | `POST` | `/api/admin/v1/backup/restore/execute` | Gateway `execute()` instantiation (SPEC-016 REQ-11 – REQ-13) | `AUTH_GATEWAY_EXECUTE` | `GATED_WRITE` |

The three `BACKUP_RESTORE_*` endpoints are the concrete instantiation SPEC-016's `api.spec.md` §1 names as
`{domain}/{action}` with `domain="backup"`, `action="restore"` — they carry no independent request/response
shape beyond what SPEC-016 §4/§5 already define generically, except the domain-specific `details`/preview
payload defined in Section 4/5 below.

## 2) Authentication and Authorization Profiles

| Profile ID | Auth Required | Credential Type | Required Scopes | Permitted Principal Kinds | Notes |
|---|---|---|---|---|---|
| `AUTH_RECOVERY_READ` | `true` | Session cookie, Bearer API key, or agent delegation token | `backup.read` | `user, agent, api_key` | Read-only; no durable state change (REQ-02, REQ-25) |
| `AUTH_RECOVERY_CREATE` | `true` | Session cookie, Bearer API key, or agent delegation token | `backup.create` | `user, agent, api_key` | Ordinary `authorize()`-gated mutation, not a gateway step (REQ-05) |
| `AUTH_GATEWAY_READ` | `true` | Session cookie, Bearer API key, or agent delegation token | `backup.read` | `user, agent, api_key` | SPEC-016 REQ-09 — `plan()` is safely callable by any principal kind holding the read permission |
| `AUTH_GATEWAY_CONFIRM` | `true` | Session cookie only | `backup.restore` | `user` only | SPEC-016 REQ-10 — human-only, no exception, matches ADR-041 §6 |
| `AUTH_GATEWAY_EXECUTE` | `true` | Session cookie, Bearer API key, or agent delegation token | `backup.restore` | `user, agent, api_key` — subject to SPEC-016 REQ-13's actor-class redemption rule | SPEC-016 REQ-11 — `authorize()` re-evaluated fresh, never cached |

## 3) Rate Limit Profiles

| Profile ID | Window Seconds | Max Requests | Burst Allowance | Keyed By | Notes |
|---|---:|---:|---:|---|---|
| `RECOVERY_READ` | `60` | `120` | `20` | `principalId` | List/capability/context reads; generous headroom for the screen's polling of in-flight state (REQ-14) |
| `RECOVERY_CREATE` | `60` | `10` | `2` | `principalId` | Restore-point creation is infrequent but not as rare as a gated restore |
| `GATED_READ` | `60` | `60` | `10` | `principalId` | Matches SPEC-016 `api.spec.md` §3 — `plan()` is read-only |
| `GATED_WRITE` | `60` | `5` | `0` | `principalId` | Matches SPEC-016 `api.spec.md` §3 — `confirm()`/`execute()` are rare, high-stakes calls |

## 4) Request Contracts

### Endpoint: `RECOVERY_LIST_RESTORE_POINTS` (`GET /api/admin/v1/recovery/restore-points`)
- Query Params:
```yaml
cursor:
  type: string
  required: false
limit:
  type: integer
  required: false
  default: 20
  max: 100
```

### Endpoint: `RECOVERY_GET_CAPABILITIES` (`GET /api/admin/v1/recovery/capabilities`)
- Query Params:
```yaml
{}
```

### Endpoint: `RECOVERY_RESOLVE_CONTEXT` (`GET /api/admin/v1/recovery/context`)
- Query Params:
```yaml
envelope:
  type: string
  format: base64url-json   # the StorageContextEnvelope, ADR-041 §7 — carried, never trusted (REQ-20)
  required: true
```

### Endpoint: `RECOVERY_CREATE_RESTORE_POINT` (`POST /api/admin/v1/recovery/restore-points`)
- Body:
```yaml
idempotencyKey:
  type: string
  required: true
trigger:
  type: string
  enum: [manual]        # pre-migration-auto and template-upgrade are system-originated, not caller-supplied
  required: true
```

### Endpoint: `BACKUP_RESTORE_PLAN` (`POST /api/admin/v1/backup/restore/plan`)
- Body:
```yaml
restorePointId:
  type: string
  format: ulid
  required: true
```

### Endpoint: `BACKUP_RESTORE_CONFIRM` (`POST /api/admin/v1/backup/restore/confirm`)
- Body (identical shape to SPEC-016 `api.spec.md` §4's `GATEWAY_CONFIRM`):
```yaml
planId:
  type: string
  format: ulid
  required: true
planHash:
  type: string
  pattern: "^sha256:[0-9a-f]{64}$"
  required: true
disclosureAcknowledged:
  type: boolean
  const: true              # REQ-08/REQ-10 — the request is rejected with VALIDATION_ERROR if not exactly true
  required: true
```

### Endpoint: `BACKUP_RESTORE_EXECUTE` (`POST /api/admin/v1/backup/restore/execute`)
- Body (identical shape to SPEC-016 `api.spec.md` §4's `GATEWAY_EXECUTE`):
```yaml
confirmationToken:
  type: string
  required: true
```

## 5) Response Contracts

### Success Responses
| Endpoint ID | HTTP Status | Body Contract | Notes |
|---|---:|---|---|
| `RECOVERY_LIST_RESTORE_POINTS` | `200` | `RestorePointListResponse` | Newest-first (REQ-04) |
| `RECOVERY_GET_CAPABILITIES` | `200` | `RecoveryCapabilitiesResponse` | Drives the status bar and degraded modes (REQ-03, REQ-12) |
| `RECOVERY_RESOLVE_CONTEXT` | `200` | `RecoveryContextResponse` | Re-looked-up, never the envelope's raw values (REQ-20) |
| `RECOVERY_CREATE_RESTORE_POINT` | `201` | `RestorePointSummary` | No token minted (REQ-05) |
| `BACKUP_RESTORE_PLAN` | `200` | `BackupRestorePlanResponse` | Extends SPEC-016's generic `GatewayPlanResponse` |
| `BACKUP_RESTORE_CONFIRM` | `200` | `GatewayConfirmResponse` (SPEC-016 shape, unchanged) | Mints a single-use token (SPEC-016 REQ-10) |
| `BACKUP_RESTORE_EXECUTE` | `200` | `BackupRestoreExecutionResult` | Progress is polled/streamed via `RECOVERY_GET_CAPABILITIES`'s in-flight flag and the live journal, not solely this response |

### Contract Definitions
```yaml
RestorePointSummary:
  restorePointId: { type: string, format: ulid }
  capturedAt: { type: string, format: date-time }
  trigger: { type: string, enum: [pre-migration-auto, manual, template-upgrade] }
  schemaVersion: { type: string }
  schemaTag: { type: string }
  sizeBytes: { type: integer }
  costClassAtCapture: { type: string, enum: [cheap, expensive, unavailable] }
  discardSummary: { type: string }   # short label, e.g. "posts/pages + plugin-table writes since capture"
  watermarkAtCapture: { type: integer, nullable: true }   # SPEC-016 REQ-06; null only for pre-column rows (EC-02)

RestorePointListResponse:
  items: { type: array, items: { $ref: RestorePointSummary } }
  nextCursor: { type: string, nullable: true }

RecoveryCapabilitiesResponse:
  costClass: { type: string, enum: [cheap, expensive, unavailable] }   # SPEC-016 REQ-19
  restorePointKind: { type: string, enum: [file-snapshot, logical-dump, external] }
  operationInFlight: { type: boolean }                                 # REQ-03, REQ-13
  operationInFlightKind: { type: string, enum: [restore, migration], nullable: true }
  pendingMigration: { type: boolean }                                  # REQ-17, owned by SPEC-017, read-only here
  migrationInterrupted: { type: boolean }                               # REQ-19, owned by SPEC-017, read-only here

RecoveryContextResponse:
  restorePoint: { $ref: RestorePointSummary, nullable: true }           # null when re-lookup fails (REQ-21)
  found: { type: boolean }
  correlationId: { type: string }

BackupRestorePlanResponse:
  planId: { type: string, format: ulid }
  planHash: { type: string, pattern: "^sha256:[0-9a-f]{64}$" }
  domain: { type: string, const: "backup.restore" }
  createdAt: { type: string, format: date-time }
  details:
    targetSchemaVersion: { type: string }
    targetSchemaTag: { type: string }
    quiesceIntegrity: { type: string, enum: [chokepoint-only] }        # ADR-041 §9
    costDiskEstimate: { type: string }
    disclosure:
      coveredCategories: { type: array, items: { type: string } }       # e.g. ["posts", "pages", "plugin-tables"]
      counts: { type: object }                                          # category -> integer | "unknown"
      partial: { type: boolean, const: true }                           # REQ-09, never false
      watermarkBaselineAvailable: { type: boolean }                     # false triggers REQ-11's unknown rendering

BackupRestoreExecutionResult:
  restoreRunId: { type: string, format: ulid }
  state: { type: string, enum: [QUIESCING, SNAPSHOTTING, RESTORING, RESTORED, RESTORE_FAILED] }
  startedAt: { type: string, format: date-time }
```

## 6) Error Mapping

Reference canonical codes in `errors.spec.md` (this file) and `SPEC-016-errors.spec.md` (reused codes).

| Endpoint ID | HTTP Status | Error Codes |
|---|---:|---|
| `RECOVERY_LIST_RESTORE_POINTS` | `401` | `UNAUTHENTICATED` |
| `RECOVERY_LIST_RESTORE_POINTS` | `403` | `FORBIDDEN` |
| `RECOVERY_GET_CAPABILITIES` | `401` | `UNAUTHENTICATED` |
| `RECOVERY_RESOLVE_CONTEXT` | `404` | `DEEP_LINK_TARGET_NOT_FOUND` |
| `RECOVERY_CREATE_RESTORE_POINT` | `400` | `VALIDATION_ERROR` |
| `RECOVERY_CREATE_RESTORE_POINT` | `403` | `FORBIDDEN` |
| `RECOVERY_CREATE_RESTORE_POINT` | `409` | `RESTORE_OPERATION_IN_FLIGHT` |
| `BACKUP_RESTORE_PLAN` | `404` | `RESTORE_POINT_NOT_FOUND` |
| `BACKUP_RESTORE_PLAN` | `403` | `FORBIDDEN` |
| `BACKUP_RESTORE_PLAN` | `409` | `COST_CLASS_UNAVAILABLE` |
| `BACKUP_RESTORE_CONFIRM` | `400` | `VALIDATION_ERROR` (includes a missing/false `disclosureAcknowledged`) |
| `BACKUP_RESTORE_CONFIRM` | `401` | `UNAUTHENTICATED` |
| `BACKUP_RESTORE_CONFIRM` | `403` | `FORBIDDEN` |
| `BACKUP_RESTORE_EXECUTE` | `401` | `UNAUTHENTICATED` |
| `BACKUP_RESTORE_EXECUTE` | `403` | `FORBIDDEN` |
| `BACKUP_RESTORE_EXECUTE` | `409` | `PLAN_STALE, TOKEN_ALREADY_REDEEMED, RESTORE_OPERATION_IN_FLIGHT` |
| `BACKUP_RESTORE_EXECUTE` | `410` | `TOKEN_EXPIRED` |
| `BACKUP_RESTORE_EXECUTE` | `500` | `INTERNAL_ERROR` |

## 7) Agent Tool Catalog Contract

Matches SPEC-016 `api.spec.md` §7's `AgentToolDefinition` shape and REQ-22's naming/callability rules.

```yaml
- name: backup_list_restore_points
  description: List restore points, newest-first, with costClass and discard-summary metadata.
  params: { cursor: "string?", limit: "integer?" }
  returns: RestorePointListResponse
  sideEffects: none
  authorization: { permission: "backup.read", deniesIfMissing: FORBIDDEN }
  actorClassRule: none

- name: backup_get_capabilities
  description: Read the current costClass, restore-point kind, and in-flight/pending-migration state.
  params: {}
  returns: RecoveryCapabilitiesResponse
  sideEffects: none
  authorization: { permission: "backup.read", deniesIfMissing: FORBIDDEN }
  actorClassRule: none

- name: backup_create_restore_point
  description: Create a restore point independent of any migration. Ordinary mutation, not gated (REQ-05).
  params: { idempotencyKey: string, trigger: "'manual'" }
  returns: RestorePointSummary
  sideEffects: mutates-durable-state
  authorization: { permission: "backup.create", deniesIfMissing: FORBIDDEN }
  actorClassRule: none

- name: backup_plan_restore
  description: Preview what restoring to a given restore point would do, including the discarded-write-window disclosure.
  params: { restorePointId: string }
  returns: BackupRestorePlanResponse
  sideEffects: none
  authorization: { permission: "backup.read", deniesIfMissing: FORBIDDEN }
  actorClassRule: none

- name: backup_execute_restore
  description: Redeem a human-minted confirmation token and run the restore. Never callable without a token minted by confirm().
  params: { confirmationToken: string }
  returns: BackupRestoreExecutionResult
  sideEffects: mutates-durable-state
  authorization: { permission: "backup.restore", deniesIfMissing: FORBIDDEN }
  actorClassRule: confirmer-must-equal-own-delegatedBy
```

Rules (REQ-23, REQ-24, REQ-25):
- No tool named `backup_confirm_restore` (or any equivalent) exists in this catalog — `confirm()` is
  reachable only through the human-facing Recovery screen's UI, never a tool, per SPEC-016 REQ-22/AC-32.
- `backup_create_restore_point` is intentionally not wrapped in a plan/confirm/execute sequence — it is not
  a gated mutation per REQ-05.
- `backup_plan_restore` and `backup_execute_restore` are the concrete `{domain}_plan_{action}` /
  `{domain}_execute_{action}` instantiation SPEC-016 REQ-22 requires, with `domain="backup"`.

## 8) Contract Acceptance Checklist
- [x] Every endpoint in Section 1 has request and response contracts.
- [x] Every endpoint has auth and rate-limit profiles.
- [x] Every error code used here exists in `errors.spec.md` or `SPEC-016-errors.spec.md`.
- [x] Names and enums align with `state.spec.md`, `orchestrator.spec.md`, and `ui.spec.md`.
