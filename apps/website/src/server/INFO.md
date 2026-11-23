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
Members (`runtime/composition/modules/members.ts`) mount `@jini-ai/cms/admin-http/routes/members/{list,get-by-id,disable,delete}`
and inject the disable write service (bound to `toMembersWriteServiceDeps(deps)` per request), the `trashMember` move
(bound to `memberRepo`, `removeMember`, `clock`) and `classifyMemberError` (the `features/members` error classes); list and
get-by-id mount `"direct"`, disable and delete `"guarded"`, as before. `request-magic-link` (and `routes/members/deps.ts`)
stays hand-written: its 429 carries a `Retry-After` header a Jini route refusal cannot carry yet.
Trash (`runtime/composition/modules/trash.ts`, which now holds `TrashRouteDeps`/`TrashRouteRegistrar`) mounts
`@jini-ai/cms/admin-http/routes/trash/{list,restore,purge,items}` (all `"direct"`, operations `routes/trash/<file>`) and binds
`TRASH_READ_PERMISSION` + `deps.authorize` as the injected entry gate (`authorizeEntry`, so the port call keeps its exact
`{ principalId, permission, workspaceId }` params), `mayActOnEntityType`/`filterVisibleTrashItems` as the per-kind policy,
`moveToTrash` as the move and the column-only `posts.kind` query as `loadPostDisplayKinds`; `trash`/`clock` stay per-request getters.
