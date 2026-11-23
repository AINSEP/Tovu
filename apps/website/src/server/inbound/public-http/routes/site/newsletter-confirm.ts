import { reportServerFailure } from "#src/server/inbound/shared/admin-failure";
import { captureVisitorEvent } from "../../visitor-analytics.js";
import type { Express } from "express";

import { consumeConfirmationToken } from "#src/features/newsletter/confirmation";
import { NewsletterConfirmTokenInvalidError, NewsletterConsentUnavailableError } from "#src/features/newsletter/index";
import { escapeHtml } from "#src/platform/html/escape";
import { toPublicConfirmationDeps, type NewsletterPublicRouteDeps } from "./newsletter-deps.js";
import { asyncRoute } from "../../../../../platform/express/async-route.js";

/**
 * @file `CONFIRM_SUBSCRIPTION` (api.spec.md §1a) — `GET /newsletter/confirm?token=...`. Public,
 * cookie-less, no-login by design (§1a's "same cookie-less, no-admin-authority origin lineage as
 * ADR-020/025/027's isolation pattern"): this route family must NEVER read or set a session cookie,
 * and must never import `requireAdminSession`/`getAuthedPrincipal` (mirrors `routes/members/
 * sign-in.ts`'s ADR-PIPE-013 Enforcement note). Renders an HTML page (a human clicks this link),
 * not JSON.
 */
export function registerPublicNewsletterConfirmRoute({ app, deps }: { app: Express; deps: NewsletterPublicRouteDeps }, _optional: Record<string, never> = {}): void {
  app.get("/newsletter/confirm", asyncRoute({ handler: async (req, res) => {
    await deps.newsletterReady;
    const token = typeof req.query.token === "string" ? req.query.token : "";

    try {
      const result = await consumeConfirmationToken({
        deps: toPublicConfirmationDeps(deps),
        input: { workspaceId: deps.workspaceId, rawToken: token },
      });
      if (result.changed) void captureVisitorEvent({ deps, request: req, name: "newsletter_subscribed", properties: {
        listId: result.subscription.listId, method: "double_opt_in", eventId: result.eventId,
      } });
      res.status(200).type("html").send(renderPage({ title: "Subscription confirmed", message: "Your subscription is confirmed. You're all set." }));
    } catch (err) {
      if (err instanceof NewsletterConfirmTokenInvalidError) {
        res
          .status(400)
          .type("html")
          .send(renderPage({ title: "Confirmation link invalid", message: "This confirmation link is invalid or has expired. Please request a new one." }));
        return;
      }
      // Expected while consent is unbound: not a server fault, and the token stays unused (B176).
      if (err instanceof NewsletterConsentUnavailableError) {
        res.status(503).type("html").send(renderPage({ title: "Subscription not confirmed yet", message: "This subscription link can’t be confirmed right now. Ask the site owner." }));
        return;
      }
      const { errorId } = reportServerFailure({ error: err, operation: "public:newsletter-confirm" }, { tracker: res.locals.adminFailureTracker });
      res.status(500).type("html").send(renderPage({ title: "Subscription confirmation unavailable", message: `The site couldn’t complete subscription confirmation. Try the original action again and report this error ID if it keeps happening. Error ID: ${errorId}` }));
    }
  } }));
}

function renderPage({ title, message }: { title: string; message: string }, _optional = {}): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml({ text: title })}</title></head>
<body>
  <h1>${escapeHtml({ text: title })}</h1>
  <p>${escapeHtml({ text: message })}</p>
</body>
</html>`;
}
