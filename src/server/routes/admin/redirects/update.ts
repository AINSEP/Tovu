import { updateRedirect, RedirectNotFoundError } from "#src/features/redirects/index";
import { toAdminRedirectResponse, type RedirectRouteRegistrar } from "#src/server/http/admin/redirects";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import { REDIRECT_WRITE_ERROR_MAPPINGS, respondToRedirectError, type RedirectErrorMapping } from "./shared.js";

const REDIRECT_UPDATE_ERROR_MAPPINGS: readonly RedirectErrorMapping[] = [
  { matches: (e) => e instanceof RedirectNotFoundError, status: 404, code: "REDIRECT_NOT_FOUND" },
  ...REDIRECT_WRITE_ERROR_MAPPINGS,
];

/**
 * PATCH mutable fields on an existing redirect rule (api.spec.md
 * `UPDATE_REDIRECT`). All body fields optional. Gated by `admin.redirects.manage`.
 */
export const registerAdminRedirectUpdateRoute: RedirectRouteRegistrar = (app, deps) => {
  app.patch("/api/admin/v1/workspaces/:workspaceId/redirects/:id", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const id = String(req.params.id ?? "");
    const body = req.body ?? {};

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

      const { record } = await updateRedirect({
        deps: deps.redirectsWriteDeps,
        input: {
          workspaceId: deps.workspaceId,
          id,
          matchType: body.matchType,
          fromPattern: body.fromPattern,
          toTarget: body.toTarget,
          statusCode: body.statusCode,
          status: body.status,
          override: typeof body.override === "boolean" ? body.override : undefined,
          priority: typeof body.priority === "number" ? body.priority : undefined,
          actorId: principal.id,
        },
      });

      res.json(toAdminRedirectResponse(record));
    } catch (err) {
      respondToRedirectError(res, err, REDIRECT_UPDATE_ERROR_MAPPINGS);
    }
  });
};
