### tovu:apps/admin/src/components/WidgetConfigFields/MediaContentEditor.hooks.ts
- **Over:** `useMediaContentEditor` 110 (file 202, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-15
- **Tests:** `apps/admin/src/components/WidgetConfigFields/__tests__/MediaContentEditor.unit.test.tsx`, `apps/admin/src/components/WidgetConfigFields/__tests__/MediaContentEditor.markup.unit.test.tsx`, `apps/admin/src/components/__tests__/WidgetPreview.unit.test.tsx`
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `slugDraft`, `slugProblem` states + `function addSlug()` | add an item by slug |
| B | `htmlRef`, `gutterRef`, `pendingCaret`, the caret `useEffect`, `function insertHtml(snippet)` | raw-HTML textarea caret insert |
| C | library, stored/view state, `emit*`, `setItems`, `assetsBySlug`, picker state, `confirmPicker`, return | compose (stays) |

- **Splits** (same file, module level, above the hook):
  1. SUB-HOOK `useMediaSlugDraft({ state, library, setItems }: UseMediaSlugDraftInput): { slugDraft: string; setSlugDraftState; slugProblem; setSlugProblem; addSlug: () => void }` ← the two `useState` lines + `addSlug` (return the setters the return object uses today; check the `return {` for which ones).
  2. SUB-HOOK `useHtmlCaretInsert({ state, emit }: UseHtmlCaretInsertInput): { htmlRef; gutterRef; insertHtml: (snippet: string) => void }` ← `htmlRef`, `gutterRef`, `pendingCaret`, the `useEffect` reading `pendingCaret`/`htmlRef`, `insertHtml`.
- **Importers to update:** none.
- **After:** file ~215; `useMediaContentEditor` ~85.
- **Risks / notes:** `state`/`emit` are recomputed each render — pass current values (same closure semantics). Hook order changes only by grouping.
