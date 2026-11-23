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
Skills (`runtime/composition/modules/skills.ts`, which now holds `SkillsRouteDeps`/`SkillsRouteRegistrar`) mounts
`@jini-ai/cms/admin-http/routes/skills/{files,install,set-enabled,uninstall,guidance}`, all `"guarded"`; files uses operation
`routes/skills/files`, the four management routes `routes/skills/manage` with "Could not change skills. Try again.". It binds
the booted `skillLayout`/`siteBinding` per call, `readPluginPackageFiles` + `PLUGIN_PACKAGE_FILE_LIMITS`, `SKILL_STATE_FILE`, the
install-service functions, `buildSkillToolRegistrations` with `withExtensionApprovalPolicy`, and `instanceof SkillInputError`.
`routes/skills/list.ts` stays hand-written: it answers `ETag`/`304` with `Cache-Control`.
Integrations (`runtime/composition/modules/integrations-admin.ts`, which keeps `IntegrationsRouteDeps`,
`IntegrationsRouteRegistrar` and the egress-deps builder `toWebhookSubscriptionDeps`) mounts
`@jini-ai/cms/admin-http/routes/integrations/{list,create,pause,delete,deliveries}`; create and pause `"guarded"`, list,
delete and deliveries `"direct"`. Each registrar binds `#src/features/webhooks` (`createSubscription`, `pauseSubscription`,
`deleteSubscription` plus the validation/not-found matchers) at request time; the dev-mode `"user-local"` owner placeholder
is bound in the create registrar.
Ops (`runtime/composition/modules/core.ts`) registers `/health` and `/healthz` from `@jini-ai/cms/public-http/routes/ops/health`
through `mountPublicJsonRoute` (`registerHealthRoute`/`registerHealthzRoute`, `deps: {}`, operations `ops:health`/`ops:healthz`),
first in the core module as before. `/readyz` stays hand-written in `inbound/public-http/routes/ops/health.ts` because
`features/deployments/deploy-config.ts` reads the health-check path from that file's `registerReadyzRoute` source.
Commerce (`runtime/composition/modules/commerce.ts`) exports `registerAdminCommerceStatusRoute`, mounting the Jini
`commerceStatusRoute` (`"direct"`, operation `routes/commerce/status`) with `readCommerceStatus` from `@jini-ai/commerce` bound
to `deps.lipay` per request. Production leaves it unmounted, as before; only tests mount it.
Site profile (`runtime/composition/modules/site.ts`, mounted from `http-app/mount-admin-system.ts`) mounts the Jini
`siteProfileRoute` (`"direct"`, operation `routes/site/profile`), binding `buildSiteProfile(toSiteProfileDeps(deps))` and the
`SITE_PROFILE_SECTION_NAMES`/`MAX_PAGE_ITEMS` constants.
Redirects (`modules/redirects.ts`) now mounts all seven redirects routes as Jini specs; `registerAdminRedirectCreateRoute`
mounts `redirectCreateRoute` `"guarded"` (the publishing-credential override honoured, as `authorizeOrRespond` did) with
failure operation `routes/redirects/shared`.
