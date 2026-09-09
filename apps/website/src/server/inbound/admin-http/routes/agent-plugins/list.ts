import { loadAgentPluginSearchCandidates } from "#src/features/agent-plugins/tool-registrations";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { AgentPluginsRouteRegistrar } from "./deps.js";

/**
 * @file `AGENT_PLUGINS_LIST` — `GET /api/admin/v1/workspaces/:workspaceId/agent-plugins` (2026-09-09).
 * A plain read, mirroring `plugins/list.ts`'s own shape (workspace-param check, `admin.plugins.read`
 * authorization, one JSON body, no gateway involvement — this is a read with nothing to route
 * through a change-set/outbox pipeline).
 *
 * ---------------------------------------------------------------------------
 * Why this reuses `loadAgentPluginSearchCandidates`, not a second read
 * ---------------------------------------------------------------------------
 * `search_agent_plugin_local` (`features/agent-plugins/tool-registrations.ts`) already resolves
 * "every installed Agent Plugin in this workspace, including disabled ones, with its skills and MCP
 * server ids" — exactly what the admin Agent Plugins screen needs to stop rendering the hardcoded
 * `TOVU_BUNDLED_AGENT_PLUGINS` catalog. Re-deriving that walk here (a second `listInstalledPlugins`
 * call, a second per-plugin skill/mcp.json read, a second single-digest-per-id policy) would give
 * the tool and this route two independent opinions about "what plugins are installed" that could
 * silently drift. This route instead calls the SAME loader and re-shapes its output for the wire —
 * one source of truth, two consumers (a tool and this HTTP surface), the pattern this feature's own
 * `listInstalledPlugins` doc already establishes for its own multiple callers.
 *
 * Permission: reuses `admin.plugins.read` rather than minting `admin.agent-plugins.read` — same
 * reasoning `tool-registrations.ts`'s `plugins_list` merge already gives for reusing this permission
 * across both plugin families: an operator who may see the site/runtime plugin list has no lesser
 * standing to see Agent Plugin ids/skills, and a second gate with an identical threat model would be
 * ceremony, not safety.
 *
 * SECURITY: no absolute host path reaches the response — `loadAgentPluginSearchCandidates` already
 * carries the same no-`packageRoot`-leak discipline `tool-registrations.ts`'s own header states for
 * `search_agent_plugin_local`, and this handler only re-shapes fields that loader already returns.
 */
export const registerAgentPluginsListRoute: AgentPluginsRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/agent-plugins", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      if (
        !(await authorizeOrRespond(res, deps.authorize, {
          principalId: principal.id,
          permission: "admin.plugins.read",
          workspaceId: deps.workspaceId,
        }))
      )
        return;

      const candidates = await loadAgentPluginSearchCandidates({ workspaceId: deps.workspaceId });

      res.json({
        agentPlugins: candidates.map((candidate) => ({
          pluginId: candidate.pluginId,
          version: candidate.version ?? null,
          description: candidate.description ?? null,
          keywords: candidate.keywords,
          enabled: candidate.enabled,
          skills: candidate.skills,
          mcpServerIds: candidate.mcpServerIds,
        })),
      });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
