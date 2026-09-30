import type { HttpClientPort } from "../../platform/http/index.js";

import { probeToken } from "./access-token-tool.js";
import { defaultResolveInstalledAgentPlugin, titleCaseFromPluginId, type ResolvedAgentPluginForConnect } from "./connect-tool.js";
import { listInstalledAgentPluginServers, type InstalledAgentPluginServers } from "./import-access-token.js";
import type { AgentPluginTokenAuth, McpServerConfig } from "./manifest.js";

/**
 * @file Which installed Agent Plugins can be connected with a pasted access token, and a check of one
 * token before anything is saved — for create-site onboarding, which offers "connect <plugin> now"
 * next to the site's name. Generic: a plugin qualifies by declaring `tovuTokenAuth` on exactly one
 * remote server in its `mcp.json`; the tokens page and the probe URL both come from there.
 */

/** One plugin the onboarding form can offer a token field for. */
export interface TokenSignInPlugin {
  readonly pluginId: string;
  readonly displayName: string;
  /** Where the person creates a token (the plugin's own `tovuTokenAuth.helpUrl`). */
  readonly helpUrl: string;
}

/** The plugin's one token-auth declaration, or `null` for none or more than one (the same rule
 *  `agent_plugin_set_access_token` refuses on). */
function soleTokenAuth(servers: Readonly<Record<string, McpServerConfig>>): AgentPluginTokenAuth | null {
  const declared = Object.values(servers).flatMap((config) => (config.type !== "stdio" && config.tovuTokenAuth ? [config.tovuTokenAuth] : []));
  return declared.length === 1 ? (declared[0] ?? null) : null;
}

/**
 * The installed plugins that take a pasted token, sorted by id.
 * @complexity O(p·s) over installed plugins and their servers.
 */
export async function listTokenSignInPlugins(
  workspaceId: string,
  listPlugins: (workspaceId: string) => Promise<readonly InstalledAgentPluginServers[]> = listInstalledAgentPluginServers,
): Promise<readonly TokenSignInPlugin[]> {
  const plugins = await listPlugins(workspaceId);
  return plugins
    .flatMap(({ pluginId, servers }) => {
      const auth = soleTokenAuth(servers);
      return auth ? [{ pluginId, displayName: titleCaseFromPluginId(pluginId), helpUrl: auth.helpUrl }] : [];
    })
    .sort((a, b) => a.pluginId.localeCompare(b.pluginId));
}

export type TokenCheckOutcome = "ok" | "invalid" | "unavailable" | "unsupported";

/**
 * Checks `token` against the plugin's declared probe URL (one GET; 401/403 = rejected). Never throws,
 * never returns or logs the token. `unsupported`: the plugin is not installed or takes no token.
 */
export async function checkAgentPluginAccessToken(
  deps: {
    readonly workspaceId: string;
    readonly httpClient: HttpClientPort;
    readonly resolveInstalledPlugin?: (pluginId: string) => Promise<ResolvedAgentPluginForConnect | null>;
  },
  input: { readonly pluginId: string; readonly token: string },
): Promise<TokenCheckOutcome> {
  const resolvePlugin = deps.resolveInstalledPlugin ?? ((id: string) => defaultResolveInstalledAgentPlugin(deps.workspaceId, id));
  let plugin: ResolvedAgentPluginForConnect | null;
  try {
    plugin = await resolvePlugin(input.pluginId);
  } catch {
    return "unsupported";
  }
  const auth = plugin ? soleTokenAuth(plugin.servers) : null;
  if (!auth) return "unsupported";
  return probeToken(deps.httpClient, auth.probeUrl, input.token);
}
