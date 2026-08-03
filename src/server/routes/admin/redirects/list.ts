import { toAdminRedirectListResponse, type RedirectRouteRegistrar } from "#src/server/http/admin/redirects";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";

/**
 * GET the workspace's redirect rules (admin list view, api.spec.md
 * `LIST_REDIRECTS`), optionally filtered by `status`/`source`/`matchType`.
 * Gated by `admin.redirects.manage` (REQ-12).
 */
export const registerAdminRedirectListRoute: RedirectRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/redirects", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
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

      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const source = typeof req.query.source === "string" ? req.query.source : undefined;
      const matchType = typeof req.query.matchType === "string" ? req.query.matchType : undefined;

      const rules = await deps.redirectRepo.list({
        workspaceId: deps.workspaceId,
        status: status as "active" | "disabled" | undefined,
        source: source as "manual" | "auto_slug_change" | "import" | undefined,
        matchType: matchType as "exact" | "prefix" | "wildcard" | "regex" | undefined,
      });
      res.json(toAdminRedirectListResponse(rules));
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
