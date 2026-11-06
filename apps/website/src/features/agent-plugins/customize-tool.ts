/** Chat customization reuses Jini's package fork and the admin upload preview/install owner. */
import { requireInputRecord, requireString, ToolInputError, type AgentToolDefinition, type ToolExecutionContext } from '@jini-ai/core';
import { FolderZipError } from '@jini-ai/agent-plugins/folder-zip';
import { zipCustomizedAgentPluginFolder } from '@jini-ai/agent-plugins/folder-zip/node';
import { listInstalledPlugins, preferBundledAgentPluginDigests, readBundledAgentPluginDigests, maxAgentPluginInstallArchiveBytes } from './lifecycle.js';
import type { AgentPluginsInstallToolDeps } from './install-tool.js';

export const CUSTOMIZE_AGENT_PLUGIN_TOOL = 'agent_plugins_customize';
export const customizeAgentPluginCatalog: AgentToolDefinition = {
  name: CUSTOMIZE_AGENT_PLUGIN_TOOL,
  description: 'Changes one exact text match in an installed Agent Plugin by automatically making a site-local copy under a NEW id. ' +
    'Use this when the owner asks to change a bundled plugin such as tovu-theme: do not edit frozen package files, update the bundled id, or ask the owner to copy files by hand. ' +
    'Read the source file first; oldString must match exactly once. Original bytes and activation stay untouched. The edited copy goes through upload validation and installs OFF with operator trust; enable with plugins_set_enabled (family agent-plugin) if requested. ' +
    'Site themes (theme_list) are a different family: edit those in place with theme_edit_file.',
  sideEffects: 'mutates-durable-state', authorization: { permission: 'admin.plugins.enable' },
  inputSchema: { type: 'object', additionalProperties: false, required: ['pluginId', 'newId', 'path', 'oldString', 'newString'], properties: {
    pluginId: { type: 'string', minLength: 1, description: 'Installed Agent Plugin source id from plugins_list.' },
    newId: { type: 'string', minLength: 1, description: 'Fresh local Agent Plugin name, e.g. my-theme. Must differ from source; existing ids are never overwritten.' },
    path: { type: 'string', minLength: 1, description: 'Existing package-relative text file, e.g. skills/tovu-theme/SKILL.md. plugin.json identity is managed automatically.' },
    oldString: { type: 'string', minLength: 1 }, newString: { type: 'string' },
  } },
};

/**
 * Prepare a fork after the install tool's authorization; publication stays with that tool's owner.
 * @param required Host deps and the actual assistant tool context.
 * @returns ZIP bytes for the existing install flow. Never writes an installed package.
 * @throws {ToolInputError} Unknown/ambiguous source or invalid edit.
 * @complexity O(p + e log e + b) for p installed packages, e files and bounded bytes b; no network.
 */
export async function prepareCustomizedAgentPluginArchive({ deps, ctx }: { deps: AgentPluginsInstallToolDeps; ctx: ToolExecutionContext }, _options = {}): Promise<Uint8Array> {
  const input = requireInputRecord({ input: ctx.input });
  const pluginId = requireString({ input, key: 'pluginId' });
  const workspaceRoot = deps.agentPluginLayout.forWorkspace(deps.workspaceId).root;
  const installed = preferBundledAgentPluginDigests(await listInstalledPlugins(workspaceRoot), await readBundledAgentPluginDigests(workspaceRoot));
  const sources = installed.filter(plugin => plugin.pluginId === pluginId);
  if (sources.length !== 1) throw new ToolInputError({ message: `Source '${pluginId}' must identify exactly one installed Agent Plugin.` });
  try {
    return await zipCustomizedAgentPluginFolder({ path: sources[0]!.packageRoot, maxBytes: maxAgentPluginInstallArchiveBytes(), name: requireString({ input, key: 'newId' }), identityNamespace: 'jini',
      edit: { path: requireString({ input, key: 'path' }), oldString: requireString({ input, key: 'oldString' }), newString: requireString({ input, key: 'newString' }, { allowEmpty: true }) } });
  } catch (error) {
    if (error instanceof FolderZipError) throw new ToolInputError({ message: error.message });
    throw error;
  }
}
