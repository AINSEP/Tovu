import { siteUrl } from "../../../lib/site-url";
import type { SitemapPort } from "./sitemap-port.hooks";

/**
 * @file The only place under `features/seo/hooks` that reaches the public `/sitemap.xml` route
 * directly — see `sitemap-port.hooks.ts` for why this is a separate port from `SeoPort`.
 *
 * Uses `siteUrl()` (`lib/site-url.ts`), the same helper the admin already has for "link to a page
 * on the public Tovu site, not the admin SPA": in production the admin SPA and the public site are
 * one server/one origin, so a relative path is correct; when Vite serves the admin SPA on its own
 * origin (:5173 by default) it knows nothing about `/sitemap.xml`, so `siteUrl` resolves an
 * absolute `http://localhost:3000/sitemap.xml` instead. (Not every dev bundle: under `apps/desktop`'s
 * same-origin `/admin/*` proxy `siteUrl` stays relative, and this fetch is then answered by the site
 * server itself — see `lib/admin-dev-origin.ts`.) That cross-origin dev request is already
 * permitted — `server/inbound/shared/dev-cors.ts`'s `applyDevCors` reflects any `localhost`/
 * `127.0.0.1` origin for `GET`, mounted unconditionally in `createApp()` — so this needed no new
 * Vite proxy entry and no new server-side change.
 */

/** The live implementation, as a module-level singleton — matches `defaultSeoPort`
 *  (`seo-dependencies.hooks.ts`)'s own singleton convention. */
export const defaultSitemapPort: SitemapPort = {
  async fetchSitemapXml() {
    const res = await fetch(siteUrl("/sitemap.xml"), { credentials: "same-origin" });
    // Same defensive shape `getAssistantDaemonReadyz` (`lib/api.ts`) uses for its own
    // non-`request()` fetch: a non-XML response means something ELSE answered (a dev-proxy gap, a
    // stale build, a captive portal's own error page), not the real route — surfacing that as a
    // clear message beats `res.text()` handing back an HTML 404 page that `parseSitemapXml` would
    // then silently read as "zero URLs".
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.includes("xml")) {
      throw new Error(`Could not load the sitemap (HTTP ${res.status}).`);
    }
    return { text: await res.text() };
  },
};

/** Seed state for {@link createFakeSitemapPort}. */
export interface FakeSitemapPortOptions {
  /** The response body to hand back. Defaults to a well-formed, empty `<urlset>`. */
  text?: string;
  /** When set, `fetchSitemapXml()` rejects with this message instead of resolving. */
  error?: string;
}

/** An in-memory {@link SitemapPort} for tests — mirrors `createFakeSeoPort`'s own role. */
export function createFakeSitemapPort(options: FakeSitemapPortOptions = {}): SitemapPort {
  return {
    async fetchSitemapXml() {
      if (options.error !== undefined) throw new Error(options.error);
      return {
        text:
          options.text ??
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n`,
      };
    },
  };
}
