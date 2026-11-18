# L09 — theme + asset operations (8 edges, I + D)

- **I** asset-transfer → theme (3 edges: `asset-destinations.ts:13-15`, `asset-sources.ts:10-11`,
  `copy-tool.ts:11,14`) and `image-transform/tool.ts:12`: one **required** `themeFiles` port on the
  asset-transfer deps with exactly the operations called — `find(themeId)`, `assertWritable`,
  `resolvePath`, `writeBinary`, `nextAvailableName`, `reload`, `sniffImportType`,
  `isShapeRejection` — built in composition from `theme/asset-operations.ts`. `THEME_WRITE_PERMISSION`
  and `THEME_IMPORT_MAX_BYTES/POLICY/ACCEPT` are constants → **D** `contracts/core/theme-import-policy.ts`
  (owners re-import them; one source of truth). image-transform takes only `isThemeShapeRejection`.
- **I** asset-transfer → media (2 edges): `saveLibraryDocument` → deps `media.saveLibraryDocument`;
  `createDocumentArchiveReader` → `copy-tool.ts:167` stops constructing it; composition passes
  `documentArchiveReader` (the deps field already exists in `buildFilesCopyRegistrations`).
- **I** `site-backup/import-restore-placement.ts:4,5` (`loadTheme`, `checkSourceDirContainment`) →
  restore deps; `CompiledBuild` type becomes local.
- **I** `theme/static-render.ts:9` (`renderHtmlMenu`, `menuLinkRelAttr`) → static-render deps
  `renderMenu`, passed from composition.

**Characterization (named risks):** *theme writes escape the theme dir / skip writability* and
*copy limits change* → `features/fs-files/__tests__/{copy-tool,copy-library}.test.ts` (asset-transfer has no own `__tests__`; its fixture is `fs-files/__tests__/asset-tool-fixture.ts`) — **add** `asset-sources` coverage there (no test imports `asset-sources.ts` on the tip), `features/image-transform/__tests__/tool.test.ts`,
`features/site-backup/__tests__/import-restore.unit.test.ts` (quarantine on containment
failure), `features/theme/__tests__/{bundled-template-fallback.unit,inject-page-title,inject-current-entity-content-id}.test.ts` + **add** one menu-markup/`rel` case. Add one
composed-deps case per tool proving the real theme ops are wired (write lands in the theme dir).

**Gates:** shared gate, `LANE=L09`.

Base: Tovu `2d82735a` (integ/merge-3 tip). Edge list for G2: `designs/arch-120/v3/edges/L09.txt`. Every source line/kind/symbol origin: `facts/edges.v3.tsv` rows with lane `L09`.

---

### Inventory (TypeScript-AST reverse-import index of tip `2d82735a`, all of `apps/website/src`, prod + tests)

#### Edges
- `asset-transfer/asset-destinations.ts` -> `media/index.ts` [I] saveLibraryDocument -> AssetTransferDeps.media port
- `asset-transfer/copy-tool.ts` -> `media/document-archive.ts` [I] createDocumentArchiveReader -> deps.documentArchiveReader (built by composition)
- `asset-transfer/asset-destinations.ts` -> `theme/asset-operations.ts` [I] theme file ops -> AssetTransferDeps.themeFiles port
- `asset-transfer/asset-sources.ts` -> `theme/asset-operations.ts` [I] findThemeOrThrow,sniffThemeImportType -> themeFiles port
- `asset-transfer/copy-tool.ts` -> `theme/asset-operations.ts` [D+I] THEME_IMPORT_* -> contracts/core/theme-import-policy.ts; isShapeRejection -> themeFiles port
- `image-transform/tool.ts` -> `theme/asset-operations.ts` [I] isShapeRejection -> ImageTransformDeps.isThemeShapeRejection
- `site-backup/import-restore-placement.ts` -> `theme/catalog.ts` [I] loadTheme,checkSourceDirContainment -> restore deps port
- `theme/static-render.ts` -> `navigation/render-entry.ts` [I] renderHtmlMenu,menuLinkRelAttr -> StaticRenderDeps.renderMenu

#### Exact importers of each changed source file (callers that construct/pass its deps, and tests)
- `features/asset-transfer/asset-destinations.ts`
    - prod: features/asset-transfer/asset-sources.ts, features/asset-transfer/copy-tool.ts, features/image-transform/tool.ts
    - tests: features/fs-files/__tests__/asset-tool-fixture.ts
- `features/asset-transfer/asset-sources.ts`
    - prod: features/asset-transfer/copy-tool.ts, features/image-transform/tool.ts
    - tests: 
- `features/asset-transfer/copy-tool.ts`
    - prod: server/runtime/composition/tool-catalog-manifest.ts
    - tests: assistant/__tests__/tool-registrations.contracts.test.ts, features/fs-files/__tests__/copy-library.test.ts, features/fs-files/__tests__/copy-tool.test.ts, features/media/__tests__/library-save-text.test.ts
- `features/image-transform/tool.ts`
    - prod: assistant/tool-registrations.ts, server/runtime/composition/tool-catalog-manifest.ts
    - tests: assistant/__tests__/tool-registrations.contracts.test.ts, features/image-transform/__tests__/tool.test.ts
- `features/site-backup/import-restore-placement.ts`
    - prod: features/site-backup/import-plugin-state.ts, features/site-backup/import-restore.ts
    - tests: features/site-backup/__tests__/import-restore.unit.test.ts
- `features/theme/static-render.ts`
    - prod: features/theme/index.ts, features/theme/rendering.ts, server/inbound/public-http/http/site/render-site.ts, server/inbound/public-http/http/site/render/components/entry-lists.ts, server/inbound/public-http/http/site/render/page-body.ts, server/inbound/public-http/routes/site/pages/handlers/post.ts, server/inbound/public-http/routes/site/pages/handlers/virtual-page.ts, server/inbound/public-http/routes/site/pages/listing/listing-state.ts, server/inbound/public-http/routes/site/pages/render-context/collection-lists.ts, server/inbound/public-http/routes/site/pages/render-context/media-metadata.ts, server/inbound/public-http/routes/site/pages/render-context/post-previews.ts, server/inbound/public-http/routes/site/pages/render-context/static-menus.ts, server/inbound/public-http/routes/site/pages/static-tier.ts, server/inbound/public-http/routes/site/pages/template-render.ts, server/runtime/composition/site-consent.ts
    - tests: features/theme/__tests__/bundled-template-fallback.unit.test.ts, features/theme/__tests__/inject-current-entity-content-id.test.ts, features/theme/__tests__/inject-page-title.test.ts, features/theme/__tests__/kuinetic-local-vendor.test.ts, features/theme/__tests__/menu-authored-html.test.ts, features/theme/__tests__/menu-html-mode.test.ts, features/theme/__tests__/menu-tree-render.test.ts, features/theme/__tests__/pages-blank-template.canary.test.ts, features/theme/__tests__/publish-content.apply.test.ts, features/theme/__tests__/shipped-site-theme-drift.canary.test.ts, features/theme/__tests__/static-render-api-version.test.ts, features/theme/__tests__/static-render-asset-quotes.test.ts, features/theme/__tests__/static-render-author.test.ts, features/theme/__tests__/static-render-collection.test.ts, features/theme/__tests__/static-render-expand-partials.test.ts, features/theme/__tests__/static-render-featured-image.test.ts, features/theme/__tests__/static-render-listings.test.ts, features/theme/__tests__/static-render-page-shell-fallback.test.ts, features/theme/__tests__/static-render-paging.test.ts, features/theme/__tests__/static-render-post-previews.test.ts, features/theme/__tests__/static-render-token-sentinel.test.ts, features/theme/__tests__/static-theme-migrated-asset-paths.test.ts, features/theme/__tests__/template-eligibility.test.ts, features/theme/__tests__/template-render.canary.test.ts, features/theme/__tests__/template-resolution.test.ts, features/theme/__tests__/theme-pages-render.canary.test.ts, features/theme/__tests__/theme-slot-honors-current-page.test.ts, features/theme/__tests__/theme-static-tier.test.ts, features/theme/__tests__/token-aliases.test.ts, server/inbound/public-http/http/site/__tests__/leading-style-regression.test.ts, server/inbound/public-http/http/site/__tests__/render-author.test.ts

#### G5 suites — exact (every `*.test.ts` that imports a changed source file or a moved symbol's old home; AST index of the tip): 37 files

```
SUITES="
  apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  apps/website/src/features/fs-files/__tests__/copy-library.test.ts
  apps/website/src/features/fs-files/__tests__/copy-tool.test.ts
  apps/website/src/features/image-transform/__tests__/tool.test.ts
  apps/website/src/features/media/__tests__/library-save-text.test.ts
  apps/website/src/features/site-backup/__tests__/import-restore.unit.test.ts
  apps/website/src/features/theme/__tests__/bundled-template-fallback.unit.test.ts
  apps/website/src/features/theme/__tests__/inject-current-entity-content-id.test.ts
  apps/website/src/features/theme/__tests__/inject-page-title.test.ts
  apps/website/src/features/theme/__tests__/kuinetic-local-vendor.test.ts
  apps/website/src/features/theme/__tests__/menu-authored-html.test.ts
  apps/website/src/features/theme/__tests__/menu-html-mode.test.ts
  apps/website/src/features/theme/__tests__/menu-tree-render.test.ts
  apps/website/src/features/theme/__tests__/pages-blank-template.canary.test.ts
  apps/website/src/features/theme/__tests__/publish-content.apply.test.ts
  apps/website/src/features/theme/__tests__/shipped-site-theme-drift.canary.test.ts
  apps/website/src/features/theme/__tests__/static-render-api-version.test.ts
  apps/website/src/features/theme/__tests__/static-render-asset-quotes.test.ts
  apps/website/src/features/theme/__tests__/static-render-author.test.ts
  apps/website/src/features/theme/__tests__/static-render-collection.test.ts
  apps/website/src/features/theme/__tests__/static-render-expand-partials.test.ts
  apps/website/src/features/theme/__tests__/static-render-featured-image.test.ts
  apps/website/src/features/theme/__tests__/static-render-listings.test.ts
  apps/website/src/features/theme/__tests__/static-render-page-shell-fallback.test.ts
  apps/website/src/features/theme/__tests__/static-render-paging.test.ts
  apps/website/src/features/theme/__tests__/static-render-post-previews.test.ts
  apps/website/src/features/theme/__tests__/static-render-token-sentinel.test.ts
  apps/website/src/features/theme/__tests__/static-theme-migrated-asset-paths.test.ts
  apps/website/src/features/theme/__tests__/template-eligibility.test.ts
  apps/website/src/features/theme/__tests__/template-render.canary.test.ts
  apps/website/src/features/theme/__tests__/template-resolution.test.ts
  apps/website/src/features/theme/__tests__/theme-pages-render.canary.test.ts
  apps/website/src/features/theme/__tests__/theme-slot-honors-current-page.test.ts
  apps/website/src/features/theme/__tests__/theme-static-tier.test.ts
  apps/website/src/features/theme/__tests__/token-aliases.test.ts
  apps/website/src/server/inbound/public-http/http/site/__tests__/leading-style-regression.test.ts
  apps/website/src/server/inbound/public-http/http/site/__tests__/render-author.test.ts
"
```
Add the new characterization tests named above to `SUITES`. Barrel-importing suites (`*/index.ts` homes) are large by nature; run them all — G5 is the lane's behaviour net.
