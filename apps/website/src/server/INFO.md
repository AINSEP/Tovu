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
The `authenticate` port answers `undefined` without a session, so a spec's `parse` refusal (400)
still precedes the missing-session 500, as in the hand-written routes; `authorize` then fails closed.
Menus (`runtime/composition/modules/menus.ts`) mount `@jini-ai/cms/admin-http/routes/menus/*` and
inject `MENU_RAW_HTML_PERMISSION`, the Node `normalizeMenuHtml` and the host `trashMenu`; read,
update-tree and assign mount `"direct"`, create and delete `"guarded"`, as before.
Recovery/database (`modules/database-recovery.ts`, `modules/recovery-restore.ts`,
`modules/database-migrate-forward.ts`): status binds the operation-lock peek and the db banner
precedence; the restore and migrate-forward ceremonies bind the gated-mutation gateway, the
restore/migrate hooks, the operation lock and the db orchestrator per request, mount `"direct"`, and
pass `getAuthedPrincipal`'s diagnosis as `missingPrincipalMessage`. `DatabaseRecoveryRouteDeps`
lives in `modules/database-recovery.ts`.
Publish-content (`modules/publish-content-transport.ts`) mounts the peer and destination specs
`"guarded"`; plugins (`modules/plugins.ts`) mounts list/files/uninstall/preview `"guarded"` and
injects `pluginHookFailedBody` (stays in Tovu until lane L1 moves it). Both drop the spec's
`entityType` before `deps.authorize`, because those hand-written routes never sent one.
Still hand-written: routes that read `res.locals.authCredentialKind` or the publish-trust grant
(publish-content import/backstop/bundle-create/export/capabilities/peer-transport, plugins
provider-settings) — they need that context on the admin JSON ports — and the byte/stream/upload
routes (blob-get/put, blobs-probe's own 413 body, export, plugins install/chart-providers).
