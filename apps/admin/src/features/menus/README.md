# features/menus

The Menus list and the Menu editor — the two screens behind the sidebar's **Content → Menus** entry.

| file | what it is |
|---|---|
| `Menus.tsx` | List view. `DataTable` from `@jini-ai/admin/react`, create/delete via `ConfirmDialog`. |
| `MenuEditor.tsx` | Per-menu item editor (add/remove/reorder menu items, targets). Owns the unsaved-changes guard (`useDirtyGuard`). |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- Anything about what a menu item links to beyond storing a target (post, page, or external URL) —
  it does not validate that the target still exists.

## Notes for anyone editing here

Both `Menus.tsx` and `MenuEditor.tsx` have unit tests (`__tests__/Menus.unit.test.tsx`,
`__tests__/MenuEditor.unit.test.tsx`).
