import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { preferBundledAgentPluginDigests, readBundledAgentPluginDigests } from "#src/features/agent-plugins/bundled-digests";
import { listInstalledPlugins } from "#src/features/agent-plugins/resolve-agent-plugin-refs";
import { PLUGIN_PACKAGE_FILE_LIMITS, readPluginPackageFiles } from "#src/features/plugin-runtime/package-files";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { AgentPluginsRouteRegistrar } from "./deps.js";

/**
 * @file `AGENT_PLUGIN_FILES` — `GET /api/admin/v1/workspaces/:workspaceId/agent-plugins/:pluginId/files`
 * (2026-09-13). The Agent Plugins screen's read-only package-files viewer: every file in ONE
 * installed Agent Plugin's own package root, switched on or off. It replaced the admin bundle's
 * compile-time catalog as that viewer's source — the catalog only knew hand-listed plugins, so
 * `supabase` and `tovuize-site` opened an empty viewer.
 *
 * Mirrors `plugins/files.ts`. Gated on `admin.plugins.read` and authorized BEFORE the id is looked
 * up. The id must equal an installed plugin's own manifest id from a fresh `listInstalledPlugins`
 * walk, so request text is never joined into a path. The first record per id wins — the same
 * single-digest policy `loadAgentPluginSearchCandidates` applies, so the viewer shows the package
 * the listing describes. Path safety (realpath inside this workspace's `packages` directory,
 * symlinks listed but never followed, count and byte caps) is `readPluginPackageFiles`'s.
 *
 * Activation is deliberately not consulted: reading a switched-off plugin's files executes nothing.
 */
export const registerAgentPluginFilesRoute: AgentPluginsRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/agent-plugins/:pluginId/files", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const pluginId = String(req.params.pluginId ?? "");

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

      const workspaceLayout = resolveAgentPluginLayout().forWorkspace(deps.workspaceId);
      // An upgraded bundled plugin's superseded package is dropped first, so this browses the
      // version the running build ships rather than whichever digest the walk reached first.
      const plugin = preferBundledAgentPluginDigests(
        await listInstalledPlugins(workspaceLayout.packages),
        await readBundledAgentPluginDigests(workspaceLayout.root),
      ).find((candidate) => candidate.pluginId === pluginId);
      if (!plugin) {
        res.status(404).json({ error: "agent plugin was not found", code: "AGENT_PLUGIN_NOT_FOUND" });
        return;
      }

      const { files, truncated } = await readPluginPackageFiles({
        input: { rootDir: plugin.packageRoot, containerDir: workspaceLayout.packages },
      });
      res.json({ pluginId, files, truncated, limits: PLUGIN_PACKAGE_FILE_LIMITS });
    } catch {
      // Includes `PluginPackagePathError`, whose message names server paths — never echoed.
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
