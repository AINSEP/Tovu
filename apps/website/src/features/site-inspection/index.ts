/**
 * @file This module's ONE public API. Everything outside `features/site-inspection/` imports from
 * here; nothing outside reaches a file inside this folder directly.
 *
 * That is a deliberate constraint rather than a stylistic barrel. The whole argument for this
 * module is that its exposed surface is small enough to audit — "a credential store cannot be
 * reached from `buildSiteProfile`" is a claim you check by reading one dependency interface — and a
 * single declared entry point is what keeps that claim checkable as the module grows. It also keeps
 * `check:architecture`'s "module API surface" cost of this feature at one file instead of three.
 *
 * Internal files (`site-profile.ts`, `published-page.ts`, `deps.ts`, `agent-tools.ts`,
 * `tool-registrations.ts`) import each other by relative path as usual; only crossing the module
 * boundary goes through this file.
 */

export {
  buildSiteProfile,
  DEFAULT_PAGE_ITEMS,
  DEFAULT_SECTION_TIMEOUT_MS,
  INVENTORY_SAFE_SETTINGS,
  MAX_PAGE_ITEMS,
  MAX_SETTING_VALUE_CHARS,
  SITE_PROFILE_SECTION_NAMES,
  SITE_PROFILE_SECTION_PERMISSIONS,
  type BuildSiteProfileOptions,
  type SiteProfile,
  type SiteProfileContentTypeSummary,
  type SiteProfileDeps,
  type SiteProfileJsonValue,
  type SiteProfilePages,
  type SiteProfilePageSummary,
  type SiteProfilePluginSummary,
  type SiteProfileSection,
  type SiteProfileSectionName,
  type SiteProfileSectionStatus,
  type SiteProfileSettingSummary,
  type SiteProfileTheme,
  type SiteProfileThemeSummary,
} from "./site-profile.js";

export {
  DEFAULT_FETCH_TIMEOUT_MS,
  DEFAULT_MAX_BODY_BYTES,
  fetchPublishedPage,
  MAX_MAX_BODY_BYTES,
  MAX_PATH_LENGTH,
  PublishedPagePathError,
  resolveSameOriginPath,
  type FetchPublishedPageDeps,
  type FetchPublishedPageOptions,
  type PublishedPageCookieShape,
  type PublishedPageResult,
} from "./published-page.js";

export { toSiteProfileDeps, type SiteInspectionToolDeps, type SiteProfileSourceDeps } from "./deps.js";

export { SITE_INSPECTION_READ_PERMISSION, siteInspectionAgentToolCatalog } from "./agent-tools.js";

export {
  buildSiteInspectionRegistrations,
  contributeSiteInspectionTools,
  siteInspectionDerivedRisk,
} from "./tool-registrations.js";
