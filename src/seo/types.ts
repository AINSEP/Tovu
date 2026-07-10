/**
 * @file SEO core type definitions (ADR-032, design-only draft).
 *
 * Types ONLY — no feature logic. These are the domain shapes the SEO dogfood
 * plugin (`plugins/seo`, §3.5 tier-3 bundled module) introduces. They are written
 * to compile against the live repo types (`../core/ports`, `../features/post/post`,
 * `../features/theme/theme`) so the design is grounded, not sketched.
 *
 * Load-bearing ADR ties:
 * - ADR-022 §2/§3: per-entry meta lives in the namespaced JSON ext bag
 *   `fields.ext.seo.*` (validated on write), NOT in new tables; the one queryable
 *   field (`noindex`) rides a core-provisioned partial expression index.
 * - ADR-020 §2: head output is the canonical *render IR* (serializable
 *   descriptors), never raw HTML strings — the largest injection surface.
 * - ADR-024 §3: every payload crossing the SEO plugin boundary is
 *   structured-clone-serializable; no live core objects (e.g. no live PostRecord).
 * - ADR-028: site-level SEO config are `seo.*` setting definitions in the
 *   Layered Settings Ledger, resolved workspace-scoped.
 */
import type { ISODateTime, JsonObject, UUID } from "../core/ports";
import type { PostRecord } from "../features/post/post";
import type { ThemeTier } from "../features/theme/theme";

// ---------------------------------------------------------------------------
// 1. Stored per-entry meta — the validated `fields.ext.seo.*` bag (ADR-022 §2)
// ---------------------------------------------------------------------------

/** Twitter card kind (Twitter/X card meta). */
export type TwitterCardKind = "summary" | "summary_large_image";

/** OpenGraph object type (v1 subset; extends via the registry, not code). */
export type OpenGraphType = "website" | "article" | "profile";

/**
 * The author-authored override bag persisted at `entries.fields.ext.seo.*`.
 * Every field is OPTIONAL — absence means "derive from the entry + site
 * defaults". Unregistered keys are rejected at the ADR-022 write chokepoint;
 * this interface is the registered, validated shape.
 *
 * `ogImage`/`twitterImage` hold a media *ref* (`{assetId, transformName}`
 * serialized as a string `"{assetId}:{transformName}"`) or an absolute URL —
 * never a frozen `/m/` URL (ADR-027 §4: internal content stores refs, not URLs).
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

/**
 * Content-type registry declaration (data, ADR-022 §1/§2) for one SEO field.
 * The plugin ships these as declarative field registrations on every content
 * type — the Tier-1-safe half of the design (installable-from-anyone-shaped).
 */
export interface SeoFieldDecl {
  /** Short key; stored at `fields.ext.seo.{key}`. */
  readonly key: keyof SeoExtFields & string;
  readonly type: "text" | "boolean" | "url" | "enum";
  /** Declares a core-provisioned expression index (ADR-022 §3). Only `noindex`. */
  readonly queryable?: boolean;
  readonly enumValues?: readonly string[];
}

/**
 * A core-provisioned partial expression index request (ADR-022 §3) — the sitemap
 * query filters published, non-`noindex` entries per type, so `noindex` is the
 * one SEO field that gets an index. Emitted as `CREATE INDEX` by core, never DDL
 * authored by the plugin (ADR-003).
 *
 * Shape mirrors ADR-022 §3:
 *   CREATE INDEX q_{contentType}_seo_{field}
 *     ON entries(CAST(json_extract(fields,'$.ext.seo.{field}') AS {sqlType}), id)
 *     WHERE type='{contentType}'
 */
export interface SeoExpressionIndexDecl {
  readonly contentType: string;
  readonly ns: "seo";
  readonly field: keyof SeoExtFields & string;
  readonly sqlType: "TEXT" | "INTEGER" | "REAL";
}

// ---------------------------------------------------------------------------
// 2. Resolved per-entry meta — what the render + AI tool actually consume
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

/** JSON-LD is a plain JSON object graph (schema.org). Serializable (ADR-024 §3). */
export type JsonLd = JsonObject;

/**
 * The fully-resolved effective meta for one page: author overrides layered over
 * site defaults layered over derived-from-entry. This is the single source the
 * head renderer + the `analyze_seo` AI tool + the admin panel all read (one
 * handler, no back door — §3.5 dogfood rule / ADR-027 INV-6).
 */
export interface SeoMeta {
  title: string;
  description?: string;
  canonical: string;
  robots: RobotsDirective;
  openGraph: OpenGraph;
  twitter: TwitterCard;
  jsonLd: JsonLd[];
}

// ---------------------------------------------------------------------------
// 3. Head render IR (ADR-020 §2) — serializable descriptors, never raw HTML
// ---------------------------------------------------------------------------

/**
 * One `<head>` contribution as a canonical render-IR node. Core serializes +
 * sanitizes these into the theme's `<head>` seam (`{% head %}`), so a plugin can
 * never inject arbitrary markup (ADR-020 §2/§6). Deduped by `HeadElementKey`.
 */
export type HeadElement =
  | { readonly kind: "title"; readonly text: string }
  | { readonly kind: "meta"; readonly name: string; readonly content: string }
  | { readonly kind: "og"; readonly property: string; readonly content: string }
  | { readonly kind: "link"; readonly rel: string; readonly href: string; readonly hreflang?: string }
  | { readonly kind: "jsonld"; readonly data: JsonLd };

/** Stable dedup key for a HeadElement (last-writer-wins by priority). */
export type HeadElementKey = string;

// ---------------------------------------------------------------------------
// 4. page.head hook context — serializable page snapshot (ADR-024 §3)
// ---------------------------------------------------------------------------

/**
 * A serializable snapshot of the entry being rendered. NOT a live `PostRecord`:
 * the ABI forbids live core objects crossing the plugin surface (ADR-024 §3).
 * Core extracts this at the render seam and hands it to the hook by value.
 */
export interface PageHeadEntryRef {
  id: UUID;
  type: string;
  slug: string;
  title: string;
  status: string;
  publishedAt?: ISODateTime;
  updatedAt: ISODateTime;
  /** The already-extracted, validated seo ext bag (serialized, not live). */
  ext: SeoExtFields;
  /** Plain-text excerpt derived from `bodyJson` by core (for auto-descriptions). */
  excerpt?: string;
}

/**
 * Compile-time guard: the snapshot's identity fields must remain a subset of the
 * live `PostRecord`. If `PostRecord` renames/removes one of these, this alias
 * fails to typecheck — the design is pinned to the real content record, not a
 * copy that can silently drift (ADR-007 workspace-scoped identity included).
 */
export type EntrySnapshotIdentity = Pick<
  PostRecord,
  "id" | "workspaceId" | "slug" | "title" | "status"
>;

/**
 * Everything the `page.head` filter hook needs, by value. `route`/`contentType`
 * let a contributor tailor output (home vs entry vs archive); `canonicalUrl` is
 * pre-resolved by the routing lib (ADR-009 §1 typed call) so the plugin never
 * reimplements permalink logic.
 */
export interface PageHeadContext {
  workspaceId: UUID;
  route: string;
  contentType?: string;
  entry?: PageHeadEntryRef;
  canonicalUrl: string;
  siteTitle: string;
  locale?: string;
  /** The active theme tier — head serialization stays IR-canonical across tiers. */
  themeTier?: ThemeTier;
}

// ---------------------------------------------------------------------------
// 5. Sitemap + robots (ADR-024 §1 core-mediated declarative outputs)
// ---------------------------------------------------------------------------

export type ChangeFreq =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export interface SitemapEntry {
  loc: string;
  lastmod?: ISODateTime;
  changefreq?: ChangeFreq;
  /** 0.0–1.0 (schema-validated on write). */
  priority?: number;
}

/** Context handed to the `seo.sitemap.collect` filter hook (serializable). */
export interface SitemapCollectContext {
  workspaceId: UUID;
  baseUrl: string;
}

export interface RobotsRule {
  userAgent: string;
  allow?: string[];
  disallow?: string[];
}

export interface RobotsPolicy {
  rules: RobotsRule[];
  /** Absolute sitemap URLs advertised in robots.txt. */
  sitemapUrls: string[];
}

// ---------------------------------------------------------------------------
// 6. Site-level settings — resolved from the ADR-028 ledger (`seo.*` defs)
// ---------------------------------------------------------------------------

/** Flat `seo.*` setting ids registered as ADR-028 `setting_definitions`. */
export type SeoSettingKey =
  | "seo.base_url"
  | "seo.title_template"
  | "seo.default_description"
  | "seo.default_og_image"
  | "seo.twitter_site"
  | "seo.default_robots"
  | "seo.sitemap_enabled"
  | "seo.robots_policy";

/** The resolved, workspace-scoped SEO settings (ADR-028 resolver output). */
export interface SeoSettings {
  /** Canonical origin, e.g. `https://example.com` (no trailing slash). */
  baseUrl: string;
  /** e.g. `"%s — My Site"`; `%s` is the per-page title. */
  titleTemplate: string;
  defaultDescription?: string;
  defaultOgImage?: string;
  twitterSite?: string;
  defaultRobots: RobotsDirective;
  sitemapEnabled: boolean;
  robotsPolicy: RobotsPolicy;
}

// ---------------------------------------------------------------------------
// 7. Permissions (ADR-021 flat strings) + AI analysis output
// ---------------------------------------------------------------------------

/** Flat `seo.*` permission strings, code-side catalog (ADR-021 §3). */
export type SeoPermission =
  | "seo.read"
  | "seo.meta.write"
  | "seo.settings.manage"
  | "seo.sitemap.manage"
  | "seo.analyze";

export type SeoIssueSeverity = "error" | "warning" | "info";

export interface SeoIssue {
  code: string;
  severity: SeoIssueSeverity;
  message: string;
  /** Which resolved field the issue is about (e.g. `title`, `description`). */
  field?: keyof SeoMeta & string;
}

/** Output of the `analyze_seo` AI tool (ADR-014 registry entry; Phase-5 exposure). */
export interface SeoAnalysis {
  entryId: UUID;
  score: number;
  issues: SeoIssue[];
  resolved: SeoMeta;
}
