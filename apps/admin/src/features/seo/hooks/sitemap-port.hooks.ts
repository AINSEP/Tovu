/**
 * @file What `useSitemapModal` needs from the outside world — a single method, deliberately NOT
 * folded into `SeoPort` (`seo-port.hooks.ts`): every other `SeoPort` method calls the authenticated
 * `/api/admin/v1/...` surface via `lib/api.ts`'s `api` client, but `GET /sitemap.xml` is the
 * public, unauthenticated route real crawlers hit (`server/inbound/public-http/routes/site/
 * sitemap.ts`) — a different origin/auth shape, so it gets its own narrow port rather than
 * widening `SeoPort` with a method that doesn't share its contract.
 */
export interface SitemapPort {
  /** Fetches the exact response body `GET /sitemap.xml` serves — the SAME bytes a crawler gets, so
   *  `SitemapModal.tsx`'s "Raw XML" view is never an approximation of what ships. Rejects with a
   *  descriptive `Error` on a network failure or a non-2xx/non-XML response. */
  fetchSitemapXml(): Promise<{ text: string }>;
}
