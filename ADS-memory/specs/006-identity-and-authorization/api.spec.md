# API Contract Spec: Identity & Authorization

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/api.spec.md -->
<!-- Part of the spec-system package. Bound to feature.spec.md v0.7.0 (SPEC-006). -->

- Spec ID: `SPEC-006`
- Feature: `FEAT-006-identity-and-authorization`
- Version: `0.7.0`
- Content Hash: `not-tracked — feature.spec.md is the speckit hash anchor for this package`
- Last Edited: `2026-07-28T00:00:00Z`

## Purpose
Source of truth for the HTTP surface of SPEC-006, independent of implementation language: the
authentication endpoints (login / logout / whoami), the API-key management endpoints (including
principal minting, §1/0.7.0), the users/roles/policies admin management endpoints (§1a, 0.6.0), and
the cross-cutting `authorize()` gate the SPEC-001 command gateway applies to every mutation route.
All endpoints are served on the isolated **admin origin** (ADR-020); the cookie-less theme origin
never sees these routes.

**0.7.0 note — closes the `CREATE_PRINCIPAL` unreachable-transition gap (ADR-PIPE-006 Decision 3).**
`CREATE_PRINCIPAL` has been fully specified as a state transition since v0.5.1 (state.spec §3) but had
**no** HTTP or CLI surface in any version of this file — so an `apikey.manage` holder had no way to
produce the `kind='api_key'` principal that `APIKEY_ISSUE` is required to bind to, making
`APIKEY_ISSUE` itself unreachable in practice. The Software Architect surfaced this as a
`[NEEDS CLARIFICATION]` rather than inventing a contract (ADR-PIPE-006 / ADR-048, Article VII
exception). **Resolution: a separate endpoint** (`APIKEY_PRINCIPAL_CREATE`, §1) rather than folding an
implicit mint into `APIKEY_ISSUE`'s body — see the Shape Rationale note under §1. `APIKEY_ISSUE`'s
request contract is **byte-unchanged**; this amendment is purely additive to the endpoint registry.

**0.7.0 note — path-prefix drift repair (§1).** Every §1 path string was documented as
`/admin/api/…`; the shipped code has never used that prefix. The three auth routes are really
registered at `/api/admin/v1/auth/login|logout|me` (`src/server/middleware/dev-auth.ts:146,190,203`;
`src/server/middleware/site-serving-gate.ts:36`), matching §1a's `/api/admin/v1/…` family and every
other admin route in this codebase; `/admin/api` appears nowhere under `src/server/`. The two
API-key rows were never implemented, so they had no code to drift from — they are corrected to the
same real prefix so the new sibling row and the in-flight `APIKEY_ISSUE`/`APIKEY_REVOKE`
implementation are not built against a path the spec knows is wrong. This is the same
document-catches-up-to-shipped-code repair 0.6.0 performed for §1a, applied to the rows 0.6.0 did
not reach. **No behavior, auth profile, request contract, or response contract changes** — only the
literal path strings in §1 and their echoes in §4.

**0.6.0 note:** §1a documents 8 endpoints that were already implemented and shipped (via the
"Admin-sweep feature drop" commit, predating this amendment) but were never added to this file —
this section previously stated flatly that "user/role/policy management is core/CLI in v1" (see the
old §6 note, now corrected), which stopped being true once those routes landed. §1a brings the
document current with the real HTTP surface and adds the 9 new endpoints this amendment introduces.

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
| `AUTH_LOGIN` | `POST` | `/api/admin/v1/auth/login` | Verify username+password, create a session, set the session cookie | `AUTH_PUBLIC` | `LOGIN_STRICT` |
| `AUTH_LOGOUT` | `POST` | `/api/admin/v1/auth/logout` | Revoke the current session | `AUTH_SESSION` | `WRITE_STANDARD` |
| `AUTH_ME` | `GET` | `/api/admin/v1/auth/me` | Return the current principal and its effective permission set | `AUTH_SESSION_OR_KEY` | `READ_STANDARD` |
| `APIKEY_PRINCIPAL_CREATE` | `POST` | `/api/admin/v1/api-keys/principals` | `CREATE_PRINCIPAL` (state.spec §3) — mint the grantless `kind='api_key'` principal that `APIKEY_ISSUE` binds to | `AUTH_APIKEY_MANAGE` | `WRITE_STANDARD` |
| `APIKEY_ISSUE` | `POST` | `/api/admin/v1/api-keys` | Issue an API key bound to a principal; snapshot policies; enforce the issuance clamp | `AUTH_APIKEY_MANAGE` | `WRITE_STANDARD` |
| `APIKEY_REVOKE` | `POST` | `/api/admin/v1/api-keys/:id/revoke` | Revoke an API key (takes effect immediately) | `AUTH_APIKEY_MANAGE` | `WRITE_STANDARD` |

**Shape rationale — why `APIKEY_PRINCIPAL_CREATE` is a separate endpoint (0.7.0).** The alternative
considered (ADR-PIPE-006 Pattern Evaluation §C) was folding principal minting into `APIKEY_ISSUE`'s
body as an implicit mint-then-issue, dropping the caller-supplied `principalId`. It is rejected on
three grounds, in decreasing order of weight:

1. **It would require rewriting the closed security design.** AC-23 and AC-25a are both stated in
   terms of a caller-supplied bound `principalId` ("when `ISSUE_API_KEY` is called with that
   principal's id as the bound `principalId`…"). Removing the field makes both criteria
   inexpressible, forcing an edit to material that five audit rounds (F-052..F-054) closed. A route
   shape must not be paid for with a rewrite of an audited invariant.
2. **It would convert an enforced precondition into a tautology.** AC-25a's grantless check is
   described in REQ-08 as the "belt-and-suspenders check at issuance" — a defense-in-depth guard
   against the bound principal having *accumulated* authority between minting and issuance. Inside a
   single atomic mint-then-issue call it can never fail, so it stops being independently testable at
   the HTTP boundary. The check would still be required in core (the REQ-13 CLI/in-process path
   supplies a `principalId` directly and has no such atomicity), so folding costs test surface and
   buys only one round trip.
3. **It is a breaking change to an approved contract.** Dropping a `required: true` field from a live
   documented endpoint is a compatibility event; adding a new endpoint beside it is not.

The two-step flow's honest cost is accepted and recorded: because a bound principal must be
grantless (AC-25a) and issuance writes it a `principal_policies` row, the principal:key relationship
is strictly 1:1 and the second step always immediately follows the first. The ceremony is real; the
audited-precondition test surface it preserves is worth more than the round trip it costs.

`APIKEY_PRINCIPAL_CREATE` writes **no** grant rows (state.spec §3: the new principal is grantless),
so unlike every other `apikey.manage`-gated operation it is **not** subject to the INV-07 grant
clamp and can never emit `GRANT_EXCEEDS_ISSUER`. The clamp attaches to `APIKEY_ISSUE`, where
authority is actually conferred. This is deliberate, not an omission.

CLI-only surface (not HTTP): `tovu permissions list` enumerates the registered permission catalog
(REQ-12); catalog introspection for a logged-in caller is available over HTTP via `AUTH_ME`'s
effective-permission set (REQ-07).

## 1a) Users / Roles / Policies Admin Endpoint Registry (0.6.0)

All paths below are prefixed `/api/admin/v1/workspaces/:workspaceId/…` and require `:workspaceId`
to equal the caller's own workspace (a mismatch is `404`, not `403` — matches every other admin
route in this codebase, e.g. `routes/admin/users/list.ts`). Rows marked **Pre-existing** were
implemented before this amendment and are documented here for the first time (§0's drift-repair
note); rows marked **New (0.6.0)** are introduced by this amendment.

| Endpoint ID | Method | Path | Purpose | Required Permission | Status |
|---|---|---|---|---|---|
| `USER_LIST` | `GET` | `/users` | List human (`kind='user'`) principals | `user.manage` OR `member.manage` | Pre-existing |
| `USER_CREATE` | `POST` | `/users` | `CREATE_USER` (REQ-01) | `user.manage` OR `member.manage` | Pre-existing |
| `USER_UPDATE` | `PATCH` | `/users/:principalId` | `UPDATE_USER` (REQ-16) — `email` only | `user.manage` OR `member.manage` | **New (0.6.0)** |
| `USER_DISABLE` | `POST` | `/users/:principalId/disable` | `DISABLE_PRINCIPAL` (REQ-11) | `user.manage` | **New (0.6.0)** (transition pre-existing, route new) |
| `USER_ENABLE` | `POST` | `/users/:principalId/enable` | `ENABLE_PRINCIPAL` (REQ-15) | `user.manage` | **New (0.6.0)** |
| `USER_RESET_PASSWORD` | `POST` | `/users/:principalId/reset-password` | `RESET_USER_PASSWORD` (REQ-17) | `user.manage` | **New (0.6.0)** |
| `USER_ASSIGN_ROLE` | `POST` | `/users/:principalId/roles` | `ASSIGN_ROLE` (REQ-02) | `role.manage` (+ INV-07 clamp) | Pre-existing |
| `USER_ATTACH_POLICY` | `POST` | `/users/:principalId/policies` | `ATTACH_POLICY` (REQ-02) | `role.manage` (+ INV-07 clamp) | Pre-existing |
| `ROLE_LIST` | `GET` | `/roles` | List roles (built-in + custom) | `role.manage` | Pre-existing |
| `ROLE_CREATE` | `POST` | `/roles` | `CREATE_ROLE` (REQ-02) | `role.manage` | Pre-existing |
| `ROLE_UPDATE` | `PATCH` | `/roles/:roleId` | `UPDATE_ROLE` (REQ-18) — rename | `role.manage` | **New (0.6.0)** |
| `ROLE_DELETE` | `DELETE` | `/roles/:roleId` | `DELETE_ROLE` (REQ-19) | `role.manage` | **New (0.6.0)** |
| `POLICY_LIST` | `GET` | `/policies` | List policies (built-in + custom) | `role.manage` | Pre-existing |
| `POLICY_CREATE` | `POST` | `/policies` | `CREATE_POLICY` (REQ-02) | `role.manage` | Pre-existing |
| `POLICY_UPDATE` | `PATCH` | `/policies/:policyId` | `UPDATE_POLICY` (REQ-18) — rename/re-describe | `role.manage` | **New (0.6.0)** |
| `POLICY_DELETE` | `DELETE` | `/policies/:policyId` | `DELETE_POLICY` (REQ-19) | `role.manage` | **New (0.6.0)** |
| `POLICY_WRITE_PERMISSION` | `POST` | `/policies/:policyId/permissions` | `WRITE_POLICY_PERMISSION` (INV-07) | `role.manage` (+ INV-07 clamp) | **New (0.6.0)** (transition pre-existing, route new) |

All 17 endpoints use `AUTH_SESSION` (session cookie); none accept API-key auth in v1 — matches the
pre-existing 8 routes' actual behavior (`getAuthedPrincipal` reads the session-derived
`res.locals.principal`, no API-key branch). Rate limit profile: `WRITE_STANDARD` for every
mutating verb (`POST`/`PATCH`/`DELETE`), `READ_STANDARD` for `GET` — same profiles as §3, no new ones.

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

### Endpoint: `AUTH_LOGIN` (`POST /api/admin/v1/auth/login`)
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

### Endpoint: `AUTH_LOGOUT` (`POST /api/admin/v1/auth/logout`)
- Headers:
```yaml
Cookie: "tovu_session=<opaque>"   # session cookie identifies the session to revoke
```
- Body:
```yaml
{}
```

### Endpoint: `AUTH_ME` (`GET /api/admin/v1/auth/me`)
- Headers:
```yaml
Cookie: "tovu_session=<opaque>"           # session credential, OR
Authorization: "ApiKey <raw-key>"          # API-key credential
```

### Endpoint: `APIKEY_PRINCIPAL_CREATE` (`POST /api/admin/v1/api-keys/principals`) — 0.7.0
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
Cookie: "tovu_session=<opaque>"           # session credential, OR
Authorization: "ApiKey <raw-key>"          # API-key credential (AUTH_APIKEY_MANAGE profile, §2)
```
- Body:
```yaml
displayName:
  type: string
  minLength: 1
  maxLength: 255
  required: true
  description: human-readable name for the machine identity (post-trim 1..255, behavior.spec §4);
    blank-after-trim → 400 VALIDATION_ERROR. Not unique-constrained — unlike users.username there is
    no login identity to collide (behavior.spec §5.1 dedup applies to username only), so two api_key
    principals may carry the same displayName and are distinguished by id
kind:
  type: string
  enum: [api_key]
  default: api_key
  required: false
  description: v1 accepts only 'api_key'. The field is accepted (rather than omitted from the
    contract) because state.spec §3's CREATE_PRINCIPAL payload declares it and specifies a concrete
    refusal — kind='agent' → 400 VALIDATION_ERROR (deferred, OQ-01) — which needs a reachable
    surface to be testable. Any value other than 'api_key' (including 'user', 'system', 'agent') is
    rejected 400 VALIDATION_ERROR: human principals are minted only by CREATE_USER (REQ-01, AC-22)
    and system/user-local only by SEED_FIRST_BOOT (REQ-09), so this endpoint can never become a
    second creation path for a privileged kind. Omitting the field is equivalent to sending 'api_key'
```

The created principal is `status='active'` and **grantless** — no `principal_roles` and no
`principal_policies` rows are written (state.spec §3), which is exactly the precondition
`APIKEY_ISSUE` then re-verifies (AC-25a). Its `workspaceId` is the caller's own, resolved from the
credential; there is no caller-supplied workspace field and therefore no cross-workspace mint.

### Endpoint: `APIKEY_ISSUE` (`POST /api/admin/v1/api-keys`)
- Body:
```yaml
principalId:
  type: string
  format: uuid
  required: true
  description: the kind='api_key' principal the key is bound to (same workspace as issuer), obtained from
    APIKEY_PRINCIPAL_CREATE (§1, 0.7.0 — the sole HTTP path that mints one); MUST reference a
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

### Endpoint: `APIKEY_REVOKE` (`POST /api/admin/v1/api-keys/:id/revoke`)
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

### Endpoints: Users / Roles / Policies Admin (0.6.0, §1a)

Request bodies for the 9 new endpoints. The 8 pre-existing endpoints' request/response shapes are
unchanged from their shipped implementation (`routes/admin/users/*.ts`) and are not re-specified
here — see `USER_LIST`/`USER_CREATE`/`ROLE_LIST`/`ROLE_CREATE`/`POLICY_LIST`/`POLICY_CREATE`/
`USER_ASSIGN_ROLE`/`USER_ATTACH_POLICY` in code for their existing contract.

```yaml
# USER_UPDATE (PATCH /users/:principalId)
email:
  type: string | null
  required: false
  description: sets, changes, or (if null/absent/empty-string) clears the user's email (EC-17).
    username and password in the body are ignored (REQ-16) — this endpoint is email-only.

# USER_DISABLE (POST /users/:principalId/disable) — no body
# USER_ENABLE (POST /users/:principalId/enable) — no body

# USER_RESET_PASSWORD (POST /users/:principalId/reset-password)
password:
  type: string
  minLength: 1
  required: true
  description: the new password (argon2id-hashed, INV-05); no old password required (admin override,
    REQ-17). Revokes every one of the target's active sessions on success.

# ROLE_UPDATE (PATCH /roles/:roleId)
name:
  type: string
  minLength: 1
  required: true
  description: new role name; refused 400 VALIDATION_ERROR if the target is is_builtin (REQ-18)

# ROLE_DELETE (DELETE /roles/:roleId) — no body
# POLICY_DELETE (DELETE /policies/:policyId) — no body

# POLICY_UPDATE (PATCH /policies/:policyId)
name:
  type: string
  minLength: 1
  required: false
description:
  type: string | null
  required: false
  description: at least one of name/description must be present; refused if the target is
    is_builtin or is_frozen (REQ-18)

# POLICY_WRITE_PERMISSION (POST /policies/:policyId/permissions)
permission:
  type: string
  required: true
  description: must be in the registered catalog (REQ-03) or rejected PERMISSION_UNKNOWN
resourceType:
  type: string | null
  required: false
constraintJson:
  type: string | null
  required: false
  description: WRITE_POLICY_PERMISSION's existing INV-07 clamp + is_builtin/is_frozen refusal apply
    unchanged (state.spec §3) — this is the transition's first HTTP route, not a new rule
```

## 5) Response Contracts
### Success Responses
| Endpoint ID | HTTP Status | Body Contract | Notes |
|---|---:|---|---|
| `AUTH_LOGIN` | `200` | `LoginResponse` | Sets `Set-Cookie: tovu_session=…; HttpOnly; SameSite=Strict; Secure` |
| `AUTH_LOGOUT` | `204` | (empty) | Session revoked; cookie cleared |
| `AUTH_ME` | `200` | `WhoAmIResponse` | Principal + effective permission set |
| `APIKEY_PRINCIPAL_CREATE` | `201` | `PrincipalCreateResponse` | The new grantless `kind='api_key'` principal; its `id` is the `principalId` `APIKEY_ISSUE` then binds (0.7.0) |
| `APIKEY_ISSUE` | `201` | `ApiKeyIssueResponse` | Raw key shown **once**; only the hash is persisted |
| `APIKEY_REVOKE` | `204` | (empty) | Revocation immediate |
| `USER_UPDATE` | `200` | `{ data: { user: AdminUser } }` | Updated user, same shape as `USER_CREATE`/`USER_LIST` rows (0.6.0) |
| `USER_DISABLE` / `USER_ENABLE` | `200` | `{ data: { user: AdminUser } }` | Post-transition state (0.6.0) |
| `USER_RESET_PASSWORD` | `204` | (empty) | No body — the raw new password is never echoed back (INV-05) (0.6.0) |
| `ROLE_UPDATE` | `200` | `{ data: { role: AdminRole } }` | (0.6.0) |
| `ROLE_DELETE` / `POLICY_DELETE` | `204` | (empty) | (0.6.0) |
| `POLICY_UPDATE` | `200` | `{ data: { policy: AdminPolicy } }` | (0.6.0) |
| `POLICY_WRITE_PERMISSION` | `201` | `{ data: { policyPermission: PolicyPermission } }` | (0.6.0) |

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

PrincipalCreateResponse:
  data:
    principal: { $ref: Principal }   # kind is always 'api_key', status 'active', in the caller's workspace

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
| `APIKEY_PRINCIPAL_CREATE` | `400` | `VALIDATION_ERROR` (0.7.0 — blank/oversize `displayName`; `kind` other than `api_key`, incl. the deferred `agent`, OQ-01) |
| `APIKEY_PRINCIPAL_CREATE` | `401` | `UNAUTHENTICATED` |
| `APIKEY_PRINCIPAL_CREATE` | `403` | `FORBIDDEN` (caller lacks `apikey.manage`) |
| `APIKEY_ISSUE` | `400` | `VALIDATION_ERROR` |
| `APIKEY_ISSUE` | `401` | `UNAUTHENTICATED` |
| `APIKEY_ISSUE` | `403` | `FORBIDDEN, GRANT_EXCEEDS_ISSUER` |
| `APIKEY_ISSUE` | `404` | `RESOURCE_NOT_FOUND` |
| `APIKEY_REVOKE` | `401` | `UNAUTHENTICATED` |
| `APIKEY_REVOKE` | `403` | `FORBIDDEN` |
| `APIKEY_REVOKE` | `404` | `RESOURCE_NOT_FOUND` |
| `USER_UPDATE` / `USER_DISABLE` / `USER_ENABLE` / `USER_RESET_PASSWORD` | `400` | `VALIDATION_ERROR` |
| `USER_UPDATE` / `USER_DISABLE` / `USER_ENABLE` / `USER_RESET_PASSWORD` | `403` | `FORBIDDEN` |
| `USER_DISABLE` | `409` | `OWNER_REQUIRED` (0.6.0 — first HTTP surface for this pre-existing code) |
| `USER_UPDATE` / `USER_DISABLE` / `USER_ENABLE` / `USER_RESET_PASSWORD` | `404` | `RESOURCE_NOT_FOUND` |
| `ROLE_UPDATE` / `ROLE_DELETE` / `POLICY_UPDATE` / `POLICY_DELETE` / `POLICY_WRITE_PERMISSION` | `400` | `VALIDATION_ERROR` |
| `ROLE_UPDATE` / `ROLE_DELETE` / `POLICY_UPDATE` / `POLICY_DELETE` / `POLICY_WRITE_PERMISSION` | `403` | `FORBIDDEN`, `GRANT_EXCEEDS_ISSUER` (the last only on `POLICY_WRITE_PERMISSION`) |
| `ROLE_DELETE` / `POLICY_DELETE` | `409` | `RESOURCE_CONFLICT` (0.6.0 — still-referenced target, INV-09) |
| `POLICY_WRITE_PERMISSION` | `400` | `PERMISSION_UNKNOWN` (0.6.0 — first HTTP surface for this pre-existing code) |
| `ROLE_UPDATE` / `ROLE_DELETE` / `POLICY_UPDATE` / `POLICY_DELETE` / `POLICY_WRITE_PERMISSION` | `404` | `RESOURCE_NOT_FOUND` |
| gateway mutation routes (§0) | `401` | `UNAUTHENTICATED` |
| gateway mutation routes (§0) | `403` | `FORBIDDEN` |
| any rate-limited endpoint (§3) | `429` | `RATE_LIMIT_EXCEEDED` |

**0.6.0 — corrects a stale note.** Prior to this amendment, this section stated that
`RESOURCE_CONFLICT`, `PERMISSION_UNKNOWN`, and `OWNER_REQUIRED` were "not mapped to these 5
endpoints" because "user/role/policy management is core/CLI in v1; admin UI is deferred, OQ-06" —
that framing was already false when written (the 8 pre-existing users/roles/policies HTTP endpoints
predate this amendment) and is now corrected: all three codes are mapped above, `PERMISSION_UNKNOWN`
and `OWNER_REQUIRED` for the first time. `RESOURCE_CONFLICT` was already reachable via the
pre-existing `USER_CREATE` (duplicate `username`) and gains the `ROLE_DELETE`/`POLICY_DELETE`
still-referenced case (0.6.0, INV-09). `APIKEY_ISSUE` still cannot emit `PERMISSION_UNKNOWN`/
`OWNER_REQUIRED` (unchanged reasoning: it reads existing, already-valid source policies by UUID and
never touches the disable guard).

**0.7.0 — `APIKEY_PRINCIPAL_CREATE`'s deliberate non-emissions.** It cannot emit
`GRANT_EXCEEDS_ISSUER` (it writes no grant rows, so the INV-07 clamp has nothing to bound — see the
Shape Rationale under §1), nor `RESOURCE_NOT_FOUND` (it takes no path params and resolves its
workspace from the caller's credential, so there is no addressable target to miss), nor
`RESOURCE_CONFLICT` (`displayName` is not unique-constrained, behavior.spec §5.1). Its only 4xx
bodies are the three rows above plus the blanket `429` below.

Every endpoint carrying a §3 rate-limit profile can additionally return `429 RATE_LIMIT_EXCEEDED`;
only `AUTH_LOGIN`'s stricter `LOGIN_STRICT` profile is called out separately above.

## 7) Contract Acceptance Checklist
- [x] Every endpoint in Section 1 has request and response contracts.
- [x] Every endpoint has auth and rate-limit profiles.
- [x] Every error code used here exists in `errors.spec.md`.
- [x] Names and enums (`kind`, `status`) align with `state.spec.md`.
- [x] The cross-cutting gateway gate (§0) is documented and traces to REQ-05 / INV-04.
- [x] **(0.7.0)** Every state-changing transition in `state.spec.md` §3 that is reachable by an
  external caller has an endpoint here — `CREATE_PRINCIPAL` was the last gap and is now
  `APIKEY_PRINCIPAL_CREATE`. The only surfaceless transitions remaining are `SEED_FIRST_BOOT`
  (boot-time), `GATEWAY_STAMP_ACTOR` (gateway-internal), and `ATTACH_TO_BUILTIN` (a
  never-permitted pseudo-transition), each justified in state.spec §3's Surface note.
