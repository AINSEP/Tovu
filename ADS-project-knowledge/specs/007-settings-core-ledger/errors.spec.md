# Error Code Registry Spec: Settings (Core-Only Layered Ledger)

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/errors.spec.md`

- Spec ID: `SPEC-007`
- Feature: `FEAT-007-settings-core-ledger`
- Version: `0.3.1`
- Content Hash: `anchored in feature.spec.md`
- Last Edited: `2026-07-11T20:15:00Z`

## Purpose
Canonical error registry for the core-only Settings feature, independent of stack/language.

## 1) Error Envelope (Base Payload)
All errors MUST include:

```yaml
code: string
message: string
occurredAt: string   # ISO-8601 UTC
correlationId: string|null
details: object|null
```

## 2) Error Code Registry
| Code | Category | Layer (`api|orchestrator|ui|integration`) | HTTP Status | Retryable | User Message Guidance |
|---|---|---|---:|---|---|
| `UNAUTHENTICATED` | auth | `api` | 401 | maybe | "Please sign in again." |
| `FORBIDDEN` | authz | `api` | 403 | no | "You do not have permission to change this setting." |
| `VALIDATION_ERROR` | validation | `api` | 400 | no | "Please correct the highlighted fields." |
| `DEFINITION_NOT_FOUND` | resource | `api` | 404 | no | "That setting does not exist." |
| `PRINCIPAL_NOT_FOUND` | resource | `api` | 404 | no | "That user could not be found in this workspace." |
| `DEFINITION_INVALID` | validation | `api` | 400 | no | "This setting definition is not valid (namespace or scope violation)." |
| `SCOPE_NOT_ALLOWED` | validation | `api` | 400 | no | "This setting cannot be changed at that scope." |
| `SECRET_NOT_SUPPORTED` | validation | `api` | 400 | no | "Secret settings are not supported yet." |
| `VALUE_VALIDATION_FAILED` | validation | `api` | 400 | no | "That value is not valid for this setting." |
| `RENAME_RETYPE_CONFLICT` | conflict | `api` | 409 | no | "A rename cannot also change the setting's type in one step." |
| `ALIAS_DEPTH_EXCEEDED` | conflict | `api` | 409 | no | "This rename would create an alias chain that is not allowed." |
| `DEFINITION_TOMBSTONED` | conflict | `api` | 409 | no | "This setting has been retired and can no longer be changed." |
| `PURGE_REQUIRED` | conflict | `api` | 409 | no | "This workspace still has settings; run the purge service first." |
| `RATE_LIMIT_EXCEEDED` | throttling | `api` | 429 | yes | "Too many requests. Try again shortly." |
| `INTERNAL_ERROR` | internal | `api` | 500 | maybe | "Unexpected server error." |
| `REQUEST_CANCELLED` | client | `ui` | 499 | no | Usually silent/no toast |

## 3) Per-Code Details Schema
```yaml
VALIDATION_ERROR:
  details:
    fieldErrors:
      type: array
      items:
        field: string
        reason: string

VALUE_VALIDATION_FAILED:
  details:
    field: string
    schemaReason: string

SCOPE_NOT_ALLOWED:
  details:
    requestedScope: string
    allowedScopes: array

RATE_LIMIT_EXCEEDED:
  details:
    retryAfterSeconds: integer
```

## 4) Ownership and Source Rules
| Code | Produced By | Surfaced By | Notes |
|---|---|---|---|
| `FORBIDDEN` | `authorize()` (ADR-021) | API + UI | Fail-closed; never discloses current value |
| `DEFINITION_INVALID` | `registerDefinitions` (namespace/scope fence) | API | INV-05 enforcement |
| `PRINCIPAL_NOT_FOUND` | `SettingsWriteService.set/clear` (target-principal membership check) | API + UI | REQ-13/INV-09 enforcement; UI surfaces inline on `PrincipalSelector` |
| `SECRET_NOT_SUPPORTED` | `registerDefinitions` | API | INV-08 enforcement |
| `SCOPE_NOT_ALLOWED` | `SettingsWriteService.set/clear` | API + UI | UI hides disallowed scopes; server is authoritative |
| `VALUE_VALIDATION_FAILED` | `SettingsWriteService` schema validation | API + UI | UI maps to inline field error |
| `RENAME_RETYPE_CONFLICT` / `ALIAS_DEPTH_EXCEEDED` | write chokepoint (lifecycle) | API | Definition lifecycle guards |
| `PURGE_REQUIRED` | RESTRICT FK / raw delete guard | API | Directs operator to the ledgered purge path |
| `REQUEST_CANCELLED` | UI | UI only | Not a failure metric |

## 5) Acceptance Checklist
- [ ] Every error emitted by feature code appears in Section 2.
- [ ] Every code has clear retry behavior.
- [ ] Every code used in `api.spec.md` appears here.
- [ ] User-safe message guidance is provided.
