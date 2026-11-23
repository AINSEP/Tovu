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

Admin JSON routes are Jini `defineJsonRoute` specs mounted with `mountJsonRoute` and explicit deps;
`inbound/admin-http/admin-json-route-ports.ts` supplies the host ports. Its `authorize` port turns a
by-id route's `{ entityId }` scope into the `entityId` field of `deps.authorize`; list/import send none.
Covered by `inbound/admin-http/routes/redirects/__tests__/authorize-entity-id.test.ts`.
