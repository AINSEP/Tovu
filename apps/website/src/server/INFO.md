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
Content lane (L1): each family's registrars live in `runtime/composition/modules/<family>.ts`
(`change-sets`, `email-templates`, `pages`, `posts`, `presentation`, `themes`, `theme-explore`);
`modules/content.ts` registers them in the original order, plus the routes that stay hand-written
(posts/pages create/update/delete and pages update-html read `Idempotency-Key` and answer the 1 MiB
cap with Tovu's own 413 copy; PATCH presentation keeps `adminFailureResponse`'s copy; posts
template-preview and themes preview are non-JSON). `inbound/admin-http/http/plugin-hook-error.ts`
binds the Jini `PLUGIN_HOOK_FAILED` envelope to `PluginHookFailedError`, `pluginHookRefusalText` and
`redactSecretShapes`. Mounts whose hand-written route never named an entity type drop the spec's
`entityType` in their authorize binding (posts/pages reads, autosave, email templates), so a
resource-scoped grant cannot start matching. The email-template writes keep `rejectOversizedJsonBody`
in the same registration as the mounted spec.
