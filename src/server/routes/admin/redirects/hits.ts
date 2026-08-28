import { toAdminRedirectHitStatsResponse, type RedirectRouteRegistrar } from "#src/server/http/admin/redirects";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";

/**
 * GET aggregate hit stats for a redirect rule (api.spec.md
 * `LIST_REDIRECT_HITS`, via `RedirectHitSink.getStats`). Gated by
 * `admin.redirects.manage`. 404s if the rule itself doesn't exist (distinct
 * from "no hits recorded yet", which still 200s with `hitCount: 0`).
 */
export const registerAdminRedirectHitsRoute: RedirectRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/redirects/:id/hits", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const id = String(req.params.id ?? "");

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.redirects.manage",
        workspaceId: deps.workspaceId,
        entityType: "redirect",
        entityId: id,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.redirects.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.redirects.manage", reason: authResult.reason },
        });
        return;
      }

      const rule = await deps.redirectRepo.findById({ workspaceId: deps.workspaceId, id });
      if (!rule) {
        res.status(404).json({ error: `redirect '${id}' was not found`, code: "REDIRECT_NOT_FOUND" });
        return;
      }

      const stats = await deps.redirectHitSink.getStats({ workspaceId: deps.workspaceId, redirectId: id });
      const effective = stats ?? { redirectId: id, workspaceId: deps.workspaceId, hitCount: 0, lastHitAt: undefined };
      res.json(toAdminRedirectHitStatsResponse(effective));
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
