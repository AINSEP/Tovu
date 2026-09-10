/**
 * @file Public surface of the `integrations` feature.
 *
 * `panels.tsx` imports from HERE, never from a file inside this folder. That indirection is the
 * point of the feature boundary: everything below can be split, renamed, or grown a `hooks/`
 * directory without the router noticing. Adding a file to this feature is not an API change unless
 * it is exported from this line.
 *
 * `DeveloperApi` (the old `/admin/integrations` page shell) was retired 2026-09-10, second pass —
 * its two tabs (MCP Server, Webhooks) moved into `features/providers/Providers.tsx`, now labelled
 * "Integrations". That file imports `Integrations` (the webhooks list) and `integrations-i18n.tsx`'s
 * `t` directly from their own files rather than through this barrel — a cross-feature import outside
 * this indirection, same precedent `Providers.tsx` already set importing `../settings/
 * ComposioKeyField` and `../settings/ExternalMcpSettingsPanel` directly. See `panels.tsx`'s own
 * comment on the `integrations` panel for what its bare `/admin/integrations` URL does now that its
 * row has no nav entry.
 */
export { IntegrationDeliveries } from "./IntegrationDeliveries";
export { IntegrationsRedirect } from "./IntegrationsRedirect";
