import { sendAdminFailure } from "#src/server/inbound/admin-http/routes/system/site-share-errors";
import { toAdminRedirectHitStatsResponse, type RedirectRouteRegistrar } from "#src/server/inbound/admin-http/http/redirects";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";

/**
 * GET aggregate hit stats for a redirect rule (api.spec.md
 * `LIST_REDIRECT_HITS`, via `RedirectHitSink.getStats`). Gated by
 * `admin.redirects.manage`. 404s if the rule itself doesn't exist (distinct
 * from "no hits recorded yet", which still 200s with `hitCount: 0`).
 */
export const registerAdminRedirectHitsRoute: RedirectRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/redirects/:id/hits", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    const id = String(req.params.id ?? "");

    try {
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: "admin.redirects.manage", workspaceId: deps.workspaceId, entityType: "redirect", entityId: id };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const rule = await deps.redirectRepo.findById({ workspaceId: deps.workspaceId, id });
      if (!rule) {
        res.status(404).json({ error: `redirect '${id}' was not found`, code: "REDIRECT_NOT_FOUND" });
        return;
      }

      const stats = await deps.redirectHitSink.getStats({ workspaceId: deps.workspaceId, redirectId: id });
      const effective = stats ?? { redirectId: id, workspaceId: deps.workspaceId, hitCount: 0, lastHitAt: undefined };
      res.json(toAdminRedirectHitStatsResponse(effective));
    } catch (error) {
      sendAdminFailure({ res, error }, { operation: "routes/redirects/hits", code: "INTERNAL_ERROR" });
    }
  });
};
