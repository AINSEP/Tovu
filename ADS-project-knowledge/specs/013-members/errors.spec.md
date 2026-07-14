# Error Code Registry Spec: Members (As-Built)

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/errors.spec.md`

- Spec ID: `SPEC-013`
- Feature: `FEAT-013-members`
- Version: `1.0.0`
- Content Hash: `anchored in feature.spec.md`
- Last Edited: `2026-07-13T00:00:00Z`

## Purpose
Documents Members' actual error handling as implemented — four typed domain error classes
(`src/members/types.ts`) and the ad-hoc HTTP mapping each admin route performs in its own `catch`
block. **There is no structured error envelope today** (Article VIII EXCEPTION in `feature.spec.md`):
routes return plain `{ error: string }` bodies with no `code`, no `occurredAt`, and no
`correlationId`. This file names the codes this spec introduces to make the mapping precise for
traceability, while disclosing that the wire format does not yet carry them as a machine-readable
`code` field.

## 1) Error Envelope (Base Payload — as-built, not the template ideal)
What every member route actually sends on error:
```yaml
error: string   # human-readable message; the ONLY field present
```
`disable.ts`'s 403 response is the one exception — it additionally sends `code` and `details`:
```yaml
error: string
code: "FORBIDDEN"
details:
  permission: "member.manage"
  reason: string
```
No route sends `occurredAt` or `correlationId`. This is the Article VIII gap named in
`feature.spec.md`'s Constitution Compliance table.

## 2) Error Code Registry
| Code | Category | Layer | HTTP Status | Retryable | Thrown By | User Message Guidance |
|---|---|---|---:|---|---|---|
| `WORKSPACE_NOT_FOUND` | resource | `api` | 404 | no | Every member route's own `workspaceId` path-param check (not a domain error class — an inline `res.status(404)`) | "Workspace not found." |
| `MEMBER_NOT_FOUND` | resource | `api`/`domain` | 404 | no | `MemberNotFoundError` (`types.ts`) — thrown by `get-by-id.ts` on a miss, and by `disableMember`/`compSubscription`/`setSubscriptionStatus`/`updateProfile` | "Member not found." |
| `MEMBER_VALIDATION_ERROR` | validation | `api`/`domain` | 400 | no | `MemberValidationError` — bad email format, blank name, archived-tier comp attempt, invalid subscription status | "Please correct the highlighted value." |
| `MEMBER_CONFLICT` | resource | `domain` | — (no route surfaces this today) | no | `MemberConflictError` — duplicate active/comped subscription to the same tier. **No HTTP route calls `compSubscription`, so this code has no HTTP status mapping in this codebase today.** | "This member already has that entitlement." |
| `MEMBER_AUTH_ERROR` | auth | `domain` | — (no route surfaces this today) | no | `MemberAuthError` — invalid/consumed/expired magic-link token, or sign-in attempt on a disabled account. **No HTTP route calls `completeSignIn`, so this code has no HTTP status mapping in this codebase today** (`feature.spec.md` REQ-15). | "This sign-in link is no longer valid." |
| `FORBIDDEN` | authz | `api` | 403 | no | `disable.ts`'s inline `authorize()` check only | "You do not have permission to do that." |
| `INTERNAL_ERROR` | internal | `api` | 500 | maybe | The generic `catch` fallback in every member route | "Unexpected server error." |

## 3) Per-Code Details Schema
```yaml
FORBIDDEN:
  details:
    permission: string   # always "member.manage" today — the only permission this feature checks
    reason: string        # authResult.reason from authorize()
```
No other code carries a structured `details` payload in the current implementation.

## 4) Ownership and Source Rules
| Code | Produced By | Surfaced By | Notes |
|---|---|---|---|
| `WORKSPACE_NOT_FOUND` | Route handler inline check | API only | Duplicated verbatim in all four route files rather than shared middleware. |
| `MEMBER_NOT_FOUND` | `src/members/types.ts` (`MemberNotFoundError`) | API (list/get/disable routes translate it) | `request-magic-link.ts` never throws this (it always returns `{delivered:true}}` per INV-06). |
| `MEMBER_VALIDATION_ERROR` | `src/members/types.ts` (`MemberValidationError`) | API (disable + request-magic-link routes) | |
| `MEMBER_CONFLICT` | `src/members/types.ts` (`MemberConflictError`) | Nowhere — unreachable via HTTP today | Reachable only via direct library calls / tests (`write-service.test.ts`). |
| `MEMBER_AUTH_ERROR` | `src/members/types.ts` (`MemberAuthError`) | Nowhere — unreachable via HTTP today | Same as above; only exercised by `write-service.test.ts`. |
| `FORBIDDEN` | `deps.authorize()` result | API (`disable.ts` only) | The only member route with a permission check (`feature.spec.md` REQ-10). |
| `INTERNAL_ERROR` | Route's outer `catch` | API (all four routes) | Swallows the specific error's message; the client only ever sees `"internal error"`. |

## 5) Acceptance Checklist
- [x] Every error class/status the feature actually produces appears in Section 2.
- [x] Codes that exist as JS classes but have no HTTP surface today (`MEMBER_CONFLICT`,
      `MEMBER_AUTH_ERROR`) are marked as such rather than assigned an invented HTTP status.
- [x] Every code used in `api.spec.md`'s error-mapping table appears here.
- [x] The gap between this registry's `code` field and the actual wire payload (which mostly omits
      `code`) is disclosed in Section 1, not smoothed over.
