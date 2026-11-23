import { agentPluginFilesRoute } from "@jini-ai/cms/admin-http/routes/agent-plugins/files";
import { agentPluginsListRoute } from "@jini-ai/cms/admin-http/routes/agent-plugins/list";
import { agentPluginSetEnabledRoute } from "@jini-ai/cms/admin-http/routes/agent-plugins/set-enabled";
import {
  AgentPluginActivationsBusyError, AgentPluginActivationsUnreadableError, AgentPluginHostIncompatibleError, AgentPluginUpdateError,
} from "@jini-ai/agent-plugins/lifecycle";
import { PLUGIN_PACKAGE_FILE_LIMITS, readPluginPackageFiles } from "@jini-ai/plugins/host/node";
import { ToolAccessLoweringError } from "#src/assistant/external-mcp-roster-change";
import { describeErrorForLog } from "#src/contracts/core/model-facing-tool-errors";
import { loadAgentPluginConnectionStatuses } from "#src/features/agent-plugins/connection-status";
import { provisionAgentPluginMcpServers, resolveAgentPluginMcpServers } from "#src/features/agent-plugins/federate-mcp";
import { grantDeclaredToolsToSignedInRows } from "#src/features/agent-plugins/grant-signed-in-defaults";
import { listInstalledPlugins, preferBundledAgentPluginDigests, readBundledAgentPluginDigests } from "#src/features/agent-plugins/lifecycle";
import { agentPluginMcpPortsOf } from "#src/features/agent-plugins/mcp-host-bindings";
import { AgentPluginLinkedError, AgentPluginNotInstalledError, AgentPluginNotReadyError, setAgentPluginEnabled } from "#src/features/agent-plugins/set-enabled";
import { loadAgentPluginSearchCandidates } from "#src/features/agent-plugins/tool-registrations";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { AgentPluginsRouteDeps, AgentPluginsRouteRegistrar } from "#src/server/inbound/admin-http/routes/agent-plugins/deps";

/**
 * @file K1 (RT-K1-adm-agent-plugins): registrars for the `agent-plugins` admin routes that are Jini
 * route specs (`@jini-ai/cms/admin-http/routes/agent-plugins/{list,files,set-enabled}`), mounted
 * behind the admin ports. A sibling of `agent-plugins.ts` (which composes the module and still
 * imports the hand-written non-JSON routes: install upload, admin surfaces, connection sign-in,
 * memory). `AgentPluginsRouteDeps` is read only here: each mount builds that route's own small deps,
 * binding the host's read model, lifecycle owner, MCP provisioning, error classes and copy.
 *
 * All three hand-written routes used `authorizeOrRespond`, so all three mount `"guarded"`.
 */

/** The two port fields every mount passes; `authorize` is read per request (tests reassign it). */
function agentPluginPortDeps({ deps }: { deps: AgentPluginsRouteDeps }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** The unexpected-failure copy key (`sendAdminFailure`'s operation) each hand-written route used. */
function mountOptions(operation: string) {
  return { authorization: "guarded" as const, failure: { operation, code: "INTERNAL_ERROR" } };
}

/** The `instanceof` checks set-enabled's refusal ladder asks, bound from the real classes. */
const AGENT_PLUGIN_SET_ENABLED_ERRORS = {
  toolAccessLowering: (error: unknown): error is ToolAccessLoweringError => error instanceof ToolAccessLoweringError,
  hostIncompatible: (error: unknown): error is AgentPluginHostIncompatibleError => error instanceof AgentPluginHostIncompatibleError,
  update: (error: unknown): error is AgentPluginUpdateError => error instanceof AgentPluginUpdateError,
  notReady: (error: unknown): error is AgentPluginNotReadyError => error instanceof AgentPluginNotReadyError,
  linked: (error: unknown): error is AgentPluginLinkedError => error instanceof AgentPluginLinkedError,
  notInstalled: (error: unknown): error is AgentPluginNotInstalledError => error instanceof AgentPluginNotInstalledError,
  activationsUnreadable: (error: unknown): error is AgentPluginActivationsUnreadableError => error instanceof AgentPluginActivationsUnreadableError,
  activationsBusy: (error: unknown): error is AgentPluginActivationsBusyError => error instanceof AgentPluginActivationsBusyError,
};

/** Tovu's fixed, path-free text for the two activation-record faults (the host path stays in the log). */
const AGENT_PLUGIN_SET_ENABLED_COPY = {
  activationsUnreadable:
    "This workspace's Agent Plugin activation record (activations.json) could not be read, so nothing was changed. " +
    "No Agent Plugin can be enabled or disabled until it is repaired — the server log names the file and the fault.",
  activationsBusy:
    "Another Tovu process was changing this workspace's Agent Plugin activation record at the same moment, so " +
    "nothing was changed. Try again; if this keeps happening, the server log names the lock file.",
};

/**
 * Best-effort: provisions `pluginId`'s auto-admitted remote MCP servers into the external-MCP store
 * (create-if-absent, never touching an existing row — see `federate-mcp.ts`'s header), logging
 * rather than throwing on failure. Caller-gated to the enable path only; see this file's own header.
 */
async function provisionAgentPluginMcpServersBestEffort(
  deps: AgentPluginsRouteDeps,
  input: { readonly pluginId: string; readonly principalId: string },
): Promise<void> {
  try {
    const servers = await resolveAgentPluginMcpServers({ agentPluginLayout: deps.agentPluginLayout, workspaceId: deps.workspaceId, pluginId: input.pluginId });
    const result = await provisionAgentPluginMcpServers(
      deps.mcp,
      { workspaceId: deps.workspaceId, pluginId: input.pluginId, servers, principalId: input.principalId },
    );
    for (const failure of result.failed) {
      console.warn(`[agent-plugins] '${input.pluginId}': MCP provisioning for server '${failure.serverKey}' failed — ${failure.reason}`);
    }
    // An account signed in while the plugin was off gets the plugin's declared tools now: switching
    // on is the moment "on + connected" first holds (bug 2026-11-04, `grant-signed-in-defaults.ts`).
    await grantDeclaredToolsToSignedInRows({
      deps: { workspaceId: deps.workspaceId, agentPluginLayout: deps.agentPluginLayout, repo: deps.mcp.repo, applyAccess: deps.mcp.applyAccess, clock: deps.clock, notifyRosterChanged: () => deps.mcp.notifyRosterChanged({}, {}), ...agentPluginMcpPortsOf(deps.mcp) },
      pluginId: input.pluginId,
      servers,
    }, { skipServerKeys: result.failed.map((failure) => failure.serverKey) });
  } catch (error) {
    console.warn(
      `[agent-plugins] '${input.pluginId}': MCP provisioning could not run — ${describeErrorForLog({ err: error })}`,
    );
  }
}

/** `AGENT_PLUGINS_LIST`: the host's read model plus its per-plugin connection statuses. */
export const registerAgentPluginsListRoute: AgentPluginsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: agentPluginsListRoute, deps: {
    ...agentPluginPortDeps({ deps }),
    loadCandidates: () => loadAgentPluginSearchCandidates(deps),
    loadConnectionStatuses: () => loadAgentPluginConnectionStatuses({ workspaceId: deps.workspaceId,
      mcp: deps.externalMcpServerRepo, loadCards: deps.loadPluginCredentialCards, apiConnections: deps.apiConnections?.host, ...agentPluginMcpPortsOf(deps.mcp) }),
  } }, mountOptions("routes/agent-plugins/list"));
};

/** `AGENT_PLUGIN_SET_ENABLED`: the shared lifecycle owner (or the test override), enable-only provisioning. */
export const registerAgentPluginSetEnabledRoute: AgentPluginsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: agentPluginSetEnabledRoute, deps: {
    ...agentPluginPortDeps({ deps }),
    loadCandidates: () => loadAgentPluginSearchCandidates(deps),
    setEnabled: ({ pluginId, enabled, actor }) => (deps.setAgentPluginEnabled ?? setAgentPluginEnabled)({ agentPluginLayout: deps.agentPluginLayout, workspaceId: deps.workspaceId, pluginId, enabled, actor }),
    provisionMcpServers: ({ pluginId, principalId }) => provisionAgentPluginMcpServersBestEffort(deps, { pluginId, principalId }),
    notifyPluginLowered: ({ pluginId }) => deps.mcp.notifyRosterChanged({ lowered: { pluginIds: [pluginId] } }, {}),
    isError: AGENT_PLUGIN_SET_ENABLED_ERRORS,
    copy: AGENT_PLUGIN_SET_ENABLED_COPY,
    warn: (message) => { console.warn(message); },
  } }, mountOptions("routes/agent-plugins/set-enabled"));
};

/** `AGENT_PLUGIN_FILES`: the contained Node package-file reader over this workspace's layout. */
export const registerAgentPluginFilesRoute: AgentPluginsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: agentPluginFilesRoute, deps: {
    ...agentPluginPortDeps({ deps }),
    agentPluginLayout: { forWorkspace: (required) => deps.agentPluginLayout.forWorkspace(required) },
    // An upgraded bundled plugin's superseded package is dropped first, so this browses the
    // version the running build ships rather than whichever digest the walk reached first.
    listPluginPackages: async ({ workspaceRoot }) => preferBundledAgentPluginDigests(
      await listInstalledPlugins({ workspaceRoot }),
      await readBundledAgentPluginDigests({ workspaceRoot }),
    ),
    readPluginPackageFiles: (required) => readPluginPackageFiles(required),
    packageFileLimits: PLUGIN_PACKAGE_FILE_LIMITS,
  } }, mountOptions("routes/agent-plugins/files"));
};
