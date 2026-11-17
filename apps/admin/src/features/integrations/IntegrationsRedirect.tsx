import { useIntegrationsRedirect } from "./hooks/use-integrations-redirect.hooks";

/**
 * @file Replacement navigation for Tovu's retired Add-ons URLs, including `/admin/integrations`.
 * Markup only (there is none):
 * this component's entire job is to redirect, via {@link useIntegrationsRedirect}. See
 * `panels.tsx`'s own comment on the `integrations` panel for why this exists instead of the panel
 * simply losing its `render` branch, and why the panel's id/route stay even though its nav row does
 * not.
 */
export function IntegrationsRedirect({ routePath, useIntegrationsRedirectHook = useIntegrationsRedirect }: { routePath?: string; useIntegrationsRedirectHook?: typeof useIntegrationsRedirect; } = {}) {
  useIntegrationsRedirectHook({ routePath });
  return null;
}
