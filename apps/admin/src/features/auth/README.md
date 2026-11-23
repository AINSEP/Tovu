# features/auth

The login screen — rendered by `App.tsx` before the admin shell mounts, not a nav panel.

| file | what it is |
|---|---|
| `Login.tsx` | Username/password form, calls `api.login`. |
| `index.ts` | The only surface `App.tsx` may import. |

The host-neutral pieces (`AdminUser`, `LoginPort`, the login dictionary and `createLoginTranslator`)
live in `@jini-ai/admin/screens/auth/*`; this folder keeps the form, its `request`-bound transport
and the owner recovery / passkey adapters until the admin HTTP client lands in Jini.

## What this feature does not own

- Session/token storage or the authenticated shell itself — both live in `App.tsx` and `lib/api`.
  This feature is the form only.

## Notes for anyone editing here

`Login.tsx` has **no unit test**. Treat a change here as unverified until you have driven it in a
browser.
