# API Contract Spec: Menus (Navigation)

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/api.spec.md`

- Spec ID: `SPEC-012`
- Feature: `FEAT-012-menus`
- Version: `1.0.0`
- Content Hash: `anchored in feature.spec.md`
- Last Edited: `2026-07-13T00:00:00Z`

## Purpose
This file is the source of truth for the real, running admin HTTP surface for Menus, as
implemented in `src/server/routes/admin/menus/*.ts`. Every row below is sourced from a real
route file — no endpoint is proposed or aspirational.

## 1) Endpoint Registry
| Endpoint ID | Method | Path | Purpose | Auth Profile | Rate Limit Profile |
|---|---|---|---|---|---|
| `MENU_LIST` | `GET` | `/api/admin/v1/workspaces/:workspaceId/menus` | List every menu in the workspace | `AUTH_ADMIN_SESSION` | `NONE` |
| `MENU_GET` | `GET` | `/api/admin/v1/workspaces/:workspaceId/menus/:menuId` | Get one menu, full item tree included | `AUTH_ADMIN_SESSION` | `NONE` |
| `MENU_CREATE` | `POST` | `/api/admin/v1/workspaces/:workspaceId/menus` | Create a new menu, optional initial tree | `AUTH_ADMIN_SESSION` | `NONE` |
| `MENU_UPDATE_TREE` | `PUT` | `/api/admin/v1/workspaces/:workspaceId/menus/:menuId` | Whole-tree replace with OCC | `AUTH_ADMIN_SESSION` | `NONE` |
| `MENU_ASSIGN_LOCATION` | `POST` | `/api/admin/v1/workspaces/:workspaceId/menus/:menuId/locations` | Bind a menu to a theme location key | `AUTH_ADMIN_SESSION` | `NONE` |
| `MENU_DELETE` | `DELETE` | `/api/admin/v1/workspaces/:workspaceId/menus/:menuId` | Trash (1st call) / purge (2nd call, `?force=true` bypasses the bound-location guard) | `AUTH_ADMIN_SESSION` | `NONE` |

**Note:** `NONE` for rate limiting is not a design choice this spec endorses — no rate-limit
middleware is applied to any of these six routes in the shipped code. This is recorded as a
fact about the running system, not a recommendation.

## 2) Authentication and Authorization Profiles
| Profile ID | Auth Required | Credential Type | Required Scopes | Permitted Roles | Notes |
|---|---|---|---|---|---|
| `AUTH_ADMIN_SESSION` | `true` | Server-side session, `tovu_session` HTTP-only cookie (HMAC-signed `{userId, exp}` per session row — `src/server/middleware/dev-auth.ts`) | Permission string `navigation.manage`, checked via `authorize()` | Any principal (including the wildcard `*` owner grant) whose grants resolve `navigation.manage` to `allowed` | **Every one of the six routes uses this exact same single permission** — there is no `.read` vs `.manage` split despite ADR-029 §8 defining a 7-entry catalog (`navigation.read/create/update/delete/delete.force/assign/manage`). See `feature.spec.md` Deviation section / `spec-manifest.md` D-1. The workspace-id path param is checked for equality against the server's single configured workspace **before** the auth check runs (single-workspace v1 — `String(req.params.workspaceId) !== deps.workspaceId` short-circuits to `404`). |

## 3) Rate Limit Profiles
No rate-limit profile is applied to any Menus route in the shipped code. This table is
intentionally empty — there is nothing to document as a fact about the running system.

## 4) Request Contracts

### Endpoint: `MENU_LIST` (`GET /api/admin/v1/workspaces/:workspaceId/menus`)
- Path Params:
```yaml
workspaceId:
  type: string
  required: true
```
- Query Params: none read by this route.
- Headers:
```yaml
Cookie: "tovu_session=<session-token>"
```
- Body: none (GET).

### Endpoint: `MENU_GET` (`GET /api/admin/v1/workspaces/:workspaceId/menus/:menuId`)
- Path Params:
```yaml
workspaceId:
  type: string
  required: true
menuId:
  type: string
  required: true
```
- Query Params: none.
- Body: none.

### Endpoint: `MENU_CREATE` (`POST /api/admin/v1/workspaces/:workspaceId/menus`)
- Path Params:
```yaml
workspaceId:
  type: string
  required: true
```
- Body (`create.ts:25-29,51-59` — fields read directly off `req.body`, no schema library used):
```yaml
title:
  type: string
  required: true
  note: "coerced with String(req.body?.title ?? ''); empty string fails MenuValidationError downstream"
slug:
  type: string
  required: true
  note: "coerced with String(req.body?.slug ?? ''); validated against /^[a-z0-9-]+$/ in menu-service.ts"
items:
  type: array<NavItemNode>
  required: false
  note: "if present, must be an array (checked before menu-service.ts is called) or the route 400s with 'items must be an array'; each item is { id: string, label?: string, target: NavTarget, attrs?: object, children?: NavItemNode[] }"
```

### Endpoint: `MENU_UPDATE_TREE` (`PUT /api/admin/v1/workspaces/:workspaceId/menus/:menuId`)
- Path Params: `workspaceId`, `menuId` (both required, as above).
- Body (`update-tree.ts:32-35,57-66`):
```yaml
expectedVersion:
  type: integer
  required: true
  note: "coerced with Number(req.body?.expectedVersion ?? 0); a missing/malformed value becomes 0, which will fail OCC against any real menu (version starts at 1)"
title:
  type: string
  required: false
  note: "only applied when typeof req.body?.title === 'string'; otherwise the existing title is kept"
slug:
  type: string
  required: false
  note: "same as title — string-typed only, otherwise existing slug is kept"
items:
  type: array<NavItemNode>
  required: true
  note: "must be an array (checked before menu-service.ts is called) or the route 400s"
```

### Endpoint: `MENU_ASSIGN_LOCATION` (`POST /api/admin/v1/workspaces/:workspaceId/menus/:menuId/locations`)
- Path Params: `workspaceId`, `menuId`.
- Body (`assign-location.ts:21-25`):
```yaml
locationKey:
  type: string
  required: true
  note: "trimmed with String(req.body?.locationKey ?? '').trim(); empty after trim -> 400 'locationKey is required'"
```

### Endpoint: `MENU_DELETE` (`DELETE /api/admin/v1/workspaces/:workspaceId/menus/:menuId`)
- Path Params: `workspaceId`, `menuId`.
- Query Params (`delete.ts:22`):
```yaml
force:
  type: string
  required: false
  note: "read as String(req.query.force ?? '') === 'true' — any other value (including 'True'/'1') is treated as false"
```
- Body: none.

## 5) Response Contracts
### Success Responses
| Endpoint ID | HTTP Status | Body Contract | Notes |
|---|---:|---|---|
| `MENU_LIST` | `200` | `AdminMenuListEnvelope` | `{ menus: AdminMenuDto[] }` |
| `MENU_GET` | `200` | `AdminMenuEnvelope` | `{ menu: AdminMenuDto }` |
| `MENU_CREATE` | `201` | `AdminMenuEnvelope` | Returns the created menu, `version: 1` |
| `MENU_UPDATE_TREE` | `200` | `AdminMenuEnvelope` | Returns the updated menu, `version` incremented by 1 |
| `MENU_ASSIGN_LOCATION` | `200` | `AdminAssignLocationEnvelope` | `{ menu, binding, displacedMenu }` — `displacedMenu` is `null` unless a different menu held the location |
| `MENU_DELETE` (trash, 1st call) | `200` | `AdminDeleteMenuEnvelope` | `{ menu: <trashed menu>, purged: false }` |
| `MENU_DELETE` (purge, 2nd call) | `200` | `AdminDeleteMenuEnvelope` | `{ menu: null, purged: true }` |

### Contract Definitions
(As implemented in `src/server/http/admin/menus.ts` — DTOs are hand-written serializers, not a
schema-validated contract.)
```yaml
AdminMenuTargetDto:
  # structurally identical to NavItemNode["target"] — one of:
  entryRef: { kind: "entryRef", entryId: string }
  termRef: { kind: "termRef", termId: string, taxonomy: string }
  url: { kind: "url", href: string }
  route: { kind: "route", route: string, params?: object }

AdminMenuItemDto:
  id: string
  label: string | undefined
  target: AdminMenuTargetDto
  attrs: object | undefined
  children: AdminMenuItemDto[] | undefined

AdminMenuDto:
  id: string
  workspaceId: string
  slug: string
  title: string
  status: string   # "draft" | "published" | "trash" per types.ts, but "published" is never
                    # set by any implemented code path — see feature.spec.md Deviation D-10
  items: AdminMenuItemDto[]
  locations: string[]
  updatedAt: string   # ISO-8601
  version: integer

AdminMenuListEnvelope:
  menus: AdminMenuDto[]

AdminMenuEnvelope:
  menu: AdminMenuDto

AdminMenuBindingDto:
  workspaceId: string
  locationKey: string
  menuId: string
  boundAt: string   # ISO-8601

AdminAssignLocationEnvelope:
  menu: AdminMenuDto
  binding: AdminMenuBindingDto
  displacedMenu: AdminMenuDto | null

AdminDeleteMenuEnvelope:
  menu: AdminMenuDto | null
  purged: boolean
```

## 6) Error Mapping
Reference canonical codes in `errors.spec.md`. Every mapping below is read directly from the
route file's `catch` block — none are inferred.

| Endpoint ID | HTTP Status | Error Codes | Source |
|---|---:|---|---|
| `MENU_LIST`, `MENU_GET`, `MENU_CREATE`, `MENU_UPDATE_TREE`, `MENU_ASSIGN_LOCATION`, `MENU_DELETE` | `404` | `WORKSPACE_NOT_FOUND` | Path `:workspaceId` mismatch, every route file's first check |
| `MENU_LIST`, `MENU_GET`, `MENU_CREATE`, `MENU_UPDATE_TREE`, `MENU_ASSIGN_LOCATION`, `MENU_DELETE` | `403` | `FORBIDDEN` | `authResult.allowed === false`, every route file |
| `MENU_CREATE`, `MENU_UPDATE_TREE` | `400` | `ITEMS_NOT_ARRAY` | Non-array `items` in body, checked before service call |
| `MENU_ASSIGN_LOCATION` | `400` | `LOCATION_KEY_REQUIRED` | Empty/whitespace `locationKey` |
| `MENU_CREATE`, `MENU_UPDATE_TREE` | `400` | `VALIDATION_ERROR` | `MenuValidationError` thrown by `menu-service.ts` (bad slug/title, duplicate/missing item id, depth/count over limit, unknown or reserved target kind, disallowed URL scheme) |
| `MENU_CREATE`, `MENU_UPDATE_TREE` | `409` | `RESOURCE_CONFLICT` | `MenuConflictError` (duplicate slug on create, duplicate slug on rename, or stale `expectedVersion` on update) |
| `MENU_GET`, `MENU_UPDATE_TREE`, `MENU_ASSIGN_LOCATION`, `MENU_DELETE` | `404` | `MENU_NOT_FOUND` | `MenuNotFoundError` (unknown `menuId`) — `MENU_GET` returns this as a plain `if (!menu)` check rather than a thrown error, but the HTTP outcome is identical |
| `MENU_DELETE` | `409` | `MENU_LOCATION_BOUND` | `MenuLocationBoundError` (purge attempted while still bound; body includes `boundLocations: string[]`) |
| every endpoint | `500` | `INTERNAL_ERROR` | Any error not matching one of the above `instanceof` checks falls through to a generic `{ error: "internal error" }`, `500` |

## 7) Contract Acceptance Checklist
- [x] Every endpoint in Section 1 has request and response contracts.
- [x] Every endpoint has auth and rate-limit profiles (rate-limit profile is explicitly "none applied," a fact, not an omission).
- [x] Every error code used here exists in `errors.spec.md`.
- [x] Names and enums align with `state.spec.md` and `ui.spec.md` (`AdminMenuDto`/`AdminMenuItemDto`/`MenuStatus` used consistently across files).
