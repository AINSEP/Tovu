/** Chat customization reuses Jini's package fork and the admin upload preview/install owner.
 * The fork itself (`prepareCustomizedAgentPluginArchive`) lives in `@jini-ai/agent-plugins/site/customize-tool`;
 * this host file keeps only the model-facing tool definition, whose copy names product plugins and tools. */
import type { AgentToolDefinition } from '@jini-ai/core';

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
