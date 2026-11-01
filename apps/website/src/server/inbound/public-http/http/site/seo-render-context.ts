import type { Request } from "express";
import type { SeoHostBindings } from "#src/features/seo/index";

/** Match Express's proxy decision for the authority, retaining the port that hostname omits. */
function servingHost({ req }: { req: Request }, _options = {}): string | undefined {
  const trust = req.app?.get("trust proxy fn");
  const forwarded = trust?.(req.socket?.remoteAddress, 0) ? req.get("x-forwarded-host") : undefined;
  return forwarded?.split(",", 1)[0]?.trim() ?? req.get("host");
}

/** Scope SEO to Express's serving context. Honor exactly its configured proxy trust, including ports.
 * This address formats response URLs only; it never grants redirect/egress trust or writes settings.
 * @complexity O(header bytes), pure; no registry mutation or additional I/O.
 */
export function seoForRequest({ req, deps }: { req: Request; deps: SeoHostBindings }, _options = {}): SeoHostBindings {
  if (typeof req.get !== "function") return deps;
  const host = servingHost({ req });
  // Direct handler tests can have no HTTP authority. Normal requests always supply Host.
  // A malformed Host (bad port, spaces) cannot form a URL: keep the stored-origin fallback, never fail the render.
  const base = `${req.protocol}://${host}`;
  if (!host || !URL.canParse(base)) return deps;
  return { ...deps, renderBaseUrl: new URL(base).origin };
}
