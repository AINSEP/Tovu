import { apiConnectionCallbackFieldRules } from './oauth-bindings.js';
import { parseApiConnectionsFile as parseApiConnectionDeclarations } from '@jini-ai/integrations/api-connections';
import { loadDeclaredApiConnections as loadWithPorts } from '@jini-ai/integrations/api-connections/contribution';
import type { ClientNamespaceFor } from '@jini-ai/core/contracts/site/integrations-api-connections';
import { defineExecutablePluginContribution, type LoadPluginContributions } from '../agent-plugins/lifecycle.js';

/** This host's client-setting namespace: every plugin's client settings are named `TOVU_<PLUGIN>_OAUTH_<RUNTIME>_CLIENT_*`. */
const CLIENT_NAMESPACE = "TOVU_";

/** Parses a plugin's {@link API_CONNECTIONS_FILENAME}. Pure; unknown keys go to the descriptor parser. @complexity O(c).
 * The parser lives in `@jini-ai/integrations/api-connections`; this keeps the host's name and signature
 * and supplies this host's client-setting namespace. */
export function parseApiConnectionsFile(required: { readonly raw: string }, _optional: Record<string, never> = {}): ReturnType<typeof parseApiConnectionDeclarations> {
  return parseApiConnectionDeclarations({ raw: required.raw, clientNamespace: CLIENT_NAMESPACE });
}

export function loadDeclaredApiConnections(
  required: { readonly workspaceId: string; readonly loadContributions: LoadPluginContributions },
  optional: { readonly clientNamespaceFor?: ClientNamespaceFor } = {},
) {
  return loadWithPorts({ workspaceId: required.workspaceId, clientNamespace: CLIENT_NAMESPACE,
    callbackFieldRules: apiConnectionCallbackFieldRules,
    loadContributions: ({ workspaceId, definition, onReadError }, options) => required.loadContributions({ workspaceId,
      definition: defineExecutablePluginContribution(definition, { onReadError }) }, options),
  }, optional);
}
