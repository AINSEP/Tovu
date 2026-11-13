### jini:packages/user-management/src/react/users/Users.tsx
- **Over:** file 748 · `Users` 127
- **Phase:** now · **Batch:** size-18
- **Tests:** `packages/user-management/src/react/users/__tests__/Users.coverage.test.tsx`, `packages/user-management/src/react/users/__tests__/Users.complexity-pins.test.tsx`, `packages/user-management/src/react/users/__tests__/UserRowParts.unit.test.tsx`, `packages/user-management/src/react/users/__tests__/change-username.hooks.test.tsx`, `packages/user-management/src/react/__tests__/screens.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `GrantOption`, `GrantSelectController`, `UserManageController`, `GrantSelectProps`, `GrantSelect`, `UserManagePanelProps`, `UserManagePanel`, `UserRowActionsController`, `UserRowProps`, `UserRow`, `UsersTableProps`, `UsersTable`, `userManageController` | users table + expanded Manage panel |
| B | `UserDisableDialogProps`, `UserDisableDialog`, `UserDeleteDialogProps`, `UserDeleteDialog`, `RevealablePasswordFieldProps`, `RevealablePasswordField`, `UserResetPasswordDialogProps`, `resolveResetPasswordFieldsHook`, `UserResetPasswordDialog` | confirm/reset dialogs |
| C | `UsersHookDependencies`, `UsersHook`, `UsersBaseProps`, `UsersProps`, `NewUserForm`, `UsersPageHeader`, `UsersNotices`, `Users` | page shell (stays) |

- **Splits:**
  1. NEW `Users-table.tsx` — job: users table and Manage panel. Moves unit A with every doc comment. Exports `GrantOption`, `GrantSelectController`, `UserManageController`, `UserManagePanelProps`, `UserManagePanel`, `UserRowActionsController`, `UserRowProps`, `UsersTableProps`, `UsersTable`, `userManageController` (the last two newly exported for `Users`). `UserRowProps`/`UsersTableProps` reference `UsersProps` → import type `UsersProps` from `./Users.js` is a CYCLE: instead type the needed field as `Pick<UsersBaseProps, …>`-free — move the referenced member type (check what `UsersProps[...]` they index) as a local alias, or move `UsersHookDependencies`/`UsersHook`/`UsersBaseProps`/`UsersProps` into NEW `Users-types.ts` imported by both (rule 5).
  2. NEW `Users-dialogs.tsx` — job: confirm/reset dialogs. Moves unit B with comments (incl. the "Resolves `useFields`… because ESLint" comment). Exports `UserDisableDialog`, `UserDeleteDialog`, `UserResetPasswordDialog`.
  3. SUB-COMPONENT in `Users.tsx`: `UsersDialogs` ← the three dialog JSX elements at the end of `Users`' return (from the Disable dialog through `<UserResetPasswordDialog … />`), plain props = the names they read; drop those names from the 49-line controller destructure.
- **Importers to update:** `packages/user-management/src/react/index.ts` (line `export { Users, UserManagePanel } from './users/Users.js'` → `UserManagePanel` from `./users/Users-table.js`; the `export type { … GrantOption, GrantSelectController, UserManageController, UserManagePanelProps, UserRow… }` line → split so table types come from `./users/Users-table.js`, page types from wherever they end up); `packages/user-management/src/react/users/UserRowParts.tsx` (`UserRowActionsController` → `./Users-table.js`); `UserRowParts.unit.test.tsx` if it imports the type from `../Users.js`.
- **After:** Users.tsx ~330; `Users` ~95; Users-table.tsx ~265; Users-dialogs.tsx ~185 (+ Users-types.ts ~20 if needed).
- **Risks / notes:** docs (`docs/spec/api.spec.md`, `ui.spec.md`) mention these names — no path change needed there unless they cite `Users.tsx` as the source location (leave docs alone). Public API via `./react` unchanged.
