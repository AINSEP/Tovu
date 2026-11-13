import { sendAdminFailure } from "#src/server/inbound/admin-http/routes/system/site-share-errors";
import { toAdminRedirectResponse, type RedirectRouteRegistrar } from "#src/server/inbound/admin-http/http/redirects";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";

/** GET a single redirect rule by id (api.spec.md `GET_REDIRECT`). Gated by `admin.redirects.manage`. */
export const registerAdminRedirectGetRoute: RedirectRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/redirects/:id", async (req, res) => {
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
      res.json(toAdminRedirectResponse(rule));
    } catch (error) {
      sendAdminFailure({ res, error }, { operation: "routes/redirects/get-by-id", code: "INTERNAL_ERROR" });
    }
  });
};
