### tovu:apps/desktop/src/renderer/use-find-in-page.hooks.ts
- **Over:** `useFindInPage` 171 (file 344, under)
- **Phase:** now (survey label `?`) · **Batch:** size-10
- **Tests:** `apps/desktop/src/renderer/use-find-in-page.hooks.test.ts`, `use-find-in-page.jsdom.test.ts`, `app/FindBar.render.test.ts`, `shell-bug-fixes.test.ts`, `preload/preload-staleness.test.ts` (renderer runner; preload one = desktop main runner). No mocks of the module.
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `useReducer`, `guests`, `queryScheduler`, `registerGuest`, `target`, `issueFind`, the four query/result effects, unmount effect, `close`, return | the find state machine (stays) |
| B | refs `inputElement`, `lastFindAt`, `reclaimTimer`, `restoringFocus`, `awaitingReport`, `composing`, `reclaimFrame`; callbacks `cancelReclaimFrame`, `reclaimUntilReported`, `clearReclaimTimer`, `attachBlurReclaim`, `detachBlurReclaim`, `inputRef` | keep focus in the find input while Chromium steals it (reclaim per frame + on blur, IME-aware) |
| C | `const previousGuestIdRef = useRef(activeGuestId);` + its `useEffect` | close the bar and clear the outgoing tab's highlights on a tab switch |

- **Splits** (same file, module level, directly above `useFindInPage`, in this order):
  1. SUB-HOOK `useFindFocusReclaim({ clock }: { clock: FindFocusClock }): FindFocusReclaim` ← unit B: the seven ref declarations (with their comments), `cancelReclaimFrame`, `reclaimUntilReported`, `clearReclaimTimer`, then `attachBlurReclaim` (its 10-line "Reclaims focus the moment Chromium takes it" comment moves word for word), `detachBlurReclaim`, `inputRef`. Returns `{ inputElement, lastFindAt, restoringFocus, awaitingReport, composing, cancelReclaimFrame, reclaimUntilReported, clearReclaimTimer, inputRef }` (`reclaimTimer`, `reclaimFrame`, `detachBlurReclaim`, `attachBlurReclaim` stay private). New non-exported `interface FindFocusReclaim` above it, field types = the existing `useRef`/`useCallback` result types (`MutableRefObject<HTMLInputElement | null>`, `MutableRefObject<boolean>`, `() => void`, `(node: HTMLInputElement | null) => void`). In `useFindInPage`: `const { inputElement, lastFindAt, restoringFocus, awaitingReport, composing, cancelReclaimFrame, reclaimUntilReported, clearReclaimTimer, inputRef } = useFindFocusReclaim({ clock });` placed right after `const guests = …` (where `inputElement` was declared).
  2. SUB-HOOK `useCloseOnGuestChange({ activeGuestId, open, guests, bridge, dispatch }: UseCloseOnGuestChangeInput): void` ← unit C verbatim (8-line "Closes (and clears the OUTGOING surface's own highlights)" comment + `biome-ignore` line move with it; `state.open` → `open`). Called at the same spot in `useFindInPage`. `dispatch: Dispatch<FindBarAction>`, `bridge: FindBridge | undefined` (same type as the destructured port).
- **Importers to update:** none (no export moves).
- **After:** `useFindInPage` ~85; `useFindFocusReclaim` ~80; `useCloseOnGuestChange` ~12; file ~360.
- **Risks / notes:** effect ORDER must stay: toggle → focus-on-open → subscribe → query → close-on-guest-change → unmount cleanup. `useFindFocusReclaim` holds no effects, so its hooks moving earlier only reorders refs/callbacks (stable every render). The existing `biome-ignore` comments are not eslint-disables; keep them verbatim, attached to the same dependency arrays. Keep `useCallback` dependency arrays byte-identical.
