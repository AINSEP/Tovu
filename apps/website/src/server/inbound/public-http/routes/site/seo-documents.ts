import { feedRoute, type FeedRouteDeps } from "@jini-ai/cms/public-http/routes/site/feed";
import { llmsTxtRoute, type LlmsTxtRouteDeps } from "@jini-ai/cms/public-http/routes/site/llms";
import { robotsRoute, type RobotsRouteDeps } from "@jini-ai/cms/public-http/routes/site/robots";
import { sitemapRoute, type SitemapRouteDeps } from "@jini-ai/cms/public-http/routes/site/sitemap";
import { resolveSiteTitle } from "@jini-ai/cms/settings/site/site-title";
import { siteTitleHostBindings } from "#src/features/settings/site-title-legacy";
import { mountPublicRawRoute, type PublicRawFailureWriter } from "#src/server/inbound/admin-http/admin-raw-route-ports";
import { reportServerFailure } from "#src/server/inbound/shared/admin-failure";
import type { SeoRouteDeps, SeoRouteRegistrar } from "#src/server/runtime/composition/modules/seo";

/**
 * @file The four PUBLIC, unauthenticated SEO document routes (`GET /sitemap.xml`, `/robots.txt`, `/llms.txt`,
 * `/feed.xml`) as Jini raw specs (`@jini-ai/cms/public-http/routes/site/*`) mounted behind the visitor ports.
 * The specs own each document; Tovu binds its policy here: the cache header, the readiness gate, the site-title
 * resolution, and the plain-text 500 (`textFailure`) — reported to the incident sink with the same operation and
 * copy the hand-written routes used. `modules/seo.ts` registers them ahead of the site's `/:slug` catch-all.
 */

/** Owner decision (TM-TOVU-2026-08-12-A request-cost audit, Phase 2 change 2 of 2): the response uses the
 *  serving origin, so a cache must retain the request authority in its key. Same header as `pages.ts`. */
const CACHE_CONTROL_PUBLIC_PAGE = "public, max-age=60, stale-while-revalidate=300";

/** The text/plain 500 these routes always answered: the visitor sentence plus the incident's error ID.
 * @complexity O(1) plus the shared incident report.
 */
function textFailure({ operation, subject }: { operation: string; subject: string }, _optional: Record<string, never> = {}): PublicRawFailureWriter {
  return ({ res, error }) => {
    const { errorId } = reportServerFailure({ error, operation }, { tracker: res.locals.adminFailureTracker });
    res.status(500).type("text/plain").send(`The site couldn’t load ${subject}. Reload this page and report this error ID if it keeps happening. Error ID: ${errorId}`);
  };
}

/** The slice every document spec reads, plus the spec's own `extra` fields. Each host field is a getter, read per
 * request as the hand-written routes read `deps.*`: registration touches nothing, so a readiness failure is answered
 * by the failure writer (never an unhandled rejection raised while registering) and a later reassignment is honoured.
 * @complexity O(1).
 */
function documentDeps<Extra extends object>({ deps, extra }: { deps: SeoRouteDeps; extra: Extra }, _optional: Record<string, never> = {}) {
  return Object.defineProperties({ ...extra }, {
    cacheControl: { value: CACHE_CONTROL_PUBLIC_PAGE, enumerable: true },
    workspaceId: { get: () => deps.workspaceId, enumerable: true },
    seoReady: { get: () => deps.seoReady, enumerable: true },
    seoDeps: { get: () => deps.seoDeps, enumerable: true },
  }) as Extra & { readonly cacheControl: string; readonly workspaceId: string; readonly seoReady: Promise<void>; readonly seoDeps: SeoRouteDeps["seoDeps"] };
}

/** The channel/index title: the site title with the host's settings, preservation store and fallbacks. */
function siteTitleFor({ deps }: { deps: SeoRouteDeps }, _optional: Record<string, never> = {}): (required: { workspaceId: string }) => Promise<string> {
  return ({ workspaceId }) => resolveSiteTitle(
    { settingsRepo: deps.settingsRepo, preservationStore: deps.siteTitlePreservationStore, workspaceRepo: deps.workspaceRepo, siteDisplayName: deps.siteDisplayName, ...siteTitleHostBindings },
    { workspaceId },
  );
}

/** `GET /sitemap.xml` (SPEC-008 `SEO_GET_SITEMAP`, REQ-08). */
export const registerSeoSitemapRoute: SeoRouteRegistrar = ({ app, deps }, _options = {}) => {
  const specDeps: SitemapRouteDeps = documentDeps({ deps, extra: { buildSitemap: (input: { workspaceId: string }, optional: { renderBaseUrl?: string | undefined }) => deps.sitemapService.buildSitemap(input, optional) } });
  mountPublicRawRoute({ app, spec: sitemapRoute, deps: specDeps, failure: textFailure({ operation: "public:sitemap", subject: "the sitemap" }) });
};

/** `GET /robots.txt` (SPEC-008 `SEO_GET_ROBOTS`, REQ-09). */
export const registerSeoRobotsRoute: SeoRouteRegistrar = ({ app, deps }, _options = {}) => {
  const specDeps: RobotsRouteDeps = documentDeps({ deps, extra: {} });
  mountPublicRawRoute({ app, spec: robotsRoute, deps: specDeps, failure: textFailure({ operation: "public:robots", subject: "the crawler rules" }) });
};

/** `GET /llms.txt` (owner decision TM-TOVU-2026-08-31, `development/docs/ai-first-docs-checklist.md`). */
export const registerLlmsTxtRoute: SeoRouteRegistrar = ({ app, deps }, _options = {}) => {
  const specDeps: LlmsTxtRouteDeps = documentDeps({ deps, extra: { resolveSiteTitle: siteTitleFor({ deps }) } });
  mountPublicRawRoute({ app, spec: llmsTxtRoute, deps: specDeps, failure: textFailure({ operation: "public:llms", subject: "the site index" }) });
};

/** `GET /feed.xml`, the public RSS 2.0 feed. */
export const registerFeedRoute: SeoRouteRegistrar = ({ app, deps }, _options = {}) => {
  const specDeps: FeedRouteDeps = documentDeps({ deps, extra: { resolveSiteTitle: siteTitleFor({ deps }) } });
  mountPublicRawRoute({ app, spec: feedRoute, deps: specDeps, failure: textFailure({ operation: "public:feed", subject: "the feed" }) });
};
