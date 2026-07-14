# Error Code Registry Spec: redirects

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/errors.spec.md`

- Spec ID: `SPEC-009`
- Feature: `FEAT-009-redirects`
- Version: `1.0.0`
- Content Hash: `anchored in feature.spec.md`
- Last Edited: `2026-07-12T00:00:00Z`

## Purpose
Canonical error registry for the `redirects` feature, independent of stack/language. Codes
map to the exception classes already declared in `src/redirects/types.ts`
(`RedirectNotFoundError`, `RedirectValidationError`, `RedirectConflictError`,
`RedirectLoopError`) plus two codes this spec adds: `REDIRECT_TARGET_NOT_ALLOWED` (the
open-redirect rejection, write and read path) and `LINK_PRESERVATION_UNAVAILABLE` (the
fail-closed rename-abort code, ADR-033 Round-2 fold / ADR-039 §4 amendment 3).

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
| `REDIRECT_NOT_FOUND` | resource | `api` | 404 | no | "Redirect rule not found." |
| `REDIRECT_VALIDATION_ERROR` | validation | `api` | 400 | no | "Please correct the highlighted fields." |
| `REDIRECT_TARGET_NOT_ALLOWED` | validation / security | `api` (write path) and `integration` (read path) | 400 (write) / n/a (read path fails closed to unmatched, no HTTP error body — see `feature.spec.md` REQ-10) | no | "This destination isn't allowed. Add its host to the redirect allowlist first." |
| `REDIRECT_CONFLICT` | resource | `api` | 409 | no | "A rule for this source path already exists." |
| `REDIRECT_LOOP_DETECTED` | validation | `api` | 409 | no | "This rule would create a redirect loop." |
| `LINK_PRESERVATION_UNAVAILABLE` | integrity / fail-closed | `integration` | 409 (on the content rename endpoint, not a Redirects endpoint) | maybe (retry once the capture binding/dependency is restored) | "This rename couldn't be completed because link preservation is temporarily unavailable. Try again shortly." |
| `FORBIDDEN` | authz | `api` | 403 | no | "You do not have permission to manage redirects." |
| `VALIDATION_ERROR` | validation | `api` | 400 | no | "Please correct highlighted fields." |
| `INTERNAL_ERROR` | internal | `api` | 500 | maybe | "Unexpected server error." |

## 3) Per-Code Details Schema

```yaml
REDIRECT_VALIDATION_ERROR:
  details:
    field: string          # e.g. "fromPattern", "matchType", "statusCode"
    reason: string         # e.g. "matchType 'regex' is not enabled in v1"

REDIRECT_TARGET_NOT_ALLOWED:
  details:
    target: string          # the rejected toTarget or fully-interpolated location
    phase: enum[write, read]

REDIRECT_CONFLICT:
  details:
    fromPattern: string
    existingRedirectId: string (ulid)

REDIRECT_LOOP_DETECTED:
  details:
    fromPattern: string
    toTarget: string
    conflictingRedirectId: string (ulid)   # the rule that would complete the cycle

LINK_PRESERVATION_UNAVAILABLE:
  details:
    entryId: string (uuid)
    oldPath: string
    newPath: string
    reason: enum[no_capture_bound, capture_threw]
```

## 4) Ownership and Source Rules
| Code | Produced By | Surfaced By | Notes |
|---|---|---|---|
| `REDIRECT_NOT_FOUND` | `RedirectRepoPort.findById` caller (route handler) | API + UI | |
| `REDIRECT_VALIDATION_ERROR` | `RedirectMatcher.validatePattern` / route-level shape validation | API + UI | Covers `matchType: 'regex'` rejection (REQ-22) |
| `REDIRECT_TARGET_NOT_ALLOWED` (write) | write chokepoint, via `OriginRegistryPort.isAllowedRedirectTarget` | API + UI | REQ-08 |
| `REDIRECT_TARGET_NOT_ALLOWED` (read) | routing-chain phase handler, via `OriginRegistryPort.isAllowedRedirectTarget` | integration only — never returned as an HTTP error body; the request simply falls through to 404/next phase (REQ-09/REQ-10) | Not user-facing as a distinct error; logged for observability (Art. VIII) |
| `REDIRECT_CONFLICT` | write chokepoint, unique `(workspace_id, from_pattern)` index violation | API + UI | |
| `REDIRECT_LOOP_DETECTED` | write chokepoint, `findByFromPattern`-based cycle check | API + UI | REQ-14 |
| `LINK_PRESERVATION_UNAVAILABLE` | content write chokepoint (not this feature's own route) | the entry/content rename API's error surface | Redirects owns the capture implementation whose absence triggers this; the code itself is raised by content, per ADR-039 §4 amendment 3 |
| `FORBIDDEN` | `authorize()` gateway check | API + UI | REQ-12 |
| `INTERNAL_ERROR` | unhandled exception | API | |

## 5) Acceptance Checklist
- [x] Every error emitted by feature code appears in Section 2.
- [x] Every code has clear retry behavior.
- [x] Every code used in `api.spec.md` appears here.
- [x] User-safe message guidance is provided.
