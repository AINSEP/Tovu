/** Tovu compatibility shim (A8 seam, A9 move). The portable body lives in `@jini-ai/agent-plugins/connect` and
 * requires the host's projection pair, activation owner, server resolution and actor ids. Tovu's
 * activation glue (operator-off read, locked switch-on, the `system:*` actor ids) stays here, beside
 * the activation owner it binds; only these legacy entries, whose frozen callers pass none of them,
 * bind Tovu's. A caller that already carries projections keeps its own pair. */
import { createApplyConnectDefaults as createWithPorts, recordAgentPluginAccessDeclined as recordDeclinedWithActor, type AgentPluginConnectActors, type ApplyConnectDefaultsDeps as PortableApplyConnectDefaultsDeps } from '@jini-ai/agent-plugins/connect';
import { tovuEnableAccessMessages } from './enable-access.js';
import { withAgentPluginMcpPorts, withOverrides } from './mcp-host-bindings.js';
import type { AgentPluginMcpContext } from './service-ports.js';
// activation.ts was deleted; Jini owns the lifecycle, this host binding owns its effects.
import { agentPluginActivations } from "./activation-effects.js";
import { resolveAgentPluginMcpServers } from "./federate-mcp.js";
import type { AgentPluginLayout } from "./layout.js";
import { setAgentPluginEnabled } from "./set-enabled.js";

export const CONNECT_DECLINED_ACTOR = "system:connect-declined";

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

/**
 * Makes sure `pluginId`'s activation is on: no record and an "on" record already read as on (nothing
 * is written); the seeder's own disabled record is switched on (decided under the activations lock,
 * so an operator toggle racing it wins); anyone else's disabled record is an operator's "off" and
 * stays. Shared with `switch-on-saved-token.ts`, which needs it on top of connect defaults (they skip a
 * row an operator already set up and so never reach the plugin's activation). EVERY state goes through
 * `setAgentPluginEnabled`, so every one keeps the checks a switch has (installed, host-compatible, no
 * pending update, not a provider plugin's linked face, whose provider's switch decides:
 * `provider-plugin-link.ts`) before anything is granted; only its write is the locked conditional one.
 * @returns false when an operator's "off" stopped it.
 * @throws What `setAgentPluginEnabled` refuses with (`AgentPluginLinkedError`, not installed, incompatible, pending update).
 * @complexity One plugin-locked switch, at most one locked write.
 */
export async function switchPluginOnUnlessOperatorOff(input: { workspaceId: string; agentPluginLayout: AgentPluginLayout; pluginId: string }, _options = {}): Promise<boolean> {
  const result = await setAgentPluginEnabled({ workspaceId: input.workspaceId, agentPluginLayout: input.agentPluginLayout, pluginId: input.pluginId, enabled: true, actor: CONNECT_DEFAULTS_ACTOR }, { unlessOperatorDisabled: true });
  return result.enabled;
}

/** Tovu's saved actor ids for the portable connect bodies (bytes unchanged). */
export const tovuConnectActors: AgentPluginConnectActors = { connectDefaults: CONNECT_DEFAULTS_ACTOR, connectDeclined: CONNECT_DECLINED_ACTOR };

export type ApplyConnectDefaultsDeps = Omit<PortableApplyConnectDefaultsDeps, 'projections' | 'classifyError' | 'resolveServers' | 'enablePlugin' | 'isPluginOffByOperator' | 'actors' | 'combinedGrantRejected'> & AgentPluginMcpContext & {
  readonly agentPluginLayout: AgentPluginLayout;
  /** Injected for tests. Defaults to `federate-mcp.ts`'s `resolveAgentPluginMcpServers`. */
  readonly resolveServers?: PortableApplyConnectDefaultsDeps['resolveServers'];
  /** Injected for tests. Defaults to {@link switchPluginOnUnlessOperatorOff}; `false` means an
   *  operator's "off" stopped it, and nothing is granted. */
  readonly enablePlugin?: PortableApplyConnectDefaultsDeps['enablePlugin'];
  /** Injected for tests. Defaults to {@link isPluginOffByOperator} on this workspace's activations. */
  readonly isPluginOffByOperator?: (pluginId: string) => Promise<boolean>;
};

export function createApplyConnectDefaults(deps: ApplyConnectDefaultsDeps, options: Parameters<typeof createWithPorts>[1] = {}): (serverId: string) => Promise<void> {
  return createWithPorts(withOverrides(withAgentPluginMcpPorts(deps), {
    resolveServers: deps.resolveServers ?? ((input: { workspaceId: string; pluginId: string }) => resolveAgentPluginMcpServers({ ...input, agentPluginLayout: deps.agentPluginLayout })),
    enablePlugin: deps.enablePlugin ?? ((input: { workspaceId: string; pluginId: string }) => switchPluginOnUnlessOperatorOff({ ...input, agentPluginLayout: deps.agentPluginLayout })),
    isPluginOffByOperator: deps.isPluginOffByOperator ?? ((pluginId: string) => isPluginOffByOperator({ workspaceId: deps.workspaceId, agentPluginLayout: deps.agentPluginLayout, pluginId })),
    actors: tovuConnectActors,
    combinedGrantRejected: tovuEnableAccessMessages.combinedGrantRejected,
  }), options);
}

export function recordAgentPluginAccessDeclined(input: Omit<Parameters<typeof recordDeclinedWithActor>[0], 'actorId'>, _options = {}): Promise<void> {
  return recordDeclinedWithActor({ ...input, actorId: CONNECT_DECLINED_ACTOR });
}
