# features/roles

The roles/policies screen behind the sidebar's **People → Roles** entry.

| file | what it is |
|---|---|
| `Roles.tsx` | List of roles, create/edit a role's policy, delete. |
| `index.ts` | The only surface `panels.tsx` may import. |

The wire types live in `@jini-ai/core/contracts/site/user-management-react`; the tab system
(`ROLES_TAB_IDS`, `resolveRolesTabId`, `resolveRolesTabs`) lives in `@jini-ai/admin/roles/Roles.hooks`;
the row-menu builders, `KEYS` and the error-copy table in `@jini-ai/admin/roles/rules`; the
dictionary in `@jini-ai/admin/roles/roles-i18n` and its sentence-part builders in
`@jini-ai/admin/roles/i18n/roles-sentence-parts`.

## Wiring

`roles-host-binding.ts` holds what this host injects into the Jini roles feature: `goToRolesTab`,
the `/roles?tab=` navigation (with `replace: true`) bound to the tab strip's `onChange`; and
`ROLES_API_ERRORS`, this host's `ApiError` class and default describer from
`lib/admin-http/request` as Jini's `RolesApiErrorPort`, with `describeApiError` the Jini error copy
bound to it (the hooks call that bound form).

## What this feature does not own

- **Assigning a role to a user** (`features/users`) — this screen defines what a role can do, not
  who holds it.

## Notes for anyone editing here

`Roles.tsx` has **no unit test**. Treat a change here as unverified until you have driven it in a
browser.
