### jini:packages/cms/src/widgets/resolver-service.ts
- **Over:** file 701 lines (no function over 100)
- **Phase:** now (JINI 701) · **Batch:** size-19
- **Tests:** `src/widgets/__tests__/unit/resolver-service.unit.test.ts`, `src/widgets/__tests__/integration/resolver-service.integration.test.ts`, `src/widgets/__tests__/marker-target-parity.unit.test.ts`, `src/widgets/__tests__/marker.unit.test.ts`, `src/widgets/__tests__/stored-format.golden.test.ts` (package `@jini-ai/cms`); also every test under `src/widgets/html/__tests__/` that imports `resolve-html-page-embeds` (`rg -l "resolve-html-page-embeds|resolveHtmlPageEmbeds" packages/cms/src --glob '*.test.*'`). No test mocks the module.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| I instances | `ResolvePageWidgetsDeps`, `WidgetInstanceResolutionDeps`, `ResolvePageWidgetsInput`, `ResolvePageWidgetsRequired`, `ResolvePageWidgetsResult`, `PLACEHOLDER_IR`, `toRenderIr`, `InlineEmbedRef`, `forEachDocNode`, `inlineEmbedRef`, `collectWidgetEmbeds`, `parseWidgetInstanceRow`, `groupWidgetInstancesByType`, `resolveWidgetInstances`, `inlineContentOverrides`, `assembleInlineResolved`, `ResolveHtmlPageEmbedsDeps`, `HtmlEmbedResolver` | shared deps types + batch widget-instance loading → render IR |
| P page | `resolveRegionPlacements`, `collectReferencedWidgetIds`, `resolvePageWidgets` | page-render orchestrator (stays) |
| W widget/form embeds | `resolveWidgetSlugsToIds`, `collectWidgetIdsToLoad`, `buildResolvedWidgetMap`, `resolveWidgetTypeEmbeds`, `resolveFormTypeEmbeds` | `widget`/`form` HTML markers (stays) |
| M media | `ResolvedMediaRecord`, `mediaIrSlug`, `parseMediaEmbedRef`, `buildMediaImageIr`, `findMediaEmbedRecord`, `lookupMediaContentType`, `isPlayerContentType`, `playerMediaIr`, `resolveOneMediaEmbed`, `resolveMediaTypeEmbeds`, `resolveGalleryWidgetMedia`, `isRefBasedMediaNode`, `collectMediaRefAssetIds`, `resolvePostContentMediaContext` | `media` HTML markers + media refs inside a post body |
| C content | `resolvePostContentWidgetContext`, `resolvePostContentRenderContext`, `findPublishedPostByRef`, `resolvePostTypeEmbeds`, `matchesPendingOverride`, `postContentIr`, `resolveOneContentEmbed`, `resolveContentTypeEmbeds` | `post`/`content` HTML markers and their embedded-body context |
| R registry | `HTML_EMBED_RESOLVERS`, `THEME_OWNED_MARKER_TYPES`, `export { isPageEmbedType }` | embed-type registry (stays) |

- **Splits** (in order):
  1. NEW `resolver-service-instances.ts` — job: resolver deps types and batch widget-instance loading into render IR. Moves unit I. `ResolvePageWidgetsInput/Required/Result` move here too (both sides need them). The `// ----- HTML Page embeds (SPEC-047 Slice 2 …)` section comment block (~L324-357) moves with `ResolveHtmlPageEmbedsDeps`, word for word. Exports every moved name (previously-private ones become exported). Imports only from the shared libs/types it uses (`./types.js`, `./entry-payload.js`, host-port types, etc.).
  2. NEW `resolver-service-media.ts` — job: resolve media markers and media refs to render IR. Moves unit M, with the long `data-embed-type="media"` doc block (~L570-615) and the "Owner-reported bug (2026-08-12…)" comment on `resolvePostContentMediaContext`. Imports `forEachDocNode`, `toRenderIr`, `ResolveHtmlPageEmbedsDeps` from `./resolver-service-instances.js`. Exports `resolveGalleryWidgetMedia`, `resolveMediaTypeEmbeds`, `resolvePostContentMediaContext`.
  3. NEW `resolver-service-content.ts` — job: resolve post/content markers and their embedded bodies. Moves unit C with the `post` resolver and `content` resolver doc blocks (~L1007-1062, ~L1188-1247) and the "Owner-reported bug (2026-09-22)" comment. Imports from `./resolver-service-instances.js` and `resolvePostContentMediaContext` from `./resolver-service-media.js`. Exports `resolvePostTypeEmbeds`, `resolveContentTypeEmbeds`.
  4. `resolver-service.ts` keeps P, W, R, the file header, and imports the moved names. It must keep exporting `resolvePageWidgets`, `HTML_EMBED_RESOLVERS`, `THEME_OWNED_MARKER_TYPES`, `isPageEmbedType`.
- **Importers to update:**
  - `src/widgets/index.ts` (entry `./widgets`): `export type { ResolvePageWidgetsDeps, …Input, …Required, …Result }` → from `./resolver-service-instances.js`; `resolvePageWidgets` stays.
  - `src/widgets/html/index.ts` (entry `./widgets/html`): `resolveGalleryWidgetMedia` → `../resolver-service-media.js`; `ResolveHtmlPageEmbedsDeps` → `../resolver-service-instances.js`.
  - `src/widgets/html/resolve-html-page-embeds.ts`: `ResolveHtmlPageEmbedsDeps` → `../resolver-service-instances.js` (registry names stay).
  - `src/widgets/__tests__/unit/resolver-service.unit.test.ts`: `resolveGalleryWidgetMedia` → `../../resolver-service-media.js`, `ResolveHtmlPageEmbedsDeps` → `../../resolver-service-instances.js`.
- **After:** resolver-service.ts ~200; instances ~150; media ~205; content ~165. No function over 100.
- **Risks / notes:** no cycles: instances ← media ← content ← resolver-service. `HTML_EMBED_RESOLVERS` keeps its entry order byte for byte. The ~55-line comment above `THEME_OWNED_MARKER_TYPES` stays.
