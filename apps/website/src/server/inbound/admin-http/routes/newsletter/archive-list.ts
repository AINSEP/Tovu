import { archiveList } from "@jini-ai/user-management/newsletter/lists";
import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "#src/server/inbound/admin-http/http/newsletter";
import type { RouteRegistrar } from "#src/server/routes/types";
import { toListsDeps, type NewsletterRouteDeps } from "./deps.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";

/** `ARCHIVE_LIST` (api.spec.md §1) — `POST .../newsletter/lists/:id/archive`. `admin.newsletter.list.manage`-gated. Rejects the default list (`NEWSLETTER_DEFAULT_LIST_PROTECTED`). */
export const registerAdminNewsletterArchiveListRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.post("/api/admin/v1/workspaces/:workspaceId/newsletter/lists/:id/archive", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = await requireNewsletterPermissionOrRespond({ authorize: deps.authorize, workspaceId: deps.workspaceId, permission: "admin.newsletter.list.manage", entityType: "newsletter_list", res });
      if (!principal) return;

      await deps.newsletterReady;
      const { list } = await archiveList({
        deps: toListsDeps(deps),
        input: { workspaceId: deps.workspaceId, id: String(req.params.id) },
      });
      res.status(200).json(toDataResponse({ data: list }));
    } catch (err) {
      mapNewsletterErrorToResponse({ err, res });
    }
  });
};
