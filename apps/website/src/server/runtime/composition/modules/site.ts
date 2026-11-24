import type { Express } from "express";

import { buildSiteProfile, MAX_PAGE_ITEMS, SITE_PROFILE_SECTION_NAMES, toSiteProfileDeps, type SiteProfileSectionName } from "#src/features/site-inspection/index";
import { mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { RouteDeps } from "#src/server/routes/types";
import { siteProfileRoute } from "@jini-ai/cms/admin-http/routes/site/profile";

/**
 * @file The site-profile route's registrar (a Jini route spec mounted behind the admin ports).
 *
 * The spec is host-neutral: this registrar binds the host's `buildSiteProfile` (the SAME function the
 * `site_get_profile` agent tool calls) together with the section vocabulary and page cap that
 * builder owns. The spec authorizes nothing itself, so the mount is `"direct"`: the route never read
 * the publishing-credential override, and per-section authorization stays inside the builder.
 */

/**
 * The exact slice of `RouteDeps` this route needs. `Pick` rather than the whole bag, matching
 * `AdminDeploymentOverviewDeps`'s precedent — and notably NOT including `createSiteApp`, since this
 * route never renders a published page.
 */
export type AdminSiteProfileDeps = Pick<
  RouteDeps,
  | "workspaceId"
  | "authorize"
  | "clock"
  | "postRepo"
  | "themes"
  | "presentationRepo"
  | "settingsRepo"
  | "getEffective"
  | "contentTypeRepo"
  | "pluginActivationRepo"
  | "discoverPlugins"
>;

/** Registers `GET /api/admin/v1/workspaces/:workspaceId/site/profile`. @complexity O(1) per registration. */
export function registerAdminSiteProfileRoute({ app, deps }: { app: Express; deps: AdminSiteProfileDeps }, _optional: Record<string, never> = {}): void {
  mountAdminJsonRoute(
    {
      app,
      spec: siteProfileRoute,
      deps: {
        workspaceId: deps.workspaceId,
        authorize: (params) => deps.authorize(params),
        sectionNames: SITE_PROFILE_SECTION_NAMES,
        maxPageItems: MAX_PAGE_ITEMS,
        // The spec validated `sections` against `SITE_PROFILE_SECTION_NAMES`, so the narrowing is sound.
        buildSiteProfile: ({ principalId }, optional = {}) => buildSiteProfile(
          { deps: toSiteProfileDeps(deps), input: { principalId } },
          { sections: optional.sections as SiteProfileSectionName[] | undefined, pageLimit: optional.pageLimit },
        ),
      },
    },
    { authorization: "direct", failure: { operation: "routes/site/profile", code: "INTERNAL_ERROR" } },
  );
}
