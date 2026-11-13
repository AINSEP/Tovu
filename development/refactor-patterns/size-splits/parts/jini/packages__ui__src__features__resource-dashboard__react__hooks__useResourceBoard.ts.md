### jini:packages/ui/src/features/resource-dashboard/react/hooks/useResourceBoard.ts
- **Over:** `useResourceBoard` 176 (file 249)
- **Phase:** now · **Batch:** size-44
- **Tests:** `packages/ui/src/features/resource-dashboard/react/hooks/useResourceBoard.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `viewMode` state (~L109), `setViewMode` | persisted view mode |
| B | `selectMode`, `selected`, prune effect (~L134), leave-grid effect (~L139), `enterSelectMode`, `exitSelectMode`, `toggleSelected` | select mode |
| C | `openMenuId`, `menuContainerRef`, outside-click effect (~L150), `toggleMenu`, `closeMenu` | single-open kebab menu |
| D | `pendingKeys`, `actionError`, `isItemBusy`, `remove`, `duplicate` | per-item actions |
| E | items/loading/error/query/sort, `reload` + effect, `bulkDelete`, `visibleItems`, `kanbanColumns`, return | board data (stays) |

- **Splits** (same file, above `useResourceBoard`):
  1. SUB-HOOK `useBoardViewMode({ viewModeStorage, storageScopeKey, defaultViewMode }: UseBoardViewModeInput): { viewMode, setViewMode }` ← unit A.
  2. SUB-HOOK `useBoardSelection({ items, viewMode }: UseBoardSelectionInput): { selectMode, selected, enterSelectMode, exitSelectMode, toggleSelected }` ← unit B with both effect comments.
  3. SUB-HOOK `useBoardMenu(): { openMenuId, setOpenMenuId, menuContainerRef, toggleMenu, closeMenu }` ← unit C with the "Single-open-at-a-time kebab menu…" comment.
  4. SUB-HOOK `useBoardItemActions<TItem>({ port, setItems, setOpenMenuId }: UseBoardItemActionsInput<TItem>): { pendingKeys, setPendingKeys, actionError, setActionError, isItemBusy, remove, duplicate }` ← unit D (uses consts `ITEM_ACTION_KIND`, `REMOVE_FAILED_MESSAGE`, `DUPLICATE_FAILED_MESSAGE`).
  Call order in the main hook: data state + `reload` + its effect, then `useBoardViewMode`, `useBoardSelection`, `useBoardMenu`, `useBoardItemActions`, then `bulkDelete` etc. — keeps effect order load → prune → leave-grid → menu.
- **Importers to update:** none.
- **After:** `useResourceBoard` ~85; file ~270.
- **Risks / notes:** `viewMode` is now created after `reload` (state order only). `bulkDelete` keeps using `selected`, `setPendingKeys`, `exitSelectMode` from the sub-hook results. Check `setActionError` is also used by `bulkDelete`/return before trimming the returned set.
