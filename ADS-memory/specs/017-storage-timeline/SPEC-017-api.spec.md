# API Contract Spec: storage-timeline

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/api.spec.md`

- Spec ID: `SPEC-017`
- Feature: `FEAT-017-storage-timeline`
- Version: `1.3.0`
- Content Hash: `sha256:bce97937e6e34ec517b57385c80b34cd9a0c7ab33360cf97e081437b438ff6a8`
- Last Edited: `2026-07-15T00:45:00Z`

## Purpose

Defines the concrete Storage admin route surface and agent-tool catalog: the Timeline read
surface, and this domain's instantiation (`domain="storage"`, `action="migrate-forward"`) of
SPEC-016's generic `plan → confirm → execute` gateway (SPEC-016 `api.spec.md` §1). Routes and
tools defined here are concrete, not parameterized placeholders.

## 1) Endpoint Registry

| Endpoint ID | Method | Path | Purpose | Auth Profile | Rate Limit Profile |
|---|---|---|---|---|---|
| `STORAGE_GET_HEALTH` | `GET` | `/api/admin/v1/storage/health` | Summary health/drift status for the Site-Health card | `AUTH_STORAGE_READ` | `STORAGE_READ` |
| `STORAGE_GET_SCHEMA_STATE` | `GET` | `/api/admin/v1/storage/schema-state` | Current `schemaVersion`/`schemaTag` and drift classification (REQ-03) | `AUTH_STORAGE_READ` | `STORAGE_READ` |
| `STORAGE_LIST_PENDING_MIGRATIONS` | `GET` | `/api/admin/v1/storage/pending-migrations` | Migrations bundled by the runtime not yet applied to this site | `AUTH_STORAGE_READ` | `STORAGE_READ` |
| `STORAGE_QUERY_TIMELINE` | `GET` | `/api/admin/v1/storage/timeline` | Filtered `storage_ledger` rows (REQ-01, REQ-04) | `AUTH_STORAGE_READ` | `STORAGE_READ` |
| `STORAGE_LIST_RESTORE_POINTS` | `GET` | `/api/admin/v1/storage/restore-points` | List `restore_points` rows for the site | `AUTH_STORAGE_READ` | `STORAGE_READ` |
| `STORAGE_MIGRATE_PLAN` | `POST` | `/api/admin/v1/storage/migrate-forward/plan` | SPEC-016 `plan()` instantiation (REQ-06) | `AUTH_GATEWAY_READ` (SPEC-016) | `GATED_READ` (SPEC-016) |
| `STORAGE_MIGRATE_CONFIRM` | `POST` | `/api/admin/v1/storage/migrate-forward/confirm` | SPEC-016 `confirm()` instantiation (REQ-07) | `AUTH_GATEWAY_CONFIRM` (SPEC-016) | `GATED_WRITE` (SPEC-016) |
| `STORAGE_MIGRATE_EXECUTE` | `POST` | `/api/admin/v1/storage/migrate-forward/execute` | SPEC-016 `execute()` instantiation (REQ-08, REQ-09) | `AUTH_GATEWAY_EXECUTE` (SPEC-016) | `GATED_WRITE` (SPEC-016) |
| `BACKUP_CREATE_RESTORE_POINT` | `POST` | `/api/admin/v1/storage/restore-points` | Mints a restore point independent of any migration (REQ-22) | `AUTH_BACKUP_CREATE` | `STORAGE_WRITE_RARE` |
| `STORAGE_GET_RESTORE_GUIDANCE` | `POST` | `/api/admin/v1/storage/restore-guidance` | Deep-link routing envelope to Recovery (REQ-23, REQ-24) | `AUTH_STORAGE_READ` | `STORAGE_READ` |
| `STORAGE_TIER3_DESCRIBE_TABLES` | `GET` | `/api/admin/v1/storage/tier3/tables` | Tier-3 browser: table/column metadata, redacted (REQ-25) | `AUTH_STORAGE_TIER3` | `STORAGE_TIER3` |
| `STORAGE_TIER3_READ_ROWS` | `POST` | `/api/admin/v1/storage/tier3/tables/{table}/rows` | Tier-3 browser: bounded row read, redacted (REQ-25, REQ-26) | `AUTH_STORAGE_TIER3` | `STORAGE_TIER3` |

## 2) Authentication and Authorization Profiles

| Profile ID | Auth Required | Credential Type | Required Scopes | Permitted Principal Kinds | Notes |
|---|---|---|---|---|---|
| `AUTH_STORAGE_READ` | `true` | Session cookie, Bearer API key, or agent delegation token | `storage.read` | `user, agent, api_key` | Freely callable read tier (REQ-01 – REQ-04, REQ-20) |
| `AUTH_BACKUP_CREATE` | `true` | Session cookie, Bearer API key, or agent delegation token | `backup.create` | `user, agent, api_key` | Not the SPEC-016 gateway — a single-call, `authorize()`-gated write (REQ-22); non-destructive, so no confirm/token step |
| `AUTH_STORAGE_TIER3` | `true` | Session cookie only | `storage.read` **and** the Tier-3 feature flag enabled for the site | `user` only | REQ-25 — never agent-callable; human-admin-UI only, regardless of permission tier |

`AUTH_GATEWAY_READ` / `AUTH_GATEWAY_CONFIRM` / `AUTH_GATEWAY_EXECUTE` are SPEC-016's own profiles
(SPEC-016 `api.spec.md` §2), reused verbatim for `domain="storage"`,
`mutating-verb="migrate"` — not redefined here.

## 3) Rate Limit Profiles

| Profile ID | Window Seconds | Max Requests | Burst Allowance | Keyed By | Notes |
|---|---:|---:|---:|---|---|
| `STORAGE_READ` | `60` | `120` | `20` | `principalId` | Generous — Timeline polling and agent health checks are frequent and cheap |
| `STORAGE_WRITE_RARE` | `60` | `10` | `2` | `principalId` | `backup_create_restore_point` — infrequent but not as rare as the gated migrate ceremony |
| `STORAGE_TIER3` | `60` | `30` | `5` | `principalId` | Human-only, session-bound; still bounded to prevent a large-table scan pattern via repeated small-page requests |

`GATED_READ` / `GATED_WRITE` are SPEC-016's own profiles, reused verbatim for the migrate-forward
gateway endpoints.

## 4) Request Contracts

### Endpoint: `STORAGE_QUERY_TIMELINE` (`GET /api/admin/v1/storage/timeline`)
- Query Params:
```yaml
kind:
  type: string
  enum: [core.migration, plugin.ddl, index.provision, index.drop, template.upgrade, restore_point.created, restore.executed, migration.interrupted]
  required: false
fromDate:
  type: string
  format: date-time
  required: false
toDate:
  type: string
  format: date-time
  required: false
outcome:
  type: string
  enum: [success, failed, interrupted]
  required: false
cursor:
  type: string
  required: false
limit:
  type: integer
  maximum: 200
  default: 50
  required: false
```

### Endpoint: `STORAGE_MIGRATE_PLAN` (`POST /api/admin/v1/storage/migrate-forward/plan`)
- Body:
```yaml
{}   # No caller-supplied parameters — the plan is derived entirely from the site's current
     # schema state and the runtime's bundled migrations (SPEC-016 REQ-09's read-only rule)
```

### Endpoint: `STORAGE_MIGRATE_CONFIRM` (`POST /api/admin/v1/storage/migrate-forward/confirm`)
- Body: identical to SPEC-016 `GATEWAY_CONFIRM` (`planId`, `planHash`) — not restated.

### Endpoint: `STORAGE_MIGRATE_EXECUTE` (`POST /api/admin/v1/storage/migrate-forward/execute`)
- Body: identical to SPEC-016 `GATEWAY_EXECUTE` (`confirmationToken`) — not restated.

### Endpoint: `BACKUP_CREATE_RESTORE_POINT` (`POST /api/admin/v1/storage/restore-points`)
- Body:
```yaml
costAck:
  type: boolean
  required: false   # REQUIRED (rejected with VALIDATION_ERROR if absent) when
                     # db-ops.getCapabilities().restorePoint.costClass === 'expensive' at call time
```

### Endpoint: `STORAGE_GET_RESTORE_GUIDANCE` (`POST /api/admin/v1/storage/restore-guidance`)
- Body:
```yaml
ledgerEventId:
  type: string
  format: ulid
  required: false
restorePointId:
  type: string
  format: ulid
  required: false
intent:
  type: string
  enum: [restore-to-point, resolve-interrupted-migration]
  required: true
```

### Endpoint: `STORAGE_TIER3_READ_ROWS` (`POST /api/admin/v1/storage/tier3/tables/{table}/rows`)
- Path Params:
```yaml
table:
  type: string
  required: true
```
- Body:
```yaml
where:
  type: array
  items: BoundedPredicate   # ADR-022 bounded/total expression language ONLY — never raw SQL text
  required: false
orderBy:
  type: array
  items: { column: string, direction: "asc"|"desc" }
  required: false
cursor:
  type: string
  required: false
limit:
  type: integer
  maximum: 200
  default: 50
  required: false
```

## 5) Response Contracts

### Success Responses
| Endpoint ID | HTTP Status | Body Contract | Notes |
|---|---:|---|---|
| `STORAGE_GET_HEALTH` | `200` | `StorageHealthSummary` | |
| `STORAGE_GET_SCHEMA_STATE` | `200` | `SchemaStateResponse` | Includes drift classification (REQ-03) |
| `STORAGE_LIST_PENDING_MIGRATIONS` | `200` | `PendingMigration[]` | |
| `STORAGE_QUERY_TIMELINE` | `200` | `{ items: LedgerRow[], nextCursor: string\|null }` | |
| `STORAGE_LIST_RESTORE_POINTS` | `200` | `RestorePointSummary[]` | |
| `STORAGE_MIGRATE_PLAN` | `200` | `MigratePlanResponse` | Extends SPEC-016 `GatewayPlanResponse` |
| `STORAGE_MIGRATE_CONFIRM` | `200` | SPEC-016 `GatewayConfirmResponse` | Not extended |
| `STORAGE_MIGRATE_EXECUTE` | `200` | `MigrateExecuteResult` | |
| `BACKUP_CREATE_RESTORE_POINT` | `201` | `RestorePointSummary` | |
| `STORAGE_GET_RESTORE_GUIDANCE` | `200` | `StorageContextEnvelope` | Deep-link only — never a lever (REQ-23) |
| `STORAGE_TIER3_DESCRIBE_TABLES` | `200` | `TableDescriptor[]` | Never lists a `sensitive: true` column (REQ-25) |
| `STORAGE_TIER3_READ_ROWS` | `200` | `{ rows: object[], nextCursor: string\|null }` | Every row excludes `sensitive: true` columns (REQ-25) |

### Contract Definitions
```yaml
LedgerRow:
  id: { type: string, format: ulid }
  kind: { type: string, enum: [core.migration, plugin.ddl, index.provision, index.drop, template.upgrade, restore_point.created, restore.executed, migration.interrupted] }
  scope: { type: string, const: "site" }
  siteId: { type: string }
  correlationId: { type: string }
  restorePointId: { type: string, format: ulid, nullable: true }   # null only for index.provision/index.drop (REQ-18)
  schemaBefore: { version: integer, tag: string }
  schemaAfter: { version: integer, tag: string, nullable: true }
  driftStatus: { type: string, enum: [in-sync, ahead, diverged, behind] }
  outcome: { type: string, enum: [success, failed, interrupted] }
  discardedWindow: { type: object, nullable: true }   # present only on restore.executed rows
  actorWorkspaceId: { type: string }
  actorId: { type: string }
  delegatedByWorkspaceId: { type: string, nullable: true }
  delegatedById: { type: string, nullable: true }
  detail: { type: object }
  createdAt: { type: string, format: date-time }

SchemaStateResponse:
  schemaVersion: { type: integer }
  schemaTag: { type: string }
  runtimeSchemaVersion: { type: integer }
  runtimeSchemaTag: { type: string }
  driftStatus: { type: string, enum: [in-sync, ahead, diverged, behind] }

PendingMigration:
  index: { type: integer }
  tag: { type: string }
  description: { type: string, nullable: true }

RestorePointSummary:
  id: { type: string, format: ulid }
  kind: { type: string, enum: [file-snapshot, logical-dump, external] }
  costClass: { type: string, enum: [cheap, expensive, unavailable] }
  watermarkAtCapture: { type: integer, nullable: true }   # null only for pre-ADR-041 rows (EC-06 in feature.spec.md)
  createdAt: { type: string, format: date-time }
  createdBy: { actorWorkspaceId: string, actorId: string }

MigratePlanResponse:
  # extends SPEC-016 GatewayPlanResponse
  planId: { type: string, format: ulid }
  planHash: { type: string, pattern: "^sha256:[0-9a-f]{64}$" }
  domain: { type: string, const: "storage.migrate" }
  createdAt: { type: string, format: date-time }
  details:
    targetSchemaVersion: { type: integer }
    targetSchemaTag: { type: string }
    costClass: { type: string, enum: [cheap, expensive, unavailable] }
    restorePointKind: { type: string, enum: [file-snapshot, logical-dump, external] }
    costEstimate: { type: object, nullable: true }   # REQUIRED non-null when costClass === 'expensive' (REQ-06)

MigrateExecuteResult:
  migrationRunId: { type: string, format: ulid }
  finalState: { type: string, enum: [DONE, ABORTED_SAFE, RESTORED, RESTORE_FAILED, ROLLBACK_TO_BLUE] }
  schemaAfter: { version: integer, tag: string }
  quiesceIntegrity: { type: string, enum: ["chokepoint-only"], nullable: true }   # present only if a Tier-3 plugin was enabled (REQ-27)

TableDescriptor:
  table: { type: string }
  columns:
    type: array
    items: { name: string, type: string }   # never includes a sensitive: true column (REQ-25)

StorageContextEnvelope:
  v: { type: integer }
  correlationId: { type: string }
  siteId: { type: string }
  ledgerEventId: { type: string, format: ulid, nullable: true }
  restorePointId: { type: string, format: ulid, nullable: true }
  drift: { type: string, enum: [in-sync, ahead, diverged, behind] }
  intent: { type: string, enum: [restore-to-point, resolve-interrupted-migration] }
  issuedAt: { type: string, format: date-time }
  # Unsigned, untrusted end-to-end (REQ-24) — every id inside must be re-looked-up server-side
  # by the receiving surface (Recovery); this response shape carries display continuity only.
```

## 6) Error Mapping

Reference canonical codes in `errors.spec.md`. SPEC-016's own codes (`PLAN_STALE`,
`TOKEN_EXPIRED`, `TOKEN_ALREADY_REDEEMED`, `FORBIDDEN`, `UNAUTHENTICATED`, `VALIDATION_ERROR`,
`RATE_LIMIT_EXCEEDED`, `WATERMARK_BASELINE_UNAVAILABLE`, `INTERNAL_ERROR`) apply to
`STORAGE_MIGRATE_PLAN`/`CONFIRM`/`EXECUTE` identically to SPEC-016 `api.spec.md` §6 and are not
re-mapped here.

| Endpoint ID | HTTP Status | Error Codes |
|---|---:|---|
| `STORAGE_MIGRATE_EXECUTE` | `409` | `SCHEMA_DRIFT_DIVERGED`, `MIGRATION_ALREADY_IN_FLIGHT` (in addition to SPEC-016's `PLAN_STALE`/`TOKEN_ALREADY_REDEEMED`) |
| `STORAGE_MIGRATE_EXECUTE` | `422` | `RESTORE_POINT_UNAVAILABLE` |
| `BACKUP_CREATE_RESTORE_POINT` | `400` | `VALIDATION_ERROR` (missing required `costAck`) |
| `BACKUP_CREATE_RESTORE_POINT` | `422` | `RESTORE_POINT_UNAVAILABLE` |
| `STORAGE_TIER3_DESCRIBE_TABLES` / `STORAGE_TIER3_READ_ROWS` | `403` | `TIER3_DISABLED` |
| `STORAGE_TIER3_READ_ROWS` | `400` | `VALIDATION_ERROR` (raw SQL text supplied, or `limit` > 200) |
| any `GET`/`POST` above | `401` | `UNAUTHENTICATED` |
| any `GET`/`POST` above | `403` | `FORBIDDEN` |
| any `GET`/`POST` above | `429` | `RATE_LIMIT_EXCEEDED` |

## 7) Agent Tool Catalog Contract

Following SPEC-016 `api.spec.md` §7's `AgentToolDefinition` shape and REQ-22's naming/callability
rule:

```yaml
- name: storage_get_health
  sideEffects: none
  authorization: { permission: "storage.read", deniesIfMissing: "FORBIDDEN" }
  actorClassRule: none
- name: storage_get_schema_state
  sideEffects: none
  authorization: { permission: "storage.read", deniesIfMissing: "FORBIDDEN" }
  actorClassRule: none
- name: storage_list_pending_migrations
  sideEffects: none
  authorization: { permission: "storage.read", deniesIfMissing: "FORBIDDEN" }
  actorClassRule: none
- name: storage_query_timeline
  sideEffects: none
  authorization: { permission: "storage.read", deniesIfMissing: "FORBIDDEN" }
  actorClassRule: none
- name: storage_list_restore_points
  sideEffects: none
  authorization: { permission: "storage.read", deniesIfMissing: "FORBIDDEN" }
  actorClassRule: none
- name: storage_plan_migrate_forward
  sideEffects: none
  authorization: { permission: "storage.read", deniesIfMissing: "FORBIDDEN" }
  actorClassRule: none
- name: storage_execute_migrate_forward
  sideEffects: mutates-durable-state
  authorization: { permission: "storage.migrate", deniesIfMissing: "FORBIDDEN" }
  actorClassRule: confirmer-must-equal-own-delegatedBy
- name: backup_create_restore_point
  sideEffects: mutates-durable-state
  authorization: { permission: "backup.create", deniesIfMissing: "FORBIDDEN" }
  actorClassRule: none   # single-call authorize()-gated write, not a gateway instantiation (REQ-22)
- name: storage_get_restore_guidance
  sideEffects: none
  authorization: { permission: "storage.read", deniesIfMissing: "FORBIDDEN" }
  actorClassRule: none   # routing envelope only — never executes a restore (REQ-23)
```

No `storage_confirm_migrate_forward` tool exists, and no tool exposes Tier-3
`describeTables()`/`readRows()` to an agent caller (REQ-25) — the Tier-3 browser is human-admin-UI
only, session-authenticated, regardless of the caller's permission tier.

## 8) Contract Acceptance Checklist
- [x] Every endpoint in Section 1 has request and response contracts.
- [x] Every endpoint has auth and rate-limit profiles.
- [x] Every error code used here exists in `errors.spec.md` or SPEC-016's `errors.spec.md`.
- [x] Names and enums align with `state.spec.md`, `orchestrator.spec.md`, `ui.spec.md`.
