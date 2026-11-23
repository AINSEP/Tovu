# features/users

The admin-user list and invite/role-assignment screen behind the sidebar's **People → Users** entry.

The screen itself (markup, controller state, account rules, reset-password fields, the
locale-bound controller `useLocalizedUsers`, the `UsersPanel` composition and `passwordResetNotice`)
lives in `@jini-ai/user-management/react`.
The user wire type `AdminIdentityUser` is owned by `@jini-ai/core/contracts/site/user-management-react`.
The users screen dictionary (`t`) lives in `@jini-ai/admin/users/users-i18n` (not in
`@jini-ai/user-management`, which may not import its `translationEntry`/`mergeLocaleOverlays` helpers
from `@jini-ai/admin`). This folder keeps only the host binding.

| file | what it is |
|---|---|
| `index.tsx` | The only surface `panels.tsx` may import: mounts Jini `UsersPanel` with the wired hook, live port, `WORKSPACE_ID` and `ServerLabel`. |
| `users-host-binding.ts` | The live `UsersPort` over the host users/roles/auth HTTP clients. |
| `hooks/use-wired-users.hooks.ts` | `useUsers` (Jini `useLocalizedUsers` with `useAdminLocale`, `WORKSPACE_ID`, `t`) and `useWiredUsers` (live port + router). |
| `api/users-api.ts` | The users HTTP client; shared with Library, Media, site transfer and Trash, so it stays a module-level host client. |

## Wiring

The host injects into Jini: `useAdminLocale`, `WORKSPACE_ID` (as `queryScope`), the users translator
`t` (from `@jini-ai/admin/users/users-i18n`), the router `navigate`, the live `defaultUsersPort`, and `ServerLabel` (as `renderServerLabel`).
`index.tsx` defaults `useUsersHook` to `useWiredUsers`; tests pass a fake-port composition of `useUsers`.

## What this feature does not own

- **Roles themselves** (`features/roles`) — this screen assigns a role to a user but does not
  define what a role can do.
