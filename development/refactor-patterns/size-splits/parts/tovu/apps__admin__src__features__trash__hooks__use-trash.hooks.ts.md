### tovu:apps/admin/src/features/trash/hooks/use-trash.hooks.ts
- **Over:** `useTrash` 143 (file 191)
- **Phase:** after-move (MOVE-AFTER trash module) · **Batch:** size-49
- **Tests:** `apps/admin/src/features/trash/__tests__/use-trash.unit.test.tsx`, `apps/admin/src/features/trash/__tests__/Trash.unit.test.tsx`, `apps/admin/src/features/trash/__tests__/trash-i18n.unit.test.ts`
- **Responsibility map** (statements of `useTrash`): refresh subscription + users lookup (stay) · A paging (first page + accumulated "Load more" pages) · B selection reconcile · C restore/purge actions.
- **Splits** (SUB-HOOKS, same file, above `useTrash`, called in this order where the first statement of each group stood):
  1. `useTrashPages({ port, locale, invalidate, setActionError }: UseTrashPagesInput): TrashPages` ← `const firstPage = useFetchQuery({` (with the `staleTime: 0` comment), `morePages`/`moreCursor`/`loadingMore` states, `loadingMoreRef` (+ "latest call wins" comment), `pageSettlement`, `resetMorePages`, the refetch `useEffect`, `const items = …`, `loadMore`, `reloadAfterAction`, `refresh`. Returns `{ firstPage, items, moreCursor, loadingMore, loadMore, reloadAfterAction, refresh }`.
  2. `useTrashSelection({ items }): { selected, setSelected }` ← `selected` state + `visibleIds` + its reconcile `useEffect` (comment moves).
  3. `useTrashActions({ port, locale, items, selected, setSelected, reloadAfterAction, setActionError }): TrashActions` ← `notice`, `busy`, `purgeConfirmOpen` states, `selectedItems`, `onRestoreSelected`, `onPurgeConfirmed`.
  `useTrash` keeps `port/locale`, `invalidate`, `invalidateList` + subscription, `usersQuery`, `actorUsernames`, `actionError` state, the three calls, and `return {`.
- **Importers to update:** none.
- **After:** `useTrash` ~50; sub-hooks ~65 / ~15 / ~48; file ~205.
- **Risks / notes:** `useState` declaration order shifts between groups (stable across renders; no behaviour change). `firstPage` must be declared before `usersQuery`? No dependency — but keep `useTrashPages` call where `firstPage` was (before `usersQuery`) to keep fetch order identical. MOVE-AFTER: whole hook moves with the trash module; split holds.
