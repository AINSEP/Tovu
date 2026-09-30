import { createApplyConnectDefaults } from "./apply-connect-defaults.js";
import { resolveTarget, saveStaticAccessToken, type AgentPluginTokenTargetDeps } from "./access-token-tool.js";
import { preferBundledAgentPluginDigests, readBundledAgentPluginDigests } from "./bundled-digests.js";
import { readInstalledMcpServers } from "./capability-projection.js";
import { hasStoredAgentPluginCredential } from "./connect-tool.js";
import { resolveAgentPluginLayout } from "./layout.js";
import type { McpServerConfig } from "./manifest.js";
import { listInstalledPlugins } from "./resolve-agent-plugin-refs.js";

/**
 * @file Saves an access token that did NOT come through `agent_plugin_set_access_token`'s form onto
 * an Agent Plugin's token-auth row, then switches the plugin on — the same end state as a pasted
 * token followed by a first sign-in.
 *
 * Two callers, both at boot (`server/runtime/boot/bootstrap.ts`):
 * - {@link importAgentPluginAccessTokensFromEnv}: a plugin's `mcp.json` may name an old env var
 *   (`tovuTokenAuth.importFromEnv`) whose token is copied over. Added 2026-09-29 when the Supabase
 *   env preset (`TOVU_SUPABASE_MCP_*`) was retired in favour of the Supabase plugin.
 * - create-site onboarding's pending tokens (`composition/pending-agent-plugin-tokens.ts`).
 *
 * Never overwrites: a row that already holds a credential (a sign-in or a saved token) is left alone.
 * Not probed: the env token was already in use, and onboarding probes before it seals.
 */

/** Recorded as `updatedBy`/principal on what an import writes. */
export const AGENT_PLUGIN_TOKEN_IMPORT_ACTOR = "system:token-import";

export interface ImportAgentPluginAccessTokenDeps extends AgentPluginTokenTargetDeps {
  /** Turns the plugin and the row on with the plugin's declared default tools. Defaults to the same
   *  `onConnected` a first sign-in runs (`apply-connect-defaults.ts`). Injected for tests. */
  readonly onConnected?: (serverId: string) => Promise<void>;
}

export type ImportAgentPluginAccessTokenOutcome = "saved" | "already-connected";

/**
 * Seals `token` onto `pluginId`'s token-auth row unless that row already has a credential.
 *
 * @throws {import("@jini-ai/core").ToolInputError} Plugin not installed, or no single token-auth server.
 * @throws Whatever the store throws on save (e.g. an unconfigured secret store).
 * @complexity O(s) in the plugin's declared servers, plus one row read and at most two writes.
 */
export async function importAgentPluginAccessToken(
  deps: ImportAgentPluginAccessTokenDeps,
  input: { readonly pluginId: string; readonly token: string; readonly principalId?: string },
): Promise<ImportAgentPluginAccessTokenOutcome> {
  const principalId = input.principalId ?? AGENT_PLUGIN_TOKEN_IMPORT_ACTOR;
  const target = await resolveTarget(deps, input.pluginId, principalId);
  const row = await deps.externalMcpServerRepo.findByServerId({ workspaceId: deps.workspaceId, serverId: target.connectionId });
  if (row && hasStoredAgentPluginCredential(row)) return "already-connected";

  await saveStaticAccessToken(deps, target, principalId, input.token);
  const onConnected = deps.onConnected ?? createApplyConnectDefaults({ workspaceId: deps.workspaceId, repo: deps.externalMcpServerRepo, clock: deps.clock });
  await onConnected(target.connectionId);
  return "saved";
}

/** One installed plugin's id and declared servers. */
export interface InstalledAgentPluginServers {
  readonly pluginId: string;
  readonly servers: Readonly<Record<string, McpServerConfig>>;
}

/** Every installed plugin in the workspace, one per id (the bundled-preferred digest). */
export async function listInstalledAgentPluginServers(workspaceId: string): Promise<readonly InstalledAgentPluginServers[]> {
  const workspaceLayout = resolveAgentPluginLayout().forWorkspace(workspaceId);
  const installed = preferBundledAgentPluginDigests(
    await listInstalledPlugins(workspaceLayout.packages),
    await readBundledAgentPluginDigests(workspaceLayout.root),
  );
  const seen = new Set<string>();
  const out: InstalledAgentPluginServers[] = [];
  for (const plugin of installed) {
    if (seen.has(plugin.pluginId)) continue;
    seen.add(plugin.pluginId);
    out.push({ pluginId: plugin.pluginId, servers: await readInstalledMcpServers(plugin.packageRoot) });
  }
  return out;
}

export interface TokenImportLog {
  info(message: string): void;
  warn(message: string): void;
}

export interface ImportAgentPluginAccessTokensFromEnvDeps extends ImportAgentPluginAccessTokenDeps {
  /** Injected for tests. Defaults to {@link listInstalledAgentPluginServers}. */
  readonly listPlugins?: () => Promise<readonly InstalledAgentPluginServers[]>;
}

/** The env declarations of every token-auth server across the installed plugins. */
function envDeclarations(plugins: readonly InstalledAgentPluginServers[]) {
  return plugins.flatMap(({ pluginId, servers }) =>
    Object.values(servers).flatMap((config) => (config.type !== "stdio" && config.tovuTokenAuth ? [{ pluginId, auth: config.tovuTokenAuth }] : [])),
  );
}

/**
 * Boot: for each installed plugin whose token-auth server names `importFromEnv`, copies a set env
 * token onto its row (logged once, on the boot that copies it — later boots find the row connected
 * and say nothing), and names any set `retiredEnv` vars as no longer used. Never throws: a failed
 * import is a warning and the next boot tries again.
 *
 * @complexity O(p·s) over installed plugins and their servers, plus one import per set env token.
 */
export async function importAgentPluginAccessTokensFromEnv(
  deps: ImportAgentPluginAccessTokensFromEnvDeps,
  env: Readonly<Record<string, string | undefined>>,
  log: TokenImportLog,
): Promise<void> {
  let plugins: readonly InstalledAgentPluginServers[];
  try {
    plugins = await (deps.listPlugins ?? (() => listInstalledAgentPluginServers(deps.workspaceId)))();
  } catch (err) {
    log.warn(`[agent-plugins] could not list plugins to import env tokens: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  for (const { pluginId, auth } of envDeclarations(plugins)) {
    const retiredSet = (auth.retiredEnv ?? []).filter((name) => (env[name] ?? "").trim() !== "");
    if (retiredSet.length > 0) {
      log.info(`[agent-plugins] ${retiredSet.join(", ")} ${retiredSet.length === 1 ? "is" : "are"} no longer used; the '${pluginId}' plugin's connection replaces them. You can remove them.`);
    }
    const token = auth.importFromEnv ? (env[auth.importFromEnv] ?? "").trim() : "";
    if (!auth.importFromEnv || token === "") continue;
    try {
      const outcome = await importAgentPluginAccessToken(deps, { pluginId, token });
      if (outcome === "saved") {
        log.info(`[agent-plugins] copied ${auth.importFromEnv} onto the '${pluginId}' plugin's connection and switched it on. The env var is no longer needed.`);
      }
    } catch (err) {
      log.warn(`[agent-plugins] could not copy ${auth.importFromEnv} onto the '${pluginId}' plugin: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
