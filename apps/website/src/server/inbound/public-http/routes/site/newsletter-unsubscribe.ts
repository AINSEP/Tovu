import { reportServerFailure } from "#src/server/inbound/shared/admin-failure";
import type { Express } from "express";

import { processUnsubscribe } from "@jini-ai/user-management/newsletter/unsubscribe";
import { newsletterUnsubscribeGetRoute, newsletterUnsubscribePostRoute } from "@jini-ai/user-management/public-http/routes/newsletter/unsubscribe";
import { mountPublicRawRoute } from "#src/server/inbound/admin-http/admin-raw-route-ports";
import { toPublicUnsubscribeDeps, type NewsletterPublicRouteDeps } from "./newsletter-deps.js";
import { currentNewsletterRequest, newsletterPublicApp } from "./newsletter-public-scope.js";

/**
 * `GET|POST /newsletter/unsubscribe?token=...` — the Jini specs (`@jini-ai/user-management/public-http/routes/newsletter/unsubscribe`)
 * own the steps and the pages (one handler for both methods, RFC 8058 one-click `POST` included); Tovu binds
 * the unsubscribe service and incident tracker. Public, cookie-less, no-login by design: never reads or sets a
 * session cookie. Everything is read per request, as the hand-written route did.
 */
export function registerPublicNewsletterUnsubscribeRoute({ app, deps }: { app: Express; deps: NewsletterPublicRouteDeps }, _optional: Record<string, never> = {}): void {
  const routeDeps = {
    ready: () => deps.newsletterReady,
    unsubscribe: ({ rawToken }: { rawToken: string }) => processUnsubscribe({ deps: toPublicUnsubscribeDeps(deps), input: { rawToken } }),
    reportFailure: ({ error }: { error: unknown }) => reportServerFailure({ error, operation: "public:newsletter-unsubscribe" }, { tracker: currentNewsletterRequest().res.locals.adminFailureTracker, reporter: currentNewsletterRequest().res.locals.failureReporter }),
  };
  const failure = { operation: "public:newsletter-unsubscribe", visitorError: "The site couldn’t complete unsubscription." };
  const scoped = newsletterPublicApp({ app });
  mountPublicRawRoute({ app: scoped, spec: newsletterUnsubscribeGetRoute, deps: routeDeps, failure });
  mountPublicRawRoute({ app: scoped, spec: newsletterUnsubscribePostRoute, deps: routeDeps, failure });
}
