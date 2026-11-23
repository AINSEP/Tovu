import type { Response } from "express";
import { mountJsonRoute } from "@jini-ai/http-kit";
import { RouteRefusalError } from "@jini-ai/core/errors/route-refusal";
import { seoGetEntryRoute } from "@jini-ai/cms/admin-http/routes/seo/get-entry";
import { seoPutEntryRoute, type SeoPutEntryInput, type SeoPutEntryRouteDeps } from "@jini-ai/cms/admin-http/routes/seo/put-entry";
import type { SeoMeta } from "@jini-ai/cms/seo";
import { seoGetEntryAnalyzeRoute } from "@jini-ai/cms/admin-http/routes/seo/get-entry-analyze";
import { seoPostSitemapRegenerateRoute } from "@jini-ai/cms/admin-http/routes/seo/post-sitemap-regenerate";
import { registerAdminSeoGetSettingsRoute } from "#src/server/inbound/admin-http/routes/seo/get-settings";
import { registerAdminSeoPutSettingsRoute } from "#src/server/inbound/admin-http/routes/seo/put-settings";
import { createAdminJsonRoutePorts, mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { OperatorPrincipalRecord } from "#src/server/inbound/admin-http/dev-auth";
import { adminFailureResponse } from "#src/server/inbound/shared/admin-failure";
import { registerSeoSitemapRoute } from "#src/server/inbound/public-http/routes/site/sitemap";
import { registerSeoRobotsRoute } from "#src/server/inbound/public-http/routes/site/robots";
import { registerLlmsTxtRoute } from "#src/server/inbound/public-http/routes/site/llms";
import { registerFeedRoute } from "#src/server/inbound/public-http/routes/site/feed";
import type { SeoRouteDeps, SeoRouteRegistrar } from "#src/server/inbound/admin-http/routes/seo/deps";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-042, final slice) — the `seo` server module (SPEC-008 SEO).
 *
 * Owns all 9 registrations: 6 admin routes (`get-entry`/`put-entry`/`get-entry-analyze`/
 * `get-settings`/`put-settings`/`post-sitemap-regenerate`) plus 3 public, unauthenticated site
 * routes (`GET /sitemap.xml`, `GET /robots.txt`, `GET /llms.txt`) that live outside
 * `routes/admin/seo/` — mirrors `media.ts`'s precedent of bundling a public route into an
 * otherwise-admin module. The first 8 were moved here verbatim from `app.ts`'s `createApp()`,
 * same registrar function bodies, no behavior change, same relative order; `registerLlmsTxtRoute`
 * (`llms.ts`, ai-first-docs-checklist "Do now" item 1) joined them 2026-08-31, and
 * `registerFeedRoute` (`GET /feed.xml`, RSS) on 2026-09-28 — a fixed well-known path, registered
 * here for the same before-`/:slug` ordering reason.
 *
 * CRITICAL ORDERING REQUIREMENT (verified, per SPEC-042 REQ-06): the public routes
 * (`registerSeoSitemapRoute`/`registerSeoRobotsRoute`/`registerLlmsTxtRoute`) MUST still register
 * before the site's `GET /:slug` catch-all (`registerSiteRoutes`, `routes/site/pages.ts`). This
 * module's call site in `app.ts` sits at the exact same position the 8 SEO registrations
 * previously occupied — well before `registerSiteRoutes`'s call — so this ordering constraint is
 * preserved unchanged. `src/server/__tests__/unit/route-class-precedence.unit.test.ts`
 * structurally asserts this against the real Express router stack and was re-run green after this
 * move (see SPEC-042 handoff for the exact evidence); `llms.txt`'s own fixed path is a new
 * "well-known" leaf with no `:slug` overlap risk of its own.
 *
 * Four of the admin routes (get-entry, put-entry, get-entry-analyze, post-sitemap-regenerate) are
 * Jini route specs mounted below; get-settings/put-settings are still hand-written Express routes.
 */

/**
 * The four SEO admin routes that are Jini specs (`@jini-ai/cms/admin-http/routes/seo/*`, RT-K1-adm-seo-1),
 * mounted behind the admin ports. Each gets only the `SeoRouteDeps` fields its spec reads, as
 * request-time getters, so a later reassignment of a field is still honoured as the hand-written
 * routes' `deps.*` reads were. get-entry/analyze/sitemap never consulted the publishing-credential
 * override (`authorizeDirectOrRespond`); put-entry did (`authorizeOrRespond`), so it keeps the guarded port.
 */
const directMountOptions = (operation: string) => ({ authorization: "direct" as const, failure: { operation, code: "INTERNAL_ERROR" } });

/** The read routes' deps: readiness, scope, the RBAC check behind the authorize port, and the SEO bindings. */
function seoReadDeps({ deps }: { deps: SeoRouteDeps }, _options: Record<string, never> = {}) {
  return {
    get workspaceId() { return deps.workspaceId; }, get authorize() { return deps.authorize; },
    get seoReady() { return deps.seoReady; }, get seoDeps() { return deps.seoDeps; },
  };
}

export const registerAdminSeoGetEntryRoute: SeoRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: seoGetEntryRoute, deps: seoReadDeps({ deps }) }, directMountOptions("routes/seo/get-entry"));
};

export const registerAdminSeoGetEntryAnalyzeRoute: SeoRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: seoGetEntryAnalyzeRoute, deps: seoReadDeps({ deps }) }, directMountOptions("routes/seo/get-entry-analyze"));
};

export const registerAdminSeoPostSitemapRegenerateRoute: SeoRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: seoPostSitemapRegenerateRoute, deps: {
    get workspaceId() { return deps.workspaceId; }, get authorize() { return deps.authorize; },
    get seoReady() { return deps.seoReady; }, get sitemapService() { return deps.sitemapService; },
  } }, directMountOptions("routes/seo/post-sitemap-regenerate"));
};

/** put-entry answered unexpected failures through `adminFailureResponse` (operation-derived copy,
 *  always the request's tracker), not `sendAdminFailure`'s method/route copy — kept byte-for-byte. */
const seoPutEntryPorts = {
  ...createAdminJsonRoutePorts(),
  onError: ({ res, error }: { res: Response; error: unknown }) => {
    if (error instanceof RouteRefusalError) { res.status(error.response.status).json(error.response.body); return; }
    const { status, body } = adminFailureResponse({ error, tracker: res.locals?.adminFailureTracker }, { operation: "routes/seo/put-entry" });
    res.status(status).json(body);
  },
};

export const registerAdminSeoPutEntryRoute: SeoRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountJsonRoute<SeoPutEntryInput, { data: SeoMeta }, SeoPutEntryRouteDeps & AdminJsonRoutePortDeps, OperatorPrincipalRecord>({ app, spec: { ...seoPutEntryRoute, ports: seoPutEntryPorts }, deps: {
    get workspaceId() { return deps.workspaceId; }, get authorize() { return deps.authorize; },
    get seoReady() { return deps.seoReady; }, get seoDeps() { return deps.seoDeps; },
    get clock() { return deps.clock; }, get sitemapService() { return deps.sitemapService; },
  } });
};

export function createSeoModule(deps: SeoRouteDeps): ServerModuleHandle {
  return {
    name: "seo",
    registerRoutes: ({ app }, _options = {}) => {
      registerAdminSeoGetEntryRoute({ app, deps });
      registerAdminSeoPutEntryRoute({ app, deps });
      registerAdminSeoGetEntryAnalyzeRoute({ app, deps });
      registerAdminSeoGetSettingsRoute({ app, deps });
      registerAdminSeoPutSettingsRoute({ app, deps });
      registerAdminSeoPostSitemapRegenerateRoute({ app, deps });
      registerSeoSitemapRoute({ app, deps });
      registerSeoRobotsRoute({ app, deps });
      registerLlmsTxtRoute({ app, deps });
      registerFeedRoute({ app, deps });
    },
  };
}
