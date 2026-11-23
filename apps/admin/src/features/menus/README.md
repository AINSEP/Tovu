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

## Wiring

- `MenuEditor.tsx` mounts `@jini-ai/admin`'s `MenuPageLinkFields` and injects its required `useMenuPageLinkFields` hook (from `@jini-ai/admin/screens/menus/MenuPageLinkFields.hooks`); tests pass the same hook or a double.
- The component renders `jini-menu-page-link-{label,visually-hidden,unavailable}` classes; this host styles them as aliases of `.a11y-label-wrap` (`styles/editor.css`), `.visually-hidden` and `.muted-cell` (`styles.css`).
- `menus-host-ports.ts` binds `@jini-ai/admin/screens/menus/api/menus-api`'s `createMenusApi({ request, workspaceId })` once to `lib/admin-http/request` and `WORKSPACE_ID`; every menus caller (hooks, widget config fields, agent navigation, request-shape tests) imports that `menusApi` singleton.
