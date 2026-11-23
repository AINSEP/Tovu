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
