import { isIP } from "node:net";
import type { Express } from "express";
import { resolveWorkspaceOrigin, toAbsoluteUrl } from "@jini-ai/cms/seo";
import type { OriginRegistryPort, VerifiedOrigin } from "@jini-ai/http-kit/verified-origin";

/** Select only the configured origin's www counterpart; local hosts and dev seeds are not aliases.
 * Returns no destination for any other Host. No I/O; O(h) time/space for host text of length h. */
function aliasDestination({ host, origin }: { host: string | undefined; origin: VerifiedOrigin | undefined }, _options = {}): string | undefined {
  if (!origin || origin.source === "dev-capability") return undefined;
  const canonical = new URL(toAbsoluteUrl({ origin, path: "/" }, {}));
  const bareHostname = canonical.hostname.replace(/^www\./, "");
  if (bareHostname === "localhost" || bareHostname.endsWith(".localhost") || isIP(bareHostname.replace(/^\[|\]$/g, ""))) return undefined;
  const alias = canonical.hostname.startsWith("www.") ? canonical.host.slice(4) : `www.${canonical.host}`;
  return host?.toLowerCase() === alias ? canonical.origin : undefined;
}

/** Keep public pages on the same origin as their canonical links and consent saves.
 * Uses SEO's stored-origin lookup; missing configuration leaves requests alone and registry errors
 * reach Express. Admin/API/health traffic is excluded before lookup. O(1) lookups per eligible request.
 */
export function applyCanonicalSiteHostRedirect(
  { app, ...originDeps }: { app: Express; originRegistry: OriginRegistryPort; workspaceId: string; runtimeMode: string },
  _options = {},
): void {
  app.use((req, res, next) => {
    // Health probes stay dependency-free (no origin lookup). An absolute-form request target
    // (`GET http://x/...`) is not a page path, so it is never appended onto the canonical origin.
    if (!["GET", "HEAD"].includes(req.method) || /^\/(?:admin|api|health|healthz|readyz)(?:\/|$)/i.test(req.path) || !req.originalUrl.startsWith("/")) {
      next();
      return;
    }
    void resolveWorkspaceOrigin(originDeps, {}).then(origin => {
      // Only Host participates: forwarded hosts must never widen the accepted alias.
      const destination = aliasDestination({ host: req.get("host"), origin });
      if (!destination) {
        next();
        return;
      }
      // Concatenate onto the trusted origin so even a //-prefixed path cannot replace its host.
      res.redirect(308, `${destination}${req.originalUrl}`);
    }).catch(next);
  });
}
