### jini:packages/ui/src/react/components/OnboardingDropdown.tsx
- **Over:** `useOnboardingDropdown` 102 (file 411)
- **Phase:** now · **Batch:** size-40
- **Tests:** `packages/ui/src/react/__tests__/components/OnboardingDropdown.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | outside-pointer `useEffect(() => {` (~L282, uses `open`, `rootRef`, `setOpen`) | dismiss on outside press |
| B | open-event `useEffect` (~L311) + `toggleOpen` | one-open-dropdown-at-a-time broadcast |
| C | rest | dropdown state + derived values (stays) |

- **Splits** (same file, directly above `useOnboardingDropdown`):
  1. SUB-HOOK `useDismissOnOutsidePress({ open, rootRef, setOpen }: UseDismissOnOutsidePressInput): void` ← unit A effect + deps verbatim.
  2. SUB-HOOK `useExclusiveOpen({ dropdownIdRef, setOpen }: UseExclusiveOpenInput): () => void` ← unit B (effect then `toggleOpen`), returns `toggleOpen`.
  Call sites stay in the same place relative to the query-reset effect (A, then query-reset effect, then B).
- **Importers to update:** none (no export moves).
- **After:** `useOnboardingDropdown` ~68; file ~430.
- **Risks / notes:** the hook stays in the component file: it is the exported `useOnboardingDropdown` prop seam typed into `OnboardingDropdownBaseProps` (`typeof useOnboardingDropdown`), so moving it to a `.hooks.ts` would create a type cycle (rule 5). Component already takes props only.
