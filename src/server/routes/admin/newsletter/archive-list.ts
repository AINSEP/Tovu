import { archiveList } from "#src/newsletter/lists";
import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "#src/server/http/admin/newsletter";
import type { RouteRegistrar } from "../../types.js";
import { toListsDeps, type NewsletterRouteDeps } from "./deps.js";

/** `ARCHIVE_LIST` (api.spec.md §1) — `POST .../newsletter/lists/:id/archive`. `admin.newsletter.list.manage`-gated. Rejects the default list (`NEWSLETTER_DEFAULT_LIST_PROTECTED`). */
export const registerAdminNewsletterArchiveListRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.post("/api/admin/v1/workspaces/:workspaceId/newsletter/lists/:id/archive", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = await requireNewsletterPermissionOrRespond(
        deps.authorize,
        deps.workspaceId,
        "admin.newsletter.list.manage",
        "newsletter_list",
        res
      );
      if (!principal) return;

      await deps.newsletterReady;
      const { list } = await archiveList({
        deps: toListsDeps(deps),
        input: { workspaceId: deps.workspaceId, id: String(req.params.id) },
      });
      res.status(200).json(toDataResponse(list));
    } catch (err) {
      mapNewsletterErrorToResponse(err, res);
    }
  });
};
