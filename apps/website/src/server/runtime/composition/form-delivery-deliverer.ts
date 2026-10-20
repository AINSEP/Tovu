import type { CustomCredentialResolveDeps } from "#src/features/custom-credentials/index";
import { createCustomCredentialConnectionPort, createFormDestinationDeliverer, type FormDeliveryConnectionPort, type FormDestinationKit,
  type FormDestinationRegistry } from "#src/features/form-destinations/index";
import { createOAuthFormDeliveryConnectionPort } from "#src/features/api-connections/form-delivery-connection";
import type { ApiConnectionHost } from "#src/features/api-connections/host";

/**
 * @file The site's push-delivery attempt (the `deliver` port `composeFormDelivery` takes): the
 * form-destination deliverer over this site's two connection kinds, plugin API connections (OAuth)
 * and saved custom credentials, with each adapter's own plugin settings handed in read-only.
 *
 * Exists so a binding whose `connectionRef` is a plugin's OAuth connection resolves through the
 * API-connection host (fresh token per attempt, frozen account, declared API origins), while a
 * binding naming a saved custom credential keeps resolving exactly as before. Nothing here names a
 * provider; both composition roots' callers pass their own host and stores.
 */

/**
 * Builds the deliverer.
 * @param required.apiConnections - The site's API-connection host (`composeAgentPluginConnections`).
 * @param required.loadRegistry - The loaded form destinations of a workspace (which plugin owns an adapter).
 * @param required.credentials - The saved custom credentials and their sealer (the static connection kind).
 * @param required.kit - The host kit each attempt's credential-scoped kit wraps.
 * @complexity Per attempt: two registry loads (adapter, then its plugin for the OAuth port), one
 *   OAuth ownership check and at most one custom-credential lookup, then the adapter's own cost.
 */
export function composeFormDeliveryDeliverer(
  required: {
    readonly apiConnections: { readonly host: ApiConnectionHost };
    readonly loadRegistry: (required: { workspaceId: string }) => Promise<FormDestinationRegistry>;
    readonly credentials: CustomCredentialResolveDeps;
    readonly kit: FormDestinationKit;
  },
  _optional: Record<string, never> = {},
): ReturnType<typeof createFormDestinationDeliverer> {
  const { host } = required.apiConnections;
  const { loadRegistry, kit } = required;
  const oauth = createOAuthFormDeliveryConnectionPort({
    hostFor: ({ workspaceId }) => (workspaceId === host.workspaceId ? host : null),
    adapterPluginId: async ({ workspaceId, adapterId }) => (await loadRegistry({ workspaceId })).get(adapterId)?.pluginId ?? null,
  });
  const custom = createCustomCredentialConnectionPort({ credentials: required.credentials });
  // OAuth first: it answers null for every ref the adapter's plugin does not declare, so a saved
  // custom credential's id still reaches its own port (which re-checks `worksFor`).
  const connections: FormDeliveryConnectionPort = async (input, optional) => (await oauth(input, optional)) ?? custom(input, optional);
  return createFormDestinationDeliverer({ loadRegistry, connections, kit }, { pluginState: (scope) => host.pluginState.readerFor(scope) });
}
