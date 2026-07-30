# API Contract Spec: redirects

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/api.spec.md`

- Spec ID: `SPEC-009`
- Feature: `FEAT-009-redirects`
- Version: `1.0.0`
- Content Hash: `anchored in feature.spec.md`
- Last Edited: `2026-07-12T00:00:00Z`

## Purpose
This file is the source of truth for API behavior for this feature, independent of
implementation language. Routes follow the existing admin-route convention in this repo
(`src/server/routes/admin/menus/*.ts`): Express handlers, workspace scoped by path param,
principal resolved from the authenticated dev-session (`getAuthedPrincipal`), permission
checked directly via `deps.authorize()` — not the `AUTH_WRITE`/Bearer-JWT profile shown as a
generic placeholder in this template, because this repo has no bearer-token auth layer yet
(Constitution Art. VI standing exception).

## 1) Endpoint Registry
| Endpoint ID | Method | Path | Purpose | Auth Profile | Rate Limit Profile |
|---|---|---|---|---|---|
| `LIST_REDIRECTS` | `GET` | `/api/admin/v1/workspaces/:workspaceId/redirects` | List redirect rules, optionally filtered | `ADMIN_SESSION` | `READ_STANDARD` |
| `GET_REDIRECT` | `GET` | `/api/admin/v1/workspaces/:workspaceId/redirects/:id` | Fetch a single rule | `ADMIN_SESSION` | `READ_STANDARD` |
| `CREATE_REDIRECT` | `POST` | `/api/admin/v1/workspaces/:workspaceId/redirects` | Create a manual rule | `ADMIN_SESSION` | `WRITE_STANDARD` |
| `UPDATE_REDIRECT` | `PATCH` | `/api/admin/v1/workspaces/:workspaceId/redirects/:id` | Update mutable rule fields | `ADMIN_SESSION` | `WRITE_STANDARD` |
| `TOMBSTONE_REDIRECT` | `DELETE` | `/api/admin/v1/workspaces/:workspaceId/redirects/:id` | Soft-delete (tombstone) a rule | `ADMIN_SESSION` | `WRITE_STANDARD` |
| `IMPORT_REDIRECTS` | `POST` | `/api/admin/v1/workspaces/:workspaceId/redirects/import` | Batch-create rules through the standard chokepoint (REQ-26) | `ADMIN_SESSION` | `WRITE_STANDARD` |
| `LIST_REDIRECT_HITS` | `GET` | `/api/admin/v1/workspaces/:workspaceId/redirects/:id/hits` | Read aggregate hit stats for a rule (`RedirectHitSink.getStats`) | `ADMIN_SESSION` | `READ_STANDARD` |

Note: the resolution-time redirect (the actual 301/302/307/308 response a browser follows)
is not a distinct endpoint here — it is emitted by the `routing` forward chain (ADR-039)
after the phase handler Redirects registers via `registerResolvePhase` matches. This
registration is an integration point (see Dependencies in `feature.spec.md`), not an
admin-facing HTTP contract of this file.

## 2) Authentication and Authorization Profiles
| Profile ID | Auth Required | Credential Type | Required Scopes | Permitted Roles | Notes |
|---|---|---|---|---|---|
| `ADMIN_SESSION` | `true` | Dev-auth session (`getAuthedPrincipal`), not Bearer JWT | `admin.redirects.manage` (single v1 permission, gates all CRUD/import/hit-read per REQ-12) | any principal granted `admin.redirects.manage` | Matches `src/server/routes/admin/menus/*.ts`'s pattern: `deps.authorize({ principalId, permission, workspaceId, entityType: 'redirect' })` checked directly in-route, not via the SPEC-001 command gateway. |

## 3) Rate Limit Profiles
| Profile ID | Window Seconds | Max Requests | Burst Allowance | Keyed By (`userId|apiKey|ip|tenantId`) | Notes |
|---|---:|---:|---:|---|---|
| `WRITE_STANDARD` | `60` | `30` | `5` | `userId` | No rate-limit middleware exists yet in this repo (same gap as every other admin route); this profile documents the intended policy for when rate limiting is added, not a currently-enforced behavior. |
| `READ_STANDARD` | `60` | `300` | `50` | `userId` | Same caveat as above. |

## 4) Request Contracts

### Endpoint: `LIST_REDIRECTS` (`GET /api/admin/v1/workspaces/:workspaceId/redirects`)
- Path Params:
```yaml
workspaceId:
  type: string
  format: uuid
  required: true
```
- Query Params:
```yaml
status:
  type: string
  enum: [active, disabled]
  required: false
source:
  type: string
  enum: [manual, auto_slug_change, import]
  required: false
matchType:
  type: string
  enum: [exact, prefix, wildcard]
  required: false
```

### Endpoint: `GET_REDIRECT` (`GET /api/admin/v1/workspaces/:workspaceId/redirects/:id`)
- Path Params:
```yaml
workspaceId:
  type: string
  format: uuid
  required: true
id:
  type: string
  format: uuid
  required: true
```

### Endpoint: `CREATE_REDIRECT` (`POST /api/admin/v1/workspaces/:workspaceId/redirects`)
- Path Params:
```yaml
workspaceId:
  type: string
  format: uuid
  required: true
```
- Body:
```yaml
matchType:
  type: string
  enum: [exact, prefix, wildcard]
  required: true
  # 'regex' is a valid vocabulary value in src/redirects/types.ts but is REJECTED by the
  # write chokepoint in v1 (REQ-22) — see errors.spec.md REDIRECT_VALIDATION_ERROR.
fromPattern:
  type: string
  minLength: 1
  maxLength: 2048
  required: true
toTarget:
  type: string
  minLength: 1
  maxLength: 2048
  required: true
statusCode:
  type: integer
  enum: [301, 302, 307, 308]
  required: true
override:
  type: boolean
  default: false
  required: false
priority:
  type: integer
  default: 0
  minimum: 0
  maximum: 1000
  required: false
```

### Endpoint: `UPDATE_REDIRECT` (`PATCH /api/admin/v1/workspaces/:workspaceId/redirects/:id`)
- Path Params: same as `GET_REDIRECT`.
- Body: all fields from `CREATE_REDIRECT`'s body, each optional, plus:
```yaml
status:
  type: string
  enum: [active, disabled]
  required: false
```

### Endpoint: `TOMBSTONE_REDIRECT` (`DELETE /api/admin/v1/workspaces/:workspaceId/redirects/:id`)
- Path Params: same as `GET_REDIRECT`.
- Body: none.

### Endpoint: `IMPORT_REDIRECTS` (`POST /api/admin/v1/workspaces/:workspaceId/redirects/import`)
- Path Params: same as `LIST_REDIRECTS`.
- Body:
```yaml
rules:
  type: array
  minItems: 1
  maxItems: 500
  required: true
  items:
    # identical shape to CREATE_REDIRECT's body — each item goes through the same
    # chokepoint validation individually (REQ-26); a per-item failure does not abort
    # already-written prior items (batch is not itself transactional across items).
    $ref: CreateRedirectItem
```

### Endpoint: `LIST_REDIRECT_HITS` (`GET /api/admin/v1/workspaces/:workspaceId/redirects/:id/hits`)
- Path Params: same as `GET_REDIRECT`.

## 5) Response Contracts
### Success Responses
| Endpoint ID | HTTP Status | Body Contract | Notes |
|---|---:|---|---|
| `LIST_REDIRECTS` | `200` | `RedirectListResponse` | Array, no pagination cursor in v1 (workspace rule counts are small; the dynamic-set cap bounds worst case) |
| `GET_REDIRECT` | `200` | `RedirectResponse` | |
| `CREATE_REDIRECT` | `201` | `RedirectResponse` | |
| `UPDATE_REDIRECT` | `200` | `RedirectResponse` | |
| `TOMBSTONE_REDIRECT` | `200` | `RedirectResponse` | Returns the tombstoned rule (`status: 'disabled'`), not `204`, so the admin UI can show the final state without a re-fetch |
| `IMPORT_REDIRECTS` | `207` | `RedirectImportResponse` | Multi-Status: some rules may succeed while others fail validation (REQ-26) |
| `LIST_REDIRECT_HITS` | `200` | `RedirectHitStatsResponse` | |

### Contract Definitions
```yaml
RedirectRule:
  id: { type: string, format: uuid }
  workspaceId: { type: string, format: uuid }
  matchType: { type: string, enum: [exact, prefix, wildcard, regex] }
  fromPattern: { type: string }
  toTarget: { type: string }
  statusCode: { type: integer, enum: [301, 302, 307, 308] }
  status: { type: string, enum: [active, disabled] }
  override: { type: boolean }
  priority: { type: integer }
  source: { type: string, enum: [manual, auto_slug_change, import] }
  sourceEntryId: { type: string, format: uuid, nullable: true }
  fromPathAtCapture: { type: string, nullable: true }
  toPathAtCapture: { type: string, nullable: true }
  createdByPrincipal: { type: string, format: uuid }
  createdByPluginId: { type: string, nullable: true }
  createdAt: { type: string, format: date-time }
  updatedAt: { type: string, format: date-time }
  version: { type: integer }

RedirectResponse:
  data: { $ref: RedirectRule }

RedirectListResponse:
  data: { type: array, items: { $ref: RedirectRule } }

RedirectImportResponse:
  created: { type: array, items: { $ref: RedirectRule } }
  failed:
    type: array
    items:
      index: { type: integer }
      code: { type: string }
      message: { type: string }

RedirectHitStats:
  redirectId: { type: string, format: uuid }
  workspaceId: { type: string, format: uuid }
  hitCount: { type: integer }
  lastHitAt: { type: string, format: date-time, nullable: true }

RedirectHitStatsResponse:
  data: { $ref: RedirectHitStats }
```

## 6) Error Mapping
Reference canonical codes in `errors.spec.md`.

| Endpoint ID | HTTP Status | Error Codes |
|---|---:|---|
| `LIST_REDIRECTS` | `403` | `FORBIDDEN` |
| `GET_REDIRECT` | `404` | `REDIRECT_NOT_FOUND` |
| `GET_REDIRECT` | `403` | `FORBIDDEN` |
| `CREATE_REDIRECT` | `400` | `VALIDATION_ERROR, REDIRECT_VALIDATION_ERROR, REDIRECT_TARGET_NOT_ALLOWED` |
| `CREATE_REDIRECT` | `403` | `FORBIDDEN` |
| `CREATE_REDIRECT` | `409` | `REDIRECT_CONFLICT, REDIRECT_LOOP_DETECTED` |
| `UPDATE_REDIRECT` | `400` | `VALIDATION_ERROR, REDIRECT_VALIDATION_ERROR, REDIRECT_TARGET_NOT_ALLOWED` |
| `UPDATE_REDIRECT` | `403` | `FORBIDDEN` |
| `UPDATE_REDIRECT` | `404` | `REDIRECT_NOT_FOUND` |
| `UPDATE_REDIRECT` | `409` | `REDIRECT_CONFLICT, REDIRECT_LOOP_DETECTED` |
| `TOMBSTONE_REDIRECT` | `403` | `FORBIDDEN` |
| `TOMBSTONE_REDIRECT` | `404` | `REDIRECT_NOT_FOUND` |
| `IMPORT_REDIRECTS` | `403` | `FORBIDDEN` |
| `IMPORT_REDIRECTS` | `400` | `VALIDATION_ERROR` (malformed batch shape only — per-item failures surface in the `207` body, not a top-level 400) |
| `LIST_REDIRECT_HITS` | `403` | `FORBIDDEN` |
| `LIST_REDIRECT_HITS` | `404` | `REDIRECT_NOT_FOUND` |
| all endpoints | `500` | `INTERNAL_ERROR` |

Note: `LINK_PRESERVATION_UNAVAILABLE` is NOT surfaced by any endpoint in this file — it is
raised by the **entry/content rename endpoint** (outside this feature's own API surface)
when the content write chokepoint cannot bind a `SlugChangeCapture` implementation while
link-preservation is enabled. It is registered in `errors.spec.md` here because Redirects
owns the capture implementation whose absence triggers it, per REQ-16.

## 7) Contract Acceptance Checklist
- [x] Every endpoint in Section 1 has request and response contracts.
- [x] Every endpoint has auth and rate-limit profiles.
- [x] Every error code used here exists in `errors.spec.md`.
- [x] Names and enums align with `state.spec.md` and `ui.spec.md`.
