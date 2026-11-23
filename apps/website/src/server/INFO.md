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
Public OAuth callbacks (`runtime/composition/public-oauth-callbacks.ts`) mount Jini `ServerRoute`s
(`@jini-ai/cms/public-http/routes/{api-connections,external-mcp}/oauth-callback`) with
`mountJiniRouteInPlace` (`jini-routes.ts`): each stays an Express `route get` row with Express's own
params, gets the request facts in `locals`, and answers through http-kit's `sendWebResponse`; a throw
goes to `next(error)`. The registrar binds Tovu's copy and message types (`inbound/public-http/routes/oauth/callback-page.ts`),
the callback path, binding-cookie rules, `ApiConnectionError`/`OAuthError`/`ExternalMcpValidationError`
predicates, `notifyExternalMcpRosterChanged`, the `TOVU_PUBLIC_URL` origin policy
(`resolvePublicOriginFor`) and the console logger.
External MCP (`modules/external-mcp.ts`) mounts `@jini-ai/cms/admin-http/routes/external-mcp/*` (list, put,
delete, admissions, tool-approvals, oauth disconnect; all `"direct"`) and injects the store functions,
`notifyExternalMcpRosterChanged`, built-in ownership rules and the host error classes as predicates;
probe, OAuth connect/sign-in/device-poll and the session-credential routes stay hand-written (`routes/external-mcp/`).
Agent plugins (`modules/agent-plugins-routes.ts`) mount `@jini-ai/cms/admin-http/routes/agent-plugins/{list,files,set-enabled}`
(`"guarded"`) with the activation service, MCP provisioning, error predicates and activation copy injected;
id-free checks send `entityType: ""` (the port requires a string; RBAC treats it as the old absent value).
