# features/members

The site-membership list behind the sidebar's **People → Members** entry — visitor/customer
accounts on the published site, distinct from admin `Users`.

The screen, its controller hook, row rules and dictionary live in `@jini-ai/user-management`
(`/react` and `/react/members/members-i18n`); the `AdminMember` DTO lives in
`@jini-ai/core/contracts/site/user-management-react`. This folder is the host wiring.

| file | what it is |
|---|---|
| `MembersPanel.tsx` | Jini's `Members` bound to this app's port, copy and server-label rendering. |
| `MembersPanel.hooks.ts` | Adapts this app's controller (`useWiredMembers`) to Jini's `useMembersHook` seam. |
| `hooks/members-controller.hooks.ts` | `useMembers`/`useWiredMembers` — binds workspace scope, admin locale, translator and content-refresh. |
| `hooks/members-dependencies.hooks.ts` | `defaultMembersPort` (this app's HTTP client as a `MembersPort`) and `MEMBERS_RESOURCE`. |
| `api/members-api.ts` | The admin HTTP calls. |
| `members-i18n.ts` | The package dictionary bound to `COMMON_I18N`, plus translations of this app's description copy. |
| `index.ts` | The only surface `panels.tsx` may import. |

## Wiring

What Tovu binds into `@jini-ai/user-management`'s `Members`:

- `port`: `defaultMembersPort` over `membersApi` (`/workspaces/<WORKSPACE_ID>/members…`).
- `useMembersHook`: `useWiredMembers` via `createMembersControllerHook` — workspace `queryScope`,
  `useAdminLocale`, the translator from `members-i18n.ts`, and a refresh port on the admin
  content-refresh bus filtered to `MEMBERS_RESOURCE`.
- `description` / `emptyDescription`: this app's "site visitors" copy; its translations are
  `MEMBERS_HOST_COPY` in `members-i18n.ts`, layered over the package's `MEMBERS_DICT` with
  `createMembersTranslator`.
- `renderServerLabel`: `components/status-labels`' `ServerLabel`.

## What this feature does not own

- **Admin users** (`features/users`) — members have no admin access; this is not a smaller version
  of that screen, it is a different identity space.

## Notes for anyone editing here

`MembersPanel.tsx` has a unit test (`__tests__/Members.unit.test.tsx`).
