/**
 * @file This module's ONE public API, mirroring `features/site-inspection/index.ts`'s own
 * "everything outside this folder imports from here" discipline.
 */

export { SITES_WRITE_PERMISSION, sitesAgentToolCatalog, type AgentToolDefinition, type AgentToolSideEffect } from "./agent-tools.js";

export { resolveSitesDeps, type ResolvedSitesDeps, type SitesToolDeps } from "./deps.js";

export { buildSitesRegistrations, contributeSitesTools, sitesDerivedRisk } from "./tool-registrations.js";

export {
  activateSite,
  createSiteForOwner,
  resolveSiteSwitchBase,
  SITE_SWITCH_RESTART_INSTRUCTIONS,
  SITE_SWITCH_RESTARTING_NOTICE,
  type ActivateSiteResult,
  type CreateSiteForOwnerResult,
  type SiteAdminRefusal,
  type SiteAdminRefusalCode,
} from "./site-admin.js";

export {
  createSitePreviewStore,
  sitePreviewRoot,
  SITE_PREVIEW_CONTENT_TYPE,
  type SitePreviewStore,
} from "./site-preview/site-preview-store.js";

export {
  createSitePreviewService,
  type SitePreviewCapturePort,
  type SitePreviewService,
  type SitePreviewTarget,
} from "./site-preview/site-preview-service.js";

export { createPlaywrightSitePreviewCapture } from "./site-preview/playwright-site-preview-capture.js";
