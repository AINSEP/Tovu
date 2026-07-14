# API Contract Spec: analytics

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/api.spec.md`

- Spec ID: `SPEC-014`
- Feature: `FEAT-014-analytics`
- Version: `1.0.0`
- Content Hash: `sha256:PENDING`
- Last Edited: `2026-07-13T00:00:00Z`

## Purpose
This file documents the two HTTP endpoints `analytics` actually exposes today, as
implemented in `src/server/routes/site/analytics-ingest.ts` and
`src/server/routes/admin/analytics/recent-hits.ts`, both wired into `createApp()` in
`src/server/app.ts`.

## 1) Endpoint Registry
| Endpoint ID | Method | Path | Purpose | Auth Profile | Rate Limit Profile |
|---|---|---|---|---|---|
| `ANALYTICS_INGEST` | `POST` | `/_analytics/e` | Public first-party beacon ingest — accepts a page-view or custom event hit | `AUTH_NONE` | `RATE_LIMIT_NONE` |
| `ANALYTICS_RECENT_HITS` | `GET` | `/api/admin/v1/workspaces/:workspaceId/analytics/recent-hits` | Admin read of the most recent in-memory buffered hits | `AUTH_ADMIN_SESSION` | `RATE_LIMIT_NONE` |

## 2) Authentication and Authorization Profiles
| Profile ID | Auth Required | Credential Type | Required Scopes | Permitted Roles | Notes |
|---|---|---|---|---|---|
| `AUTH_NONE` | `false` | none | none | any (anonymous visitor) | Intentional by design (ADR-035 §5) — a public, unauthenticated, cookie-less beacon. Guarded instead by workspace resolution + per-site policy checks inside `ingestHit`, not by auth. |
| `AUTH_ADMIN_SESSION` | `true` | `tovu_session` HttpOnly cookie, validated by `requireAdminSession` | none (no per-action permission scope) | any authenticated admin session | **As-built, not as-designed:** ADR-035 §6 specifies an `admin.analytics.view` permission gate; the shipped route performs no `authorize()` call and no permission scope of any kind beyond the blanket `/api/admin` session check every admin route sits behind. See `feature.spec.md` Known Deviations item 2. |

## 3) Rate Limit Profiles
| Profile ID | Window Seconds | Max Requests | Burst Allowance | Keyed By (`userId|apiKey|ip|tenantId`) | Notes |
|---|---:|---:|---:|---|---|
| `RATE_LIMIT_NONE` | — | — | — | — | No rate limiter is wired onto either analytics route today. ADR-035 §5 names per-workspace rate-limiting on the ingest beacon as a required guard alongside host resolution and PII rejection, but it is not implemented — `src/server/middleware/rate-limit.ts`'s `createRateLimiter`/`LOGIN_STRICT` machinery exists and is used for the login route, but nothing analytics-specific calls it. |

## 4) Request Contracts

### Endpoint: `ANALYTICS_INGEST` (`POST /_analytics/e`)
- Path Params:
```yaml
{}
```
- Query Params:
```yaml
{}
```
- Headers:
```yaml
Content-Type: "application/json"
User-Agent: "<consumed transiently for device/browser/os classification, then discarded>"
Accept-Language: "<consumed transiently as an advisory locale hint, then discarded>"
```
- Body (all fields defensively coerced server-side; this is an untrusted anonymous body):
```yaml
host:
  type: string
  maxLength: 253
  required: false
  default: "<request hostname>"
  notes: "Falls back to req.hostname when absent/blank."
path:
  type: string
  maxLength: 2048
  required: false
  default: ""
referrer:
  type: string
  maxLength: 2048
  required: false
  default: null
  notes: "Non-string input coerces to null, not an empty string."
kind:
  type: string
  enum: [pageview, event]
  required: false
  default: pageview
  notes: "Any value other than the literal string 'event' becomes 'pageview'."
eventName:
  type: string
  maxLength: 200
  required: false
  notes: "Only read when kind === 'event'."
eventProps:
  type: object
  required: false
  notes: "Must be a plain JSON object (not an array, not null) or it is discarded as undefined before validation. Bounded/PII-checked server-side per behavior.spec.md §4."
dnt:
  type: boolean
  required: false
  default: false
  notes: "Only `true` (strict boolean) is honored; any other value coerces to false."
gpc:
  type: boolean
  required: false
  default: false
  notes: "Same strict-boolean coercion as dnt."
```

### Endpoint: `ANALYTICS_RECENT_HITS` (`GET /api/admin/v1/workspaces/:workspaceId/analytics/recent-hits`)
- Path Params:
```yaml
workspaceId:
  type: string
  required: true
  notes: "Must exactly match the single deployed workspace id (routeDeps.workspaceId); any other value is a 404, not a scoping filter over multiple workspaces (single-workspace v1)."
```
- Query Params:
```yaml
limit:
  type: string
  required: false
  notes: "Parsed as a number; non-numeric/blank input is ignored (falls back to the sink default of 50). Effective value is clamped to [1, 500] regardless of what is requested — see behavior.spec.md §4."
```
- Headers:
```yaml
Cookie: "tovu_session=<HttpOnly session cookie>"
```

## 5) Response Contracts

### Success Responses
| Endpoint ID | HTTP Status | Body Contract | Notes |
|---|---:|---|---|
| `ANALYTICS_INGEST` | `204` | *(empty body)* | Always `204`, regardless of accept/reject outcome or internal error — see INV-03. |
| `ANALYTICS_RECENT_HITS` | `200` | `RecentHitsResponse` | Returns 0 to 500 hits, newest-first. |

### Error Responses
| Endpoint ID | HTTP Status | Body Contract | Notes |
|---|---:|---|---|
| `ANALYTICS_RECENT_HITS` | `404` | `WorkspaceNotFoundResponse` | Only error path this route has; see errors.spec.md. |

### Contract Definitions
```yaml
AdminAnalyticsHit:
  occurredAt: { type: string, format: date-time }
  kind: { type: string, enum: [pageview, event] }
  path: { type: string }
  referrerHost: { type: string, nullable: true }
  deviceClass: { type: string, enum: [desktop, mobile, tablet, bot, unknown] }
  browserFamily: { type: string, nullable: true }
  eventName: { type: string, nullable: true }

RecentHitsResponse:
  hits: { type: array, items: { $ref: AdminAnalyticsHit } }

WorkspaceNotFoundResponse:
  error: { type: string, const: "workspace was not found" }
```

Note: `AdminAnalyticsHit` is a deliberately narrow projection of the internal
`NormalizedHit` type — it omits `workspaceId`, `utm`, `country`, `region`, `visitorHash`,
`sessionId`, and `eventProps` by construction (`toAdminAnalyticsHitResponse` in
`recent-hits.ts`), not by accidental under-fetching.

## 6) Error Mapping
Reference canonical codes in `errors.spec.md`.

| Endpoint ID | HTTP Status | Error Codes |
|---|---:|---|
| `ANALYTICS_INGEST` | `204` (always) | N/A — this endpoint has no distinguishable error response; see errors.spec.md §Ownership for why. |
| `ANALYTICS_RECENT_HITS` | `404` | `ANALYTICS_WORKSPACE_NOT_FOUND` |
| `ANALYTICS_RECENT_HITS` | `401` | `UNAUTHENTICATED` (produced upstream by `requireAdminSession`, not by this route's own code) |

## 7) Contract Acceptance Checklist
- [x] Every endpoint in Section 1 has request and response contracts.
- [x] Every endpoint has auth and rate-limit profiles (both documented as `NONE` where that
      is the honest as-built state, not a placeholder).
- [x] Every error code used here exists in `errors.spec.md`.
- [x] Names and enums align with `state.spec.md` and `ui.spec.md`.
