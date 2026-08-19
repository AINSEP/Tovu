import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "#src/server/http/admin/newsletter";
import type { RouteRegistrar } from "../../types.js";
import type { NewsletterRouteDeps } from "./deps.js";

/** `LIST_SUBSCRIPTIONS` (api.spec.md §1) — `GET .../newsletter/lists/:listId/subscriptions`. `admin.newsletter.subscriber.read`-gated. */
export const registerAdminNewsletterListSubscriptionsRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.get("/api/admin/v1/workspaces/:workspaceId/newsletter/lists/:listId/subscriptions", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = await requireNewsletterPermissionOrRespond(
        deps.authorize,
        deps.workspaceId,
        "admin.newsletter.subscriber.read",
        "newsletter_subscription",
        res
      );
      if (!principal) return;

      await deps.newsletterReady;
      const subscriptions = await deps.newsletterSubscriptionRepo.list({
        workspaceId: deps.workspaceId,
        listId: String(req.params.listId),
      });
      res.status(200).json(toDataResponse(subscriptions));
    } catch (err) {
      mapNewsletterErrorToResponse(err, res);
    }
  });
};
