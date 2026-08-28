import { tombstoneRedirect } from "#src/features/redirects/index";
import { RedirectNotFoundError } from "#src/features/redirects/index";
import { toAdminRedirectResponse, type RedirectRouteRegistrar } from "#src/server/http/admin/redirects";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";

/**
 * DELETE (soft-delete/tombstone) a redirect rule (api.spec.md
 * `TOMBSTONE_REDIRECT`). Returns the tombstoned rule (200), not 204, so the
 * admin UI can show the final state without a re-fetch. Gated by
 * `admin.redirects.manage`.
 */
export const registerAdminRedirectTombstoneRoute: RedirectRouteRegistrar = (app, deps) => {
  app.delete("/api/admin/v1/workspaces/:workspaceId/redirects/:id", async (req, res) => {
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

      const { record } = await tombstoneRedirect({
        deps: deps.redirectsWriteDeps,
        input: { workspaceId: deps.workspaceId, id, actorId: principal.id },
      });

      res.json(toAdminRedirectResponse(record));
    } catch (err) {
      if (err instanceof RedirectNotFoundError) {
        res.status(404).json({ error: err.message, code: "REDIRECT_NOT_FOUND" });
        return;
      }
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
