/** Existing plugin tool tests exercise the real host adapter instead of relying on cross-family
 * imports as hidden defaults. Individual lifecycle failure fakes remain explicitly injected. */
import { buildPluginsRegistrations as build, contributePluginsTools as contribute, type PluginsToolDeps } from '../../features/plugin-runtime/tool-registrations.js';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import { createTovuPluginHost } from '../../server/runtime/composition/plugin-host.js';
import { resolveAgentPluginLayout } from '../../features/agent-plugins/layout.js';
export * from '../../features/plugin-runtime/tool-registrations.js';

export function buildPluginsRegistrations(deps: PluginsToolDeps, surfaces: AssistantSurfaceDeps) {
  // Older fixtures choose their isolated site through the environment before constructing deps.
  // Capture it once in this test adapter, matching production's explicit boot binding.
  if (!deps.agentPluginLayout) Object.assign(deps, { agentPluginLayout: resolveAgentPluginLayout() });
  return build(Object.assign(deps, { pluginHost: deps.pluginHost ?? createTovuPluginHost({ deps }) }), surfaces);
}
export function contributePluginsTools() {
  return { ...contribute(), build: buildPluginsRegistrations };
}
