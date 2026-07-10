/**
 * @file SEO contract interfaces (ADR-032, design-only draft). Interfaces ONLY.
 *
 * ADR-006 note (rule-of-two): the SEO design introduces **no new infrastructure
 * port**. Every extension point is a HOOK (ADR-009 §3, extension mechanism) and
 * every read is a typed call to an existing core lib (content query, routing,
 * settings, cache) — none has a second plausible adapter being built now, so
 * elevating any to a swappable port would violate ADR-006 (the same discipline
 * ADR-021 applied to reject a PolicyPort). The interfaces below are therefore
 * (a) hook handler contracts, (b) the capability *handles* core lends the plugin
 * (by handle, not by reference — ADR-024 §3), and (c) the plugin's own public
 * read surface. All payloads are structured-clone-serializable (ADR-024 §3).
 */
import type { DomainEvent, UUID } from "../core/ports";
import type {
  HeadElement,
  PageHeadContext,
  PageHeadEntryRef,
  RobotsPolicy,
  SeoAnalysis,
  SeoMeta,
  SeoSettings,
  SitemapCollectContext,
  SitemapEntry,
} from "./types";

// ---------------------------------------------------------------------------
// 1. Hook handler contract (ADR-009 §3 + ADR-024 §7)
// ---------------------------------------------------------------------------

/**
 * A hook handler: **async-only**, serializable in/out, with an **explicit
 * priority** and no reliance on registration order (ADR-024 §3/§7). Core sorts
 * by `priority` (ascending), awaits each handler, then folds the results.
 */
export interface HookHandler<TInput, TOutput> {
  readonly priority: number;
  handle(input: TInput): Promise<TOutput>;
}

/**
 * `page.head` — the render hook. Given a serializable page snapshot, a
 * contributor returns render-IR head descriptors (ADR-020 §2). Core orders,
 * dedups (by HeadElementKey), sanitizes, and injects at the theme `<head>` seam.
 * The SEO plugin is one contributor; core and other bundled plugins may add more.
 */
export type PageHeadHook = HookHandler<PageHeadContext, HeadElement[]>;

/**
 * `seo.sitemap.collect` — lets other bundled plugins/core contribute URL sets to
 * the sitemap (e.g. taxonomy term pages, a future products plugin) without SEO
 * knowing their routes. A filter hook, not a port (no second adapter today).
 */
export type SitemapCollectHook = HookHandler<SitemapCollectContext, SitemapEntry[]>;

// ---------------------------------------------------------------------------
// 2. Capability handles core lends the plugin (ADR-024 §3 — caps by handle)
// ---------------------------------------------------------------------------

/**
 * Read access to content for sitemap enumeration + head rendering. Keyset
 * pagination over the ADR-022 partial expression index (published, non-noindex,
 * per type). Returns serializable snapshots, never live `PostRecord`s.
 */
export interface SeoContentReadCap {
  /** One keyset page of sitemap-eligible entries for a content type. */
  listSitemapEntries(input: {
    workspaceId: UUID;
    contentType: string;
    afterId?: UUID;
    limit: number;
  }): Promise<PageHeadEntryRef[]>;
  /** Fetch one entry snapshot (admin panel + AI tool + head render). */
  getEntryRef(input: { workspaceId: UUID; id: UUID }): Promise<PageHeadEntryRef | null>;
}

/**
 * Canonical/absolute URL resolution, owned by the routing lib (ADR-009 §1 typed
 * call, exposed to the plugin as a handle). SEO never reimplements permalinks.
 */
export interface SeoUrlCap {
  resolveCanonical(input: {
    workspaceId: UUID;
    contentType: string;
    slug: string;
  }): Promise<string>;
}

/** Resolve the workspace's `seo.*` settings from the ADR-028 ledger. */
export interface SeoSettingsCap {
  resolve(input: { workspaceId: UUID }): Promise<SeoSettings>;
}

/**
 * Cache handle (backed by the core `CachePort`), keyed `ws:{id}:seo:*`
 * (ADR-007 workspace-prefixed). Used to memoize the generated sitemap; entry
 * events invalidate it (see `SeoEventSubscriptions`).
 */
export interface SeoCacheCap {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  invalidate(key: string): Promise<void>;
}

/** The full set of handles the SEO plugin is granted at construction. */
export interface SeoPluginCaps {
  content: SeoContentReadCap;
  url: SeoUrlCap;
  settings: SeoSettingsCap;
  cache: SeoCacheCap;
}

// ---------------------------------------------------------------------------
// 3. The plugin's public read surface (one handler; admin + AI + render share it)
// ---------------------------------------------------------------------------

/**
 * The single SEO service contract. The admin panel, the public `<head>` render,
 * `sitemap.xml`/`robots.txt` route handlers, and the `analyze_seo` AI tool are
 * ALL clients of this one surface — no back door (§3.5 dogfood rule / ADR-027
 * INV-6). Not an ADR-006 port; it is the plugin's exported contract.
 */
export interface SeoQueryPort {
  /** Resolve effective meta for one entry (overrides ▸ site defaults ▸ derived). */
  getEntryMeta(input: { workspaceId: UUID; entryId: UUID }): Promise<SeoMeta>;
  /** The `page.head` fold result for a page (used by the render seam + preview). */
  renderHead(input: PageHeadContext): Promise<HeadElement[]>;
  /** Build the full sitemap URL set (cache-backed). */
  buildSitemap(input: { workspaceId: UUID }): Promise<SitemapEntry[]>;
  /** Build the effective robots policy (settings + advertised sitemap URLs). */
  buildRobots(input: { workspaceId: UUID }): Promise<RobotsPolicy>;
  /** Run SEO analysis for the `analyze_seo` AI tool / admin lint. */
  analyzeEntry(input: { workspaceId: UUID; entryId: UUID }): Promise<SeoAnalysis>;
}

// ---------------------------------------------------------------------------
// 4. Async side-effect subscriptions (ADR-009 §2 outbox events; idempotent)
// ---------------------------------------------------------------------------

/**
 * Outbox event handlers the plugin registers. Sole v1 job: invalidate the cached
 * sitemap when content changes. Handlers must be idempotent (outbox retries,
 * ADR-009 consequence). Search-engine ping / IndexNow is a DEFERRED core-mediated
 * webhook seam (ADR-024 §1), not wired here.
 */
export interface SeoEventSubscriptions {
  onEntryPublished(event: DomainEvent<{ entryId: UUID; contentType: string }>): Promise<void>;
  onEntryUpdated(event: DomainEvent<{ entryId: UUID; contentType: string }>): Promise<void>;
  onEntryUnpublished(event: DomainEvent<{ entryId: UUID; contentType: string }>): Promise<void>;
}
