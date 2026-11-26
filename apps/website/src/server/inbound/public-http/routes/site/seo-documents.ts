import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
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

/** Owner decision (TM-TOVU-2026-08-12-A request-cost audit, Phase 2 change 2 of 2) — same header,
 *  same reasoning as `pages.ts`'s own `CACHE_CONTROL_PUBLIC_PAGE` (see that file's doc): this route
 *  uses the serving origin, so a cache must retain the request authority in its key. */
const CACHE_CONTROL_PUBLIC_PAGE = "public, max-age=60, stale-while-revalidate=300";

/** The text/plain 500 these routes always answered: the visitor sentence plus the incident's error ID.
 * @complexity O(1) plus the shared incident report.
 */
function textFailure({ operation, subject }: { operation: string; subject: string }, _optional: Record<string, never> = {}): PublicRawFailureWriter {
  return ({ res, error }) => {
    const { errorId } = reportServerFailure({ error, operation }, { tracker: res.locals.adminFailureTracker, reporter: res.locals.failureReporter });
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

/** Mount one document spec with `bufferedReply`: these answers were `res.send(body)` on hand-written Express routes,
 * which gave a `Content-Length`, a weak `ETag`, a bodiless HEAD and a 304 for a fresh `If-None-Match`. The raw writer
 * streams (chunked, no validator) unless the mount selects the buffered write, which hands the whole body to
 * Express's own `res.send`; a crawler or CDN revalidating these documents depends on that. Pinned by
 * `__tests__/seo-documents.wire-pins.test.ts`. Documents are small and finished, never streams.
 * @complexity O(1) setup; per request O(n) in the document size.
 */
function mountDocument<Deps extends object>(
  { app, errors, spec, deps, failure }: { app: Parameters<typeof mountPublicRawRoute<Deps>>[0]["app"]; errors: RouteErrorPorts; spec: Parameters<typeof mountPublicRawRoute<Deps>>[0]["spec"]; deps: Deps; failure: PublicRawFailureWriter },
  _optional: Record<string, never> = {},
): void {
  mountPublicRawRoute({ app, errors, spec: { ...spec, bufferedReply: true }, deps, failure });
}

/**
 * GET /sitemap.xml — public, unauthenticated (SPEC-008 api.spec.md `SEO_GET_SITEMAP`, REQ-08,
 * tasks.md T046). Registered ahead of the `/:slug` catch-all in `pages.ts`'s registration order.
 */
export const registerSeoSitemapRoute: SeoRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  const specDeps: SitemapRouteDeps = documentDeps({ deps, extra: { buildSitemap: (input: { workspaceId: string }, optional: { renderBaseUrl?: string | undefined }) => deps.sitemapService.buildSitemap(input, optional) } });
  mountDocument({ app, errors, spec: sitemapRoute, deps: specDeps, failure: textFailure({ operation: "public:sitemap", subject: "the sitemap" }) });
};

/**
 * GET /robots.txt — public, unauthenticated (SPEC-008 api.spec.md `SEO_GET_ROBOTS`, REQ-09,
 * tasks.md T046).
 */
export const registerSeoRobotsRoute: SeoRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  const specDeps: RobotsRouteDeps = documentDeps({ deps, extra: {} });
  mountDocument({ app, errors, spec: robotsRoute, deps: specDeps, failure: textFailure({ operation: "public:robots", subject: "the crawler rules" }) });
};

/**
 * @file `GET /llms.txt` — public, unauthenticated (owner decision TM-TOVU-2026-08-31, per
 * `development/docs/ai-first-docs-checklist.md` "Do now" item 1). Follows the llmstxt.org
 * convention: an H1 title, a one-line blockquote summary, then H2-labeled sections of
 * `- [title](url): description` links — a machine-readable index a coding-agent tool (Cursor,
 * Claude Code, Windsurf, Copilot, Cline, Aider) can fetch in one request to learn the shape of the
 * whole site before reading further. Registered ahead of the site's `/:slug` catch-all, same as
 * `registerSeoRobotsRoute`/`registerSeoSitemapRoute` (`robots.ts`/`sitemap.ts` in this
 * directory) — see `modules/seo.ts`'s file header for the ordering requirement.
 *
 * 2026-09-04 rewrite: the checklist originally scoped this to a hand-curated `CURATED_DOCS` list
 * (Phase 2 note: "needs an explicit 'which pages count as docs' tag or convention — not built
 * yet"). That list drifted the moment a page was published, renamed, or unpublished outside it, so
 * this now derives the index from `computeIndexableEntries` (`Jini/packages/cms/src/seo/sitemap.ts`) — the same
 * publish/visibility/`noindex` filter `sitemap.xml` is built from (INV-04/05) — instead of
 * maintaining a second, hand-authored notion of "which pages count." Every published, publicly
 * visible, non-`noindex` post/page is listed; a members/paid/tiers-gated or draft page can never
 * leak here, same guarantee `sitemap.xml` gives. This is a deliberate, disclosed behavior change,
 * not silent drift — see `__tests__/llms.route.test.ts`'s file header for what it replaces.
 */
export const registerLlmsTxtRoute: SeoRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  // Share sitemap/feed's serving origin; the exporter rewrites it for its destination.
  const specDeps: LlmsTxtRouteDeps = documentDeps({ deps, extra: { resolveSiteTitle: siteTitleFor({ deps }) } });
  mountDocument({ app, errors, spec: llmsTxtRoute, deps: specDeps, failure: textFailure({ operation: "public:llms", subject: "the site index" }) });
};

/**
 * GET /feed.xml — the public RSS 2.0 feed (`Jini/packages/cms/src/seo/feed.ts`). Public and unauthenticated like
 * `sitemap.xml`, and registered with it by `modules/seo.ts`, ahead of the `/:slug` catch-all.
 */
export const registerFeedRoute: SeoRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  const specDeps: FeedRouteDeps = documentDeps({ deps, extra: { resolveSiteTitle: siteTitleFor({ deps }) } });
  mountDocument({ app, errors, spec: feedRoute, deps: specDeps, failure: textFailure({ operation: "public:feed", subject: "the feed" }) });
};
