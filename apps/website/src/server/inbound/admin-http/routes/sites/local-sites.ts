/** Authenticated CMS lifecycle routes. Deployment/binding gates precede all filesystem/process effects. */
import type { Express, Request, Response } from "express";
import { authorizeOrRespond } from "../../authorize-guard.js";
import { getAuthedPrincipal } from "../../dev-auth.js";
import type { RouteDeps } from "#src/server/routes/types";
import { resolveSiteSwitchBase } from "#src/features/sites/index";
import { LocalSiteError, type LocalSiteSupervisorPort } from "#src/platform/site-dir/local-site-supervisor";
import { trashSite, restoreSite, permanentlyDeleteTrashedSite, siteTrashName } from "#src/platform/site-dir/site-trash";

export interface LocalSitesRouteDeps extends Pick<RouteDeps, "workspaceId" | "authorize" | "siteBinding"> {
  localSiteSupervisor?: LocalSiteSupervisorPort;
  afterTrash?: (required: { base: string; name: string }) => void;
  isSiteSwitcherEnabled: () => boolean;
  siteTrash?: { trash: typeof trashSite; restore: typeof restoreSite; remove: typeof permanentlyDeleteTrashedSite };
}
const STATUS: Record<string, number> = { VALIDATION_ERROR: 400, SITE_CONFIRM_REQUIRED: 400,
  SITE_NOT_FOUND: 404, SITE_SERVING: 409, SITE_RUNNING: 409, SITE_LIMIT: 409,
  SITE_ALREADY_EXISTS: 409, SITE_PATH_UNSAFE: 409, SITE_STOP_FAILED: 409 };
const PREFIX = "/api/admin/v1/workspaces/:workspaceId/system/sites";

function lifecycleHandler(deps: LocalSitesRouteDeps, action: (req: Request, base: string, supervisor: LocalSiteSupervisorPort) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) { res.status(404).json({ error: "workspace was not found" }); return; }
    const gate = resolveSiteSwitchBase({ binding: deps.siteBinding, switchingEnabled: deps.isSiteSwitcherEnabled() });
    if (!gate.ok) { res.status(gate.code === "SITE_SWITCHING_DISABLED" ? 403 : 409).json(gate); return; }
    try {
      const principal = getAuthedPrincipal(res);
      if (!(await authorizeOrRespond(res, deps.authorize, { principalId: principal.id,
        permission: "system.write", workspaceId: deps.workspaceId, entityType: "site-registry" }))) return;
      if (!deps.localSiteSupervisor) { res.status(409).json({ code: "SITE_HOST_UNAVAILABLE", error: "local site host is unavailable" }); return; }
      const result = await action(req, gate.switcherBase, deps.localSiteSupervisor);
      res.status(200).json(result ?? { ok: true });
    } catch (error) {
      const code = error instanceof LocalSiteError ? error.code : "INTERNAL_ERROR";
      // Never serialize an effect's raw error: child/connection errors can contain credentials.
      res.status(STATUS[code] ?? 500).json({ code, error: code });
    }
  };
}

/** Register only handlers; host lifetime belongs to the serving composition. @complexity O(1). */
export function registerLocalSitesRoutes({ app, deps }: { app: Express; deps: LocalSitesRouteDeps }, _options = {}): void {
  const trash = deps.siteTrash ?? { trash: trashSite, restore: restoreSite, remove: permanentlyDeleteTrashedSite };
  app.post(`${PREFIX}/:name/start`, lifecycleHandler(deps, (req, _base, supervisor) => supervisor.start({ name: String(req.params.name ?? "") })));
  app.post(`${PREFIX}/:name/stop`, lifecycleHandler(deps, (req, _base, supervisor) => supervisor.stop({ name: String(req.params.name ?? "") })));
  app.post(`${PREFIX}/:name/trash`, lifecycleHandler(deps, async (req, base, supervisor) => {
    if (req.body?.confirmed !== true) throw new LocalSiteError("SITE_CONFIRM_REQUIRED");
    const name = String(req.params.name ?? "");
    return supervisor.withStoppedSite({ name, task: async () => {
      const site = trash.trash({ base, name });
      deps.afterTrash?.({ base, name });
      return { site };
    } });
  }));
  app.post(`${PREFIX}/trash/:id/restore`, lifecycleHandler(deps, async (req, base, supervisor) => {
    const id = String(req.params.id ?? "");
    return supervisor.withStoppedSite({ name: siteTrashName({ id }), task: async () => { trash.restore({ base, id }); } });
  }));
  app.post(`${PREFIX}/trash/:id/delete`, lifecycleHandler(deps, async (req, base, supervisor) => {
    if (req.body?.checked !== true || req.body?.confirmed !== true) throw new LocalSiteError("SITE_CONFIRM_REQUIRED");
    const id = String(req.params.id ?? "");
    return supervisor.withStoppedSite({ name: siteTrashName({ id }), task: async () => {
      trash.remove({ base, id, checked: req.body?.checked === true, confirmed: req.body?.confirmed === true });
    } });
  }));
}
