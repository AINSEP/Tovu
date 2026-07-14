/**
 * @file Public surface (barrel) for the `seo` library (SPEC-008, ADR-PIPE-008).
 *
 * INV-09 — every consumer of persisted SEO data (routes, the render seam,
 * future AI tools) must import from here (or the individual files re-exported
 * below), never reach `posts.seo_ext_json`/`site.seo.*` directly.
 */
export { getEntryMeta, analyzeEntry, type GetEntryMetaDeps, type GetEntryMetaInput } from "./seo";
export { setEntrySeoOverrides, type SetEntrySeoOverridesDeps, type SetEntrySeoOverridesInput } from "./write-service";
export {
  ensureSeoSettingDefinitions,
  getSeoSettings,
  setSeoSettings,
  type EnsureSeoSettingDefinitionsDeps,
  type EnsureSeoSettingDefinitionsInput,
  type GetSeoSettingsDeps,
  type SeoSettingsWriteDeps,
  type SetSeoSettingsInput,
} from "./settings";
export {
  buildSitemap,
  buildRobots,
  regenerateSitemapCache,
  invalidateSitemapCache,
  createSeoEventSubscriptions,
  registerSitemapCollectHook,
  resetSitemapCollectHooksForTests,
  type SeoSitemapDeps,
} from "./sitemap";
export { resolveSeoImageRef, type ResolveSeoImageRefDeps, type ResolveSeoImageRefInput } from "./media";
export { createSeoPageHeadHook } from "./page-head-contributor";
export {
  SeoEntryNotFoundError,
  SeoFieldValidationError,
  SeoInvalidCanonicalUrlError,
  SeoSettingsValidationError,
} from "./errors";
export type { SeoQueryPort, SeoEventSubscriptions, SitemapCollectHook } from "./ports";
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
} from "./types";
