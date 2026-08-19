/**
 * @file SEO core type definitions (SPEC-008, ADR-PIPE-008).
 *
 * Types ONLY — no feature logic. Fills in the ADR-032 design-only stub with
 * the shapes ADR-PIPE-008 actually commits to. Deviations from the original
 * stub (state.spec.md §5 + ADR-PIPE-008 Context, all disclosed there):
 *  - No `baseUrl`/`seo.base_url` anywhere (INV-07 — single-origin-authority;
 *    every absolute URL comes from `routing.urlFor`'s `canonicalUrl`).
 *  - `RobotsPolicy` stays computed-only (`sitemapUrls` is never persisted);
 *    only `robotsRules: RobotsRule[]` is stored.
 *  - `SeoPermission`'s 5-string vocabulary is replaced by the single string
 *    `"admin.seo.manage"`, used directly at call sites (no type needed).
 *  - `SeoFieldDecl`/`SeoExpressionIndexDecl` (ADR-022 generic-entries-model
 *    registration vocabulary) are dropped — this feature stores overrides on
 *    the bespoke `posts.seo_ext_json` column (state.spec.md §0), not a
 *    generic ext-bag with a content-type field registry.
 *  - `HeadElement`/`HeadElementKey`/`PageHeadContext`/`PageHeadEntryRef` move
 *    to `src/server/http/site/page-head.ts` (ADR-PIPE-008 Decision §2 — the
 *    render seam is core-owned, not SEO-owned); re-exported here for
 *    convenience so `seo` callers don't need two import paths.
 */
import type { JsonObject } from "@jini-ai/cms/core";
import type { PostRecord } from "../features/post/index.js";

export type {
  HeadElement,
  HeadElementKey,
  JsonLd,
  PageHeadContext,
  PageHeadEntryRef,
  PageHeadHook,
} from "../server/http/site/page-head.js";

// ---------------------------------------------------------------------------
// 1. Stored per-entry meta — the validated `posts.seo_ext_json` bag
// ---------------------------------------------------------------------------

/** Twitter card kind (Twitter/X card meta). */
export type TwitterCardKind = "summary" | "summary_large_image";

/** OpenGraph object type (v1 subset). */
export type OpenGraphType = "website" | "article" | "profile";

/**
 * The author-authored override bag persisted at `posts.seo_ext_json`. Every
 * field is OPTIONAL — absence means "derive from the entry + site defaults".
 * Unregistered keys are rejected at the write chokepoint (`write-service.ts`);
 * this interface is the registered, validated shape.
 *
 * `ogImage`/`twitterImage` hold a media *ref* (`"{assetId}:{transformName}"`)
 * or an absolute URL — never a frozen `/m/` URL directly (ADR-027 §4: internal
 * content stores refs, not URLs) — resolved to a URL at read time by `media.ts`.
 */
export interface SeoExtFields {
  /** Meta title override; falls back to `entry.title` run through the template. */
  title?: string;
  /** Meta description override; falls back to site default / excerpt. */
  description?: string;
  /** Canonical URL override (absolute); falls back to the routing-resolved URL. */
  canonical?: string;
  /** Exclude from indexing (emits `robots: noindex` + drops from the sitemap). */
  noindex?: boolean;
  /** Emit `robots: nofollow`. */
  nofollow?: boolean;
  /** JSON-LD schema.org @type override (else derived from content type). */
  schemaType?: string;
  /** OpenGraph overrides. */
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: OpenGraphType;
  /** Twitter/X card overrides. */
  twitterCard?: TwitterCardKind;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
}

// ---------------------------------------------------------------------------
// 2. Resolved per-entry meta — what the render + admin preview + analyze consume
// ---------------------------------------------------------------------------

export interface OpenGraph {
  title: string;
  description?: string;
  type: OpenGraphType;
  url: string;
  image?: string;
  siteName?: string;
}

export interface TwitterCard {
  card: TwitterCardKind;
  title: string;
  description?: string;
  image?: string;
  site?: string;
}

export interface RobotsDirective {
  noindex: boolean;
  nofollow: boolean;
}

/** JSON-LD is a plain JSON object graph (schema.org). */
export type JsonLdObject = JsonObject;

/**
 * The fully-resolved effective meta for one page: author overrides layered
 * over site defaults layered over derived-from-entry (behavior.spec.md §1.1).
 * This is the single source `getEntryMeta`/`analyzeEntry`/the head contributor
 * all read (one evaluator, no back door — INV-09).
 */
export interface SeoMeta {
  title: string;
  description?: string;
  canonical: string;
  robots: RobotsDirective;
  openGraph: OpenGraph;
  twitter: TwitterCard;
  jsonLd: JsonLdObject[];
}

/**
 * Compile-time guard: `PageHeadEntryRef`'s identity fields must remain a
 * subset of the live `PostRecord`. If `PostRecord` renames/removes one of
 * these, this alias fails to typecheck — pinned to the real content record.
 */
export type EntrySnapshotIdentity = Pick<PostRecord, "id" | "workspaceId" | "slug" | "title" | "status">;

// ---------------------------------------------------------------------------
// 3. Sitemap + robots (declarative, cache-backed outputs)
// ---------------------------------------------------------------------------

export type ChangeFreq = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: ChangeFreq;
  /** 0.0–1.0. */
  priority?: number;
}

/** Context handed to the (v1 empty) `seo.sitemap.collect` hook. */
export interface SitemapCollectContext {
  workspaceId: string;
  baseUrl: string;
}

export interface RobotsRule {
  userAgent: string;
  allow?: string[];
  disallow?: string[];
}

/** Computed at `buildRobots()` read time — never persisted as one shape (state.spec.md §5 item 4). */
export interface RobotsPolicy {
  rules: RobotsRule[];
  /** Absolute sitemap URLs advertised in robots.txt (`[]` when `sitemapEnabled` is false). */
  sitemapUrls: string[];
}

// ---------------------------------------------------------------------------
// 4. Site-level settings — resolved from the `site.seo.*` ledger definitions
// ---------------------------------------------------------------------------

/**
 * Registered `site.seo.*` ledger keys (ADR-PIPE-008 Decision §3's mapping
 * table — 8 registered keys backing 7 `SeoSettings` fields, since
 * `defaultRobots` decomposes into 2 booleans; see `settings.ts`'s file header
 * for the disclosed "7 vs 8" tasks.md wording note).
 */
export type SeoSettingKey =
  | "title_template"
  | "default_description"
  | "default_og_image"
  | "twitter_site"
  | "default_robots_noindex"
  | "default_robots_nofollow"
  | "sitemap_enabled"
  | "robots_rules";

/** The resolved, workspace-scoped SEO settings. No `baseUrl` field exists (INV-07). */
export interface SeoSettings {
  /** e.g. `"%s — My Site"`; `%s` is the per-page title. */
  titleTemplate: string;
  defaultDescription?: string;
  defaultOgImage?: string;
  twitterSite?: string;
  defaultRobots: RobotsDirective;
  sitemapEnabled: boolean;
  robotsRules: RobotsRule[];
}

// ---------------------------------------------------------------------------
// 5. Analysis output
// ---------------------------------------------------------------------------

export type SeoIssueSeverity = "error" | "warning" | "info";

export interface SeoIssue {
  code: string;
  severity: SeoIssueSeverity;
  message: string;
  /** Which resolved field the issue is about (e.g. `title`, `description`). */
  field?: keyof SeoMeta & string;
}

export interface SeoAnalysis {
  entryId: string;
  score: number;
  issues: SeoIssue[];
  resolved: SeoMeta;
}
