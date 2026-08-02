# Directus Authentication Surface

**Source files analyzed:**
- `other-repos/directus/api/src/controllers/auth.ts`
- `other-repos/directus/api/src/app.ts`
- `other-repos/directus/api/src/constants.ts` (via controller usage)

---

## 1. Overview

Directus authentication is provider-driven and mode-driven.

Two separate axes exist in the inspected code:

1. **Provider axis** - how the user signs in:
   - local
   - oauth2
   - openid
   - ldap
   - saml
2. **Session transport axis** - how refresh / logout state is carried:
   - `json`
   - `cookie`
   - `session`

The auth controller does not hardcode a single login route. It dynamically mounts login routers based on configured auth providers.

---

## 2. Mounted Login Routers

At module load time, `controllers/auth.ts`:

1. reads configured providers via `getAuthProviders()`
2. switches on each provider's `driver`
3. builds a driver-specific sub-router
4. mounts it at `/login/{providerName}`

Supported driver families in the inspected switch:

- `local`
- `oauth2`
- `openid`
- `ldap`
- `saml`

If a provider cannot produce a router, Directus logs a warning and skips it.

Additionally:

- when `AUTH_DISABLE_DEFAULT` is not set, Directus mounts a default local login router at `/login`

This gives Directus both:

- explicit named provider login surfaces
- an optional default login endpoint

---

## 3. Mode Resolution

The controller uses `getCurrentMode(req)` to resolve how refresh/logout should interpret the request:

1. if `req.body.mode` exists, use it directly
2. else if `req.body.refresh_token` exists, use `json`
3. otherwise default to `cookie`

This means the refresh and logout endpoints are transport-polymorphic.

### 3.1 Refresh token extraction

`getCurrentRefreshToken(req, mode)` resolves the refresh source:

- `json` mode -> `req.body.refresh_token`
- `cookie` mode -> refresh token cookie
- `session` mode -> session cookie, but only after:
  - verifying it is a Directus JWT
  - decoding it with `verifyAccessJWT(...)`
  - extracting the session identifier from the JWT payload

So `session` mode does not directly reuse a refresh-token cookie. It derives the session token reference from the session JWT.

---

## 4. Shared Accountability Construction

For refresh, logout, password request, and password reset, the controller creates a default accountability object using:

- request IP
- request `user-agent` truncated to 1024 chars, when present
- request `origin`, when present

That object is then passed into service constructors.

This means auth-related service calls are intentionally audit-context aware even before a user is successfully authenticated.

---

## 5. `POST /auth/refresh`

### 5.1 Inputs

Mode-sensitive input handling:

- mode can be explicit or inferred
- refresh token must come from:
  - JSON body
  - refresh cookie
  - session cookie-derived session reference

If no refresh token can be resolved:

- `InvalidPayloadError`
- reason: refresh token is required in payload or cookie

### 5.2 Service call

The controller calls:

- `AuthenticationService.refresh(currentRefreshToken, { session: mode === 'session' })`

### 5.3 Output behavior by mode

All modes return `expires`.

Additional behavior:

- `json` mode:
  - response payload includes `access_token`
  - response payload includes `refresh_token`
- `cookie` mode:
  - sets refresh-token cookie
  - payload includes `access_token`
- `session` mode:
  - sets session cookie containing access token
  - payload does not expose tokens directly

This is not one uniform auth response shape. The shape depends on the transport mode.

---

## 6. `POST /auth/logout`

### 6.1 Inputs

Logout reuses the same mode and refresh-token resolution logic as refresh.

If the current refresh token cannot be resolved:

- `InvalidPayloadError`

### 6.2 Behavior

The controller:

1. constructs accountability metadata
2. creates `AuthenticationService`
3. calls `logout(currentRefreshToken)`
4. clears refresh cookie if present
5. clears session cookie if present

No payload is explicitly constructed in the controller after success. The endpoint succeeds through the shared response pipeline.

---

## 7. `POST /auth/password/request`

### 7.1 Required input

- `email` must be a string

Otherwise:

- `InvalidPayloadError`

### 7.2 Behavior

The controller:

1. creates accountability metadata
2. instantiates `UsersService`
3. calls `requestPasswordReset(email, reset_url || null)`

### 7.3 Error-handling nuance

The controller explicitly treats `InvalidPayloadError` differently from other failures:

- invalid payload is re-thrown
- all other errors are logged as warnings and then suppressed with `next()`

That means the endpoint is intentionally biased toward non-disclosure of some failure conditions rather than surfacing every internal mail or user-resolution problem to the caller.

---

## 8. `POST /auth/password/reset`

### 8.1 Required fields

- `token` must be a string
- `password` must be a string

Missing either field produces `InvalidPayloadError`.

### 8.2 Behavior

The controller:

1. creates default accountability metadata
2. instantiates `UsersService`
3. calls `resetPassword(token, password)`

No route-specific payload shaping is performed after success.

---

## 9. `GET /auth`

This route is a provider discovery endpoint.

Inputs:

- optional `sessionOnly` query flag

Behavior:

1. derive boolean-like `sessionOnly`
2. return `getAuthProviders({ sessionOnly })`
3. include `disableDefault` reflecting `AUTH_DISABLE_DEFAULT`

This gives the admin app or other clients a way to discover configured auth options dynamically.

---

## 10. What This File Does Not Yet Cover

This file documents the top-level auth surface only.

Still needed in follow-up specs:

- `createLocalAuthRouter(...)`
- OAuth / OIDC redirect and callback flow
- LDAP and SAML handshake specifics
- cookie option definitions in constants
- token extraction middleware
- auth middleware that resolves `req.accountability`
- TFA enable / disable endpoints under `/users/me`

---

## 11. Important Invariants

From the inspected controller:

- auth is multi-provider, not single-provider
- refresh/logout are mode-sensitive, not single-shape endpoints
- accountability metadata is attached to auth-sensitive service calls
- password-reset request intentionally avoids surfacing all backend failures
- Directus can support cookie, JSON-token, and session-flavored auth flows in the same API surface

---

## 12. Tovu Reconstruction Notes

### 12.1 Why this exists

This subsystem exists to separate two concerns that are often incorrectly merged:

- identity provider choice
- session transport and refresh behavior

Directus supports multiple sign-in methods without forcing one session shape on every client. That flexibility is why the controller can serve app users, browser sessions, and token-oriented clients from the same surface.

### 12.2 What Tovu should preserve

- A clean separation between `who authenticated the user` and `how the session is carried and refreshed`
- Audit context on auth-sensitive operations, including pre-auth flows like password reset
- Provider discovery/configuration as data, not hardcoded UI assumptions
- Deliberate non-disclosure behavior for sensitive recovery flows

### 12.3 What Tovu can simplify

- V1 does not need every Directus provider family
- V1 can ship one primary browser session mode plus one API-token mode, as long as the transport seam remains explicit
- Named provider routes can be simplified if the internal provider registry stays swappable

### 12.4 Possible Tovu seams

- `src/features/auth/` for auth use cases and recovery flows
- `src/core/ports/AuthProviderPort.ts` for provider-specific login/identity exchange
- `src/core/ports/SessionTransportPort.ts` for cookie/session/token transport semantics
- `src/server/` should adapt HTTP routes onto those ports rather than own auth policy directly

### 12.5 Suggested priority

- `V1`: local auth, password reset/request, session transport seam, audit metadata
- `Later`: multiple enterprise providers, session-mode expansion, richer discovery UX
