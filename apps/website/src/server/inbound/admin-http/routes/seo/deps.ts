import type { Express } from "express";

import type { RouteDeps } from "../../../../routes/types.js";

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
 * `sitemap.ts`) pass `deps` itself as the `media: ResolveSeoImageRefDeps` argument to `seo/
 * media.ts`'s `resolveSeoImageRef` (structural typing — `ResolveSeoImageRefDeps` needs
 * `mediaRepo`/`assetRenditionRepo`/`transformDefinitionRepo`, all 3 included below) and also read
 * `deps.postRepo`. `put-settings.ts` additionally reads `deps.clock`/`deps.idGen`/
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
  | "postRepo"
  | "settingsRepo"
  | "principalRepo"
  | "mediaRepo"
  | "assetRenditionRepo"
  | "transformDefinitionRepo"
>;

export type SeoRouteRegistrar = (app: Express, deps: SeoRouteDeps) => void;
