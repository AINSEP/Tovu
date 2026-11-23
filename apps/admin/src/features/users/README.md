# features/users

The admin-user list and invite/role-assignment screen behind the sidebar's **People → Users** entry.

The screen itself (markup, controller state, account rules, reset-password fields) lives in
`@jini-ai/user-management/react`. The user wire type `AdminIdentityUser` is owned by
`@jini-ai/core/contracts/site/user-management-react`. This folder keeps only the host composition.

| file | what it is |
|---|---|
| `UsersPanel.tsx` | Mounts Jini `Users`, binding the host port, workspace scope and `ServerLabel`. |
| `UsersPanel.hooks.ts` | Adapts the host controller hook to Jini's `useUsersHook` seam. |
| `hooks/users-controller.hooks.ts` | Binds host locale, `users-i18n` and route navigation onto Jini `useUsers`. |
| `hooks/users-dependencies.hooks.ts` | The live `UsersPort`, over the host users/roles/auth HTTP clients. |
| `api/users-api.ts` | The users HTTP client; shared with Library, Media, site transfer and Trash. |
| `users-i18n.ts` | The users screen dictionary, composed over the host `COMMON_I18N`. |
| `index.ts` | The only surface `panels.tsx` may import. |

## Why these stay in the host

Each file above binds a host collaborator: the admin HTTP client and `WORKSPACE_ID`, the
`useAdminLocale` hook, the host `COMMON_I18N` dictionary, `ServerLabel`, or the roles/auth clients.
`users-i18n.ts` is also over Jini's 500-line file limit. See
`ADS-memory/reports/jini-port/extraction-plan.md` in the engine repo for the extraction rules.

## What this feature does not own

- **Roles themselves** (`features/roles`) — this screen assigns a role to a user but does not
  define what a role can do.
