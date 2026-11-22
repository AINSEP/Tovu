import { saveList } from "#src/features/newsletter/lists";
import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "#src/server/inbound/admin-http/http/newsletter";
import type { RouteRegistrar } from "#src/server/routes/types";
import { toListsDeps, type NewsletterRouteDeps } from "./deps.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";

/** `CREATE_LIST` (api.spec.md §1/§4) — `POST .../newsletter/lists`. `admin.newsletter.list.manage`-gated. */
export const registerAdminNewsletterCreateListRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.post("/api/admin/v1/workspaces/:workspaceId/newsletter/lists", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    const body = req.body ?? {};
    if (typeof body.name !== "string" || typeof body.slug !== "string") {
      res.status(400).json({ error: "name and slug are required strings", code: "VALIDATION_ERROR" });
      return;
    }

    try {
      const principal = await requireNewsletterPermissionOrRespond({ authorize: deps.authorize, workspaceId: deps.workspaceId, permission: "admin.newsletter.list.manage", entityType: "newsletter_list", res });
      if (!principal) return;

      await deps.newsletterReady;
      const { list } = await saveList({
        deps: toListsDeps(deps),
        input: { workspaceId: deps.workspaceId, name: body.name, slug: body.slug },
      });
      res.status(201).json(toDataResponse({ data: list }));
    } catch (err) {
      mapNewsletterErrorToResponse({ err, res });
    }
  });
};
