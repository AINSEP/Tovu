/** Local creation-home setting, authorized at the same boundary as Sites mutations. */
import fs from "node:fs";
import path from "node:path";
import type { Express, Request, Response } from "express";
import { authorizeOrRespond } from "../../authorize-guard.js";
import { getAuthedPrincipal } from "../../dev-auth.js";
import { isSiteSwitcherEnabled, type SitesWorkspace } from "#src/platform/site-dir/index";
import type { AuthorizeFn } from "@jini-ai/cms/core";
import type { UUID } from "@jini-ai/core/primitives";

type SettingsDeps = {
  workspaceId: UUID;
  authorize: AuthorizeFn;
  isSiteSwitcherEnabled?: typeof isSiteSwitcherEnabled;
};

function admitSettingsRequest({ req, res, deps }: { req: Request; res: Response; deps: SettingsDeps }, _options = {}): boolean {
  if (String(req.params.workspaceId ?? "") !== deps.workspaceId) { res.status(404).json({ error: "workspace was not found" }); return false; }
  if (!(deps.isSiteSwitcherEnabled ?? isSiteSwitcherEnabled)()) { res.status(403).json({ error: "Local sites management is disabled." }); return false; }
  return true;
}

export function registerSitesHomeRoutes({ app, deps, workspace }: { app: Express; deps: SettingsDeps; workspace: SitesWorkspace }, _options = {}): void {
  const configRoute = "/api/admin/v1/workspaces/:workspaceId/system/sites/config";
  for (const method of ["get", "put"] as const) app[method](configRoute, async (req, res) => {
    if (!admitSettingsRequest({ req, res, deps })) return;
    try {
      const principal = getAuthedPrincipal(res);
      if (!(await authorizeOrRespond(res, deps.authorize, { principalId: principal.id, permission: method === "get" ? "system.read" : "system.write", workspaceId: deps.workspaceId, entityType: "site-registry" }))) return;
      if (method === "get") { res.json(workspace.config({})); return; }
      try {
        const patch = req.body;
        validateSettingsDirectories({ patch });
        res.json(workspace.updateConfig({ patch }));
      }
      catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Could not save sites settings." }); }
    } catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : "Could not read sites settings." }); }
  });
  app.put("/api/admin/v1/workspaces/:workspaceId/system/sites/home", async (req, res) => {
    if (!admitSettingsRequest({ req, res, deps })) return;
    try {
      const principal = getAuthedPrincipal(res);
      if (!(await authorizeOrRespond(res, deps.authorize, { principalId: principal.id, permission: "system.write", workspaceId: deps.workspaceId, entityType: "site-registry" }))) return;
      const selected = req.body?.path;
      try {
        if (selected === undefined) throw new Error("Choose an absolute folder path for sites settings.");
        validateSettingsDirectories({ patch: { sitesHome: selected } });
      }
      catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Invalid sites home." }); return; }
      const home = workspace.setHome({ path: selected });
      res.json({ home });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Could not save sites home." });
    }
  });
}

function validateSettingsDirectories({ patch }: { patch: { sitesHome?: unknown; siteRoots?: readonly string[] } }, _options = {}): void {
  for (const [directory, required] of [
    ...(patch.sitesHome !== undefined ? [[patch.sitesHome, false] as const] : []),
    ...(patch.siteRoots ?? []).map((root) => [root, true] as const),
  ]) {
    validateSettingsDirectory({ directory: parseSettingsDirectory({ directory }), required });
  }
}

function parseSettingsDirectory({ directory }: { directory: unknown }, _options = {}): string {
  if (typeof directory !== "string" || !directory.trim() || !path.isAbsolute(directory) || directory.includes("\0")) throw new Error("Choose an absolute folder path for sites settings.");
  return directory;
}

/** Both HTTP settings routes use absolute paths; roots must exist, and a new home needs its
 * parent mounted. A missing volume must never become a newly-created boot-disk directory.
 * @complexity O(1) stat probes per directory.
 */
function validateSettingsDirectory({ directory, required }: { directory: string; required: boolean }, _options = {}): void {
  try {
    if (!fs.statSync(directory).isDirectory()) throw new Error("Sites folder must be a directory.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (required || !fs.existsSync(path.dirname(directory))) throw new Error(`Sites folder is unavailable: ${directory}. Mount it or choose an existing local folder.`);
  }
}
