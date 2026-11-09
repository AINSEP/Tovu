/** Tovu compatibility signatures for token imports. The portable body keeps the retry, trust and
 * no-overwrite decisions; this host binds its existing lifecycle reads, switch owner, saved actor,
 * screen name and safe log copy. The retired Supabase env preset (`TOVU_SUPABASE_MCP_*`) is host
 * vocabulary; env values still come only from boot's caller. */
import {
  importAgentPluginAccessToken as importWithPorts,
  importAgentPluginAccessTokensFromEnv as importEnvWithPorts,
  listInstalledAgentPluginServers as listWithPorts,
  type ImportAgentPluginAccessTokenDeps as PortableImportDeps,
  type InstalledAgentPluginServers, type TokenImportLog,
} from './portable/import-access-token.js';
import { tovuTargetDeps, type AgentPluginTokenTargetDeps } from './access-token-tool.js';
import { AGENT_PLUGINS_SCREEN, switchOnSavedTokenConnection, type SwitchOnSavedTokenDeps } from './switch-on-saved-token.js';
import { tovuInstalledMcpReads } from './federate-mcp.js';
import { withOverrides } from './mcp-host-bindings.js';
import type { AgentPluginLayout } from './layout.js';
export type { ImportAgentPluginAccessTokenOutcome, InstalledAgentPluginServers, TokenImportLog } from './portable/import-access-token.js';

/** Recorded as `updatedBy`/principal on what an import writes. */
export const AGENT_PLUGIN_TOKEN_IMPORT_ACTOR = 'system:token-import';

export interface ImportAgentPluginAccessTokenDeps
  extends AgentPluginTokenTargetDeps,
    Pick<SwitchOnSavedTokenDeps, 'onConnected' | 'isPluginOffByOperator' | 'switchPluginOn' | 'notifyRosterChanged'> {}

export interface ImportAgentPluginAccessTokensFromEnvDeps extends ImportAgentPluginAccessTokenDeps {
  /** Injected for tests. Defaults to {@link listInstalledAgentPluginServers}. */
  readonly listPlugins?: () => Promise<readonly InstalledAgentPluginServers[]>;
}

/** Same canonical token target ports and switch owner as the old import path. */
function tovuImportDeps(deps: ImportAgentPluginAccessTokenDeps): PortableImportDeps {
  return withOverrides(tovuTargetDeps(deps), {
    importActor: AGENT_PLUGIN_TOKEN_IMPORT_ACTOR,
    switchOnSavedToken: ({ target }: Parameters<PortableImportDeps['switchOnSavedToken']>[0]) => switchOnSavedTokenConnection(deps, target),
  });
}

/** Existing positional host signature; token values never enter model events or logs. */
export function importAgentPluginAccessToken(deps: ImportAgentPluginAccessTokenDeps, input: Parameters<typeof importWithPorts>[0]['input']): ReturnType<typeof importWithPorts> {
  return importWithPorts({ deps: tovuImportDeps(deps), input });
}

/** Every installed plugin in the workspace, one per id (the bundled-preferred digest). */
export function listInstalledAgentPluginServers(input: { workspaceId: string; agentPluginLayout: AgentPluginLayout }, _options = {}): Promise<readonly InstalledAgentPluginServers[]> {
  return listWithPorts({ workspaceRoot: input.agentPluginLayout.forWorkspace(input.workspaceId).root, lifecycle: tovuInstalledMcpReads });
}

/** Existing boot signature; installed reads remain lazy and inside the portable failure boundary. */
export function importAgentPluginAccessTokensFromEnv(
  deps: ImportAgentPluginAccessTokensFromEnvDeps,
  env: Readonly<Record<string, string | undefined>>,
  log: TokenImportLog,
  options: Parameters<typeof importEnvWithPorts>[1] = {},
): Promise<void> {
  return importEnvWithPorts({ deps: withOverrides(tovuImportDeps(deps), {
    listPlugins: () => (deps.listPlugins ?? (() => listInstalledAgentPluginServers(deps)))(),
    importMessages: {
      pluginsScreen: AGENT_PLUGINS_SCREEN,
      failed: ({ envName, pluginId }: { envName: string; pluginId: string }) => `[agent-plugins] could not copy ${envName} onto the '${pluginId}' plugin. Check the site credential store and try again.`,
    },
  }), env, log }, options);
}
