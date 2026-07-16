# Error Code Registry Spec: content-admin-core-contract

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/errors.spec.md`

- Spec ID: `SPEC-016`
- Feature: `FEAT-016-content-admin-core-contract`
- Version: `1.4.0`
- Content Hash: `sha256:eade503dc1cc72dddad16eb54f3098dada29954493b6d8f964ac51ca0e06194f`
- Last Edited: `2026-07-15T05:00:00Z`

## Purpose

Canonical error registry for the gated-mutation gateway and watermark contract. Each dependent
domain spec's own `errors.spec.md` may add domain-specific codes but must reuse these codes for
the gateway/watermark failure conditions rather than defining parallel ones.

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

| Code | Category | Layer | HTTP Status | Retryable | User Message Guidance |
|---|---|---|---:|---|---|
| `PLAN_STALE` | conflict | `api` | 409 | yes (re-plan then re-confirm) | "This plan is out of date. Review the current state and confirm again." |
| `TOKEN_EXPIRED` | conflict | `api` | 410 | yes (re-confirm) | "Your confirmation has expired. Please confirm again." |
| `TOKEN_ALREADY_REDEEMED` | conflict | `api` | 409 | no | "This confirmation has already been used." |
| `FORBIDDEN` | authz | `api` | 403 | no | "You do not have permission to perform this action." |
| `UNAUTHENTICATED` | auth | `api` | 401 | maybe | "Please sign in again." |
| `VALIDATION_ERROR` | validation | `api` | 400 | no | "Please correct the highlighted fields." |
| `RATE_LIMIT_EXCEEDED` | throttling | `api` | 429 | yes | "Too many requests. Try again shortly." |
| `WATERMARK_BASELINE_UNAVAILABLE` | integrity | `integration` | 200 (disclosure renders degraded, not an HTTP failure) | n/a | "The exact loss window could not be computed; showing a lower-bound estimate." |
| `INTERNAL_ERROR` | internal | `api` | 500 | maybe | "Unexpected server error." |

## 3) Per-Code Details Schema

```yaml
PLAN_STALE:
  details:
    planId: string
    expectedPlanHash: string
    recomputedPlanHash: string

TOKEN_ALREADY_REDEEMED:
  details:
    redeemedAt: string   # ISO-8601 UTC

FORBIDDEN:
  details:
    permission: string
    reasonCode: enum[AUTHORIZE_DENIED, ACTOR_CLASS_MISMATCH]
                     # closed, stable discriminator between FORBIDDEN's two producers — this is the
                     # field any AC/test asserts on deterministically (REQ-13; see Ownership and
                     # Source Rules below). AUTHORIZE_DENIED = an ordinary authorize() denial (at
                     # confirm() or execute()). ACTOR_CLASS_MISMATCH = execute()'s actor-class
                     # redemption check (REQ-13) rejected the redemption after authorize() already
                     # passed.
    reason: string   # human-readable detail message; free text, illustrative only, e.g.
                     # "principal is not kind=user", "delegator no longer grants this permission",
                     # or "actor-class redemption mismatch: token confirmed by a different user" —
                     # never the field an AC asserts on exactly; reasonCode is the deterministic one

WATERMARK_BASELINE_UNAVAILABLE:
  details:
    coveredCategories: array of string   # categories that ARE computable, even though this one is not
    reason: string                        # e.g. "content.db failed to open at last boot"
```

## 4) Ownership and Source Rules

| Code | Produced By | Surfaced By | Notes |
|---|---|---|---|
| `PLAN_STALE` | Gateway `execute()` | dependent domain's UI (Storage migrate ceremony, Recovery restore ceremony) | Never surfaced silently — REQ-12 requires this to block the mutation entirely |
| `TOKEN_EXPIRED` / `TOKEN_ALREADY_REDEEMED` | Gateway `execute()` | dependent domain's UI | Distinguishable so the UI can offer "re-confirm" vs. "already handled" messaging. `TOKEN_EXPIRED` is also returned for a `confirmationToken` string that was never minted at all (unknown/forged) — REQ-11, AC-35 — to avoid disclosing whether that string was ever issued |
| `FORBIDDEN` | (1) `authorize()` via the Gateway (`confirm()` or `execute()`) — reported with `details.reasonCode: 'AUTHORIZE_DENIED'`; (2) `execute()`'s actor-class redemption check (REQ-13) when a principal has passed `authorize()` but fails the actor-class rule (AC-18, AC-19) — reported with `details.reasonCode: 'ACTOR_CLASS_MISMATCH'` | dependent domain's UI + agent tool caller | Produced identically whether the caller is human or agent — same vocabulary, per ADR-021's consequences. Both producers use the same code and `details` shape; `details.reasonCode` is the closed, deterministic discriminator between the two producers; `details.reason` remains a free-text human-readable message not asserted on by any AC |
| `WATERMARK_BASELINE_UNAVAILABLE` | the discarded-write-window disclosure computation (REQ-05) | Storage Timeline and Recovery Step 2 disclosure (both domain-owned) | Not an HTTP error — a degraded-but-honest disclosure state, never a silent zero |

## 5) Acceptance Checklist
- [x] Every error emitted by this core contract appears in Section 2.
- [x] Every code has clear retry behavior.
- [x] Every code used in `api.spec.md` appears here.
- [x] User-safe message guidance is provided.
