import path from 'node:path';
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
export function resolveAgentPluginLayout(
  required: Pick<AgentPluginPathsPort, "siteDir">,
  optional: ResolveAgentPluginLayoutOptional = {},
): AgentPluginLayout {
  const env = optional.env ?? process.env;
  const override = env.TOVU_AGENT_PLUGINS_DIR;

  if (override !== undefined && !path.isAbsolute(override)) {
    throw new Error(`TOVU_AGENT_PLUGINS_DIR must be an absolute path, got '${override}'`);
  }

  const root = path.resolve(override ?? path.join(required.siteDir, "agent-plugins"));
  return createAgentPluginSiteLayout({ root, diagnostics: {
    workspaceId: ({ workspaceId }) => new Error(`forWorkspace: '${workspaceId}' is not a valid workspace id`),
    pluginId: ({ pluginId }) => new Error(`'${pluginId}' is not a valid Agent Plugin id`),
    pluginDataId: ({ pluginId }) => new Error(`pluginDataDir: '${pluginId}' is not a valid Agent Plugin id`),
    memoryKind: () => new Error('Invalid plugin memory kind'),
  } });
}

