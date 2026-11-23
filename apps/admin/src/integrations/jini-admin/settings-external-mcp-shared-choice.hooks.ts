/** Host binding for Jini's saved-MCP-connection chooser (`@jini-ai/admin/screens/settings/ExternalMcpSharedChoice`):
 *  the live port over the host's integrations client, and the bound hook `ExternalMcpSettingsPanel`
 *  passes as the chooser's required `useExternalMcpSharedChoiceHook` prop. */
import { useExternalMcpSharedChoice, type ExternalMcpSharedChoiceController, type ExternalMcpSharedChoicePort } from '@jini-ai/admin/screens/settings/ExternalMcpSharedChoice.hooks';
import { AdminApiError } from '@jini-ai/core/admin-runtime';
import { integrationsApi } from '../../features/integrations/api/integrations-api';
import { ApiError } from '../../lib/admin-http/request';

/** Jini shows only its own typed error's words, so the host's `ApiError` identity is translated at
 *  this seam; status, code and raw body are kept. Anything else is rethrown unchanged (and Jini shows
 *  the action's fallback copy for it). */
function toAdminApiError(error: unknown): never {
  if (error instanceof ApiError) throw new AdminApiError({ message: error.message, status: error.status }, { code: error.code, body: error.body });
  throw error;
}

/** The live port. Each method resolves `integrationsApi`'s method at call time, so a suite's
 *  `vi.spyOn(integrationsApi, ...)` still reaches it. */
export const externalMcpSharedChoicePort: ExternalMcpSharedChoicePort = {
  listSharedMcpConnections: ({ serverId }, _optional = {}) => integrationsApi.listSharedMcpConnections({ serverId }).catch(toAdminApiError),
  useSharedMcpConnection: ({ serverId, credentialId }) => integrationsApi.useSharedMcpConnection({ serverId, credentialId }).catch(toAdminApiError),
  stopSharedMcpConnection: ({ serverId }, _optional = {}) => integrationsApi.stopSharedMcpConnection({ serverId }).catch(toAdminApiError),
  useLocalMcpConnection: ({ serverId }, _optional = {}) => integrationsApi.useLocalMcpConnection({ serverId }).catch(toAdminApiError),
};

/** `useExternalMcpSharedChoice` with the live port bound — pass as `useExternalMcpSharedChoiceHook`. */
export function useHostExternalMcpSharedChoice({ serverId, onChanged }: { serverId: string; onChanged: () => void }, _options = {}): ExternalMcpSharedChoiceController {
  return useExternalMcpSharedChoice({ serverId, onChanged, port: externalMcpSharedChoicePort });
}
