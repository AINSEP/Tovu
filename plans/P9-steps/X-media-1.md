# X-media-1 — media → @jini-ai/cms (Jini step J then Tovu step T)

Lane X. Batch J:6 T:7. Depends on: P-publish-content-1. Est: J 65 min, T 43 min.

## J — move verbatim into Jini (10 files, 731 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/media/bootstrap.ts` | `packages/cms/src/media/site/bootstrap.ts` | 87 |  |
| `apps/website/src/features/media/chat-preview.ts` | `packages/cms/src/media/site/chat-preview.ts` | 36 |  |
| `apps/website/src/features/media/content-type-store.ts` | `packages/cms/src/media/site/content-type-store.ts` | 81 | W1 |
| `apps/website/src/features/media/hydrate-blob-store-from-seed.ts` | `packages/cms/src/media/site/hydrate-blob-store-from-seed.ts` | 232 | W1 |
| `apps/website/src/features/media/original-bytes.ts` | `packages/cms/src/media/site/original-bytes.ts` | 24 |  |
| `apps/website/src/features/media/public-path.ts` | `packages/cms/src/media/site/public-path.ts` | 66 |  |
| `apps/website/src/features/media/upload-content-type.ts` | `packages/cms/src/media/site/upload-content-type.ts` | 44 |  |
| `apps/website/src/features/media/content-type-resolution.ts` | `packages/cms/src/media/site/content-type-resolution.ts` | 94 |  |
| `apps/website/src/features/media/where-used.ts` | `packages/cms/src/media/site/where-used.ts` | 44 | W1 |
| `apps/website/src/features/media/purge-media.ts` | `packages/cms/src/media/site/purge-media.ts` | 23 | W1 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./media/site/bootstrap"]
- "@jini-ai/cms" exports["./media/site/chat-preview"]
- "@jini-ai/cms" exports["./media/site/content-type-resolution"]
- "@jini-ai/cms" exports["./media/site/content-type-store"]
- "@jini-ai/cms" exports["./media/site/hydrate-blob-store-from-seed"]
- "@jini-ai/cms" exports["./media/site/original-bytes"]
- "@jini-ai/cms" exports["./media/site/public-path"]
- "@jini-ai/cms" exports["./media/site/purge-media"]
- "@jini-ai/cms" exports["./media/site/upload-content-type"]
- "@jini-ai/cms" exports["./media/site/where-used"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (3, 397 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/media/__tests__/hydrate-blob-store-from-seed.test.ts`
- `apps/website/src/features/media/__tests__/public-path.test.ts`
- `apps/website/src/features/media/__tests__/upload-content-type.test.ts`


## T — Tovu repoint: delete the 10 sources, rewrite every importer (33 lines)

```
apps/website/src/features/media/__tests__/bootstrap.test.ts:18  '../bootstrap.js' -> '@jini-ai/cms/media/site/bootstrap'
apps/website/src/features/media/index.ts:134  './bootstrap.js' -> '@jini-ai/cms/media/site/bootstrap'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/media/tool-registrations.ts:15  './bootstrap.js' -> '@jini-ai/cms/media/site/bootstrap'
apps/website/src/features/widgets/deps.ts:47  '../media/bootstrap.js' -> '@jini-ai/cms/media/site/bootstrap'
apps/website/src/server/__tests__/routes/post-template-featured-image.test.ts:8  '#src/features/media/bootstrap' -> '@jini-ai/cms/media/site/bootstrap'
apps/website/src/server/__tests__/routes/seo-og-image-crawlability.test.ts:14  '#src/features/media/bootstrap' -> '@jini-ai/cms/media/site/bootstrap'
apps/website/src/server/inbound/public-http/routes/site/pages/render-context/media-metadata.ts:5  '#src/features/media/bootstrap' -> '@jini-ai/cms/media/site/bootstrap'
apps/website/src/server/runtime/composition/site-deps/boot-data.ts:6  '#src/features/media/bootstrap' -> '@jini-ai/cms/media/site/bootstrap'
apps/website/src/features/media/__tests__/media-producing-previews.test.ts:23  '../chat-preview.js' -> '@jini-ai/cms/media/site/chat-preview'
apps/website/src/features/media/tool-registrations.ts:2  './chat-preview.js' -> '@jini-ai/cms/media/site/chat-preview'
apps/website/src/features/media-generation/tool-registrations.ts:2  '../media/chat-preview.js' -> '@jini-ai/cms/media/site/chat-preview'
apps/website/src/features/media-import/tool-registrations.ts:2  '../media/chat-preview.js' -> '@jini-ai/cms/media/site/chat-preview'
apps/website/src/features/media/__tests__/verify-published-media.test.ts:7  '../content-type-store.js' -> '@jini-ai/cms/media/site/content-type-store'
apps/website/src/features/media/contracts.ts:3  './content-type-store.js' -> '@jini-ai/cms/media/site/content-type-store'
apps/website/src/features/media/index.ts:115  './content-type-store.js' -> '@jini-ai/cms/media/site/content-type-store'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/media/index.ts:119  './content-type-store.js' -> '@jini-ai/cms/media/site/content-type-store'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/seo/__tests__/cover-image-head.test.ts:6  '../../media/content-type-store.js' -> '@jini-ai/cms/media/site/content-type-store'
apps/website/src/platform/db/repos/__tests__/media-content-type-store.test.ts:6  '#src/features/media/content-type-store' -> '@jini-ai/cms/media/site/content-type-store'
apps/website/src/features/media/index.ts:152  './hydrate-blob-store-from-seed.js' -> '@jini-ai/cms/media/site/hydrate-blob-store-from-seed'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/server/runtime/composition/site-deps/boot-data.ts:8  '#src/features/media/hydrate-blob-store-from-seed' -> '@jini-ai/cms/media/site/hydrate-blob-store-from-seed'
apps/website/src/features/media/index.ts:147  './original-bytes.js' -> '@jini-ai/cms/media/site/original-bytes'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/media/view-image-tool.ts:9  './original-bytes.js' -> '@jini-ai/cms/media/site/original-bytes'
apps/website/src/features/media/index.ts:139  './public-path.js' -> '@jini-ai/cms/media/site/public-path'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/site-export/media-original-urls.ts:5  '../media/public-path.js' -> '@jini-ai/cms/media/site/public-path'
apps/website/src/server/inbound/public-http/http/site/render/doc/media-ref.ts:5  '#src/features/media/public-path' -> '@jini-ai/cms/media/site/public-path'
apps/website/src/server/inbound/public-http/http/site/render/doc/nodes-media.ts:11  '#src/features/media/public-path' -> '@jini-ai/cms/media/site/public-path'
apps/website/src/server/inbound/public-http/http/site/render/template-render-data.ts:8  '#src/features/media/public-path' -> '@jini-ai/cms/media/site/public-path'
apps/website/src/server/inbound/public-http/http/site/render/widgets/media.ts:7  '#src/features/media/public-path' -> '@jini-ai/cms/media/site/public-path'
apps/website/src/features/media/index.ts:137  './upload-content-type.js' -> '@jini-ai/cms/media/site/upload-content-type'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/media/index.ts:148  './content-type-resolution.js' -> '@jini-ai/cms/media/site/content-type-resolution'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/media/__tests__/mediawidget-where-used.test.ts:6  '#src/features/media/where-used' -> '@jini-ai/cms/media/site/where-used'
apps/website/src/features/media/index.ts:151  './where-used.js' -> '@jini-ai/cms/media/site/where-used'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/media/index.ts:141  './purge-media.js' -> '@jini-ai/cms/media/site/purge-media'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
```

## Tovu tests that must stay green (8; import lines are repointed above, assertions untouched)
- `apps/website/src/features/media/__tests__/bootstrap.test.ts`
- `apps/website/src/features/media/__tests__/media-producing-previews.test.ts`
- `apps/website/src/features/media/__tests__/mediawidget-where-used.test.ts`
- `apps/website/src/features/media/__tests__/verify-published-media.test.ts`
- `apps/website/src/features/seo/__tests__/cover-image-head.test.ts`
- `apps/website/src/platform/db/repos/__tests__/media-content-type-store.test.ts`
- `apps/website/src/server/__tests__/routes/post-template-featured-image.test.ts`
- `apps/website/src/server/__tests__/routes/seo-og-image-crawlability.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/media/content-type-store.ts` (1)
- `apps/website/src/features/media/hydrate-blob-store-from-seed.ts` (1)
- `apps/website/src/features/media/where-used.ts` (1)
- `apps/website/src/features/media/purge-media.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/features/media/bootstrap.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why
- `apps/website/src/features/media/content-type-store.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Named mutation
in the Jini copy of `hydrate-blob-store-from-seed.ts`, negate the first `if (` condition of its first exported function; `hydrate-blob-store-from-seed.test.ts` must go red, then revert
