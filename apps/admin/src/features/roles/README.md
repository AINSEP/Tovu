# features/roles

The roles/policies screen behind the sidebar's **People → Roles** entry.

| file | what it is |
|---|---|
| `index.tsx` | The only surface `panels.tsx` may import: `Roles`, this host's binding of the Jini screen `@jini-ai/admin/roles/Roles`. |
| `hooks/use-wired-roles.hooks.ts` | `useWiredRoles`: Jini `useRoles` with the live port, `ROLES_API_ERRORS` and `useAdminLocale` bound in. |
| `hooks/roles-dependencies.hooks.ts`, `api/roles-api.ts` | The live `RolesPort` over this host's admin HTTP client. |

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
bound to it. `hooks/use-wired-roles.hooks.ts` injects `defaultRolesPort`, `ROLES_API_ERRORS` and
`useAdminLocale` into Jini's `useRoles`; `index.tsx` passes that hook, `goToRolesTab` and the
`/admin/users` route to Jini's `Roles`. The screen's `jini-roles-*` classes are styled by selectors
added beside the host's `.list-table`/`.table-scroll`/`.muted-cell`/`.integrations-form`/`.form-measure`
rules in `styles.css`.

## What this feature does not own

- **Assigning a role to a user** (`features/users`) — this screen defines what a role can do, not
  who holds it.

## Notes for anyone editing here

`__tests__/Roles.unit.test.tsx` and `use-roles.unit.test.tsx` drive the Jini screen and hook
through this host's real kit, HTTP client and bindings; Jini's own characterization suite is
`packages/admin/src/roles/__tests__/Roles.screen.unit.test.tsx`.
