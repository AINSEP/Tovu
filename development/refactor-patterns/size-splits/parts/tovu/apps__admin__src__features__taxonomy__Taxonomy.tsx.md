### tovu:apps/admin/src/features/taxonomy/Taxonomy.tsx
- **Over:** file 690 lines · `namespaceList` 146 · `<arg of taxonomies.map>` 111
- **Phase:** after-move (MOVE-AFTER host ports + Publi…) · **Batch:** size-52
- **Tests:** `apps/admin/src/features/taxonomy/__tests__/Taxonomy.unit.test.tsx`, `apps/admin/src/features/taxonomy/__tests__/taxonomy-agent-drive.unit.test.tsx`, `apps/admin/src/features/taxonomy/__tests__/embed-header-alignment.unit.test.tsx`, `apps/admin/src/__tests__/unit/admin-route-lazy-loading.unit.test.tsx`
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `TaxonomyProps`, `TaxonomyPageHeader*`, `TermDeleteDialog*`, `TaxonomyDeleteDialog*`, `TaxonomyNotices*`, `Taxonomy` | screen shell + dialogs (stays) |
| B | `NewTermFormProps`, `NewTermForm`, `NewTaxonomyFormProps`, `NewTaxonomyForm` | create forms |
| C | `MergeTermSectionProps`, `MergeIdleStep*`, `MergePlannedStep*`, `MergeConfirmedStep*`, `MergeTermSection`, `TermDetailPanelProps`, `TermDetailPanel` | term detail + merge flow |
| D | `namespaceList` | per-taxonomy groups with term rows |

- **Splits:**
  1. NEW `Taxonomy-forms.tsx` — Moves unit B. Exports `NewTermForm`, `NewTermFormProps`, `NewTaxonomyForm`, `NewTaxonomyFormProps`.
  2. NEW `Taxonomy-term-detail.tsx` — Moves unit C. Exports `TermDetailPanel`, `TermDetailPanelProps`, `MergeTermSectionProps`.
  3. NEW `Taxonomy-namespace-list.tsx` — Moves `namespaceList` (+ its "Extracted so both branches" doc); imports `NewTermForm` from step 1. Exports `namespaceList`. Inside it, above `namespaceList`:
     - SUB-COMPONENT `TaxonomyGroupHeader({ group, deleteState, t, menuPortalContainer, taxonomyMenuHandle }): ReactNode` ← `<div className="taxonomy-namespace-group-header">` (title, copy-embed button, `TaxonomyRowMenu`).
     - HELPER `taxonomyTermItems({ group, byId, takeTermHandle, selectedTermId, setSelectedTermId, deleteState, t, … }: TaxonomyTermItemsInput): ReactNode` — a plain function **called synchronously** (not a JSX component) ← the `group.terms.map(...)` inside `<ul className="settings-row-list taxonomy-term-list">`. In `namespaceList`, replace the two lines `const termHandle = termHandles[termHandleIndex]; termHandleIndex += 1;` by a local `takeTermHandle()` closure that does exactly those two statements and returns `termHandle`; the helper calls it at the same point.
- **Importers to update:** none outside the file (only props types were exported, no external users).
- **After:** `Taxonomy.tsx` ~265; `namespaceList` ~45; map callback ~45; new files ~135 / ~190 / ~175.
- **Risks / notes:** `termHandleIndex` is a render-time counter across groups — it MUST stay evaluated in render order; that is why `taxonomyTermItems` is a plain function, not a component. `deleteState` type: import from the hook file. MOVE-AFTER: the screen moves to a taxonomy module later; this split keeps the same file set movable together.
