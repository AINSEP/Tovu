import { registerAdminNewsletterArchiveListRoute } from "#src/server/inbound/admin-http/routes/newsletter/archive-list";
import { registerAdminNewsletterCreateListRoute } from "#src/server/inbound/admin-http/routes/newsletter/create-list";
import { registerAdminNewsletterCreateSubscriptionRoute } from "#src/server/inbound/admin-http/routes/newsletter/create-subscription";
import { registerAdminNewsletterImportSubscriptionsRoute } from "#src/server/inbound/admin-http/routes/newsletter/import-subscriptions";
import { registerAdminNewsletterListListsRoute } from "#src/server/inbound/admin-http/routes/newsletter/list-lists";
import { registerAdminNewsletterListSubscriptionsRoute } from "#src/server/inbound/admin-http/routes/newsletter/list-subscriptions";
import { registerAdminNewsletterRemoveSubscriptionRoute } from "#src/server/inbound/admin-http/routes/newsletter/remove-subscription";
import { registerAdminNewsletterResendConfirmationRoute } from "#src/server/inbound/admin-http/routes/newsletter/resend-confirmation";
import { registerPublicNewsletterConfirmRoute } from "#src/server/inbound/public-http/routes/site/newsletter-confirm";
import type { NewsletterPublicRouteDeps } from "#src/server/inbound/public-http/routes/site/newsletter-deps";
import { registerPublicNewsletterUnsubscribeRoute } from "#src/server/inbound/public-http/routes/site/newsletter-unsubscribe";
import { createConsoleLogger } from "@jini-ai/core/primitives";
import { newsletterCancelCampaignRoute } from "@jini-ai/cms/admin-http/routes/newsletter/cancel-campaign";
import { newsletterCreateCampaignRoute } from "@jini-ai/cms/admin-http/routes/newsletter/create-campaign";
import { newsletterGetCampaignRoute } from "@jini-ai/cms/admin-http/routes/newsletter/get-campaign";
import { newsletterListCampaignsRoute } from "@jini-ai/cms/admin-http/routes/newsletter/list-campaigns";
import { newsletterListSendLogRoute } from "@jini-ai/cms/admin-http/routes/newsletter/list-send-log";
import { newsletterPauseCampaignRoute } from "@jini-ai/cms/admin-http/routes/newsletter/pause-campaign";
import { newsletterResumeCampaignRoute } from "@jini-ai/cms/admin-http/routes/newsletter/resume-campaign";
import { newsletterScheduleCampaignRoute } from "@jini-ai/cms/admin-http/routes/newsletter/schedule-campaign";
import { newsletterSendCampaignRoute, type NewsletterSendPipeline } from "@jini-ai/cms/admin-http/routes/newsletter/send-campaign";
import { newsletterSendTestCampaignRoute } from "@jini-ai/cms/admin-http/routes/newsletter/send-test-campaign";
import { newsletterUpdateCampaignRoute } from "@jini-ai/cms/admin-http/routes/newsletter/update-campaign";
import { cancelCampaign, saveCampaign, scheduleCampaign } from "#src/features/newsletter/campaign-write-service";
import { newsletterErrorResponse } from "#src/features/newsletter/http-error-responses";
import { authorizeSend, claimBatch, freezeAudience, pauseCampaign, resumeCampaign, sendTestCampaign, type SendPipelineDeps } from "#src/features/newsletter/send-pipeline";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { toCampaignWriteServiceDeps, toSendPipelineDeps, type NewsletterRouteDeps } from "#src/server/inbound/admin-http/routes/newsletter/deps";
import type { RouteRegistrar } from "#src/server/routes/types";
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
    registerRoutes: ({ app }, _options = {}) => {
      // Campaign routes.
      registerAdminNewsletterListCampaignsRoute({ app, deps: deps.admin });
      registerAdminNewsletterGetCampaignRoute({ app, deps: deps.admin });
      registerAdminNewsletterCreateCampaignRoute({ app, deps: deps.admin });
      registerAdminNewsletterUpdateCampaignRoute({ app, deps: deps.admin });
      registerAdminNewsletterCancelCampaignRoute({ app, deps: deps.admin });
      registerAdminNewsletterScheduleCampaignRoute({ app, deps: deps.admin });
      registerAdminNewsletterSendCampaignRoute({ app, deps: deps.admin });
      registerAdminNewsletterSendTestCampaignRoute({ app, deps: deps.admin });
      registerAdminNewsletterPauseCampaignRoute({ app, deps: deps.admin });
      registerAdminNewsletterResumeCampaignRoute({ app, deps: deps.admin });
      // List routes.
      registerAdminNewsletterListListsRoute({ app, deps: deps.admin });
      registerAdminNewsletterCreateListRoute({ app, deps: deps.admin });
      registerAdminNewsletterArchiveListRoute({ app, deps: deps.admin });
      // Subscription routes.
      registerAdminNewsletterListSubscriptionsRoute({ app, deps: deps.admin });
      registerAdminNewsletterCreateSubscriptionRoute({ app, deps: deps.admin });
      registerAdminNewsletterRemoveSubscriptionRoute({ app, deps: deps.admin });
      registerAdminNewsletterImportSubscriptionsRoute({ app, deps: deps.admin });
      // Confirmation + send-log.
      registerAdminNewsletterResendConfirmationRoute({ app, deps: deps.admin });
      registerAdminNewsletterListSendLogRoute({ app, deps: deps.admin });
      // Public, cookie-less, token-only routes (outside /api/admin's session gate).
      registerPublicNewsletterConfirmRoute({ app, deps: deps.public });
      registerPublicNewsletterUnsubscribeRoute({ app, deps: deps.public });
    },
  };
}

const consoleLogger = createConsoleLogger({ prefix: "" });

/**
 * K1 (RT-K1-adm-newsletter): the eleven campaign + send-log routes are Jini route specs
 * (`@jini-ai/cms/admin-http/routes/newsletter/*`) mounted behind the admin ports. `NewsletterRouteDeps`
 * is read only here, at registration: each mount builds that route's own small deps object. The
 * newsletter domain is this host's, so every service a spec calls (campaign-write-service,
 * send-pipeline) is bound here with its deps bundle, as is the typed-error table
 * (`features/newsletter/http-error-responses.ts`).
 */

/** Every newsletter mount answers an unexpected failure with the copy the hand-written routes' shared
 *  `newsletterErrorToResponse` fallback used (operation `http/newsletter`, code `INTERNAL_ERROR`), and
 *  authorizes `"direct"`: `requireNewsletterPermissionOrRespond` called `authorizeDirectOrRespond`, so
 *  a publishing credential's grant was never consulted. Switching that is an authorization change. */
const NEWSLETTER_MOUNT = { authorization: "direct", failure: { operation: "http/newsletter" } } as const;

/** The port fields plus the base newsletter deps every spec reads. `authorize` is read per request, as
 *  the hand-written routes read `deps.authorize`, so a later reassignment of it is still honoured. */
function newsletterBaseDeps({ deps }: { deps: NewsletterRouteDeps }, _optional: Record<string, never> = {}) {
  const portDeps: AdminJsonRoutePortDeps = { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
  return { ...portDeps, newsletterReady: deps.newsletterReady, mapNewsletterError: newsletterErrorResponse };
}

/** `campaign-write-service.ts`'s functions with their deps bundle bound per call, as the routes built it. */
function campaignWriteDeps({ deps }: { deps: NewsletterRouteDeps }, _optional: Record<string, never> = {}) {
  return {
    saveCampaign: (input: Parameters<typeof saveCampaign>[0]["input"]) => saveCampaign({ deps: toCampaignWriteServiceDeps(deps), input }),
    scheduleCampaign: (input: Parameters<typeof scheduleCampaign>[0]["input"]) => scheduleCampaign({ deps: toCampaignWriteServiceDeps(deps), input }),
    cancelCampaign: (input: Parameters<typeof cancelCampaign>[0]["input"]) => cancelCampaign({ deps: toCampaignWriteServiceDeps(deps), input }),
  };
}

/** One request's send pipeline: `authorizeSend` -> `freezeAudience` -> `claimBatch` over ONE deps bundle. */
function bindSendPipeline({ pipelineDeps }: { pipelineDeps: SendPipelineDeps }, _optional: Record<string, never> = {}): NewsletterSendPipeline {
  return {
    authorizeSend: (input) => authorizeSend({ deps: pipelineDeps, input }),
    freezeAudience: (input) => freezeAudience({ deps: pipelineDeps, input }),
    claimBatch: () => claimBatch({ deps: pipelineDeps }),
  };
}

export const registerAdminNewsletterListCampaignsRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as NewsletterRouteDeps;
  mountAdminJsonRoute({ app, spec: newsletterListCampaignsRoute, deps: { ...newsletterBaseDeps({ deps }), newsletterCampaignRepo: deps.newsletterCampaignRepo } }, NEWSLETTER_MOUNT);
};

export const registerAdminNewsletterGetCampaignRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as NewsletterRouteDeps;
  mountAdminJsonRoute({ app, spec: newsletterGetCampaignRoute, deps: { ...newsletterBaseDeps({ deps }), newsletterCampaignRepo: deps.newsletterCampaignRepo } }, NEWSLETTER_MOUNT);
};

export const registerAdminNewsletterCreateCampaignRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as NewsletterRouteDeps;
  mountAdminJsonRoute({ app, spec: newsletterCreateCampaignRoute, deps: { ...newsletterBaseDeps({ deps }), saveCampaign: campaignWriteDeps({ deps }).saveCampaign } }, NEWSLETTER_MOUNT);
};

export const registerAdminNewsletterUpdateCampaignRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as NewsletterRouteDeps;
  const updateDeps = { ...newsletterBaseDeps({ deps }), newsletterCampaignRepo: deps.newsletterCampaignRepo, saveCampaign: campaignWriteDeps({ deps }).saveCampaign };
  mountAdminJsonRoute({ app, spec: newsletterUpdateCampaignRoute, deps: updateDeps }, NEWSLETTER_MOUNT);
};

export const registerAdminNewsletterCancelCampaignRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as NewsletterRouteDeps;
  mountAdminJsonRoute({ app, spec: newsletterCancelCampaignRoute, deps: { ...newsletterBaseDeps({ deps }), cancelCampaign: campaignWriteDeps({ deps }).cancelCampaign } }, NEWSLETTER_MOUNT);
};

export const registerAdminNewsletterScheduleCampaignRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as NewsletterRouteDeps;
  const scheduleDeps = { ...newsletterBaseDeps({ deps }), clock: deps.clock, scheduleCampaign: campaignWriteDeps({ deps }).scheduleCampaign };
  mountAdminJsonRoute({ app, spec: newsletterScheduleCampaignRoute, deps: scheduleDeps }, NEWSLETTER_MOUNT);
};

/** Composition seams for {@link createAdminNewsletterSendCampaignRoute}. */
export interface SendCampaignRouteOptions {
  /**
   * Builds the send pipeline's deps from the route deps. Production wires `deps.ts`'s
   * `toSendPipelineDeps`, whose Launch Gate precondition (a) is hard-wired off; a caller that owns a
   * real `sending_enabled` source (or a test) passes its own builder to reach the 202 path.
   */
  buildSendPipelineDeps?: (deps: NewsletterRouteDeps) => SendPipelineDeps;
}

/** `SEND_CAMPAIGN` with its pipeline-deps seam. In practice the production builder's Launch Gate
 *  always blocks (409): no `sending_enabled` toggle exists yet (see `deps.ts`'s `toSendPipelineDeps`). */
export function createAdminNewsletterSendCampaignRoute(optional: SendCampaignRouteOptions = {}): RouteRegistrar {
  const { buildSendPipelineDeps = toSendPipelineDeps } = optional;
  return ({ app, deps: routeDeps }, _options = {}) => {
    const deps = routeDeps as NewsletterRouteDeps;
    const sendDeps = {
      ...newsletterBaseDeps({ deps }),
      // Built per request, after boot readiness, as the hand-written route built it.
      openSendPipeline: () => bindSendPipeline({ pipelineDeps: buildSendPipelineDeps(deps) }),
      reportDeliveryFailure: ({ message }: { message: string }) => consoleLogger.error({ message }),
    };
    mountAdminJsonRoute({ app, spec: newsletterSendCampaignRoute, deps: sendDeps }, NEWSLETTER_MOUNT);
  };
}

/** The production `SEND_CAMPAIGN` registrar — {@link createAdminNewsletterSendCampaignRoute} with its default seams. */
export const registerAdminNewsletterSendCampaignRoute: RouteRegistrar = createAdminNewsletterSendCampaignRoute();

export const registerAdminNewsletterSendTestCampaignRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as NewsletterRouteDeps;
  const sendTestDeps = {
    ...newsletterBaseDeps({ deps }),
    sendTestCampaign: (input: Parameters<typeof sendTestCampaign>[0]["input"]) => sendTestCampaign({ deps: toSendPipelineDeps(deps), input }),
  };
  mountAdminJsonRoute({ app, spec: newsletterSendTestCampaignRoute, deps: sendTestDeps }, NEWSLETTER_MOUNT);
};

export const registerAdminNewsletterPauseCampaignRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as NewsletterRouteDeps;
  const pauseDeps = { ...newsletterBaseDeps({ deps }), pauseCampaign: (input: { workspaceId: string; campaignId: string }) => pauseCampaign({ deps: toSendPipelineDeps(deps), input }) };
  mountAdminJsonRoute({ app, spec: newsletterPauseCampaignRoute, deps: pauseDeps }, NEWSLETTER_MOUNT);
};

export const registerAdminNewsletterResumeCampaignRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as NewsletterRouteDeps;
  const resumeDeps = { ...newsletterBaseDeps({ deps }), resumeCampaign: (input: { workspaceId: string; campaignId: string }) => resumeCampaign({ deps: toSendPipelineDeps(deps), input }) };
  mountAdminJsonRoute({ app, spec: newsletterResumeCampaignRoute, deps: resumeDeps }, NEWSLETTER_MOUNT);
};

export const registerAdminNewsletterListSendLogRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as NewsletterRouteDeps;
  const sendLogDeps = { ...newsletterBaseDeps({ deps }), newsletterCampaignRepo: deps.newsletterCampaignRepo, newsletterSendRepo: deps.newsletterSendRepo };
  mountAdminJsonRoute({ app, spec: newsletterListSendLogRoute, deps: sendLogDeps }, NEWSLETTER_MOUNT);
};
