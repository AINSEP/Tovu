import { registerAdminNewsletterArchiveListRoute } from "#src/server/inbound/admin-http/routes/newsletter/archive-list";
import { registerAdminNewsletterCancelCampaignRoute } from "#src/server/inbound/admin-http/routes/newsletter/cancel-campaign";
import { registerAdminNewsletterCreateCampaignRoute } from "#src/server/inbound/admin-http/routes/newsletter/create-campaign";
import { registerAdminNewsletterCreateListRoute } from "#src/server/inbound/admin-http/routes/newsletter/create-list";
import { registerAdminNewsletterCreateSubscriptionRoute } from "#src/server/inbound/admin-http/routes/newsletter/create-subscription";
import type { NewsletterRouteDeps } from "#src/server/inbound/admin-http/routes/newsletter/deps";
import { registerAdminNewsletterGetCampaignRoute } from "#src/server/inbound/admin-http/routes/newsletter/get-campaign";
import { registerAdminNewsletterImportSubscriptionsRoute } from "#src/server/inbound/admin-http/routes/newsletter/import-subscriptions";
import { registerAdminNewsletterListCampaignsRoute } from "#src/server/inbound/admin-http/routes/newsletter/list-campaigns";
import { registerAdminNewsletterListListsRoute } from "#src/server/inbound/admin-http/routes/newsletter/list-lists";
import { registerAdminNewsletterListSendLogRoute } from "#src/server/inbound/admin-http/routes/newsletter/list-send-log";
import { registerAdminNewsletterListSubscriptionsRoute } from "#src/server/inbound/admin-http/routes/newsletter/list-subscriptions";
import { registerAdminNewsletterPauseCampaignRoute } from "#src/server/inbound/admin-http/routes/newsletter/pause-campaign";
import { registerAdminNewsletterRemoveSubscriptionRoute } from "#src/server/inbound/admin-http/routes/newsletter/remove-subscription";
import { registerAdminNewsletterResendConfirmationRoute } from "#src/server/inbound/admin-http/routes/newsletter/resend-confirmation";
import { registerAdminNewsletterResumeCampaignRoute } from "#src/server/inbound/admin-http/routes/newsletter/resume-campaign";
import { registerAdminNewsletterScheduleCampaignRoute } from "#src/server/inbound/admin-http/routes/newsletter/schedule-campaign";
import { registerAdminNewsletterSendCampaignRoute } from "#src/server/inbound/admin-http/routes/newsletter/send-campaign";
import { registerAdminNewsletterSendTestCampaignRoute } from "#src/server/inbound/admin-http/routes/newsletter/send-test-campaign";
import { registerAdminNewsletterUpdateCampaignRoute } from "#src/server/inbound/admin-http/routes/newsletter/update-campaign";
import { registerPublicNewsletterConfirmRoute } from "#src/server/inbound/public-http/routes/site/newsletter-confirm";
import type { NewsletterPublicRouteDeps } from "#src/server/inbound/public-http/routes/site/newsletter-deps";
import { registerPublicNewsletterUnsubscribeRoute } from "#src/server/inbound/public-http/routes/site/newsletter-unsubscribe";
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
