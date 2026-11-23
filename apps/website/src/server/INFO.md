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
System mail (`runtime/composition/modules/system-mail.ts`) mounts `@jini-ai/cms/admin-http/routes/system/mail-*`
(all `"direct"`); the live mailer, status source and platform operations are read per request because boot
swaps them in after mount. `routes/system/mail-providers.ts` stays hand-written: its credential PUT reads
`res.locals.authCredentialKind`, which the admin ports do not carry.
Sites (`runtime/composition/modules/sites.ts`) owns `registerAdminSitesRoutes`/`registerSitesHomeRoutes`/
`registerLocalSitesRoutes` and mounts the Jini sites specs `"guarded"`, binding the site-dir layer,
`createSiteForOwner`, `activateSiteWithWarmServer`, the token catalog and the Node directory probe. Still
hand-written: `PUT …/sites/config` (two failure copies by phase), the socket-reading list and the
header-gated `/internal/dev-warm-site` (`routes/system/sites.ts`), card previews (binary) and the warm relay.
Saved credentials (`runtime/composition/modules/system-credentials.ts`) mount the source-control (5), custom
(create, delete) and publish (create/update/verify/delete) specs, all `"direct"` with their old `sendAdminFailure`
operations; store deps are bound once at registration as before and the heal scheduler is built once per
registration and injected. Still hand-written in `inbound/admin-http/routes/system/`: custom list and update
(they read `res.locals.authCredentialKind`), the publish GET list (a pinned direct-call rejection) and
`credential-copy.ts` (socket/headers, `Cache-Control: no-store`). Their Jini specs for publish list and custom
list/update exist but are not mounted until the admin ports carry the credential kind.
Site shares, imports, backups and the share password (`routes/system/site-*.ts`) stay hand-written: they need
per-route response headers, a `{ code, message }` refusal/workspace-404 body, the publish-trust context and
per-error failure copy from the admin ports (owner decisions).
Settings (`runtime/composition/modules/settings.ts`) mounts the 7 Jini settings specs `"direct"` with failure
`{ operation: "routes/settings", message: "The settings request could not finish." }`, binding readiness, the
ledger, `SETTINGS_WRITE_FENCE`, `createTovuSettingsService` (comments-provider refusal, site-title bounds,
mail-cache invalidation) and the `settings.user.read` cross-principal policy from
`inbound/admin-http/routes/settings/shared.ts` (host composition). The SSE feed (`events.ts`) stays hand-written.
