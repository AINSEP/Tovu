### jini:packages/chat/src/react/hooks/fab-position.ts
- **Over:** `useFabPosition` 115
- **Phase:** now · **Batch:** size-12
- **Tests:** `src/react/hooks/__tests__/fab-position.cov-j2.test.ts`; smoke the ChatFab tests (`rg -l ChatFab src --glob '*test*'`). No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | shapes, `readPersisted`, `writePersisted`, `DEFAULT_POSITION` | persisted position |
| B (stays) | refs/state, resize effect, pointer handlers, `consumeDragFlag`, return | drag behaviour |
| C | body of `const style = useMemo(() => {` (~L346, 31 lines) | turn position + dock avoidance into CSS |

- **Splits:**
  1. HELPER `fabPositionStyle({ live, dragging, isDragging, persisted, viewport, edgeMargin, sizePx, dockOpen, avoidBottomPx, avoidRightPx }: FabPositionStyleInput): CSSProperties` (use the memo's current return type) — module level above `useFabPosition` ← the memo callback's statements verbatim, with `liveRef.current` → `live`, `draggingRef.current` → `dragging`, `window` → `viewport`, `FAB_EDGE_MARGIN`/`FAB_SIZE_PX` → `edgeMargin`/`sizePx`. `useFabPosition` keeps `useMemo(() => fabPositionStyle({ live: liveRef.current, dragging: draggingRef.current, … }), [same deps incl. renderTick])`.
- **Importers to update:** none.
- **After:** `useFabPosition` ~88; `fabPositionStyle` ~32; file ~195.
- **Risks / notes:** the refs must still be read INSIDE the memo callback (at memo time), not when the hook renders — pass `.current` in the call inside the callback. Keep `renderTick` in the dependency array even though the helper does not read it (it forces recompute).
