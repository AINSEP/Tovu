/**
 * @file This module's ONE public API, mirroring `features/site-inspection/index.ts`'s own
 * "everything outside this folder imports from here" discipline.
 */

export { SITES_WRITE_PERMISSION, sitesAgentToolCatalog, type AgentToolDefinition, type AgentToolSideEffect } from "./agent-tools.js";

export { resolveSitesDeps, type ResolvedSitesDeps, type SitesToolDeps } from "./deps.js";

export { buildSitesRegistrations, contributeSitesTools, sitesDerivedRisk } from "./tool-registrations.js";
