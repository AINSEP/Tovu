import { deriveApiConnectionKey } from "@jini-ai/integrations/api-connections";

import type { FormDestinationCredential } from "../form-destinations/types.js";
import type { ApiConnectionHost } from "./host.js";

/**
 * @file The OAuth implementation of the form-delivery `FormDeliveryConnectionPort`: a push
 * destination's binding stores only a `connectionRef`; each delivery attempt resolves a fresh access
 * token here, immediately before its HTTP call. Jobs never hold tokens.
 *
 * UNWIRED until the forms fan-out lands (the form-delivery wiring lot): it is built against the
 * forms-multidest delivery contract and tested in isolation. The ref must belong to the plugin that contributes
 * the binding's adapter, so one plugin's destination can never spend another plugin's connection.
 */

/** Contract shape from the forms-multidest brief; replaced by its exported type at G14. */
export type FormDeliveryConnectionPort = (
  required: { readonly workspaceId: string; readonly connectionRef: string; readonly adapterId: string },
  optional?: Record<string, never>,
) => Promise<FormDestinationCredential | null>;

/**
 * @param required.hostFor - The workspace's API-connection host, or null when it has none.
 * @param required.adapterPluginId - Which plugin contributes a form-destination adapter id; null when none.
 * @returns null for a ref this port does not own (so a composite port can try static credentials);
 *   otherwise the access token as the credential. API-connection refusals (reconnect required,
 *   account changed, …) propagate with their safe message for the delivery's error mapping.
 * @complexity One contribution load plus one token read.
 */
export function createOAuthFormDeliveryConnectionPort(
  required: {
    readonly hostFor: (input: { readonly workspaceId: string }) => ApiConnectionHost | null;
    readonly adapterPluginId: (input: { readonly workspaceId: string; readonly adapterId: string }) => Promise<string | null>;
  },
  _optional: Record<string, never> = {},
): FormDeliveryConnectionPort {
  return async ({ workspaceId, connectionRef, adapterId }) => {
    const host = required.hostFor({ workspaceId });
    const pluginId = host ? await required.adapterPluginId({ workspaceId, adapterId }) : null;
    if (!host || !pluginId) return null;
    const declared = await host.listConnections({ pluginId });
    if (!declared.some((connection) => deriveApiConnectionKey({ workspaceId, pluginId, connectionId: connection.descriptor.connectionId }) === connectionRef)) return null;
    const token = await host.accessTokensFor({ pluginId }).getAccessToken({ connectionRef });
    // OAuth destinations take their API origin from the plugin, not the credential.
    return { token, baseUrl: "" };
  };
}
