import { unsubscribeSubscription } from "#src/newsletter/subscriptions";
import { NewsletterSubscriptionNotFoundError } from "#src/newsletter/index";
import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "#src/server/http/admin/newsletter";
import type { RouteRegistrar } from "../../types.js";
import { toUnsubscribeSubscriptionDeps, type NewsletterRouteDeps } from "./deps.js";

/**
 * `REMOVE_SUBSCRIPTION` (api.spec.md §1/§5) — `DELETE .../newsletter/lists/:listId/
 * subscriptions/:id`. `admin.newsletter.subscriber.manage`-gated. Returns the `unsubscribed`
 * subscription (200), not `204` (a soft state transition, not a hard delete).
 *
 * `subscriptions.ts`'s `unsubscribeSubscription` is the real domain-layer function backing this
 * route (added alongside this route — Stage 3's `subscriptions.ts` previously exported only the
 * create-side `saveSubscription`/`importSubscriptions`; the only removal-shaped repo method,
 * `NewsletterSubscriptionRepoPort.remove()`, is a hard delete, which would have contradicted this
 * endpoint's documented response). See that function's own doc comment for the full rationale.
 */
export const registerAdminNewsletterRemoveSubscriptionRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.delete("/api/admin/v1/workspaces/:workspaceId/newsletter/lists/:listId/subscriptions/:id", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
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
      const id = String(req.params.id);
      const existing = await deps.newsletterSubscriptionRepo.findById({ workspaceId: deps.workspaceId, id });
      if (!existing || existing.listId !== String(req.params.listId)) {
        throw new NewsletterSubscriptionNotFoundError(`subscription ${id} was not found`);
      }

      const { subscription } = await unsubscribeSubscription({
        deps: toUnsubscribeSubscriptionDeps(deps),
        input: { workspaceId: deps.workspaceId, id },
      });
      res.status(200).json(toDataResponse(subscription));
    } catch (err) {
      mapNewsletterErrorToResponse(err, res);
    }
  });
};
