import { reportServerFailure } from "#src/server/inbound/shared/admin-failure";
import { captureVisitorEvent } from "@jini-ai/analytics/site/visitor-analytics";
import type { Express } from "express";

import { consumeConfirmationToken } from "@jini-ai/user-management/newsletter/confirmation";
import { newsletterConfirmRoute } from "@jini-ai/user-management/public-http/routes/newsletter/confirm";
import { mountPublicRawRoute } from "#src/server/inbound/admin-http/admin-raw-route-ports";
import { toPublicConfirmationDeps, type NewsletterPublicRouteDeps } from "./newsletter-deps.js";

/**
 * `GET /newsletter/confirm?token=...` — the Jini spec (`@jini-ai/user-management/public-http/routes/newsletter/confirm`)
 * owns the steps and the three pages; Tovu binds its confirmation service, visitor analytics and incident
 * tracker. Public, cookie-less, no-login by design: this registrar must NEVER read or set a session cookie.
 * Everything is read per request, as the hand-written route did: tests swap repository methods after registration.
 */
export function registerPublicNewsletterConfirmRoute({ app, deps }: { app: Express; deps: NewsletterPublicRouteDeps }, _optional: Record<string, never> = {}): void {
  mountPublicRawRoute({
    app, handlerName: "forwardRejection",
    spec: newsletterConfirmRoute,
    deps: {
      ready: () => deps.newsletterReady,
      consume: ({ rawToken }) => consumeConfirmationToken({ deps: toPublicConfirmationDeps(deps), input: { workspaceId: deps.workspaceId, rawToken } }),
      onSubscribed: (_required: { listId: string; eventId: string }): void => { throw new Error("bound per request by requestDeps"); },
      reportFailure: (_required: { error: unknown }): { errorId: string } => { throw new Error("bound per request by requestDeps"); },
    },
    failure: { operation: "public:newsletter-confirm", visitorError: "The site couldn’t complete subscription confirmation." },
  }, {
    requestDeps: ({ req, res, deps: base }) => ({ ...base,
      onSubscribed: ({ listId, eventId }) => {
        void captureVisitorEvent({ deps, request: req, name: "newsletter_subscribed", properties: { listId, method: "double_opt_in", eventId } });
      },
      reportFailure: ({ error }) => reportServerFailure({ error, operation: "public:newsletter-confirm" }, { tracker: res.locals.adminFailureTracker, reporter: res.locals.failureReporter }),
    }),
  });
}
