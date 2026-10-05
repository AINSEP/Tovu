import path from "node:path";
import { resolveSkillLayout } from "#src/features/skills/layout";
import { loadInstalledSkillToolSources } from "#src/features/skills/tool-registrations";
import { PLUGIN_PACKAGE_FILE_LIMITS, readPluginPackageFiles } from "#src/features/plugin-runtime/package-files";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { SkillsRouteRegistrar } from "./deps.js";

/** Read-only sibling of plugin files: resolve an installed id before joining any path. */
export const registerSkillFilesRoute: SkillsRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/skills/:toolId/files", async (req, res) => {
    if (req.params.workspaceId !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    const { toolId } = req.params;
    try {
      const principal = getAuthedPrincipal(res);
      if (!await authorizeOrRespond(res, deps.authorize, {
        principalId: principal.id, permission: "admin.assistant.use", workspaceId: deps.workspaceId,
      })) return;

      const sources = await loadInstalledSkillToolSources({ workspaceId: deps.workspaceId, includeDisabled: true });
      const skill = sources.find(source => source.id === toolId);
      if (!skill?.directory) {
        res.status(404).json({ error: "Skill was not found or is disabled.", code: "NOT_FOUND" });
        return;
      }
      const containerDir = resolveSkillLayout().forWorkspace(deps.workspaceId).root;
      // The directory comes from discovery, never request text. The shared reader enforces
      // realpath containment, no symlink following, and the same count/byte caps as Plugins.
      const { files, truncated } = await readPluginPackageFiles({
        input: { rootDir: path.join(containerDir, skill.directory), containerDir },
      });
      // Install records are server bookkeeping, including copies in nested skill folders.
      const visibleFiles = files.filter(file => path.posix.basename(file.relativePath) !== ".tovu-install.json");
      res.json({ toolId, files: visibleFiles, truncated, limits: PLUGIN_PACKAGE_FILE_LIMITS });
    } catch {
      // Path errors can contain private server paths; match the plugin files refusal.
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
