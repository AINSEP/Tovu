# server Overview

Server module is the transport boundary.

## Files

- `app.ts`: HTTP route wiring and dependency composition

## Scaffold

- `request-context/`: request-context assembly contract and helpers
- `error-mapping/`: transport error classification and response mapping
- `http/`: HTTP-specific serialization helpers and response shaping
- `middleware/`: reusable transport middleware
- `routes/`: route-level transport handlers grouped by capability
- `__tests__/routes/`: route/integration transport tests

Server code translates HTTP requests into feature commands and maps domain errors to HTTP responses.

## Wiring

- Owner auth (U-AUTH-T1): `inbound/admin-http/dev-auth.ts` mounts the seven `@jini-ai/user-management/admin-http/auth` K1 routes (login, MFA login, logout, boot-session, local-boot-session, `/auth/me`, `/auth/me/password-status`) with `mountJsonRoute`. It injects a per-request `AuthRequest` (cookies, `no-store`/`Retry-After`, the shared login limiter, session revocation, the sign-in signal, loopback and local owner sign-in policy, boot redemption) and an `onError` that writes refusals verbatim. Login and logout use the redacted auth envelope. The boot and `/auth/me*` routes forward to Express with `res.req.next(error)` (OD-2).

Admin JSON routes are Jini `defineJsonRoute` specs mounted with `mountJsonRoute` and explicit deps;
`inbound/admin-http/admin-json-route-ports.ts` supplies the host ports. Its `authorize` port turns a
by-id route's `{ entityId }` scope into the `entityId` field of `deps.authorize`; list/import send none.
Covered by `inbound/admin-http/routes/redirects/__tests__/authorize-entity-id.test.ts`.
