import { runApiConnectionConnect } from '#src/features/api-connections/connect';
import type { ApiConnectionHost } from '#src/features/api-connections/host';
/** Bind plugin consumers to the existing service owners; secret custody stays in composition. */
import type { SetValueRequired } from '@jini-ai/core/settings';
import { getEffective, set } from '#src/features/settings/index';
import type { Clock } from '@jini-ai/core/primitives';
import type { HttpClientPort } from '#src/platform/http/ports';
import { saveExternalMcpServer, ExternalMcpValidationError, ExternalMcpSecretStoreUnconfiguredError } from '#src/features/external-mcp/external-mcp-store';
import type { ExternalMcpOAuthService, ExternalMcpStoreDeps } from '#src/features/external-mcp/contracts';
import { notifyExternalMcpRosterChanged } from '#src/assistant/external-mcp-roster-change';
import { findPluginCredentialCard, loadPluginCredentialCardsSafely, type LoadPluginCredentialCards } from '#src/features/custom-credentials/plugin-credential-card';
import { applyPluginCredentialCard } from '#src/contracts/core/plugin-credential-card';
import { probeCredentialConnection } from '#src/features/custom-credentials/credentialed-request';
import { resolveOperatorLocale } from '#src/features/settings/operator-locale';
import { ADMIN_INTERFACE_NAMESPACE, CHAT_AGENT_PLUGINS_KEY } from '#src/features/settings/admin-interface';
import { AgentPluginLinkedError, bindProviderFacePorts, linkedProviderOf } from '#src/features/agent-plugins/provider-plugin-link';
import type { AgentPluginApiConnectionsPort, AgentPluginMcpPort, AgentPluginOAuthPort, AgentPluginPreferencesPort, PluginCredentialsPort } from '#src/features/agent-plugins/service-ports';
import type { PluginProviderFacesPort } from '#src/features/plugin-runtime/service-ports';

/** Preserve persistence and error identity over the site's bound sealing capability. O(1). */
export function composeAgentPluginMcp(required: ExternalMcpStoreDeps, _options = {}): AgentPluginMcpPort {
  return {
    repo: required.repo,
    saveServer: (input, _options = {}) => saveExternalMcpServer(required, input),
    classifyError: ({ error }, _options = {}) => {
      if (error instanceof ExternalMcpValidationError) return 'validation';
      return error instanceof ExternalMcpSecretStoreUnconfiguredError ? 'unconfigured' : 'other';
    },
    notifyRosterChanged: (_input, _options = {}) => notifyExternalMcpRosterChanged(),
  };
}

/** Reuse safe card lookup and the guarded probe without exposing HTTP to the consumer. O(1). */
export function composePluginCredentials({ loadCards, httpClient }: { loadCards?: LoadPluginCredentialCards; httpClient: HttpClientPort }, _options = {}): PluginCredentialsPort {
  return {
    apply: applyPluginCredentialCard,
    loadSafe: (input, _options = {}) => loadPluginCredentialCardsSafely({ ...input, loadCards }),
    find: (input, _options = {}) => findPluginCredentialCard({ ...input, loadCards }),
    probe: ({ probeUrl, token }, _options = {}) => probeCredentialConnection({ connection: { token }, url: probeUrl, schemes: [] }, { httpClient }),
  };
}

/** Principal attribution and Auto normalization remain at the settings owner boundary. O(1). */
export function composeAgentPluginPreferences({ settings, read = getEffective, write = set }: { settings: SetValueRequired['deps'] & { clock: Clock & { nowIso(): string } }; read?: typeof getEffective; write?: typeof set }, _options = {}): AgentPluginPreferencesPort {
  return {
    locale: (input, _options = {}) => resolveOperatorLocale({ ...input, deps: { settingsRepo: settings.repo } }),
    mode: async ({ workspaceId, principalId }, _options = {}) => {
      const effective = await read({ repo: settings.repo }, { namespace: ADMIN_INTERFACE_NAMESPACE, key: CHAT_AGENT_PLUGINS_KEY, scopeContext: { workspaceId, principalId } });
      return effective?.value === 'ask' || effective?.value === 'off' ? effective.value : 'auto';
    },
    saveAuto: async ({ workspaceId, principalId }, _options = {}) => {
      await write({ deps: { ...settings, clock: { nowMs: () => Date.parse(settings.clock.nowIso()) } }, input: { namespace: ADMIN_INTERFACE_NAMESPACE, key: CHAT_AGENT_PLUGINS_KEY, value: 'auto', scope: 'user', workspaceId, principalId, callerPrincipalId: principalId, authWorkspaceId: workspaceId } });
    },
  };
}

/** Fresh provider lookup and safe refusal copy come from the same lifecycle owner. O(1) to bind. */
export function composePluginProviderFaces({ workspaceRoot }: { workspaceRoot: () => string }, _options = {}): PluginProviderFacesPort {
  const ports = bindProviderFacePorts({ workspaceRoot });
  return {
    linkedProvider: (input, _options = {}) => linkedProviderOf({ ...input, ports }),
    describeLinkedFace: (input, _options = {}) => new AgentPluginLinkedError(input),
    describeLinkedError: ({ error }, _options = {}) => error instanceof AgentPluginLinkedError ? error : undefined,
  };
}

/** Both sign-in and credential-save tools receive the same narrow connection contracts. O(1). */
export function composeAgentPluginConnectServices(required: {
  httpClient: HttpClientPort; loadCards?: LoadPluginCredentialCards;
  externalMcpOAuth?: Pick<ExternalMcpOAuthService, 'beginConnect'>;
  apiConnections?: { host: ApiConnectionHost };
}, _options = {}): { credentials: PluginCredentialsPort; externalMcpOAuth?: AgentPluginOAuthPort; apiConnections?: AgentPluginApiConnectionsPort } {
  const { externalMcpOAuth, apiConnections } = required;
  return {
    credentials: composePluginCredentials(required),
    externalMcpOAuth: externalMcpOAuth && {
      beginConnect: (input, _options = {}) => externalMcpOAuth.beginConnect(input),
      isValidationError: ({ error }, _options = {}) => error instanceof ExternalMcpValidationError,
    },
    apiConnections: apiConnections && {
      listConnections: (input, _options = {}) => apiConnections.host.listConnections(input),
      connect: (input, _options = {}) => runApiConnectionConnect({ ...input, deps: { host: apiConnections.host } }),
    },
  };
}
