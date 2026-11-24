# features/authentication

Tovu's binding of the Jini Authentication page (`@jini-ai/admin/screens/authentication`): an honest,
disabled preview of the credentials each sign-in provider will need. The screen, its copy in every
admin locale and its tests live in Jini; this folder keeps only what is Tovu's.

| file | what it is |
|---|---|
| `index.tsx` | `Authentication` — the Jini screen with Tovu's collaborators bound in. The panel registry imports this. |
| `authentication-host-binding.tsx` | `AuthenticationSettingsShell`: `@jini-ai/ui`'s settings shell inside its own `I18nProvider`, plus its stylesheets. |
| `model/provider-schemas.ts` | `AUTHENTICATION_PROVIDER_SCHEMAS`, the provider catalog (Tovu policy). |
| `authentication.css` | `jini-` copies of the `source-config-*` / settings-section rules the screen's markup needs. |

## Wiring

Tovu injects into the Jini screen: `useAdminThemeBoundary` (theme attributes on the shell wrapper),
`useAdminLocale`, the product name (`"Tovu"`, host copy — it fills the dictionary's `{product}`
slot), `AUTHENTICATION_PROVIDER_SCHEMAS` as `providers`, `SecretInput`, and
`AuthenticationSettingsShell` as `SettingsShell`. The page's `jini-page*` / `jini-settings-ui-*`
classes are styled by the `jini-` selectors added beside the legacy ones in `styles.css`.
