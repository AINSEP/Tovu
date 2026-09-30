import { resolveTarget, saveStaticAccessToken, type AgentPluginTokenTargetDeps } from "./access-token-tool.js";
import { preferBundledAgentPluginDigests, readBundledAgentPluginDigests } from "./bundled-digests.js";
import { readInstalledMcpServers } from "./capability-projection.js";
import { hasStoredAgentPluginCredential } from "./connect-tool.js";
import { resolveAgentPluginLayout } from "./layout.js";
import type { McpServerConfig } from "./manifest.js";
import { listInstalledPlugins } from "./resolve-agent-plugin-refs.js";
import { AGENT_PLUGINS_SCREEN, switchOnSavedTokenConnection, type SwitchOnSavedTokenDeps } from "./switch-on-saved-token.js";

/**
 * @file Saves an access token that did NOT come through `agent_plugin_set_access_token`'s form onto
 * an Agent Plugin's token-auth row, then switches the plugin on (`switch-on-saved-token.ts`, shared
 * with the tool) — the same end state as a pasted token followed by a first sign-in.
 *
 * Two callers, both at boot (`server/runtime/boot/bootstrap.ts`):
 * - {@link importAgentPluginAccessTokensFromEnv}: a plugin's `mcp.json` may name an old env var
 *   (`tovuTokenAuth.importFromEnv`) whose token is copied over. Added 2026-09-29 when the Supabase
 *   env preset (`TOVU_SUPABASE_MCP_*`) was retired in favour of the Supabase plugin.
 * - create-site onboarding's pending tokens (`composition/pending-agent-plugin-tokens.ts`).
 *
 * Never overwrites: a row that already holds a credential (a sign-in or a saved token) is left alone.
 * Not probed: the env token was already in use, and onboarding probes before it seals.
 *
 * The env import trusts only what THIS Tovu build shipped: a declaration is read from a plugin only
 * when its installed digest is the one `seed-bundled.ts` recorded (`bundled-digests.ts`), and the
 * token only goes to a row still at that declaration's URL. Any installed package can declare
 * `importFromEnv`, so without this an operator-installed plugin could name `OPENAI_API_KEY` and an
 * endpoint of its own and be handed that secret at boot (Codex review 2026-09-29).
 */

/** Recorded as `updatedBy`/principal on what an import writes. */
export const AGENT_PLUGIN_TOKEN_IMPORT_ACTOR = "system:token-import";

export interface ImportAgentPluginAccessTokenDeps
  extends AgentPluginTokenTargetDeps,
    Pick<SwitchOnSavedTokenDeps, "onConnected" | "isPluginOffByOperator"> {}

/** `saved-left-off`: the token is saved but an operator had turned the plugin or its connection off,
 *  so it stays off (`switch-on-saved-token.ts`). */
export type ImportAgentPluginAccessTokenOutcome = "saved" | "saved-left-off" | "already-connected";

/**
 * Seals `token` onto `pluginId`'s token-auth row unless that row already has a credential.
 *
 * @throws {import("@jini-ai/core").ToolInputError} Plugin not installed, or no single token-auth server.
 * @throws Whatever the store throws on save (e.g. an unconfigured secret store).
 * @complexity O(s) in the plugin's declared servers, plus one row read and at most two writes.
 */
export async function importAgentPluginAccessToken(
  deps: ImportAgentPluginAccessTokenDeps,
  input: {
    readonly pluginId: string;
    readonly token: string;
    readonly principalId?: string;
    /** When set, the token is saved only onto a row at exactly this URL (the env import's rule). */
    readonly onlyAtUrl?: string;
  },
): Promise<ImportAgentPluginAccessTokenOutcome> {
  const principalId = input.principalId ?? AGENT_PLUGIN_TOKEN_IMPORT_ACTOR;
  const target = await resolveTarget(deps, input.pluginId, principalId);
  const row = await deps.externalMcpServerRepo.findByServerId({ workspaceId: deps.workspaceId, serverId: target.connectionId });
  if (row && hasStoredAgentPluginCredential(row)) return "already-connected";
  if (input.onlyAtUrl !== undefined && (row?.url ?? target.config.url) !== input.onlyAtUrl) {
    throw new Error(`its '${target.connectionId}' connection points at a different URL than the '${input.pluginId}' plugin declares, so the token is not copied there`);
  }

  await saveStaticAccessToken(deps, target, principalId, input.token);
  const switched = await switchOnSavedTokenConnection(deps, target);
  return switched.state === "on" ? "saved" : "saved-left-off";
}

/** One installed plugin's id and declared servers. */
export interface InstalledAgentPluginServers {
  readonly pluginId: string;
  readonly servers: Readonly<Record<string, McpServerConfig>>;
  /** True only when this is the digest this Tovu build seeded for the id (`bundled-digests.ts`).
   *  Absent reads as not bundled. */
  readonly bundled?: boolean;
}

/** Every installed plugin in the workspace, one per id (the bundled-preferred digest). */
export async function listInstalledAgentPluginServers(workspaceId: string): Promise<readonly InstalledAgentPluginServers[]> {
  const workspaceLayout = resolveAgentPluginLayout().forWorkspace(workspaceId);
  const ledger = await readBundledAgentPluginDigests(workspaceLayout.root);
  const installed = preferBundledAgentPluginDigests(await listInstalledPlugins(workspaceLayout.packages), ledger);
  const seen = new Set<string>();
  const out: InstalledAgentPluginServers[] = [];
  for (const plugin of installed) {
    if (seen.has(plugin.pluginId)) continue;
    seen.add(plugin.pluginId);
    out.push({ pluginId: plugin.pluginId, servers: await readInstalledMcpServers(plugin.packageRoot), bundled: ledger.get(plugin.pluginId) === plugin.archiveDigest });
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

/** The env declarations of every token-auth server across the BUNDLED plugins (see this file's header). */
function envDeclarations(plugins: readonly InstalledAgentPluginServers[]) {
  return plugins.flatMap(({ pluginId, servers, bundled }) =>
    bundled === true
      ? Object.values(servers).flatMap((config) => (config.type !== "stdio" && config.tovuTokenAuth ? [{ pluginId, url: config.url, auth: config.tovuTokenAuth }] : []))
      : [],
  );
}

/**
 * Boot: for each bundled plugin whose token-auth server names `importFromEnv`, copies a set env
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

  for (const { pluginId, url, auth } of envDeclarations(plugins)) {
    const retiredSet = (auth.retiredEnv ?? []).filter((name) => (env[name] ?? "").trim() !== "");
    if (retiredSet.length > 0) {
      log.info(`[agent-plugins] ${retiredSet.join(", ")} ${retiredSet.length === 1 ? "is" : "are"} no longer used; the '${pluginId}' plugin's connection replaces them. You can remove them.`);
    }
    const token = auth.importFromEnv ? (env[auth.importFromEnv] ?? "").trim() : "";
    if (!auth.importFromEnv || token === "") continue;
    try {
      const outcome = await importAgentPluginAccessToken(deps, { pluginId, token, onlyAtUrl: url });
      if (outcome === "saved") {
        log.info(`[agent-plugins] copied ${auth.importFromEnv} onto the '${pluginId}' plugin's connection and switched it on. The env var is no longer needed.`);
      } else if (outcome === "saved-left-off") {
        log.info(`[agent-plugins] copied ${auth.importFromEnv} onto the '${pluginId}' plugin's connection; it stays off because an operator turned it off (${AGENT_PLUGINS_SCREEN}). The env var is no longer needed.`);
      }
    } catch (err) {
      log.warn(`[agent-plugins] could not copy ${auth.importFromEnv} onto the '${pluginId}' plugin: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
