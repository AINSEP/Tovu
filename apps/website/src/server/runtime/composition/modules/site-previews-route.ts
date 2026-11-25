import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
import type { Express } from "express";
import { sitePreviewRoute } from "@jini-ai/cms/admin-http/routes/sites/site-previews";
import { SITE_PREVIEW_CONTENT_TYPE, type SitePreviewService } from "#src/features/sites/index";
import { mountAdminRawRoute } from "#src/server/inbound/admin-http/admin-raw-route-ports";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file K1 (RT-K1-adm-sites-1, w4-routes): registrar for the admin Sites card preview image
 * (`GET …/system/sites/:name/preview`, Jini `@jini-ai/cms/admin-http/routes/sites/site-previews`).
 * The capture policy lives in `features/sites/site-preview/site-preview-service.ts`; this binds that
 * service's read and the store's media type. Mounted with `mountAdminRawRoute` behind the default
 * (`"guarded"`, `authorizeOrRespond`) admin ports; the spec opts into http-kit's buffered reply, so the
 * answer keeps `res.send`'s `Content-Length`, weak ETag and 304 (pinned in `site-previews.wire.test.ts`).
 */

export interface SitePreviewRouteDeps extends Pick<RouteDeps, "workspaceId" | "authorize"> {
  sitePreviews?: SitePreviewService;
}

/**
 * Mount the preview image route. `deps` is read per request, as the hand-written route read it: a
 * host without a preview service answers the 404 for every site.
 * @complexity O(1) setup; per request the admin ports and one capture read.
 */
export function registerSitePreviewRoutes({ errors, app, deps }: { errors: RouteErrorPorts; app: Express; deps: SitePreviewRouteDeps }, _optional = {}): void {
  mountAdminRawRoute({ errors,
    app,
    spec: sitePreviewRoute,
    deps: {
      workspaceId: deps.workspaceId,
      authorize: (params) => deps.authorize(params),
      previewContentType: SITE_PREVIEW_CONTENT_TYPE,
      sitePreviews: { read: ({ name }) => deps.sitePreviews?.read({ name }) ?? null },
    },
  }, { failure: { operation: "routes/sites/site-previews", code: "INTERNAL_ERROR" } });
}
