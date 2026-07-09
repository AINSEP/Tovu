# Error Code Registry Spec: Identity & Authorization

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/errors.spec.md -->
<!-- Part of the spec-system package. Bound to feature.spec.md v0.5.6 (SPEC-006). -->

- Spec ID: `SPEC-006`
- Feature: `FEAT-006-identity-and-authorization`
- Version: `0.5.6`
- Content Hash: `not-tracked — feature.spec.md is the speckit hash anchor for this package`
- Last Edited: `2026-07-08T19:41:56Z`

## Purpose
Canonical error registry for the identity & authorization surface (login, session, API-key
issuance, the `authorize()` gate, and the permission catalog), independent of stack/language.
Every code emitted by SPEC-006 code paths — route handlers, the gateway gate (REQ-05), the
catalog validator (REQ-03), and the issuance clamp (REQ-08/INV-07) — appears here.

## 1) Error Envelope (Base Payload)
All errors MUST include:

```yaml
code: string          # canonical code from Section 2
message: string       # user-safe, no secret material (INV-05)
occurredAt: string    # ISO-8601 UTC
correlationId: string|null   # request id for server-side correlation (Article VIII)
details: object|null  # per-code schema in Section 3, else null
```

Rule: no error payload, log line, or `details` object may contain a raw password, raw API key,
password hash, or key hash (INV-05). A `reason` string from `authorize()` (`no_grant`,
`resource_scope_mismatch`, `unconstrained_deny`, `principal_disabled`) MAY appear in `details`.

## 2) Error Code Registry
| Code | Category | Layer (`api|orchestrator|ui|integration`) | HTTP Status | Retryable | User Message Guidance |
|---|---|---|---:|---|---|
| `UNAUTHENTICATED` | auth | `api` | 401 | no | "Please sign in again." |
| `FORBIDDEN` | authz | `api` | 403 | no | "You do not have permission to do that." |
| `GRANT_EXCEEDS_ISSUER` | authz | `api` | 403 | no | "You cannot grant a permission you do not hold." |
| `PERMISSION_UNKNOWN` | validation | `api` | 400 | no | "That permission is not recognized." |
| `VALIDATION_ERROR` | validation | `api` | 400 | no | "Please correct the highlighted fields." |
| `RESOURCE_NOT_FOUND` | resource | `api` | 404 | no | "That item was not found." |
| `RESOURCE_CONFLICT` | resource | `api` | 409 | no | "That name is already in use." |
| `OWNER_REQUIRED` | authz | `api` | 409 | no | "The workspace must keep at least one active owner." |
| `RATE_LIMIT_EXCEEDED` | throttling | `api` | 429 | yes | "Too many attempts. Try again shortly." |
| `INTERNAL_ERROR` | internal | `api` | 500 | maybe | "Unexpected server error." |

Notes on the two auth-family codes:
- `UNAUTHENTICATED` (401) = the caller could not be identified as an `active` principal: bad
  credentials, no/expired/revoked session cookie, revoked/expired API key, or a valid credential
  whose bound principal is `disabled` (REQ-06, EC-02, EC-03, AC-05, AC-06).
- `FORBIDDEN` (403) = the caller is authenticated but `authorize()` returned `allowed=false`
  (REQ-05, AC-04, EC-04). The gateway returns 403 **before** the idempotency short-circuit, so a
  demoted/revoked caller replaying a command id receives `FORBIDDEN` and never a `DUPLICATE_COMMAND`
  result or the original `changeSetId` (REQ-05, INV-04, EC-08).

`GRANT_EXCEEDS_ISSUER` is a distinct 403 raised at any **grant time** (API-key issuance, `ASSIGN_ROLE`,
`ATTACH_POLICY`, or `WRITE_POLICY_PERMISSION`) when the grant-authority clamp fails (INV-07): a
permission being delegated is not held by the granter as an **unconstrained** effective row (AC-15,
AC-24, EC-10, EC-11). It is kept separate from `FORBIDDEN` so the granter can be told precisely why the
grant was refused.

`DUPLICATE_COMMAND` is intentionally **not** in this registry: it is a SPEC-001 gateway result, and
EC-08 requires that it never be disclosed to an unauthorized caller. SPEC-006 only guarantees the
403 path runs first; it does not itself emit `DUPLICATE_COMMAND`.

## 3) Per-Code Details Schema
Add only when needed for deterministic handling.

```yaml
FORBIDDEN:
  details:
    permission: string          # the permission the route required, e.g. "changeset.revert"
    reason: string              # authorize() reason: no_grant | resource_scope_mismatch |
                                #   unconstrained_deny | principal_disabled

GRANT_EXCEEDS_ISSUER:
  details:
    offendingPermissions:       # the permission(s) the issuer does not hold unconstrained
      type: array
      items: string

PERMISSION_UNKNOWN:
  details:
    permission: string          # the unregistered permission string that was rejected

VALIDATION_ERROR:
  details:
    fieldErrors:
      type: array
      items:
        field: string
        reason: string

RATE_LIMIT_EXCEEDED:
  details:
    retryAfterSeconds: integer

RESOURCE_CONFLICT:
  details:
    field: string               # e.g. "username" — unique per workspace (behavior.spec § 5.1)
```

## 4) Ownership and Source Rules
| Code | Produced By | Surfaced By | Notes |
|---|---|---|---|
| `UNAUTHENTICATED` | session/API-key resolver (REQ-06/REQ-08) | API | Emitted before route logic; disabled principal counts as unauthenticated (EC-02/EC-03) |
| `FORBIDDEN` | command gateway `authorize()` (REQ-05) | API | Raised before idempotency lookup (INV-04, EC-08); carries `reason` from `authorize()` |
| `GRANT_EXCEEDS_ISSUER` | grant-authority clamp (REQ-08/REQ-02/INV-07): `ISSUE_API_KEY`, `ASSIGN_ROLE`, `ATTACH_POLICY`, `WRITE_POLICY_PERMISSION` | API + CLI | Owner's `*` always satisfies the clamp; conditional holds cannot be delegated (EC-11); only an owner may assign/attach the built-in `owner` role/policy (AC-24) |
| `PERMISSION_UNKNOWN` | catalog validator on `policy_permissions` write (REQ-03) | API + CLI | Catalog is code-registered, not a DB enum |
| `VALIDATION_ERROR` | API request validators + grant/issuance preconditions (REQ-08/REQ-02) | API + UI + CLI | Malformed login / issuance bodies (UI maps `fieldErrors`); also: `ISSUE_API_KEY` bound principal not `kind='api_key'` (AC-23) or not **grantless** (AC-25a); `ASSIGN_ROLE`/`ATTACH_POLICY` target not `kind='user'` (AC-25b); `WRITE_POLICY_PERMISSION` against an `is_builtin` or `is_frozen` (issuance-snapshot) policy is refused (AC-26) — machine authority is set at a single clamped issuance and frozen thereafter (F-053-01/F-054-01) |
| `RESOURCE_NOT_FOUND` | API (key/principal/session lookups) | API | e.g. revoking a non-existent key id |
| `RESOURCE_CONFLICT` | API (uniqueness checks) | API + UI | Duplicate `username` within a workspace (behavior.spec § 5) |
| `OWNER_REQUIRED` | disable guard (REQ-11/INV-08) | API + CLI | Refuses a disable that would remove the last active owner-`*` principal, or any disable of the **seeded owner** (delta-audit MF-2) |
| `RATE_LIMIT_EXCEEDED` | rate limiter (all api.spec § 3 profiles; REQ-14) | API | Applies to every rate-limited endpoint; the strictest is `LOGIN_STRICT` brute-force protection on `auth/login` (client-IP resolution per api.spec § 3); see behavior.spec § 4 and api.spec § 3 |
| `INTERNAL_ERROR` | any SPEC-006 handler | API | Fail-closed: an unexpected error in `authorize()` denies, never allows (INV-03) |

## 5) Acceptance Checklist
- [x] Every error emitted by feature code appears in Section 2.
- [x] Every code has clear retry behavior.
- [x] Every code used in `api.spec.md` appears here.
- [x] User-safe message guidance is provided (no secret material — INV-05).
- [x] Server-side errors carry `correlationId` (Article VIII / DoD G-08).
