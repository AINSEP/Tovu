### jini:packages/ui/src/features/tab-launcher-menu/react/hooks/useTabLauncherMenu.ts
- **Over:** `useTabLauncherMenu` 108 (file 155)
- **Phase:** now · **Batch:** size-45
- **Tests:** `packages/ui/src/features/tab-launcher-menu/react/hooks/useTabLauncherMenu.test.ts`, `packages/ui/src/features/tab-launcher-menu/react/hooks/__tests__/useTabLauncherMenu.characterization.test.tsx`, `packages/ui/src/features/tab-launcher-menu/index.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `position` state + `useLayoutEffect(() => {` (~L80) | anchored, viewport-clamped position |
| B | `kinds`, `fileResults`, `tabResults`, `selectableCount`, selection-clamp `useEffect` (~L102) | filtered results + selection bound |
| C | rest (`query`, `kindFilter`, `selected`, select/run callbacks, `handleInputKeyDown`) | interaction (stays) |

- **Splits** (same file, above):
  1. SUB-HOOK `useLauncherPosition({ anchor }: UseLauncherPositionInput): TabLauncherPosition | null` ← `position` `useState` + the `useLayoutEffect`.
  2. SUB-HOOK `useLauncherResults({ files, tabs, query, kindFilter, setSelected }: UseLauncherResultsInput): { kinds, fileResults, tabResults, selectableCount }` ← unit B in order.
  Call order in the main hook: `containerRef`, `query`, `kindFilter`, `selected` state, `useLauncherPosition`, `useDismissOnOutsideOrEscape(...)`, `useLauncherResults`, then the `onTrack` effect and callbacks.
- **Importers to update:** none.
- **After:** `useTabLauncherMenu` ~88; file ~170.
- **Risks / notes:** `position` `useState` moves after `selected` — same relative order as before (it was last). Effect order preserved.
