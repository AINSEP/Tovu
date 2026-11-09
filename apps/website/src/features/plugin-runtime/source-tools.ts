import { pluginSourceToolIds } from './plugin-tool-ids.js';
export { pluginSourceAgentToolCatalog } from './source-tool-catalog.js';
import type { ToolContributor, ToolRegistration } from '@jini-ai/core';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import type { PluginsToolDeps } from './tool-registrations.js';
import { buildPluginSourceRegistrations as portableSourceRegistrations, pluginSourceDerivedRiskFor } from '@jini-ai/plugins/host/tools';
import { bindPluginSourceTools } from './host-tool-binding.js';

type SourceDeps = Pick<PluginsToolDeps, 'workspaceId' | 'authorize' | 'pluginSource'>;
export const pluginSourceDerivedRisk = pluginSourceDerivedRiskFor({ toolIds: pluginSourceToolIds });
export function buildPluginSourceRegistrations(required: { deps: SourceDeps; surfaces: AssistantSurfaceDeps }, _optional = {}): ToolRegistration[] { return portableSourceRegistrations(bindPluginSourceTools(required)); }

/** Register beside the theme and plugin lifecycle tools in the first-party catalog. */
export function contributePluginSourceTools(_required = {}, _optional = {}): ToolContributor<SourceDeps, AssistantSurfaceDeps> {
  return { domain: 'plugin-source', build: (deps, surfaces) => buildPluginSourceRegistrations({ deps, surfaces }, {}), risk: pluginSourceDerivedRisk };
}
