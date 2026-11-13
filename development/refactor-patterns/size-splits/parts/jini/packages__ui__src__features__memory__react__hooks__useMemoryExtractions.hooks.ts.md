### jini:packages/ui/src/features/memory/react/hooks/useMemoryExtractions.hooks.ts
- **Over:** `useMemoryExtractions` 114 (file 137, fine)
- **Phase:** now · **Batch:** size-35
- **Tests:** `src/features/memory/__tests__/react/hooks/useMemoryExtractions.test.tsx`, `src/features/memory/__tests__/react/hooks/useMemoryExtractions.store.test.ts`, `src/features/memory/__tests__/index.test.ts`
- **Responsibility map** (inside `useMemoryExtractions`):

| unit | statements | job |
|---|---|---|
| A | `extractions`, `loadError`, `storeRef`, `store` | history store + render mirror — stays |
| B | `isRefreshing`, `reloadGuard` (+ "Orders reloadExtractions()…" comment), `inFlightReloads` (+comment), `reloadExtractions` | ordered, counted reload of the history |
| C | `applyExtractionEvent`, `onDeleteExtraction`, `clearExtractions`, `showNoProviderBanner`, `nowClock` + its effect, `connectorExtractions` | mutations + derived view — stay |

- **Splits:**
  1. SUB-HOOK `useExtractionHistoryReload({ port, store, setLoadError }: UseExtractionHistoryReloadInput): { isRefreshing: boolean; reloadExtractions: MemoryExtractionsController['reloadExtractions'] }` in the same file above `useMemoryExtractions` ← unit B verbatim (all comments incl. the `endReload` "Released at every exit point…" block), same deps `[port, store]`. Input: `port: MemoryExtractionsPort; store: ExtractionHistoryStore; setLoadError: Dispatch<SetStateAction<string | null>>`.
  2. `useMemoryExtractions` keeps unit A, then `const { isRefreshing, reloadExtractions } = useExtractionHistoryReload({ port, store, setLoadError });`, then unit C and the `return` unchanged.
- **Importers to update:** none.
- **After:** file ~145; `useMemoryExtractions` ~75; `useExtractionHistoryReload` ~38.
- **Risks / notes:** `isRefreshing` useState moves after `storeRef` — no behavior effect. `LOAD_ERROR_MESSAGE` is module-level, reachable from the sub-hook. No `vi.mock` of this file.
