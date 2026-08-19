import { issueConfirmationToken } from "#src/newsletter/confirmation";
import { NewsletterSubscriptionNotFoundError } from "#src/newsletter/index";
import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond } from "#src/server/http/admin/newsletter";
import type { RouteRegistrar } from "../../types.js";
import { toConfirmationDeps, type NewsletterRouteDeps } from "./deps.js";

/**
 * `RESEND_CONFIRMATION` (api.spec.md §1/§5) — `POST .../newsletter/subscriptions/:id/
 * resend-confirmation`. `admin.newsletter.subscriber.manage`-gated. `issueConfirmationToken`
 * (`confirmation.ts`) already invalidates the subscription's prior unconsumed token before minting
 * a new one ("newest wins", behavior.spec.md §2.1) — exactly `RESEND_CONFIRMATION`'s contract.
 * Response is the constant `{ delivered: true }` shape regardless of whether the underlying
 * Members contact resolves (OQ-01 anti-enumeration posture) — the one exception is a genuinely
 * unknown subscription id, which 404s (this route operates on an admin-known primary key, not a
 * caller-supplied email, so that 404 does not itself leak subscriber existence the way an
 * email-keyed public route's 404 would).
 */
export const registerAdminNewsletterResendConfirmationRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.post("/api/admin/v1/workspaces/:workspaceId/newsletter/subscriptions/:id/resend-confirmation", async (req, res) => {
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
      const subscription = await deps.newsletterSubscriptionRepo.findById({ workspaceId: deps.workspaceId, id });
      if (!subscription) throw new NewsletterSubscriptionNotFoundError(`subscription ${id} was not found`);

      const contact = await deps.newsletterSubscriberDirectory.getContact({
        workspaceId: deps.workspaceId,
        subscriberId: subscription.subscriberId,
      });
      if (contact) {
        await issueConfirmationToken({
          deps: toConfirmationDeps(deps),
          input: { workspaceId: deps.workspaceId, subscriptionId: subscription.id, recipientEmail: contact.email },
        });
      }
      res.status(200).json({ delivered: true });
    } catch (err) {
      mapNewsletterErrorToResponse(err, res);
    }
  });
};
