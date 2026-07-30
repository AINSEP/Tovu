# Error Code Registry Spec: Menus (Navigation)

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/errors.spec.md`

- Spec ID: `SPEC-012`
- Feature: `FEAT-012-menus`
- Version: `1.0.0`
- Content Hash: `anchored in feature.spec.md`
- Last Edited: `2026-07-13T00:00:00Z`

## Purpose
Canonical error registry for Menus, as actually thrown/mapped in `src/navigation/menu-service.ts`
and `src/server/routes/admin/menus/*.ts`. The shipped code does not use the full structured
error envelope (`code/message/occurredAt/correlationId/details`) described below for every
error — only the `FORBIDDEN` case includes a `details` object. This is recorded as-is; see the
per-code notes for the actual shipped shape versus the template's aspirational envelope.

## 1) Error Envelope (Base Payload)

**As actually shipped**, every Menus route error response is just `{ error: string }`, with two
documented exceptions:
- `403` responses additionally include `code: "FORBIDDEN"` and
  `details: { permission: string, reason: string }` (every route's `authResult.allowed` branch).
- `409` purge-blocked responses additionally include `boundLocations: string[]`
  (`delete.ts`'s `MenuLocationBoundError` branch).

There is **no** `occurredAt`/`correlationId` field on any Menus error response today — this is
a real gap against the constitution's Article VIII observability expectation, named explicitly
in `feature.spec.md`'s Constitution Compliance table (Article VIII: EXCEPTION).

```yaml
# Template envelope (not what ships):
code: string
message: string
occurredAt: string   # ISO-8601 UTC
correlationId: string|null
details: object|null

# Actual shipped shape (baseline, every route):
error: string

# Actual shipped shape (403 only):
error: string
code: "FORBIDDEN"
details:
  permission: string
  reason: string

# Actual shipped shape (409 purge-blocked only):
error: string
boundLocations: string[]
```

## 2) Error Code Registry
These are Spec-Agent-assigned canonical names for the distinct failure conditions the code
produces (the code itself does not carry a `code` field except for `FORBIDDEN` — see Section 1).
Each row's HTTP status is read directly from the route's `catch`/guard-clause mapping.

| Code | Category | Layer (`api\|orchestrator\|ui\|integration`) | HTTP Status | Retryable | User Message Guidance |
|---|---|---|---:|---|---|
| `WORKSPACE_NOT_FOUND` | resource | `api` | 404 | no | "Workspace was not found." (literal string returned by every route) |
| `MENU_NOT_FOUND` | resource | `api` | 404 | no | Literal `MenuNotFoundError.message`, e.g. `"menu 'xyz' was not found"` |
| `ITEMS_NOT_ARRAY` | validation | `api` | 400 | no | `"items must be an array"` |
| `LOCATION_KEY_REQUIRED` | validation | `api` | 400 | no | `"locationKey is required"` |
| `VALIDATION_ERROR` | validation | `api` | 400 | no | Literal `MenuValidationError.message` (varies: bad slug/title format, duplicate/missing item id, depth/count over limit, unknown/reserved target kind, disallowed URL scheme) |
| `RESOURCE_CONFLICT` | resource | `api` | 409 | no | Literal `MenuConflictError.message` (duplicate slug, or stale `expectedVersion`) |
| `MENU_LOCATION_BOUND` | resource | `api` | 409 | no | Literal `MenuLocationBoundError.message` plus `boundLocations` array |
| `FORBIDDEN` | authz | `api` | 403 | no | `"principal '<id>' is not authorized for 'navigation.manage' (<reason>)"` |
| `INTERNAL_ERROR` | internal | `api` | 500 | maybe | `"internal error"` — the literal, generic string every route's catch-all returns |
| `NETWORK_OFFLINE` / `CLIENT_TIMEOUT` | client | `ui` | 0 | yes | Not implemented — `Menus.tsx`/`MenuEditor.tsx` catch any thrown `Error` and show `e.message` or a generic fallback string; there is no distinct offline/timeout code path |

**Not implemented in the shipped code (named for completeness, not present today):**
`UNAUTHENTICATED` (401) — no route returns 401; an unauthenticated request is handled entirely
by `requireAdminSession` middleware *before* these route handlers run, and its own response
shape is out of this feature's scope (identity/SPEC-006 owns it). `RATE_LIMIT_EXCEEDED` (429) —
no rate limiting exists on any Menus route (see `api.spec.md` §3).

## 3) Per-Code Details Schema
Only two codes carry a `details`/extra-field payload in the shipped code (see Section 1):

```yaml
FORBIDDEN:
  details:
    permission: string     # always "navigation.manage" today
    reason: string         # authorize()'s reason string, e.g. "no_grant"

MENU_LOCATION_BOUND:
  # not nested under "details" — a sibling top-level field on the response body
  boundLocations: array<string>
```

Every other code's only payload is the top-level `error` string — there is no structured
`details` object for `VALIDATION_ERROR`, `RESOURCE_CONFLICT`, `MENU_NOT_FOUND`, etc. A caller
cannot programmatically distinguish, say, "duplicate slug" from "stale version" without string-
matching `error`, since both map to the same `RESOURCE_CONFLICT` HTTP status with no code field.

## 4) Ownership and Source Rules
| Code | Produced By | Surfaced By | Notes |
|---|---|---|---|
| `VALIDATION_ERROR` | `menu-service.ts` (`validateAndCloneTree`/`validateTarget`/`assertValidTitleAndSlug`) | Route `catch (err instanceof MenuValidationError)` blocks in `create.ts`/`update-tree.ts` | One error class covers every validation failure kind — no sub-typing |
| `RESOURCE_CONFLICT` | `menu-service.ts` (`createMenu`, `updateMenuTree`) | Same routes, `catch (err instanceof MenuConflictError)` | `MenuLocationBoundError extends MenuConflictError` — `delete.ts` checks the subclass first so it is not swallowed by a generic `MenuConflictError` catch |
| `MENU_NOT_FOUND` | `menu-service.ts` (`updateMenuTree`, `assignLocation`, `deleteMenu`) or a direct `if (!menu)` in `get-by-id.ts` | Respective route's catch block or guard | |
| `FORBIDDEN` | Route handler's own `authResult.allowed` check (not thrown — a direct `res.status(403).json(...)` in every route file) | Same route | Identical code shape duplicated across all six route files, not a shared middleware |
| `INTERNAL_ERROR` | Any unclassified thrown error | Every route's final `catch` fallback | Swallows the real error message — the client never sees anything beyond the literal string `"internal error"` |

## 5) Acceptance Checklist
- [x] Every error emitted by feature code appears in Section 2.
- [x] Every code has clear retry behavior (all "no" except `INTERNAL_ERROR`, honestly marked "maybe" since the shipped code gives no signal either way).
- [x] Every code used in `api.spec.md` appears here.
- [x] User-safe message guidance is provided — quoting the actual literal strings the code returns, not idealized copy, since this is as-built documentation.
