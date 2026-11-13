### jini:packages/user-management/src/react/users/hooks/use-users.hooks.ts
- **Over:** `useUsers` 296 (file 416)
- **Phase:** now · **Batch:** size-18
- **Tests:** `packages/user-management/src/react/users/__tests__/use-users.hooks.pins.test.tsx`, `packages/user-management/src/react/users/__tests__/use-users.ported.test.tsx`, `packages/user-management/src/react/users/__tests__/Users.coverage.test.tsx`, `packages/user-management/src/react/users/__tests__/change-username.hooks.test.tsx`, `packages/user-management/src/react/users/__tests__/Users.complexity-pins.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `formOpen`, `username`, `email`, `password`, `createUser`, `createUserMutation`, `onCreate` | new-user form |
| B | `expandedId`, `toggleGenerationRef`, `pendingRoleId`, `pendingPolicyId`, `grantSaving`, `grantError`, `assignRoleMutation`, `attachPolicyMutation`, `editEmail`, `updateEmailMutation`, `toggleExpanded`, `onAssignRole`, `onAttachPolicy`, `onSaveEmail`, `emailSaving` (+ module `runGrantMutation`) | Manage panel grants + email |
| C | `ownPrincipalId`, `effectivePermissions`, `canManageUserTrash` + caller `useEffect` (~L400) | caller access |
| D | `resetPasswordFor`, `newPassword`, `resetPassword`, `resetPasswordMutation`, `openResetPassword`, `confirmResetPassword` | reset-password dialog |
| E | `deleteUserMutation`, `confirmingDelete`, `requestDelete`, `confirmDelete` | delete flow |
| F | list, toggle status/disable, rename, deep-link effects, return | screen core (stays) |

- **Splits:**
  1. NEW `use-users-grant-panel.hooks.ts` (same folder) — job: Manage-panel grants. Moves `runGrantMutation` (with its comment) and adds `useUserGrantPanel({ port, queryScope, list, email, describeError, translate }: UseUserGrantPanelInput): UserGrantPanel` ← unit B in order (keep the `toggleGenerationRef` and `onSaveEmail` comments). Returns the B names the controller exposes plus nothing else. Imports nothing from the original.
  2. SUB-HOOKS in `use-users.hooks.ts` (above `useUsers`): `useNewUserForm({ port, queryScope, list, describeError, translate }): {...A names}` ← A; `useCallerAccess({ portRef }): { ownPrincipalId, effectivePermissions, canManageUserTrash }` ← C (both comments); `useResetPasswordDialog({ port, password, username, ownPrincipalId, passwordResetNotice, rowCapabilities, toggleSavingId, setNotice, describeError, translate }): {...D names}` ← D; `useDeleteUser({ port, queryScope, list, rowCapabilities, setToggleError, describeError, translate }): {...E names}` ← E ("Delete-user plan v2…" comment).
  3. RETURN: each sub-hook returns exactly `Pick<UsersController, …>` keys (plus internals needed by the core, e.g. `email`, `password`, `username`, `resetPasswordFor` for the deep-link effect); the return builds `{ ...form, ...grants, ...reset, ...del, <remaining keys> }` — only spread objects that contain controller keys only; pass internals separately (`const { view: formView, email, … } = useNewUserForm(...)`).
- **Importers to update:** none (`runGrantMutation` is not exported).
- **After:** `useUsers` ~98; use-users.hooks.ts ~400; new file ~95.
- **Risks / notes:** HOOK ORDER: keep call order A → B → (toggle state) → D → C → caller effect → deep-link effects → E, matching original effect order. `rowCapabilities` is a hoisted inner function declared after C — define it before calling D/E. Deep-link effect (~L455) reads `resetPasswordFor`/setter — wire from D's result. Consider Opus execution (296-line hook with many cross-links).
