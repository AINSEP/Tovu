import type { Express } from "express";

import { consumeConfirmationToken } from "#src/features/newsletter/confirmation";
import { NewsletterConfirmTokenInvalidError } from "#src/features/newsletter/index";
import { toPublicConfirmationDeps, type NewsletterPublicRouteDeps } from "./newsletter-deps.js";

/**
 * @file `CONFIRM_SUBSCRIPTION` (api.spec.md §1a) — `GET /newsletter/confirm?token=...`. Public,
 * cookie-less, no-login by design (§1a's "same cookie-less, no-admin-authority origin lineage as
 * ADR-020/025/027's isolation pattern"): this route family must NEVER read or set a session cookie,
 * and must never import `requireAdminSession`/`getAuthedPrincipal` (mirrors `routes/members/
 * sign-in.ts`'s ADR-PIPE-013 Enforcement note). Renders an HTML page (a human clicks this link),
 * not JSON.
 */
export function registerPublicNewsletterConfirmRoute(app: Express, deps: NewsletterPublicRouteDeps): void {
  app.get("/newsletter/confirm", async (req, res) => {
    await deps.newsletterReady;
    const token = typeof req.query.token === "string" ? req.query.token : "";

    try {
      await consumeConfirmationToken({
        deps: toPublicConfirmationDeps(deps),
        input: { workspaceId: deps.workspaceId, rawToken: token },
      });
      res.status(200).type("html").send(renderPage("Subscription confirmed", "Your subscription is confirmed. You're all set."));
    } catch (err) {
      if (err instanceof NewsletterConfirmTokenInvalidError) {
        res
          .status(400)
          .type("html")
          .send(renderPage("Confirmation link invalid", "This confirmation link is invalid or has expired. Please request a new one."));
        return;
      }
      res.status(500).type("html").send(renderPage("Something went wrong", "Unexpected server error."));
    }
  });
}

function renderPage(title: string, message: string): string {
  const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(message)}</p>
</body>
</html>`;
}
