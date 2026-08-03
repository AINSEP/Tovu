import { updateRedirect } from "#src/redirects/index";
import {
  RedirectConflictError,
  RedirectLoopError,
  RedirectNotFoundError,
  RedirectTargetNotAllowedError,
  RedirectValidationError,
} from "#src/redirects/index";
import { toAdminRedirectResponse, type RedirectRouteRegistrar } from "#src/server/http/admin/redirects";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";

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
      if (err instanceof RedirectNotFoundError) {
        res.status(404).json({ error: err.message, code: "REDIRECT_NOT_FOUND" });
        return;
      }
      if (err instanceof RedirectValidationError) {
        res.status(400).json({ error: err.message, code: "REDIRECT_VALIDATION_ERROR" });
        return;
      }
      if (err instanceof RedirectTargetNotAllowedError) {
        res.status(400).json({ error: err.message, code: "REDIRECT_TARGET_NOT_ALLOWED" });
        return;
      }
      if (err instanceof RedirectConflictError) {
        res.status(409).json({ error: err.message, code: "REDIRECT_CONFLICT" });
        return;
      }
      if (err instanceof RedirectLoopError) {
        res.status(409).json({ error: err.message, code: "REDIRECT_LOOP_DETECTED" });
        return;
      }
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
