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
- `menus-host-ports.ts` binds `defaultMenusPort = createMenusPort({ api: menusApi, trash: trashApi, listPages })` from `@jini-ai/admin/screens/menus/hooks/menus-dependencies.hooks`; `listPages` is this host's page catalogue (pages client + `pagePublicPath`). Tests use that module's `createFakeMenusPort`.
- `menus-host-ports.ts` also exports `menusHostKit` for `useMenus` and `useMenuEditor`: `isApiError` over this host's `ApiError`, `isVersionConflict` + `versionConflictMessage` (`lib/version-conflict`), `toSlug` (the website's `platform/html/slug`), `slugRedirectPath` (`@jini-ai/admin/shell/lib/slug-redirect-path`) and `failures` (`lib/admin-failure-channel`'s generation, clipboard-refusal test and `publishLocalAdminFailure`).
- `hooks/use-menu-editor.hooks.ts` holds only `useWiredMenuEditor` — `@jini-ai/admin/screens/menus/hooks/use-menu-editor.hooks`' `useMenuEditor({ menuId, dependencies: { port: defaultMenusPort, navigate, t, kit: menusHostKit } })` with the real `lib/router` `navigate` and a `MENUS_DICT`-bound `t`. `MenuEditor.tsx` defaults its `useMenuEditorHook` prop to it; tests compose `useMenuEditor` with `createFakeMenusPort` and `menusHostKit`.
- `hooks/use-menus.hooks.ts` holds only `useWiredMenus` — `useMenus({ port: defaultMenusPort, t, kit: menusHostKit })` with a `MENUS_DICT`-bound `t`.
- `menus-panel.tsx` renders `@jini-ai/admin/screens/menus/Menus` with `useMenusHook` (default `useWiredMenus`), `publishAction={<PublishSectionButton section="menus" />}` and the `/admin/menus` routes; `index.ts` exports it as `Menus`. Its `jini-notice` classes are twinned next to `.notice` in `styles.css`; the `jini-page*`/`jini-card`/`jini-empty-state`/`jini-btn-primary` classes are styled by `integrations/jini-admin/jini-media.css`.
