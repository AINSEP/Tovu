# Error Code Registry Spec: Admin Command Gateway — Auditable, Undoable Mutations

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/errors.spec.md`

- Spec ID: `SPEC-001`
- Feature: `FEAT-001-admin-command-gateway`
- Version: `1.0.0`
- Content Hash: `sha256:see feature.spec.md (package hash of record)`
- Last Edited: `2026-07-02T20:45:00Z`

## Purpose
Canonical error registry for this feature.

## 1) Error Envelope (Base Payload)

Existing Tovu convention is `{ error: string }`. This feature extends it additively:

```yaml
error: string              # human-readable message (always present — existing convention)
code: string|null          # machine-readable code below; REQUIRED on new endpoints and DUPLICATE_COMMAND
changeSetId: string|null   # only for DUPLICATE_COMMAND — the original change set
```

`occurredAt`/`correlationId` from the toolkit base envelope are deferred to the observability feature; `changeSetId` serves as the correlation id inside this feature's scope (Constitution Art. VIII note in feature.spec.md).

## 2) Error Code Registry

| Code | Category | Layer | HTTP Status | Retryable | User Message Guidance |
|---|---|---|---:|---|---|
| `DUPLICATE_COMMAND` | idempotency | `api` | 409 | no | "This change was already submitted." (client should re-read state) |
| `CHANGE_SET_NOT_FOUND` | resource | `api` | 404 | no | "Change not found." |
| `CHANGE_SET_INVALID_STATUS` | state | `api` | 409 | no | "This change was already reverted." |
| `REVERT_CONFLICT` | concurrency | `api` | 409 | no | "The content changed after this edit — revert newer changes first." |
| `REVERT_NOT_POSSIBLE` | capability | `api` | 422 | no | "This change cannot be undone automatically." |
| `VALIDATION_ERROR` | validation | `api` | 400 | no | Existing behavior — message from feature validation errors. |
| `INTERNAL_ERROR` | internal | `api` | 500 | maybe | "Unexpected server error." |

## 3) Per-Code Details Schema

```yaml
DUPLICATE_COMMAND:
  changeSetId: string      # id of the originally recorded change set

REVERT_CONFLICT:
  details:                 # optional in v1
    entityType: string
    entityId: string
```

## 4) Ownership and Source Rules

| Code | Produced By | Surfaced By | Notes |
|---|---|---|---|
| `DUPLICATE_COMMAND` | `core/commands/command.ts` (`DuplicateCommandError`) | route error mapping | carries original changeSetId |
| `CHANGE_SET_NOT_FOUND` | `core/commands/revert.ts` / route lookup | route error mapping | workspace-scoped lookup miss |
| `CHANGE_SET_INVALID_STATUS` | `core/commands/revert.ts` | route error mapping | status != applied |
| `REVERT_CONFLICT` | `core/commands/revert.ts` (version guard) | route error mapping | includes entity-missing case (EC-03) |
| `REVERT_NOT_POSSIBLE` | `core/commands/revert.ts` | route error mapping | null inversePayload or unregistered applier |
| `VALIDATION_ERROR` | existing feature errors (`PostValidationError`, …) | existing route mapping | unchanged |
| `INTERNAL_ERROR` | any uncaught error | route catch-all | unchanged |

## 5) Acceptance Checklist

- [x] Every code has HTTP status, retryability, ownership, and user guidance
- [x] Every code maps to at least one AC or EC in feature.spec.md (see traceability.spec.md §4)
- [x] No status code is reused for two distinguishable failure kinds on the same endpoint without distinct `code` values
