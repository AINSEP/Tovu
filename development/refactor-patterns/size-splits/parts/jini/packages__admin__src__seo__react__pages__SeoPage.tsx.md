### jini:packages/admin/src/seo/react/pages/SeoPage.tsx
- **Over:** file 608 · `SeoDefaultsTab` 136
- **Phase:** now · **Batch:** size-21
- **Tests:** `packages/admin/src/seo/react/__tests__/Seo.unit.test.tsx`, `.../share-image-warning.unit.test.tsx`, `.../copy-polish.unit.test.tsx`, `.../seo-hooks-fallbacks.unit.test.tsx`, `.../use-seo-entry-panel.unit.test.ts`, `packages/admin/src/__tests__/fqfix-loading.unit.test.tsx` (pkg `@jini-ai/admin`)
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `SeoSectionProps`, `SeoSection` | titled left-rail group layout (shared by all tabs) |
| B | `EntryPickerProps`, `EntryPicker`, `issueStatusClass`, `AnalyzePanel`, `SeoEntryPanelProps`, `SeoEntryPanel`, `SeoCopy`, `SeoEntryFieldsProps`, `SeoEntryHead`, `SeoEntrySearchFields`, `SeoEntrySocialFields`, `SeoEntryXFields`, `SeoEntrySectionProps`, `SeoEntrySection` | per-entry overrides tab (picker, edit form, analyze) |
| C | `SeoDefaultsTab`, `SeoSitemapTab`, `SeoProps`, `Seo`, `seoTabPanel`, re-export/default | site-wide tabs + screen dispatch |

- **Splits:**
  1. NEW `pages/SeoPage-section.tsx` — job: shared titled group. Moves `SeoSectionProps`, `SeoSection` (+ their comment). Exports both. Imports nothing from SeoPage.
  2. NEW `pages/SeoPage-entry.tsx` — job: per-entry SEO tab. Moves all of unit B in its current order with every comment (incl. the REQ-06/07 ones). Imports `SeoSection` from `./SeoPage-section.js` and the hooks/components unit B uses (copy those import lines; drop now-unused ones from SeoPage). Exports `SeoEntrySection`, `SeoEntrySectionProps`, and every other name that was `export`ed (`EntryPickerProps`, `SeoEntryPanelProps`). Never imports SeoPage.
  3. SUB-COMPONENTS in SeoPage, above `SeoDefaultsTab`: `SeoDefaultsSearchSection({ t, locale, settings }: SeoDefaultsSectionProps)` ← `<SeoSection title={t({ locale: locale, key: "Search appearan…` block; `SeoDefaultsSocialSection({ t, locale, settings, defaultOgImage, setDefaultOgImage }: SeoDefaultsSocialSectionProps)` ← the "Social preview" `<SeoSection`; `SeoDefaultsCrawlingSection({ t, locale, settings }: SeoDefaultsSectionProps)` ← the "Crawling" `<SeoSection`. `t` typed as `SeoCopy` (import the type from `./SeoPage-entry.js`, or `ReturnType<typeof useSeoCopy>`). The actions `<div className="jini-editor-actions …">` stays in `SeoDefaultsTab`.
- **Importers to update:** `packages/admin/src/seo/react/hooks/SeoModuleTabs.ts` (`SeoEntrySection` → `../pages/SeoPage-entry.js`; `SeoDefaultsTab`, `SeoSitemapTab` stay), `packages/admin/src/seo/react/__tests__/share-image-warning.unit.test.tsx` (`SeoEntrySection` → `../pages/SeoPage-entry.js`). `seo/react/index.ts` only re-exports type `SeoProps` (stays) — `./seo/react` is a package entry but `SeoEntrySection` is not exported from it, so no re-export needed.
- **After:** SeoPage ~290; `SeoDefaultsTab` ~30; SeoPage-entry ~320; SeoPage-section ~20.
- **Risks / notes:** check `rg -n "vi\.mock" packages/admin/src/seo` for mocks of `pages/SeoPage` before moving. The file header paragraph (SPEC-008 §2.4) stays in SeoPage; copy the part describing the entry tab into SeoPage-entry's header.
