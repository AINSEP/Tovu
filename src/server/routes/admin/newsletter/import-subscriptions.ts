import { importSubscriptions } from "../../../../newsletter/subscriptions";
import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond } from "../../../http/admin/newsletter";
import type { RouteRegistrar } from "../../types";
import { toSubscriptionsDeps, type NewsletterRouteDeps } from "./deps";

/**
 * `IMPORT_SUBSCRIPTIONS` (api.spec.md §1/§4/§5) — `POST .../newsletter/lists/:listId/
 * subscriptions/import`. `admin.newsletter.subscriber.manage`-gated. `207 Multi-Status`: each row
 * routes through the identical `saveSubscription` path (REQ-31) — one invalid `subscriberId` never
 * blocks the valid rows in the same batch.
 */
export const registerAdminNewsletterImportSubscriptionsRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.post("/api/admin/v1/workspaces/:workspaceId/newsletter/lists/:listId/subscriptions/import", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const body = req.body ?? {};
    if (
      !Array.isArray(body.subscribers) ||
      !body.subscribers.every((s: unknown) => typeof s === "object" && s !== null && typeof (s as { subscriberId?: unknown }).subscriberId === "string")
    ) {
      res.status(400).json({ error: "subscribers must be an array of { subscriberId }", code: "VALIDATION_ERROR" });
      return;
    }

    try {
      const principal = await requireNewsletterPermissionOrRespond(
        deps.authorize,
        deps.workspaceId,
        "admin.newsletter.subscriber.manage",
        "newsletter_subscription",
        res
      );
      if (!principal) return;

      await deps.newsletterReady;
      const { created, failed } = await importSubscriptions({
        deps: toSubscriptionsDeps(deps),
        input: {
          workspaceId: deps.workspaceId,
          listId: String(req.params.listId),
          subscribers: (body.subscribers as Array<{ subscriberId: string }>).map((s) => ({ subscriberId: s.subscriberId, source: "import" as const })),
        },
      });
      res.status(207).json({ created, failed });
    } catch (err) {
      mapNewsletterErrorToResponse(err, res);
    }
  });
};
