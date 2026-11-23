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
