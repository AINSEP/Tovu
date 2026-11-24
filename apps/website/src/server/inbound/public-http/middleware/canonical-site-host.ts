import type { Express } from "express";
import { resolveWorkspaceOrigin, toAbsoluteUrl } from "@jini-ai/cms/seo";
import { canonicalSiteHostRedirectLocation, isCanonicalSiteHostCandidate } from "@jini-ai/cms/public-http/middleware/canonical-site-host";
import type { OriginRegistryPort } from "@jini-ai/core/contracts/server/verified-origin";

/** Express adapter for the canonical-host redirect; the eligibility and destination decisions (and
 * their reasoning) live in `@jini-ai/cms/public-http/middleware/canonical-site-host`. Uses SEO's
 * stored-origin lookup; ineligible requests pass on before any lookup and registry errors reach Express.
 */
export function applyCanonicalSiteHostRedirect(
  { app, ...originDeps }: { app: Express; originRegistry: OriginRegistryPort; workspaceId: string; runtimeMode: string },
  _options = {},
): void {
  app.use((req, res, next) => {
    if (!isCanonicalSiteHostCandidate({ method: req.method, path: req.path, originalUrl: req.originalUrl })) {
      next();
      return;
    }
    void resolveWorkspaceOrigin(originDeps, {}).then(origin => {
      const location = canonicalSiteHostRedirectLocation({ host: req.get("host"), originalUrl: req.originalUrl, origin, toAbsoluteUrl });
      if (!location) {
        next();
        return;
      }
      res.redirect(308, location);
    }).catch(next);
  });
}
