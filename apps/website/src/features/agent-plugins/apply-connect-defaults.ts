/**
 * @file Grants a plugin's declared default tools (`mcp.json`'s `tovuDefaultTools`, parsed by
 * `manifest.ts`) on the operator's FIRST successful sign-in to a server that plugin provisioned — so
 * connecting is the only step, with no trip to Settings to tick tools.
 *
 * `federate-mcp.ts` rule 3 ("provisioning is not authorization") still holds: provisioning writes a
 * disabled row with empty lists, and only the human's own sign-in, which is what calls this, turns
 * the declared defaults on.
 *
 * Applied only when ALL of these hold, and otherwise nothing is written:
 * - the row names a provisioning plugin (`provisionedByPluginId`), so an operator's own row is never
 *   touched;
 * - both tool lists are still empty, so a row the operator already edited is never touched, and a
 *   second sign-in (lists now filled) is a no-op;
 * - the installed plugin still declares a server that maps to this row at the SAME url, so defaults
 *   written for one endpoint never land on a row an operator pointed somewhere else.
 *
 * Architectural role:
 * `features/agent-plugins` business rule, implementing `external-mcp-oauth.ts`'s `onConnected` port.
 * Wired where the OAuth service is composed (`composition/app.ts`, `composition/deps.ts`,
 * `agent-daemon-server.ts`).
 */
import {
  notifyExternalMcpRosterChanged,
  type ExternalMcpServerRecord,
  type ExternalMcpStoreDeps,
} from "#src/assistant/index";

import { deriveAgentPluginConnectionId, isEmptyJsonList, resolveAgentPluginMcpServers } from "./federate-mcp.js";
import type { AgentPluginDefaultTools, McpServerConfig } from "./manifest.js";
import { setAgentPluginEnabled } from "./set-enabled.js";

/** Recorded as the plugin activation's `updatedBy` and the row's write-grant attribution: the grant
 *  came from the plugin's declaration, at a sign-in, not from a Settings save. */
const CONNECT_DEFAULTS_ACTOR = "system:connect-defaults";

export interface ApplyConnectDefaultsDeps extends Pick<ExternalMcpStoreDeps, "repo" | "clock"> {
  readonly workspaceId: string;
  /** Injected for tests. Defaults to `federate-mcp.ts`'s `resolveAgentPluginMcpServers`. */
  readonly resolveServers?: (input: { workspaceId: string; pluginId: string }) => Promise<Readonly<Record<string, McpServerConfig>>>;
  /** Injected for tests. Defaults to `set-enabled.ts`'s `setAgentPluginEnabled(…, enabled: true)`. */
  readonly enablePlugin?: (input: { workspaceId: string; pluginId: string; actor: string }) => Promise<unknown>;
  /** Injected for tests. Defaults to `notifyExternalMcpRosterChanged`. */
  readonly notifyRosterChanged?: () => Promise<void>;
}

/** The declared defaults for this row, or `null` when the plugin no longer declares a remote server
 *  mapping to it at the row's url.
 *  @complexity O(s) in the plugin's declared server count. */
function findDeclaredDefaults(
  servers: Readonly<Record<string, McpServerConfig>>,
  row: ExternalMcpServerRecord,
): AgentPluginDefaultTools | null {
  for (const [serverKey, config] of Object.entries(servers)) {
    if (config.type === "stdio" || deriveAgentPluginConnectionId(serverKey) !== row.serverId) continue;
    return config.url === row.url && config.tovuDefaultTools ? config.tovuDefaultTools : null;
  }
  return null;
}

/**
 * Builds the `onConnected(serverId)` port.
 *
 * @throws Whatever the repo or plugin-activation write throws; the OAuth service logs it without
 * failing the sign-in.
 * @complexity O(s) in the plugin's declared server count, plus one row write and one activation write.
 */
export function createApplyConnectDefaults(deps: ApplyConnectDefaultsDeps): (serverId: string) => Promise<void> {
  const resolveServers = deps.resolveServers ?? resolveAgentPluginMcpServers;
  const enablePlugin =
    deps.enablePlugin ?? ((input: { workspaceId: string; pluginId: string; actor: string }) => setAgentPluginEnabled({ ...input, enabled: true }));
  const notifyRosterChanged = deps.notifyRosterChanged ?? (() => notifyExternalMcpRosterChanged());

  return async (serverId) => {
    const row = await deps.repo.findByServerId({ workspaceId: deps.workspaceId, serverId });
    const pluginId = row?.provisionedByPluginId;
    if (!row || !pluginId) return;
    if (!isEmptyJsonList(row.allowedToolNames) || !isEmptyJsonList(row.writeAllowedToolNames)) return;

    const defaults = findDeclaredDefaults(await resolveServers({ workspaceId: deps.workspaceId, pluginId }), row);
    if (!defaults) return;

    // Plugin first: if this throws, nothing is written and the next sign-in tries again. The row
    // write is the step that makes a retry a no-op, so it goes last.
    await enablePlugin({ workspaceId: deps.workspaceId, pluginId, actor: CONNECT_DEFAULTS_ACTOR });
    const nowIso = deps.clock.nowIso();
    // Direct repo write, the same reason `federate-mcp.ts`'s adoption gives: every other field
    // (url, auth, the token this sign-in just stored) must stay exactly as it is.
    await deps.repo.upsert({
      ...row,
      enabled: true,
      allowedToolNames: JSON.stringify(defaults.allow),
      writeAllowedToolNames: JSON.stringify(defaults.write),
      writeGrantsUpdatedByPrincipalId: CONNECT_DEFAULTS_ACTOR,
      writeGrantsUpdatedAt: nowIso,
      updatedAt: nowIso,
    });
    await notifyRosterChanged();
  };
}
