# R-admin-http-1 — admin-http → @jini-ai/cms (Jini step J then Tovu step T)

Lane R. Batch J:22 T:24. Depends on: none (only already-Jini code). Est: J 63 min, T 30 min.

## J — move verbatim into Jini (7 files, 642 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/server/inbound/admin-http/http/entity-not-live.ts` | `packages/cms/src/admin-http/http/entity-not-live.ts` | 22 |  |
| `apps/website/src/server/inbound/admin-http/http/forms.ts` | `packages/cms/src/admin-http/http/forms.ts` | 156 |  |
| `apps/website/src/server/inbound/admin-http/routes/assistant/execution-request-fields.ts` | `packages/cms/src/admin-http/routes/assistant/execution-request-fields.ts` | 31 |  |
| `apps/website/src/server/inbound/admin-http/routes/settings/preview-feed-access.ts` | `packages/cms/src/admin-http/routes/settings/preview-feed-access.ts` | 24 |  |
| `apps/website/src/server/inbound/admin-http/sea-runtime.ts` | `packages/cms/src/admin-http/sea-runtime.ts` | 41 |  |
| `apps/website/src/server/inbound/admin-http/admin-dev-proxy.ts` | `packages/cms/src/admin-http/admin-dev-proxy.ts` | 265 | W3 |
| `apps/website/src/server/inbound/admin-http/admin-static.ts` | `packages/cms/src/admin-http/admin-static.ts` | 103 | W2 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./admin-http/admin-dev-proxy"]
- "@jini-ai/cms" exports["./admin-http/admin-static"]
- "@jini-ai/cms" exports["./admin-http/http/entity-not-live"]
- "@jini-ai/cms" exports["./admin-http/http/forms"]
- "@jini-ai/cms" exports["./admin-http/routes/assistant/execution-request-fields"]
- "@jini-ai/cms" exports["./admin-http/routes/settings/preview-feed-access"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (7, 806 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/server/inbound/admin-http/http/__tests__/entity-not-live.test.ts`
- `apps/website/src/server/inbound/admin-http/http/__tests__/forms-response.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/assistant/__tests__/execution-request-fields.test.ts`
- `apps/website/src/server/inbound/admin-http/__tests__/integration/admin-static.integration.test.ts`
- `apps/website/src/server/inbound/admin-http/__tests__/sea-runtime.test.ts`
- `apps/website/src/server/inbound/admin-http/__tests__/admin-dev-proxy-path.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/__tests__/admin-dev-proxy.test.ts`


## T — Tovu repoint: delete the 7 sources, rewrite every importer (21 lines)

```
apps/website/src/server/inbound/admin-http/routes/email-templates/routes.ts:20  '#src/server/inbound/admin-http/http/entity-not-live' -> '@jini-ai/cms/admin-http/http/entity-not-live'
apps/website/src/server/inbound/admin-http/routes/media/update.ts:7  '#src/server/inbound/admin-http/http/entity-not-live' -> '@jini-ai/cms/admin-http/http/entity-not-live'
apps/website/src/server/inbound/admin-http/routes/menus/assign-location.ts:8  '#src/server/inbound/admin-http/http/entity-not-live' -> '@jini-ai/cms/admin-http/http/entity-not-live'
apps/website/src/server/inbound/admin-http/routes/menus/update-tree.ts:14  '#src/server/inbound/admin-http/http/entity-not-live' -> '@jini-ai/cms/admin-http/http/entity-not-live'
apps/website/src/server/inbound/admin-http/routes/pages/update-html.ts:14  '#src/server/inbound/admin-http/http/entity-not-live' -> '@jini-ai/cms/admin-http/http/entity-not-live'
apps/website/src/server/inbound/admin-http/routes/seo/put-entry.ts:15  '#src/server/inbound/admin-http/http/entity-not-live' -> '@jini-ai/cms/admin-http/http/entity-not-live'
apps/website/src/features/forms/__tests__/lost-update-boundaries.test.ts:9  '#src/server/inbound/admin-http/http/forms' -> '@jini-ai/cms/admin-http/http/forms'
apps/website/src/server/inbound/admin-http/routes/forms/authoring.ts:9  '#src/server/inbound/admin-http/http/forms' -> '@jini-ai/cms/admin-http/http/forms'
apps/website/src/server/inbound/admin-http/routes/forms/create.ts:5  '#src/server/inbound/admin-http/http/forms' -> '@jini-ai/cms/admin-http/http/forms'
apps/website/src/server/inbound/admin-http/routes/forms/get-by-id.ts:4  '#src/server/inbound/admin-http/http/forms' -> '@jini-ai/cms/admin-http/http/forms'
apps/website/src/server/inbound/admin-http/routes/forms/get-submission.ts:4  '#src/server/inbound/admin-http/http/forms' -> '@jini-ai/cms/admin-http/http/forms'
apps/website/src/server/inbound/admin-http/routes/forms/list-submissions.ts:6  '#src/server/inbound/admin-http/http/forms' -> '@jini-ai/cms/admin-http/http/forms'
apps/website/src/server/inbound/admin-http/routes/forms/list.ts:4  '#src/server/inbound/admin-http/http/forms' -> '@jini-ai/cms/admin-http/http/forms'
apps/website/src/server/inbound/admin-http/routes/forms/update.ts:4  '#src/server/inbound/admin-http/http/forms' -> '@jini-ai/cms/admin-http/http/forms'
apps/website/src/server/inbound/admin-http/routes/assistant/list-models.ts:8  './execution-request-fields.js' -> '@jini-ai/cms/admin-http/routes/assistant/execution-request-fields'
apps/website/src/server/inbound/admin-http/routes/assistant/test-connection.ts:8  './execution-request-fields.js' -> '@jini-ai/cms/admin-http/routes/assistant/execution-request-fields'
apps/website/src/server/inbound/admin-http/routes/settings/__tests__/preview-feed-access.test.ts:6  '../preview-feed-access.js' -> '@jini-ai/cms/admin-http/routes/settings/preview-feed-access'
apps/website/src/server/inbound/admin-http/routes/settings/events.ts:71  './preview-feed-access.js' -> '@jini-ai/cms/admin-http/routes/settings/preview-feed-access'
apps/website/src/cli/commands/serve-listen.ts:14  '../../server/inbound/admin-http/admin-dev-proxy.js' -> '@jini-ai/cms/admin-http/admin-dev-proxy'
apps/website/src/index.ts:34  './server/inbound/admin-http/admin-dev-proxy.js' -> '@jini-ai/cms/admin-http/admin-dev-proxy'
apps/website/src/server/runtime/composition/http-app/public-middleware.ts:28  '../../../inbound/admin-http/admin-static.js' -> '@jini-ai/cms/admin-http/admin-static'
```

## Tovu tests that must stay green (2; import lines are repointed above, assertions untouched)
- `apps/website/src/features/forms/__tests__/lost-update-boundaries.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/settings/__tests__/preview-feed-access.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/server/inbound/admin-http/admin-dev-proxy.ts` (3)
- `apps/website/src/server/inbound/admin-http/admin-static.ts` (2)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/server/inbound/admin-http/admin-dev-proxy.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why
- `apps/website/src/server/inbound/admin-http/admin-static.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/server/inbound/admin-http/admin-dev-proxy.ts:255: const devProxyUrl = process.env.TOVU_ADMIN_DEV_PROXY_URL;
apps/website/src/server/inbound/admin-http/admin-static.ts:77: const devProxyUrl = process.env.TOVU_ADMIN_DEV_PROXY_URL;
```

## Named mutation
in the Jini copy of `admin-dev-proxy.ts`, negate the first `if (` condition of its first exported function; `admin-static.integration.test.ts` must go red, then revert
