import type { Express } from "express";

import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file ADR-046 Phase 3 (SPEC-042, final slice) — narrow `RouteDeps` slice for the `seo` server
 * module (SPEC-008 SEO).
 *
 * Purpose:
 * Covers the 6 admin SEO registrars (`get-entry.ts`/`put-entry.ts`/`get-entry-analyze.ts`/
 * `get-settings.ts`/`put-settings.ts`/`post-sitemap-regenerate.ts`) PLUS the 2 public registrars
 * that live outside `routes/admin/seo/` (`registerSeoSitemapRoute` in `routes/site/sitemap.ts`,
 * `registerSeoRobotsRoute` in `routes/site/robots.ts`) — mirrors `media.ts`'s precedent of
 * bundling a public route into an otherwise-admin module. Read all 8 files directly.
 *
 * Every one of the 10 registrars awaits `deps.seoReady` first and reads `deps.workspaceId`/
 * `deps.settingsRepo`. The admin routes additionally read `deps.authorize`. 5 of the 10
 * (`get-entry.ts`/`put-entry.ts`/`get-entry-analyze.ts`/`post-sitemap-regenerate.ts`/
 * `sitemap.ts`) previously passed this bag as the media dependency. They now use `seoDeps`'s
 * bindings to those same post/media owners in Jini/packages/cms/src/seo. `sitemapService` keeps
 * routes/tools/subscriptions on one app's cache. `put-settings.ts` reads `deps.clock`/`deps.idGen`/
 * `deps.principalRepo`. This is a genuine narrowing (mirrors `routes/admin/taxonomy/deps.ts`'s
 * identical rationale), not a `RouteDeps`-widening extension.
 */
export type SeoRouteDeps = Pick<
  RouteDeps,
  | "workspaceId"
  | "authorize"
  | "clock"
  | "idGen"
  | "seoReady"
  | "seoDeps"
  | "sitemapService"
  | "postRepo"
  | "settingsRepo"
  | "principalRepo"
  | "mediaRepo"
  // 2026-10-05: `put-entry.ts`/`put-settings.ts` refuse a non-image share image
  // (`seoImageRefRefusal`), which reads each asset's recorded content type.
  | "mediaContentTypeStore"
  | "assetRenditionRepo"
  | "transformDefinitionRepo"
  // 2026-09-03 absolute-URL fix: the host binds this same verified-origin registry into
  // GetEntryMetaDeps via seoDeps, so the admin SEO preview shows the
  // same absolute canonical/og:url/og:image the live public render now emits.
  | "originRegistry"
  // RSS feed (`routes/site/feed.ts`): the channel title is the site title, read through
  // `resolveSiteTitle`, which needs these three.
  | "siteTitlePreservationStore"
  | "workspaceRepo"
  | "siteDisplayName"
>;

export type SeoRouteRegistrar = (app: Express, deps: SeoRouteDeps) => void;
