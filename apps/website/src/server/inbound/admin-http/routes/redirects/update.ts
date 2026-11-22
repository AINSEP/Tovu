import { updateRedirect, RedirectNotFoundError } from "@jini-ai/cms/redirects";
import { toAdminRedirectResponse, type RedirectRouteRegistrar } from "#src/server/inbound/admin-http/http/redirects";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { REDIRECT_WRITE_ERROR_MAPPINGS, respondToRedirectError, type RedirectErrorMapping } from "./shared.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";

const REDIRECT_UPDATE_ERROR_MAPPINGS: readonly RedirectErrorMapping[] = [
  { matches: ({ err }, _options = {}) => err instanceof RedirectNotFoundError, status: 404, code: "REDIRECT_NOT_FOUND" },
  ...REDIRECT_WRITE_ERROR_MAPPINGS,
];

/**
 * PATCH mutable fields on an existing redirect rule (api.spec.md
 * `UPDATE_REDIRECT`). All body fields optional. Gated by `admin.redirects.manage`.
 */
export const registerAdminRedirectUpdateRoute: RedirectRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.patch("/api/admin/v1/workspaces/:workspaceId/redirects/:id", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    const id = String(req.params.id ?? "");
    const body = req.body ?? {};

    try {
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: "admin.redirects.manage", workspaceId: deps.workspaceId, entityType: "redirect", entityId: id };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

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
      respondToRedirectError({ res, err, mappings: REDIRECT_UPDATE_ERROR_MAPPINGS });
    }
  });
};
