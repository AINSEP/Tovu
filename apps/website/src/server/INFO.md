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
Users (`runtime/composition/modules/users.ts` for the 9 principal routes, `modules/users-access.ts`
for 7 role/policy routes) mount `@jini-ai/user-management/admin-http/routes/users/*`, all `"direct"`.
Each registrar binds the identity service its spec calls from `@jini-ai/user-management/server`, the
identity deps assembler (`identityServiceDepsFrom`, per request), the Trash index/move, the
account-protection guard and the host error classes as predicates. list-roles, list-policies,
list-policy-permissions and remove-policy-permission are still hand-written (`routes/users/`): their
authorize call sends no `entityType` / their 204 is a bare `res.send()`. `routes/users/deps.ts` stays
(the `UsersRouteDeps` bag and `identityServiceDepsFrom`, ~40 composition importers).
Owner MFA: `modules/owner-auth.ts` binds `ownerMfaDepsFrom` to Jini's `composeOwnerMfaDeps`; the
owner MFA/passkey/recovery route files stay hand-written in `inbound/admin-http/`.
Newsletter (`modules/newsletter.ts`) mounts all 19 `@jini-ai/cms/admin-http/routes/newsletter/*`
specs, `"direct"`, `failure.operation` `http/newsletter` with the pre-move 500 copy pinned
(`NEWSLETTER_FAILURE_COPY`). The newsletter services stay in `features/newsletter/` and are bound per
route; `features/newsletter/http-error-responses.ts` is the injected error-class → response table
(`http/newsletter.ts` is gone). `routes/newsletter/deps.ts` stays (its bag + `toSendPipelineDeps`).
