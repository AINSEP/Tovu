/** Host binding for Jini's External MCP sign-in hook (`@jini-ai/admin/screens/settings/hooks/use-external-mcp-oauth-connect.hooks`):
 *  the live port over the host's integrations client, and this product's callback message type.
 *  `ExternalMcpSettingsPanel` calls `useHostExternalMcpOAuthConnect` for each row. */
import {
  useExternalMcpOAuthConnect,
  type ExternalMcpOAuthConnectPort,
  type ExternalMcpOAuthConnectWindow,
} from '@jini-ai/admin/screens/settings/hooks/use-external-mcp-oauth-connect.hooks';
import { integrationsApi } from '../../features/integrations/api/integrations-api';
import { toAdminApiError } from './settings-external-mcp-shared-choice.hooks';

/** Must match `EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE` in the website's `routes/oauth/callback-page.ts`. */
export const EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE = "tovu:external-mcp-connected";

/** The live port. Each method resolves `integrationsApi`'s method at call time, so a suite's
 *  `vi.spyOn(integrationsApi, ...)` still reaches it; a host `ApiError` becomes Jini's `AdminApiError`
 *  so its message still shows. */
export const externalMcpOAuthConnectPort: ExternalMcpOAuthConnectPort = {
  connectExternalMcpOAuth: ({ serverId }, options) =>
    (options?.destination ? integrationsApi.connectExternalMcpOAuth({ serverId }, options) : integrationsApi.connectExternalMcpOAuth({ serverId })).catch(toAdminApiError),
  pollExternalMcpOAuthDevice: ({ serverId }) => integrationsApi.pollExternalMcpOAuthDevice({ serverId }).catch(toAdminApiError),
};

/** `useExternalMcpOAuthConnect` with the live port and this product's callback message type bound. */
export function useHostExternalMcpOAuthConnect(
  { serverId, grant, onConnected }: { serverId: string; grant: string; onConnected: () => void },
  { win, fallbackError }: { win?: () => ExternalMcpOAuthConnectWindow; fallbackError?: string } = {},
) {
  return useExternalMcpOAuthConnect(
    { serverId, grant, onConnected, port: externalMcpOAuthConnectPort, callbackMessageType: EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE },
    { ...(win ? { win } : {}), ...(fallbackError !== undefined ? { fallbackError } : {}) },
  );
}
