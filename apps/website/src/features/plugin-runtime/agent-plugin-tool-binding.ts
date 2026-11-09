/** Host-only lifecycle identity, scoped legacy overrides and lazy capability resolution. */
import { ToolInputError } from '@jini-ai/core';
import { AGENT_PLUGIN_CONTRACT_VERSION, AgentPluginNotInstalledError, AgentPluginHostIncompatibleError, AgentPluginUpdateError, AgentPluginActivationsUnreadableError, AgentPluginActivationsBusyError, checkAgentPluginCompatibility, agentVisiblePluginCandidate } from '@jini-ai/agent-plugins/lifecycle';
import type { InstalledAgentPlugin } from '@jini-ai/agent-plugins/lifecycle';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import type { PluginsToolDeps } from './tool-registrations.js';
import type { ClassifiedPluginError, InstalledPluginRevision, PluginLifecycleToolsPort } from '@jini-ai/plugins/host/tools';

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
    skills: plugin.skills.map(({ name }) => ({ name })), displayName: plugin.displayName, summary: plugin.summary, description: plugin.description,
    hostRange: plugin.hostRange, requires: plugin.requires };
}
function capability(deps: PluginsToolDeps) {
  const value = deps.pluginHost?.getHostCapability({ capability: 'agent-plugin-lifecycle' });
  if (!value) throw new ToolInputError({ message: 'The host does not provide agent-plugin lifecycle operations.' });
  return value;
}
/** The approval-identity shim reads revisions without constructing destructive operations. */
export function bindAgentPluginIdentity({ deps }: { deps: PluginsToolDeps }, _optional: Record<string, never> = {}): Pick<PluginLifecycleToolsPort, 'listInstalled' | 'previewEnableAccess'> {
  return {
    previewEnableAccess: input => capability(deps).previewEnableAccess?.(input, {}) ?? Promise.resolve(undefined),
    listInstalled: async () => (await (deps.listInstalledAgentPlugins
      ? deps.listInstalledAgentPlugins(deps.agentPluginLayout.forWorkspace(deps.workspaceId).root)
      : capability(deps).listInstalled({}, {}))).map(safeRevision),
  };
}
export function bindAgentPluginTools({ deps, surfaces }: { deps: PluginsToolDeps; surfaces: AssistantSurfaceDeps }): PluginLifecycleToolsPort {
  return {
    ...bindAgentPluginIdentity({ deps }),
    inactivePluginIds: ({ strict }) => (strict ? capability(deps) : deps.pluginHost?.getHostCapability({ capability: 'agent-plugin-lifecycle' }))?.inactivePluginIds?.({}, {}) ?? Promise.resolve(undefined),
    recordDeclinedAccess: async input => { await capability(deps).recordDeclinedAccess?.(input); },
    assertWritable: () => deps.assertAgentPluginActivationsWritable
      ? deps.assertAgentPluginActivationsWritable({ workspaceRoot: deps.agentPluginLayout.forWorkspace(deps.workspaceId).root }) : capability(deps).assertWritable({}, {}),
    setEnabled: input => deps.setAgentPluginEnabled ? deps.setAgentPluginEnabled({ ...input, agentPluginLayout: deps.agentPluginLayout }) : capability(deps).setEnabled(input),
    provisionMcp: (input, optional) => capability(deps).provisionMcp(input, optional),
    uninstall: (input, optional) => capability(deps).uninstall({ ...input, surfaces }, optional),
    searchCandidate: agentVisiblePluginCandidate,
    classifyError,
    compatibility: ({ revisions }) => revisions.some(revision => !checkAgentPluginCompatibility({ manifest: revision, hostVersion: AGENT_PLUGIN_CONTRACT_VERSION, activeProvides: [] }).hostOk)
      ? { code: 'PLUGIN_HOST_INCOMPATIBLE' } : undefined,
  };
}
