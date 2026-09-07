import {
  api,
  type AdminPost,
  type SeoEntryAnalysis,
  type SeoEntryMeta,
  type SeoEntryOverridesPatch,
  type SeoSettings,
  type SeoSettingsPatch,
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
 *  independent fallbacks, not real branching logic).
 *
 *  `null` (the patch's CLEAR sentinel) falls through to the meta value by the same `??`, which is
 *  the right model for this fake: the server drops the override and re-resolves, and the seeded
 *  `meta` is the closest thing this fake has to that resolved value. It is only an approximation —
 *  a test that needs to prove a clear actually reached the wire must assert on the PUT body, not on
 *  what comes back. */
function orMeta<T>(patchValue: T | null | undefined, metaValue: T): T {
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

/** One of the three site-wide scalars the server registers as `nullable: true` (`SEO_DEFINITIONS`,
 *  `apps/website/src/features/seo/settings.ts`), under the real write's own rule: an omitted key
 *  (`undefined`) keeps the current value, `null` clears it, and a string overwrites. */
function settingOrCleared(patchValue: string | null | undefined, currentValue: string | undefined): string | undefined {
  if (patchValue === undefined) return currentValue;
  return patchValue ?? undefined;
}

/** Applies a {@link SeoSettingsPatch} the way the real `setSeoSettings` does: an omitted key leaves
 *  the current value alone (it is a MERGE — `buildScalarWrites` skips every `undefined`), and a
 *  `null` on one of the three nullable scalars clears it back to absent, which `getSeoSettings`
 *  reads back as `undefined` (via its `undefinedIfEmpty`). Naming those three explicitly rather
 *  than spreading the patch verbatim is what stops a `null` from surviving into a `SeoSettings`
 *  the fake hands back — no real response can contain one.
 *
 *  @complexity O(1) — three fixed field reads, no iteration. */
function applySettingsPatch(current: SeoSettings, patch: SeoSettingsPatch): SeoSettings {
  const { defaultDescription, defaultOgImage, twitterSite, ...rest } = patch;
  return {
    ...current,
    ...rest,
    defaultDescription: settingOrCleared(defaultDescription, current.defaultDescription),
    defaultOgImage: settingOrCleared(defaultOgImage, current.defaultOgImage),
    twitterSite: settingOrCleared(twitterSite, current.twitterSite),
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
      settings = applySettingsPatch(settings, patch);
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
