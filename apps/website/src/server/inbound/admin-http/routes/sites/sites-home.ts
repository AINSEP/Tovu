import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
/**
 * The sites-settings save route (`PUT .../system/sites/config`) and the Node directory probe the
 * settings rules inspect folders through.
 *
 * K1 (RT-K1-adm-sites-2): the settings read and the home choice are Jini specs
 * (`@jini-ai/cms/admin-http/routes/sites/sites-home`, mounted by `runtime/composition/modules/sites.ts`).
 * This route stays hand-written: it answers an unexpected failure with two different copies by
 * phase ("Could not read sites settings." before authorization, "Could not save sites settings."
 * after), and one JSON-route mount carries a single failure copy. Its folder rules are the spec's own.
 */
import fs from "node:fs";
import path from "node:path";
import type { Express } from "express";
import { RouteRefusalError } from "@jini-ai/core/errors/route-refusal";
import type { AuthorizeFn } from "@jini-ai/core/contracts/events";
import type { UUID } from "@jini-ai/core/primitives";
import { DirectoryUserConfigRefusal, validateDirectoryUserConfig } from "@jini-ai/platform/fs";
import { parseSitesSettingsDirectory, validateSitesSettingsDirectories, type SitesDirectoryProbe } from "@jini-ai/cms/admin-http/routes/sites/sites-home";
import { authorizeOrRespond } from "../../authorize-guard.js";
import { getAuthedPrincipal } from "../../dev-auth.js";
import type { SitesWorkspace } from "#src/platform/site-dir/index";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";

/** What the settings routes read. */
export type SitesSettingsDeps = { workspaceId: UUID; authorize: AuthorizeFn; isSiteSwitcherEnabled: () => boolean };

/** Folder inspection over `node:fs`. Only "not found" is an answer; any other stat failure (EACCES,
 * an I/O error) propagates, so it is a correlated 500 and never a public validation message.
 * @complexity O(1) stat probes. */
export const nodeSitesDirectoryProbe: SitesDirectoryProbe = {
  isAbsolute: ({ directory }) => path.isAbsolute(directory),
  kind: ({ directory }) => {
    try {
      return fs.statSync(directory).isDirectory() ? "directory" : "other";
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return "missing";
    }
  },
  parentExists: ({ directory }) => fs.existsSync(path.dirname(directory)),
};

/** `PUT .../system/sites/config` — save the sites settings. @complexity O(roots) stat probes plus the config write. */
export function registerSitesConfigSaveRoute({ app, deps, workspace }: { app: Express; deps: SitesSettingsDeps; workspace: SitesWorkspace }, _options = {}): void {
  app.put("/api/admin/v1/workspaces/:workspaceId/system/sites/config", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;
    if (!deps.isSiteSwitcherEnabled()) { res.status(403).json({ error: "Local sites management is disabled." }); return; }
    try {
      const principal = getAuthedPrincipal(res);
      if (!(await authorizeOrRespond({ res, authorize: deps.authorize, params: { principalId: principal.id, permission: "system.write", workspaceId: deps.workspaceId, entityType: "site-registry" } }))) return;
      try {
        // Validate the shape before inspecting paths; malformed input is a refusal, not an I/O error.
        if (req.body?.sitesHome !== undefined) parseSitesSettingsDirectory({ directory: req.body.sitesHome, directories: nodeSitesDirectoryProbe });
        const patch = validateDirectoryUserConfig({ value: req.body });
        validateSitesSettingsDirectories({ patch, directories: nodeSitesDirectoryProbe });
        res.json(workspace.updateConfig({ patch }));
      }
      catch (error) {
        if (error instanceof DirectoryUserConfigRefusal) { res.status(400).json({ error: error.message }); return; }
        if (error instanceof RouteRefusalError) { res.status(error.response.status).json(error.response.body); return; }
        sendAdminFailure({ res, error }, { operation: "routes/sites/sites-home", code: "INTERNAL_ERROR", message: "Could not save sites settings." });
      }
    } catch (error) { sendAdminFailure({ res, error }, { operation: "routes/sites/sites-home", code: "INTERNAL_ERROR", message: "Could not read sites settings." }); }
  });
}
