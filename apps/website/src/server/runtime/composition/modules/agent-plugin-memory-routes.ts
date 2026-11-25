import { agentPluginMemoryGetRoute, agentPluginMemoryPutRoute, type AgentPluginMemoryGetRouteDeps } from "@jini-ai/cms/admin-http/routes/agent-plugins/memory";
import { DEFAULT_PLUGIN_MEMORY_LIMITS } from "@jini-ai/agent-plugins/persistent-state";
import { containAgentPluginStatePath, listInstalledPlugins } from "#src/features/agent-plugins/lifecycle";
import { pluginMemory } from "#src/features/agent-plugins/memory";
import { mountAdminJsonRoute, type AdminJsonRouteMountOptions, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { AgentPluginsRouteDeps, AgentPluginsRouteRegistrar } from "#src/server/inbound/admin-http/routes/agent-plugins/deps";

/**
 * @file K1 (w3 C4): the `agent-plugins` memory routes — Jini `agentPluginMemory{Get,Put}Route`
 * (`@jini-ai/cms/admin-http/routes/agent-plugins/memory`) behind the admin ports. Kept apart from
 * `agent-plugins-routes.ts` so this registrar's import graph stays as small as the hand-written
 * route's was (its error test mocks the lifecycle and memory modules partially).
 *
 * Both hand-written routes used `authorizeOrRespond` (so `"guarded"`), named no entity type or id,
 * and read the session first (the note body is checked after the installed 404), so neither mount
 * defers a missing principal.
 */

/** `sendAdminFailure`'s operation and the decision source both hand-written routes used. */
const MEMORY_FAILURE: AdminJsonRouteMountOptions = { authorization: "guarded", failure: { operation: "routes/agent-plugins/memory", code: "INTERNAL_ERROR" } };

/** A Node system error (an `Error` with a string `code`): the note write's own incident, never a 422. */
const isNodeSystemError = ({ error }: { error: unknown }, _optional: Record<string, never> = {}) => error instanceof Error && 'code' in error && typeof error.code === 'string';

/** The memory store, the installed check and the caps both memory mounts bind. */
function agentPluginMemoryDeps({ deps }: { deps: AgentPluginsRouteDeps }, _optional: Record<string, never> = {}): AgentPluginMemoryGetRouteDeps & AdminJsonRoutePortDeps {
  return {
    workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params),
    isInstalled: async ({ pluginId }) => {
      const workspace = deps.agentPluginLayout.forWorkspace({ workspaceId: deps.workspaceId });
      return (await listInstalledPlugins({ workspaceRoot: workspace.root })).some(plugin => plugin.pluginId === pluginId);
    },
    openMemory: ({ pluginId }) => pluginMemory({ contain: containAgentPluginStatePath, workspaceId: deps.workspaceId, pluginId, layout: deps.agentPluginLayout }),
    memoryLimits: DEFAULT_PLUGIN_MEMORY_LIMITS,
  };
}

/**
 * The plugin memory read and the notes editor's write (Jini `agentPluginMemory{Get,Put}Route`),
 * GET then PUT as before. A Node system error from the note write keeps its own incident copy
 * (`agent-plugins:write-note`); only errors the bound `writeNote` itself threw are claimed, so a
 * failing list read still answers the route's own `routes/agent-plugins/memory` copy.
 */
export const registerAgentPluginMemoryRoutes: AgentPluginsRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  mountAdminJsonRoute({ errors, app, spec: agentPluginMemoryGetRoute, deps: agentPluginMemoryDeps({ deps }) },
    MEMORY_FAILURE);
  const noteWriteFaults = new WeakSet<object>();
  const memoryDeps = agentPluginMemoryDeps({ deps });
  mountAdminJsonRoute({ errors, app, spec: agentPluginMemoryPutRoute, deps: {
    ...memoryDeps,
    openMemory: (required) => {
      const memory = memoryDeps.openMemory(required);
      return { list: (args) => memory.list(args), writeNote: async (note) => {
        try { return await memory.writeNote(note); } catch (error) { if (error instanceof Object) noteWriteFaults.add(error); throw error; }
      } };
    },
    isSystemError: isNodeSystemError,
  } }, { ...MEMORY_FAILURE,
    failureFor: (error) => error instanceof Object && noteWriteFaults.has(error) ? { operation: "agent-plugins:write-note", message: "The note could not be saved." } : undefined,
  });
};
