### tovu:apps/admin/src/features/taxonomy/TaxonomyRowMenu.hooks.ts
- **Over:** `useTaxonomyRowMenu` 102 (file 105)
- **Phase:** after-move (DELETE-AFTER-PARITY, legacy twin) · **Batch:** size-52
- **Tests:** `apps/admin/src/features/taxonomy/__tests__/TaxonomyRowMenu.hooks.unit.test.tsx`
- **Responsibility map:** open/active state + refs (stays) · popup positioning (`useLayoutEffect`) · outside-click/focus close effect · keyboard handlers (stay).
- **Splits:**
  1. SUB-HOOK `useRowMenuPosition({ open, triggerRef, menuRef, setPosition }: UseRowMenuPositionInput): void` (same file, above `useTaxonomyRowMenu`) ← the `useLayoutEffect(() => {` that uses `open,triggerRef,menuRef,setPosition` (~L34–58), verbatim.
- **Importers to update:** none.
- **After:** `useTaxonomyRowMenu` ~78; file ~110.
- **Risks / notes:** call the sub-hook at the exact spot of the old `useLayoutEffect` (before the two `useEffect`s) so effect order is unchanged. DELETE-AFTER-PARITY.
