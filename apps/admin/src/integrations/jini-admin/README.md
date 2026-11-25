# Jini admin host composition

The host scope (`modules.hooks.ts` → `createHostAdminScope`) binds every `@jini-ai/admin` module Tovu mounts,
with its ports, session grants and live locale.

## Wiring

### Security (`security-ports.ts`, `security-module.hooks.ts`)

- **Ports:** `createSecurityHostPorts({ transport })` gives `securityApi` (`createHttpSecurityApi`, Shared Keys on),
  `otherCredentials` (`tokenHints: true`, media labels from the host catalog) and
  `rootKey` (`/system/site-key`, `{ siteKey }` import body, reveal on).
- **Host client:** `securityApi` keeps the host's 11 method names, composed from the Jini publish, custom and
  Shared Keys clients.
- **Grants (D6):** `securitySessionGrants({ permissions }, { grantsReady })`. `security.read` is always granted;
  `admin.security.tokens.manage` needs `admin.security.site-key.manage`; write grants pass through by name. While
  grants load (`grantsReady: false`, from `App.tsx` → `AdminModulesProvider`) only `security.read` is granted.
- **Module options:** `ChipField` = `OnboardingChipField`; `t` = `createSecurityTranslator` (relocated
  `security-i18n.ts` + alias table); `rootKeyTab` (generate hidden, `TOVU_SITE_KEY`, preview not required);
  `tabIcons` from `security-visuals.tsx`; `refreshSignal` / `onCredentialsChanged` on the `access-tokens`
  content-refresh resource; `describeCredentialError` = `describeSecurityError`.
- **Owner controls** (Provider `ownerControls`): `TotpSettings`, `RecoveryCodesCard` (host binds its three
  recovery hooks) and `PasskeySettings`, in that order. Tests inject `securityOwnerPorts`.
- **Routing:** `MODULE_PAGE_PATHS['security.secrets'] = '/access-tokens'`; `MODULE_TAB_ALIASES` maps the host
  `?tab=site-key` to the package's `root-key` tab and back.
