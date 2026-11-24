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
w3-rtfnd per-mount opt-ins (all default off, so existing mounts answer as before): `sessionCredentialOnly`
(`rejectUnlessSessionCredential`'s 403 in `authenticate`), `forbidden` (a route's own denial body), `failureFor`
(per-error failure options) and `failureCopy: "operation"` (`adminFailureResponse`'s operation-only body). A spec
that branches on the credential kind or the publish-trust grant gets `adminRequestFactsFor`
(`inbound/admin-http/admin-request-facts.ts`) bound into its deps, keyed on the request's principal copy. Every
admin and public mount binds http-kit's `requestFacts` port to `routeRequestFactsFor` (client address via
`captureRequestFacts`, `User-Agent`, `Host`), read only by a spec that opts in; a public mount given `workspaceId`
answers the shared workspace 404. Non-JSON specs mount through `admin-raw-route-ports.ts`
(`mountAdminRawRoute`/`mountPublicRawRoute`, same ports, `app[method]` registration). An `authorize` call without
`entityType` reaches `deps.authorize` without the key. Template: `plans/K1-route-template.md` §9.
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
account-protection guard and the host error classes as predicates. `modules/users-access.ts` also
mounts list-roles, list-policies and list-policy-permissions (`"guarded"`, `role.manage` with no
`entityType`) and remove-policy-permission (`"direct"`; binds `deps.transactions`, the row read and the
host owner guards `principalHoldsOwnerWildcard`/`assertActiveOwnerFloor`; bare 204 via `routeReply`). `routes/users/deps.ts` stays
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
get-by-id mount `"direct"`, disable and delete `"guarded"`, as before. `request-magic-link` (w3 C2d,
`registerAdminMemberRequestMagicLinkRoute`) mounts `@jini-ai/cms/admin-http/routes/members/request-magic-link` (`"direct"`,
operation `routes/members/request-magic-link`) and injects the app's shared `magicLinkPerEmailLimiter` (consulted only after
`authorize()`, INV-NEW-03), `requestSignInLink` bound to `toMembersWriteServiceDeps(deps)`, `classifyMemberError` (now also
naming `MemberSignInUnavailableError`/`SenderIdentityNotConfiguredError`) and `MEMBER_SENDER_NOT_CONFIGURED_MESSAGE`; its 429
carries `Retry-After` through `routeReply`. `routes/members/deps.ts` stays.
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
The list mounts `@jini-ai/cms/admin-http/routes/skills/list` (`"guarded"`, operation `routes/skills/list`), binding
`listManagedSkills` over the same per-call `skillLayout`/`siteBinding`; the spec answers `ETag`/`304`/`Cache-Control`/`Vary`.
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

Consent (`runtime/composition/modules/consent.ts`) exports `registerAdminConsentRoutes`, mounting the six Jini
`@jini-ai/cms/admin-http/routes/consent/routes` specs in the hand-written order (`"guarded"`, failure `consent-admin`
503 `CONSENT_UNAVAILABLE` with the enforcement copy). It binds the consent service, `readConsentRequest`/`consentRevisionToken`
from `features/consent/request` and `isConsentConflict` (`SiteConsentConflict`); `Cache-Control: no-store` comes from the spec.
Presentation PATCH (`modules/presentation.ts` `registerAdminPresentationPatchRoute`) mounts `presentationPatchRoute`
(`"direct"`, operation `routes/presentation/patch-active-theme`, `failureCopy: "operation"`), binding `setActiveTheme`
(repo, tracker, clock, `writableThemeIds`), `ThemeStylingRequiredError`, theme discovery, the preview refresh and the DTO.

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

System mail (`runtime/composition/modules/system-mail.ts`) mounts `@jini-ai/cms/admin-http/routes/system/mail-*`
(all `"direct"`); the live mailer, status source and platform operations are read per request because boot
swaps them in after mount. Mail providers mount list, credential plan and activate from Jini in the original
order around the credential PUT, which stays hand-written in `routes/system/mail-providers.ts` (it reads
`res.locals.authCredentialKind`, which the admin ports do not carry) and shares Jini's `mailProviderRefusal` table.
`routes/system/site-key.ts` (session-credential gate before the workspace 404, `Cache-Control: no-store`) and
`browser-telemetry.ts` (204 beacon, `Retry-After`, content-length) stay hand-written.
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
System deploy (`runtime/composition/modules/system-deploy.ts`) mounts the overview and export specs `"direct"` and
publish status/preview/targets `"guarded"`, binding `buildDeploymentOverviewSnapshot`, `DEFAULT_OWNER_PASSWORD`,
the export run slot shared with the agent export tools and the publish readers. The publish trigger (blocked-publish
product events), the destinations listing (publish-trust peer read from `res.locals`) and `dockerfile-source.ts`
(ETag/If-Match headers) stay hand-written, registered in their original order.
Settings (`runtime/composition/modules/settings.ts`) mounts the 7 Jini settings specs `"direct"` with failure
`{ operation: "routes/settings", message: "The settings request could not finish." }`, binding readiness, the
ledger, `SETTINGS_WRITE_FENCE`, `createTovuSettingsService` (comments-provider refusal, site-title bounds,
mail-cache invalidation) and the `settings.user.read` cross-principal policy from
`inbound/admin-http/routes/settings/shared.ts` (host composition). The SSE feed (`events.ts`) stays hand-written.
Assistant owner grants (`runtime/composition/modules/system-assistant.ts`, `registerAssistantOwnerGrantRoutes`) mount
the Jini `createOwnerGrantRoutes` pairs `"direct"` with the settings failure copy, readiness bound to
`settingsUiTabsReady`, the `SETTINGS_WRITE_FENCE` and `set` over `toWriteServiceDeps`; the subagents read projection
(`projectAssistantSubagentsRead`) is host policy and lives there too.

SEO (`runtime/composition/modules/seo.ts`) mounts `@jini-ai/cms/admin-http/routes/seo/*` and injects
`seoReady` (every SEO spec waits on it before authorizing), the host `seo.*` settings ledger
(`readSeoSettings`/`writeSeoSettings` over `features/seo/settings.ts`), the sitemap cache and, for
put-entry, `entryAuthorize` (the RBAC `deps.authorize` its write chokepoint re-checks with). Put-entry
mounts `"guarded"` with its operation-only 500 copy pinned (`PUT_ENTRY_FAILURE`); the rest `"direct"`.
The public sitemap/robots/llms/feed routes in the same module stay hand-written (non-JSON).
Media (`runtime/composition/modules/media.ts`) mounts `@jini-ai/cms/admin-http/routes/media/{update,trash,
delete,get-providers,put-providers}` (delete `"guarded"`, the rest `"direct"`) and binds the single-asset
DTO lookups (recorded content type, public URL, blob size), the transactional `removeMedia` trash flip,
the reference-checked `purgeMedia` + `forgetRemovedMedia`, and the provider credential store with
`MEDIA_PROVIDER_SAVE_ERRORS` (its refusal table, incl. the 503 site-key copy). The admin media DTO is
`@jini-ai/cms/admin-http/http/media`. list, where-used, import-url, text, upload, replace and original
`@jini-ai/cms/admin-http/http/media`. list and original
remain hand-written (non-JSON headers/bodies, or a 403 copy the admin ports do not write).
Assistant settings, credentials and visitor tools (`runtime/composition/modules/assistant-settings.ts`)
mount `@jini-ai/cms/admin-http/routes/assistant/*` `"direct"` and inject `ADMIN_ASSISTANT_PERMISSION`, the
settings ledger, the sealed site/execution credential stores, the visitor-tools service and each route's
ordered error table (host classes, the 503 site-key copy, the visitor-tools 409 `reload`). Execution-credential
and visitor-tools routes ask no RBAC permission (session-scoped / service-authorized), as before.
The execution probes (`modules/assistant-execution.ts`: detect-agents, list-models, test-agent,
test-connection) mount `"direct"` with `detectAgents`/`testAgent`/`listModels`/`testConnection` bound
here (DNS/dispatcher seams, redirect refusal, detection cache) and `resolveProbeCredential` from
`inbound/admin-http/routes/assistant/stored-credential-probe.ts`, which stays host-side.
`get-chat-attachment.ts` stays hand-written (binary bytes).

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

update-tree and assign mount `"direct"`, create and delete `"guarded"`, as before.
Agent plugins memory GET/PUT (`modules/agent-plugin-memory-routes.ts`, own module so the error test's partial
mocks load) mount `@jini-ai/cms/admin-http/routes/agent-plugins/memory` (`"guarded"`) with the installed check,
`pluginMemory` and the default caps bound; PUT's `failureFor` claims only errors its bound `writeNote` threw
(`agent-plugins:write-note`, "The note could not be saved."), so a failing list read keeps the route's copy.
Media where-used (`modules/media.ts`) mounts `@jini-ai/cms/admin-http/routes/media/where-used` (`"direct"`) with
`findMediaWhereUsed` bound and `forbidden` answering `{ error: "media.read is required", code: "FORBIDDEN" }` (no details).
Media import-url (`modules/media.ts`, `registerAdminMediaImportUrlRoute`) mounts `@jini-ai/cms/admin-http/routes/media/import-url`
(`"direct"`, `routes/media/import-url` 500) with `fetchImage` (the `mediaImportHttpClient` egress client), `uploadMedia`
(Tovu cap), `mediaContentTypeStore.set`, the public-URL resolver and `egressRefusalMessage` (`EgressRefusedError` →
`logEgressRefusal`, default `console.warn`, then its `callerSafeMessage`) bound; `forbidden` answers
`{ error: "not authorized for media.upload", code: "FORBIDDEN", details: { permission: "media.upload", reason } }`.
Media text/replace/upload (`modules/media.ts`, w3 C4c) mount `@jini-ai/cms/admin-http/routes/media/{text,replace,upload}`
(all `"direct"`): text binds `readDocumentText` (`readText`; `forbidden` answers `{ error: "media.read is required", code: "FORBIDDEN" }`,
no `failure` so the 500 keeps the route-derived copy); replace binds `replaceMediaFile` (`replaceFile`, Tovu 50 MiB cap) and
`toStoredMediaResponse` (`describeStored`); upload binds `uploadMedia` + `createDocumentArchiveReader` (`storeUpload`),
`mediaContentTypeStore.set`, `captureMediaUploaded` (`onUploaded`, kind refined by `uploadedMediaKind`) and `describeStored`,
with `deferMissingPrincipal` (its body 400s precede the session). replace/upload 500s use `MEDIA_WRITE_FAILURE` (`routes/media/route-guards`).

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
Plugins set-enabled mounts `"direct"` and binds `deps.authorize` raw and lazily as
`authorizeCommand` (the cms `executeCommand` gateway names the `plugin-activation` entity itself),
plus the pre-bound `setPluginEnabled`, `lowerPluginToolAccess`, `recordSiteApproval` and the
`ToolAccessLoweringError` + plugins host error classes.
Still hand-written: routes that read `res.locals.authCredentialKind` or the publish-trust grant
(publish-content import/backstop/bundle-create/export/capabilities/peer-transport, plugins
provider-settings) — they need that context on the admin JSON ports — and the byte/stream/upload
routes (blob-get/put, blobs-probe's own 413 body, export, plugins install/chart-providers).
Plugins provider-settings (w3 C3) is now `@jini-ai/cms/admin-http/routes/plugins/{provider-settings,project-key-use}`
mounted `"guarded"` by `registerPluginProviderSettingsRoutes` in `modules/plugins.ts`, which binds
`declaredProviderSettingFields`, `saveProviderSettings` (+ `reapplyProvider`) and the owner-only copy;
project-key use mounts `sessionCredentialOnly` (the owner-session 403) instead of reading the kind itself.

Publish-content bundle-create (w3 C3b) is `@jini-ai/cms/admin-http/routes/publish-content/bundle-create`,
mounted `"guarded"` by `modules/publish-content-ingest.ts` through `cappedApp` (its own 413 body, same
route row) with `requestFacts: true`; it binds the content-type registry, the grant rules, the manual-send
reader/audit probe and `adminRequestFactsFor`'s `publishTrust` per request.
Publish-content capabilities (w3 C3c) is `@jini-ai/cms/admin-http/routes/publish-content/capabilities`,
mounted `"guarded"` by `modules/publish-content-ingest.ts`; it binds the content-type registry, the backstop
grant rules and `adminPublishTrustFor` (grant-only: the route never reads the credential kind) per request.
Publish-content import (w3 C3c) is `@jini-ai/cms/admin-http/routes/publish-content/import`, mounted `"guarded"`
with `failureCopy: "operation"` (`IMPORT_FAILURE`) by `modules/publish-content-import.ts`; it binds the gateway
calls, `withGrantAuthorize`/`withGrantContentAuthorize` over `adminPublishTrustFor`, `adminRequestFactsFor`'s
credential kind and `knownImportErrorResponse` (the typed arms of `import-errors.ts`) per request.
Publish-content send by hand (w3 C3d) is `@jini-ai/cms/admin-http/routes/publish-content/backstop`, mounted
`"direct"` by `modules/publish-content-backstop.ts` (`registerPublishBackstopRoutes`): status/run/send/undo with
`sessionCredentialOnly` (`BACKSTOP_FORBIDDEN`, `publish.backstop`), gaps with `forbidden` (its own 403 copy); it binds
the owner/admin-role rule, the audit storage, the raw row/file contributors, the backstop-scoped peer transport, the
undo transaction and `backstopRefusal` (`BackstopRefusal` 409, else `peer-transport.ts`'s `knownPeerActionRefusal`).

- Posts/pages create, update, delete (w3 C1b): `runtime/composition/modules/{posts,pages}.ts` mount the `@jini-ai/cms/admin-http/routes/{posts,pages}/*` specs with `readHeaders: ["idempotency-key"]` behind the host `cappedApp` body cap (create/update); `modules/content-write-bindings.ts` binds the post services, body-to-input mapping, rollback inverses, error classes, `processOutbox` drain and the plugin-hook envelope.- Publish-trust handshake (w3 C2c): `runtime/composition/modules/publish-trust.ts` (`registerPublishTrustHandshakeRoutes`, called by `modules/core.ts`) mounts the `@jini-ai/cms/public-http/routes/publish-trust/handshake` specs with `mountPublicJsonRoute`; it binds the per-IP limiter (one instance for challenge + session), the refusal copy, the redacting `[publish-trust] handshake …` log, the once-per-registration `targetInstallationId` (keyless ⇒ `null`, other failures logged once) and the `features/publish-trust/*` trust decisions.

- Public members sign-out (w3 C5): `runtime/composition/modules/public-members.ts` (`registerPublicMemberSignOutRoute`, called by `modules/members.ts`) mounts `@jini-ai/cms/public-http/routes/members/sign-out` with `mountPublicRawRoute` on `memberPostApp`, an app view whose `post` runs `checkMemberPost` (workspace 404, comments same-origin 403, 4 KiB post-parse 413) on the Express request before the spec; it binds the member cookie reader, `clearedMemberSessionCookie`, `NodeSessionTokens` hashing, `memberAuthRefusal` and `MEMBER_AUTH_FAILURE` (all in `inbound/public-http/routes/members/complete-sign-in.ts`).
- publish-content peer pull (w3 C3e): `POST .../peers/:peerId/pull` is the Jini spec `@jini-ai/cms/admin-http/routes/publish-content/peer-transport`, mounted last by `modules/publish-content-transport.ts`'s `registerPublishContentPeerTransportRoutes` (injected: `pullAndStageFromPeer`, `knownPeerActionRefusal`). The three push routes stay hand-written in `routes/publish-content/peer-transport.ts` (`registerPublishContentPeerPushRoutes`): their live-site 403 precedes the workspace 404.
- Public members password/me/login-providers (w3 C5b): `runtime/composition/modules/public-members.ts` also holds `registerPublicMemberResetPasswordRoute`, `registerPublicMemberSetPasswordRoute`, `registerPublicMemberForgotPasswordRoute` (each `mountPublicJsonRoute` on `memberPostApp`), `registerPublicMemberMeRoute` and `registerMemberLoginProvidersRoute` (plain `mountPublicJsonRoute`; workspace 404 from the public ports), mounting `@jini-ai/cms/public-http/routes/members/{reset-password,set-password,forgot-password,me,login-providers}`. It binds the shared limiters through `liveLimiter` (read per request), the members service calls, `readRequestCookie` / `uniqueMemberCookie`, `publicMemberIdentities`, `memberAuthRefusal` (`complete-sign-in.ts`), `memberSignInRefusal` + `MEMBER_SIGN_IN_FAILURE` (`sign-in.ts`), `memberOidcRefusal` (`oidc-deps.ts`), and the `setImmediate` delivery reporting through `reportMemberDeliveryFailure`.
