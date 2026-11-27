import { reportServerFailure } from "#src/server/inbound/shared/admin-failure";
import { captureVisitorEvent } from "@jini-ai/analytics/site/visitor-analytics";
import type { Express } from "express";

import { consumeConfirmationToken } from "#src/features/newsletter/confirmation";
import { newsletterConfirmRoute } from "@jini-ai/user-management/public-http/routes/newsletter/confirm";
import { mountPublicRawRoute } from "#src/server/inbound/admin-http/admin-raw-route-ports";
import { toPublicConfirmationDeps, type NewsletterPublicRouteDeps } from "./newsletter-deps.js";
import { currentNewsletterRequest, newsletterPublicApp } from "./newsletter-public-scope.js";

/**
 * `GET /newsletter/confirm?token=...` — the Jini spec (`@jini-ai/user-management/public-http/routes/newsletter/confirm`)
 * owns the steps and the three pages; Tovu binds its confirmation service, visitor analytics and incident
 * tracker. Public, cookie-less, no-login by design: this registrar must NEVER read or set a session cookie.
 * Everything is read per request, as the hand-written route did: tests swap repository methods after registration.
 */
export function registerPublicNewsletterConfirmRoute({ app, deps }: { app: Express; deps: NewsletterPublicRouteDeps }, _optional: Record<string, never> = {}): void {
  mountPublicRawRoute({
    app: newsletterPublicApp({ app }),
    spec: newsletterConfirmRoute,
    deps: {
      ready: () => deps.newsletterReady,
      consume: ({ rawToken }) => consumeConfirmationToken({ deps: toPublicConfirmationDeps(deps), input: { workspaceId: deps.workspaceId, rawToken } }),
      onSubscribed: ({ listId, eventId }) => {
        void captureVisitorEvent({ deps, request: currentNewsletterRequest().req, name: "newsletter_subscribed", properties: { listId, method: "double_opt_in", eventId } });
      },
      reportFailure: ({ error }) => reportServerFailure({ error, operation: "public:newsletter-confirm" }, { tracker: currentNewsletterRequest().res.locals.adminFailureTracker, reporter: currentNewsletterRequest().res.locals.failureReporter }),
    },
    failure: { operation: "public:newsletter-confirm", visitorError: "The site couldn’t complete subscription confirmation." },
  });
}
