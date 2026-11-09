/** Tovu compatibility signatures for declared-tool healing. The portable body takes required
 * projection/actor/activation owners; these legacy entries bind the same existing Tovu owners,
 * diagnostic sink and plugins_set_enabled retry copy. No second activation queue or MCP store. */
import type { Clock as ClockPort } from '@jini-ai/core/primitives';
import {
  grantDeclaredToolsToSignedInRows as grantWithPorts, grantDeclaredToolsAtBoot as bootWithPorts,
  type GrantSignedInDefaultsDeps as PortableGrantDeps,
} from '@jini-ai/agent-plugins/connect';
import { agentPluginActivations } from './activation-effects.js';
import { tovuConnectActors, isPluginOffByOperator, switchPluginOnUnlessOperatorOff } from './apply-connect-defaults.js';
import { resolveAgentPluginMcpServers } from './federate-mcp.js';
import { listInstalledAgentPluginServers, type InstalledAgentPluginServers, type TokenImportLog } from './import-access-token.js';
import { withAgentPluginMcpPorts, withOverrides } from './mcp-host-bindings.js';
import type { AgentPluginLayout } from './layout.js';
import type { AgentPluginMcpContext, AgentPluginMcpPort } from './service-ports.js';

export type GrantSignedInDefaultsDeps = AgentPluginMcpContext & {
  readonly workspaceId: string;
  readonly agentPluginLayout: AgentPluginLayout;
  readonly repo: AgentPluginMcpPort['repo'];
  readonly applyAccess: AgentPluginMcpPort['applyAccess'];
  readonly clock: ClockPort;
  /** The assistant's roster-reload port, so a granted row's tools load without a restart. */
  readonly notifyRosterChanged: () => Promise<void>;
  /** Injected for tests. Defaults to the sign-in's own grant, `createApplyConnectDefaults`. */
  readonly onConnected?: (serverId: string) => Promise<void>;
  /** Defaults to `console.warn`. A failed grant is reported with its real cause, never thrown. */
  readonly warn?: (message: string) => void;
};

/** Existing connect-defaults host binding, preserving the grant's explicit field selection. */
function tovuGrantDeps(deps: GrantSignedInDefaultsDeps): PortableGrantDeps {
  const warn = deps.warn ?? ((message: string) => console.warn(message));
  return withOverrides(withAgentPluginMcpPorts(deps), {
    resolveServers: (input: { workspaceId: string; pluginId: string }) => resolveAgentPluginMcpServers({ ...input, agentPluginLayout: deps.agentPluginLayout }),
    enablePlugin: (input: { workspaceId: string; pluginId: string; actor: string }) => switchPluginOnUnlessOperatorOff({ ...input, agentPluginLayout: deps.agentPluginLayout }),
    isPluginOffByOperator: (pluginId: string) => isPluginOffByOperator({ workspaceId: deps.workspaceId, agentPluginLayout: deps.agentPluginLayout, pluginId }),
    actors: tovuConnectActors,
    warn,
    approvedFailure: ({ connectionId, detail }: { connectionId: string; detail: string }) => `The plugin is on, but '${connectionId}' could not load its approved tools. Request plugins_set_enabled again to retry. Details: ${detail}`,
  });
}

/** Existing enable/sign-in signature; projections and approved key/principal pass through whole. */
export function grantDeclaredToolsToSignedInRows(
  required: Omit<Parameters<typeof grantWithPorts>[0], 'deps'> & { readonly deps: GrantSignedInDefaultsDeps },
  optional: Parameters<typeof grantWithPorts>[1] = {},
): Promise<readonly string[]> {
  return grantWithPorts({ ...required, deps: tovuGrantDeps(required.deps) }, optional);
}

/** Existing boot signature. One installed listing followed by one activation snapshot. */
export function grantDeclaredToolsAtBoot(
  deps: GrantSignedInDefaultsDeps & { readonly listPlugins?: () => Promise<readonly InstalledAgentPluginServers[]> },
  log: TokenImportLog,
): Promise<void> {
  return bootWithPorts({ deps: withOverrides(tovuGrantDeps(deps), {
    listPlugins: () => (deps.listPlugins ?? (() => listInstalledAgentPluginServers(deps)))(),
    readActivations: () => agentPluginActivations.readAgentPluginActivations({ workspaceRoot: deps.agentPluginLayout.forWorkspace(deps.workspaceId).root }),
  }), log });
}
