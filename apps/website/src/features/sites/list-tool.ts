/** Compatibility seam for the existing sites-list contributor; the Sites domain owns its catalog and handlers. */
export { sitesReadAgentToolCatalog as catalog } from "./agent-tools.js";
export { buildSitesReadRegistrations as buildRegistrations, sitesReadDerivedRisk as derivedRisk, contributeSitesListTools } from "./tool-registrations.js";
export type { SitesReadToolDeps as Deps } from "./tool-registrations.js";
