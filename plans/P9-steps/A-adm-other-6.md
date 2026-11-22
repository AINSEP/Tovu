# A-adm-other-6 — adm-other → @jini-ai/admin (Jini step J then Tovu step T)

Lane A. Batch J:34 T:35. Depends on: A-adm-other-3, A-adm-users-1, A-adm-other-4, A-adm-other-2, A-adm-other-5. Est: J 67 min, T 37 min.

## J — move verbatim into Jini (12 files, 428 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/features/taxonomy/hooks/merge-term-section-port.hooks.ts` | `packages/admin/src/screens/taxonomy/hooks/merge-term-section-port.hooks.ts` | 23 |  |
| `apps/admin/src/features/taxonomy/hooks/new-taxonomy-form-port.hooks.ts` | `packages/admin/src/screens/taxonomy/hooks/new-taxonomy-form-port.hooks.ts` | 16 |  |
| `apps/admin/src/features/taxonomy/hooks/new-term-form-port.hooks.ts` | `packages/admin/src/screens/taxonomy/hooks/new-term-form-port.hooks.ts` | 19 |  |
| `apps/admin/src/features/taxonomy/hooks/taxonomy-port.hooks.ts` | `packages/admin/src/screens/taxonomy/hooks/taxonomy-port.hooks.ts` | 32 |  |
| `apps/admin/src/features/taxonomy/TaxonomyRowMenu.tsx` | `packages/admin/src/screens/taxonomy/TaxonomyRowMenu.tsx` | 108 |  |
| `apps/admin/src/features/trash/hooks/trash-port.hooks.ts` | `packages/admin/src/screens/trash/hooks/trash-port.hooks.ts` | 25 |  |
| `apps/admin/src/features/integrations/IntegrationsRedirect.tsx` | `packages/admin/src/screens/integrations/IntegrationsRedirect.tsx` | 15 | W1 |
| `apps/admin/src/features/menus/hooks/menus-port.hooks.ts` | `packages/admin/src/screens/menus/hooks/menus-port.hooks.ts` | 41 |  |
| `apps/admin/src/features/menus/html-rules.ts` | `packages/admin/src/screens/menus/html-rules.ts` | 75 |  |
| `apps/admin/src/features/menus/MenuPageLinkFields.hooks.ts` | `packages/admin/src/screens/menus/MenuPageLinkFields.hooks.ts` | 31 |  |
| `apps/admin/src/features/taxonomy/hooks/term-picker-port.hooks.ts` | `packages/admin/src/screens/taxonomy/hooks/term-picker-port.hooks.ts` | 20 |  |
| `apps/admin/src/features/menus/MenuPageLinkFields.tsx` | `packages/admin/src/screens/menus/MenuPageLinkFields.tsx` | 23 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./screens/integrations/IntegrationsRedirect"]
- "@jini-ai/admin" exports["./screens/menus/MenuPageLinkFields"]
- "@jini-ai/admin" exports["./screens/menus/MenuPageLinkFields.hooks"]
- "@jini-ai/admin" exports["./screens/menus/hooks/menus-port.hooks"]
- "@jini-ai/admin" exports["./screens/menus/html-rules"]
- "@jini-ai/admin" exports["./screens/taxonomy/TaxonomyRowMenu"]
- "@jini-ai/admin" exports["./screens/taxonomy/hooks/merge-term-section-port.hooks"]
- "@jini-ai/admin" exports["./screens/taxonomy/hooks/new-taxonomy-form-port.hooks"]
- "@jini-ai/admin" exports["./screens/taxonomy/hooks/new-term-form-port.hooks"]
- "@jini-ai/admin" exports["./screens/taxonomy/hooks/taxonomy-port.hooks"]
- "@jini-ai/admin" exports["./screens/taxonomy/hooks/term-picker-port.hooks"]
- "@jini-ai/admin" exports["./screens/trash/hooks/trash-port.hooks"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (2, 217 LOC) → Jini `__tests__/` beside the destination
- `apps/admin/src/features/taxonomy/__tests__/TaxonomyRowMenu.unit.test.tsx`
- `apps/admin/src/features/menus/__tests__/MenuPageLinkFields.hooks.unit.test.ts`


## T — Tovu repoint: delete the 12 sources, rewrite every importer (27 lines)

```
apps/admin/src/features/taxonomy/hooks/merge-term-section-dependencies.hooks.ts:2  './merge-term-section-port.hooks' -> '@jini-ai/admin/screens/taxonomy/hooks/merge-term-section-port.hooks'
apps/admin/src/features/taxonomy/hooks/use-merge-term-section.hooks.ts:9  './merge-term-section-port.hooks' -> '@jini-ai/admin/screens/taxonomy/hooks/merge-term-section-port.hooks'
apps/admin/src/features/taxonomy/hooks/new-taxonomy-form-dependencies.hooks.ts:2  './new-taxonomy-form-port.hooks' -> '@jini-ai/admin/screens/taxonomy/hooks/new-taxonomy-form-port.hooks'
apps/admin/src/features/taxonomy/hooks/use-new-taxonomy-form.hooks.ts:8  './new-taxonomy-form-port.hooks' -> '@jini-ai/admin/screens/taxonomy/hooks/new-taxonomy-form-port.hooks'
apps/admin/src/features/taxonomy/hooks/new-term-form-dependencies.hooks.ts:2  './new-term-form-port.hooks' -> '@jini-ai/admin/screens/taxonomy/hooks/new-term-form-port.hooks'
apps/admin/src/features/taxonomy/hooks/use-new-term-form.hooks.ts:9  './new-term-form-port.hooks' -> '@jini-ai/admin/screens/taxonomy/hooks/new-term-form-port.hooks'
apps/admin/src/features/taxonomy/hooks/taxonomy-dependencies.hooks.ts:5  './taxonomy-port.hooks' -> '@jini-ai/admin/screens/taxonomy/hooks/taxonomy-port.hooks'
apps/admin/src/features/taxonomy/hooks/use-taxonomy.hooks.ts:18  './taxonomy-port.hooks' -> '@jini-ai/admin/screens/taxonomy/hooks/taxonomy-port.hooks'
apps/admin/src/features/taxonomy/hooks/use-term-detail-panel.hooks.ts:9  './taxonomy-port.hooks' -> '@jini-ai/admin/screens/taxonomy/hooks/taxonomy-port.hooks'
apps/admin/src/features/taxonomy/Taxonomy.tsx:4  './TaxonomyRowMenu' -> '@jini-ai/admin/screens/taxonomy/TaxonomyRowMenu'
apps/admin/src/features/trash/__tests__/use-trash.unit.test.tsx:11  '../hooks/trash-port.hooks' -> '@jini-ai/admin/screens/trash/hooks/trash-port.hooks'
apps/admin/src/features/trash/hooks/trash-dependencies.hooks.ts:5  './trash-port.hooks' -> '@jini-ai/admin/screens/trash/hooks/trash-port.hooks'
apps/admin/src/features/trash/hooks/use-trash.hooks.ts:21  './trash-port.hooks' -> '@jini-ai/admin/screens/trash/hooks/trash-port.hooks'
apps/admin/src/features/integrations/__tests__/IntegrationsRedirect.unit.test.tsx:4  '../IntegrationsRedirect' -> '@jini-ai/admin/screens/integrations/IntegrationsRedirect'
apps/admin/src/features/integrations/index.ts:23  './IntegrationsRedirect' -> '@jini-ai/admin/screens/integrations/IntegrationsRedirect'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/admin/src/features/menus/hooks/menus-dependencies.hooks.ts:5  './menus-port.hooks' -> '@jini-ai/admin/screens/menus/hooks/menus-port.hooks'
apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts:14  './menus-port.hooks' -> '@jini-ai/admin/screens/menus/hooks/menus-port.hooks'
apps/admin/src/features/menus/hooks/use-menus.hooks.ts:10  './menus-port.hooks' -> '@jini-ai/admin/screens/menus/hooks/menus-port.hooks'
apps/admin/src/features/menus/__tests__/html-embed.unit.test.tsx:8  '../html-rules' -> '@jini-ai/admin/screens/menus/html-rules'
apps/admin/src/features/menus/__tests__/menu-html-mode.unit.test.tsx:9  '../html-rules' -> '@jini-ai/admin/screens/menus/html-rules'
apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts:11  '../html-rules' -> '@jini-ai/admin/screens/menus/html-rules'
apps/admin/src/features/menus/MenuEditor.tsx:10  './MenuPageLinkFields.hooks' -> '@jini-ai/admin/screens/menus/MenuPageLinkFields.hooks'
apps/admin/src/features/taxonomy/__tests__/use-term-picker.unit.test.tsx:7  '../hooks/term-picker-port.hooks' -> '@jini-ai/admin/screens/taxonomy/hooks/term-picker-port.hooks'
apps/admin/src/features/taxonomy/hooks/term-picker-dependencies.hooks.ts:4  './term-picker-port.hooks' -> '@jini-ai/admin/screens/taxonomy/hooks/term-picker-port.hooks'
apps/admin/src/features/taxonomy/hooks/use-term-picker.hooks.ts:11  './term-picker-port.hooks' -> '@jini-ai/admin/screens/taxonomy/hooks/term-picker-port.hooks'
apps/admin/src/features/menus/MenuEditor.tsx:8  './MenuPageLinkFields' -> '@jini-ai/admin/screens/menus/MenuPageLinkFields'
apps/admin/src/features/menus/__tests__/page-link-fields.unit.test.tsx:4  '../MenuPageLinkFields' -> '@jini-ai/admin/screens/menus/MenuPageLinkFields'
```

## Tovu tests that must stay green (6; import lines are repointed above, assertions untouched)
- `apps/admin/src/features/integrations/__tests__/IntegrationsRedirect.unit.test.tsx`
- `apps/admin/src/features/menus/__tests__/html-embed.unit.test.tsx`
- `apps/admin/src/features/menus/__tests__/menu-html-mode.unit.test.tsx`
- `apps/admin/src/features/menus/__tests__/page-link-fields.unit.test.tsx`
- `apps/admin/src/features/taxonomy/__tests__/use-term-picker.unit.test.tsx`
- `apps/admin/src/features/trash/__tests__/use-trash.unit.test.tsx`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/admin/src/features/integrations/IntegrationsRedirect.tsx` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/admin/src/features/menus/html-rules.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Hook-injection gate (Jini `check:hook-injection`)
- `apps/admin/src/features/taxonomy/TaxonomyRowMenu.tsx` imports a custom hook module directly; in Jini the hook must arrive as a prop from the host (owner CI rule). Keep the hook file beside it; the Tovu screen that renders it passes the hook. If that needs more than a prop added at the single call site, STOP and report.
- `apps/admin/src/features/integrations/IntegrationsRedirect.tsx` imports a custom hook module directly; in Jini the hook must arrive as a prop from the host (owner CI rule). Keep the hook file beside it; the Tovu screen that renders it passes the hook. If that needs more than a prop added at the single call site, STOP and report.
- `apps/admin/src/features/menus/MenuPageLinkFields.tsx` imports a custom hook module directly; in Jini the hook must arrive as a prop from the host (owner CI rule). Keep the hook file beside it; the Tovu screen that renders it passes the hook. If that needs more than a prop added at the single call site, STOP and report.

## Class names (Jini packages use `jini-*`)
- `apps/admin/src/features/taxonomy/TaxonomyRowMenu.tsx`: rename its own class names to `jini-<block>__<element>` in the same commit as the matching CSS selectors; list every rename in the step report
- `apps/admin/src/features/menus/MenuPageLinkFields.tsx`: rename its own class names to `jini-<block>__<element>` in the same commit as the matching CSS selectors; list every rename in the step report

## Named mutation
in the Jini copy of `TaxonomyRowMenu.tsx`, negate the first `if (` condition of its first exported function; `TaxonomyRowMenu.unit.test.tsx` must go red, then revert
