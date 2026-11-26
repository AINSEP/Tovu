import { createAgentPluginSiteLayout } from '@jini-ai/agent-plugins/lifecycle';
import type { AgentPluginPathsPort } from '@jini-ai/agent-plugins/site/service-ports';
import type { AgentPluginLayout } from '@jini-ai/core/contracts/headless/plugin-host';

export interface ResolveAgentPluginLayoutOptional {
  /** Defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Resolves the Agent Plugins filesystem layout for this Tovu instance.
 *
 * @throws {Error} If `TOVU_AGENT_PLUGINS_DIR` is set to a relative path.
 * @complexity O(1).
 */
export const resolveAgentPluginLayout = (
  required: Pick<AgentPluginPathsPort, "siteDir">,
  optional: ResolveAgentPluginLayoutOptional = {},
): AgentPluginLayout => createAgentPluginSiteLayout({ get siteDir() { return required.siteDir; },
  rootOverride: (optional.env ?? process.env).TOVU_AGENT_PLUGINS_DIR, diagnostics: {
    rootOverride: ({ rootOverride }) => new Error(`TOVU_AGENT_PLUGINS_DIR must be an absolute path, got '${rootOverride}'`),
    workspaceId: ({ workspaceId }) => new Error(`forWorkspace: '${workspaceId}' is not a valid workspace id`),
    pluginId: ({ pluginId }) => new Error(`'${pluginId}' is not a valid Agent Plugin id`),
    pluginDataId: ({ pluginId }) => new Error(`pluginDataDir: '${pluginId}' is not a valid Agent Plugin id`),
    memoryKind: () => new Error('Invalid plugin memory kind'),
  } });
