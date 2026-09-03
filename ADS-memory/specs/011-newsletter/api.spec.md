# API Contract Spec: newsletter

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/api.spec.md`

- Spec ID: `SPEC-011`
- Feature: `FEAT-011-newsletter`
- Version: `1.0.0`
- Content Hash: `anchored in feature.spec.md`
- Last Edited: `2026-07-13T00:00:00Z`

## Purpose
This file is the source of truth for API behavior for this feature, independent of
implementation language. Routes follow the existing admin-route convention in this repo
(`src/server/routes/admin/menus/*.ts`, `src/server/routes/admin/members/*.ts`): Express
handlers, workspace scoped by path param, principal resolved from the authenticated
dev-session (`getAuthedPrincipal`), permission checked directly via `deps.authorize()` — not
a Bearer-JWT profile, because this repo has no bearer-token auth layer yet (Constitution
Art. VI standing exception). Confirm/unsubscribe endpoints are the one deliberate exception:
they are unauthenticated by design (no session, no login) and are described separately in
§ 1a.

## 1) Endpoint Registry — Admin (session-gated)
| Endpoint ID | Method | Path | Purpose | Auth Profile | Rate Limit Profile |
|---|---|---|---|---|---|
| `LIST_CAMPAIGNS` | `GET` | `/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns` | List campaigns, optionally filtered by status | `ADMIN_SESSION_READ` | `READ_STANDARD` |
| `GET_CAMPAIGN` | `GET` | `/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id` | Fetch a single campaign | `ADMIN_SESSION_READ` | `READ_STANDARD` |
| `CREATE_CAMPAIGN` | `POST` | `/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns` | Create a draft campaign | `ADMIN_SESSION_COMPOSE` | `WRITE_STANDARD` |
| `UPDATE_CAMPAIGN` | `PATCH` | `/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id` | Update editorial fields while `draft`/`scheduled` | `ADMIN_SESSION_COMPOSE` | `WRITE_STANDARD` |
| `CANCEL_CAMPAIGN` | `POST` | `/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/cancel` | Cancel a `draft`/`scheduled` campaign | `ADMIN_SESSION_COMPOSE` | `WRITE_STANDARD` |
| `SCHEDULE_CAMPAIGN` | `POST` | `/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/schedule` | `draft` → `scheduled` | `ADMIN_SESSION_SCHEDULE` | `WRITE_STANDARD` |
| `SEND_CAMPAIGN` | `POST` | `/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/send` | Authorize a full-audience send (Launch Readiness Gate applies) | `ADMIN_SESSION_SEND` | `WRITE_STANDARD` |
| `SEND_TEST_CAMPAIGN` | `POST` | `/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/send-test` | Send to operator-supplied test addresses only | `ADMIN_SESSION_SEND_TEST` | `WRITE_STANDARD` |
| `PAUSE_CAMPAIGN` | `POST` | `/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/pause` | Pause a `sending` campaign | `ADMIN_SESSION_SEND` | `WRITE_STANDARD` |
| `RESUME_CAMPAIGN` | `POST` | `/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/resume` | Resume a `paused` campaign | `ADMIN_SESSION_SEND` | `WRITE_STANDARD` |
| `LIST_LISTS` | `GET` | `/api/admin/v1/workspaces/:workspaceId/newsletter/lists` | List named audiences | `ADMIN_SESSION_READ` | `READ_STANDARD` |
| `CREATE_LIST` | `POST` | `/api/admin/v1/workspaces/:workspaceId/newsletter/lists` | Create a named list | `ADMIN_SESSION_LIST_MANAGE` | `WRITE_STANDARD` |
| `ARCHIVE_LIST` | `POST` | `/api/admin/v1/workspaces/:workspaceId/newsletter/lists/:id/archive` | Archive a non-default list | `ADMIN_SESSION_LIST_MANAGE` | `WRITE_STANDARD` |
| `LIST_SUBSCRIPTIONS` | `GET` | `/api/admin/v1/workspaces/:workspaceId/newsletter/lists/:listId/subscriptions` | List a list's subscriptions | `ADMIN_SESSION_SUBSCRIBER_READ` | `READ_STANDARD` |
| `CREATE_SUBSCRIPTION` | `POST` | `/api/admin/v1/workspaces/:workspaceId/newsletter/lists/:listId/subscriptions` | Add an existing Members principal to a list | `ADMIN_SESSION_SUBSCRIBER_MANAGE` | `WRITE_STANDARD` |
| `REMOVE_SUBSCRIPTION` | `DELETE` | `/api/admin/v1/workspaces/:workspaceId/newsletter/lists/:listId/subscriptions/:id` | Remove (unsubscribe) a subscription | `ADMIN_SESSION_SUBSCRIBER_MANAGE` | `WRITE_STANDARD` |
| `IMPORT_SUBSCRIPTIONS` | `POST` | `/api/admin/v1/workspaces/:workspaceId/newsletter/lists/:listId/subscriptions/import` | Batch-add subscriptions through the standard chokepoint (REQ-31) | `ADMIN_SESSION_SUBSCRIBER_MANAGE` | `WRITE_STANDARD` |
| `RESEND_CONFIRMATION` | `POST` | `/api/admin/v1/workspaces/:workspaceId/newsletter/subscriptions/:id/resend-confirmation` | Mint a fresh confirm token, invalidate the previous one | `ADMIN_SESSION_SUBSCRIBER_MANAGE` | `WRITE_STANDARD` |
| `LIST_SEND_LOG` | `GET` | `/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/sends` | Read a campaign's per-recipient send-log rows (read-only, post-erasure-anonymized where applicable) | `ADMIN_SESSION_SUBSCRIBER_READ` | `READ_STANDARD` |

## 1a) Endpoint Registry — Public, cookie-less, no-login (subscriber-facing)
| Endpoint ID | Method | Path | Purpose | Auth Profile | Rate Limit Profile |
|---|---|---|---|---|---|
| `CONFIRM_SUBSCRIPTION` | `GET` | `/newsletter/confirm?token=...` | Consume a confirm token; invokes `members.consent.request`/`.confirm` | `PUBLIC_TOKEN` | `PUBLIC_TOKEN_STANDARD` |
| `UNSUBSCRIBE` | `GET`, `POST` | `/newsletter/unsubscribe?token=...` | One-click unsubscribe; `POST` supports RFC 8058 `List-Unsubscribe-Post` | `PUBLIC_TOKEN` | `PUBLIC_TOKEN_STANDARD` |

Note: these two endpoints live on the same cookie-less, no-admin-authority origin lineage as
ADR-020/025/027's isolation pattern, generalized by ADR-034 §8 to outbound-email callbacks.
They never accept or set a session cookie and never require a login. Their `token` query
param is the only credential, verified server-side against `KeyringPort.derive()` (unsubscribe)
or the stored hashed confirm token (confirm) — never trusted as a client-supplied claim.

Note: the actual outbound email send (the SMTP/API call `MailerPort.send()` makes) is not a
distinct endpoint here — it is an internal effect of `SEND_CAMPAIGN`/`SEND_TEST_CAMPAIGN`
and the outbox worker's fan-out (see `orchestrator.spec.md`), not an admin-facing HTTP
contract of this file. Likewise, the provider bounce/complaint feedback webhook is owned by
`lib/mail` (ADR-037 §3/F1), not this feature — Newsletter only consumes the resulting
`mail.feedback.received` event (REQ-22); it does not register its own webhook route.

## 2) Authentication and Authorization Profiles
| Profile ID | Auth Required | Credential Type | Required Scopes | Permitted Roles | Notes |
|---|---|---|---|---|---|
| `ADMIN_SESSION_READ` | `true` | Dev-auth session (`getAuthedPrincipal`) | `admin.newsletter.read` | any principal granted it | |
| `ADMIN_SESSION_COMPOSE` | `true` | Dev-auth session | `admin.newsletter.campaign.compose` | any principal granted it | |
| `ADMIN_SESSION_SCHEDULE` | `true` | Dev-auth session | `admin.newsletter.campaign.schedule` | any principal granted it | |
| `ADMIN_SESSION_SEND` | `true` | Dev-auth session | `admin.newsletter.campaign.send` | any principal granted it | Held separately from compose (ADR-034 §5) — real, non-revertible outbound mail. |
| `ADMIN_SESSION_SEND_TEST` | `true` | Dev-auth session | `admin.newsletter.campaign.send_test` | any principal granted it | Test sends never touch the subscriber list (REQ-20). |
| `ADMIN_SESSION_LIST_MANAGE` | `true` | Dev-auth session | `admin.newsletter.list.manage` | any principal granted it | |
| `ADMIN_SESSION_SUBSCRIBER_READ` | `true` | Dev-auth session | `admin.newsletter.subscriber.read` | any principal granted it | Send-log rows are PII-adjacent; read is gated separately from write. |
| `ADMIN_SESSION_SUBSCRIBER_MANAGE` | `true` | Dev-auth session | `admin.newsletter.subscriber.manage` | any principal granted it | PII-sensitive per ADR-034 §5. |
| `PUBLIC_TOKEN` | `false` (no session) | Signed/derived token in the query string | none (no operator RBAC applies) | any bearer of a currently-valid token | Fails closed on any signature/expiry/revision mismatch (§ errors.spec.md). |

Matches `src/server/routes/admin/menus/*.ts`'s pattern: `deps.authorize({ principalId,
permission, workspaceId, entityType: 'newsletter_campaign' | 'newsletter_list' |
'newsletter_subscription' })` checked directly in-route, not via the SPEC-001 command
gateway — mirroring how Redirects (SPEC-009) and Members handle direct feature calls.

## 3) Rate Limit Profiles
| Profile ID | Window Seconds | Max Requests | Burst Allowance | Keyed By (`userId|apiKey|ip|tenantId`) | Notes |
|---|---:|---:|---:|---|---|
| `WRITE_STANDARD` | `60` | `30` | `5` | `userId` | No rate-limit middleware exists yet in this repo (same gap as every other admin route); documents intended policy. |
| `READ_STANDARD` | `60` | `300` | `50` | `userId` | Same caveat. |
| `PUBLIC_TOKEN_STANDARD` | `60` | `20` | `5` | `ip` | Public, unauthenticated endpoints are the more sensitive surface here (token-guessing/enumeration); rate limiting is intended-but-unenforced today, same repo-wide gap — flagged, not silently assumed safe. |

## 4) Request Contracts

### Endpoint: `CREATE_CAMPAIGN` (`POST /api/admin/v1/workspaces/:workspaceId/newsletter/campaigns`)
- Path Params:
```yaml
workspaceId:
  type: string
  format: uuid
  required: true
```
- Body:
```yaml
subject:
  type: string
  minLength: 1
  maxLength: 998   # RFC 5322 unfolded header line practical cap
  required: true
preheader:
  type: string
  maxLength: 300
  required: false
fromName:
  type: string
  minLength: 1
  maxLength: 200
  required: true
fromEmail:
  type: string
  format: email
  required: true
replyTo:
  type: string
  format: email
  required: true
listId:
  type: string
  format: uuid
  required: true
bodyJson:
  type: object
  required: true
  # Opaque TipTap document; validated by the editorial content-type schema this
  # spec depends on but does not itself define (see Dependencies table).
```

### Endpoint: `UPDATE_CAMPAIGN` (`PATCH /api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id`)
- Path Params: `workspaceId`, `id` (both `uuid`, required).
- Body: all fields from `CREATE_CAMPAIGN`'s body, each optional, plus:
```yaml
expectedVersion:
  type: number
  required: false
  # EC-06 optimistic concurrency. Omitted = no version check (backward compatible with callers
  # that predate this field). When present, must be a non-negative integer; a mismatch against
  # the campaign's current version is rejected with NEWSLETTER_CONFLICT (409) rather than
  # silently overwriting a concurrent edit.
```
  Rejected with `NEWSLETTER_CAMPAIGN_NOT_EDITABLE` if the campaign's `status` is not
  `draft`/`scheduled`.

### Endpoint: `SCHEDULE_CAMPAIGN` (`POST /api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/schedule`)
- Path Params: `workspaceId`, `id`.
- Body:
```yaml
scheduledAt:
  type: string
  format: date-time
  required: false
  # absent/null = send as soon as the pipeline picks it up
```

### Endpoint: `SEND_CAMPAIGN` (`POST /api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/send`)
- Path Params: `workspaceId`, `id`. No body — the Launch Readiness Gate (REQ-21) is
  evaluated server-side against workspace state, never a client-supplied override.

### Endpoint: `SEND_TEST_CAMPAIGN` (`POST /api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/send-test`)
- Path Params: `workspaceId`, `id`.
- Body:
```yaml
testAddresses:
  type: array
  minItems: 1
  maxItems: 10
  required: true
  items:
    type: string
    format: email
```

### Endpoint: `CREATE_LIST` (`POST /api/admin/v1/workspaces/:workspaceId/newsletter/lists`)
- Body:
```yaml
name:
  type: string
  minLength: 1
  maxLength: 200
  required: true
slug:
  type: string
  minLength: 1
  maxLength: 200
  required: true
```

### Endpoint: `CREATE_SUBSCRIPTION` (`POST /api/admin/v1/workspaces/:workspaceId/newsletter/lists/:listId/subscriptions`)
- Path Params: `workspaceId`, `listId`.
- Body:
```yaml
subscriberId:
  type: string
  format: uuid
  required: true
  # Must resolve to an existing Members principal (REQ-10) — Newsletter never
  # creates a new identity here.
source:
  type: string
  enum: [admin, import, api]
  default: admin
  required: false
```

### Endpoint: `IMPORT_SUBSCRIPTIONS` (`POST /api/admin/v1/workspaces/:workspaceId/newsletter/lists/:listId/subscriptions/import`)
- Body:
```yaml
subscribers:
  type: array
  minItems: 1
  maxItems: 500
  required: true
  items:
    subscriberId: { type: string, format: uuid, required: true }
```

### Endpoint: `CONFIRM_SUBSCRIPTION` (`GET /newsletter/confirm?token=...`)
- Query Params:
```yaml
token:
  type: string
  minLength: 1
  required: true
```

### Endpoint: `UNSUBSCRIBE` (`GET|POST /newsletter/unsubscribe?token=...`)
- Query Params: same `token` shape as `CONFIRM_SUBSCRIPTION`.
- Body (`POST` only, RFC 8058 one-click):
```yaml
List-Unsubscribe:
  type: string
  enum: ["List-Unsubscribe=One-Click"]
  required: false
  # Standard one-click unsubscribe body; GET with the same token is equally valid.
```

## 5) Response Contracts
### Success Responses
| Endpoint ID | HTTP Status | Body Contract | Notes |
|---|---:|---|---|
| `LIST_CAMPAIGNS` | `200` | `CampaignListResponse` | |
| `GET_CAMPAIGN` | `200` | `CampaignResponse` | |
| `CREATE_CAMPAIGN` | `201` | `CampaignResponse` | |
| `UPDATE_CAMPAIGN` | `200` | `CampaignResponse` | |
| `CANCEL_CAMPAIGN` | `200` | `CampaignResponse` | Returns the canceled campaign, not `204`, so the UI shows final state without a re-fetch |
| `SCHEDULE_CAMPAIGN` | `200` | `CampaignResponse` | |
| `SEND_CAMPAIGN` | `202` | `CampaignResponse` | Accepted — sending is async (outbox-driven); campaign returns with `status: 'sending'`, not a synchronous completion |
| `SEND_TEST_CAMPAIGN` | `200` | `SendTestResponse` | Test sends are synchronous-enough to report per-address outcome directly |
| `PAUSE_CAMPAIGN` | `200` | `CampaignResponse` | |
| `RESUME_CAMPAIGN` | `200` | `CampaignResponse` | |
| `LIST_LISTS` | `200` | `NewsletterListListResponse` | |
| `CREATE_LIST` | `201` | `NewsletterListResponse` | |
| `ARCHIVE_LIST` | `200` | `NewsletterListResponse` | |
| `LIST_SUBSCRIPTIONS` | `200` | `SubscriptionListResponse` | |
| `CREATE_SUBSCRIPTION` | `201` | `SubscriptionResponse` | `status: 'pending'`; a confirmation email is sent as a side effect |
| `REMOVE_SUBSCRIPTION` | `200` | `SubscriptionResponse` | Returns the `unsubscribed` subscription, not `204` |
| `IMPORT_SUBSCRIPTIONS` | `207` | `SubscriptionImportResponse` | Multi-Status: some rows may succeed while others fail (REQ-31) |
| `RESEND_CONFIRMATION` | `200` | `{ delivered: true }` | Constant-shaped response regardless of internal state (OQ-01 anti-enumeration posture) |
| `LIST_SEND_LOG` | `200` | `SendLogListResponse` | |
| `CONFIRM_SUBSCRIPTION` | `200` | HTML confirmation page (not JSON — a human clicks this link) | |
| `UNSUBSCRIBE` | `200` | HTML unsubscribe-confirmed page (not JSON) | Idempotent on repeat (REQ-15) |

### Contract Definitions
```yaml
Campaign:
  id: { type: string, format: uuid }
  workspaceId: { type: string, format: uuid }
  status: { type: string, enum: [draft, scheduled, sending, sent, paused, canceled, failed] }
  subject: { type: string }
  preheader: { type: string, nullable: true }
  fromName: { type: string }
  fromEmail: { type: string, format: email }
  replyTo: { type: string, format: email }
  listId: { type: string, format: uuid }
  scheduledAt: { type: string, format: date-time, nullable: true }
  sendStartedAt: { type: string, format: date-time, nullable: true }
  audienceSnapshotId: { type: string, format: uuid, nullable: true }
  counters: { $ref: CampaignCounters }
  createdAt: { type: string, format: date-time }
  updatedAt: { type: string, format: date-time }
  version: { type: integer }

CampaignCounters:
  recipients: { type: integer }
  delivered: { type: integer }
  failed: { type: integer }
  bounced: { type: integer }
  complained: { type: integer }
  unsubscribed: { type: integer }

CampaignResponse:
  data: { $ref: Campaign }

CampaignListResponse:
  data: { type: array, items: { $ref: Campaign } }

SendTestResponse:
  data:
    results:
      type: array
      items:
        address: { type: string, format: email }
        ok: { type: boolean }
        errorCode: { type: string, nullable: true }

NewsletterList:
  id: { type: string, format: uuid }
  workspaceId: { type: string, format: uuid }
  name: { type: string }
  slug: { type: string }
  isDefault: { type: boolean }
  createdAt: { type: string, format: date-time }
  updatedAt: { type: string, format: date-time }

NewsletterListResponse:
  data: { $ref: NewsletterList }

NewsletterListListResponse:
  data: { type: array, items: { $ref: NewsletterList } }

Subscription:
  id: { type: string, format: uuid }
  workspaceId: { type: string, format: uuid }
  listId: { type: string, format: uuid }
  subscriberId: { type: string, format: uuid }
  status: { type: string, enum: [pending, subscribed, unsubscribed, bounced, complained] }
  source: { type: string, enum: [import, signup_form, admin, api] }
  subscribedAt: { type: string, format: date-time, nullable: true }
  unsubscribedAt: { type: string, format: date-time, nullable: true }
  createdAt: { type: string, format: date-time }
  updatedAt: { type: string, format: date-time }

SubscriptionResponse:
  data: { $ref: Subscription }

SubscriptionListResponse:
  data: { type: array, items: { $ref: Subscription } }

SubscriptionImportResponse:
  created: { type: array, items: { $ref: Subscription } }
  failed:
    type: array
    items:
      index: { type: integer }
      code: { type: string }
      message: { type: string }

SendLogRow:
  id: { type: string, format: uuid }
  campaignId: { type: string, format: uuid }
  subscriberId: { type: string, format: uuid }
  # anonymized ("[erased]") after a principal.erasure.requested handler run (REQ-27)
  recipientEmail: { type: string }
  status: { type: string, enum: [pending, sent, delivered, failed, bounced, complained] }
  attempts: { type: integer }
  lastError: { type: string, nullable: true }
  createdAt: { type: string, format: date-time }
  updatedAt: { type: string, format: date-time }

SendLogListResponse:
  data: { type: array, items: { $ref: SendLogRow } }
```

## 6) Error Mapping
Reference canonical codes in `errors.spec.md`.

| Endpoint ID | HTTP Status | Error Codes |
|---|---:|---|
| `CREATE_CAMPAIGN` | `400` | `VALIDATION_ERROR, NEWSLETTER_VALIDATION_ERROR` |
| `CREATE_CAMPAIGN` | `403` | `FORBIDDEN` |
| `GET_CAMPAIGN` | `404` | `NEWSLETTER_CAMPAIGN_NOT_FOUND` |
| `GET_CAMPAIGN` | `403` | `FORBIDDEN` |
| `UPDATE_CAMPAIGN` | `400` | `VALIDATION_ERROR, NEWSLETTER_VALIDATION_ERROR` |
| `UPDATE_CAMPAIGN` | `403` | `FORBIDDEN` |
| `UPDATE_CAMPAIGN` | `404` | `NEWSLETTER_CAMPAIGN_NOT_FOUND` |
| `UPDATE_CAMPAIGN` | `409` | `NEWSLETTER_CAMPAIGN_NOT_EDITABLE, NEWSLETTER_CONFLICT` |
| `CANCEL_CAMPAIGN` | `403` | `FORBIDDEN` |
| `CANCEL_CAMPAIGN` | `404` | `NEWSLETTER_CAMPAIGN_NOT_FOUND` |
| `CANCEL_CAMPAIGN` | `409` | `NEWSLETTER_CAMPAIGN_NOT_EDITABLE` |
| `SCHEDULE_CAMPAIGN` | `400` | `NEWSLETTER_VALIDATION_ERROR` |
| `SCHEDULE_CAMPAIGN` | `403` | `FORBIDDEN` |
| `SCHEDULE_CAMPAIGN` | `404` | `NEWSLETTER_CAMPAIGN_NOT_FOUND` |
| `SEND_CAMPAIGN` | `403` | `FORBIDDEN` |
| `SEND_CAMPAIGN` | `404` | `NEWSLETTER_CAMPAIGN_NOT_FOUND` |
| `SEND_CAMPAIGN` | `409` | `NEWSLETTER_LAUNCH_GATE_BLOCKED, NEWSLETTER_CAMPAIGN_NOT_EDITABLE` |
| `SEND_TEST_CAMPAIGN` | `400` | `VALIDATION_ERROR` |
| `SEND_TEST_CAMPAIGN` | `403` | `FORBIDDEN` |
| `SEND_TEST_CAMPAIGN` | `409` | `NEWSLETTER_LAUNCH_GATE_BLOCKED` (precondition (c)/(d) only, per REQ-21) |
| `PAUSE_CAMPAIGN` / `RESUME_CAMPAIGN` | `403` | `FORBIDDEN` |
| `PAUSE_CAMPAIGN` / `RESUME_CAMPAIGN` | `404` | `NEWSLETTER_CAMPAIGN_NOT_FOUND` |
| `PAUSE_CAMPAIGN` / `RESUME_CAMPAIGN` | `409` | `NEWSLETTER_CAMPAIGN_NOT_EDITABLE` |
| `CREATE_LIST` | `403` | `FORBIDDEN` |
| `CREATE_LIST` | `409` | `NEWSLETTER_CONFLICT` |
| `ARCHIVE_LIST` | `403` | `FORBIDDEN` |
| `ARCHIVE_LIST` | `404` | `NEWSLETTER_LIST_NOT_FOUND` |
| `ARCHIVE_LIST` | `409` | `NEWSLETTER_DEFAULT_LIST_PROTECTED` |
| `CREATE_SUBSCRIPTION` | `400` | `NEWSLETTER_SUBSCRIBER_NOT_FOUND, VALIDATION_ERROR` |
| `CREATE_SUBSCRIPTION` | `403` | `FORBIDDEN` |
| `CREATE_SUBSCRIPTION` | `404` | `NEWSLETTER_LIST_NOT_FOUND` |
| `REMOVE_SUBSCRIPTION` | `403` | `FORBIDDEN` |
| `REMOVE_SUBSCRIPTION` | `404` | `NEWSLETTER_SUBSCRIPTION_NOT_FOUND` |
| `IMPORT_SUBSCRIPTIONS` | `403` | `FORBIDDEN` |
| `IMPORT_SUBSCRIPTIONS` | `400` | `VALIDATION_ERROR` (malformed batch shape only — per-row failures surface in the `207` body) |
| `RESEND_CONFIRMATION` | `403` | `FORBIDDEN` |
| `RESEND_CONFIRMATION` | `404` | `NEWSLETTER_SUBSCRIPTION_NOT_FOUND` |
| `LIST_SEND_LOG` | `403` | `FORBIDDEN` |
| `LIST_SEND_LOG` | `404` | `NEWSLETTER_CAMPAIGN_NOT_FOUND` |
| `CONFIRM_SUBSCRIPTION` | `400` (rendered as an HTML error page) | `NEWSLETTER_CONFIRM_TOKEN_INVALID` |
| `UNSUBSCRIBE` | `400` (rendered as an HTML error page) | `NEWSLETTER_UNSUBSCRIBE_TOKEN_INVALID` |
| all endpoints | `500` | `INTERNAL_ERROR` |

## 7) Contract Acceptance Checklist
- [x] Every endpoint in Section 1/1a has request and response contracts.
- [x] Every endpoint has auth and rate-limit profiles.
- [x] Every error code used here exists in `errors.spec.md`.
- [x] Names and enums align with `state.spec.md` and `ui.spec.md`.
