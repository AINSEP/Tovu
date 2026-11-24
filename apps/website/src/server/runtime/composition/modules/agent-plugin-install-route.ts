import { agentPluginInstallZipRoute, agentPluginUpdateZipRoute, type AgentPluginInstallRouteDeps, type AgentPluginUpdateTarget } from "@jini-ai/cms/admin-http/routes/agent-plugins/install";
import { isAgentPluginName } from "@jini-ai/agent-plugins/lifecycle";
import { createAgentPluginUpdateEffects, requireUpdateMcpDeps } from "#src/features/agent-plugins/update-effects";
import { maxAgentPluginInstallArchiveBytes } from "#src/features/agent-plugins/lifecycle";
import { installUploadedAgentPlugin } from "#src/features/agent-plugins/install-upload";
import { loadAgentPluginSearchCandidates } from "#src/features/agent-plugins/tool-registrations";
import { mountAdminRawRoute } from "#src/server/inbound/admin-http/admin-raw-route-ports";
import type { AgentPluginsRouteDeps, AgentPluginsRouteRegistrar } from "#src/server/inbound/admin-http/routes/agent-plugins/deps";
import { bodyParseRefusal, installedAgentPluginRow, knownInstallRefusal } from "#src/server/inbound/admin-http/routes/agent-plugins/install-response";

/**
 * @file K1 (RT-K1-adm-agent-plugins-4, w4-routes batch L): registrar for `AGENT_PLUGIN_INSTALL_ZIP` and
 * `AGENT_PLUGIN_UPDATE_ZIP` (Jini `@jini-ai/cms/admin-http/routes/agent-plugins/install`; the route's
 * own header carries the contract). Binds Tovu's installer, read model, refusal copy and the Agent
 * Plugins name grammar. Mounted with `mountAdminRawRoute` behind the default `"guarded"` ports
 * (`authorizeOrRespond`, as the hand-written route called it) and NO `express.raw` ahead of the mount:
 * the spec reads the zip through `raw.readBody` after its gates, so no unauthorized request gets its
 * body parsed. An unrecognised failure is `adminFailureResponse`'s operation-only 500 under
 * `routes/agent-plugins/install-response`, the copy `installErrorResponse` wrote. Wire pinned by
 * `agent-plugin-install-zip.wire.integration.test.ts`.
 */

const FAILURE = { failure: { operation: "routes/agent-plugins/install-response" }, failureCopy: "operation" as const };

/** The installer's optional ports; an update adds its MCP effects and settings-snapshot owner. */
function installOptions(required: { deps: AgentPluginsRouteDeps; actor: string }, optional: { update?: AgentPluginUpdateTarget } = {}) {
  const { deps, actor } = required;
  const base = { layout: deps.agentPluginLayout, pluginHost: deps.pluginHost };
  if (!optional.update) return base;
  return { ...base, mcpProvisioning: createAgentPluginUpdateEffects({ deps: requireUpdateMcpDeps({ deps }), actor }), snapshotSettings: deps.snapshotAgentPluginSettings };
}

/** The spec's collaborators, bound to this site's deps. @complexity O(1). */
function installRouteDeps({ deps }: { deps: AgentPluginsRouteDeps }, _optional: Record<string, never> = {}): AgentPluginInstallRouteDeps {
  return {
    maxArchiveBytes: maxAgentPluginInstallArchiveBytes(),
    isPluginName: ({ value }) => isAgentPluginName({ value }),
    installUpload: async ({ archive, update, ...upload }) => {
      const target = update ? { update } : {};
      const result = await installUploadedAgentPlugin({ ...upload, archive: Buffer.isBuffer(archive) ? archive : Buffer.from(archive), workspaceId: deps.workspaceId, ...target },
        installOptions({ deps, actor: upload.actor }, target));
      return { pluginId: result.plugin.pluginId, alreadyInstalled: result.alreadyInstalled, ...(result.warnings === undefined ? {} : { warnings: result.warnings }) };
    },
    installedRow: async ({ pluginId }) => installedAgentPluginRow({ candidate: (await loadAgentPluginSearchCandidates(deps)).find((entry) => entry.pluginId === pluginId) }),
    // The same two refusals the raw parser's errors mapped to: over the cap is the 413, anything else unreadable.
    bodyRefusal: ({ refusal }) => bodyParseRefusal({ parseError: { type: refusal.reason === "too-large" ? "entity.too.large" : refusal.reason } }),
    installRefusal: ({ error }) => {
      const refusal = knownInstallRefusal({ error });
      // Operator-side log line, only for refusals whose real cause must not reach the client.
      if (refusal?.warning) console.warn(refusal.warning);
      return refusal;
    },
  };
}

/** Mount both upload routes on the shared spec deps. @complexity O(1) setup. */
export const registerAgentPluginInstallRoute: AgentPluginsRouteRegistrar = ({ app, deps }, _options = {}) => {
  const routeDeps = { ...installRouteDeps({ deps }), workspaceId: deps.workspaceId, authorize: deps.authorize };
  mountAdminRawRoute({ app, spec: agentPluginInstallZipRoute, deps: routeDeps }, FAILURE);
  mountAdminRawRoute({ app, spec: agentPluginUpdateZipRoute, deps: routeDeps }, FAILURE);
};
