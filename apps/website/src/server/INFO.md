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
