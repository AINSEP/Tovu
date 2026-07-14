/**
 * @file SEO contract interfaces (SPEC-008, ADR-PIPE-008). Interfaces ONLY.
 *
 * ADR-006 note (rule-of-two): introduces NO new infrastructure port. Every
 * dependency `seo` needs is a typed call to an already-ported existing module
 * (`post` via `PostRepoPort`, `routing` via `urlFor`, `settings` via
 * `getEffective`/write-service, `media` via its existing read repos,
 * `identity` via `authorize()`) — plain dependency-injected function params,
 * not the ADR-032 stub's "capability handle" abstraction
 * (`SeoContentReadCap`/`SeoUrlCap`/`SeoSettingsCap`/`SeoCacheCap`/
 * `SeoPluginCaps`). Those five stub-era interfaces are dropped here (zero
 * call sites existed, ADR-PIPE-008 Context) — every real function in this
 * module (`src/seo/{seo,write-service,settings,sitemap,media}.ts`) takes its
 * dependencies the same direct-DI way every other feature module in this repo
 * does, matching the Contract Map (C-001..C-024), which never mentions a caps
 * object either. Documented here as a disclosed simplification, not a silent
 * one.
 *
 * `SitemapCollectHook` is kept (OQ-01: a real, empty, in-module registry ships
 * in v1 — Decision §7). `SeoQueryPort` is kept as the documented single read
 * surface INV-09 requires every route to go through — Code Review's
 * architecture check (T058) verifies every admin/public route calls into
 * `seo.ts`/`sitemap.ts`'s exported functions, matching this shape, rather than
 * literally constructing one object with these five methods.
 */
import type { UUID } from "../core/ports";
import type { HeadElement, PageHeadContext } from "../server/http/site/page-head";
import type { RobotsPolicy, SeoAnalysis, SeoMeta, SitemapCollectContext, SitemapEntry } from "./types";

/**
 * `seo.sitemap.collect` — lets other bundled plugins/core contribute URL sets
 * to the sitemap (e.g. taxonomy term pages) without SEO knowing their routes.
 * Ships live-but-empty in v1 (OQ-01) — no real registrant yet.
 */
export interface SitemapCollectHook {
  readonly priority: number;
  handle(ctx: SitemapCollectContext): Promise<SitemapEntry[]>;
}

/**
 * The single SEO service contract (documentation shape for INV-09's "one
 * evaluator, no back door" rule). The admin panel, the public `<head>`
 * render, `sitemap.xml`/`robots.txt`, and `analyzeEntry` are all clients of
 * this one surface.
 */
export interface SeoQueryPort {
  getEntryMeta(input: { workspaceId: UUID; entryId: UUID }): Promise<SeoMeta>;
  renderHead(ctx: PageHeadContext): Promise<HeadElement[]>;
  buildSitemap(input: { workspaceId: UUID }): Promise<SitemapEntry[]>;
  buildRobots(input: { workspaceId: UUID }): Promise<RobotsPolicy>;
  analyzeEntry(input: { workspaceId: UUID; entryId: UUID }): Promise<SeoAnalysis>;
}

/**
 * Outbox event handlers the plugin registers (ADR-009 §2 outbox events,
 * idempotent). Sole v1 job: invalidate the cached sitemap when content
 * changes (REQ-10).
 */
export interface SeoEventSubscriptions {
  onEntryPublished(event: { payload: { entryId: UUID; contentType: string }; workspaceId: UUID }): Promise<void>;
  onEntryUpdated(event: { payload: { entryId: UUID; contentType: string }; workspaceId: UUID }): Promise<void>;
  onEntryUnpublished(event: { payload: { entryId: UUID; contentType: string }; workspaceId: UUID }): Promise<void>;
}
