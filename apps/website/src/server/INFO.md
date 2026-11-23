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
On a mount that opts in (`deferMissingPrincipal`), the `authenticate` port answers `undefined`
without a session, so a spec's `parse` refusal (400) still precedes the missing-session 500, as in
the hand-written parse-first routes; `authorize` then fails closed. Every other mount fails in
`authenticate`, before parse, as before. `authorizationByPermission` answers one permission from a
different source than the mount default.
Menus (`runtime/composition/modules/menus.ts`) mount `@jini-ai/cms/admin-http/routes/menus/*` and
inject `MENU_RAW_HTML_PERMISSION`, the Node `normalizeMenuHtml` and the host `trashMenu`; read,
update-tree and assign mount `"direct"`, create and delete `"guarded"`, as before; update-tree's
raw-HTML check is overridden to `"guarded"` (its hand-written `authorizeOrRespond`), and create,
update-tree and assign-location opt into the deferral.
