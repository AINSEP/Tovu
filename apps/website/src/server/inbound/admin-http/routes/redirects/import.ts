import { sendAdminFailure } from "#src/server/inbound/admin-http/routes/system/site-share-errors";
import { importRedirects } from "@jini-ai/cms/redirects";
import { toAdminRedirectImportResponse, type RedirectRouteRegistrar } from "#src/server/inbound/admin-http/http/redirects";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";

const MAX_IMPORT_BATCH_SIZE = 500;

/**
 * POST a batch of redirect rules through the standard chokepoint
 * (api.spec.md `IMPORT_REDIRECTS`, REQ-26). Always 207 Multi-Status — a
 * per-item failure never aborts the batch (each item goes through the same
 * `createRedirect` validation individually, EC-08). A malformed top-level
 * batch shape (not an array, or outside 1-500 items) is the only case that
 * gets a top-level 400 `VALIDATION_ERROR`. Gated by `admin.redirects.manage`.
 */
export const registerAdminRedirectImportRoute: RedirectRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/redirects/import", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

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
      const params = { principalId: principal.id, permission: "admin.redirects.manage", workspaceId: deps.workspaceId, entityType: "redirect" };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const result = await importRedirects({
        deps: deps.redirectsWriteDeps,
        input: { workspaceId: deps.workspaceId, actorId: principal.id, rules },
      });

      res.status(207).json(toAdminRedirectImportResponse(result));
    } catch (error) {
      sendAdminFailure({ res, error }, { operation: "routes/redirects/import", code: "INTERNAL_ERROR" });
    }
  });
};
