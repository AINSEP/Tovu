# T-post-1 — post → @jini-ai/cms (Jini step J then Tovu step T)

Lane T. Batch J:4 T:10. Depends on: C-contracts-core-3, C-platform-html-1. Est: J 55 min, T 40 min.

## J — move verbatim into Jini (8 files, 803 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/post/post-before-save.ts` | `packages/cms/src/posts/post-before-save.ts` | 66 | W1 |
| `apps/website/src/features/post/post-tool-schemas.ts` | `packages/cms/src/posts/post-tool-schemas.ts` | 52 |  |
| `apps/website/src/features/post/tiptap-block-schema.ts` | `packages/cms/src/posts/tiptap-block-schema.ts` | 229 |  |
| `apps/website/src/features/post/tiptap-text-schema.ts` | `packages/cms/src/posts/tiptap-text-schema.ts` | 86 |  |
| `apps/website/src/contracts/core/tool-metadata/post.ts` | `packages/cms/src/posts/tool-metadata.ts` | 120 |  |
| `apps/website/src/features/post/slug.ts` | `packages/cms/src/posts/slug.ts` | 26 |  |
| `apps/website/src/features/post/rendering.ts` | `packages/cms/src/posts/rendering.ts` | 2 |  |
| `apps/website/src/features/post/tiptap-doc-schema.ts` | `packages/cms/src/posts/tiptap-doc-schema.ts` | 222 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./posts/post-before-save"]
- "@jini-ai/cms" exports["./posts/post-tool-schemas"]
- "@jini-ai/cms" exports["./posts/rendering"]
- "@jini-ai/cms" exports["./posts/slug"]
- "@jini-ai/cms" exports["./posts/tiptap-doc-schema"]
- "@jini-ai/cms" exports["./posts/tool-metadata"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (1, 26 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/post/__tests__/slug.test.ts`


## T — Tovu repoint: delete the 8 sources, rewrite every importer (28 lines)

```
apps/website/src/features/post/__tests__/content-duplicate.plugin-hook-failed.test.ts:31  '../post-before-save.js' -> '@jini-ai/cms/posts/post-before-save'
apps/website/src/features/post/__tests__/post.test.ts:6  '../post-before-save.js' -> '@jini-ai/cms/posts/post-before-save'
apps/website/src/features/post/__tests__/tool-registrations.plugin-hook-failed.test.ts:28  '../post-before-save.js' -> '@jini-ai/cms/posts/post-before-save'
apps/website/src/features/post/contracts.ts:2  './post-before-save.js' -> '@jini-ai/cms/posts/post-before-save'
apps/website/src/features/post/index.ts:12  './post-before-save.js' -> '@jini-ai/cms/posts/post-before-save'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/post/post-create.ts:4  './post-before-save.js' -> '@jini-ai/cms/posts/post-before-save'
apps/website/src/features/post/post-import.ts:4  './post-before-save.js' -> '@jini-ai/cms/posts/post-before-save'
apps/website/src/features/post/post-tool-deps.ts:4  './post-before-save.js' -> '@jini-ai/cms/posts/post-before-save'
apps/website/src/features/post/post-update.ts:5  './post-before-save.js' -> '@jini-ai/cms/posts/post-before-save'
apps/website/src/features/post/__tests__/content-post-list-filters.test.ts:7  '../post-tool-schemas.js' -> '@jini-ai/cms/posts/post-tool-schemas'
apps/website/src/features/post/agent-tools.ts:9  './post-tool-schemas.js' -> '@jini-ai/cms/posts/post-tool-schemas'
apps/website/src/features/post/post-tool-list.ts:6  './post-tool-schemas.js' -> '@jini-ai/cms/posts/post-tool-schemas'
apps/website/src/contracts/core/tool-metadata/index.ts:38  './post.js' -> '@jini-ai/cms/posts/tool-metadata'
apps/website/src/features/post/content-stats-tool.ts:1  '../../contracts/core/tool-metadata/post.js' -> '@jini-ai/cms/posts/tool-metadata'
apps/website/src/features/post/preview-tool.ts:1  '../../contracts/core/tool-metadata/post.js' -> '@jini-ai/cms/posts/tool-metadata'
apps/website/src/features/post/tool-registrations.ts:6  '../../contracts/core/tool-metadata/post.js' -> '@jini-ai/cms/posts/tool-metadata'
apps/admin/src/features/posts/rules.ts:1  '../../../../website/src/features/post/slug' -> '@jini-ai/cms/posts/slug'
apps/website/src/features/post/__tests__/post.derived-slug-limit.test.ts:6  '../slug.js' -> '@jini-ai/cms/posts/slug'
apps/website/src/features/post/agent-tools.ts:4  './slug.js' -> '@jini-ai/cms/posts/slug'
apps/website/src/features/post/index.ts:10  './slug.js' -> '@jini-ai/cms/posts/slug'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/post/post-slugs.ts:2  './slug.js' -> '@jini-ai/cms/posts/slug'
apps/website/src/features/post/post-update.ts:8  './slug.js' -> '@jini-ai/cms/posts/slug'
apps/website/src/server/inbound/public-http/http/site/render/doc/doc-nodes.ts:12  '#src/features/post/rendering' -> '@jini-ai/cms/posts/rendering'
apps/website/src/server/inbound/public-http/http/site/render/widgets/social-entries.ts:5  '#src/features/post/rendering' -> '@jini-ai/cms/posts/rendering'
apps/website/src/features/post/__tests__/agent-tools.tiptap-node-vocabulary.test.ts:11  '../tiptap-doc-schema.js' -> '@jini-ai/cms/posts/tiptap-doc-schema'
apps/website/src/features/post/__tests__/integration/content-tools-default-kind.integration.test.ts:17  '../../tiptap-doc-schema.js' -> '@jini-ai/cms/posts/tiptap-doc-schema'
apps/website/src/features/post/agent-tools.ts:10  './tiptap-doc-schema.js' -> '@jini-ai/cms/posts/tiptap-doc-schema'
apps/website/src/features/widgets/__tests__/integration/mediawidget.integration.test.ts:153  '#src/features/post/tiptap-doc-schema' -> '@jini-ai/cms/posts/tiptap-doc-schema'
```

## Tovu tests that must stay green (8; import lines are repointed above, assertions untouched)
- `apps/website/src/features/post/__tests__/agent-tools.tiptap-node-vocabulary.test.ts`
- `apps/website/src/features/post/__tests__/content-duplicate.plugin-hook-failed.test.ts`
- `apps/website/src/features/post/__tests__/content-post-list-filters.test.ts`
- `apps/website/src/features/post/__tests__/integration/content-tools-default-kind.integration.test.ts`
- `apps/website/src/features/post/__tests__/post.derived-slug-limit.test.ts`
- `apps/website/src/features/post/__tests__/post.test.ts`
- `apps/website/src/features/post/__tests__/tool-registrations.plugin-hook-failed.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/mediawidget.integration.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/post/post-before-save.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/features/post/tiptap-text-schema.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Named mutation
in the Jini copy of `tiptap-block-schema.ts`, negate the first `if (` condition of its first exported function; `slug.test.ts` must go red, then revert
