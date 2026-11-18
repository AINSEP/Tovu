import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "#src/server/inbound/admin-http/http/newsletter";
import type { RouteRegistrar } from "#src/server/routes/types";
import type { NewsletterRouteDeps } from "./deps.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";

/** `LIST_LISTS` (api.spec.md §1) — `GET .../newsletter/lists`. `admin.newsletter.read`-gated. */
export const registerAdminNewsletterListListsRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.get("/api/admin/v1/workspaces/:workspaceId/newsletter/lists", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = await requireNewsletterPermissionOrRespond({ authorize: deps.authorize, workspaceId: deps.workspaceId, permission: "admin.newsletter.read", entityType: "newsletter_list", res });
      if (!principal) return;

      await deps.newsletterReady;
      const lists = await deps.newsletterListRepo.list({ workspaceId: deps.workspaceId });
      res.status(200).json(toDataResponse({ data: lists }));
    } catch (err) {
      mapNewsletterErrorToResponse({ err, res });
    }
  });
};
