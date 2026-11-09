/** Host-only lifecycle identity, scoped legacy overrides and lazy capability resolution. */
import { ToolInputError } from '@jini-ai/core';
import { AGENT_PLUGIN_CONTRACT_VERSION, AgentPluginNotInstalledError, AgentPluginHostIncompatibleError, AgentPluginUpdateError, AgentPluginActivationsUnreadableError, AgentPluginActivationsBusyError, checkAgentPluginCompatibility, agentVisiblePluginCandidate } from '@jini-ai/agent-plugins/lifecycle';
import type { InstalledAgentPlugin } from '@jini-ai/agent-plugins/lifecycle';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import type { PluginsToolDeps } from './tool-registrations.js';
import type { ClassifiedPluginError, InstalledPluginRevision, PluginLifecycleToolsPort } from './host-tools/contract.js';

function classifyError({ error }: { error: unknown }): ClassifiedPluginError | undefined {
  if (error instanceof AgentPluginNotInstalledError) return { kind: 'not-installed', message: error.message };
  if (error instanceof AgentPluginHostIncompatibleError) return { kind: 'host-incompatible', code: error.code };
  if (error instanceof AgentPluginUpdateError) return { kind: 'update', code: error.code };
  if (error instanceof AgentPluginActivationsUnreadableError) return { kind: 'unreadable', message: error.message };
  if (error instanceof AgentPluginActivationsBusyError) return { kind: 'busy', message: error.message };
  return undefined;
}
/** Only the fields the portable body consumes; no packageRoot/files/skillPath enters the port. */
function safeRevision(plugin: InstalledAgentPlugin): InstalledPluginRevision {
  return { pluginId: plugin.pluginId, version: plugin.version, archiveDigest: plugin.archiveDigest,
    skills: plugin.skills.map(({ name }) => ({ name })), displayName: plugin.displayName, description: plugin.description,
    hostRange: plugin.hostRange, requires: plugin.requires };
}
export function bindAgentPluginTools({ deps, surfaces }: { deps: PluginsToolDeps; surfaces?: AssistantSurfaceDeps }): PluginLifecycleToolsPort {
  function capability() {
    const value = deps.pluginHost?.getHostCapability({ capability: 'agent-plugin-lifecycle' });
    if (!value) throw new ToolInputError({ message: 'The host does not provide agent-plugin lifecycle operations.' });
    return value;
  }
  return {
    inactivePluginIds: ({ strict }) => (strict ? capability() : deps.pluginHost?.getHostCapability({ capability: 'agent-plugin-lifecycle' }))?.inactivePluginIds?.({}, {}) ?? Promise.resolve(undefined),
    previewEnableAccess: input => capability().previewEnableAccess?.(input, {}) ?? Promise.resolve(undefined),
    recordDeclinedAccess: async input => { await capability().recordDeclinedAccess?.(input); },
    listInstalled: async () => (await (deps.listInstalledAgentPlugins
      ? deps.listInstalledAgentPlugins(deps.agentPluginLayout.forWorkspace(deps.workspaceId).root)
      : capability().listInstalled({}, {}))).map(safeRevision),
    assertWritable: () => deps.assertAgentPluginActivationsWritable
      ? deps.assertAgentPluginActivationsWritable({ workspaceRoot: deps.agentPluginLayout.forWorkspace(deps.workspaceId).root }) : capability().assertWritable({}, {}),
    setEnabled: input => deps.setAgentPluginEnabled ? deps.setAgentPluginEnabled({ ...input, agentPluginLayout: deps.agentPluginLayout }) : capability().setEnabled(input),
    provisionMcp: (input, optional) => capability().provisionMcp(input, optional),
    uninstall: (input, optional) => { if (!surfaces) throw new ToolInputError({ message: 'An authenticated confirmation transport is required.' }); return capability().uninstall({ ...input, surfaces }, optional); },
    searchCandidate: agentVisiblePluginCandidate,
    classifyError,
    compatibility: ({ revisions }) => revisions.some(revision => !checkAgentPluginCompatibility({ manifest: revision, hostVersion: AGENT_PLUGIN_CONTRACT_VERSION, activeProvides: [] }).hostOk)
      ? { code: 'PLUGIN_HOST_INCOMPATIBLE' } : undefined,
  };
}
