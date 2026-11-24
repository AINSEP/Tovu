import { useIntegrationsRedirect } from "@jini-ai/admin/screens/integrations/hooks/use-integrations-redirect.hooks";
import { ADDONS_PANEL_PATHS } from "./addons-routes";

/**
 * Host binding of Jini's redirect hook: a retired path with no resolved destination keeps this host's
 * historic Webhooks default (`ADDONS_PANEL_PATHS.integrations`), which the shared hook cannot know.
 *
 * @param required.routePath Destination supplied by the migration adapter, or `undefined` for the default.
 * @returns Nothing; replaces browser history after render.
 * @complexity O(1) — one delegated navigation.
 */
export function useAddonsRedirect({ routePath }: { routePath?: string | undefined }, _options = {}): void {
  useIntegrationsRedirect({ routePath, defaultRoutePath: ADDONS_PANEL_PATHS.integrations });
}
