### jini:packages/ui/src/features/tab-strip/react/hooks/useTabStripDragReorder.ts
- **Over:** `useTabStripDragReorder` 125 (file 162)
- **Phase:** now · **Batch:** size-45
- **Tests:** `packages/ui/src/features/tab-strip/__tests__/react/hooks/useTabStripDragReorder.test.ts`, `packages/ui/src/features/tab-strip/__tests__/react/components/TabStripItem.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `const stripDragProps = {` (~L174) | strip-level dragover/drop/leave handlers |
| B | `findDropTarget` | hit-test pointer x against tab rects |
| C | refs/state, `pulseIfNewTarget`, `clearDragState`, `getItemDragProps` | per-item drag gesture (stays) |

- **Splits** (same file, above the hook):
  1. HELPER `buildStripDragProps({ draggingTabIdRef, findDropTarget, setDragOverTarget, pulseIfNewTarget, reorderTiming, onReorder, haptics, clearDragState }: BuildStripDragPropsInput): StripDragProps` ← the object literal verbatim (it is rebuilt every render today; calling the helper every render keeps that). Name the return type `StripDragProps` = the existing type of `UseTabStripDragReorderResult['stripDragProps']` (use that indexed type, do not invent a new shape).
  2. SUB-HOOK `useFindDropTarget({ stripRef, tabs }: UseFindDropTargetInput): <existing callback type>` ← the `findDropTarget` `useCallback` with its deps.
- **Importers to update:** none.
- **After:** `useTabStripDragReorder` ~66; file ~180.
- **Risks / notes:** none — no ordering change (findDropTarget's useCallback slot stays at the same position).
