# features/users

The admin-user list and invite/role-assignment screen behind the sidebar's **People → Users** entry.

| file | what it is |
|---|---|
| `Users.tsx` | List of identity users, invite, role assignment, disable/delete. |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- **Roles themselves** (`features/roles`) — this screen assigns a role to a user but does not
  define what a role can do.

## Notes for anyone editing here

`Users.tsx` has a unit test (`__tests__/Users.unit.test.tsx`).
