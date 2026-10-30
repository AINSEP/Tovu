import { testSiteLayoutContext } from "../fixtures/site-layout-context.js";
import { resolveSiteRoot } from "#src/platform/site-dir/index";
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
  if (!deps.agentPluginLayout) Object.assign(deps, { agentPluginLayout: resolveAgentPluginLayout({ siteDir: process.env.TOVU_AGENT_PLUGINS_DIR ?? resolveSiteRoot() }) });
  const bound = testSiteLayoutContext(deps);
  return build(Object.assign(bound, { pluginHost: deps.pluginHost ?? createTovuPluginHost({ deps: bound }) }), surfaces);
}
export function contributePluginsTools() {
  return { ...contribute(), build: buildPluginsRegistrations };
}
