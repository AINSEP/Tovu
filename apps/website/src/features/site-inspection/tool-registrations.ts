import { buildSiteInspectionRegistrations as build, siteInspectionDerivedRisk } from "@jini-ai/cms/site-inspection/tool-registrations";
import { RESERVED_SEGMENTS } from "@jini-ai/cms/routing/site/reserved-paths";
import type { ToolContributor } from "@jini-ai/core";
import { EgressRefusedError, type HttpClientPort } from "#src/platform/http/index";
import { readPageBodyOptions } from "@jini-ai/diagnostics/web-evidence/page-body";
import { fetchLiveUrl, listKnownLiveOrigins, type FetchLiveUrlDeps, type LiveOriginPolicy } from "@jini-ai/diagnostics/web-evidence/live-url";
import { SITE_INSPECTION_READ_PERMISSION, siteInspectionAgentToolCatalog } from "#src/features/site-inspection/catalog-host";
import { toSiteCapabilitiesDeps, toSiteProfileDeps, type SiteInspectionToolDeps } from "./deps.js";
import { SameOriginPathError as PublishedPagePathError } from "@jini-ai/diagnostics/web-evidence";
import { fetchPublishedPage } from "@jini-ai/diagnostics/web-evidence/published-page";
import { trackFetch } from "@jini-ai/diagnostics/observability";

type HostLiveUrlDeps = Omit<FetchLiveUrlDeps, "reservedSegments" | "isEgressRefusal">;

export function buildSiteInspectionRegistrations(routeDeps: SiteInspectionToolDeps, liveDeps?: HostLiveUrlDeps) {
  return build({ workspaceId: routeDeps.workspaceId, authorize: routeDeps.authorize, catalog: siteInspectionAgentToolCatalog, readPermission: SITE_INSPECTION_READ_PERMISSION,
    reservedSegments: RESERVED_SEGMENTS, trackFetch, publishedPageDeps: () => routeDeps,
    toSiteProfileDeps: () => toSiteProfileDeps(routeDeps), toSiteCapabilitiesDeps: () => toSiteCapabilitiesDeps(routeDeps),
    readPageBodyOptions, fetchLiveUrl, fetchPublishedPage, isEgressRefusal: (error): error is EgressRefusedError => error instanceof EgressRefusedError,
    isPublishedPagePathError: error => error instanceof PublishedPagePathError,
  }, liveDeps);
}

export function contributeSiteInspectionTools(live?: { httpClient: HttpClientPort } & LiveOriginPolicy): ToolContributor<SiteInspectionToolDeps, unknown> {
  return {
    domain: "site-inspection",
    build: deps => buildSiteInspectionRegistrations(deps, live ? {
      httpClient: live.httpClient,
      listKnownOrigins: () => listKnownLiveOrigins({ ...deps, selectConnectedDestination: live.selectConnectedDestination }),
      observeFetch: event => console.info(JSON.stringify({
        timestamp: new Date().toISOString(), level: "info", service: "site-inspection",
        message: "fetch_live_url", context: event,
      })),
    } : undefined),
    risk: siteInspectionDerivedRisk,
  };
}
