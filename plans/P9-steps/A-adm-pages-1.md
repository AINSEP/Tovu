# A-adm-pages-1 — adm-pages → @jini-ai/admin (Jini step J then Tovu step T)

Lane A. Batch J:30 T:31. Depends on: A-adm-posts-1. Est: J 61 min, T 46 min.

## J — move verbatim into Jini (9 files, 630 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/features/pages/api/pages-api.types.ts` | `packages/admin/src/pages/api/pages-api.types.ts` | 8 |  |
| `apps/admin/src/features/pages/hooks/pages-tab-url.hooks.ts` | `packages/admin/src/pages/hooks/pages-tab-url.hooks.ts` | 63 |  |
| `apps/admin/src/features/pages/hooks/theme-canvas-port.hooks.ts` | `packages/admin/src/pages/hooks/theme-canvas-port.hooks.ts` | 44 |  |
| `apps/admin/src/features/pages/hooks/theme-pages-port.hooks.ts` | `packages/admin/src/pages/hooks/theme-pages-port.hooks.ts` | 80 |  |
| `apps/admin/src/features/pages/lib/page-preview-youtube.ts` | `packages/admin/src/pages/lib/page-preview-youtube.ts` | 34 |  |
| `apps/admin/src/features/pages/lib/prettify-html.ts` | `packages/admin/src/pages/lib/prettify-html.ts` | 286 | W4 |
| `apps/admin/src/features/pages/hooks/pages-port.hooks.ts` | `packages/admin/src/pages/hooks/pages-port.hooks.ts` | 33 |  |
| `apps/admin/src/features/pages/hooks/theme-canvas-dependencies.hooks.ts` | `packages/admin/src/pages/hooks/theme-canvas-dependencies.hooks.ts` | 75 |  |
| `apps/admin/src/features/pages/Pages.hooks.ts` | `packages/admin/src/pages/Pages.hooks.ts` | 7 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./pages/Pages.hooks"]
- "@jini-ai/admin" exports["./pages/api/pages-api.types"]
- "@jini-ai/admin" exports["./pages/hooks/pages-port.hooks"]
- "@jini-ai/admin" exports["./pages/hooks/pages-tab-url.hooks"]
- "@jini-ai/admin" exports["./pages/hooks/theme-canvas-dependencies.hooks"]
- "@jini-ai/admin" exports["./pages/hooks/theme-canvas-port.hooks"]
- "@jini-ai/admin" exports["./pages/hooks/theme-pages-port.hooks"]
- "@jini-ai/admin" exports["./pages/lib/page-preview-youtube"]
- "@jini-ai/admin" exports["./pages/lib/prettify-html"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (3, 284 LOC) → Jini `__tests__/` beside the destination
- `apps/admin/src/features/pages/__tests__/pages-tab-url.hooks.unit.test.ts`
- `apps/admin/src/features/pages/__tests__/prettify-html.unit.test.ts`
- `apps/admin/src/features/pages/hooks/__tests__/theme-canvas-dependencies.unit.test.ts`


## T — Tovu repoint: delete the 9 sources, rewrite every importer (31 lines)

```
apps/admin/src/features/pages/api/pages-api.ts:4  './pages-api.types' -> '@jini-ai/admin/pages/api/pages-api.types'
apps/admin/src/features/pages/hooks/page-editor-port.hooks.ts:3  '@/features/pages/api/pages-api.types' -> '@jini-ai/admin/pages/api/pages-api.types'
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:8  '@/features/pages/api/pages-api.types' -> '@jini-ai/admin/pages/api/pages-api.types'
apps/admin/src/features/pages/lib/embed-placeholder.ts:5  '@/features/pages/api/pages-api.types' -> '@jini-ai/admin/pages/api/pages-api.types'
apps/admin/src/features/pages/Pages.tsx:23  './hooks/pages-tab-url.hooks' -> '@jini-ai/admin/pages/hooks/pages-tab-url.hooks'
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:51  './theme-canvas-port.hooks' -> '@jini-ai/admin/pages/hooks/theme-canvas-port.hooks'
apps/admin/src/features/pages/hooks/use-theme-canvas-styling.hooks.ts:7  './theme-canvas-port.hooks' -> '@jini-ai/admin/pages/hooks/theme-canvas-port.hooks'
apps/admin/src/features/pages/__tests__/use-theme-pages.unit.test.ts:13  '../hooks/theme-pages-port.hooks' -> '@jini-ai/admin/pages/hooks/theme-pages-port.hooks'
apps/admin/src/features/pages/hooks/__tests__/theme-pages-dependencies.unit.test.ts:3  '../theme-pages-port.hooks' -> '@jini-ai/admin/pages/hooks/theme-pages-port.hooks'
apps/admin/src/features/pages/hooks/__tests__/use-theme-pages-display-state.unit.test.ts:5  '../theme-pages-port.hooks' -> '@jini-ai/admin/pages/hooks/theme-pages-port.hooks'
apps/admin/src/features/pages/hooks/theme-pages-dependencies.hooks.ts:2  './theme-pages-port.hooks' -> '@jini-ai/admin/pages/hooks/theme-pages-port.hooks'
apps/admin/src/features/pages/hooks/use-theme-pages.hooks.ts:9  './theme-pages-port.hooks' -> '@jini-ai/admin/pages/hooks/theme-pages-port.hooks'
apps/admin/src/features/pages/lib/theme-page-publish-state.ts:4  '../hooks/theme-pages-port.hooks' -> '@jini-ai/admin/pages/hooks/theme-pages-port.hooks'
apps/admin/src/features/pages/PageEditor.tsx:15  './lib/page-preview-youtube' -> '@jini-ai/admin/pages/lib/page-preview-youtube'
apps/admin/src/features/pages/__tests__/use-page-editor.unit.test.ts:10  '../lib/prettify-html' -> '@jini-ai/admin/pages/lib/prettify-html'
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:30  '../lib/prettify-html' -> '@jini-ai/admin/pages/lib/prettify-html'
apps/admin/src/features/pages/hooks/page-editor-port.hooks.ts:5  './pages-port.hooks' -> '@jini-ai/admin/pages/hooks/pages-port.hooks'
apps/admin/src/features/pages/hooks/pages-dependencies.hooks.ts:6  './pages-port.hooks' -> '@jini-ai/admin/pages/hooks/pages-port.hooks'
apps/admin/src/features/pages/hooks/use-pages.hooks.ts:12  './pages-port.hooks' -> '@jini-ai/admin/pages/hooks/pages-port.hooks'
apps/admin/src/__tests__/fqfix-editor-reopen.unit.test.tsx:10  '@/features/pages/hooks/theme-canvas-dependencies.hooks' -> '@jini-ai/admin/pages/hooks/theme-canvas-dependencies.hooks'
apps/admin/src/features/pages/__tests__/PageEditor.interactive-flush.unit.test.tsx:8  '../hooks/theme-canvas-dependencies.hooks' -> '@jini-ai/admin/pages/hooks/theme-canvas-dependencies.hooks'
apps/admin/src/features/pages/__tests__/PageEditor.preview-remount.unit.test.tsx:18  '../hooks/theme-canvas-dependencies.hooks' -> '@jini-ai/admin/pages/hooks/theme-canvas-dependencies.hooks'
apps/admin/src/features/pages/__tests__/html-tab-new-page.unit.test.ts:6  '../hooks/theme-canvas-dependencies.hooks' -> '@jini-ai/admin/pages/hooks/theme-canvas-dependencies.hooks'
apps/admin/src/features/pages/__tests__/scriptblocks-controller.unit.test.ts:6  '../hooks/theme-canvas-dependencies.hooks' -> '@jini-ai/admin/pages/hooks/theme-canvas-dependencies.hooks'
apps/admin/src/features/pages/__tests__/use-page-editor.unit.test.ts:6  '../hooks/theme-canvas-dependencies.hooks' -> '@jini-ai/admin/pages/hooks/theme-canvas-dependencies.hooks'
apps/admin/src/features/pages/__tests__/use-theme-canvas-styling.unit.test.ts:4  '../hooks/theme-canvas-dependencies.hooks' -> '@jini-ai/admin/pages/hooks/theme-canvas-dependencies.hooks'
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:50  './theme-canvas-dependencies.hooks' -> '@jini-ai/admin/pages/hooks/theme-canvas-dependencies.hooks'
apps/admin/src/features/pages/hooks/use-theme-canvas-styling.hooks.ts:8  './theme-canvas-dependencies.hooks' -> '@jini-ai/admin/pages/hooks/theme-canvas-dependencies.hooks'
apps/admin/src/features/themes/__tests__/theme-preview-dirty.unit.test.tsx:8  '../../pages/hooks/theme-canvas-dependencies.hooks' -> '@jini-ai/admin/pages/hooks/theme-canvas-dependencies.hooks'
apps/admin/src/hooks/__tests__/editor-session-expiry.unit.test.ts:9  '../../features/pages/hooks/theme-canvas-dependencies.hooks' -> '@jini-ai/admin/pages/hooks/theme-canvas-dependencies.hooks'
apps/admin/src/features/pages/Pages.tsx:2  './Pages.hooks' -> '@jini-ai/admin/pages/Pages.hooks'
```

## Tovu tests that must stay green (12; import lines are repointed above, assertions untouched)
- `apps/admin/src/__tests__/fqfix-editor-reopen.unit.test.tsx`
- `apps/admin/src/features/pages/__tests__/PageEditor.interactive-flush.unit.test.tsx`
- `apps/admin/src/features/pages/__tests__/PageEditor.preview-remount.unit.test.tsx`
- `apps/admin/src/features/pages/__tests__/html-tab-new-page.unit.test.ts`
- `apps/admin/src/features/pages/__tests__/scriptblocks-controller.unit.test.ts`
- `apps/admin/src/features/pages/__tests__/use-page-editor.unit.test.ts`
- `apps/admin/src/features/pages/__tests__/use-theme-canvas-styling.unit.test.ts`
- `apps/admin/src/features/pages/__tests__/use-theme-pages.unit.test.ts`
- `apps/admin/src/features/pages/hooks/__tests__/theme-pages-dependencies.unit.test.ts`
- `apps/admin/src/features/pages/hooks/__tests__/use-theme-pages-display-state.unit.test.ts`
- `apps/admin/src/features/themes/__tests__/theme-preview-dirty.unit.test.tsx`
- `apps/admin/src/hooks/__tests__/editor-session-expiry.unit.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/admin/src/features/pages/lib/prettify-html.ts` (4)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/admin/src/features/pages/hooks/theme-canvas-port.hooks.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why
- `apps/admin/src/features/pages/hooks/theme-canvas-dependencies.hooks.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Named mutation
in the Jini copy of `prettify-html.ts`, negate the first `if (` condition of its first exported function; `prettify-html.unit.test.ts` must go red, then revert
