# features/auth

The login screen — rendered by `App.tsx` before the admin shell mounts, not a nav panel.

| file | what it is |
|---|---|
| `Login.tsx` | Username/password form, calls `api.login`. |
| `index.ts` | The only surface `App.tsx` may import. |

## What this feature does not own

- Session/token storage or the authenticated shell itself — both live in `App.tsx` and `lib/api`.
  This feature is the form only.

## Notes for anyone editing here

`Login.tsx` has **no unit test**. Treat a change here as unverified until you have driven it in a
browser.

## Wiring

**Locale (P12 #6.T).** `Login` take a REQUIRED `useAdminLocaleHook` (`UseAdminLocaleHook` from
`@jini-ai/admin/react/kit`); there is no default and no direct import of the live hook. `App.tsx`'s `AdminShell` passes it to the early Login mount; the
function is the host's one `useHostAdminLocale` (`hooks/admin-locale-dependencies.hooks.ts`), the
same one `adminKit.hooks.useAdminLocale` holds. Tests pass a fake hook or `useHostAdminLocale`.
