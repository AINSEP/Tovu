# API Contract Spec: media-assets

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/api.spec.md`

- Spec ID: `SPEC-021`
- Feature: `FEAT-021-media-assets`
- Version: `1.0.0`
- Content Hash: anchored in feature.spec.md
- Last Edited: `2026-07-15T00:00:00Z`

**As-built note:** this file documents the real, already-shipped HTTP surface in `src/server/routes/admin/media/*.ts` and `src/server/routes/site/media-rendition.ts`. Auth Profile / Rate Limit Profile columns document what actually runs today, including the disclosed absence of per-action authorization on the admin routes (`feature.spec.md` REQ-39/REQ-40, Constitution Article VI EXCEPTION) — they are not aspirational.

## Purpose
This file is the source of truth for API behavior for this feature, independent of implementation language.

## 1) Endpoint Registry

| Endpoint ID | Method | Path | Purpose | Auth Profile | Rate Limit Profile |
|---|---|---|---|---|---|
| `MEDIA_LIST` | `GET` | `/api/admin/v1/workspaces/:workspaceId/media` | List every media asset in the workspace (all statuses) | `ADMIN_SESSION_ONLY` | `NONE` |
| `MEDIA_UPLOAD` | `POST` | `/api/admin/v1/workspaces/:workspaceId/media` | Upload a new media asset (base64 JSON body) | `ADMIN_SESSION_ONLY` | `NONE` |
| `MEDIA_UPDATE` | `PATCH` | `/api/admin/v1/workspaces/:workspaceId/media/:mediaId` | Update editorial metadata (title/alt/caption/credit) | `ADMIN_SESSION_ONLY` | `NONE` |
| `MEDIA_TRASH` | `POST` | `/api/admin/v1/workspaces/:workspaceId/media/:mediaId/trash` | Soft-delete (first rung of the deletion ladder) | `ADMIN_SESSION_ONLY` | `NONE` |
| `MEDIA_PURGE` | `DELETE` | `/api/admin/v1/workspaces/:workspaceId/media/:mediaId` | Hard-delete (second rung; 409s unless already trashed) | `ADMIN_SESSION_ONLY` | `NONE` |
| `MEDIA_RENDITION` | `GET` | `/m/:assetId/:transformSpec/:filename` | Serve (or bounded-lazily-generate) a named rendition | `PUBLIC_UNAUTHENTICATED` | `NONE` |

## 2) Authentication and Authorization Profiles

| Profile ID | Auth Required | Credential Type | Required Scopes | Permitted Roles | Notes |
|---|---|---|---|---|---|
| `ADMIN_SESSION_ONLY` | `true` | `HttpOnly session cookie` (`tovu_session`, ADR-021/SPEC-006 real session auth) | **none checked** | **any principal with a valid admin session** | **Disclosed gap (REQ-39):** all five admin media routes require only a valid session — none call `deps.authorize(...)`. This differs from every sibling admin section's `ADMIN_SESSION_ONLY`-plus-permission-check profile (e.g. menus' `admin.menus.delete`, integrations' `integration.manage`). `MEDIA_UPLOAD` additionally reads the session principal via `getAuthedPrincipal(res)`, but only to stamp `createdByPrincipal` for attribution — not as a gate. |
| `PUBLIC_UNAUTHENTICATED` | `false` | none | n/a | anyone | Matches ADR-027 §4's intent that rendition serving is public; unlike ADR-027's full design, this route runs on the same origin/process as the authenticated admin API rather than a cookie-less media origin (GAP-ORIGIN) — it carries no cookies today because the client making the request typically doesn't send them cross-context, but the *server* itself provides no origin isolation. |

## 3) Rate Limit Profiles

| Profile ID | Window Seconds | Max Requests | Burst Allowance | Keyed By (`userId\|apiKey\|ip\|tenantId`) | Notes |
|---|---:|---:|---:|---|---|
| `NONE` | n/a | n/a | n/a | n/a | No rate limiting is applied to any media route in this build — `src/server/middleware/rate-limit.ts`'s `createRateLimiter`/`LOGIN_STRICT` profile is wired only into the auth/login route (`dev-auth.ts`), not any media route. This is consistent with most other admin sections in this repo (not a media-specific gap). |

## 4) Request Contracts

### Endpoint: `MEDIA_LIST` (`GET /api/admin/v1/workspaces/:workspaceId/media`)
- Path Params:
```yaml
workspaceId:
  type: string
  required: true
  note: "Must exactly equal the server's configured deps.workspaceId, or the route 404s before any other logic (REQ-35)."
```
- Query Params: `{}` (none read)
- Headers:
```yaml
Cookie: "tovu_session=<token>"
```
- Body: none

### Endpoint: `MEDIA_UPLOAD` (`POST /api/admin/v1/workspaces/:workspaceId/media`)
- Path Params: same `workspaceId` contract as `MEDIA_LIST`.
- Query Params: `{}`
- Headers:
```yaml
Cookie: "tovu_session=<token>"
Content-Type: "application/json"
```
- Body (JSON, NOT multipart — a disclosed transport simplification, `upload.ts`'s own file comment):
```yaml
filename:
  type: string
  required: true
  note: "Must be non-empty after String() coercion; 400 otherwise."
contentType:
  type: string
  required: true
  note: "Must be non-empty AND in the allowlist (image/jpeg|png|webp|gif by default) — advisory/client-supplied, not sniffed (GAP-INGRESS)."
dataBase64:
  type: string
  required: true
  note: "Non-empty base64 string; malformed base64 -> 400. This inflates payload size ~33% versus raw bytes — express.json()'s body-size limit was raised in server/app.ts to accommodate it."
alt:
  type: string
  required: false
caption:
  type: string
  required: false
credit:
  type: string
  required: false
```

### Endpoint: `MEDIA_UPDATE` (`PATCH /api/admin/v1/workspaces/:workspaceId/media/:mediaId`)
- Path Params:
```yaml
workspaceId:
  type: string
  required: true
mediaId:
  type: string
  required: true
```
- Body:
```yaml
title:
  type: string
  required: false
alt:
  type: string
  required: false
caption:
  type: string
  required: false
credit:
  type: string
  required: false
note: "No field accepts a new sha256 — source is not editable via this endpoint (write-once, REQ-08/REQ-11)."
```

### Endpoint: `MEDIA_TRASH` (`POST /api/admin/v1/workspaces/:workspaceId/media/:mediaId/trash`)
- Path Params: `workspaceId`, `mediaId` (both required, same shape as above).
- Body: none consumed.

### Endpoint: `MEDIA_PURGE` (`DELETE /api/admin/v1/workspaces/:workspaceId/media/:mediaId`)
- Path Params: `workspaceId`, `mediaId` (both required, same shape as above).
- Body: none.

### Endpoint: `MEDIA_RENDITION` (`GET /m/:assetId/:transformSpec/:filename`)
- Path Params:
```yaml
assetId:
  type: string
  required: true
transformSpec:
  type: string
  required: true
  pattern: "^(.+)\\.v(\\d+)$"
  note: "e.g. 'thumb.v1'. Malformed (no .v{n} suffix) or non-positive-integer version -> 400."
filename:
  type: string
  required: true
  note: "Cosmetic slug + extension only — read to satisfy Express routing, NEVER used in the lookup key (INV-10)."
```
- Query Params: `{}`
- Headers: none required (unauthenticated).
- Body: none.

## 5) Response Contracts

### Success Responses
| Endpoint ID | HTTP Status | Body Contract | Notes |
|---|---:|---|---|
| `MEDIA_LIST` | `200` | `AdminMediaListEnvelope` | Every workspace media row, all statuses |
| `MEDIA_UPLOAD` | `201` | `AdminMediaEnvelope` | Newly created row |
| `MEDIA_UPDATE` | `200` | `AdminMediaEnvelope` | Updated row |
| `MEDIA_TRASH` | `200` | `AdminMediaEnvelope` | Row with `status: "trashed"` |
| `MEDIA_PURGE` | `200` | `{ purged: true }` | Not wrapped in an `AdminMediaEnvelope` — the row no longer exists |
| `MEDIA_RENDITION` | `200` | raw bytes (`Content-Type` per transform format) | `Cache-Control: public, max-age=31536000, immutable` |

### Contract Definitions
```yaml
AdminMediaResponse:
  id: { type: string }
  workspaceId: { type: string }
  title: { type: string }
  alt: { type: string }
  caption: { type: string }
  credit: { type: string }
  sha256: { type: string }
  status: { type: string, enum: [active, trashed] }
  createdAt: { type: string, format: date-time }
  updatedAt: { type: string, format: date-time }
  version: { type: integer }

AdminMediaEnvelope:
  media: { $ref: AdminMediaResponse }

AdminMediaListEnvelope:
  media: { type: array, items: { $ref: AdminMediaResponse } }

MediaPurgeResponse:
  purged: { type: boolean, const: true }
```

Source: `src/server/http/admin/media.ts`'s `AdminMediaResponse`/`AdminMediaEnvelope`/`AdminMediaListEnvelope` and `toAdminMediaResponse`/`toAdminMediaListResponse` — a near-passthrough projection of `MediaRecord` (no session/secret-shaped fields exist on `MediaRecord` to exclude).

## 6) Error Mapping

Reference: `errors.spec.md`. **Note the real response body shape is a plain `{error: string}` (or, for `MEDIA_PURGE`'s 409, `{error: string, referencing: string[]}`) — NOT the canonical `{code, message, occurredAt, correlationId, details}` envelope `errors.spec.md` §1 defines as the target shape.** This is a real, disclosed gap (GAP-OBSERVABILITY), documented rather than silently upgraded to look more compliant than the code is.

| Endpoint ID | HTTP Status | Real Body Shape | Canonical Code (per errors.spec.md) |
|---|---:|---|---|
| `MEDIA_LIST` | `404` | `{ error }` | `WORKSPACE_NOT_FOUND` |
| `MEDIA_LIST` | `500` | `{ error: "internal error" }` | `INTERNAL_ERROR` |
| `MEDIA_UPLOAD` | `400` | `{ error }` | `MEDIA_VALIDATION_ERROR` |
| `MEDIA_UPLOAD` | `201` | `{ media }` | n/a (success) |
| `MEDIA_UPLOAD` | `404` | `{ error }` | `WORKSPACE_NOT_FOUND` |
| `MEDIA_UPLOAD` | `500` | `{ error: "internal error" }` | `INTERNAL_ERROR` |
| `MEDIA_UPDATE` | `400` | `{ error }` | `MEDIA_VALIDATION_ERROR` |
| `MEDIA_UPDATE` | `404` | `{ error }` | `MEDIA_NOT_FOUND` |
| `MEDIA_UPDATE` | `500` | `{ error: "internal error" }` | `INTERNAL_ERROR` |
| `MEDIA_TRASH` | `404` | `{ error }` | `MEDIA_NOT_FOUND` (or `WORKSPACE_NOT_FOUND` if the workspace segment mismatched) |
| `MEDIA_TRASH` | `500` | `{ error: "internal error" }` | `INTERNAL_ERROR` |
| `MEDIA_PURGE` | `404` | `{ error }` | `MEDIA_NOT_FOUND` |
| `MEDIA_PURGE` | `409` | `{ error, referencing }` | `MEDIA_STILL_REFERENCED` |
| `MEDIA_PURGE` | `500` | `{ error: "internal error" }` | `INTERNAL_ERROR` |
| `MEDIA_RENDITION` | `400` | `{ error }` | `MALFORMED_RENDITION_URL` |
| `MEDIA_RENDITION` | `404` | `{ error }` (`Cache-Control: public, max-age=60`) | `RENDITION_NOT_FOUND` |
| `MEDIA_RENDITION` | `410` | empty body (`Cache-Control: no-store`) | `MEDIA_GONE` |
| `MEDIA_RENDITION` | `503` | `{ error }` (`Cache-Control: no-store`) | `IMAGE_TRANSFORM_UNAVAILABLE` |
| `MEDIA_RENDITION` | `500` | `{ error: "internal error" }` | `INTERNAL_ERROR` |

**No endpoint in this build ever returns `401`/`403`.** `401` would require session middleware to reject an unauthenticated request (real, upstream of these route handlers, not part of this file); `403` never occurs because no route checks a permission (REQ-39) — this is a direct, mechanical consequence of the Constitution Article VI EXCEPTION recorded in `feature.spec.md`, not a separate finding.

## 7) Contract Acceptance Checklist
- [x] Every endpoint in Section 1 has request and response contracts.
- [x] Every endpoint has auth and rate-limit profiles (including the disclosed absence of a permission check, and the disclosed absence of rate limiting).
- [x] Every error code used here exists in `errors.spec.md`.
- [x] Names and enums align with `state.spec.md` and `ui.spec.md`.
