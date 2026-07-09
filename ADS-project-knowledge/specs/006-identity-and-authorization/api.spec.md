# API Contract Spec: Identity & Authorization

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/api.spec.md -->
<!-- Part of the spec-system package. Bound to feature.spec.md v0.5.6 (SPEC-006). -->

- Spec ID: `SPEC-006`
- Feature: `FEAT-006-identity-and-authorization`
- Version: `0.5.6`
- Content Hash: `not-tracked — feature.spec.md is the speckit hash anchor for this package`
- Last Edited: `2026-07-08T19:41:56Z`

## Purpose
Source of truth for the HTTP surface of SPEC-006, independent of implementation language: the
authentication endpoints (login / logout / whoami), the API-key management endpoints, and the
cross-cutting `authorize()` gate the SPEC-001 command gateway applies to every mutation route.
All endpoints are served on the isolated **admin origin** (ADR-020); the cookie-less theme origin
never sees these routes.

## 0) Cross-Cutting Gateway Authorization Gate (REQ-05)
This is not a new endpoint — it is a gate applied to **every existing SPEC-001 mutation route**.

- Before executing any mutation, the gateway runs, in order:
  `authenticate` → `authorize(principalId, permission, {workspaceId, entityType, entityId?})`
  → idempotency-cache lookup → feature execution / inverse capture → change-set write.
- The `permission` is declared by the route (e.g. a post update declares `content.write`; revert
  declares `changeset.revert`).
- `authorize()` returning `allowed=false` aborts with `FORBIDDEN` (403) and a typed `reason`,
  **before** the idempotency lookup, so no `DUPLICATE_COMMAND` result and no original
  `changeSetId` is returned to an unauthorized caller (INV-04, EC-08). No mutation runs and no
  change-set is written.
- On success, the change-set `actorId` is stamped with the caller's principal id (REQ-05),
  replacing the legacy `user-local` stub.

This amends SPEC-001 REQ-01's ordered step list by prepending `authenticate → authorize`; the
relative order of SPEC-001's other steps is preserved.

**Non-HTTP callers (REQ-13):** the `authenticate` step for a `tovu` CLI / in-process core mutation
resolves the caller to the seeded `owner` principal (there is no session cookie or API key in that
path). The same `authorize()` gate and `actorId` stamping then apply unchanged — the CLI is a real
authorized principal, not an unauthenticated caller. Documented trust boundary: local shell access
== owner (REQ-13, OQ-08).

## 1) Endpoint Registry
| Endpoint ID | Method | Path | Purpose | Auth Profile | Rate Limit Profile |
|---|---|---|---|---|---|
| `AUTH_LOGIN` | `POST` | `/admin/api/auth/login` | Verify username+password, create a session, set the session cookie | `AUTH_PUBLIC` | `LOGIN_STRICT` |
| `AUTH_LOGOUT` | `POST` | `/admin/api/auth/logout` | Revoke the current session | `AUTH_SESSION` | `WRITE_STANDARD` |
| `AUTH_ME` | `GET` | `/admin/api/auth/me` | Return the current principal and its effective permission set | `AUTH_SESSION_OR_KEY` | `READ_STANDARD` |
| `APIKEY_ISSUE` | `POST` | `/admin/api/api-keys` | Issue an API key bound to a principal; attach policies; enforce the issuance clamp | `AUTH_APIKEY_MANAGE` | `WRITE_STANDARD` |
| `APIKEY_REVOKE` | `POST` | `/admin/api/api-keys/:id/revoke` | Revoke an API key (takes effect immediately) | `AUTH_APIKEY_MANAGE` | `WRITE_STANDARD` |

CLI-only surface (not HTTP): `tovu permissions list` enumerates the registered permission catalog
(REQ-12); catalog introspection for a logged-in caller is available over HTTP via `AUTH_ME`'s
effective-permission set (REQ-07).

## 2) Authentication and Authorization Profiles
| Profile ID | Auth Required | Credential Type | Required Permission | Permitted Principals | Notes |
|---|---|---|---|---|---|
| `AUTH_PUBLIC` | `false` | none | none | any caller on the admin origin | Login establishes auth; body carries credentials, not a session |
| `AUTH_SESSION` | `true` | session cookie (`HttpOnly`, `SameSite=Strict`, `Secure`) | none beyond active session | any `active` principal with a valid session | Server-side session validated every request |
| `AUTH_SESSION_OR_KEY` | `true` | session cookie **or** API key | none beyond active credential | any `active` principal | `AUTH_ME` accepts either credential shape |
| `AUTH_APIKEY_MANAGE` | `true` | session cookie or API key | `apikey.manage` | principals holding `apikey.manage` (built-in `owner`, `admin`) | Issuance further constrained by the INV-07 clamp |

Credential model is server-side sessions + hashed API keys (not Bearer JWT). A key is presented via
an `Authorization: ApiKey <raw-key>` header; only its hash is stored (INV-05). A request with a
valid, non-expired, non-revoked key whose principal is `active` authenticates identically to a
session (REQ-08, AC-06).

## 3) Rate Limit Profiles
| Profile ID | Window Seconds | Max Requests | Burst Allowance | Keyed By (`principalId|apiKey|ip|workspaceId`) | Notes |
|---|---:|---:|---:|---|---|
| `LOGIN_STRICT` | `60` | `10` | `0` | `ip` | Brute-force guard on `AUTH_LOGIN`; keyed by IP since caller is not yet authenticated |
| `WRITE_STANDARD` | `60` | `30` | `5` | `principalId` | Standard mutation limit |
| `READ_STANDARD` | `60` | `300` | `50` | `principalId` | Standard read limit |

Rate-limit values are mirrored in behavior.spec § 4 (DoD F-06). Exceeding a limit returns
`RATE_LIMIT_EXCEEDED` (429) with `details.retryAfterSeconds`. These profiles trace to **REQ-14**.

**Client-IP resolution for `LOGIN_STRICT` (REQ-14):** because the login limiter is keyed by `ip`
before the caller is authenticated, the client IP is read from a forwarded-for header **only when the
immediate peer is on a configured trusted-proxy list**; otherwise it is the socket peer address. An
untrusted forwarded-for header is never honored — so a shared reverse-proxy IP cannot globally trip
the limiter (real client IPs are recovered from the trusted proxy) and a spoofed header cannot bypass
it. If no trusted-proxy list is configured, the socket peer address is always used.

## 4) Request Contracts

### Endpoint: `AUTH_LOGIN` (`POST /admin/api/auth/login`)
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
```
- Body:
```yaml
username:
  type: string
  minLength: 1
  required: true
password:
  type: string
  minLength: 1
  required: true
```

### Endpoint: `AUTH_LOGOUT` (`POST /admin/api/auth/logout`)
- Headers:
```yaml
Cookie: "tovu_session=<opaque>"   # session cookie identifies the session to revoke
```
- Body:
```yaml
{}
```

### Endpoint: `AUTH_ME` (`GET /admin/api/auth/me`)
- Headers:
```yaml
Cookie: "tovu_session=<opaque>"           # session credential, OR
Authorization: "ApiKey <raw-key>"          # API-key credential
```

### Endpoint: `APIKEY_ISSUE` (`POST /admin/api/api-keys`)
- Body:
```yaml
principalId:
  type: string
  format: uuid
  required: true
  description: the kind='api_key' principal the key is bound to (same workspace as issuer); MUST reference a
    kind='api_key' principal — a user/system/owner target is rejected 400 VALIDATION_ERROR (REQ-08, AC-23),
    since a key authenticates as its bound principal and must not inherit a privileged principal's grants.
    MUST also be grantless (no pre-existing principal_roles/principal_policies rows) — a non-grantless target
    is rejected 400 VALIDATION_ERROR (AC-25), so the key's authority equals exactly the policyIds attached
    here and never the bound principal's accumulated authority (F-053-01)
label:
  type: string
  minLength: 1
  maxLength: 255
  required: true
policyIds:
  type: array
  required: true
  minItems: 1
  items:
    type: string
    format: uuid
  description: the source policies whose permissions are SNAPSHOTTED at issuance into a fresh
    is_frozen (immutable, machine-owned) policy that is attached to the key's principal; every
    permission they carry must be held UNCONSTRAINED by the issuer (INV-07) or issuance is rejected.
    The key holds a frozen copy, not a live reference — a later WRITE_POLICY_PERMISSION widening of a
    source policy does not grow the already-issued key (AC-26, F-054-01)
expiresAt:
  type: string
  format: date-time
  required: false
  description: optional expiry; null means no expiry
```

### Endpoint: `APIKEY_REVOKE` (`POST /admin/api/api-keys/:id/revoke`)
- Path Params:
```yaml
id:
  type: string
  format: uuid
  required: true
```
- Body:
```yaml
{}
```

## 5) Response Contracts
### Success Responses
| Endpoint ID | HTTP Status | Body Contract | Notes |
|---|---:|---|---|
| `AUTH_LOGIN` | `200` | `LoginResponse` | Sets `Set-Cookie: tovu_session=…; HttpOnly; SameSite=Strict; Secure` |
| `AUTH_LOGOUT` | `204` | (empty) | Session revoked; cookie cleared |
| `AUTH_ME` | `200` | `WhoAmIResponse` | Principal + effective permission set |
| `APIKEY_ISSUE` | `201` | `ApiKeyIssueResponse` | Raw key shown **once**; only the hash is persisted |
| `APIKEY_REVOKE` | `204` | (empty) | Revocation immediate |

### Contract Definitions
```yaml
Principal:
  id: { type: string, format: uuid }
  workspaceId: { type: string }
  kind: { type: string, enum: [user, agent, api_key, system] }
  displayName: { type: string }
  status: { type: string, enum: [active, disabled] }

LoginResponse:
  data:
    principal: { $ref: Principal }
    sessionExpiresAt: { type: string, format: date-time }

WhoAmIResponse:
  data:
    principal: { $ref: Principal }
    effectivePermissions:
      type: array
      items: { type: string }   # dotted permission strings, e.g. "content.write"; owner resolves to ["*"]

ApiKeyIssueResponse:
  data:
    id: { type: string, format: uuid }
    principalId: { type: string, format: uuid }
    label: { type: string }
    prefix: { type: string }         # non-secret lookup prefix
    rawKey: { type: string }         # shown once, never persisted or re-returned
    expiresAt: { type: string, format: date-time, nullable: true }
```

## 6) Error Mapping
Reference canonical codes in `errors.spec.md`.

| Endpoint ID | HTTP Status | Error Codes |
|---|---:|---|
| `AUTH_LOGIN` | `400` | `VALIDATION_ERROR` |
| `AUTH_LOGIN` | `401` | `UNAUTHENTICATED` |
| `AUTH_LOGIN` | `429` | `RATE_LIMIT_EXCEEDED` |
| `AUTH_LOGIN` | `500` | `INTERNAL_ERROR` |
| `AUTH_LOGOUT` | `401` | `UNAUTHENTICATED` |
| `AUTH_ME` | `401` | `UNAUTHENTICATED` |
| `APIKEY_ISSUE` | `400` | `VALIDATION_ERROR` |
| `APIKEY_ISSUE` | `401` | `UNAUTHENTICATED` |
| `APIKEY_ISSUE` | `403` | `FORBIDDEN, GRANT_EXCEEDS_ISSUER` |
| `APIKEY_ISSUE` | `404` | `RESOURCE_NOT_FOUND` |
| `APIKEY_REVOKE` | `401` | `UNAUTHENTICATED` |
| `APIKEY_REVOKE` | `403` | `FORBIDDEN` |
| `APIKEY_REVOKE` | `404` | `RESOURCE_NOT_FOUND` |
| gateway mutation routes (§0) | `401` | `UNAUTHENTICATED` |
| gateway mutation routes (§0) | `403` | `FORBIDDEN` |
| any rate-limited endpoint (§3) | `429` | `RATE_LIMIT_EXCEEDED` |

**Codes registered but not mapped to these 5 endpoints:** `RESOURCE_CONFLICT` is produced only on
**user creation** (duplicate `username` per workspace — behavior.spec §5), and `PERMISSION_UNKNOWN`
only on a **`policy_permissions` write** (catalog validation — REQ-03 / errors.spec §4). Neither of
those surfaces is one of the five HTTP endpoints above (user/role/policy management is core/CLI in
v1; admin UI is deferred, OQ-06). `APIKEY_ISSUE` reads **existing** source policies by UUID and
snapshots their (already catalog-valid) permissions into a frozen copy, so it can emit neither code
(it does emit `VALIDATION_ERROR` for a non-`api_key`/non-grantless bound principal or a `*`-bearing
source — AC-23/AC-25/AC-26). `OWNER_REQUIRED` (409) is likewise unmapped to the five endpoints — it is emitted only
by the CLI/core `DISABLE_PRINCIPAL` guard (REQ-11/INV-08), which has no HTTP route in v1 (admin UI deferred,
OQ-06). All three remain in errors.spec because they are emitted elsewhere in the feature.
Every endpoint carrying a §3 rate-limit profile can additionally return `429 RATE_LIMIT_EXCEEDED`;
only `AUTH_LOGIN`'s stricter `LOGIN_STRICT` profile is called out separately above.

## 7) Contract Acceptance Checklist
- [x] Every endpoint in Section 1 has request and response contracts.
- [x] Every endpoint has auth and rate-limit profiles.
- [x] Every error code used here exists in `errors.spec.md`.
- [x] Names and enums (`kind`, `status`) align with `state.spec.md`.
- [x] The cross-cutting gateway gate (§0) is documented and traces to REQ-05 / INV-04.
