# features/roles

The roles/policies screen behind the sidebar's **People → Roles** entry.

| file | what it is |
|---|---|
| `Roles.tsx` | List of roles, create/edit a role's policy, delete. |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- **Assigning a role to a user** (`features/users`) — this screen defines what a role can do, not
  who holds it.

## Notes for anyone editing here

`Roles.tsx` has **no unit test**. Treat a change here as unverified until you have driven it in a
browser.
