import { toAdminRedirectResponse, type RedirectRouteRegistrar } from "#src/server/inbound/admin-http/http/redirects";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";

/** GET a single redirect rule by id (api.spec.md `GET_REDIRECT`). Gated by `admin.redirects.manage`. */
export const registerAdminRedirectGetRoute: RedirectRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/redirects/:id", async (req, res) => {
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
      res.json(toAdminRedirectResponse(rule));
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
