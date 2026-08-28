import { registerAdminNewsletterArchiveListRoute } from "../../../inbound/admin-http/routes/newsletter/archive-list.js";
import { registerAdminNewsletterCancelCampaignRoute } from "../../../inbound/admin-http/routes/newsletter/cancel-campaign.js";
import { registerAdminNewsletterCreateCampaignRoute } from "../../../inbound/admin-http/routes/newsletter/create-campaign.js";
import { registerAdminNewsletterCreateListRoute } from "../../../inbound/admin-http/routes/newsletter/create-list.js";
import { registerAdminNewsletterCreateSubscriptionRoute } from "../../../inbound/admin-http/routes/newsletter/create-subscription.js";
import type { NewsletterRouteDeps } from "../../../inbound/admin-http/routes/newsletter/deps.js";
import { registerAdminNewsletterGetCampaignRoute } from "../../../inbound/admin-http/routes/newsletter/get-campaign.js";
import { registerAdminNewsletterImportSubscriptionsRoute } from "../../../inbound/admin-http/routes/newsletter/import-subscriptions.js";
import { registerAdminNewsletterListCampaignsRoute } from "../../../inbound/admin-http/routes/newsletter/list-campaigns.js";
import { registerAdminNewsletterListListsRoute } from "../../../inbound/admin-http/routes/newsletter/list-lists.js";
import { registerAdminNewsletterListSendLogRoute } from "../../../inbound/admin-http/routes/newsletter/list-send-log.js";
import { registerAdminNewsletterListSubscriptionsRoute } from "../../../inbound/admin-http/routes/newsletter/list-subscriptions.js";
import { registerAdminNewsletterPauseCampaignRoute } from "../../../inbound/admin-http/routes/newsletter/pause-campaign.js";
import { registerAdminNewsletterRemoveSubscriptionRoute } from "../../../inbound/admin-http/routes/newsletter/remove-subscription.js";
import { registerAdminNewsletterResendConfirmationRoute } from "../../../inbound/admin-http/routes/newsletter/resend-confirmation.js";
import { registerAdminNewsletterResumeCampaignRoute } from "../../../inbound/admin-http/routes/newsletter/resume-campaign.js";
import { registerAdminNewsletterScheduleCampaignRoute } from "../../../inbound/admin-http/routes/newsletter/schedule-campaign.js";
import { registerAdminNewsletterSendCampaignRoute } from "../../../inbound/admin-http/routes/newsletter/send-campaign.js";
import { registerAdminNewsletterSendTestCampaignRoute } from "../../../inbound/admin-http/routes/newsletter/send-test-campaign.js";
import { registerAdminNewsletterUpdateCampaignRoute } from "../../../inbound/admin-http/routes/newsletter/update-campaign.js";
import { registerPublicNewsletterConfirmRoute } from "../../../routes/site/newsletter-confirm.js";
import type { NewsletterPublicRouteDeps } from "../../../routes/site/newsletter-deps.js";
import { registerPublicNewsletterUnsubscribeRoute } from "../../../routes/site/newsletter-unsubscribe.js";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file SPEC-011 (Newsletter, ADR-PIPE-011) Stage 5 — the `newsletter` server module: 19 admin
 * routes (each gated by its specific `admin.newsletter.*` permission, checked directly via
 * `authorize()` per api.spec.md's Purpose section) + 2 public, cookie-less, token-only routes.
 *
 * Genuinely needs TWO deps objects, mirroring `modules/members.ts`'s exact rationale: the public
 * confirm/unsubscribe family must never carry an `authorize`/session field (REQ-30/INV-09 — a
 * visitor clicking an email link has no admin session), while the admin family needs the full
 * session-gated surface. `app.ts`/`deps.ts` build each object from the SAME underlying repo/port
 * instances (so both families read/write the identical `p_newsletter__*` rows), never two
 * disconnected composition subtrees.
 */
export function createNewsletterModule(deps: {
  admin: NewsletterRouteDeps;
  public: NewsletterPublicRouteDeps;
}): ServerModuleHandle {
  return {
    name: "newsletter",
    registerRoutes: (app) => {
      // Campaign routes.
      registerAdminNewsletterListCampaignsRoute(app, deps.admin);
      registerAdminNewsletterGetCampaignRoute(app, deps.admin);
      registerAdminNewsletterCreateCampaignRoute(app, deps.admin);
      registerAdminNewsletterUpdateCampaignRoute(app, deps.admin);
      registerAdminNewsletterCancelCampaignRoute(app, deps.admin);
      registerAdminNewsletterScheduleCampaignRoute(app, deps.admin);
      registerAdminNewsletterSendCampaignRoute(app, deps.admin);
      registerAdminNewsletterSendTestCampaignRoute(app, deps.admin);
      registerAdminNewsletterPauseCampaignRoute(app, deps.admin);
      registerAdminNewsletterResumeCampaignRoute(app, deps.admin);
      // List routes.
      registerAdminNewsletterListListsRoute(app, deps.admin);
      registerAdminNewsletterCreateListRoute(app, deps.admin);
      registerAdminNewsletterArchiveListRoute(app, deps.admin);
      // Subscription routes.
      registerAdminNewsletterListSubscriptionsRoute(app, deps.admin);
      registerAdminNewsletterCreateSubscriptionRoute(app, deps.admin);
      registerAdminNewsletterRemoveSubscriptionRoute(app, deps.admin);
      registerAdminNewsletterImportSubscriptionsRoute(app, deps.admin);
      // Confirmation + send-log.
      registerAdminNewsletterResendConfirmationRoute(app, deps.admin);
      registerAdminNewsletterListSendLogRoute(app, deps.admin);
      // Public, cookie-less, token-only routes (outside /api/admin's session gate).
      registerPublicNewsletterConfirmRoute(app, deps.public);
      registerPublicNewsletterUnsubscribeRoute(app, deps.public);
    },
  };
}
