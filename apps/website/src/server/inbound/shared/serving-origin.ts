import type { Request } from "express";

/** Match Express's proxy decision for the authority, retaining the port that hostname omits. */
function servingHost({ req }: { req: Request }, _options = {}): string | undefined {
  const trust = req.app?.get("trust proxy fn");
  const forwarded = trust?.(req.socket?.remoteAddress, 0) ? req.get("x-forwarded-host") : undefined;
  return forwarded?.split(",", 1)[0]?.trim() ?? req.get("host");
}

/**
 * The origin this request was served from, honoring exactly Express's configured proxy trust, including ports.
 * It formats response URLs only; it never grants redirect/egress trust or writes settings. The one owner of the
 * rule: `seoForRequest` (page renders) and `routeRequestFactsFor`'s `servingOrigin` (Jini public SEO specs) both read it.
 * @returns `undefined` when the request has no HTTP authority (a direct handler test) or a malformed Host
 *   (bad port, spaces) that cannot form a URL: callers then keep their stored-origin fallback, never fail.
 * @complexity O(header bytes), pure; no registry mutation or additional I/O.
 */
export function servingOriginFor({ req }: { req: Request }, _options = {}): string | undefined {
  if (typeof req.get !== "function") return undefined;
  const host = servingHost({ req });
  // Direct handler tests can have no HTTP authority. Normal requests always supply Host.
  // A malformed Host (bad port, spaces) cannot form a URL: keep the stored-origin fallback, never fail the render.
  const base = `${req.protocol}://${host}`;
  if (!host || !URL.canParse(base)) return undefined;
  return new URL(base).origin;
}
