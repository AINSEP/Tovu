/** Mirrors `src/seo/types.ts`'s `SeoSettings`/`RobotsRule` (SPEC-008). */
export interface RobotsRule {
  userAgent: string;
  allow?: string[];
  disallow?: string[];
}

export interface SeoSettings {
  titleTemplate: string;
  defaultDescription?: string;
  defaultOgImage?: string;
  twitterSite?: string;
  defaultRobots: { noindex: boolean; nofollow: boolean };
  sitemapEnabled: boolean;
  robotsRules: RobotsRule[];
}

/**
 * The shape `setSeoSettings` accepts — `Partial<SeoSettings>` with the three nullable-on-write
 * scalars widened to also allow `null`.
 *
 * Same vocabulary as {@link SeoEntryOverridesPatch}: `null` CLEARS the site default (the server's
 * `SEO_DEFINITIONS` register these three as `nullable: true` and `buildScalarWrites` normalizes
 * `null` to its `""` absent-sentinel, which `getSeoSettings` reads back as `undefined`), while an
 * omitted key means "leave unchanged" — `setSeoSettings` is a merge, and `buildScalarWrites` skips
 * every `undefined` key outright. `SeoSettings` itself stays un-widened because it is also the
 * RESPONSE shape, where these three are only ever `string | undefined`.
 */
export type SeoSettingsPatch = Partial<Omit<SeoSettings, "defaultDescription" | "defaultOgImage" | "twitterSite">> & {
  defaultDescription?: string | null;
  defaultOgImage?: string | null;
  twitterSite?: string | null;
};

/**
 * Per-entry SEO (SPEC-008, mirrored from `src/seo/types.ts` per SPEC-037 REQ-06/07 — read
 * directly off `SeoMeta`/`SeoAnalysis`/`SeoIssue`, not guessed).
 */
export type SeoOpenGraphType = "website" | "article" | "profile";
export type SeoTwitterCardKind = "summary" | "summary_large_image";

export interface SeoOpenGraph {
  title: string;
  description?: string;
  type: SeoOpenGraphType;
  url: string;
  image?: string;
  siteName?: string;
}

export interface SeoTwitterCard {
  card: SeoTwitterCardKind;
  title: string;
  description?: string;
  image?: string;
  site?: string;
}

/** Mirrors `src/seo/types.ts`'s `SeoMeta` — the fully-resolved effective meta for one entry
 * (author overrides layered over site defaults layered over derived-from-entry). Both
 * `getSeoEntry` and `putSeoEntry` return this same resolved shape (not the raw override bag). */
export interface SeoEntryMeta {
  title: string;
  description?: string;
  canonical: string;
  robots: { noindex: boolean; nofollow: boolean };
  openGraph: SeoOpenGraph;
  twitter: SeoTwitterCard;
  jsonLd: Record<string, unknown>[];
}

/**
 * Mirrors `Jini packages/cms/src/seo/types.ts`'s `SeoExtFields` — the per-entry override
 * fields themselves. (The old comment here said "Mirrors `src/seo/types.ts`'s `SeoExtFields` — the
 * partial override bag `putSeoEntry` accepts", which had been wrong on both halves since
 * `eb10f5de`: the path moved, and the shape the route accepts is `SeoExtFieldsPatch`, not
 * `SeoExtFields`. See {@link SeoEntryOverridesPatch} below.)
 */
export interface SeoEntryOverrides {
  title?: string;
  description?: string;
  canonical?: string;
  noindex?: boolean;
  nofollow?: boolean;
  schemaType?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: SeoOpenGraphType;
  twitterCard?: SeoTwitterCardKind;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
}

/**
 * Mirrors that same file's `SeoExtFieldsPatch` — the bag `putSeoEntry` actually accepts, which
 * widens every field to also allow `null`.
 *
 * `null` means REMOVE this override, so resolution falls back through the site default to the
 * derived value; `undefined` (an omitted key) still means "leave unchanged". This distinction is
 * the whole point of the type: `setEntrySeoOverrides` (`write-service.ts`) stores `""` as a
 * genuine override, and `getEntryMeta` (`Jini packages/cms/src/seo/seo.ts`) resolves overrides with `??`, so an
 * override of `""` BEATS the site default and pins the entry to a blank. Before this widening the
 * admin could only ever send `""`, which is how a post reached `{"description":""}` with no way
 * back from the UI.
 */
export type SeoEntryOverridesPatch = { [K in keyof SeoEntryOverrides]?: SeoEntryOverrides[K] | null };

export type SeoIssueSeverity = "error" | "warning" | "info";

/** Mirrors `src/seo/types.ts`'s `SeoIssue`. */
export interface SeoIssue {
  code: string;
  severity: SeoIssueSeverity;
  message: string;
  field?: string;
}

/** Mirrors `src/seo/types.ts`'s `SeoAnalysis` — `analyzeEntry`'s return shape. */
export interface SeoEntryAnalysis {
  entryId: string;
  score: number;
  issues: SeoIssue[];
  resolved: SeoEntryMeta;
}
