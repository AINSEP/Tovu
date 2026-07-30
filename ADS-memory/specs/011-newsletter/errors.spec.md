# Error Code Registry Spec: newsletter

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/errors.spec.md`

- Spec ID: `SPEC-011`
- Feature: `FEAT-011-newsletter`
- Version: `1.0.0`
- Content Hash: `anchored in feature.spec.md`
- Last Edited: `2026-07-13T00:00:00Z`

## Purpose
Canonical error registry for the `newsletter` feature, independent of stack/language. Codes
are net-new for this feature — no `NewsletterXxxError` exception classes exist in
`src/newsletter/types.ts` yet (it currently declares only the port/type surface, no error
classes), so this spec both names the vocabulary and directs the Programmer phase to add the
corresponding classes, mirroring `src/members/types.ts`'s `MemberAuthError`/
`MemberValidationError`/`MemberConflictError`/`MemberNotFoundError` pattern.

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
| `NEWSLETTER_CAMPAIGN_NOT_FOUND` | resource | `api` | 404 | no | "Campaign not found." |
| `NEWSLETTER_LIST_NOT_FOUND` | resource | `api` | 404 | no | "List not found." |
| `NEWSLETTER_SUBSCRIPTION_NOT_FOUND` | resource | `api` | 404 | no | "Subscription not found." |
| `NEWSLETTER_SUBSCRIBER_NOT_FOUND` | resource / validation | `api` | 400 | no | "No member exists with that id." |
| `NEWSLETTER_VALIDATION_ERROR` | validation | `api` | 400 | no | "Please correct the highlighted fields." |
| `NEWSLETTER_CAMPAIGN_NOT_EDITABLE` | state conflict | `api` | 409 | no | "This campaign can no longer be edited in its current state." |
| `NEWSLETTER_DEFAULT_LIST_PROTECTED` | state conflict | `api` | 409 | no | "The default list cannot be archived." |
| `NEWSLETTER_CONFLICT` | resource | `api` | 409 | no | "This action conflicts with a concurrent change. Reload and try again." |
| `NEWSLETTER_LAUNCH_GATE_BLOCKED` | integrity / fail-closed | `orchestrator` (surfaced via `api` on `SEND_CAMPAIGN`/`SEND_TEST_CAMPAIGN`) | 409 | maybe (retry once the named precondition is met) | "Sending is not enabled yet: {unmetPreconditions}." |
| `NEWSLETTER_CONFIRM_TOKEN_INVALID` | integrity | `integration` (public, unauthenticated endpoint) | 400 | no (request a fresh confirmation) | "This confirmation link is invalid or has expired." |
| `NEWSLETTER_UNSUBSCRIBE_TOKEN_INVALID` | integrity | `integration` (public, unauthenticated endpoint) | 400 | no | "This unsubscribe link is invalid or has expired." |
| `FORBIDDEN` | authz | `api` | 403 | no | "You do not have permission to manage the newsletter." |
| `VALIDATION_ERROR` | validation | `api` | 400 | no | "Please correct highlighted fields." |
| `INTERNAL_ERROR` | internal | `api` | 500 | maybe | "Unexpected server error." |

## 3) Per-Code Details Schema

```yaml
NEWSLETTER_SUBSCRIBER_NOT_FOUND:
  details:
    subscriberId: string (uuid)

NEWSLETTER_VALIDATION_ERROR:
  details:
    field: string          # e.g. "fromEmail", "subject", "listId"
    reason: string

NEWSLETTER_CAMPAIGN_NOT_EDITABLE:
  details:
    currentStatus: enum[draft, scheduled, sending, sent, paused, canceled, failed]
    attemptedAction: string   # e.g. "update", "cancel", "send"

NEWSLETTER_DEFAULT_LIST_PROTECTED:
  details:
    listId: string (uuid)

NEWSLETTER_CONFLICT:
  details:
    entity: enum[campaign, list, subscription]
    id: string
    expectedVersion: integer
    actualVersion: integer

NEWSLETTER_LAUNCH_GATE_BLOCKED:
  details:
    unmetPreconditions:
      type: array
      items:
        type: string
        enum: [sending_enabled_false, consent_capability_unbound, origin_not_verified, mailer_adapter_not_production]

NEWSLETTER_CONFIRM_TOKEN_INVALID:
  details:
    reason: enum[expired, already_consumed, not_found]

NEWSLETTER_UNSUBSCRIBE_TOKEN_INVALID:
  details:
    reason: enum[consent_revision_mismatch, signature_invalid, expired, not_found]
```

## 4) Ownership and Source Rules
| Code | Produced By | Surfaced By | Notes |
|---|---|---|---|
| `NEWSLETTER_CAMPAIGN_NOT_FOUND` | route handler, campaign lookup | API + UI | |
| `NEWSLETTER_LIST_NOT_FOUND` | route handler, list lookup | API + UI | |
| `NEWSLETTER_SUBSCRIPTION_NOT_FOUND` | route handler, subscription lookup | API + UI | |
| `NEWSLETTER_SUBSCRIBER_NOT_FOUND` | write chokepoint, via the Members directory seam (`SubscriberDirectoryPort.getContact`) | API + UI | REQ-10 |
| `NEWSLETTER_VALIDATION_ERROR` | route-level shape validation / write chokepoint | API + UI | |
| `NEWSLETTER_CAMPAIGN_NOT_EDITABLE` | write chokepoint status-machine guard | API + UI | REQ-04/REQ-05/REQ-18 |
| `NEWSLETTER_DEFAULT_LIST_PROTECTED` | write chokepoint | API + UI | REQ-08 |
| `NEWSLETTER_CONFLICT` | write chokepoint, optimistic-concurrency version check | API + UI | EC-06 |
| `NEWSLETTER_LAUNCH_GATE_BLOCKED` | `NewsletterSendPipeline.authorizeSend` (`orchestrator.spec.md` § 4) | API + UI | REQ-21; never bypassable by a client-supplied override |
| `NEWSLETTER_CONFIRM_TOKEN_INVALID` | `CONSUME_CONFIRMATION_TOKEN` chokepoint action | public HTML error page | REQ-13/EC-02 |
| `NEWSLETTER_UNSUBSCRIBE_TOKEN_INVALID` | `PROCESS_UNSUBSCRIBE` chokepoint action, via `KeyringPort.derive()` re-derivation + comparison | public HTML error page | REQ-14/INV-04; an already-processed unsubscribe is success, not this code (EC-03) |
| `FORBIDDEN` | `authorize()` gateway check | API + UI | REQ-25 |
| `INTERNAL_ERROR` | unhandled exception | API | |

## 5) Acceptance Checklist
- [x] Every error emitted by feature code appears in Section 2.
- [x] Every code has clear retry behavior.
- [x] Every code used in `api.spec.md` appears here.
- [x] User-safe message guidance is provided.
