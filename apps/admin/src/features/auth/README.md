# features/auth

The login screen — rendered by `App.tsx` before the admin shell mounts, not a nav panel. The screen
itself (`Login`, `useLogin`, `OwnerRecoverySignIn`, the login dictionary) lives in
`@jini-ai/admin/screens/auth/*`; this folder holds only this host's bindings of it.

| file | what it is |
|---|---|
| `index.tsx` | `Login` — the Jini screen with Tovu's collaborators bound. The only surface `App.tsx` may import. |
| `auth-host-binding.tsx` | `LOGIN_API_ERRORS`, the `id-only` `LoginErrorNotice`, the passkey button and the owner-recovery sign-in bound to Tovu's clients. |
| `hooks/use-wired-login.hooks.ts` | `useWiredLogin` — `useLogin` with the live port, error class and base controller hook. |
| `hooks/login-dependencies.hooks.ts` | `defaultLoginPort`, bound to `api/auth-api.ts`. |
| `api/auth-api.ts` | The `/auth/*` admin HTTP calls (module singleton on `lib/admin-http/request`). |

## Wiring

Tovu injects into the Jini screen: `useWiredLogin`, `useWiredAdminLocale`, the product name
(`"Tovu"`, host copy), `SecretInput`, `LoginErrorNotice` (`disclosure="id-only"`), the owner passkey
client (`ownerPasskeySignInPort`), the owner recovery client (`ownerRecoveryPort.recover`) and its
`ownerRecoveryFailure` describer, `authApi.me`, `ApiError` (as `LOGIN_API_ERRORS`), and
`@jini-ai/user-management/react`'s `useLogin` / `useRecoveryCodeSignIn` / `PasskeySignIn`.
Styles for the screen's `jini-login-*` classes live in `styles.css` beside the old `login-*` rules.

## What this feature does not own

- Session/token storage or the authenticated shell itself — both live in `App.tsx` and `lib/api`.
  This feature is the form only.
