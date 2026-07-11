# API Contract Spec: Settings (Core-Only Layered Ledger)

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/api.spec.md`

- Spec ID: `SPEC-007`
- Feature: `FEAT-007-settings-core-ledger`
- Version: `0.2.0`
- Content Hash: `anchored in feature.spec.md`
- Last Edited: `2026-07-11T19:10:00Z`

## Purpose
Source of truth for the Settings admin HTTP surface, independent of implementation language. All
endpoints are admin-origin, mounted under the SPEC-001 command gateway, and gated by `authorize()`
(ADR-021). There is no `SettingsPort` service abstraction — routes call core over `SettingsRepoPort`.

## 1) Endpoint Registry
| Endpoint ID | Method | Path | Purpose | Auth Profile | Rate Limit Profile |
|---|---|---|---|---|---|
| `SETTINGS_GET_EFFECTIVE` | `GET` | `/api/v1/admin/settings/effective` | Resolve effective values for a namespace in a scope context | `AUTH_READ` | `READ_STANDARD` |
| `SETTINGS_GET_RAW` | `GET` | `/api/v1/admin/settings/raw` | Return per-layer raw values for a key | `AUTH_READ_RAW` | `READ_STANDARD` |
| `SETTINGS_LIST_DEFINITIONS` | `GET` | `/api/v1/admin/settings/definitions` | List active definitions grouped by namespace | `AUTH_READ_DEFS` | `READ_STANDARD` |
| `SETTINGS_REGISTER_DEFINITIONS` | `POST` | `/api/v1/admin/settings/definitions` | Register/rename/retype/deprecate/tombstone definitions | `AUTH_DEFINITIONS_MANAGE` | `WRITE_STANDARD` |
| `SETTINGS_SET` | `PUT` | `/api/v1/admin/settings/value` | Set a value at a scope | `AUTH_WRITE_SCOPED` | `WRITE_STANDARD` |
| `SETTINGS_CLEAR` | `DELETE` | `/api/v1/admin/settings/value` | Clear a value at a scope | `AUTH_WRITE_SCOPED` | `WRITE_STANDARD` |
| `SETTINGS_RESET` | `POST` | `/api/v1/admin/settings/reset` | Reset a namespace to defaults at a scope | `AUTH_RESET_SCOPED` | `WRITE_STANDARD` |

## 2) Authentication and Authorization Profiles
| Profile ID | Auth Required | Credential Type | Required Scopes | Permitted Roles | Notes |
|---|---|---|---|---|---|
| `AUTH_READ` | `true` | session (admin origin) | `settings.read` | admin, operator | Effective read; fail-closed |
| `AUTH_READ_RAW` | `true` | session (admin origin) | `settings.read.raw` | admin, operator | Per-layer raw values (see workspace vs global) |
| `AUTH_READ_DEFS` | `true` | session (admin origin) | `settings.read.definitions` | admin, operator | Registry listing |
| `AUTH_DEFINITIONS_MANAGE` | `true` | session (admin origin) | `settings.definitions.manage` | admin | Human-only; never delegated to a content agent |
| `AUTH_WRITE_SCOPED` | `true` | session (admin origin) | one of `settings.global.write` / `settings.workspace.write` / `settings.user.self.write` / `settings.user.write` matching the request scope | admin, operator | Server derives the required permission from the target scope |
| `AUTH_RESET_SCOPED` | `true` | session (admin origin) | one of `settings.reset.global` / `settings.reset.workspace` / `settings.reset.user` matching the request scope | admin | Reset is its own permission, separate from single-key writes |

## 3) Rate Limit Profiles
| Profile ID | Window Seconds | Max Requests | Burst Allowance | Keyed By (`userId|apiKey|ip|tenantId`) | Notes |
|---|---:|---:|---:|---|---|
| `WRITE_STANDARD` | `60` | `30` | `5` | `userId` | Matches behavior.spec §4 write bound |
| `READ_STANDARD` | `60` | `300` | `50` | `userId` | Matches behavior.spec §4 read bound |

## 4) Request Contracts

### Endpoint: `SETTINGS_GET_EFFECTIVE` (`GET /api/v1/admin/settings/effective`)
- Query Params:
```yaml
namespace: { type: string, required: true, example: "core.presentation" }
workspaceId: { type: string, required: false }
principalId: { type: string, required: false }
```

### Endpoint: `SETTINGS_REGISTER_DEFINITIONS` (`POST /api/v1/admin/settings/definitions`)
- Body:
```yaml
definitions:
  type: array
  required: true
  items:
    ownerKind: { type: string, enum: [core, site, theme], required: true }
    namespace: { type: string, required: true }
    key: { type: string, required: true }
    schemaJson: { type: object, required: true }
    defaultJson: { type: object, required: false }
    scopes: { type: integer, minimum: 1, maximum: 7, required: true }
    secret: { type: boolean, default: false }
    op: { type: string, enum: [register, rename, retype, deprecate, tombstone], default: register }
    newNamespace: { type: string, required: false }
    newKey: { type: string, required: false }
    coercionJson: { type: object, required: false }
```

### Endpoint: `SETTINGS_SET` (`PUT /api/v1/admin/settings/value`)
- Body:
```yaml
namespace: { type: string, required: true }
key: { type: string, required: true }
scope: { type: string, enum: [global, workspace, user], required: true }
workspaceId: { type: string, required: false }
principalId: { type: string, required: false }
valueJson: { type: object, required: true }
```

### Endpoint: `SETTINGS_RESET` (`POST /api/v1/admin/settings/reset`)
- Body:
```yaml
namespace: { type: string, required: true }
scope: { type: string, enum: [global, workspace, user], required: true }
workspaceId: { type: string, required: false }
```

## 5) Response Contracts
### Success Responses
| Endpoint ID | HTTP Status | Body Contract | Notes |
|---|---:|---|---|
| `SETTINGS_GET_EFFECTIVE` | `200` | `EffectiveResponse` | Map of key → resolved value + source layer |
| `SETTINGS_GET_RAW` | `200` | `RawLayersResponse` | Per-layer values for one key |
| `SETTINGS_LIST_DEFINITIONS` | `200` | `DefinitionsResponse` | Active definitions grouped by namespace |
| `SETTINGS_REGISTER_DEFINITIONS` | `200` | `RegisterResponse` | Applied ops with resulting statuses |
| `SETTINGS_SET` | `200` | `ValueResponse` | The written value + new revision seq |
| `SETTINGS_CLEAR` | `200` | `ValueResponse` | The cleared value + new revision seq |
| `SETTINGS_RESET` | `200` | `ResetResponse` | Count of cleared keys + revision seqs |

### Contract Definitions
```yaml
ResolvedValue:
  key: { type: string }
  value: { type: object, nullable: true }
  sourceLayer: { type: string, enum: [user, workspace, global, default] }
  defVersion: { type: integer }

EffectiveResponse:
  data: { type: array, items: { $ref: ResolvedValue } }

RawLayersResponse:
  key: { type: string }
  global: { type: object, nullable: true }
  workspace: { type: object, nullable: true }
  user: { type: object, nullable: true }
  default: { type: object, nullable: true }

DefinitionSummary:
  namespace: { type: string }
  key: { type: string }
  ownerKind: { type: string, enum: [core, site, theme] }
  scopes: { type: integer }
  status: { type: string, enum: [active, alias, deprecated, tombstone] }
  version: { type: integer }

DefinitionsResponse:
  data: { type: array, items: { $ref: DefinitionSummary } }

RegisterResponse:
  applied: { type: array, items: { key: string, op: string, status: string } }

ValueResponse:
  key: { type: string }
  scope: { type: string, enum: [global, workspace, user] }
  value: { type: object, nullable: true }
  revisionSeq: { type: integer }

ResetResponse:
  namespace: { type: string }
  clearedCount: { type: integer }
  revisionSeqs: { type: array, items: { type: integer } }
```

## 6) Error Mapping
Reference canonical codes in `errors.spec.md`.

| Endpoint ID | HTTP Status | Error Codes |
|---|---:|---|
| `SETTINGS_REGISTER_DEFINITIONS` | `400` | `VALIDATION_ERROR, DEFINITION_INVALID, SECRET_NOT_SUPPORTED` |
| `SETTINGS_REGISTER_DEFINITIONS` | `409` | `RENAME_RETYPE_CONFLICT, ALIAS_DEPTH_EXCEEDED, DEFINITION_TOMBSTONED` |
| `SETTINGS_SET` | `400` | `VALIDATION_ERROR, SCOPE_NOT_ALLOWED, VALUE_VALIDATION_FAILED` |
| `SETTINGS_SET` | `401` | `UNAUTHENTICATED` |
| `SETTINGS_SET` | `403` | `FORBIDDEN` |
| `SETTINGS_SET` | `404` | `DEFINITION_NOT_FOUND` |
| `SETTINGS_SET` | `409` | `DEFINITION_TOMBSTONED` |
| `SETTINGS_SET` | `429` | `RATE_LIMIT_EXCEEDED` |
| `SETTINGS_CLEAR` | `403` | `FORBIDDEN` |
| `SETTINGS_RESET` | `403` | `FORBIDDEN` |
| `SETTINGS_GET_EFFECTIVE` | `401` | `UNAUTHENTICATED` |
| `SETTINGS_GET_EFFECTIVE` | `403` | `FORBIDDEN` |
| all write endpoints | `500` | `INTERNAL_ERROR` |

## 7) Contract Acceptance Checklist
- [ ] Every endpoint in Section 1 has request and response contracts.
- [ ] Every endpoint has auth and rate-limit profiles.
- [ ] Every error code used here exists in `errors.spec.md`.
- [ ] Names and enums align with `state.spec.md`, `behavior.spec.md`, and `ui.spec.md`.
