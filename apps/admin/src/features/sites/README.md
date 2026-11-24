# Sites (admin)

The admin Sites screen: list, create, activate, trash and transfer sites.

## Wiring

- **Jini owns** the types only: `SitesPort` and the Sites wire shapes (`AdminSitesSnapshot`,
  `AdminSiteListEntry`, `AdminSiteBinding`, `AdminLocalSiteState`, `AdminTrashedSite`,
  `AdminLocalSiteAction`, `AdminCreatedSite`, `AdminCreatedSiteAgentPluginTokens`,
  `AdminTokenSignInPlugin`, `AdminSiteActivation`) in
  `@jini-ai/core/contracts/site/hooks-sites-port-hooks` (K4-seam-17).
- **The host injects** the `SitesPort` implementation (`api/sites-api.ts`, wired in
  `hooks/sites-dependencies.hooks.ts`) and keeps the rules (`rules.ts`), the machine-local
  `SitesUserConfig` shapes and the `ADMIN_SITE_KEY_STATES` runtime list (`api/sites-api.types.ts`).
