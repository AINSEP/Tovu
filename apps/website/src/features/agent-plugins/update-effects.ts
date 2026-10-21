import type { AgentPluginMcpProvisioningPort } from '@jini-ai/agent-plugins/lifecycle';
import { notifyExternalMcpRosterChanged } from '../../assistant/external-mcp-roster-change.js';
import { provisionAgentPluginMcpServers, resolveAgentPluginMcpServers } from './federate-mcp.js';
import type { AgentPluginLayout } from "./layout.js";

type ProvisionDeps = Parameters<typeof provisionAgentPluginMcpServers>[0];
export type UpdateMcpDeps = {
  workspaceId: string; agentPluginLayout: AgentPluginLayout;
  externalMcpServerRepo: ProvisionDeps["repo"]; siteAssistantSecretSealer: ProvisionDeps["sealer"];
  siteAssistantSecretKeyring: ProvisionDeps["keyring"]; clock: ProvisionDeps["clock"];
};

/** Update provisioning uses the existing MCP owner and roster reload. It must succeed before
 * the update commits; existing credentials and reviewed permissions stay with that owner.
 * @complexity O(s), candidate MCP servers. Running MCP requests may fail during roster reload.
 */
export function createAgentPluginUpdateEffects(
  { deps, actor }: { deps: UpdateMcpDeps; actor: string },
  { resolveServers = resolveAgentPluginMcpServers, provisionServers = provisionAgentPluginMcpServers, notify = notifyExternalMcpRosterChanged }: {
    resolveServers?: typeof resolveAgentPluginMcpServers;
    provisionServers?: typeof provisionAgentPluginMcpServers;
    notify?: typeof notifyExternalMcpRosterChanged;
  } = {},
): AgentPluginMcpProvisioningPort {
  const unsupported = async (): Promise<never> => { throw new Error('Use the shared activation/removal owner.'); };
  return {
    provision: async ({ workspaceId, installed }) => {
      const servers = await resolveServers({ agentPluginLayout: deps.agentPluginLayout, workspaceId, pluginId: installed.pluginId });
      const result = await provisionServers({ repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer,
        keyring: deps.siteAssistantSecretKeyring, clock: deps.clock }, { workspaceId, pluginId: installed.pluginId, servers, principalId: actor });
      if (result.failed.length) throw new Error('Plugin MCP reprovisioning failed; the update will be rolled back.');
    },
    notifyRosterChanged: async () => notify(),
    setEnabled: unsupported,
    remove: unsupported,
  };
}

/** Who boot recovery provisions as: no operator is signed in while the host starts. */
export const AGENT_PLUGIN_RECOVERY_ACTOR = "system:agent-plugin-update-recovery";

/**
 * The composed lifecycle's MCP port, used by boot recovery to re-provision a restored revision's
 * servers. The lifecycle is bound before the external-MCP store exists in the composition root, so
 * the deps are read when recovery calls, not when this is built. Without this binding recovery
 * still restores the bytes but leaves the plugin switched off (Jini's degraded outcome).
 * @complexity O(1) to build; each call as {@link createAgentPluginUpdateEffects}.
 */
export function createDeferredAgentPluginUpdateEffects(
  { resolveDeps }: { resolveDeps: () => UpdateMcpDeps },
  optional: Parameters<typeof createAgentPluginUpdateEffects>[1] = {},
): AgentPluginMcpProvisioningPort {
  const effects = () => createAgentPluginUpdateEffects({ deps: resolveDeps(), actor: AGENT_PLUGIN_RECOVERY_ACTOR }, optional);
  return {
    provision: (input) => effects().provision(input),
    notifyRosterChanged: (input) => effects().notifyRosterChanged(input),
    setEnabled: (input) => effects().setEnabled(input),
    remove: (input) => effects().remove(input),
  };
}
