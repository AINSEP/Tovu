### jini:packages/ui/src/react/hooks/useResizableSplitPane.ts
- **Over:** `useResizableSplitPane` 209 (file 279)
- **Phase:** now · **Batch:** size-40
- **Tests:** `packages/ui/src/react/hooks/__tests__/useResizableSplitPane.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `const storageKey = options.storageKey ?? …` … `minNormalContainerWidth` | resolve options with defaults |
| B | `resizeStateRef`, `pointerCleanupRef`, `pointerFrameRef`, `pendingPointerClientXRef`, `finishResize`, unmount `useEffect(() => () => finishResize(false)…` | end a drag gesture |
| C | `onHandlePointerDown` (66) | run a pointer drag |
| D | container-fit `useLayoutEffect(() => {` (~L197) | clamp to container width |
| E | `onHandleKeyDown` | keyboard resize |
| F | width state/refs, `renderPreferredWidth`, `applyWidth`, sync effects, `onHandleBlur`, return | core (stays) |

- **Splits** (same file, above the hook):
  1. HELPER `resolveSplitPaneOptions({ options }: ResolveSplitPaneOptionsInput): ResolvedSplitPaneOptions` ← unit A (returns the 8 names).
  2. SUB-HOOK `useFinishResize({ setIsResizing, renderPreferredWidth, preferredWidthRef, storageKey, minWidth, maxWidthOption }: UseFinishResizeInput): { finishResize, resizeStateRef, pointerCleanupRef, pointerFrameRef, pendingPointerClientXRef }` ← the four refs + `finishResize` (refs created here; unmount effect stays in the main hook at its old place).
  3. SUB-HOOK `useHandlePointerDown({ containerRef, pointerCleanupRef, setIsResizing, resizeStartPreferredWidthRef, preferredWidthRef, resizeStateRef, applyWidth, pointerFrameRef, pendingPointerClientXRef, widthRef, finishResize, renderPreferredWidth }: UseHandlePointerDownInput): (event: <existing param type>) => void` ← unit C.
  4. SUB-HOOK `useFitToContainer({ containerRef, minNormalContainerWidth, minSecondaryWidth, maxWidthOption, handleWidth, maxWidthRef, setSecondaryMinWidth, setMaxWidth, renderPreferredWidth, preferredWidthRef }: UseFitToContainerInput): void` ← unit D.
  5. SUB-HOOK `useHandleKeyDown({ containerRef, keyboardStep, widthRef, minWidth, maxWidthRef, applyWidth, storageKey, maxWidthOption }: UseHandleKeyDownInput): (event: <existing type>) => void` ← unit E.
- **Importers to update:** none (`readSavedWidth`/`saveWidth` stay).
- **After:** `useResizableSplitPane` ~85; `useHandlePointerDown` ~70; file ~320.
- **Risks / notes:** ref creation moves (B's refs are now created after `renderPreferredWidth`/`applyWidth`; they are only read at event time) — keep `useFinishResize` called exactly where `finishResize` was. Effect/layout-effect order must stay: width sync, maxWidth sync, fit layout effect, unmount flush.
