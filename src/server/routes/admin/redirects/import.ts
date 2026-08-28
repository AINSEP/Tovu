import { importRedirects } from "#src/features/redirects/index";
import { toAdminRedirectImportResponse, type RedirectRouteRegistrar } from "#src/server/http/admin/redirects";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";

const MAX_IMPORT_BATCH_SIZE = 500;

/**
 * POST a batch of redirect rules through the standard chokepoint
 * (api.spec.md `IMPORT_REDIRECTS`, REQ-26). Always 207 Multi-Status — a
 * per-item failure never aborts the batch (each item goes through the same
 * `createRedirect` validation individually, EC-08). A malformed top-level
 * batch shape (not an array, or outside 1-500 items) is the only case that
 * gets a top-level 400 `VALIDATION_ERROR`. Gated by `admin.redirects.manage`.
 */
export const registerAdminRedirectImportRoute: RedirectRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/redirects/import", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const rules = req.body?.rules;
    if (!Array.isArray(rules) || rules.length < 1 || rules.length > MAX_IMPORT_BATCH_SIZE) {
      res.status(400).json({
        error: `rules must be an array of 1-${MAX_IMPORT_BATCH_SIZE} items`,
        code: "VALIDATION_ERROR",
      });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.redirects.manage",
        workspaceId: deps.workspaceId,
        entityType: "redirect",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.redirects.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.redirects.manage", reason: authResult.reason },
        });
        return;
      }

      const result = await importRedirects({
        deps: deps.redirectsWriteDeps,
        input: { workspaceId: deps.workspaceId, actorId: principal.id, rules },
      });

      res.status(207).json(toAdminRedirectImportResponse(result));
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
