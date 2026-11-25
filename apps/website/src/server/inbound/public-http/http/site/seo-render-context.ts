import type { Request } from "express";
import type { SeoHostBindings } from "#src/features/seo/index";
import { servingOriginFor } from "#src/server/inbound/shared/serving-origin";

/** Scope SEO to Express's serving context. Honor exactly its configured proxy trust, including ports.
 * This address formats response URLs only; it never grants redirect/egress trust or writes settings.
 * @complexity O(header bytes), pure; no registry mutation or additional I/O.
 */
export function seoForRequest({ req, deps }: { req: Request; deps: SeoHostBindings }, _options = {}): SeoHostBindings {
  // Direct handler tests can have no HTTP authority, and a malformed Host cannot form a URL:
  // both keep the stored-origin fallback, never fail the render.
  const origin = servingOriginFor({ req });
  return origin === undefined ? deps : { ...deps, renderBaseUrl: origin };
}
