import { sendAdminFailure } from "#src/server/inbound/admin-http/routes/system/site-share-errors";
import { tombstoneRedirect } from "@jini-ai/cms/redirects";
import { RedirectNotFoundError } from "@jini-ai/cms/redirects";
import { toAdminRedirectResponse, type RedirectRouteRegistrar } from "#src/server/inbound/admin-http/http/redirects";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";

/**
 * DELETE (soft-delete/tombstone) a redirect rule (api.spec.md
 * `TOMBSTONE_REDIRECT`). Returns the tombstoned rule (200), not 204, so the
 * admin UI can show the final state without a re-fetch. Gated by
 * `admin.redirects.manage`.
 */
export const registerAdminRedirectTombstoneRoute: RedirectRouteRegistrar = (app, deps) => {
  app.delete("/api/admin/v1/workspaces/:workspaceId/redirects/:id", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    const id = String(req.params.id ?? "");

    try {
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: "admin.redirects.manage", workspaceId: deps.workspaceId, entityType: "redirect", entityId: id };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

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
      sendAdminFailure({ res, error: err }, { operation: "routes/redirects/tombstone", code: "INTERNAL_ERROR" });
    }
  });
};
