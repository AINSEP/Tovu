import { createAgentPluginUpdateEffects as createWithPorts,
  createDeferredAgentPluginUpdateEffects as createDeferredWithPorts } from '@jini-ai/agent-plugins/site/update-effects';
import type { UpdateMcpDeps, UpdateMcpHostDeps } from '@jini-ai/agent-plugins/site/update-effects';
import { provisionAgentPluginMcpServers, resolveAgentPluginMcpServers } from './federate-mcp.js';

/** Who boot recovery provisions as: no operator is signed in while the host starts. */
export const AGENT_PLUGIN_RECOVERY_ACTOR = "system:agent-plugin-update-recovery";

export const createAgentPluginUpdateEffects = (
  required: { deps: UpdateMcpDeps; actor: string },
  { resolveServers = resolveAgentPluginMcpServers, provisionServers = provisionAgentPluginMcpServers }: {
    resolveServers?: typeof resolveAgentPluginMcpServers;
    provisionServers?: typeof provisionAgentPluginMcpServers;
  } = {},
) => createWithPorts({ ...required, resolveServers, provisionServers });

export const createDeferredAgentPluginUpdateEffects = (
  required: { resolveDeps: () => UpdateMcpHostDeps },
  { resolveServers = resolveAgentPluginMcpServers, provisionServers = provisionAgentPluginMcpServers }: {
    resolveServers?: typeof resolveAgentPluginMcpServers;
    provisionServers?: typeof provisionAgentPluginMcpServers;
  } = {},
) => createDeferredWithPorts({ ...required, actor: AGENT_PLUGIN_RECOVERY_ACTOR, resolveServers, provisionServers });
