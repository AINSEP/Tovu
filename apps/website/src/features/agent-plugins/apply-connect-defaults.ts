import { nowIso as clockNowIso } from "@jini-ai/core/primitives";
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
 *   written for one endpoint never land on a row an operator pointed somewhere else;
 * - no operator turned the plugin off (a seeder's default-off record does not count).
 *
 * Architectural role:
 * `features/agent-plugins` business rule, implementing `external-mcp-oauth.ts`'s `onConnected` port.
 * Wired where the OAuth service is composed (`composition/app.ts`, `composition/deps.ts`,
 * `agent-daemon-server.ts`).
 */
import {
  notifyExternalMcpRosterChanged,
  type ExternalMcpStoreDeps,
} from "#src/assistant/index";

import { agentPluginActivations } from "./activation-effects.js";
import { findAgentPluginMcpServerDefaults, isEmptyJsonList, resolveAgentPluginMcpServers } from "./federate-mcp.js";
import type { McpServerConfig } from "./mcp-metadata.js";
import type { AgentPluginLayout } from "./layout.js";
import { setAgentPluginEnabled } from "./set-enabled.js";

/** Recorded as the plugin activation's `updatedBy` and the row's write-grant attribution: the grant
 *  came from the plugin's declaration, at a sign-in, not from a Settings save. */
const CONNECT_DEFAULTS_ACTOR = "system:connect-defaults";

/** `activation.ts`'s seeder actor: its disabled record is the default, not an operator decision. */
export const SEED_ACTOR = "system:seed";

/** Whether `pluginId`'s activation record is a disabled one someone other than the seeder wrote.
 *  Shared with `switch-on-saved-token.ts`. @complexity One activations read. */
export async function isPluginOffByOperator(input: { workspaceId: string; agentPluginLayout: AgentPluginLayout; pluginId: string }, _options = {}): Promise<boolean> {
  const activations = await agentPluginActivations.readAgentPluginActivations({ workspaceRoot: input.agentPluginLayout.forWorkspace(input.workspaceId).root });
  if (!Object.hasOwn(activations.plugins, input.pluginId)) return false;
  const record = activations.plugins[input.pluginId];
  return record?.enabled === false && record.updatedBy !== SEED_ACTOR;
}

export interface ApplyConnectDefaultsDeps extends Pick<ExternalMcpStoreDeps, "repo" | "clock"> {
  readonly workspaceId: string;
  readonly agentPluginLayout: AgentPluginLayout;
  /** Injected for tests. Defaults to `federate-mcp.ts`'s `resolveAgentPluginMcpServers`. */
  readonly resolveServers?: (input: { workspaceId: string; pluginId: string }) => Promise<Readonly<Record<string, McpServerConfig>>>;
  /** Injected for tests. Defaults to `set-enabled.ts`'s `setAgentPluginEnabled(…, enabled: true)`. */
  readonly enablePlugin?: (input: { workspaceId: string; pluginId: string; actor: string }) => Promise<unknown>;
  /** Injected for tests. Defaults to `notifyExternalMcpRosterChanged`. */
  readonly notifyRosterChanged?: () => Promise<void>;
  /** Injected for tests. Defaults to {@link isPluginOffByOperator} on this workspace's activations. */
  readonly isPluginOffByOperator?: (pluginId: string) => Promise<boolean>;
}

/**
 * Builds the `onConnected(serverId)` port.
 *
 * @throws Whatever the repo or plugin-activation write throws; the OAuth service logs it without
 * failing the sign-in.
 * @complexity O(s) in the plugin's declared server count, plus one row write and one activation write.
 */
export function createApplyConnectDefaults(deps: ApplyConnectDefaultsDeps): (serverId: string) => Promise<void> {
  const resolveServers = deps.resolveServers ?? ((input: { workspaceId: string; pluginId: string }) => resolveAgentPluginMcpServers({ ...input, agentPluginLayout: deps.agentPluginLayout }));
  const enablePlugin =
    deps.enablePlugin ?? ((input: { workspaceId: string; pluginId: string; actor: string }) => setAgentPluginEnabled({ ...input, agentPluginLayout: deps.agentPluginLayout, enabled: true }));
  const notifyRosterChanged = deps.notifyRosterChanged ?? (() => notifyExternalMcpRosterChanged());
  const isOff = deps.isPluginOffByOperator ?? ((pluginId: string) => isPluginOffByOperator({ workspaceId: deps.workspaceId, agentPluginLayout: deps.agentPluginLayout, pluginId }));

  return async (serverId) => {
    const row = await deps.repo.findByServerId({ workspaceId: deps.workspaceId, serverId });
    const pluginId = row?.provisionedByPluginId;
    if (!row || !pluginId) return;
    if (!isEmptyJsonList(row.allowedToolNames) || !isEmptyJsonList(row.writeAllowedToolNames)) return;

    const defaults = findAgentPluginMcpServerDefaults(await resolveServers({ workspaceId: deps.workspaceId, pluginId }), row);
    // A read-only declaration is classification, not permission to change sign-in grants.
    if (!defaults?.allow) return;
    // A sign-in is not an "on" switch: an operator's explicit plugin-off stays off, exactly as on
    // the saved-token path (`switch-on-saved-token.ts`). The sign-in itself still completes.
    if (await isOff(pluginId)) return;

    // Plugin first: if this throws, nothing is written and the next sign-in tries again. The row
    // write is the step that makes a retry a no-op, so it goes last.
    await enablePlugin({ workspaceId: deps.workspaceId, pluginId, actor: CONNECT_DEFAULTS_ACTOR });
    const nowIso = clockNowIso({ clock: deps.clock });
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
