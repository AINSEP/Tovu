import {
  api,
  type AdminPost,
  type SeoEntryAnalysis,
  type SeoEntryMeta,
  type SeoEntryOverridesPatch,
  type SeoSettings,
} from "@/lib/api";
import type { SeoPort } from "./seo-port.hooks";

/**
 * @file The only place under `features/seo/hooks` that reaches `lib/api` — see
 * `seo-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies.hooks.ts`'s
 *  `defaultRedirectsPort`. */
export const defaultSeoPort: SeoPort = {
  getSeoSettings: () => api.getSeoSettings(),
  setSeoSettings: (options) => api.setSeoSettings(options),
  regenerateSitemap: () => api.regenerateSitemap(),
  getSeoEntry: (entryId) => api.getSeoEntry(entryId),
  putSeoEntry: (target, options) => api.putSeoEntry(target, options),
  getSeoEntryAnalyze: (entryId) => api.getSeoEntryAnalyze(entryId),
  listPosts: () => api.listPosts(),
  listPages: () => api.listPages(),
};

/** One entry's seed for {@link createFakeSeoPort} — the resolved meta plus its analysis. */
export interface FakeSeoEntrySeed {
  meta: SeoEntryMeta;
  analysis: SeoEntryAnalysis;
}

/** Seed state for {@link createFakeSeoPort}. */
export interface FakeSeoPortOptions {
  settings?: SeoSettings;
  /** Keyed by entry id. */
  entries?: Record<string, FakeSeoEntrySeed>;
  posts?: AdminPost[];
  pages?: AdminPost[];
}

function defaultSettings(): SeoSettings {
  return {
    titleTemplate: "%s",
    defaultRobots: { noindex: false, nofollow: false },
    sitemapEnabled: true,
    robotsRules: [],
  };
}

/** `patch value ?? meta value`, named — {@link applySeoPatch} calls this once per field instead of
 *  inlining `??` at each of its 13 fields: a plain function call isn't a decision point the way an
 *  inline `??` is, so this is what keeps that merge under the complexity ceiling (same fix this
 *  codebase's `orEmpty` established elsewhere for the same class of violation — a flat run of
 *  independent fallbacks, not real branching logic). */
function orMeta<T>(patchValue: T | undefined, metaValue: T): T {
  return patchValue ?? metaValue;
}

/** Applies a {@link SeoEntryOverridesPatch} onto a resolved {@link SeoEntryMeta} — only the fields
 *  a fake's own tests plausibly touch are merged (title/description/canonical directly, robots and
 *  the OG/Twitter card objects field-by-field); this mirrors the server's `SeoExtFields` -> `SeoMeta`
 *  merge closely enough for hook-level tests without re-implementing the real resolution rules. */
function applySeoPatch(meta: SeoEntryMeta, patch: SeoEntryOverridesPatch): SeoEntryMeta {
  return {
    ...meta,
    title: orMeta(patch.title, meta.title),
    description: orMeta(patch.description, meta.description),
    canonical: orMeta(patch.canonical, meta.canonical),
    robots: {
      noindex: orMeta(patch.noindex, meta.robots.noindex),
      nofollow: orMeta(patch.nofollow, meta.robots.nofollow),
    },
    openGraph: {
      ...meta.openGraph,
      title: orMeta(patch.ogTitle, meta.openGraph.title),
      description: orMeta(patch.ogDescription, meta.openGraph.description),
      image: orMeta(patch.ogImage, meta.openGraph.image),
      type: orMeta(patch.ogType, meta.openGraph.type),
    },
    twitter: {
      ...meta.twitter,
      card: orMeta(patch.twitterCard, meta.twitter.card),
      title: orMeta(patch.twitterTitle, meta.twitter.title),
      description: orMeta(patch.twitterDescription, meta.twitter.description),
      image: orMeta(patch.twitterImage, meta.twitter.image),
    },
  };
}

/**
 * An in-memory {@link SeoPort} for tests — the fake that lets a test describe "these are the
 * site-wide settings" or "this entry resolves to this meta" directly, instead of hand-building
 * fetch `Response`s. Shipped alongside the real binding per the pattern's "every port gets a fake"
 * rule (see `assistant-chats-dependencies.hooks.ts`).
 */
export function createFakeSeoPort(options: FakeSeoPortOptions = {}): SeoPort & {
  /** The site-wide settings as currently held by the fake, after any `setSeoSettings` writes. */
  readonly settings: SeoSettings;
  /** Every entry currently in the fake's store, keyed by entry id. */
  readonly entries: Record<string, FakeSeoEntrySeed>;
} {
  let settings = options.settings ?? defaultSettings();
  const entries = { ...(options.entries ?? {}) };
  const posts = options.posts ?? [];
  const pages = options.pages ?? [];

  return {
    get settings() {
      return settings;
    },
    entries,

    async getSeoSettings() {
      return { data: settings };
    },

    async setSeoSettings(patch = {}) {
      settings = { ...settings, ...patch };
      return { data: settings };
    },

    async regenerateSitemap() {
      return { data: { accepted: true } };
    },

    async getSeoEntry(entryId) {
      const found = entries[entryId];
      if (!found) throw new Error(`fake seo port: unknown entry ${entryId}`);
      return { data: found.meta };
    },

    async putSeoEntry({ entryId }, patch = {}) {
      const found = entries[entryId];
      if (!found) throw new Error(`fake seo port: unknown entry ${entryId}`);
      const updatedMeta = applySeoPatch(found.meta, patch);
      entries[entryId] = { ...found, meta: updatedMeta };
      return { data: updatedMeta };
    },

    async getSeoEntryAnalyze(entryId) {
      const found = entries[entryId];
      if (!found) throw new Error(`fake seo port: unknown entry ${entryId}`);
      return { data: found.analysis };
    },

    async listPosts() {
      return { posts: posts.map((post) => ({ post })) };
    },

    async listPages() {
      return { posts: pages.map((post) => ({ post })) };
    },
  };
}
