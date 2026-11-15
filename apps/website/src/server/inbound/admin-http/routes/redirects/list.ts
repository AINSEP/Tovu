import { sendAdminFailure } from "#src/server/inbound/admin-http/routes/system/site-share-errors";
import { listRedirects } from "@jini-ai/cms/redirects";
import { toAdminRedirectListResponse, type RedirectRouteRegistrar } from "#src/server/inbound/admin-http/http/redirects";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";

/**
 * GET the workspace's redirect rules (admin list view, api.spec.md
 * `LIST_REDIRECTS`), optionally filtered by `status`/`source`/`matchType`. Rules in the
 * Trash are not listed.
 * Gated by `admin.redirects.manage` (REQ-12).
 */
export const registerAdminRedirectListRoute: RedirectRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/redirects", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: "admin.redirects.manage", workspaceId: deps.workspaceId, entityType: "redirect" };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const source = typeof req.query.source === "string" ? req.query.source : undefined;
      const matchType = typeof req.query.matchType === "string" ? req.query.matchType : undefined;

      // Rules in the Trash are left out (Bug B): removal moves a rule to the Trash, which is the
      // only screen that shows it until it is restored.
      const rules = await listRedirects({
        deps: { repo: deps.redirectRepo, isInTrash: deps.redirectsWriteDeps.isInTrash },
        filter: {
          workspaceId: deps.workspaceId,
          status: status as "active" | "disabled" | undefined,
          source: source as "manual" | "auto_slug_change" | "import" | undefined,
          matchType: matchType as "exact" | "prefix" | "wildcard" | "regex" | undefined,
        },
      });
      res.json(toAdminRedirectListResponse({ records: rules }));
    } catch (error) {
      sendAdminFailure({ res, error }, { operation: "routes/redirects/list", code: "INTERNAL_ERROR" });
    }
  });
};
