import type { Express } from "express";
import {
  canonicalSiteHostRedirectLocation,
  isCanonicalSiteHostCandidate,
  type CanonicalSiteHostOriginDeps,
} from "@jini-ai/cms/public-http/middleware/canonical-site-host";

/** Express adapter for the canonical-host redirect; the eligibility and destination decisions (and
 * their reasoning) live in `@jini-ai/cms/public-http/middleware/canonical-site-host`. Ineligible
 * requests pass on synchronously; registry errors reach Express.
 */
export function applyCanonicalSiteHostRedirect(
  { app, ...originDeps }: { app: Express } & CanonicalSiteHostOriginDeps,
  _options = {},
): void {
  app.use((req, res, next) => {
    if (!isCanonicalSiteHostCandidate({ method: req.method, path: req.path, originalUrl: req.originalUrl })) {
      next();
      return;
    }
    void canonicalSiteHostRedirectLocation({ ...originDeps, host: req.get("host"), originalUrl: req.originalUrl }).then(location => {
      if (!location) {
        next();
        return;
      }
      res.redirect(308, location);
    }).catch(next);
  });
}
