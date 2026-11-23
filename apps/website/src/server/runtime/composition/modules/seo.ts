import type { Express } from "express";
import { describeRequestFailure } from "@jini-ai/core";
import { ADMIN_FAILURE_VOCABULARY } from "@tovu/contracts/admin-failure-copy";

import { seoGetEntryAnalyzeRoute } from "@jini-ai/cms/admin-http/routes/seo/get-entry-analyze";
import { seoGetEntryRoute } from "@jini-ai/cms/admin-http/routes/seo/get-entry";
import { seoGetSettingsRoute } from "@jini-ai/cms/admin-http/routes/seo/get-settings";
import { seoPostSitemapRegenerateRoute } from "@jini-ai/cms/admin-http/routes/seo/post-sitemap-regenerate";
import { seoPutEntryRoute } from "@jini-ai/cms/admin-http/routes/seo/put-entry";
import { seoPutSettingsRoute } from "@jini-ai/cms/admin-http/routes/seo/put-settings";
import { getSeoSettings, setSeoSettings, type SeoSettingsPatch } from "#src/features/seo/index";
import { mountAdminJsonRoute, type AdminJsonRouteMountOptions, type AdminJsonRoutePortDeps, type AdminRouteAuthorization } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { registerSeoSitemapRoute } from "#src/server/inbound/public-http/routes/site/sitemap";
import { registerSeoRobotsRoute } from "#src/server/inbound/public-http/routes/site/robots";
import { registerLlmsTxtRoute } from "#src/server/inbound/public-http/routes/site/llms";
import { registerFeedRoute } from "#src/server/inbound/public-http/routes/site/feed";
import type { RouteDeps } from "#src/server/routes/types";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-042, final slice) — the `seo` server module (SPEC-008 SEO).
 *
 * K1 (RT-K1-adm-seo): the 6 admin routes are Jini route specs (`@jini-ai/cms/admin-http/routes/seo/*`)
 * mounted behind the admin ports; each mount builds that route's own small deps object from the
 * `SeoRouteDeps` slice below, so a spec never sees the bag. The Tovu-owned pieces the specs need are
 * injected here: the `seo.*` settings ledger read/write (`features/seo/settings.ts`) and the RBAC
 * authorizer the entry write chokepoint re-checks with.
 *
 * Owns all 10 registrations: the 6 admin routes plus 4 public, unauthenticated site routes
 * (`GET /sitemap.xml`, `/robots.txt`, `/llms.txt`, `/feed.xml`) that live in `public-http/routes/site/`
 * — mirrors `media.ts`'s precedent of bundling a public route into an otherwise-admin module. Same
 * relative order as before.
 *
 * CRITICAL ORDERING REQUIREMENT (verified, per SPEC-042 REQ-06): the public routes MUST still register
 * before the site's `GET /:slug` catch-all (`registerSiteRoutes`, `routes/site/pages.ts`). This
 * module's call site in `app.ts` sits well before `registerSiteRoutes`'s call, so the ordering holds;
 * `src/server/__tests__/unit/route-class-precedence.unit.test.ts` asserts it against the real router.
 */

/**
 * Narrow `RouteDeps` slice for the `seo` module (moved here from the deleted
 * `admin-http/routes/seo/deps.ts`; it describes the host's bag, so it stays host-side).
 *
 * Every registrar awaits `deps.seoReady` first and reads `deps.workspaceId`/`deps.settingsRepo`; the
 * admin routes additionally read `deps.authorize`. The entry routes and `sitemap.ts` read `seoDeps`'s
 * bindings to the post/media owners in Jini `packages/cms/src/seo`; `sitemapService` keeps
 * routes/tools/subscriptions on one app's cache. `put-settings` reads `clock`/`idGen`/`principalRepo`.
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

export type SeoRouteRegistrar = (required: { app: Express; deps: SeoRouteDeps }, optional?: Record<string, never>) => void;

/** The two port fields every seo mount passes. `authorize` is read per request, as the hand-written
 *  routes read `deps.authorize`, so a later reassignment of it is still honoured. */
function seoPortDeps({ deps }: { deps: SeoRouteDeps }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps & { seoReady: Promise<void> } {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params), seoReady: deps.seoReady };
}

/** Each route's `sendAdminFailure` operation and authorization mode: every SEO route used
 *  `authorizeDirectOrRespond` (`"direct"`) except `put-entry`, which used `authorizeOrRespond`
 *  (`"guarded"`) and mounts with its own explicit failure copy below. Switching either is an
 *  authorization change, not a move. Each route made exactly one authorization call, so no mount
 *  needs `authorizationByPermission`; and every one read the session (after the readiness gate)
 *  before touching its body, so none opts into `deferMissingPrincipal`. */
function mountOptions(
  { operation, authorization }: { operation: string; authorization: AdminRouteAuthorization },
  _optional: Record<string, never> = {},
): AdminJsonRouteMountOptions {
  return { authorization, failure: { operation, code: "INTERNAL_ERROR" } };
}

export const registerAdminSeoGetEntryRoute: SeoRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: seoGetEntryRoute, deps: { ...seoPortDeps({ deps }), seoDeps: deps.seoDeps } }, mountOptions({ operation: "routes/seo/get-entry", authorization: "direct" }));
};

// The hand-written put-entry answered its 500 with `adminFailureResponse` and the operation alone,
// never the request's method/route, so its copy is the operation-derived one ("search setting
// operation"), not the route-derived "Save entry" that `sendAdminFailure` would pick. Pinned here
// as explicit copy so the moved route answers byte-for-byte as before.
const PUT_ENTRY_OPERATION = "routes/seo/put-entry";
const PUT_ENTRY_COPY = describeRequestFailure({ operation: PUT_ENTRY_OPERATION, vocabulary: ADMIN_FAILURE_VOCABULARY });
const PUT_ENTRY_FAILURE = {
  operation: PUT_ENTRY_OPERATION, message: PUT_ENTRY_COPY.message,
  failure: { action: PUT_ENTRY_COPY.action, step: PUT_ENTRY_COPY.step },
};

/** The entry write: the chokepoint's own authorizer is the RBAC `deps.authorize` (read per call), never
 *  the publish-credential override the mount port applies — exactly what the hand-written route passed. */
export const registerAdminSeoPutEntryRoute: SeoRouteRegistrar = ({ app, deps }, _options = {}) => {
  const putDeps = {
    ...seoPortDeps({ deps }), seoDeps: deps.seoDeps, clock: deps.clock,
    entryAuthorize: (params: Parameters<SeoRouteDeps["authorize"]>[0]) => deps.authorize(params),
    invalidateSitemapCache: (input: { workspaceId: string }) => deps.sitemapService.invalidateSitemapCache(input),
  };
  mountAdminJsonRoute({ app, spec: seoPutEntryRoute, deps: putDeps }, { authorization: "guarded", failure: PUT_ENTRY_FAILURE });
};

export const registerAdminSeoGetEntryAnalyzeRoute: SeoRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: seoGetEntryAnalyzeRoute, deps: { ...seoPortDeps({ deps }), seoDeps: deps.seoDeps } }, mountOptions({ operation: "routes/seo/get-entry-analyze", authorization: "direct" }));
};

/** The `seo.*` settings ledger mapping is host-local (`features/seo/settings.ts`), bound here. */
export const registerAdminSeoGetSettingsRoute: SeoRouteRegistrar = ({ app, deps }, _options = {}) => {
  const readSeoSettings = (input: { workspaceId: string }) => getSeoSettings({ settingsRepo: deps.settingsRepo }, input);
  mountAdminJsonRoute({ app, spec: seoGetSettingsRoute, deps: { ...seoPortDeps({ deps }), readSeoSettings } }, mountOptions({ operation: "routes/seo/get-settings", authorization: "direct" }));
};

export const registerAdminSeoPutSettingsRoute: SeoRouteRegistrar = ({ app, deps }, _options = {}) => {
  const writeSeoSettings = (input: { workspaceId: string; patch: unknown; callerPrincipalId: string }) => setSeoSettings(
    {
      settingsRepo: deps.settingsRepo, clock: deps.clock, ids: deps.idGen, authorize: deps.authorize, principals: deps.principalRepo,
      invalidateSitemap: deps.sitemapService.invalidateSitemapCache, media: deps.seoDeps.media,
    },
    { workspaceId: input.workspaceId, patch: input.patch as SeoSettingsPatch, callerPrincipalId: input.callerPrincipalId },
  );
  mountAdminJsonRoute({ app, spec: seoPutSettingsRoute, deps: { ...seoPortDeps({ deps }), writeSeoSettings } }, mountOptions({ operation: "routes/seo/put-settings", authorization: "direct" }));
};

export const registerAdminSeoPostSitemapRegenerateRoute: SeoRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute(
    { app, spec: seoPostSitemapRegenerateRoute, deps: { ...seoPortDeps({ deps }), sitemapService: deps.sitemapService } },
    mountOptions({ operation: "routes/seo/post-sitemap-regenerate", authorization: "direct" }),
  );
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
