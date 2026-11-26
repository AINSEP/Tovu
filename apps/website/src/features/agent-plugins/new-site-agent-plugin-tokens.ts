import { readdir, readFile } from 'node:fs/promises';
import { parseNewSiteAgentPluginTokens as parseWithPorts, describeNewSiteAgentPluginTokenRefusal as describeWithPorts,
  firstNewSiteAgentPluginTokenRefusal as firstWithPorts, listBundledAgentPluginServers as listWithPorts,
  resolveBundledAgentPlugin as resolveWithPorts, listNewSiteAgentPluginTokenSignInPlugins as signInWithPorts,
} from '@jini-ai/agent-plugins/connect/new-site-agent-plugin-tokens';
import type { AgentPluginPathsPort } from '@jini-ai/agent-plugins/site/service-ports';
import { readInstalledMcpServers, RETIRED_BUNDLED_AGENT_PLUGINS } from './lifecycle.js';

const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const NEW_SITE_AGENT_PLUGIN_TOKENS_SHAPE_ERROR = "'agentPluginTokens' must map plugin ids to token strings";
const TOKEN_LIMITS = { pluginIdPattern: PLUGIN_ID_PATTERN, maxTokens: 8, maxTokenLength: 4096 };
const copy = {
  refused: ({ name }: { name: string }) => `That ${name} access token was refused for this purpose. Check its permissions, or leave it empty and connect ${name} later from chat. No site was created.`,
  invalid: ({ name }: { name: string }) => `That ${name} access token didn't work. Check it, or leave it empty and connect ${name} later from chat. No site was created.`,
  unsupported: ({ name }: { name: string }) => `${name} can't be connected with an access token here. Leave it empty and connect it later from chat. No site was created.`,
};
const sourcePorts = { readdir, readFile, readInstalledMcpServers, retired: RETIRED_BUNDLED_AGENT_PLUGINS, pluginIdPattern: PLUGIN_ID_PATTERN };

export function parseNewSiteAgentPluginTokens(required: { raw: unknown }, _optional = {}) {
  return parseWithPorts({ ...required, limits: TOKEN_LIMITS, shapeError: NEW_SITE_AGENT_PLUGIN_TOKENS_SHAPE_ERROR });
}

export function describeNewSiteAgentPluginTokenRefusal(required: Omit<Parameters<typeof describeWithPorts>[0], 'copy'>, _optional = {}) {
  return describeWithPorts({ ...required, copy });
}

export function firstNewSiteAgentPluginTokenRefusal(required: Omit<Parameters<typeof firstWithPorts>[0], 'copy'>, _optional = {}) {
  return firstWithPorts({ ...required, copy });
}

export function listBundledAgentPluginServers(paths: Pick<AgentPluginPathsPort, 'bundledSourceRoot'>, _optional = {}) {
  return listWithPorts({ ...paths, ...sourcePorts });
}

export function resolveBundledAgentPlugin(paths: Pick<AgentPluginPathsPort, 'bundledSourceRoot'>, _optional = {}) {
  return resolveWithPorts({ ...paths, ...sourcePorts });
}

export function listNewSiteAgentPluginTokenSignInPlugins(paths: Pick<AgentPluginPathsPort, 'bundledSourceRoot'>, _optional = {}) {
  return signInWithPorts({ ...paths, ...sourcePorts });
}
