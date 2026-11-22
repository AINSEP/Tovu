# A-adm-themes-1 — adm-themes → @jini-ai/admin (Jini step J then Tovu step T)

Lane A. Batch J:24 T:25. Depends on: none (only already-Jini code). Est: J 64 min, T 49 min.

## J — move verbatim into Jini (9 files, 800 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/features/themes/api/themes-api.types.ts` | `packages/admin/src/themes/api/themes-api.types.ts` | 51 |  |
| `apps/admin/src/features/themes/hooks/theme-explore-open-file.hooks.ts` | `packages/admin/src/themes/hooks/theme-explore-open-file.hooks.ts` | 40 |  |
| `apps/admin/src/features/themes/hooks/use-theme-card-preview.hooks.ts` | `packages/admin/src/themes/hooks/use-theme-card-preview.hooks.ts` | 22 |  |
| `apps/admin/src/features/themes/hooks/theme-explore-port.hooks.ts` | `packages/admin/src/themes/hooks/theme-explore-port.hooks.ts` | 97 |  |
| `apps/admin/src/features/themes/hooks/themes-port.hooks.ts` | `packages/admin/src/themes/hooks/themes-port.hooks.ts` | 31 |  |
| `apps/admin/src/features/themes/rules.ts` | `packages/admin/src/themes/rules.ts` | 261 | W4 |
| `apps/admin/src/features/themes/hooks/theme-explore-url.hooks.ts` | `packages/admin/src/themes/hooks/theme-explore-url.hooks.ts` | 154 |  |
| `apps/admin/src/features/themes/theme-card-menu.ts` | `packages/admin/src/themes/theme-card-menu.ts` | 85 |  |
| `apps/admin/src/features/themes/hooks/use-theme-delete-request.hooks.ts` | `packages/admin/src/themes/hooks/use-theme-delete-request.hooks.ts` | 59 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./themes/api/themes-api.types"]
- "@jini-ai/admin" exports["./themes/hooks/theme-explore-open-file.hooks"]
- "@jini-ai/admin" exports["./themes/hooks/theme-explore-port.hooks"]
- "@jini-ai/admin" exports["./themes/hooks/theme-explore-url.hooks"]
- "@jini-ai/admin" exports["./themes/hooks/themes-port.hooks"]
- "@jini-ai/admin" exports["./themes/hooks/use-theme-card-preview.hooks"]
- "@jini-ai/admin" exports["./themes/hooks/use-theme-delete-request.hooks"]
- "@jini-ai/admin" exports["./themes/rules"]
- "@jini-ai/admin" exports["./themes/theme-card-menu"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (4, 477 LOC) → Jini `__tests__/` beside the destination
- `apps/admin/src/features/themes/__tests__/rules.unit.test.ts`
- `apps/admin/src/features/themes/__tests__/theme-explore-open-file.hooks.unit.test.ts`
- `apps/admin/src/features/themes/__tests__/use-theme-card-preview.hooks.unit.test.ts`
- `apps/admin/src/features/themes/__tests__/theme-explore-url.hooks.unit.test.ts`


## T — Tovu repoint: delete the 9 sources, rewrite every importer (41 lines)

```
apps/admin/src/components/TemplateSource/TemplateSourceModal.tsx:7  '@/features/themes/api/themes-api.types' -> '@jini-ai/admin/themes/api/themes-api.types'
apps/admin/src/components/TemplateSource/use-template-source.hooks.ts:6  '@/features/themes/api/themes-api.types' -> '@jini-ai/admin/themes/api/themes-api.types'
apps/admin/src/features/pages/PageEditor.tsx:34  '../themes/api/themes-api.types' -> '@jini-ai/admin/themes/api/themes-api.types'
apps/admin/src/features/pages/__tests__/use-theme-pages.unit.test.ts:4  '@/features/themes/api/themes-api.types' -> '@jini-ai/admin/themes/api/themes-api.types'
apps/admin/src/features/pages/hooks/page-editor-dependencies.hooks.ts:2  '@/features/themes/api/themes-api.types' -> '@jini-ai/admin/themes/api/themes-api.types'
apps/admin/src/features/pages/hooks/page-editor-port.hooks.ts:1  '@/features/themes/api/themes-api.types' -> '@jini-ai/admin/themes/api/themes-api.types'
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:6  '@/features/themes/api/themes-api.types' -> '@jini-ai/admin/themes/api/themes-api.types'
apps/admin/src/features/pages/hooks/use-theme-pages.hooks.ts:4  '@/features/themes/api/themes-api.types' -> '@jini-ai/admin/themes/api/themes-api.types'
apps/admin/src/features/posts/__tests__/post-editor-state.rules.unit.test.ts:3  '@/features/themes/api/themes-api.types' -> '@jini-ai/admin/themes/api/themes-api.types'
apps/admin/src/features/posts/editor/template/PostEditorTemplateModalGate.tsx:2  '@/features/themes/api/themes-api.types' -> '@jini-ai/admin/themes/api/themes-api.types'
apps/admin/src/features/posts/hooks/post-editor-dependencies.hooks.ts:4  '@/features/themes/api/themes-api.types' -> '@jini-ai/admin/themes/api/themes-api.types'
apps/admin/src/features/posts/hooks/post-editor-port.hooks.ts:2  '@/features/themes/api/themes-api.types' -> '@jini-ai/admin/themes/api/themes-api.types'
apps/admin/src/features/posts/hooks/post-editor-state.rules.ts:1  '@/features/themes/api/themes-api.types' -> '@jini-ai/admin/themes/api/themes-api.types'
apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:21  '@/features/themes/api/themes-api.types' -> '@jini-ai/admin/themes/api/themes-api.types'
apps/admin/src/features/themes/Themes.tsx:6  './api/themes-api.types' -> '@jini-ai/admin/themes/api/themes-api.types'
apps/admin/src/features/themes/__tests__/Themes.unit.test.tsx:7  '@/features/themes/api/themes-api.types' -> '@jini-ai/admin/themes/api/themes-api.types'
apps/admin/src/features/themes/__tests__/themes-delete.unit.test.tsx:5  '@/features/themes/api/themes-api.types' -> '@jini-ai/admin/themes/api/themes-api.types'
apps/admin/src/features/themes/__tests__/themes-duplicate.unit.test.tsx:5  '@/features/themes/api/themes-api.types' -> '@jini-ai/admin/themes/api/themes-api.types'
apps/admin/src/features/themes/__tests__/use-themes.hooks.unit.test.ts:5  '@/features/themes/api/themes-api.types' -> '@jini-ai/admin/themes/api/themes-api.types'
apps/admin/src/features/themes/api/themes-api.ts:4  './themes-api.types' -> '@jini-ai/admin/themes/api/themes-api.types'
apps/admin/src/features/themes/hooks/themes-dependencies.hooks.ts:1  '@/features/themes/api/themes-api.types' -> '@jini-ai/admin/themes/api/themes-api.types'
apps/admin/src/features/themes/hooks/use-themes.hooks.ts:4  '@/features/themes/api/themes-api.types' -> '@jini-ai/admin/themes/api/themes-api.types'
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:21  './theme-explore-open-file.hooks' -> '@jini-ai/admin/themes/hooks/theme-explore-open-file.hooks'
apps/admin/src/features/themes/Themes.tsx:14  './hooks/use-theme-card-preview.hooks' -> '@jini-ai/admin/themes/hooks/use-theme-card-preview.hooks'
apps/admin/src/features/themes/__tests__/use-theme-explore.hooks.unit.test.ts:11  '../hooks/theme-explore-port.hooks' -> '@jini-ai/admin/themes/hooks/theme-explore-port.hooks'
apps/admin/src/features/themes/hooks/theme-explore-dependencies.hooks.ts:2  './theme-explore-port.hooks' -> '@jini-ai/admin/themes/hooks/theme-explore-port.hooks'
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:20  './theme-explore-port.hooks' -> '@jini-ai/admin/themes/hooks/theme-explore-port.hooks'
apps/admin/src/features/themes/__tests__/use-theme-explore-theme.hooks.unit.test.tsx:6  '../hooks/themes-port.hooks' -> '@jini-ai/admin/themes/hooks/themes-port.hooks'
apps/admin/src/features/themes/hooks/themes-dependencies.hooks.ts:4  './themes-port.hooks' -> '@jini-ai/admin/themes/hooks/themes-port.hooks'
apps/admin/src/features/themes/hooks/use-theme-explore-theme.hooks.ts:5  './themes-port.hooks' -> '@jini-ai/admin/themes/hooks/themes-port.hooks'
apps/admin/src/features/themes/hooks/use-themes.hooks.ts:11  './themes-port.hooks' -> '@jini-ai/admin/themes/hooks/themes-port.hooks'
apps/admin/src/features/themes/Themes.tsx:30  './rules' -> '@jini-ai/admin/themes/rules'
apps/admin/src/features/themes/__tests__/use-theme-explore.hooks.unit.test.ts:34  '../rules' -> '@jini-ai/admin/themes/rules'
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:11  '../rules' -> '@jini-ai/admin/themes/rules'
apps/admin/src/features/themes/hooks/use-themes.hooks.ts:7  '../rules' -> '@jini-ai/admin/themes/rules'
apps/admin/src/components/TemplateSource/__tests__/TemplateSourceModal.unit.test.tsx:8  '@/features/themes/hooks/theme-explore-url.hooks' -> '@jini-ai/admin/themes/hooks/theme-explore-url.hooks'
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:25  './theme-explore-url.hooks' -> '@jini-ai/admin/themes/hooks/theme-explore-url.hooks'
apps/admin/src/features/themes/Themes.tsx:17  './theme-card-menu' -> '@jini-ai/admin/themes/theme-card-menu'
apps/admin/src/features/themes/__tests__/themes-delete.unit.test.tsx:11  '../theme-card-menu' -> '@jini-ai/admin/themes/theme-card-menu'
apps/admin/src/features/themes/Themes.tsx:16  './hooks/use-theme-delete-request.hooks' -> '@jini-ai/admin/themes/hooks/use-theme-delete-request.hooks'
apps/admin/src/features/themes/__tests__/themes-delete.unit.test.tsx:9  '../hooks/use-theme-delete-request.hooks' -> '@jini-ai/admin/themes/hooks/use-theme-delete-request.hooks'
```

## Tovu tests that must stay green (9; import lines are repointed above, assertions untouched)
- `apps/admin/src/components/TemplateSource/__tests__/TemplateSourceModal.unit.test.tsx`
- `apps/admin/src/features/pages/__tests__/use-theme-pages.unit.test.ts`
- `apps/admin/src/features/posts/__tests__/post-editor-state.rules.unit.test.ts`
- `apps/admin/src/features/themes/__tests__/Themes.unit.test.tsx`
- `apps/admin/src/features/themes/__tests__/themes-delete.unit.test.tsx`
- `apps/admin/src/features/themes/__tests__/themes-duplicate.unit.test.tsx`
- `apps/admin/src/features/themes/__tests__/use-theme-explore-theme.hooks.unit.test.tsx`
- `apps/admin/src/features/themes/__tests__/use-theme-explore.hooks.unit.test.ts`
- `apps/admin/src/features/themes/__tests__/use-themes.hooks.unit.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/admin/src/features/themes/rules.ts` (4)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/admin/src/features/themes/api/themes-api.types.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why
- `apps/admin/src/features/themes/hooks/theme-explore-url.hooks.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Named mutation
in the Jini copy of `rules.ts`, negate the first `if (` condition of its first exported function; `rules.unit.test.ts` must go red, then revert
