# L03 — contracts-down B: theme ids, table names, PostKind, ExportReport (13 edges, D)

| moved | from | to | edges |
|---|---|---|---|
| `NO_THEME_ID` | `features/theme/active-theme.ts:106` | `contracts/core/theme-ids.ts` | 3 |
| `themeIdCandidates`, `RENAMED_THEME_IDS` (whole 34-line file, no imports) | `features/theme/theme-id-aliases.ts` | same `contracts/core/theme-ids.ts`; delete the old file | 1 |
| `DECLARED_CONTENT_TYPE_OWNERS` (whole file, imports `@jini-ai/cms/widgets` only) | `features/content-types/declared-owners.ts` | `contracts/core/declared-content-type-owners.ts` | 1 |
| `REDIRECT_TABLES` (const) | `features/redirects/repo.sqlite.ts:9` | `contracts/core/redirect-tables.ts` (precedent: `contracts/core/widget-tables.ts`) | 1 |
| `FS_FOLDER_READ_RECOVERY` (string const) | `features/fs-files/site-file-request.ts:13` | `contracts/core/fs-folder-read-recovery.ts` | 1 |
| `PostKind` (whole 9-line file, imports `@jini-ai/cms/core`) | `features/post/post-vocabulary.ts` | `contracts/core/post-kind.ts` | 3 (+1 half of V-pages in L10) |
| `ExportReport` (interface `extends` the Jini `BaseExportReport`) | `features/site-export/site-exporter.ts:23` | `contracts/core/export-report.ts` | 3 |

The three `ExportReport` rows are the combine-3 lines `site-backup/static-site-packager.ts ->
site-export/index.ts` and `source-control/static-site-packager-port.ts -> site-export/index.ts`
plus `site-backup/static-copy.ts -> site-exporter.ts`. Moving the type down is the owner-preferred
answer to combine-3's "where do cross-feature port types live": a *type both sides share* lives in
`contracts/core`; a *port* stays with its consumer (L07).

**Repoint, no forwarder:** every importer in the inventory, prod and tests; remove the re-exports
from `theme/index.ts`, `content-types/index.ts`, `redirects/index.ts`, `post/contracts.ts:1`,
`site-export/index.ts`. Precondition (STOP if false): `rg` shows the moved declaration still
imports only `@jini-ai/*` / `node:*` / `contracts/`.

**Characterization (named risk: a moved constant silently diverges from the value its owner
writes):** the owner keeps importing the moved constant (`active-theme.ts` uses `NO_THEME_ID` from
contracts; `repo.sqlite.ts` builds its SQL from `REDIRECT_TABLES` in contracts), so one source of
truth remains — pinned by existing suites: `features/trash/__tests__/*redirect*`,
`features/site-backup/__tests__/import-keep-off*.test.ts`, `share-backend*.test.ts`,
`features/site-inspection/__tests__/*.test.ts`, `features/site-backup/__tests__/static-site-packager.unit.test.ts`
(layout/order/collision, judge 2 evidence), `features/entries/__tests__/*unreadable-owner*`.

**Gates:** shared gate, `LANE=L03`.

Base: Tovu `2d82735a` (integ/merge-3 tip). Edge list for G2: `designs/arch-120/v3/edges/L03.txt`. Every source line/kind/symbol origin: `facts/edges.v3.tsv` rows with lane `L03`.

---

### Inventory (TypeScript-AST reverse-import index of tip `2d82735a`, all of `apps/website/src`, prod + tests)

#### Edges
- `site-backup/import-keep-off.ts` -> `theme/active-theme.ts` [D] NO_THEME_ID -> contracts/core/theme-ids.ts
- `site-backup/share-backend.ts` -> `theme/index.ts` [D] NO_THEME_ID -> contracts/core/theme-ids.ts
- `site-inspection/site-profile.ts` -> `theme/active-theme.ts` [D] NO_THEME_ID -> contracts/core/theme-ids.ts
- `site-inspection/site-profile.ts` -> `theme/theme-id-aliases.ts` [D] themeIdCandidates,RENAMED_THEME_IDS -> contracts/core/theme-ids.ts (theme-id-aliases.ts deleted)
- `entries/unreadable-owner-entries-repair.ts` -> `content-types/index.ts` [D] DECLARED_CONTENT_TYPE_OWNERS -> contracts/core/declared-content-type-owners.ts
- `trash/adapters/redirect.ts` -> `redirects/index.ts` [D] REDIRECT_TABLES -> contracts/core/redirect-tables.ts
- `media-import/agent-tools.ts` -> `fs-files/site-file-request.ts` [D] FS_FOLDER_READ_RECOVERY -> contracts/core/fs-folder-read-recovery.ts
- `pages/html-document-store.memory.ts` -> `post/contracts.ts` [D] PostKind -> contracts/core/post-kind.ts
- `site-search/access.ts` -> `post/contracts.ts` [D] PostKind -> contracts/core/post-kind.ts
- `site-search/cms-document-source.ts` -> `post/contracts.ts` [D] PostKind -> contracts/core/post-kind.ts
- `site-backup/static-copy.ts` -> `site-export/site-exporter.ts` [D] ExportReport -> contracts/core/export-report.ts
- `site-backup/static-site-packager.ts` -> `site-export/index.ts` [D] ExportReport -> contracts/core/export-report.ts
- `source-control/static-site-packager-port.ts` -> `site-export/index.ts` [D] ExportReport -> contracts/core/export-report.ts

#### Every import/re-export of a moved or redirected symbol — repoint each; delete each re-export (no forwarder)
- `DECLARED_CONTENT_TYPE_OWNERS`:
    - `features/content-types/index.ts:17` reexport from `features/content-types/declared-owners.ts`
    - `features/content-types/repo.sqlite.ts:4` import from `features/content-types/declared-owners.ts`
    - `features/entries/unreadable-owner-entries-repair.ts:3` import from `features/content-types/index.ts`
- `ExportReport`:
    - `cli/commands/export.ts:5` import from `features/site-export/index.ts`
    - `features/deployments/publish-agent-tools.ts:49` import from `features/site-export/index.ts`
    - `features/deployments/publish-tool-deps.ts:7` import from `features/site-export/index.ts`
    - `features/deployments/static-publish/adapter.ts:21` import from `features/site-export/index.ts`
    - `features/site-backup/__tests__/static-copy.unit.test.ts:10` import from `features/site-export/site-exporter.ts`
    - `features/site-backup/__tests__/static-site-packager.unit.test.ts:5` import from `features/site-export/index.ts`
    - `features/site-backup/static-copy.ts:4` import from `features/site-export/site-exporter.ts`
    - `features/site-backup/static-site-packager.ts:2` import from `features/site-export/index.ts`
    - `features/site-export/__tests__/export-failure-summary.test.ts:4` import from `features/site-export/site-exporter.ts`
    - `features/site-export/__tests__/site-exporter.test.ts:24` import from `features/site-export/site-exporter.ts`
    - `features/site-export/index.ts:7` reexport from `features/site-export/site-exporter.ts`
    - `features/source-control/__tests__/commit-site.characterization.unit.test.ts:8` import from `features/site-export/index.ts`
    - `features/source-control/__tests__/commit-site.packager-port.unit.test.ts:4` import from `features/site-export/index.ts`
    - `features/source-control/__tests__/commit-site.unit.test.ts:26` import from `features/site-export/index.ts`
    - `features/source-control/__tests__/tool-registrations.dry-run.test.ts:13` import from `features/site-export/index.ts`
    - `features/source-control/commit-site.ts:9` import from `features/site-export/index.ts`
    - `features/source-control/static-site-packager-port.ts:1` import from `features/site-export/index.ts`
    - `server/routes/types.ts:11` import from `features/site-export/index.ts`
- `FS_FOLDER_READ_RECOVERY`:
    - `features/media-import/agent-tools.ts:4` import from `features/fs-files/site-file-request.ts`
- `NO_THEME_ID`:
    - `assistant/__tests__/tool-registrations.theme-set-active.test.ts:13` import from `features/theme/index.ts`
    - `features/pages/tool-registrations.ts:18` import from `features/theme/index.ts`
    - `features/post/template-options.ts:3` import from `features/theme/index.ts`
    - `features/site-backup/import-keep-off.ts:6` import from `features/theme/active-theme.ts`
    - `features/site-backup/share-backend.ts:7` import from `features/theme/index.ts`
    - `features/site-export/__tests__/route-manifest.test.ts:8` import from `features/theme/index.ts`
    - `features/site-export/route-manifest.ts:6` import from `features/theme/index.ts`
    - `features/site-inspection/__tests__/site-profile.unit.test.ts:13` import from `features/theme/index.ts`
    - `features/site-inspection/site-profile.ts:6` import from `features/theme/active-theme.ts`
    - `features/theme/__tests__/active-theme.test.ts:4` import from `features/theme/active-theme.ts`
    - `features/theme/__tests__/preview-switcher.integration.test.ts:17` import from `features/theme/active-theme.ts`
    - `features/theme/__tests__/verify-active-theme.test.ts:12` import from `features/theme/active-theme.ts`
    - `features/theme/index.ts:118` reexport from `features/theme/active-theme.ts`
    - `features/theme/tool-registrations.ts:44` import from `features/theme/active-theme.ts`
    - `features/theme/verify-active-theme.ts:6` import from `features/theme/active-theme.ts`
    - `server/__tests__/routes/admin-post-template-preview.test.ts:10` import from `features/theme/index.ts`
    - `server/__tests__/routes/bare-page-site-serving.test.ts:9` import from `features/theme/index.ts`
    - `server/inbound/admin-http/routes/posts/__tests__/preview-consent.integration.test.ts:9` import from `features/theme/index.ts`
    - `server/inbound/admin-http/routes/posts/__tests__/template-preview-render.test.ts:11` import from `features/theme/index.ts`
    - `server/inbound/admin-http/routes/posts/template-preview-render.ts:7` import from `features/theme/index.ts`
    - `server/inbound/admin-http/routes/presentation/__tests__/patch-active-theme.test.ts:12` import from `features/theme/index.ts`
    - `server/inbound/admin-http/routes/widgets/preview-render.ts:5` import from `features/theme/index.ts`
    - `server/inbound/public-http/middleware/site-cookie-consent.ts:24` import from `features/theme/active-theme.ts`
    - `server/inbound/public-http/routes/site/__tests__/no-theme.route.test.ts:11` import from `features/theme/index.ts`
    - `server/inbound/public-http/routes/site/__tests__/pages.edge-paths.route.test.ts:20` import from `features/theme/index.ts`
    - `server/inbound/public-http/routes/site/pages/handlers/home.ts:8` import from `features/theme/active-theme.ts`
    - `server/inbound/public-http/routes/site/pages/handlers/slug-routes.ts:4` import from `features/theme/active-theme.ts`
    - `server/inbound/public-http/routes/site/pages/handlers/virtual-page.ts:6` import from `features/theme/active-theme.ts`
    - `server/inbound/public-http/routes/site/products.ts:6` import from `features/theme/active-theme.ts`
    - `server/runtime/composition/__tests__/static-site-context.unit.test.ts:4` import from `features/theme/index.ts`
    - `server/runtime/composition/commerce-http.ts:11` import from `features/theme/active-theme.ts`
    - `server/runtime/composition/site-consent.ts:18` import from `features/theme/active-theme.ts`
    - `server/runtime/composition/static-site-context.ts:2` import from `features/theme/index.ts`
- `PostKind`:
    - `features/email-templates/__tests__/operations.test.ts:5` import from `features/post/index.ts`
    - `features/email-templates/operations.ts:9` import from `features/post/index.ts`
    - `features/pages/html-document-store.memory.ts:11` import from `features/post/contracts.ts`
    - `features/pages/html-document-store.ts:19` import from `features/post/contracts.ts`
    - `features/post/__tests__/post-vocabulary.test.ts:4` import from `features/post/post-vocabulary.ts`
    - `features/post/__tests__/publish-content.round-trip.test.ts:30` import from `features/post/post.ts`
    - `features/post/contracts.ts:1` reexport from `features/post/post-vocabulary.ts`
    - `features/post/go-live.ts:5` import from `features/post/post-vocabulary.ts`
    - `features/post/index.ts:1` reexport from `features/post/post.ts`
    - `features/post/post.ts:14` import from `features/post/post-vocabulary.ts`
    - `features/post/post.ts:15` reexport from `features/post/post-vocabulary.ts`
    - `features/post/publish-content.ts:21` import from `features/post/post.ts`
    - `features/post/repo.memory.ts:60` import()-type from `features/post/post.ts`
    - `features/post/repo.rows.ts:8` import from `features/post/post.ts`
    - `features/post/repo.ts:86` import()-type from `features/post/post.ts`
    - `features/post/search-index.contract.ts:3` import from `features/post/post.ts`
    - `features/post/search.ts:2` import from `features/post/post.ts`
    - `features/post/tool-registrations.ts:68` import from `features/post/post.ts`
    - `features/site-search/access.ts:14` import from `features/post/contracts.ts`
    - `features/site-search/cms-document-source.ts:22` import from `features/post/contracts.ts`
    - `server/inbound/admin-http/routes/themes/explore.ts:56` import from `features/post/index.ts`
    - `server/runtime/composition/deps.ts:2198` import()-type from `features/post/index.ts`
    - `server/runtime/composition/memory-deps/route-deps/trash-and-content.ts:158` import()-type from `features/post/index.ts`
- `REDIRECT_TABLES`:
    - `features/redirects/__tests__/index.test.ts:10` import from `features/redirects/repo.sqlite.ts`
    - `features/redirects/index.ts:5` reexport from `features/redirects/repo.sqlite.ts`
    - `features/redirects/publish-content.ts:10` import from `features/redirects/repo.sqlite.ts`
    - `features/trash/adapters/redirect.ts:13` import from `features/redirects/index.ts`
- `RENAMED_THEME_IDS`:
    - `features/theme/active-theme-publish-content.ts:12` import from `features/theme/theme-id-aliases.ts`
    - `features/theme/index.ts:128` reexport from `features/theme/theme-id-aliases.ts`
- `themeIdCandidates`:
    - `features/site-inspection/site-profile.ts:7` import from `features/theme/theme-id-aliases.ts`
    - `features/theme/active-theme-publish-content.ts:12` import from `features/theme/theme-id-aliases.ts`
    - `features/theme/index.ts:128` reexport from `features/theme/theme-id-aliases.ts`
    - `features/theme/theme.ts:16` import from `features/theme/theme-id-aliases.ts`
    - `server/inbound/public-http/middleware/theme-asset-dirs.ts:4` import from `features/theme/theme-id-aliases.ts`

#### Exact importers of each changed source file (callers that construct/pass its deps, and tests)
- `features/entries/unreadable-owner-entries-repair.ts`
    - prod: server/runtime/composition/boot-data-repairs.ts
    - tests: features/entries/__tests__/integration/unreadable-owner-entries-repair.dialects.test.ts, features/entries/__tests__/integration/unreadable-owner-entries-repair.postgres.test.ts, features/entries/__tests__/unit/unreadable-owner-entries-repair.unit.test.ts, server/runtime/composition/__tests__/boot-data-repairs.integration.test.ts
- `features/media-import/agent-tools.ts`
    - prod: features/media-import/tool-registrations.ts, server/runtime/composition/content-target-inputs.ts
    - tests: assistant/__tests__/media-import-search-discoverability.test.ts, assistant/__tests__/owner-chat-tool-inputs.unit.test.ts, assistant/__tests__/tool-registrations.contracts.test.ts, features/media-import/__tests__/import-local-file.test.ts, features/media-import/__tests__/tool-registrations.test.ts
- `features/pages/html-document-store.memory.ts`
    - prod: features/pages/index.ts
    - tests: assistant/__tests__/content-target-inputs.test.ts, assistant/__tests__/pages-read-html-batch.test.ts, features/agent-plugins/__tests__/unit/plugin-embed-save.test.ts, features/consent/__tests__/ensure-privacy-defaults.test.ts, features/pages/__tests__/edit-html-permission.test.ts, features/pages/__tests__/hidden-until-script.test.ts, features/pages/__tests__/html-document-store.memory.go-live.test.ts, features/pages/__tests__/html-document-store.memory.test.ts, features/pages/__tests__/html-document-store.noop-save.test.ts, features/pages/__tests__/metadata-edit-preserves-html.test.ts, features/pages/__tests__/tool-registrations.move-region.test.ts, features/pages/__tests__/tool-registrations.read-html.test.ts, features/pages/__tests__/tool-registrations.test.ts, features/pages/__tests__/tool-registrations.write-region.test.ts, features/post/__tests__/content-duplicate.post-page.test.ts, features/post/__tests__/tool-registrations.html-page-body.test.ts, features/post/__tests__/tool-registrations.partial-update.test.ts
- `features/site-backup/import-keep-off.ts`
    - prod: features/site-backup/import-restore.ts
    - tests: 
- `features/site-backup/share-backend.ts`
    - prod: features/site-backup/backup-service.ts, features/site-backup/tool-registrations.ts, server/inbound/admin-http/routes/system/site-share-password.ts, server/inbound/admin-http/routes/system/site-shares.integration.test.ts, server/routes/types.ts, server/runtime/composition/deps.ts
    - tests: features/site-backup/__tests__/credential-warnings.integration.test.ts, features/site-backup/__tests__/integration/saved-keys-round-trip.integration.test.ts, features/site-backup/__tests__/share-backend-static-limits.unit.test.ts, features/site-backup/__tests__/share-backend.unit.test.ts, features/site-backup/__tests__/share-delivery.integration.test.ts, features/site-backup/__tests__/share-moved-site.integration.test.ts, features/site-backup/__tests__/share-refusals.integration.test.ts, features/site-backup/__tests__/static-copy.unit.test.ts, server/inbound/admin-http/routes/system/__tests__/site-share-password-handler.test.ts
- `features/site-backup/static-copy.ts`
    - prod: features/site-backup/archive-manifest.ts, features/site-backup/import-verifier-inventory.ts, features/site-backup/plan-store.ts, features/site-backup/share-backend.ts, features/site-backup/share-zip.ts, features/site-backup/static-download-layout.ts, features/site-backup/static-site-packager.ts
    - tests: features/site-backup/__tests__/share-backend-static-limits.unit.test.ts, features/site-backup/__tests__/static-copy.unit.test.ts, features/site-backup/__tests__/static-export-themes.integration.test.ts, features/site-export/__tests__/render-origin.integration.test.ts, features/site-export/__tests__/static-copy-policy.unit.test.ts
- `features/site-backup/static-site-packager.ts`
    - prod: server/runtime/composition/deps.ts, server/runtime/composition/memory-deps/route-deps/publish-export.ts
    - tests: features/site-backup/__tests__/static-site-packager.unit.test.ts, features/source-control/__tests__/commit-site.characterization.unit.test.ts, features/source-control/__tests__/commit-site.preview-parity.unit.test.ts, features/source-control/__tests__/commit-site.unit.test.ts, features/source-control/__tests__/gates.characterization.unit.test.ts, features/source-control/__tests__/tool-registrations.dry-run.test.ts, features/source-control/__tests__/tool-registrations.unit.test.ts
- `features/site-inspection/site-profile.ts`
    - prod: features/site-inspection/agent-tools.ts, features/site-inspection/deps.ts, features/site-inspection/index.ts, features/site-inspection/tool-registrations.ts
    - tests: features/site-inspection/__tests__/site-profile.unit.test.ts, features/site-inspection/__tests__/tool-registrations.unit.test.ts
- `features/site-search/access.ts`
    - prod: server/runtime/composition/modules/site-search.ts
    - tests: features/site-search/__tests__/cms-search.test.ts
- `features/site-search/cms-document-source.ts`
    - prod: features/site-search/access.ts, server/runtime/composition/modules/site-search.ts
    - tests: features/site-search/__tests__/cms-search.test.ts
- `features/source-control/static-site-packager-port.ts`
    - prod: features/source-control/commit-site.ts, features/source-control/index.ts
    - tests: features/source-control/__tests__/commit-site.packager-port.unit.test.ts
- `features/trash/adapters/redirect.ts`
    - prod: features/trash/index.ts, features/trash/permissions.ts, features/trash/tool-kinds.ts, features/trash/trash-item-tool.ts
    - tests: features/trash/__tests__/marker-adapters.dialects.test.ts, features/trash/__tests__/trash.contract.test.ts
