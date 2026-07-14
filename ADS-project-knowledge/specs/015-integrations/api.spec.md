# API Contract Spec: integrations

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/api.spec.md`

- Spec ID: `SPEC-015`
- Feature: `FEAT-015-integrations`
- Version: `1.0.0`
- Content Hash: anchored in `feature.spec.md`
- Last Edited: `2026-07-13T00:00:00Z`

**As-built note:** every endpoint below is real, wired into `src/server/app.ts`, and covered by `src/server/__tests__/admin-integrations-routes.test.ts`. Source files: `src/server/routes/admin/integrations/{list,create,pause,delete,deliveries}.ts`.

## Purpose
This file is the source of truth for API behavior for this feature, independent of implementation language.

## 1) Endpoint Registry

| Endpoint ID | Method | Path | Purpose | Auth Profile | Rate Limit Profile |
|---|---|---|---|---|---|
| `INTEGRATIONS_LIST` | `GET` | `/api/admin/v1/workspaces/:workspaceId/integrations/subscriptions` | List subscriptions, each annotated with its most recent delivery | `ADMIN_SESSION` | `NONE` |
| `INTEGRATIONS_CREATE` | `POST` | `/api/admin/v1/workspaces/:workspaceId/integrations/subscriptions` | Create a webhook subscription | `ADMIN_SESSION` | `NONE` |
| `INTEGRATIONS_PAUSE` | `POST` | `/api/admin/v1/workspaces/:workspaceId/integrations/subscriptions/:subscriptionId/pause` | Pause or resume a subscription | `ADMIN_SESSION` | `NONE` |
| `INTEGRATIONS_DELETE` | `DELETE` | `/api/admin/v1/workspaces/:workspaceId/integrations/subscriptions/:subscriptionId` | Soft-delete (disable) a subscription | `ADMIN_SESSION` | `NONE` |
| `INTEGRATIONS_DELIVERIES` | `GET` | `/api/admin/v1/workspaces/:workspaceId/integrations/subscriptions/:subscriptionId/deliveries` | Read a subscription's delivery log, newest-first | `ADMIN_SESSION` | `NONE` |

**As-built note on rate limiting:** `NONE` is the honest, as-shipped answer — no rate-limit middleware exists on any admin route in this repo today, integrations included. The template's `WRITE_STANDARD`/`READ_STANDARD` profile pattern is not implemented anywhere in the codebase; documenting a rate-limit profile that doesn't exist would misstate the code.

## 2) Authentication and Authorization Profiles

| Profile ID | Auth Required | Credential Type | Required Scopes | Permitted Roles | Notes |
|---|---|---|---|---|---|
| `ADMIN_SESSION` | `true` | Dev-auth session (`getAuthedPrincipal`, `src/server/middleware/dev-auth.ts`) | Permission `integration.manage` (see Open Question OQ-01 in `feature.spec.md` on the `admin.integrations.manage` naming drift) | Any principal holding `integration.manage` via role/policy grant (ADR-021) | Checked directly via `authorize()` in each route, not through the SPEC-001 command gateway — subscription mutations are a direct feature call, per each route file's own doc comment. |

## 3) Rate Limit Profiles

| Profile ID | Window Seconds | Max Requests | Burst Allowance | Keyed By | Notes |
|---|---:|---:|---:|---|---|
| `NONE` | n/a | n/a | n/a | n/a | No rate limiting exists on these routes as shipped. Documented as `NONE` rather than omitted so a future implementer doesn't have to re-derive "there is none" from the route source. |

## 4) Request Contracts

### Endpoint: `INTEGRATIONS_LIST` (`GET /api/admin/v1/workspaces/:workspaceId/integrations/subscriptions`)
- Path Params:
```yaml
workspaceId:
  type: string
  required: true
  validation: must equal the server's configured deps.workspaceId, else 404
```
- Query Params: `{}`
- Body: none

### Endpoint: `INTEGRATIONS_CREATE` (`POST /api/admin/v1/workspaces/:workspaceId/integrations/subscriptions`)
- Path Params: same as above
- Body:
```yaml
label:
  type: string
  required: true
  note: coerced with String(req.body?.label ?? ""); trimmed and rejected if blank by createSubscription
targetUrl:
  type: string
  required: true
  note: coerced with String(req.body?.targetUrl ?? ""); must be https:// and pass isAllowedTarget
topics:
  type: array<string>
  required: true
  note: only accepted if req.body.topics is an Array (Array.isArray check); each entry coerced with String(); empty after normalization is rejected
```
- **As-built note:** the route hardcodes `ownerPrincipalId`/`createdByPrincipalId` to the literal string `"user-local"` — the dev-mode single-actor placeholder shared with the command-gateway convention (`dev-auth.ts`'s fixed session subject). There is no real per-principal ownership in the current server.

### Endpoint: `INTEGRATIONS_PAUSE` (`POST /api/admin/v1/workspaces/:workspaceId/integrations/subscriptions/:subscriptionId/pause`)
- Path Params: `workspaceId`, `subscriptionId` (string, required)
- Body:
```yaml
paused:
  type: boolean
  required: false
  default: true
  note: any non-boolean value in the body is ignored and treated as the default (true)
```

### Endpoint: `INTEGRATIONS_DELETE` (`DELETE /api/admin/v1/workspaces/:workspaceId/integrations/subscriptions/:subscriptionId`)
- Path Params: `workspaceId`, `subscriptionId` (string, required)
- Body: none

### Endpoint: `INTEGRATIONS_DELIVERIES` (`GET /api/admin/v1/workspaces/:workspaceId/integrations/subscriptions/:subscriptionId/deliveries`)
- Path Params: `workspaceId`, `subscriptionId` (string, required)
- Query Params:
```yaml
limit:
  type: integer
  required: false
  default: 50
  validation: non-finite or <= 0 falls back to 50; parsed values are floored and clamped to a hard max of 200 (never rejected with an error)
```

## 5) Response Contracts

### Success Responses

| Endpoint ID | HTTP Status | Body Contract | Notes |
|---|---:|---|---|
| `INTEGRATIONS_LIST` | `200` | `{ subscriptions: AdminWebhookSubscriptionResponse[] }` | |
| `INTEGRATIONS_CREATE` | `201` | `{ subscription: AdminWebhookSubscriptionResponse }` | `lastDelivery` is always `null` on create (nothing has been delivered yet) |
| `INTEGRATIONS_PAUSE` | `200` | `{ subscription: AdminWebhookSubscriptionResponse }` | |
| `INTEGRATIONS_DELETE` | `200` | `{ subscription: AdminWebhookSubscriptionResponse }` | The response echoes the now-`disabled` subscription |
| `INTEGRATIONS_DELIVERIES` | `200` | `{ deliveries: AdminWebhookDeliveryResponse[] }` | Newest-first by `createdAt`, computed by the route, not the repo |

### Contract Definitions (mirrors `src/server/http/admin/integrations.ts` exactly)
```yaml
AdminWebhookDeliverySummary:
  id: { type: string }
  status: { type: string, enum: [pending, delivering, delivered, failed, dead, canceled] }
  attempts: { type: integer }
  lastResponseStatus: { type: integer, nullable: true }
  lastError: { type: string, nullable: true }
  createdAt: { type: string, format: date-time }
  deliveredAt: { type: string, format: date-time, nullable: true }

AdminWebhookSubscriptionResponse:
  id: { type: string }
  label: { type: string }
  targetUrl: { type: string }
  topics: { type: array, items: string }
  status: { type: string, enum: [active, paused, disabled] }
  secretVersion: { type: integer }
  previousSecretVersion: { type: integer, nullable: true }
  createdAt: { type: string, format: date-time }
  updatedAt: { type: string, format: date-time }
  disabledAt: { type: string, format: date-time, nullable: true }
  lastDelivery: { $ref: AdminWebhookDeliverySummary, nullable: true }

AdminWebhookDeliveryResponse:
  id: { type: string }
  subscriptionId: { type: string }
  eventId: { type: string }
  topic: { type: string }
  status: { type: string, enum: [pending, delivering, delivered, failed, dead, canceled] }
  attempts: { type: integer }
  nextAttemptAt: { type: string, format: date-time }
  lastResponseStatus: { type: integer, nullable: true }
  lastError: { type: string, nullable: true }
  signedWithVersion: { type: integer, nullable: true }
  createdAt: { type: string, format: date-time }
  deliveredAt: { type: string, format: date-time, nullable: true }
  deadAt: { type: string, format: date-time, nullable: true }
```

**As-built note (secret hygiene):** No field on any of these three contracts ever carries signing-secret material — `WebhookSubscriptionRecord` itself has no secret column (derive-not-store, ADR-036 §5), so there is structurally nothing for the DTOs to leak. Verified directly by AC-24 in `feature.spec.md` / the routes test's `"never leaks secret material in the response"` case.

## 6) Error Mapping

Reference canonical codes in `errors.spec.md`.

| Endpoint ID | HTTP Status | Error Codes |
|---|---:|---|
| `INTEGRATIONS_LIST` | `403` | `FORBIDDEN` |
| `INTEGRATIONS_LIST` | `404` | `WORKSPACE_NOT_FOUND` |
| `INTEGRATIONS_LIST` | `500` | `INTERNAL_ERROR` |
| `INTEGRATIONS_CREATE` | `400` | `INTEGRATIONS_VALIDATION_ERROR` |
| `INTEGRATIONS_CREATE` | `403` | `FORBIDDEN` |
| `INTEGRATIONS_CREATE` | `404` | `WORKSPACE_NOT_FOUND` |
| `INTEGRATIONS_CREATE` | `500` | `INTERNAL_ERROR` |
| `INTEGRATIONS_PAUSE` | `400` | `INTEGRATIONS_VALIDATION_ERROR` |
| `INTEGRATIONS_PAUSE` | `403` | `FORBIDDEN` |
| `INTEGRATIONS_PAUSE` | `404` | `WORKSPACE_NOT_FOUND`, `INTEGRATIONS_SUBSCRIPTION_NOT_FOUND` |
| `INTEGRATIONS_PAUSE` | `500` | `INTERNAL_ERROR` |
| `INTEGRATIONS_DELETE` | `403` | `FORBIDDEN` |
| `INTEGRATIONS_DELETE` | `404` | `WORKSPACE_NOT_FOUND`, `INTEGRATIONS_SUBSCRIPTION_NOT_FOUND` |
| `INTEGRATIONS_DELETE` | `500` | `INTERNAL_ERROR` |
| `INTEGRATIONS_DELIVERIES` | `403` | `FORBIDDEN` |
| `INTEGRATIONS_DELIVERIES` | `404` | `WORKSPACE_NOT_FOUND`, `INTEGRATIONS_SUBSCRIPTION_NOT_FOUND` |
| `INTEGRATIONS_DELIVERIES` | `500` | `INTERNAL_ERROR` |

**As-built note:** the actual route code returns plain `{ error: string }` bodies (plus `code`/`details` only on the 403 path — see `errors.spec.md` §1 for the exact shape difference between the 403 envelope and every other error response). This is documented precisely in `errors.spec.md` rather than smoothed over into the idealized template envelope.

## 7) Contract Acceptance Checklist
- [x] Every endpoint in Section 1 has request and response contracts.
- [x] Every endpoint has auth and rate-limit profiles (rate limit profile is `NONE`, truthfully).
- [x] Every error code used here exists in `errors.spec.md`.
- [x] Names and enums align with `state.spec.md` and `ui.spec.md`.
