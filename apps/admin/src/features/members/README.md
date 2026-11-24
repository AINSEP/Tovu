# features/members

The site-membership list behind the sidebar's **People → Members** entry — visitor/customer
accounts on the published site, distinct from admin `Users`.

| file | what it is |
|---|---|
| `members-screen-props.tsx` | Host collaborators (wired hook, port, `ServerLabel`, copy) passed to Jini's `Members`. |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- **Admin users** (`features/users`) — members have no admin access; this is not a smaller version
  of that screen, it is a different identity space.

## Notes for anyone editing here

The screen is Jini's `Members` (`@jini-ai/user-management/react`); it has a host-wired unit test (`__tests__/Members.unit.test.tsx`).
