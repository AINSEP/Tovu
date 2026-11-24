import { reportServerFailure } from "#src/server/inbound/shared/admin-failure";
import type { Express, Request, Response } from "express";

import { processUnsubscribe } from "#src/features/newsletter/unsubscribe";
import { NewsletterUnsubscribeTokenInvalidError } from "#src/features/newsletter/index";
import { escapeHtml } from "@jini-ai/core/text";
import { toPublicUnsubscribeDeps, type NewsletterPublicRouteDeps } from "./newsletter-deps.js";
import { asyncRoute } from "../../../../../platform/express/async-route.js";

/**
 * @file `UNSUBSCRIBE` (api.spec.md §1a) — `GET|POST /newsletter/unsubscribe?token=...`. Public,
 * cookie-less, no-login by design, same isolation lineage as `newsletter-confirm.ts` — never reads
 * or sets a session cookie. `POST` is the RFC 8058 one-click path (the mail client itself, not this
 * server, is what stamps `List-Unsubscribe-Post: List-Unsubscribe=One-Click` on the ORIGINAL
 * outbound email so it knows a bare POST here needs no further confirmation) — "GET with the same
 * token is equally valid" (api.spec.md §4), so both methods share one handler. Idempotent on a
 * repeat click of an already-processed token (REQ-15/EC-03): `processUnsubscribe` itself returns
 * `already-unsubscribed` rather than throwing, and this route renders the SAME success page either way.
 */
export function registerPublicNewsletterUnsubscribeRoute({ app, deps }: { app: Express; deps: NewsletterPublicRouteDeps }, _optional: Record<string, never> = {}): void {
  const handler = async (req: Request, res: Response): Promise<void> => {
    await deps.newsletterReady;
    const token = typeof req.query.token === "string" ? req.query.token : "";

    try {
      await processUnsubscribe({ deps: toPublicUnsubscribeDeps(deps), input: { rawToken: token } });
      res
        .status(200)
        .type("html")
        .send(renderPage({ title: "You're unsubscribed", message: "You will no longer receive this newsletter. If this was a mistake, you can re-subscribe at any time." }));
    } catch (err) {
      if (err instanceof NewsletterUnsubscribeTokenInvalidError) {
        res
          .status(400)
          .type("html")
          .send(renderPage({ title: "Unsubscribe link invalid", message: "This unsubscribe link is invalid or has expired." }));
        return;
      }
      const { errorId } = reportServerFailure({ error: err, operation: "public:newsletter-unsubscribe" }, { tracker: res.locals.adminFailureTracker });
      res.status(500).type("html").send(renderPage({ title: "Unsubscription unavailable", message: `The site couldn’t complete unsubscription. Try the original action again and report this error ID if it keeps happening. Error ID: ${errorId}` }));
    }
  };

  app.get("/newsletter/unsubscribe", asyncRoute({ handler: handler }));
  app.post("/newsletter/unsubscribe", asyncRoute({ handler: handler }));
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
