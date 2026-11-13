### jini:packages/ui/src/react/components/TooltipLayer.tsx
- **Over:** `useTooltipLayer` 208 (file 315)
- **Phase:** now · **Batch:** size-40
- **Tests:** `packages/ui/src/react/__tests__/components/TooltipLayer.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `suppressedTitleRef`, `restoreNativeTitle`, `suppressNativeTitle` | hide/restore the native `title` while our tip shows |
| B | `updatePosition`, `scheduleUpdatePosition`, `useLayoutEffect(() => {` (~L222) | measure + place the open tip |
| C | the document-listener `useEffect(() => {` (~L250, 87 lines) | decide show/hide from pointer, touch, focus, scroll |
| D | refs, `state`, `hideTooltip`, `hideTooltipForActivation`, `showTooltip`, cleanup + auto-hide effects, return | layer core (stays) |

- **Splits** (same file, above `useTooltipLayer`, in order):
  1. SUB-HOOK `useNativeTitleSuppression(): { restoreNativeTitle, suppressNativeTitle }` ← unit A.
  2. SUB-HOOK `useTooltipPositioning({ tooltipRef, rafRef, openTargetRef, state, setState }: UseTooltipPositioningInput): { scheduleUpdatePosition }` ← unit B (both callbacks + the layout effect).
  3. SUB-HOOK `useTooltipTriggers({ lastInputRef, touchTapRef, openTargetRef, showTooltip, hideTooltip, hideTooltipForActivation, suppressNativeTitle, scheduleUpdatePosition }: UseTooltipTriggersInput): void` ← unit C verbatim (keep the "Touch has no hover…" comment on `touchTapRef` in the main hook where the ref stays).
- **Importers to update:** none.
- **After:** `useTooltipLayer` ~62; `useTooltipTriggers` ~90; file ~335.
- **Risks / notes:** effect order: positioning layout effect (B) must stay declared before the cleanup effect (~L228), the auto-hide effect (~L235) and the listener effect — call `useTooltipPositioning` where `updatePosition` was. `useNativeTitleSuppression` is called where `restoreNativeTitle` was (before `hideTooltip`).
