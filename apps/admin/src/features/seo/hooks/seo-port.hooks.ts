import type {
  AdminPost,
  SeoEntryAnalysis,
  SeoEntryMeta,
  SeoEntryOverridesPatch,
  SeoSettings,
  SeoSettingsPatch,
} from "@/lib/api";

/**
 * @file What `useSeo`, `useSeoEntryPanel`, and `useEntryPicker` need from the outside world, as an
 * interface rather than a direct `lib/api` import.
 *
 * Follows the `useX(dependencies)` / `useWiredX()` pair documented on `assistant-chats-port.hooks.ts`
 * (the canonical reference in this workspace) and already applied to `features/redirects` and
 * `features/pages`: this file declares, `seo-dependencies.hooks.ts` binds the real `api` client,
 * and nothing else under `features/seo/hooks` imports `lib/api`.
 *
 * One shared port for all three hooks rather than three narrow ones — the same "genuinely
 * matches" case `redirects-port.hooks.ts` names for its own three hooks: all three read/write the
 * SAME SEO surface (site-wide settings, one entry's overrides + analysis, the post/page picker
 * feeding that entry), each calling a disjoint subset of the eight methods below, exactly the
 * shape `RedirectsPort` already established for this codebase.
 */
export interface SeoPort {
  getSeoSettings(): Promise<{ data: SeoSettings }>;
  /** `SeoSettingsPatch`, not `Partial<SeoSettings>`: the three optional scalars take `null` to
   *  CLEAR the site default, which `Partial<SeoSettings>` cannot express (see `lib/api.ts`). */
  setSeoSettings(options?: SeoSettingsPatch): Promise<{ data: SeoSettings }>;
  regenerateSitemap(): Promise<{ data: { accepted: true } }>;
  getSeoEntry(entryId: string): Promise<{ data: SeoEntryMeta }>;
  putSeoEntry(target: { entryId: string }, options?: SeoEntryOverridesPatch): Promise<{ data: SeoEntryMeta }>;
  getSeoEntryAnalyze(entryId: string): Promise<{ data: SeoEntryAnalysis }>;
  listPosts(): Promise<{ posts: Array<{ post: AdminPost }> }>;
  listPages(): Promise<{ posts: Array<{ post: AdminPost }> }>;
}
