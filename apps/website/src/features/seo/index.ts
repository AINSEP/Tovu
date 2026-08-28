/**
 * @file Public surface (barrel) for the `seo` library (SPEC-008, ADR-PIPE-008).
 *
 * INV-09 — every consumer of persisted SEO data (routes, the render seam,
 * future AI tools) must import from here (or the individual files re-exported
 * below), never reach `posts.seo_ext_json`/`site.seo.*` directly.
 */
export { getEntryMeta, analyzeEntry, type GetEntryMetaDeps, type GetEntryMetaInput } from "./seo.js";
export { setEntrySeoOverrides, type SetEntrySeoOverridesDeps, type SetEntrySeoOverridesInput } from "./write-service.js";
export {
  ensureSeoSettingDefinitions,
  getSeoSettings,
  setSeoSettings,
  type EnsureSeoSettingDefinitionsDeps,
  type EnsureSeoSettingDefinitionsInput,
  type GetSeoSettingsDeps,
  type SeoSettingsWriteDeps,
  type SetSeoSettingsInput,
} from "./settings.js";
export {
  buildSitemap,
  buildRobots,
  regenerateSitemapCache,
  invalidateSitemapCache,
  createSeoEventSubscriptions,
  registerSitemapCollectHook,
  resetSitemapCollectHooksForTests,
  type SeoSitemapDeps,
} from "./sitemap.js";
export { resolveSeoImageRef, type ResolveSeoImageRefDeps, type ResolveSeoImageRefInput } from "./media.js";
export { createSeoPageHeadHook } from "./page-head-contributor.js";
export {
  SeoEntryNotFoundError,
  SeoFieldValidationError,
  SeoInvalidCanonicalUrlError,
  SeoSettingsValidationError,
} from "./errors.js";
export type { SeoQueryPort, SeoEventSubscriptions, SitemapCollectHook } from "./ports.js";
export type {
  ChangeFreq,
  OpenGraph,
  OpenGraphType,
  RobotsDirective,
  RobotsPolicy,
  RobotsRule,
  SeoAnalysis,
  SeoExtFields,
  SeoIssue,
  SeoMeta,
  SeoSettingKey,
  SeoSettings,
  SitemapCollectContext,
  SitemapEntry,
  TwitterCard,
  TwitterCardKind,
} from "./types.js";
