import { saveList } from "../../../../newsletter/lists";
import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "../../../http/admin/newsletter";
import type { RouteRegistrar } from "../../types";
import { toListsDeps, type NewsletterRouteDeps } from "./deps";

/** `CREATE_LIST` (api.spec.md §1/§4) — `POST .../newsletter/lists`. `admin.newsletter.list.manage`-gated. */
export const registerAdminNewsletterCreateListRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.post("/api/admin/v1/workspaces/:workspaceId/newsletter/lists", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const body = req.body ?? {};
    if (typeof body.name !== "string" || typeof body.slug !== "string") {
      res.status(400).json({ error: "name and slug are required strings", code: "VALIDATION_ERROR" });
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
      const { list } = await saveList({
        deps: toListsDeps(deps),
        input: { workspaceId: deps.workspaceId, name: body.name, slug: body.slug },
      });
      res.status(201).json(toDataResponse(list));
    } catch (err) {
      mapNewsletterErrorToResponse(err, res);
    }
  });
};
