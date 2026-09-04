import type { UUID } from "@jini-ai/cms/core";
import { resolvePostMemberAccess } from "../members/index.js";
import type { PostRepoPort } from "../post/index.js";
import type { SettingsRepoPort } from "../settings/index.js";
import type { OriginRegistryPort } from "../origin/index.js";
import { resolveWorkspaceOrigin, toAbsoluteUrl } from "./absolute-url.js";
import type { ResolveSeoImageRefDeps } from "./media.js";
import { getEntryMeta } from "./seo.js";
import { getSeoSettings } from "./settings.js";
import type { RobotsPolicy, SitemapEntry } from "./types.js";
import type { SeoEventSubscriptions, SitemapCollectHook } from "./ports.js";

/**
 * @file `buildSitemap`/`buildRobots`/`regenerateSitemapCache`/
 * `invalidateSitemapCache` (ADR-PIPE-008 Decision §5/§7, C-008..C-011) — a
 * cache-backed sitemap/robots build over an in-module `Map<string,string>`
 * (no new `CachePort` — none exists in this codebase and none is warranted
 * for a single workspace-keyed value, ADR-006). Never leaks non-published or
 * `noindex` entries (INV-04/05). The empty `seo.sitemap.collect` registry
 * (OQ-01) ships live-but-empty — a real seam, zero real registrants in v1.
 */

/** INV-08 — always this shape; the only file that constructs the cache key. */
function cacheKey(workspaceId: UUID): string {
  return `ws:${workspaceId}:seo:sitemap`;
}

/** Cached value is the `JSON.stringify`d `SitemapEntry[]` for that workspace. */
const sitemapCache = new Map<string, string>();

// ---------------------------------------------------------------------------
// `seo.sitemap.collect` (OQ-01) — a real, empty, in-module ordered registry.
// ---------------------------------------------------------------------------

let sitemapCollectHooks: SitemapCollectHook[] = [];

/** Registers a `seo.sitemap.collect` contributor. Live-but-empty in v1 (OQ-01) — no real registrant ships with this feature. */
export function registerSitemapCollectHook(hook: SitemapCollectHook): void {
  sitemapCollectHooks.push(hook);
}

/** Test-only reset of the module-level registry. */
export function resetSitemapCollectHooksForTests(): void {
  sitemapCollectHooks = [];
}

export interface SeoSitemapDeps {
  postRepo: PostRepoPort;
  settingsRepo: SettingsRepoPort;
  media: ResolveSeoImageRefDeps;
  originRegistry: OriginRegistryPort;
}

/**
 * Whether an anonymous, unauthenticated crawler could actually read this post — the sitemap's own
 * visibility bar. `sitemap.xml` has no per-visitor concept at all (it is a single cache-backed
 * document served identically to every requester, ADR-PIPE-008 Decision §5/§7 above), so "would
 * THIS caller be let in" collapses to the one case that matters here: would ANY anonymous caller.
 * `resolvePostMemberAccess(json).visibility === "public"` is exactly that: every other visibility
 * (`members`/`paid`/`tiers`, and the fail-closed `unknown_visibility` default for malformed JSON)
 * denies an unauthenticated `MemberContext` in `access-resolver.ts`'s own `decide()` — this is the
 * same decision restated without needing that resolver's session/subscription/tier repo ports,
 * which this cache-backed, session-blind build path has no reason to carry.
 *
 * @complexity O(1) — `resolvePostMemberAccess` is one `JSON.parse` of a small, editorial string.
 */
function isPubliclyVisible(post: { memberAccessJson?: string | null }): boolean {
  return resolvePostMemberAccess(post.memberAccessJson).visibility === "public";
}

async function computeSitemapEntries(deps: SeoSitemapDeps, workspaceId: UUID): Promise<SitemapEntry[]> {
  const posts = [...(await deps.postRepo.list({ workspaceId }))].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const entries: SitemapEntry[] = [];
  for (const post of posts) {
    if (post.status !== "published") continue;
    // ADR-030 §4 (2026-09-03 sweep): a members/paid/tiers-gated post must not advertise its
    // canonical URL or existence to crawlers here, the same way it was already excluded from the
    // ungated home-page listing (`pages.ts`'s `filterVisiblePosts`).
    if (!isPubliclyVisible(post)) continue;
    const meta = await getEntryMeta(deps, { workspaceId, entryId: post.id });
    if (meta.robots.noindex) continue;
    // `meta.canonical` is absolute when the workspace has a verified origin (2026-09-03 fix,
    // `getEntryMeta`'s own `resolveCanonical`) — sitemap `loc` entries are required to be absolute
    // by the sitemap protocol, same requirement `og:url` has. Falls back to the bare relative path
    // for the same disclosed no-origin degradation `getEntryMeta` documents; unchanged from before
    // this fix for a workspace with no verified origin yet.
    entries.push({ loc: meta.canonical, lastmod: post.updatedAt });
  }

  for (const hook of [...sitemapCollectHooks].sort((a, b) => a.priority - b.priority)) {
    const collected = await hook.handle({ workspaceId, baseUrl: "" });
    entries.push(...collected);
  }

  return entries;
}

/**
 * REQ-08/10 — cache-checked build of `SitemapEntry[]`. Never `null`; `[]`
 * when empty (EC-04). Never includes a non-published or effective-`noindex`
 * entry (INV-04/05).
 */
export async function buildSitemap(deps: SeoSitemapDeps, input: { workspaceId: UUID }): Promise<SitemapEntry[]> {
  const key = cacheKey(input.workspaceId);
  const cached = sitemapCache.get(key);
  if (cached !== undefined) return JSON.parse(cached) as SitemapEntry[];

  const entries = await computeSitemapEntries(deps, input.workspaceId);
  sitemapCache.set(key, JSON.stringify(entries));
  return entries;
}

/**
 * REQ-09 — composes `RobotsPolicy` from `SeoSettings.robotsRules` +
 * computed `sitemapUrls` (never persisted as one shape — computed fresh at
 * read time). `sitemapUrls` is `[]` when `sitemapEnabled` is `false`.
 *
 * 2026-09-04 fix: the advertised sitemap URL is joined onto the workspace's
 * verified origin ({@link toAbsoluteUrl}, via {@link resolveWorkspaceOrigin}),
 * the same wiring `getEntryMeta`'s `canonical`/`og:url` already use (the
 * `ADR-040` origin-resolution source this doc used to say didn't exist yet —
 * `features/origin`'s `OriginRegistryPort` — landed on 2026-09-03). Google
 * ignores a relative `Sitemap:` directive, so a bare `/sitemap.xml` made the
 * sitemap undiscoverable to crawlers even though `<loc>` entries inside it
 * were already absolute. Degrades to the same bare relative path as before
 * when no verified origin is registered yet — SEO still never fabricates a
 * local origin (INV-07), consistent with `getEntryMeta`'s own fallback.
 */
export async function buildRobots(
  deps: { settingsRepo: SettingsRepoPort; originRegistry: OriginRegistryPort },
  input: { workspaceId: UUID }
): Promise<RobotsPolicy> {
  const settings = await getSeoSettings({ settingsRepo: deps.settingsRepo }, { workspaceId: input.workspaceId });
  const origin = await resolveWorkspaceOrigin(deps.originRegistry, input.workspaceId);
  return {
    rules: settings.robotsRules,
    sitemapUrls: settings.sitemapEnabled ? [toAbsoluteUrl(origin, "/sitemap.xml")] : [],
  };
}

/** REQ-13 — force-rebuilds the cache entry now, bypassing the cache-hit path. */
export async function regenerateSitemapCache(deps: SeoSitemapDeps, input: { workspaceId: UUID }): Promise<void> {
  const entries = await computeSitemapEntries(deps, input.workspaceId);
  sitemapCache.set(cacheKey(input.workspaceId), JSON.stringify(entries));
}

/** REQ-10/INV-08 — clears the workspace's cache entry. Idempotent: a repeat call on an already-clear key is a no-op. */
export function invalidateSitemapCache(input: { workspaceId: UUID }): void {
  sitemapCache.delete(cacheKey(input.workspaceId));
}

/**
 * REQ-10 — the 3 outbox-event subscription handlers (idempotent per
 * ADR-009): any `entry.published`/`entry.updated`/`entry.unpublished`
 * delivery invalidates that workspace's sitemap cache entry. Wired to
 * `bus.subscribe` at `server/app.ts` boot (T038).
 */
export function createSeoEventSubscriptions(): SeoEventSubscriptions {
  const handler = async (event: { payload: { entryId: UUID; contentType: string }; workspaceId: UUID }) => {
    invalidateSitemapCache({ workspaceId: event.workspaceId });
  };
  return { onEntryPublished: handler, onEntryUpdated: handler, onEntryUnpublished: handler };
}
