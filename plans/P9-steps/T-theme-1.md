# T-theme-1 — theme → @jini-ai/cms (Jini step J then Tovu step T)

Lane T. Batch J:3 T:4. Depends on: none (only already-Jini code). Est: J 72 min, T 84 min.

## J — move verbatim into Jini (10 files, 1393 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/theme/entry-list-markup.ts` | `packages/cms/src/themes/site/entry-list-markup.ts` | 40 | W17 |
| `apps/website/src/features/theme/handlebars-allowlist.ts` | `packages/cms/src/themes/site/handlebars-allowlist.ts` | 425 | W2 |
| `apps/website/src/features/theme/hardcoded-link-lists.ts` | `packages/cms/src/themes/site/hardcoded-link-lists.ts` | 119 |  |
| `apps/website/src/features/theme/liquid-allowlist.ts` | `packages/cms/src/themes/site/liquid-allowlist.ts` | 298 | W3 |
| `apps/website/src/features/theme/preview-policy.ts` | `packages/cms/src/themes/site/preview-policy.ts` | 7 |  |
| `apps/website/src/features/theme/theme-file-errors.ts` | `packages/cms/src/themes/site/theme-file-errors.ts` | 23 |  |
| `apps/website/src/features/theme/theme-files.ts` | `packages/cms/src/themes/site/theme-files.ts` | 222 | W1 |
| `apps/website/src/features/theme/theme-read-content.ts` | `packages/cms/src/themes/site/theme-read-content.ts` | 66 |  |
| `apps/website/src/features/theme/validation/profiles.ts` | `packages/cms/src/themes/site/validation/profiles.ts` | 87 | W3 |
| `apps/website/src/features/theme/validation/references.ts` | `packages/cms/src/themes/site/validation/references.ts` | 106 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./themes/site/entry-list-markup"]
- "@jini-ai/cms" exports["./themes/site/handlebars-allowlist"]
- "@jini-ai/cms" exports["./themes/site/hardcoded-link-lists"]
- "@jini-ai/cms" exports["./themes/site/liquid-allowlist"]
- "@jini-ai/cms" exports["./themes/site/preview-policy"]
- "@jini-ai/cms" exports["./themes/site/theme-file-errors"]
- "@jini-ai/cms" exports["./themes/site/theme-files"]
- "@jini-ai/cms" exports["./themes/site/theme-read-content"]
- "@jini-ai/cms" exports["./themes/site/validation/profiles"]
- "@jini-ai/cms" exports["./themes/site/validation/references"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (5, 302 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/theme/__tests__/entry-list-render-layouts.test.ts`
- `apps/website/src/features/theme/__tests__/entry-list-render.test.ts`
- `apps/website/src/features/theme/__tests__/liquid-allowlist.test.ts`
- `apps/website/src/features/theme/validation/__tests__/profiles.test.ts`
- `apps/website/src/features/theme/validation/__tests__/references.test.ts`


## T — Tovu repoint: delete the 10 sources, rewrite every importer (77 lines)

```
apps/website/src/features/theme/__tests__/static-render-collection.test.ts:3  '../entry-list-markup.js' -> '@jini-ai/cms/themes/site/entry-list-markup'
apps/website/src/features/theme/static-render.ts:7  './entry-list-markup.js' -> '@jini-ai/cms/themes/site/entry-list-markup'
apps/website/src/server/inbound/public-http/http/site/render/document-shell.ts:8  '#src/features/theme/entry-list-markup' -> '@jini-ai/cms/themes/site/entry-list-markup'
apps/website/src/server/inbound/public-http/http/site/render/widgets/social-entries.ts:7  '#src/features/theme/entry-list-markup' -> '@jini-ai/cms/themes/site/entry-list-markup'
apps/website/src/server/inbound/public-http/routes/site/pages/render-context/collection-lists.ts:8  '#src/features/theme/entry-list-markup' -> '@jini-ai/cms/themes/site/entry-list-markup'
apps/website/src/features/theme/__tests__/handlebars-allowlist.test.ts:14  '../handlebars-allowlist.js' -> '@jini-ai/cms/themes/site/handlebars-allowlist'
apps/website/src/features/theme/index.ts:107  './handlebars-allowlist.js' -> '@jini-ai/cms/themes/site/handlebars-allowlist'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/theme/theme-template-sources.ts:4  './handlebars-allowlist.js' -> '@jini-ai/cms/themes/site/handlebars-allowlist'
apps/website/src/server/inbound/public-http/http/site/handlebars-render.ts:4  '#src/features/theme/handlebars-allowlist' -> '@jini-ai/cms/themes/site/handlebars-allowlist'
apps/website/src/features/theme/__tests__/hardcoded-link-lists.test.ts:13  '../hardcoded-link-lists.js' -> '@jini-ai/cms/themes/site/hardcoded-link-lists'
apps/website/src/features/theme/theme-write-tools.ts:3  './hardcoded-link-lists.js' -> '@jini-ai/cms/themes/site/hardcoded-link-lists'
apps/website/src/features/theme/index.ts:96  './liquid-allowlist.js' -> '@jini-ai/cms/themes/site/liquid-allowlist'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/theme/theme-template-sources.ts:5  './liquid-allowlist.js' -> '@jini-ai/cms/themes/site/liquid-allowlist'
apps/website/src/server/inbound/public-http/http/site/liquid-render.ts:5  '#src/features/theme/liquid-allowlist' -> '@jini-ai/cms/themes/site/liquid-allowlist'
apps/website/src/features/pages/__tests__/tool-registrations.test.ts:2  '#src/features/theme/preview-policy' -> '@jini-ai/cms/themes/site/preview-policy'
apps/website/src/features/theme/__tests__/preview-refresh.test.ts:1  '../preview-policy.js' -> '@jini-ai/cms/themes/site/preview-policy'
apps/website/src/features/theme/__tests__/theme-roster-sync.test.ts:1  '../preview-policy.js' -> '@jini-ai/cms/themes/site/preview-policy'
apps/website/src/features/theme/__tests__/theme-watcher.test.ts:1  '../preview-policy.js' -> '@jini-ai/cms/themes/site/preview-policy'
apps/website/src/features/theme/asset-operations.ts:1  './preview-policy.js' -> '@jini-ai/cms/themes/site/preview-policy'
apps/website/src/features/theme/duplicate-theme-tool.ts:1  './preview-policy.js' -> '@jini-ai/cms/themes/site/preview-policy'
apps/website/src/features/theme/page-publication.ts:1  './preview-policy.js' -> '@jini-ai/cms/themes/site/preview-policy'
apps/website/src/features/theme/set-active-theme-tool.ts:1  './preview-policy.js' -> '@jini-ai/cms/themes/site/preview-policy'
apps/website/src/features/theme/theme-read-tools.ts:1  './preview-policy.js' -> '@jini-ai/cms/themes/site/preview-policy'
apps/website/src/features/theme/theme-roster-ports.ts:1  './preview-policy.js' -> '@jini-ai/cms/themes/site/preview-policy'
apps/website/src/features/theme/theme-trash-binding.ts:7  './preview-policy.js' -> '@jini-ai/cms/themes/site/preview-policy'
apps/website/src/features/theme/theme-watch-bindings.ts:1  './preview-policy.js' -> '@jini-ai/cms/themes/site/preview-policy'
apps/website/src/features/theme/verify-active-theme.ts:1  './preview-policy.js' -> '@jini-ai/cms/themes/site/preview-policy'
apps/website/src/server/inbound/admin-http/routes/presentation/patch-active-theme.ts:1  '#src/features/theme/preview-policy' -> '@jini-ai/cms/themes/site/preview-policy'
apps/website/src/server/inbound/admin-http/routes/settings/__tests__/events.unit.test.ts:1  '#src/features/theme/preview-policy' -> '@jini-ai/cms/themes/site/preview-policy'
apps/website/src/server/inbound/admin-http/routes/settings/__tests__/preview-feed-access.test.ts:1  '#src/features/theme/preview-policy' -> '@jini-ai/cms/themes/site/preview-policy'
apps/website/src/server/inbound/admin-http/routes/settings/events.ts:1  '#src/features/theme/preview-policy' -> '@jini-ai/cms/themes/site/preview-policy'
apps/website/src/server/inbound/admin-http/routes/themes/duplicate.ts:1  '#src/features/theme/preview-policy' -> '@jini-ai/cms/themes/site/preview-policy'
apps/website/src/server/inbound/admin-http/routes/themes/explore.ts:7  '#src/features/theme/preview-policy' -> '@jini-ai/cms/themes/site/preview-policy'
apps/website/src/server/inbound/public-http/middleware/__tests__/theme-preview-refresh.test.ts:1  '#src/features/theme/preview-policy' -> '@jini-ai/cms/themes/site/preview-policy'
apps/website/src/server/inbound/public-http/middleware/theme-preview-refresh.ts:1  '#src/features/theme/preview-policy' -> '@jini-ai/cms/themes/site/preview-policy'
apps/website/src/features/theme/file-mutation-tools.ts:8  './theme-file-errors.js' -> '@jini-ai/cms/themes/site/theme-file-errors'
apps/website/src/features/theme/index.ts:115  './theme-file-errors.js' -> '@jini-ai/cms/themes/site/theme-file-errors'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/theme/theme-file-write-ports.ts:5  './theme-file-errors.js' -> '@jini-ai/cms/themes/site/theme-file-errors'
apps/website/src/features/theme/theme-reset-file-tool.ts:10  './theme-file-errors.js' -> '@jini-ai/cms/themes/site/theme-file-errors'
apps/website/src/features/theme/__tests__/duplicate-theme.test.ts:14  '../theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/__tests__/theme-edit-batch-same-file.test.ts:5  '../theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/__tests__/theme-file-differs-from-original.test.ts:8  '../theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/__tests__/theme-file-import.test.ts:10  '../theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/__tests__/theme-file-reset-to-original.test.ts:11  '../theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/__tests__/theme-files.edge-cases.test.ts:10  '../theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/__tests__/theme-files.test.ts:11  '../theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/__tests__/theme-preview-image.test.ts:9  '../theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/__tests__/theme-reset-package-source-probe.test.ts:10  '../theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/__tests__/theme-restore-generated-tree.test.ts:8  '../theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/__tests__/theme-write-preflight.unit.test.ts:8  '../theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/__tests__/write-file-atomically-eloop.unit.test.ts:63  '../theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/agent-tools.ts:2  './theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/asset-operations.ts:8  './theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/asset-operations.ts:14  './theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/duplicate-theme.ts:8  './theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/index.ts:113  './theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/theme/page-publication.ts:6  './theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/page-publish-tool.ts:10  './theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/render-contract.ts:31  './theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/render-contract.ts:57  './theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/theme-file-identity-tools.ts:10  './theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/theme-file-import.ts:28  './theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/theme-file-listing.ts:3  './theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/theme-file-trash-tools.ts:13  './theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/theme-file-write-ports.ts:6  './theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/theme-file-writing.ts:3  './theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/theme-generated-restore.ts:5  './theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/theme-preview-image.ts:6  './theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/theme-read-tools.ts:14  './theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/theme-reset-file-tool.ts:6  './theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/theme-write-tools.ts:7  './theme-files.js' -> '@jini-ai/cms/themes/site/theme-files'
apps/website/src/features/theme/theme-read-tools.ts:8  './theme-read-content.js' -> '@jini-ai/cms/themes/site/theme-read-content'
apps/website/src/features/theme/tool-registrations.ts:35  './theme-read-content.js' -> '@jini-ai/cms/themes/site/theme-read-content'
apps/website/src/features/theme/validation/__tests__/markup.test.ts:5  '../profiles.js' -> '@jini-ai/cms/themes/site/validation/profiles'
apps/website/src/features/theme/validation/validate-theme-package.ts:16  './profiles.js' -> '@jini-ai/cms/themes/site/validation/profiles'
apps/website/src/features/theme/validation/validate-theme-package.ts:18  './profiles.js' -> '@jini-ai/cms/themes/site/validation/profiles'
apps/website/src/features/theme/validation/validate-theme-package.ts:7  './references.js' -> '@jini-ai/cms/themes/site/validation/references'
```

## Tovu tests that must stay green (23; import lines are repointed above, assertions untouched)
- `apps/website/src/features/pages/__tests__/tool-registrations.test.ts`
- `apps/website/src/features/theme/__tests__/duplicate-theme.test.ts`
- `apps/website/src/features/theme/__tests__/handlebars-allowlist.test.ts`
- `apps/website/src/features/theme/__tests__/hardcoded-link-lists.test.ts`
- `apps/website/src/features/theme/__tests__/preview-refresh.test.ts`
- `apps/website/src/features/theme/__tests__/static-render-collection.test.ts`
- `apps/website/src/features/theme/__tests__/theme-edit-batch-same-file.test.ts`
- `apps/website/src/features/theme/__tests__/theme-file-differs-from-original.test.ts`
- `apps/website/src/features/theme/__tests__/theme-file-import.test.ts`
- `apps/website/src/features/theme/__tests__/theme-file-reset-to-original.test.ts`
- `apps/website/src/features/theme/__tests__/theme-files.edge-cases.test.ts`
- `apps/website/src/features/theme/__tests__/theme-files.test.ts`
- `apps/website/src/features/theme/__tests__/theme-preview-image.test.ts`
- `apps/website/src/features/theme/__tests__/theme-reset-package-source-probe.test.ts`
- `apps/website/src/features/theme/__tests__/theme-restore-generated-tree.test.ts`
- `apps/website/src/features/theme/__tests__/theme-roster-sync.test.ts`
- `apps/website/src/features/theme/__tests__/theme-watcher.test.ts`
- `apps/website/src/features/theme/__tests__/theme-write-preflight.unit.test.ts`
- `apps/website/src/features/theme/__tests__/write-file-atomically-eloop.unit.test.ts`
- `apps/website/src/features/theme/validation/__tests__/markup.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/settings/__tests__/events.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/settings/__tests__/preview-feed-access.test.ts`
- `apps/website/src/server/inbound/public-http/middleware/__tests__/theme-preview-refresh.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/theme/entry-list-markup.ts` (17)
- `apps/website/src/features/theme/handlebars-allowlist.ts` (2)
- `apps/website/src/features/theme/liquid-allowlist.ts` (3)
- `apps/website/src/features/theme/theme-files.ts` (1)
- `apps/website/src/features/theme/validation/profiles.ts` (3)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/features/theme/handlebars-allowlist.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why
- `apps/website/src/features/theme/liquid-allowlist.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/features/theme/entry-list-markup.ts:1: export const ENTRY_LIST_ATTRIBUTE = "data-tovu-entry-list";
apps/website/src/features/theme/entry-list-markup.ts:14: const ENTRY_LIST_STYLE_OPEN_TAG = "<style data-tovu-entry-list>";
apps/website/src/features/theme/entry-list-markup.ts:24: ":where([data-tovu-entry-list]){display:grid;gap:1rem;grid-template-columns:repeat(var(--entry-list-columns,3),minmax(0,1fr));list-style:non
apps/website/src/features/theme/entry-list-markup.ts:25: ":where([data-tovu-entry-list].entry-list--list){display:flex;flex-direction:column;grid-template-columns:none}" +
apps/website/src/features/theme/entry-list-markup.ts:26: ":where([data-tovu-entry-list] .entry-card){border:1px solid var(--border,#ddd);background:var(--surface,transparent);padding:1rem;border-ra
apps/website/src/features/theme/entry-list-markup.ts:27: ":where([data-tovu-entry-list] .entry-card__title){margin:0 0 .5rem}" +
apps/website/src/features/theme/entry-list-markup.ts:28: ":where([data-tovu-entry-list] .entry-card__fields dt){color:var(--muted,#666);font-size:.85em}" +
apps/website/src/features/theme/entry-list-markup.ts:29: ":where([data-tovu-entry-list] .entry-card__fields dd){margin:0 0 .75rem}" +
apps/website/src/features/theme/entry-list-markup.ts:30: "@media (max-width:640px){:where([data-tovu-entry-list]){grid-template-columns:1fr}}" +
apps/website/src/features/theme/entry-list-markup.ts:33: ":where([data-tovu-entry-list].entry-list--carousel){display:flex;grid-template-columns:none;overflow-x:auto;scroll-snap-type:x mandatory;pa
apps/website/src/features/theme/entry-list-markup.ts:34: ":where([data-tovu-entry-list].entry-list--carousel > .entry-card){flex:0 0 min(85%,22rem);scroll-snap-align:start}" +
apps/website/src/features/theme/entry-list-markup.ts:35: ":where([data-tovu-entry-list].entry-list--accordion){display:block}" +
apps/website/src/features/theme/entry-list-markup.ts:36: ":where([data-tovu-entry-list] .entry-accordion__item){border-bottom:1px solid var(--border,#ddd);padding:.75rem 0}" +
apps/website/src/features/theme/entry-list-markup.ts:37: ":where([data-tovu-entry-list] .entry-accordion__question){cursor:pointer;font-weight:600}" +
apps/website/src/features/theme/entry-list-markup.ts:38: ":where([data-tovu-entry-list] .entry-accordion__field){margin:.5rem 0 0}" +
```

## Named mutation
in the Jini copy of `handlebars-allowlist.ts`, negate the first `if (` condition of its first exported function; `entry-list-render-layouts.test.ts` must go red, then revert
