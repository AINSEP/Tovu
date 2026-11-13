### jini:packages/ui/src/features/source-config-list/react/hooks/useSourceConfigList.ts
- **Over:** `useSourceConfigList` 119 (file 171)
- **Phase:** now · **Batch:** size-45
- **Tests:** `packages/ui/src/features/source-config-list/react/hooks/useSourceConfigList.test.ts`; smoke `packages/ui/src/features/source-config-list/react/components/SourceConfigList.test.tsx`, `packages/ui/src/features/source-config-list/__tests__/SourceConfigListView.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `pendingKeys`, `testResults` state, `remove`, `refresh`, `setTrust`, `test`, `update`, `isPending` | per-source actions with pending tracking |
| B | `sources`/`loading`/`error`, `reload` + effect, `addSourceToList`, `capabilities`, return | list loading + controller (stays) |

- **Splits:**
  1. SUB-HOOK (same file, above) `useSourceItemActions<TSource>({ port, setSources }: UseSourceItemActionsInput<TSource>): { pendingKeys, testResults, isPending, remove, refresh, setTrust, test, update }` ← unit A statements in original order (the two `useState`s first). Main hook calls it right after its own three `useState`s; `capabilities` keeps using `setTrust` from the result.
- **Importers to update:** none.
- **After:** `useSourceConfigList` ~50; file ~185.
- **Risks / notes:** `useState` order changes (pendingKeys/testResults now after reload's state but before `reload`) — keep the call before `reload` so hook-slot order is identical. Generic `TSource` must flow into the input type.
